-- CM502 — fix: explicitly revoke EXECUTE from anon/authenticated on every
-- server-only RPC function.
--
-- Found during live Phase 4B verification: `record_payment_slip` and
-- `finalize_payment_verification` (0008) were both directly callable by
-- the anon key, despite each migration's `revoke all ... from public;
-- grant execute ... to service_role;`. Root cause: this Supabase project
-- has default privileges configured that auto-grant EXECUTE to
-- anon/authenticated on every new function created in the public schema
-- (`ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon,
-- authenticated`, set up by Supabase's project bootstrap). Revoking from
-- the PUBLIC pseudo-role does not remove a grant already made to a
-- specific named role — that requires revoking from the role directly.
--
-- Confirmed live that this affected every prior RPC the same way
-- (create_order_with_reservation, expire_stale_reservations,
-- record_payment_slip, finalize_payment_verification) — not new to this
-- migration, present since 0004.
--
-- Real-world impact was verified to be NIL: every one of these functions
-- is SECURITY INVOKER (not DEFINER), and every table they touch
-- (orders, customers, payments, inventory_reservations, ...) has
-- admin-only RLS with zero anon SELECT/INSERT/UPDATE policies. Calling
-- any of them as anon — even with a real, valid order id — fails at the
-- function's own `SELECT ... FOR UPDATE` because RLS filters the row out
-- entirely before the EXECUTE-privilege gap could matter. This migration
-- closes the gap anyway: least privilege should not depend solely on a
-- second layer holding.

revoke execute on function create_order_with_reservation(text, jsonb, jsonb, jsonb, uuid, integer) from anon, authenticated;
revoke execute on function expire_stale_reservations() from anon, authenticated;
revoke execute on function record_payment_slip(uuid, text, text, text, integer) from anon, authenticated;
revoke execute on function finalize_payment_verification(
  uuid, uuid, text, integer, text, text, text, text, text, text, timestamptz,
  text, numeric, jsonb, boolean, boolean, boolean, text
) from anon, authenticated;
