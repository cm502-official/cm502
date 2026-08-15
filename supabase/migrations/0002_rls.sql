-- CM502 — Row Level Security
--
-- Design principle: customer-identifying tables (customers, addresses,
-- orders, order_items, payments, payment_slips, inventory_reservations,
-- order_status_history, payment_verification_attempts) get RLS enabled
-- with NO anon-role policies at all. That means the browser (anon key)
-- can never query them directly, by design — every read/write goes
-- through a server Route Handler that authenticates ownership (via
-- orders.tracking_token, never a sequential/UUID id) or admin role, then
-- uses the service-role client. This is the IDOR defense from §26.
--
-- Catalog/content tables (products, colors, sizes, variants, images,
-- shipping_methods, site_settings) are public-readable, since there's no
-- customer login and the storefront must render for anonymous visitors.

alter table admin_users enable row level security;
alter table products enable row level security;
alter table colors enable row level security;
alter table sizes enable row level security;
alter table product_variants enable row level security;
alter table product_images enable row level security;
alter table customers enable row level security;
alter table addresses enable row level security;
alter table shipping_methods enable row level security;
alter table site_settings enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table inventory_reservations enable row level security;
alter table payments enable row level security;
alter table payment_slips enable row level security;
alter table payment_verification_attempts enable row level security;
alter table admin_audit_logs enable row level security;
alter table order_number_counters enable row level security;

-- security definer so this can be used inside other tables' policies
-- without those policies needing read access to admin_users themselves.
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from admin_users
    where id = auth.uid() and is_active = true
  );
$$ language sql stable security definer set search_path = public;

-- ─────────────────────────────────────────────────────────────────────────
-- admin_users — admins can read their own row + the roster; only an admin
-- (not staff) can manage other admin_users rows. Provisioning new admins
-- is expected to happen via the service-role client (admin invite flow),
-- not through a client-side insert policy.
-- ─────────────────────────────────────────────────────────────────────────

create policy admin_users_select_self_or_admin on admin_users
  for select using (id = auth.uid() or is_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- Catalog — public read of active rows, admin-only writes
-- ─────────────────────────────────────────────────────────────────────────

create policy products_public_read on products
  for select using (is_active = true or is_admin());
create policy products_admin_write on products
  for all using (is_admin()) with check (is_admin());

create policy colors_public_read on colors
  for select using (true);
create policy colors_admin_write on colors
  for insert with check (is_admin());
create policy colors_admin_update on colors
  for update using (is_admin()) with check (is_admin());
create policy colors_admin_delete on colors
  for delete using (is_admin());

create policy sizes_public_read on sizes
  for select using (true);
create policy sizes_admin_write on sizes
  for insert with check (is_admin());
create policy sizes_admin_update on sizes
  for update using (is_admin()) with check (is_admin());
create policy sizes_admin_delete on sizes
  for delete using (is_admin());

create policy product_variants_public_read on product_variants
  for select using (is_active = true or is_admin());
create policy product_variants_admin_write on product_variants
  for all using (is_admin()) with check (is_admin());

create policy product_images_public_read on product_images
  for select using (true);
create policy product_images_admin_write on product_images
  for all using (is_admin()) with check (is_admin());

create policy shipping_methods_public_read on shipping_methods
  for select using (is_active = true or is_admin());
create policy shipping_methods_admin_write on shipping_methods
  for all using (is_admin()) with check (is_admin());

-- site_settings holds admin-configured, non-secret content (bank/PromptPay
-- display info, homepage copy). Readable publicly so checkout/payment
-- pages can render for anonymous customers; writes are admin-only.
create policy site_settings_public_read on site_settings
  for select using (true);
create policy site_settings_admin_write on site_settings
  for all using (is_admin()) with check (is_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- Customer-identifying + order/payment tables — admin-only via RLS.
-- Customer-facing access happens exclusively through server Route
-- Handlers using the service-role client after verifying tracking_token
-- ownership, so there are deliberately no anon-role policies here.
-- ─────────────────────────────────────────────────────────────────────────

create policy customers_admin_only on customers
  for all using (is_admin()) with check (is_admin());

create policy addresses_admin_only on addresses
  for all using (is_admin()) with check (is_admin());

create policy orders_admin_only on orders
  for all using (is_admin()) with check (is_admin());

create policy order_items_admin_only on order_items
  for all using (is_admin()) with check (is_admin());

create policy order_status_history_admin_only on order_status_history
  for all using (is_admin()) with check (is_admin());

create policy inventory_reservations_admin_only on inventory_reservations
  for all using (is_admin()) with check (is_admin());

create policy payments_admin_only on payments
  for all using (is_admin()) with check (is_admin());

create policy payment_slips_admin_only on payment_slips
  for all using (is_admin()) with check (is_admin());

create policy payment_verification_attempts_admin_only on payment_verification_attempts
  for all using (is_admin()) with check (is_admin());

create policy admin_audit_logs_admin_only on admin_audit_logs
  for select using (is_admin());

create policy order_number_counters_admin_only on order_number_counters
  for all using (is_admin()) with check (is_admin());
