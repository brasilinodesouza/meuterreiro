begin;

create table public.evento_presencas (
  event_id uuid not null references public.eventos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index evento_presencas_user on public.evento_presencas(user_id);
alter table public.evento_presencas enable row level security;
revoke all on public.evento_presencas from public, anon, authenticated;
grant select, delete on public.evento_presencas to authenticated;
grant insert(event_id, user_id) on public.evento_presencas to authenticated;

-- A consulta ao evento também aplica sua RLS (casa e mês corrente para médiuns).
create policy "members read own confirmation administrators read all" on public.evento_presencas
for select to authenticated using (
  exists (select 1 from public.eventos e where e.id = event_id and (
    user_id = (select auth.uid())
    or e.terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel', 'administrador'))
  ))
);
create policy "members confirm own attendance" on public.evento_presencas
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.eventos e where e.id = event_id and e.occurs_on >= (now() at time zone 'America/Sao_Paulo')::date)
);
create policy "members cancel own attendance" on public.evento_presencas
for delete to authenticated using (
  user_id = (select auth.uid())
  and exists (select 1 from public.eventos e where e.id = event_id and e.occurs_on >= (now() at time zone 'America/Sao_Paulo')::date)
);

-- Reutiliza a consulta administrativa já protegida para resolver os nomes.
-- Não cria uma nova função SECURITY DEFINER nem libera nomes a outros médiuns.
create function public.event_list_attendees(p_event uuid)
returns table(user_id uuid, full_name text, username text, confirmed_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare v_house uuid;
begin
  select e.terreiro_id into v_house from public.eventos e
    where e.id = p_event and e.terreiro_id in (
      select house_id from private_memberships.house_access() where access_role in ('responsavel', 'administrador')
    );
  if auth.uid() is null or v_house is null then
    raise exception 'Somente a administração da casa pode consultar quem confirmou presença.' using errcode = '42501';
  end if;
  return query select c.user_id, u.full_name, u.username, c.confirmed_at
    from public.evento_presencas c
    join public.terreiro_list_users(v_house) u on u.user_id = c.user_id
    where c.event_id = p_event
    order by u.full_name, u.username, c.user_id;
end;
$$;
revoke all on function public.event_list_attendees(uuid) from public, anon;
grant execute on function public.event_list_attendees(uuid) to authenticated;

commit;
