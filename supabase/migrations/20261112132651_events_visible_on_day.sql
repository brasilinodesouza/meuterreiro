begin;

-- A administração mantém acesso antecipado. Os demais médiuns só veem o dia
-- do evento em Brasília, inclusive em consultas diretas à API e às presenças.
drop policy "members read current month events" on public.eventos;
create policy "members read event day" on public.eventos
for select to authenticated using (
  terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel', 'administrador'))
  or (
    terreiro_id in (select house_id from private_memberships.house_access())
    and occurs_on = (now() at time zone 'America/Sao_Paulo')::date
  )
);

commit;
