-- CM502 — fix: concurrent identical idempotency-key requests.
--
-- Found during live Phase 3B concurrency testing: two requests firing the
-- true-concurrent SAME idempotency_key both pass the upfront "does this
-- key already exist?" check (neither has committed yet), so both proceed
-- to build a customer/address/order. The unique index on
-- orders.idempotency_key (0004) correctly stops the second INSERT from
-- creating a duplicate order — that part already worked, and no orphaned
-- customer/address rows were left behind (the loser's whole insert
-- sequence rolled back). But the loser's request surfaced as a raw
-- unique_violation (502 ORDER_CREATION_FAILED) instead of resolving to
-- the same order, which fails the "both calls resolve to the same order"
-- requirement.
--
-- Fix: wrap the write sequence in an exception-handled sub-block. On
-- unique_violation, look up the order the winning transaction just
-- committed by idempotency_key and return it as a replay — exactly like
-- the upfront check, just reached via the race path instead of the fast
-- path. Any other unique_violation (not idempotency-key-shaped) still
-- re-raises as a real error.

create or replace function create_order_with_reservation(
  p_idempotency_key text,
  p_items jsonb,
  p_customer jsonb,
  p_address jsonb,
  p_shipping_method_id uuid,
  p_reservation_ttl_minutes integer default 15
)
returns jsonb
language plpgsql
as $$
declare
  v_existing_order record;
  v_customer_id uuid;
  v_address_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_tracking_token text;
  v_reservation_expires_at timestamptz;
  v_shipping_price integer;
  v_shipping_active boolean;
  v_subtotal integer := 0;
  v_total integer;
  v_line record;
  v_variant record;
  v_available integer;
  v_unit_price integer;
  v_line_total integer;
  v_ttl integer := greatest(coalesce(p_reservation_ttl_minutes, 15), 1);
  v_has_idempotency_key boolean := p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0;
begin
  -- ── Idempotency replay (fast path: key already committed) ───────────
  if v_has_idempotency_key then
    select o.id, o.order_number, o.tracking_token, o.total_satang, o.reservation_expires_at
      into v_existing_order
    from orders o
    where o.idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'order_number', v_existing_order.order_number,
        'tracking_token', v_existing_order.tracking_token,
        'total_satang', v_existing_order.total_satang,
        'reservation_expires_at', v_existing_order.reservation_expires_at,
        'idempotent_replay', true
      );
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty' using errcode = 'CM001';
  end if;

  -- ── Shipping method ──────────────────────────────────────────────────
  select sm.price_satang, sm.is_active into v_shipping_price, v_shipping_active
  from shipping_methods sm
  where sm.id = p_shipping_method_id;

  if v_shipping_price is null then
    raise exception 'Shipping method not found' using errcode = 'CM002';
  end if;
  if not v_shipping_active then
    raise exception 'Shipping method is no longer available' using errcode = 'CM002';
  end if;

  -- ── Write sequence, exception-handled for the concurrent-same-key race
  -- (fast path above misses it when two requests overlap before either
  -- commits) ───────────────────────────────────────────────────────────
  begin
    insert into customers (full_name, phone, line_id, email)
    values (
      p_customer->>'full_name',
      p_customer->>'phone',
      nullif(p_customer->>'line_id', ''),
      nullif(p_customer->>'email', '')
    )
    returning id into v_customer_id;

    insert into addresses (customer_id, address_line, subdistrict, district, province, postal_code)
    values (
      v_customer_id,
      p_address->>'address_line',
      p_address->>'subdistrict',
      p_address->>'district',
      p_address->>'province',
      p_address->>'postal_code'
    )
    returning id into v_address_id;

    v_reservation_expires_at := now() + (v_ttl || ' minutes')::interval;

    insert into orders (
      customer_id, shipping_address_id, shipping_method_id,
      subtotal_satang, shipping_fee_satang, total_satang,
      reservation_expires_at, idempotency_key
    )
    values (
      v_customer_id, v_address_id, p_shipping_method_id,
      0, v_shipping_price, v_shipping_price,
      v_reservation_expires_at, nullif(trim(coalesce(p_idempotency_key, '')), '')
    )
    returning id, order_number, tracking_token into v_order_id, v_order_number, v_tracking_token;

    for v_line in
      select variant_id, sum(quantity)::integer as quantity
      from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity integer)
      group by variant_id
      order by variant_id
    loop
      if v_line.variant_id is null then
        raise exception 'Invalid item in cart' using errcode = 'CM003';
      end if;
      if v_line.quantity is null or v_line.quantity <= 0 then
        raise exception 'Invalid quantity' using errcode = 'CM003';
      end if;

      select
        pv.id, pv.stock_qty, pv.is_active as variant_active,
        pv.price_satang_override, pv.sku,
        p.is_active as product_active, p.base_price_satang, p.name as product_name,
        c.name as color_name, s.name as size_name
      into v_variant
      from product_variants pv
      join products p on p.id = pv.product_id
      join colors c on c.id = pv.color_id
      join sizes s on s.id = pv.size_id
      where pv.id = v_line.variant_id
      for update of pv;

      if not found then
        raise exception 'One of the items in your cart no longer exists' using errcode = 'CM004';
      end if;
      if not v_variant.variant_active or not v_variant.product_active then
        raise exception '%: this item is no longer available', v_variant.sku using errcode = 'CM004';
      end if;

      select v_variant.stock_qty - coalesce(sum(r.quantity), 0) into v_available
      from inventory_reservations r
      where r.variant_id = v_variant.id
        and (r.status = 'converted' or (r.status = 'active' and r.expires_at > now()));

      if v_available is null then
        v_available := v_variant.stock_qty;
      end if;

      if v_available < v_line.quantity then
        raise exception '%: only % left in stock', v_variant.sku, greatest(v_available, 0)
          using errcode = 'CM005';
      end if;

      v_unit_price := coalesce(v_variant.price_satang_override, v_variant.base_price_satang);
      v_line_total := v_unit_price * v_line.quantity;
      v_subtotal := v_subtotal + v_line_total;

      insert into order_items (
        order_id, variant_id, product_name_snapshot, color_name_snapshot,
        size_name_snapshot, sku_snapshot, unit_price_satang, quantity, line_total_satang
      )
      values (
        v_order_id, v_variant.id, v_variant.product_name, v_variant.color_name,
        v_variant.size_name, v_variant.sku, v_unit_price, v_line.quantity, v_line_total
      );

      insert into inventory_reservations (order_id, variant_id, quantity, status, expires_at)
      values (v_order_id, v_variant.id, v_line.quantity, 'active', v_reservation_expires_at);
    end loop;

    v_total := v_subtotal + v_shipping_price;

    update orders
    set subtotal_satang = v_subtotal, total_satang = v_total
    where id = v_order_id;

    insert into payments (order_id, expected_amount_satang, payment_status)
    values (v_order_id, v_total, 'awaiting_payment');

  exception
    when unique_violation then
      -- Only treat this as a benign replay if it's shaped like our
      -- idempotency-key race — otherwise it's a real problem and must
      -- surface as one.
      if v_has_idempotency_key then
        select o.order_number, o.tracking_token, o.total_satang, o.reservation_expires_at
          into v_existing_order
        from orders o
        where o.idempotency_key = p_idempotency_key;

        if found then
          return jsonb_build_object(
            'order_number', v_existing_order.order_number,
            'tracking_token', v_existing_order.tracking_token,
            'total_satang', v_existing_order.total_satang,
            'reservation_expires_at', v_existing_order.reservation_expires_at,
            'idempotent_replay', true
          );
        end if;
      end if;
      raise;
  end;

  return jsonb_build_object(
    'order_number', v_order_number,
    'tracking_token', v_tracking_token,
    'total_satang', v_total,
    'reservation_expires_at', v_reservation_expires_at,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function create_order_with_reservation(text, jsonb, jsonb, jsonb, uuid, integer) from public;
grant execute on function create_order_with_reservation(text, jsonb, jsonb, jsonb, uuid, integer) to service_role;
