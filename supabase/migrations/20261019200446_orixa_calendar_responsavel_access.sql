begin;

-- Administrador e responsável podem gerenciar as datas da própria casa.
alter policy calendar_insert on public.orixa_calendar with check (
 terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador'))
);
alter policy calendar_update on public.orixa_calendar using (
 terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador'))
) with check (
 terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador'))
);
alter policy calendar_delete on public.orixa_calendar using (
 terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador'))
);

commit;
