-- CM502 — Phase 4A: atomic payment slip recording + final verification.
--
-- Two RPCs, mirroring the same pattern as create_order_with_reservation
-- (0004) and expire_stale_reservations (0007): all money/state decisions
-- that matter happen inside a single Postgres transaction with explicit
-- row locks, never as separate check-then-write calls from the app layer.
--
-- record_payment_slip(): called once per slip upload. Locks the order +
-- payment, re-validates eligibility, deactivates any previous slip,
-- inserts the new one. The global unique index on payment_slips.file_hash
-- (0001) is the actual duplicate-image defense; this function just turns
-- a caught unique_violation into a clean 'duplicate_slip' outcome instead
-- of a raw Postgres error reaching the customer.
--
-- finalize_payment_verification(): called once per verification attempt
-- (immediately after OCR/decision-engine analysis in Phase 4A — no async
-- queue yet). Re-locks order + payment, re-validates eligibility AND the
-- exact amount (defense in depth — never trusts the caller's outcome for
-- the one check that matters most), atomically claims the transaction
-- reference (global uniqueness enforced by the partial unique index from
-- 0001), and — only on a genuine 'verified' outcome — converts every
-- active reservation for the order to 'converted' and moves
-- fulfillment_status to 'paid' in the SAME transaction. This is the fix
-- for the exact failure mode called out in this phase's brief: there
-- must never be a moment where payment_status = 'verified' while a
-- reservation for that order is still 'active'.

-- ─────────────────────────────────────────────────────────────────────────
-- Widen payment_verification_attempts.result_status to allow 'expired' —
-- a legitimate outcome when an order's reservation lapses between slip
-- upload and verification completing (§18: eligibility is re-checked at
-- verification time, not just upload time).
-- ─────────────────────────────────────────────────────────────────────────

alter table payment_verification_attempts
  drop constraint if exists payment_verification_attempts_result_status_check;
alter table payment_verification_attempts
  add constraint payment_verification_attempts_result_status_check
  check (result_status in ('verified', 'needs_review', 'rejected', 'duplicate_slip', 'expired'));

-- ─────────────────────────────────────────────────────────────────────────
-- record_payment_slip
-- ─────────────────────────────────────────────────────────────────────────

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

  -- Self-heal: if the reservation window has already passed but the
  -- automatic sweep (0007) hasn't run yet, don't accept a stale upload —
  -- flip the order to 'expired' right now instead.
  if v_order.payment_status = 'awaiting_payment'
     and v_order.reservation_expires_at is not null
     and v_order.reservation_expires_at <= now() then
    update orders set payment_status = 'expired' where id = p_order_id;
    update payments set payment_status = 'expired' where order_id = p_order_id;
    raise exception 'Payment window has expired' using errcode = 'CM103';
  end if;

  if v_order.payment_status not in ('awaiting_payment', 'slip_uploaded', 'needs_review', 'rejected', 'duplicate_slip') then
    raise exception 'Order is not eligible for a payment slip upload' using errcode = 'CM102';
  end if;

  select id into v_payment from payments where order_id = p_order_id for update;
  if not found then
    raise exception 'Payment record not found' using errcode = 'CM104';
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

revoke all on function record_payment_slip(uuid, text, text, text, integer) from public;
grant execute on function record_payment_slip(uuid, text, text, text, integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- finalize_payment_verification
-- ─────────────────────────────────────────────────────────────────────────

create or replace function finalize_payment_verification(
  p_order_id uuid,
  p_slip_id uuid,
  p_outcome text,
  p_detected_amount_satang integer,
  p_transaction_reference text,
  p_sender_name text,
  p_sender_account text,
  p_receiver_name text,
  p_receiver_account text,
  p_bank_name text,
  p_transferred_at timestamptz,
  p_ocr_provider text,
  p_ocr_confidence numeric,
  p_ocr_result jsonb,
  p_check_amount_match boolean,
  p_check_receiver_match boolean,
  p_check_timestamp_ok boolean,
  p_notes text
)
returns jsonb
language plpgsql
as $$
declare
  v_order record;
  v_payment record;
  v_final_outcome text := p_outcome;
  v_duplicate boolean := false;
begin
  select id, payment_status, fulfillment_status, reservation_expires_at, order_number
    into v_order
  from orders where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode = 'CM101';
  end if;

  select id, payment_status, expected_amount_satang
    into v_payment
  from payments where order_id = p_order_id
  for update;

  if not found then
    raise exception 'Payment record not found' using errcode = 'CM104';
  end if;

  -- Idempotent: an already-final payment_status is never reprocessed.
  -- Calling this twice for the same already-verified payment must not
  -- double-convert reservations or duplicate history.
  if v_payment.payment_status in ('verified', 'rejected', 'duplicate_slip', 'expired') then
    return jsonb_build_object(
      'outcome', v_payment.payment_status,
      'orderNumber', v_order.order_number,
      'alreadyFinal', true
    );
  end if;

  -- Eligibility re-check at VERIFICATION time, not just upload time
  -- (§18) — a slip can be uploaded seconds before the deadline and still
  -- be mid-flight when it passes.
  if v_order.reservation_expires_at is not null and v_order.reservation_expires_at <= now() then
    v_final_outcome := 'expired';
  end if;

  -- Defense in depth: the exact-amount check is cheap integer equality,
  -- so re-verify it here independently rather than trusting the caller's
  -- outcome alone for the one check that matters most.
  if v_final_outcome = 'verified'
     and (p_detected_amount_satang is null or p_detected_amount_satang <> v_payment.expected_amount_satang) then
    v_final_outcome := 'needs_review';
  end if;

  -- Atomically claim the transaction reference. The partial unique index
  -- from 0001 is what actually enforces "one bank transfer, one order" —
  -- a concurrent claim by a different order raises unique_violation here,
  -- which downgrades THIS attempt to duplicate_slip rather than erroring.
  if p_transaction_reference is not null and length(trim(p_transaction_reference)) > 0 then
    begin
      update payments set transaction_reference = p_transaction_reference where id = v_payment.id;
    exception when unique_violation then
      v_final_outcome := 'duplicate_slip';
      v_duplicate := true;
    end;
  end if;

  update payments set
    detected_amount_satang = p_detected_amount_satang,
    sender_name = p_sender_name,
    sender_account = p_sender_account,
    receiver_name = p_receiver_name,
    receiver_account = p_receiver_account,
    bank_name = p_bank_name,
    transferred_at = p_transferred_at,
    ocr_provider = p_ocr_provider,
    ocr_confidence = p_ocr_confidence,
    ocr_result = p_ocr_result,
    payment_status = v_final_outcome,
    verified_at = case when v_final_outcome = 'verified' then now() else verified_at end
  where id = v_payment.id;

  update orders set payment_status = v_final_outcome where id = p_order_id;

  if v_final_outcome = 'verified' then
    -- The critical atomic step this phase exists for: reservation
    -- conversion happens in the SAME transaction as marking the payment
    -- verified. Either both commit or neither does.
    update inventory_reservations
    set status = 'converted'
    where order_id = p_order_id and status = 'active';

    if v_order.fulfillment_status = 'pending_payment' then
      update orders set fulfillment_status = 'paid' where id = p_order_id;
      insert into order_status_history (order_id, field, previous_value, new_value, note)
      values (p_order_id, 'fulfillment_status', 'pending_payment', 'paid', 'Payment verified; reservations converted');
    end if;

    insert into order_status_history (order_id, field, previous_value, new_value, note)
    values (p_order_id, 'payment_status', v_payment.payment_status, 'verified', coalesce(p_notes, 'Payment verified'));
  else
    insert into order_status_history (order_id, field, previous_value, new_value, note)
    values (p_order_id, 'payment_status', v_payment.payment_status, v_final_outcome,
            coalesce(p_notes, 'Verification attempt result: ' || v_final_outcome));
  end if;

  insert into payment_verification_attempts (
    payment_id, slip_id, check_amount_match, check_receiver_match, check_timestamp_ok,
    check_duplicate_found, ocr_confidence, result_status, notes
  ) values (
    v_payment.id, p_slip_id, p_check_amount_match, p_check_receiver_match, p_check_timestamp_ok,
    v_duplicate, p_ocr_confidence, v_final_outcome, p_notes
  );

  return jsonb_build_object(
    'outcome', v_final_outcome,
    'orderNumber', v_order.order_number,
    'alreadyFinal', false
  );
end;
$$;

revoke all on function finalize_payment_verification(
  uuid, uuid, text, integer, text, text, text, text, text, text, timestamptz,
  text, numeric, jsonb, boolean, boolean, boolean, text
) from public;
grant execute on function finalize_payment_verification(
  uuid, uuid, text, integer, text, text, text, text, text, text, timestamptz,
  text, numeric, jsonb, boolean, boolean, boolean, text
) to service_role;
