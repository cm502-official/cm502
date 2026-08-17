-- CM502 — shorten customer-facing product name
--
-- "CM502 University Jersey" -> "CM502 Jersey". This is a display-copy
-- change only: slug ('jersey'), SKUs, and variant/color/size identifiers
-- are untouched, so historical order_items (which snapshot their own
-- product_name_snapshot at order time) and the URL are unaffected.
--
-- Plain UPDATE — idempotent, safe to rerun.

update products
set
  name = 'CM502 Jersey',
  updated_at = now()
where slug = 'jersey';
