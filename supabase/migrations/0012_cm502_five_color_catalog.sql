-- CM502 — real five-color catalog integration
--
-- Documents the catalog migration already applied against the live
-- project (via a one-off admin script using the service-role key, since
-- this repo has no `supabase db push` link configured). Kept here so the
-- change is visible in version control and re-runnable/idempotent.
--
-- Scope: colors + product_variants + product_images only. Does NOT touch
-- order_items, reservations, payments, or pricing — those are untouched
-- by design (historical order snapshots must stay independent of the
-- live catalog, see order_items.*_snapshot columns in 0001_init.sql).
--
-- Placeholder "Cream" color predates real photography and is already
-- referenced by historical order_items via product_variants.id
-- (on delete restrict), so it is never deleted — only its variants are
-- deactivated, which removes it from the customer-facing catalog via
-- getAvailableColors()/getJerseyProduct() without breaking history.

-- 1. Real five-color display order: Black, White, Pink, Brown, Navy.
--    Cream is pushed out of the active ordering (sort_order 99) but kept.
update colors set sort_order = 1 where name = 'Black';
update colors set sort_order = 2 where name = 'White';
update colors set sort_order = 5 where name = 'Navy';
update colors set sort_order = 99 where name = 'Cream';

insert into colors (name, hex_code, sort_order) values
  ('Pink', '#D98CA3', 3),
  ('Brown', '#6B4226', 4)
on conflict (name) do nothing;

-- 2. Hide the placeholder Cream color from the active catalog without
--    deleting it — it's referenced by historical order_items.
update product_variants pv
set is_active = false
from colors c, products p
where pv.color_id = c.id
  and pv.product_id = p.id
  and c.name = 'Cream'
  and p.slug = 'jersey';

-- 3. Real variants for the two newly-added colors, one per size, S/M/L/XL.
--    stock_qty = 0 (no real inventory supplied yet — never fabricate stock).
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
  and c.name in ('Pink', 'Brown')
on conflict (product_id, color_id, size_id) do nothing;

-- 4. Primary product image per real color. Assets uploaded separately to
--    Supabase Storage bucket `product-images` at
--    cm502-jersey/<color-slug>/primary.jpg (public bucket, admin-only
--    write — see 0003_storage.sql). Only one image per color exists
--    today (image_type 'front', sort_order 0); the schema already
--    supports back/detail/lifestyle for future additions.
do $$
declare
  v_product_id uuid;
  v_mapping jsonb := '[
    {"color": "Black", "path": "cm502-jersey/black/primary.jpg", "alt": "CM502 Jersey – Black – Front"},
    {"color": "White", "path": "cm502-jersey/white/primary.jpg", "alt": "CM502 Jersey – White – Front"},
    {"color": "Pink",  "path": "cm502-jersey/pink/primary.jpg",  "alt": "CM502 Jersey – Pink – Front"},
    {"color": "Brown", "path": "cm502-jersey/brown/primary.jpg", "alt": "CM502 Jersey – Brown – Front"},
    {"color": "Navy",  "path": "cm502-jersey/navy/primary.jpg",  "alt": "CM502 Jersey – Navy – Front"}
  ]';
  v_item jsonb;
  v_color_id uuid;
begin
  select id into v_product_id from products where slug = 'jersey';

  for v_item in select * from jsonb_array_elements(v_mapping)
  loop
    select id into v_color_id from colors where name = v_item->>'color';

    delete from product_images
    where product_id = v_product_id and color_id = v_color_id;

    insert into product_images (product_id, color_id, variant_id, storage_path, alt_text, image_type, sort_order)
    values (v_product_id, v_color_id, null, v_item->>'path', v_item->>'alt', 'front', 0);
  end loop;
end $$;
