-- CM502 — Storage buckets
--
-- payment-slips: PRIVATE. Customers upload via a server Route Handler
-- using the service-role client (never a direct client-side upload), and
-- can only ever view their own slip via a short-lived signed URL issued
-- after tracking_token ownership is verified server-side. Admins view via
-- signed URLs too, through the admin dashboard's server code.
--
-- product-images: PUBLIC read (product photography has no reason to be
-- private), admin-only write.

insert into storage.buckets (id, name, public)
values ('payment-slips', 'payment-slips', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- No anon/authenticated policies are created on storage.objects for
-- payment-slips: every access goes through the service-role client from a
-- server Route Handler, which bypasses RLS by design. This keeps slips
-- unreachable from the browser even with a leaked signed-URL-guessing
-- attempt on the wrong path.

create policy product_images_public_read on storage.objects
  for select using (bucket_id = 'product-images');

create policy product_images_admin_write on storage.objects
  for insert with check (bucket_id = 'product-images' and is_admin());

create policy product_images_admin_update on storage.objects
  for update using (bucket_id = 'product-images' and is_admin())
  with check (bucket_id = 'product-images' and is_admin());

create policy product_images_admin_delete on storage.objects
  for delete using (bucket_id = 'product-images' and is_admin());
