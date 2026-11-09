begin;
create table public.gasto_categorias (
  terreiro_id uuid not null references public.terreiros(id),
  name text not null check (name = trim(name) and char_length(name) between 2 and 80),
  created_at timestamptz not null default now(),
  primary key(terreiro_id, name)
);
create unique index gasto_categorias_house_name on public.gasto_categorias(terreiro_id, lower(name));
alter table public.gasto_categorias enable row level security;
revoke all on public.gasto_categorias from public, anon, authenticated;
grant select, insert on public.gasto_categorias to authenticated;
create policy "administrators read expense categories" on public.gasto_categorias for select to authenticated
  using (terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')));
create policy "administrators create expense categories" on public.gasto_categorias for insert to authenticated
  with check (terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')));
alter table public.gastos drop constraint gastos_category_check;
alter table public.gastos add constraint gastos_category_check check (category = trim(category) and char_length(category) between 2 and 80);
alter table public.lembretes drop constraint lembretes_category_check;
alter table public.lembretes add constraint lembretes_category_check check (category = trim(category) and char_length(category) between 2 and 80);
insert into public.gasto_categorias(terreiro_id,name)
select distinct on (terreiro_id,lower(category)) terreiro_id,category from (
 select terreiro_id,category from public.gastos union select terreiro_id,category from public.lembretes
) existing order by terreiro_id,lower(category),category on conflict do nothing;
commit;
