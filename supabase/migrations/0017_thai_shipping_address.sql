-- CM502 — structured Thai shipping-address upgrade
--
-- The existing addresses table already carries address_line, subdistrict,
-- district, province, postal_code (0001_init.sql) — those are reused
-- as-is; the checkout form now fills them from a validated
-- Province → District → Subdistrict → Postal-code selector instead of
-- free text, but the storage shape doesn't change.
--
-- Two genuinely new, optional pieces of information the upgraded form
-- collects that the schema has no home for yet:
--   - soi_road:      ซอย / ถนน — optional, many Thai addresses have neither.
--   - delivery_note: หมายเหตุสำหรับการจัดส่ง — optional courier instructions.
-- Both are nullable text columns, so every historical address row (which
-- never had these) stays valid and readable exactly as before — no
-- backfill, no data loss, no reset.

alter table addresses
  add column if not exists soi_road text,
  add column if not exists delivery_note text;

-- Defense-in-depth mirror of the Zod length cap (checkout.ts) — the API
-- route already rejects an oversized note before it reaches the
-- database, but a second, independent bound here means a future direct
-- DB write (a script, a different caller) can't smuggle an unbounded
-- payload through either (§11/§15).
alter table addresses
  drop constraint if exists addresses_delivery_note_length;
alter table addresses
  add constraint addresses_delivery_note_length check (delivery_note is null or char_length(delivery_note) <= 200);

-- ─────────────────────────────────────────────────────────────────────
-- create_order_with_reservation — byte-for-byte identical to 0015's
-- version except the addresses insert now also writes soi_road and
-- delivery_note from p_address (both optional; nullif(...,'') keeps an
-- empty string as a real NULL rather than an empty row, same convention
-- already used for customers.line_id/email above).
-- ─────────────────────────────────────────────────────────────────────
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
  v_product_total_qty integer;
  v_ttl integer := greatest(coalesce(p_reservation_ttl_minutes, 15), 1);
  v_has_idempotency_key boolean := p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0;
  v_raw_item jsonb;
  v_raw_quantity integer;
  v_raw_customizations jsonb;
  v_customization jsonb;
  v_customization_name text;
  v_customization_number text;
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

  -- ── Validate every raw item + its customizations BEFORE writing
  --    anything (§22: server never trusts the client's customization
  --    payload blindly) ────────────────────────────────────────────────
  for v_raw_item in select * from jsonb_array_elements(p_items)
  loop
    if (v_raw_item->>'variant_id') is null then
      raise exception 'Invalid item in cart' using errcode = 'CM003';
    end if;

    v_raw_quantity := nullif(v_raw_item->>'quantity', '')::integer;
    if v_raw_quantity is null or v_raw_quantity <= 0 or v_raw_quantity > 1000000 then
      raise exception 'Invalid quantity' using errcode = 'CM003';
    end if;

    v_raw_customizations := coalesce(v_raw_item->'customizations', '[]'::jsonb);
    if jsonb_typeof(v_raw_customizations) <> 'array' or jsonb_array_length(v_raw_customizations) <> v_raw_quantity then
      raise exception 'Customization count must match quantity' using errcode = 'CM003';
    end if;

    for v_customization in select * from jsonb_array_elements(v_raw_customizations)
    loop
      v_customization_name := v_customization->>'name';
      v_customization_number := v_customization->>'number';
      if v_customization_name is not null and length(trim(v_customization_name)) > 15 then
        raise exception 'Name must be 15 characters or fewer' using errcode = 'CM003';
      end if;
      if v_customization_name is not null and length(trim(v_customization_name)) = 0 then
        raise exception 'Name must not be blank when provided' using errcode = 'CM003';
      end if;
      if v_customization_number is not null and v_customization_number !~ '^\d{1,2}$' then
        raise exception 'Number must be 0-99' using errcode = 'CM003';
      end if;
    end loop;
  end loop;

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

  -- ── Write sequence, exception-handled for the concurrent-same-key race ─
  begin
    insert into customers (full_name, phone, line_id, email)
    values (
      p_customer->>'full_name',
      p_customer->>'phone',
      nullif(p_customer->>'line_id', ''),
      nullif(p_customer->>'email', '')
    )
    returning id into v_customer_id;

    insert into addresses (
      customer_id, address_line, soi_road, subdistrict, district, province, postal_code, delivery_note
    )
    values (
      v_customer_id,
      p_address->>'address_line',
      nullif(p_address->>'soi_road', ''),
      p_address->>'subdistrict',
      p_address->>'district',
      p_address->>'province',
      p_address->>'postal_code',
      nullif(p_address->>'delivery_note', '')
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

    -- Group by variant, CONCATENATING customizations across any repeated
    -- variant_id lines (rather than 0014's plain sum(quantity)) so two
    -- shirts of the same color/size never lose or merge their distinct
    -- printed name/number (§16). `count(*)` of exploded customization
    -- elements is the true per-unit quantity — already validated above
    -- to equal each raw item's stated quantity.
    for v_line in
      select
        (ri->>'variant_id')::uuid as variant_id,
        count(*)::integer as quantity,
        jsonb_agg(cust order by item_ord, cust_ord) as customizations
      from jsonb_array_elements(p_items) with ordinality as items(ri, item_ord)
      cross join lateral jsonb_array_elements(coalesce(ri->'customizations', '[]'::jsonb)) with ordinality as custs(cust, cust_ord)
      group by (ri->>'variant_id')::uuid
      order by variant_id
    loop
      select
        pv.id, pv.product_id, pv.stock_qty, pv.is_active as variant_active,
        pv.price_satang_override, pv.sku,
        p.is_active as product_active, p.is_preorder, p.base_price_satang, p.name as product_name,
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

      -- Unlimited pre-order: skip the physical/reserved-stock check
      -- entirely for preorder products. Non-preorder products keep the
      -- original scarcity check unchanged.
      if not v_variant.is_preorder then
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
      end if;

      -- Quantity-tier pricing: for a preorder product, the unit price is
      -- driven by the TOTAL quantity of that product across every line
      -- in this order (all sizes/colors combined) — never a per-line
      -- price, and never affected by customization (§19). For a
      -- non-preorder product, price_satang_override / base_price_satang
      -- behave exactly as before.
      if v_variant.is_preorder then
        select coalesce(sum(x.quantity), 0) into v_product_total_qty
        from jsonb_to_recordset(p_items) as x(variant_id uuid, quantity integer)
        join product_variants pv2 on pv2.id = x.variant_id
        where pv2.product_id = v_variant.product_id;

        v_unit_price := get_tier_unit_price_satang(v_variant.product_id, v_product_total_qty);
      else
        v_unit_price := coalesce(v_variant.price_satang_override, v_variant.base_price_satang);
      end if;

      v_line_total := v_unit_price * v_line.quantity;
      v_subtotal := v_subtotal + v_line_total;

      insert into order_items (
        order_id, variant_id, product_name_snapshot, color_name_snapshot,
        size_name_snapshot, sku_snapshot, unit_price_satang, quantity, line_total_satang,
        customizations
      )
      values (
        v_order_id, v_variant.id, v_variant.product_name, v_variant.color_name,
        v_variant.size_name, v_variant.sku, v_unit_price, v_line.quantity, v_line_total,
        v_line.customizations
      );

      -- Reservation rows are still recorded (useful historically/for
      -- admin visibility) but never gate a preorder purchase — the
      -- availability check above is skipped for is_preorder products.
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
