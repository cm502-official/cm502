-- CM502 — reservation expiration lifecycle.
--
-- Reuses existing enum values rather than inventing new ones:
--   orders.payment_status already has 'expired' (0001) — that's the
--   terminal state for an unpaid order whose reservation window passed.
--   fulfillment_status is left untouched here; an expired order simply
--   never proceeds to 'paid', which is enough for Phase 3 scope. Whether
--   it should later move to 'cancelled' is an admin/Phase-5 decision, not
--   something this automatic sweep should decide unilaterally.
--
-- Idempotent by construction: every UPDATE is scoped to rows that are
-- STILL 'active'/'awaiting_payment' at the moment it runs, so calling
-- this twice (or concurrently) is safe — the second call simply finds
-- nothing left to do. It never touches:
--   - 'converted' reservations (real sales)
--   - orders whose payment_status has already moved past awaiting_payment
--     (verified, needs_review, rejected, etc.)

create or replace function expire_stale_reservations()
returns table (orders_expired integer, reservations_released integer)
language plpgsql
as $$
declare
  v_order_ids uuid[];
  v_reservations_count integer := 0;
  v_orders_count integer := 0;
begin
  -- Snapshot exactly which orders are affected before mutating anything,
  -- so the two UPDATEs below act on a consistent set.
  select coalesce(array_agg(distinct o.id), '{}') into v_order_ids
  from orders o
  join inventory_reservations r on r.order_id = o.id
  where o.payment_status = 'awaiting_payment'
    and r.status = 'active'
    and r.expires_at <= now();

  if array_length(v_order_ids, 1) is null then
    return query select 0, 0;
    return;
  end if;

  update inventory_reservations r
  set status = 'released'
  from orders o
  where r.order_id = o.id
    and o.id = any(v_order_ids)
    and r.status = 'active'
    and r.expires_at <= now();
  get diagnostics v_reservations_count = row_count;

  with updated_orders as (
    update orders
    set payment_status = 'expired'
    where id = any(v_order_ids)
      and payment_status = 'awaiting_payment'
    returning id
  )
  insert into order_status_history (order_id, field, previous_value, new_value, note)
  select id, 'payment_status', 'awaiting_payment', 'expired',
         'Reservation window passed; stock released automatically'
  from updated_orders;
  get diagnostics v_orders_count = row_count;

  return query select v_orders_count, v_reservations_count;
end;
$$;

-- Server-only (cron endpoint uses the service-role client).
revoke all on function expire_stale_reservations() from public;
grant execute on function expire_stale_reservations() to service_role;
