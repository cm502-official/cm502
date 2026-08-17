-- CM502 — fix: record_payment_slip()'s expiry self-heal never actually
-- persisted.
--
-- Found during live Phase 4B verification (§N — expired-order upload
-- test): the self-heal block in 0008's record_payment_slip() ran its
-- UPDATEs to flip orders/payments to 'expired', then immediately
-- `raise exception`'d to reject the upload. Since one RPC call is one
-- Postgres transaction, raising an exception rolled back the ENTIRE
-- transaction — including the two UPDATEs that had just run. Confirmed
-- live: calling record_payment_slip() directly against a genuinely
-- expired order returned the correct CM103 "Payment window has expired"
-- error, but a follow-up read showed payment_status was still
-- 'awaiting_payment', not 'expired'.
--
-- Real-world customer impact was nil — the route handler still correctly
-- rejects the upload (mapped to a 410 EXPIRED response either way), and
-- the reservation-expiration cron sweep (0007) still eventually flips
-- the order to 'expired' on its own schedule. But the intended immediate
-- self-heal-on-upload-attempt never fired, in any code path.
--
-- Fix: return a jsonb result (matching the existing duplicate_slip
-- pattern in the same function) instead of raising, so the UPDATEs
-- commit as part of a successful return rather than being undone by an
-- exception.

create or replace function record_payment_slip(
  p_order_id uuid,
  p_storage_path text,
  p_file_hash text,
  p_mime_type text,
  p_file_size_bytes integer
)
returns jsonb
language plpgsql
as $$
declare
  v_order record;
  v_payment record;
  v_slip_id uuid;
begin
  select id, payment_status, reservation_expires_at into v_order
  from orders where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode = 'CM101';
  end if;

  select id into v_payment from payments where order_id = p_order_id for update;
  if not found then
    raise exception 'Payment record not found' using errcode = 'CM104';
  end if;

  -- Self-heal: if the reservation window has already passed but the
  -- automatic sweep (0007) hasn't run yet, don't accept a stale upload —
  -- flip the order to 'expired' right now instead. RETURNS (rather than
  -- raising) so these UPDATEs actually commit — see migration header.
  if v_order.payment_status = 'awaiting_payment'
     and v_order.reservation_expires_at is not null
     and v_order.reservation_expires_at <= now() then
    update orders set payment_status = 'expired' where id = p_order_id;
    update payments set payment_status = 'expired' where id = v_payment.id;
    return jsonb_build_object('outcome', 'expired', 'slipId', null, 'paymentId', v_payment.id);
  end if;

  if v_order.payment_status not in ('awaiting_payment', 'slip_uploaded', 'needs_review', 'rejected', 'duplicate_slip') then
    raise exception 'Order is not eligible for a payment slip upload' using errcode = 'CM102';
  end if;

  update payment_slips set is_active = false where payment_id = v_payment.id and is_active = true;

  begin
    insert into payment_slips (payment_id, order_id, storage_path, file_hash, mime_type, file_size_bytes, is_active)
    values (v_payment.id, p_order_id, p_storage_path, p_file_hash, p_mime_type, p_file_size_bytes, true)
    returning id into v_slip_id;
  exception when unique_violation then
    update payments set payment_status = 'duplicate_slip' where id = v_payment.id;
    update orders set payment_status = 'duplicate_slip' where id = p_order_id;
    insert into payment_verification_attempts (payment_id, result_status, notes)
    values (v_payment.id, 'duplicate_slip', 'Uploaded image matches a previously used slip (hash collision)');
    return jsonb_build_object('outcome', 'duplicate_slip', 'slipId', null, 'paymentId', v_payment.id);
  end;

  update payments set payment_status = 'slip_uploaded' where id = v_payment.id;
  update orders set payment_status = 'slip_uploaded' where id = p_order_id;

  insert into order_status_history (order_id, field, previous_value, new_value, note)
  values (p_order_id, 'payment_status', v_order.payment_status, 'slip_uploaded', 'Customer uploaded a payment slip');

  return jsonb_build_object('outcome', 'slip_uploaded', 'slipId', v_slip_id, 'paymentId', v_payment.id);
end;
$$;

-- Grants unaffected by CREATE OR REPLACE, but restate for clarity/safety.
revoke all on function record_payment_slip(uuid, text, text, text, integer) from public;
revoke execute on function record_payment_slip(uuid, text, text, text, integer) from anon, authenticated;
grant execute on function record_payment_slip(uuid, text, text, text, integer) to service_role;
