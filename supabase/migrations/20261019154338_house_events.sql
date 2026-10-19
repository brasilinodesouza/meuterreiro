begin;

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  terreiro_id uuid not null references public.terreiros(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  occurs_on date not null check (occurs_on between date '0001-01-01' and date '9999-12-31'),
  starts_at time check (starts_at < time '24:00' and extract(second from starts_at) = 0),
  location text not null default '' check (char_length(location) <= 200),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now()
);
create index eventos_house_date on public.eventos(terreiro_id, occurs_on, starts_at, id);
alter table public.eventos enable row level security;
revoke all on public.eventos from public, anon, authenticated;
grant select, delete on public.eventos to authenticated;
grant insert(terreiro_id, title, occurs_on, starts_at, location, description) on public.eventos to authenticated;
grant update(title, occurs_on, starts_at, location, description) on public.eventos to authenticated;

-- A administração pode preparar qualquer mês. O médium só consulta os próximos
-- eventos do mês corrente em Brasília, mesmo acessando a API diretamente.
create policy "members read current month events" on public.eventos
for select to authenticated using (
  terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel', 'administrador'))
  or (
    terreiro_id in (select house_id from private_memberships.house_access())
    and occurs_on >= (now() at time zone 'America/Sao_Paulo')::date
    and occurs_on < (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')::date
  )
);
create policy "administrators create events" on public.eventos
for insert to authenticated with check (
  terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel', 'administrador'))
);
create policy "administrators update events" on public.eventos
for update to authenticated using (
  terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel', 'administrador'))
) with check (
  terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel', 'administrador'))
);
create policy "administrators delete events" on public.eventos
for delete to authenticated using (
  terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel', 'administrador'))
);

commit;
