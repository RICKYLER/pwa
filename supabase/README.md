# Supabase Setup

## Files

- Baseline migration: [20260321082646_initial_schema.sql](/root/pwa/supabase/migrations/20260321082646_initial_schema.sql)
- Manual SQL copy: [schema.sql](/root/pwa/supabase/schema.sql)
- Verification query: [verify.sql](/root/pwa/supabase/verify.sql)

## If You Already Pasted `schema.sql` In Supabase

Run these in your terminal from the project root:

```bash
npx supabase link --project-ref vtyqiwgesstjalkleiwa
npx supabase migration repair --status applied 20260321082646
```

What this does:

- `link` connects your local repo to your hosted Supabase project.
- `migration repair --status applied 20260321082646` tells Supabase that the baseline migration was already applied manually.
- This is the step that fixes the dashboard showing `No migrations`.

You will be prompted for your database password.

## If Your Remote Database Is Still Empty

Use the migration file instead of pasting SQL manually:

```bash
npx supabase link --project-ref vtyqiwgesstjalkleiwa
npx supabase db push
```

## After That

Create your first Auth user in `Authentication -> Users`, then promote that account to admin:

```sql
update public.users
set role = 'admin',
    barangay_id = 'barangay-1'
where email = 'your-email@example.com';
```

Notes:

- `Success. No rows returned.` is expected after `schema.sql`. The script mainly creates tables, functions, triggers, and policies, so there is nothing to display unless you run a `select`.
- If you want to confirm the schema exists, run [verify.sql](/root/pwa/supabase/verify.sql#L1) next.
- New schema changes should go into new files under `supabase/migrations/`, for example: `npx supabase migration new add_something`.
- `public.users` is the app profile table linked to `auth.users`.
- Passwords are intentionally handled by Supabase Auth, not stored in `public.users`.
- Realtime is enabled in the SQL script by adding the main tables to `supabase_realtime`.
- The SQL script keeps your current app shape: households, residents, vulnerability flags, inventory, distribution, incidents, audit logs, and sync backup history.
