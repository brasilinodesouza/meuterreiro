begin;
-- Somente o valor é alterado; as demais permissões das mensalidades são preservadas.
create function private_memberships.update_due_amount(p_due uuid,p_amount integer,p_expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare d public.mensalidades;
begin
  d := private_memberships.lock_due(p_due,false);
  if private_memberships.due_snapshot(d) is distinct from p_expected then
    raise exception 'Esta mensalidade foi alterada. Atualize a lista antes de continuar.';
  end if;
  if d.status='isento' then raise exception 'Uma mensalidade isenta deve permanecer com valor zero.'; end if;
  if p_amount is null or p_amount not between 1 and 1000000000 then raise exception 'Informe um valor de mensalidade válido.'; end if;
  update public.mensalidades set amount_cents=p_amount where id=d.id;
  if d.status='pago' then
    insert into public.caixa(terreiro_id,description,category,amount_cents,occurred_on,kind,due_id)
      values(d.terreiro_id,'Mensalidade · '||to_char(d.reference,'MM/YYYY'),'Mensalidade',p_amount,d.paid_on,'entrada',d.id)
      on conflict(due_id) do update set amount_cents=excluded.amount_cents;
  end if;
end $$;
revoke all on function private_memberships.update_due_amount(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function private_memberships.update_due_amount(uuid,integer,jsonb) to authenticated;
create function public.finance_update_due_amount(p_due uuid,p_amount integer,p_expected jsonb)
returns void language sql security invoker set search_path='' as $$
  select private_memberships.update_due_amount(p_due,p_amount,p_expected);
$$;
revoke all on function public.finance_update_due_amount(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.finance_update_due_amount(uuid,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
