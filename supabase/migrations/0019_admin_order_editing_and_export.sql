-- CM502 — admin order editing, audit trail, production-export metadata
--
-- Three additive pieces, all backward-compatible:
--   1. orders gains production_exported_at/production_exported_by
--      (nullable) — every historical order is simply "never exported".
--   2. New order_edit_history table — one row per admin edit, storing a
--      structured before/after JSON snapshot. Append-only; nothing here
--      ever updates or deletes a prior history row (§5 "do not overwrite
--      history").
--   3. admin_update_order_details() — the only way admin edits to
--      customer/address/items ever get written. Mirrors
--      create_order_with_reservation's validation/tier-pricing/stock
--      discipline instead of a raw `update order_items`, and is NOT
--      security definer — it runs as the calling (admin) role, so
--      Postgres RLS (orders_admin_only, customers_admin_only, etc. —
--      0002_rls.sql) is the real enforcement, exactly like every other
--      admin write in this codebase (§19 "reuse existing admin auth").

alter table orders
  add column if not exists production_exported_at timestamptz,
  add column if not exists production_exported_by uuid references admin_users (id) on delete set null;

create table if not exists order_edit_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  edited_at timestamptz not null default now(),
  edited_by uuid references admin_users (id) on delete set null,
  -- {"before": {...}, "after": {...}} — customer/address/items/subtotal/
  -- total snapshots, not raw DB rows with internal ids, so this reads
  -- back cleanly in the admin UI without extra joins.
  changes jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_edit_history_order on order_edit_history (order_id, edited_at desc);

alter table order_edit_history enable row level security;
drop policy if exists order_edit_history_admin_only on order_edit_history;
create policy order_edit_history_admin_only on order_edit_history
  for all using (is_admin()) with check (is_admin());

-- ─────────────────────────────────────────────────────────────────────
-- admin_update_order_details — replace an order's customer/address/item
-- list wholesale (the client always sends the FULL new item list, so
-- add/remove/duplicate/edit-one-line are all just "a different array" —
-- §1's "add another shirt line" etc. need no separate operations).
--
-- p_items shape matches create_order_with_reservation's p_items:
--   [{ variant_id, quantity, customizations: [{name, number}, ...] }]
--
-- Payment safety (§4): never touches payment_status, payment_slips, or
-- payment_verification_attempts. If the recalculated total differs from
-- the order's current total AND the order's payment is already
-- 'verified', the call is rejected (errcode CM302) unless
-- p_confirm_total_change is explicitly true — the API route surfaces
-- that as a confirmation prompt rather than silently changing a paid
-- order's total. payments.expected_amount_satang IS kept in sync with
-- the new total (so a not-yet-verified slip still compares against the
-- right amount) — this is the only payments-table write, and only ever
-- that one column.
-- ─────────────────────────────────────────────────────────────────────
create or replace function admin_update_order_details(
  p_order_id uuid,
  p_customer jsonb,
  p_address jsonb,
  p_items jsonb,
  p_confirm_total_change boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_order record;
  v_before jsonb;
  v_after jsonb;
  v_old_total integer;
  v_new_total integer;
  v_subtotal integer := 0;
  v_line record;
  v_variant record;
  v_available integer;
  v_unit_price integer;
  v_line_total integer;
  v_product_total_qty integer;
  v_raw_item jsonb;
  v_raw_quantity integer;
  v_raw_customizations jsonb;
  v_customization jsonb;
  v_customization_name text;
  v_customization_number text;
begin
  if not is_admin() then
    raise exception 'Not authorized' using errcode = 'CM401';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'CM404';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'An order must have at least one shirt' using errcode = 'CM003';
  end if;

  -- ── Validate every raw item + customization BEFORE writing anything,
  --    identical rules to create_order_with_reservation (§21 "invalid
  --    variant rejected" etc.) plus the '/' and newline ban (§17). ──────
  for v_raw_item in select * from jsonb_array_elements(p_items)
  loop
    if (v_raw_item->>'variant_id') is null then
      raise exception 'Invalid item in order' using errcode = 'CM003';
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
      if v_customization_name is not null and (v_customization_name like '%/%' or v_customization_name ~ '[\n\r]') then
        raise exception 'Name may not contain "/" or line breaks' using errcode = 'CM006';
      end if;
      if v_customization_number is not null and v_customization_number !~ '^\d{1,2}$' then
        raise exception 'Number must be 0-99' using errcode = 'CM003';
      end if;
    end loop;
  end loop;

  -- ── Audit "before" snapshot ──────────────────────────────────────────
  select jsonb_build_object(
    'customer', (select to_jsonb(c) - 'id' from customers c where c.id = v_order.customer_id),
    'address', (select to_jsonb(a) - 'id' - 'customer_id' from addresses a where a.id = v_order.shipping_address_id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'variant_id', oi.variant_id, 'color_name_snapshot', oi.color_name_snapshot,
        'size_name_snapshot', oi.size_name_snapshot, 'quantity', oi.quantity,
        'unit_price_satang', oi.unit_price_satang, 'customizations', oi.customizations
      )), '[]'::jsonb)
      from order_items oi where oi.order_id = p_order_id
    ),
    'subtotal_satang', v_order.subtotal_satang,
    'total_satang', v_order.total_satang
  ) into v_before;

  v_old_total := v_order.total_satang;

  -- ── Customer + address (in place — same row ids, so tracking_token /
  --    order_number / every other reference is untouched) ──────────────
  update customers set
    full_name = p_customer->>'full_name',
    phone = p_customer->>'phone',
    line_id = nullif(p_customer->>'line_id', ''),
    email = nullif(p_customer->>'email', '')
  where id = v_order.customer_id;

  update addresses set
    address_line = p_address->>'address_line',
    soi_road = nullif(p_address->>'soi_road', ''),
    subdistrict = p_address->>'subdistrict',
    district = p_address->>'district',
    province = p_address->>'province',
    postal_code = p_address->>'postal_code',
    delivery_note = nullif(p_address->>'delivery_note', '')
  where id = v_order.shipping_address_id;

  -- ── Release this order's current reservations before re-checking
  --    stock, so its own held quantity never double-counts against
  --    itself (§3 "ensure reservations/stock remain internally
  --    consistent") — then replace order_items wholesale with the new
  --    list (§1: add/remove/duplicate/edit are all just "a different
  --    array", nothing here treats them as distinct operations). ───────
  update inventory_reservations
  set status = 'released'
  where order_id = p_order_id and status = 'active';

  delete from order_items where order_id = p_order_id;

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
      raise exception 'One of the selected shirts no longer exists' using errcode = 'CM004';
    end if;
    if not v_variant.variant_active or not v_variant.product_active then
      raise exception '%: this item is no longer available', v_variant.sku using errcode = 'CM004';
    end if;

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
      p_order_id, v_variant.id, v_variant.product_name, v_variant.color_name,
      v_variant.size_name, v_variant.sku, v_unit_price, v_line.quantity, v_line_total,
      v_line.customizations
    );

    insert into inventory_reservations (order_id, variant_id, quantity, status, expires_at)
    values (p_order_id, v_variant.id, v_line.quantity, 'active', coalesce(v_order.reservation_expires_at, now() + interval '15 minutes'));
  end loop;

  v_new_total := v_subtotal + v_order.shipping_fee_satang;

  if v_order.payment_status = 'verified' and v_new_total <> v_old_total and not p_confirm_total_change then
    raise exception 'This order is already verified as paid and its total would change — confirm to proceed' using errcode = 'CM302';
  end if;

  update orders
  set subtotal_satang = v_subtotal, total_satang = v_new_total, updated_at = now()
  where id = p_order_id;

  -- Keep the payment record's expected amount in sync — never the
  -- payment_status, never the slip/verification rows (§4).
  update payments set expected_amount_satang = v_new_total where order_id = p_order_id;

  select jsonb_build_object(
    'customer', (select to_jsonb(c) - 'id' from customers c where c.id = v_order.customer_id),
    'address', (select to_jsonb(a) - 'id' - 'customer_id' from addresses a where a.id = v_order.shipping_address_id),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'variant_id', oi.variant_id, 'color_name_snapshot', oi.color_name_snapshot,
        'size_name_snapshot', oi.size_name_snapshot, 'quantity', oi.quantity,
        'unit_price_satang', oi.unit_price_satang, 'customizations', oi.customizations
      )), '[]'::jsonb)
      from order_items oi where oi.order_id = p_order_id
    ),
    'subtotal_satang', v_subtotal,
    'total_satang', v_new_total
  ) into v_after;

  insert into order_edit_history (order_id, edited_by, changes)
  values (p_order_id, auth.uid(), jsonb_build_object('before', v_before, 'after', v_after));

  return jsonb_build_object(
    'order_id', p_order_id,
    'subtotal_satang', v_subtotal,
    'total_satang', v_new_total,
    'total_changed', v_new_total <> v_old_total
  );
end;
$$;

revoke all on function admin_update_order_details(uuid, jsonb, jsonb, jsonb, boolean) from public;
grant execute on function admin_update_order_details(uuid, jsonb, jsonb, jsonb, boolean) to authenticated;
