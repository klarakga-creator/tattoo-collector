-- Tattoo Collector: database setup.
-- Paste this whole file into Supabase → SQL Editor → New query, then press Run.

create table if not exists public.tattoos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default '',
  status text not null default 'have' check (status in ('have', 'planned')),
  view text not null check (view in ('front', 'back', 'left', 'right')),
  x real not null,
  y real not null,
  part text not null default '',
  artist text not null default '',
  date date,
  notes text not null default '',
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspirations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  region text not null default 'anywhere',
  image_path text,
  link text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Let signed-in users use the tables (row-level security below still limits them to their own rows).
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tattoos, public.inspirations to authenticated;

-- Only you can see or change your own rows.
alter table public.tattoos enable row level security;
alter table public.inspirations enable row level security;

drop policy if exists "own tattoos" on public.tattoos;
create policy "own tattoos" on public.tattoos for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own inspirations" on public.inspirations;
create policy "own inspirations" on public.inspirations for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Live sync between devices.
do $$ begin
  alter publication supabase_realtime add table public.tattoos;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.inspirations;
exception when duplicate_object then null; end $$;

-- Private photo storage. Each person's photos live in a folder named after their user id.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos read" on storage.objects;
create policy "own photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own photos add" on storage.objects;
create policy "own photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own photos change" on storage.objects;
create policy "own photos change" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own photos delete" on storage.objects;
create policy "own photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
