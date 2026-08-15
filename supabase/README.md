# CM502 — Supabase setup

## Apply migrations to a new project

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This runs `migrations/0001_init.sql` → `0002_rls.sql` → `0003_storage.sql` in
order.

## Seed placeholder catalog data

```bash
psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/seed.sql
```

or paste `seed.sql` into the Supabase SQL editor. Everything it inserts
(colors, sizes, placeholder price, bank/PromptPay settings) is meant to be
edited from the admin dashboard once real CM502 details are confirmed.

## Regenerate TypeScript types

```bash
npx supabase gen types typescript --project-id <project-ref> \
  > src/lib/supabase/types.ts
```

Run this after every migration change — `src/lib/supabase/types.ts` starts
as an unchecked placeholder until this has been run at least once.

## First admin user

`admin_users.id` references `auth.users.id`. Create the Supabase Auth user
first (dashboard → Authentication → Users, or `supabase.auth.admin.createUser`),
then insert a matching row:

```sql
insert into admin_users (id, full_name, role)
values ('<auth-user-uuid>', 'Your Name', 'admin');
```
