-- CM502 — initial schema
-- All money columns are INTEGER satang (1 THB = 100 satang). Never numeric/float.
-- All internal PKs are UUID. Orders additionally get a human-readable order_number
-- and an unguessable tracking_token for customer-facing lookup (never expose the UUID).

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Per-day counter backing human-readable order numbers, e.g. CM502-20260815-0001.
create table order_number_counters (
  day date primary key,
  last_seq integer not null default 0
);

create or replace function generate_order_number()
returns text as $$
declare
  today date := (now() at time zone 'Asia/Bangkok')::date;
  seq integer;
begin
  insert into order_number_counters (day, last_seq)
  values (today, 1)
  on conflict (day) do update set last_seq = order_number_counters.last_seq + 1
  returning last_seq into seq;

  return 'CM502-' || to_char(today, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
end;
$$ language plpgsql;

create or replace function generate_tracking_token()
returns text as $$
begin
  -- 32 hex chars of cryptographic randomness — used in customer-facing
  -- lookup URLs instead of the orders.id UUID, so guessing/enumeration
  -- doesn't leak other customers' orders.
  return encode(gen_random_bytes(16), 'hex');
end;
$$ language plpgsql;

-- ─────────────────────────────────────────────────────────────────────────
-- Admin identity
-- ─────────────────────────────────────────────────────────────────────────

create table admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- Catalog: products, colors, sizes, variants, images
-- ─────────────────────────────────────────────────────────────────────────

create table products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  care_info text,
  -- Placeholder base price; final pricing is admin-configurable and not
  -- assumed by this schema. See product_variants.price_satang_override for
  -- per-variant overrides.
  base_price_satang integer not null check (base_price_satang >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger products_set_updated_at before update on products
  for each row execute function set_updated_at();

create table colors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  hex_code text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table sizes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  color_id uuid not null references colors (id) on delete restrict,
  size_id uuid not null references sizes (id) on delete restrict,
  sku text not null unique,
  price_satang_override integer check (price_satang_override is null or price_satang_override >= 0),
  stock_qty integer not null default 0 check (stock_qty >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, color_id, size_id)
);
create trigger product_variants_set_updated_at before update on product_variants
  for each row execute function set_updated_at();
create index idx_product_variants_product on product_variants (product_id);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  -- Scoped to a color (so the gallery swaps on color change) and/or a
  -- specific variant. Null color_id = shown regardless of selected color.
  color_id uuid references colors (id) on delete cascade,
  variant_id uuid references product_variants (id) on delete cascade,
  storage_path text not null,
  alt_text text not null default '',
  image_type text not null check (image_type in ('front', 'back', 'detail', 'lifestyle')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_product_images_product_color on product_images (product_id, color_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Customers & addresses
-- ─────────────────────────────────────────────────────────────────────────

create table customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  line_id text,
  email text,
  created_at timestamptz not null default now()
);

-- Append-only: each checkout writes a fresh row rather than editing an
-- existing one, so an order's shipping snapshot never silently changes.
create table addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  address_line text not null,
  subdistrict text not null,
  district text not null,
  province text not null,
  postal_code text not null,
  created_at timestamptz not null default now()
);
create index idx_addresses_customer on addresses (customer_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Shipping & site settings
-- ─────────────────────────────────────────────────────────────────────────

create table shipping_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_satang integer not null check (price_satang >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shipping_methods_set_updated_at before update on shipping_methods
  for each row execute function set_updated_at();

-- Key/value store for admin-configurable, low-structure content: bank
-- transfer details, PromptPay info, QR image path, homepage copy, etc.
-- Never store secrets here (this table is readable by RLS-approved admins,
-- not a substitute for env vars).
create table site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references admin_users (id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- Orders
-- ─────────────────────────────────────────────────────────────────────────

create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default generate_order_number(),
  tracking_token text not null unique default generate_tracking_token(),
  customer_id uuid not null references customers (id) on delete restrict,
  shipping_address_id uuid not null references addresses (id) on delete restrict,
  shipping_method_id uuid not null references shipping_methods (id) on delete restrict,

  subtotal_satang integer not null check (subtotal_satang >= 0),
  shipping_fee_satang integer not null check (shipping_fee_satang >= 0),
  total_satang integer not null check (total_satang >= 0),

  payment_status text not null default 'awaiting_payment' check (payment_status in (
    'awaiting_payment', 'slip_uploaded', 'verifying', 'verified',
    'needs_review', 'rejected', 'duplicate_slip', 'expired'
  )),
  fulfillment_status text not null default 'pending_payment' check (fulfillment_status in (
    'pending_payment', 'paid', 'processing', 'packed', 'shipped', 'delivered', 'cancelled'
  )),

  customer_note text,
  reservation_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint total_equals_subtotal_plus_shipping
    check (total_satang = subtotal_satang + shipping_fee_satang)
);
create trigger orders_set_updated_at before update on orders
  for each row execute function set_updated_at();
create index idx_orders_customer on orders (customer_id);
create index idx_orders_payment_status on orders (payment_status);
create index idx_orders_fulfillment_status on orders (fulfillment_status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  variant_id uuid not null references product_variants (id) on delete restrict,
  -- Snapshots: order history must stay correct even if the catalog changes
  -- (variant renamed, color deleted, price changed) after the sale.
  product_name_snapshot text not null,
  color_name_snapshot text not null,
  size_name_snapshot text not null,
  sku_snapshot text not null,
  unit_price_satang integer not null check (unit_price_satang >= 0),
  quantity integer not null check (quantity > 0),
  line_total_satang integer not null check (line_total_satang >= 0),
  created_at timestamptz not null default now(),

  constraint line_total_matches
    check (line_total_satang = unit_price_satang * quantity)
);
create index idx_order_items_order on order_items (order_id);
create index idx_order_items_variant on order_items (variant_id);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  field text not null check (field in ('payment_status', 'fulfillment_status')),
  previous_value text,
  new_value text not null,
  changed_by uuid references admin_users (id),
  note text,
  created_at timestamptz not null default now()
);
create index idx_order_status_history_order on order_status_history (order_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Inventory reservation (prevents oversell on the last unit)
-- ─────────────────────────────────────────────────────────────────────────

create table inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  variant_id uuid not null references product_variants (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'released', 'converted')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index idx_inventory_reservations_variant_status on inventory_reservations (variant_id, status);
create index idx_inventory_reservations_expires on inventory_reservations (expires_at) where status = 'active';

-- ─────────────────────────────────────────────────────────────────────────
-- Payments, slips, verification
-- ─────────────────────────────────────────────────────────────────────────

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders (id) on delete cascade,

  expected_amount_satang integer not null check (expected_amount_satang >= 0),
  detected_amount_satang integer check (detected_amount_satang is null or detected_amount_satang >= 0),

  payment_status text not null default 'awaiting_payment' check (payment_status in (
    'awaiting_payment', 'slip_uploaded', 'verifying', 'verified',
    'needs_review', 'rejected', 'duplicate_slip', 'expired'
  )),

  -- Duplicate-detection key #1. Partial unique index below enforces
  -- one-use-only when a reference is present.
  transaction_reference text,

  sender_name text,
  sender_account text,
  receiver_name text,
  receiver_account text,
  bank_name text,
  transferred_at timestamptz,

  ocr_provider text,
  ocr_confidence numeric(5, 4) check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  ocr_result jsonb,

  created_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references admin_users (id)
);
-- Only one non-null transaction_reference may exist across ALL payments —
-- this is the primary defense against reusing one bank transfer for two orders.
create unique index uniq_payments_transaction_reference
  on payments (transaction_reference) where transaction_reference is not null;

create table payment_slips (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  storage_path text not null,
  -- Duplicate-detection key #2: SHA-256 of the uploaded file. Unique across
  -- ALL slips, not just per order, so the same image can't be reused
  -- anywhere in the system.
  file_hash text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size_bytes integer not null check (file_size_bytes > 0),
  is_active boolean not null default true,
  uploaded_at timestamptz not null default now()
);
create unique index uniq_payment_slips_file_hash on payment_slips (file_hash);
create index idx_payment_slips_order on payment_slips (order_id);

create table payment_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments (id) on delete cascade,
  slip_id uuid references payment_slips (id) on delete set null,
  check_amount_match boolean,
  check_receiver_match boolean,
  check_timestamp_ok boolean,
  check_duplicate_found boolean,
  ocr_confidence numeric(5, 4),
  result_status text not null check (result_status in (
    'verified', 'needs_review', 'rejected', 'duplicate_slip'
  )),
  notes text,
  created_at timestamptz not null default now()
);
create index idx_verification_attempts_payment on payment_verification_attempts (payment_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Admin audit log
-- ─────────────────────────────────────────────────────────────────────────

create table admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references admin_users (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index idx_admin_audit_logs_entity on admin_audit_logs (entity_type, entity_id);
