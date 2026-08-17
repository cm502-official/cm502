-- CM502 — seed data
--
-- Placeholder catalog only. Colors, sizes, price, and images are all
-- easily replaced from the admin dashboard once real CM502 assets and
-- final pricing are confirmed — nothing here is hardcoded into the
-- frontend, it's all loaded from these tables.

insert into products (slug, name, description, care_info, base_price_satang, is_active)
values (
  'jersey',
  'CM502 Jersey',
  'Placeholder description — replace with final CM502 product copy.',
  'Placeholder care instructions — replace with final fabric/wash guidance.',
  99000, -- ฿990.00 placeholder price, admin-configurable
  true
)
on conflict (slug) do nothing;

insert into colors (name, hex_code, sort_order) values
  ('Black', '#111111', 1),
  ('White', '#F5F5F0', 2),
  ('Navy', '#1B2A4A', 3),
  ('Cream', '#E8E1D3', 4)
on conflict (name) do nothing;

insert into sizes (name, sort_order) values
  ('S', 1),
  ('M', 2),
  ('L', 3),
  ('XL', 4)
on conflict (name) do nothing;

-- One variant per color x size, SKU pattern CM502-JERSEY-<COLOR>-<SIZE>.
insert into product_variants (product_id, color_id, size_id, sku, stock_qty, is_active)
select
  p.id,
  c.id,
  s.id,
  'CM502-JERSEY-' || upper(c.name) || '-' || upper(s.name),
  0, -- admin sets real stock per variant before launch
  true
from products p
cross join colors c
cross join sizes s
where p.slug = 'jersey'
on conflict (product_id, color_id, size_id) do nothing;

insert into shipping_methods (name, description, price_satang, is_active, sort_order)
values ('Standard Shipping', 'Delivered in 2-4 business days.', 5000, true, 1)
on conflict (name) do nothing;

-- Insert-only: once an admin has configured real bank/PromptPay details,
-- a reseed must never overwrite them back to the REPLACE_ME placeholders.
insert into site_settings (key, value) values
  ('payment_bank_transfer', jsonb_build_object(
    'bank_name', 'REPLACE_ME',
    'account_name', 'REPLACE_ME',
    'account_number', 'REPLACE_ME'
  )),
  ('payment_promptpay', jsonb_build_object(
    'promptpay_id', 'REPLACE_ME',
    'qr_image_storage_path', null
  )),
  ('stock_reservation_ttl_minutes', to_jsonb(15))
on conflict (key) do nothing;
