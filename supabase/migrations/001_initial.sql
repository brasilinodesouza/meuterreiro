-- Execute uma vez no SQL Editor de um projeto Supabase novo.
begin;
create table public.terreiros (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 3 and 120),
  city text not null check (char_length(trim(city)) between 2 and 80),
  state text not null check (state in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  created_at timestamptz not null default now()
);
create table public.mediuns (
  id uuid primary key default gen_random_uuid(),
  terreiro_id uuid not null references public.terreiros(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 3 and 120),
  phone text not null default '' check (char_length(phone) <= 25),
  email text not null default '' check (char_length(email) <= 320),
  role text not null check (char_length(trim(role)) between 2 and 80),
  status text not null default 'ativo' check (status in ('ativo','afastado','desligado')),
  joined_on date not null,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index mediuns_terreiro_name on public.mediuns(terreiro_id, name);
alter table public.terreiros enable row level security;
alter table public.mediuns enable row level security;
revoke all on public.terreiros, public.mediuns from anon, authenticated;
grant select, insert, update on public.terreiros, public.mediuns to authenticated;
create policy "owner reads house" on public.terreiros for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner creates house" on public.terreiros for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owner updates house" on public.terreiros for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner reads mediums" on public.mediuns for select to authenticated using (exists (select 1 from public.terreiros t where t.id = terreiro_id and t.owner_id = (select auth.uid())));
create policy "owner creates mediums" on public.mediuns for insert to authenticated with check (exists (select 1 from public.terreiros t where t.id = terreiro_id and t.owner_id = (select auth.uid())));
create policy "owner updates mediums" on public.mediuns for update to authenticated using (exists (select 1 from public.terreiros t where t.id = terreiro_id and t.owner_id = (select auth.uid()))) with check (exists (select 1 from public.terreiros t where t.id = terreiro_id and t.owner_id = (select auth.uid())));
commit;
