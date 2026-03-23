begin;

create table if not exists public.password_setup_tokens (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  used_at timestamptz
);

create table if not exists public.email_verification_tokens (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  used_at timestamptz
);

create index if not exists password_setup_tokens_user_id_idx
  on public.password_setup_tokens (user_id, used_at, expires_at desc);

create index if not exists email_verification_tokens_user_id_idx
  on public.email_verification_tokens (user_id, used_at, expires_at desc);

alter table public.password_setup_tokens enable row level security;
alter table public.email_verification_tokens enable row level security;

commit;
