-- CM502 — quantity-tier pricing + unlimited pre-order + XS–10XL sizes
--
-- Three independent changes, kept in one migration because they all
-- touch the same order-creation path and are being shipped together:
--
--   1. Quantity-tier pricing: price per shirt depends on the TOTAL
--      quantity of a preorder product in the order (summed across every
--      size/color line for that product), not a flat per-variant price.
--      New table `product_quantity_tiers` + `get_tier_unit_price_satang()`
--      + `create_order_with_reservation()` updated to price preorder
--      products from the tier table instead of
--      price_satang_override/base_price_satang.
--
--   2. Unlimited pre-order: `products.is_preorder` flag. When true,
--      `get_active_variant_stock()` returns NULL (unknown/unlimited —
--      the TS layer already treats null availableStock as "never sold
--      out", see src/lib/catalog/resolve-variant.ts) and
--      `create_order_with_reservation()` skips the CM005 stock check
--      entirely for that product's lines. stock_qty / inventory_reservations
--      are left in place (not dropped) — reservation rows are still
--      inserted for historical/admin visibility, they just never block a
--      preorder purchase. Existing stock-qty tracking on non-preorder
--      products (should any exist later) is completely unaffected.
--
--   3. Size range XS–10XL: new sizes inserted, new product_variants rows
--      generated for the 5 active real colors (Black/White/Pink/Brown/
--      Navy) × the newly-added sizes. Existing S/M/L/XL variants and IDs
--      are untouched — only re-sequenced sort_order and new rows added,
--      nothing deleted, nothing that could break historical order_items
--      (those are text snapshots, not FKs to sizes).
--
-- Historical order_items are unaffected: unit_price_satang is already a
-- point-in-time snapshot column, never recomputed from live tiers.

-- ─────────────────────────────────────────────────────────────────────
-- 1a. Preorder flag
-- ─────────────────────────────────────────────────────────────────────
alter table products
  add column if not exists is_preorder boolean not null default false;

update products set is_preorder = true where slug = 'jersey';

-- ─────────────────────────────────────────────────────────────────────
-- 1b. Quantity-tier pricing table
-- ─────────────────────────────────────────────────────────────────────
create table if not exists product_quantity_tiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  min_qty integer not null check (min_qty > 0),
  unit_price_satang integer not null check (unit_price_satang >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, min_qty)
);

alter table product_quantity_tiers enable row level security;

drop policy if exists product_quantity_tiers_public_read on product_quantity_tiers;
create policy product_quantity_tiers_public_read on product_quantity_tiers
  for select using (true);

drop policy if exists product_quantity_tiers_admin_write on product_quantity_tiers;
create policy product_quantity_tiers_admin_write on product_quantity_tiers
  for all using (is_admin()) with check (is_admin());

-- Idempotent reseed of the jersey's tiers (delete+insert rather than
-- upsert-per-row, so a rerun can never leave a stale extra tier behind).
delete from product_quantity_tiers
where product_id = (select id from products where slug = 'jersey');

insert into product_quantity_tiers (product_id, min_qty, unit_price_satang, sort_order)
select p.id, tier.min_qty, tier.unit_price_satang, tier.sort_order
from products p
cross join (values
  (1, 41900, 1),
  (3, 39900, 2),
  (5, 37900, 3),
  (10, 34900, 4),
  (20, 29900, 5),
  (50, 28900, 6)
) as tier(min_qty, unit_price_satang, sort_order)
where p.slug = 'jersey';

-- Server-authoritative tier lookup: highest min_qty that's <= the given
-- quantity. Falls back to price_satang_override/base_price_satang when a
-- product has no tiers configured (non-preorder products, or before any
-- tiers are seeded), so this function is safe to call unconditionally.
create or replace function get_tier_unit_price_satang(p_product_id uuid, p_total_qty integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select t.unit_price_satang
      from product_quantity_tiers t
      where t.product_id = p_product_id
        and t.min_qty <= greatest(p_total_qty, 1)
      order by t.min_qty desc
      limit 1
    ),
    (select base_price_satang from products where id = p_product_id)
  );
$$;

revoke all on function get_tier_unit_price_satang(uuid, integer) from public;
grant execute on function get_tier_unit_price_satang(uuid, integer) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Unlimited pre-order — stock RPC returns NULL for preorder products
-- ─────────────────────────────────────────────────────────────────────
create or replace function get_active_variant_stock(p_product_id uuid)
returns table (variant_id uuid, available_stock integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    pv.id,
    case
      when (select p.is_preorder from products p where p.id = p_product_id) then null
      else greatest(
        pv.stock_qty - coalesce((
          select sum(r.quantity)
          from inventory_reservations r
          where r.variant_id = pv.id
            and (r.status = 'converted' or (r.status = 'active' and r.expires_at > now()))
        ), 0),
        0
      )::integer
    end
  from product_variants pv
  where pv.product_id = p_product_id;
$$;

revoke all on function get_active_variant_stock(uuid) from public;
grant execute on function get_active_variant_stock(uuid) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 1c + 2b. Order creation: tier pricing (by total qty per product) and
-- preorder stock bypass, both in create_order_with_reservation().
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
      -- Sanity ceiling against malformed/adversarial quantities — well
      -- above any realistic preorder bulk order, just guards against
      -- integer-overflow-style abuse of the "unlimited" quantity model.
      if v_line.quantity > 1000000 then
        raise exception 'Invalid quantity' using errcode = 'CM003';
      end if;

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
      -- price. For a non-preorder product, price_satang_override /
      -- base_price_satang behave exactly as before.
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
        size_name_snapshot, sku_snapshot, unit_price_satang, quantity, line_total_satang
      )
      values (
        v_order_id, v_variant.id, v_variant.product_name, v_variant.color_name,
        v_variant.size_name, v_variant.sku, v_unit_price, v_line.quantity, v_line_total
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

-- ─────────────────────────────────────────────────────────────────────
-- 3. Size range XS–10XL
-- ─────────────────────────────────────────────────────────────────────
-- Re-sequence existing sizes to make room for XS at the front; nothing
-- deleted, existing IDs untouched.
update sizes set sort_order = 2 where name = 'S';
update sizes set sort_order = 3 where name = 'M';
update sizes set sort_order = 4 where name = 'L';
update sizes set sort_order = 5 where name = 'XL';

insert into sizes (name, sort_order) values
  ('XS', 1),
  ('2XL', 6),
  ('3XL', 7),
  ('4XL', 8),
  ('5XL', 9),
  ('6XL', 10),
  ('7XL', 11),
  ('8XL', 12),
  ('9XL', 13),
  ('10XL', 14)
on conflict (name) do nothing;

-- New variants: the 5 active real colors × every newly-added size.
-- Existing S/M/L/XL variants (all colors, including inactive Cream) are
-- untouched. stock_qty stays 0 — irrelevant for a preorder product,
-- never invented as a real number.
insert into product_variants (product_id, color_id, size_id, sku, stock_qty, is_active)
select
  p.id,
  c.id,
  s.id,
  'CM502-JERSEY-' || upper(c.name) || '-' || upper(s.name),
  0,
  true
from products p
cross join colors c
cross join sizes s
where p.slug = 'jersey'
  and c.name in ('Black', 'White', 'Pink', 'Brown', 'Navy')
  and s.name in ('XS', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL', '9XL', '10XL')
on conflict (product_id, color_id, size_id) do nothing;
