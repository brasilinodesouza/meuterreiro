begin;

-- O helper privado mantém gasto, caixa e lembrete na mesma transação.
create function private_memberships.manage_expense(p_expense uuid,p_expected jsonb,p_changes jsonb,p_delete boolean)
returns void language plpgsql security definer set search_path='' as $$
declare e public.gastos; d text; c text; a integer; spent date;
begin
  select * into e from public.gastos where id=p_expense;
  if not found then raise exception 'Gasto não encontrado. Atualize a lista.'; end if;
  perform private_memberships.lock_house(e.terreiro_id,false);
  select * into e from public.gastos where id=p_expense for update;
  if not found then raise exception 'Gasto não encontrado. Atualize a lista.'; end if;
  if jsonb_build_object('description',e.description,'category',e.category,'amount_cents',e.amount_cents,
    'spent_on',e.spent_on,'reminder_id',e.reminder_id) is distinct from p_expected
    then raise exception 'Este gasto foi alterado. Atualize a lista antes de continuar.'; end if;
  if p_delete is true then
    delete from public.caixa where expense_id=e.id and terreiro_id=e.terreiro_id;
    delete from public.gastos where id=e.id;
    if e.reminder_id is not null then
      update public.lembretes set completed_at=null where id=e.reminder_id and terreiro_id=e.terreiro_id;
    end if;
  else
    d := trim(p_changes->>'description'); c := trim(p_changes->>'category');
    a := (p_changes->>'amount_cents')::integer; spent := (p_changes->>'spent_on')::date;
    if d is null or char_length(d) not between 2 and 160 or c is null or char_length(c) not between 2 and 80
      or a is null or a not between 1 and 1000000000 or spent is null
      then raise exception 'Confira a descrição, a categoria, o valor e a data do gasto.'; end if;
    update public.gastos set description=d,category=c,amount_cents=a,spent_on=spent where id=e.id;
    insert into public.caixa(terreiro_id,description,category,amount_cents,occurred_on,kind,expense_id)
      values(e.terreiro_id,d,c,a,spent,'saida',e.id)
      on conflict(expense_id) do update set description=excluded.description,category=excluded.category,
        amount_cents=excluded.amount_cents,occurred_on=excluded.occurred_on;
    if e.reminder_id is not null then
      update public.lembretes set description=d,category=c where id=e.reminder_id and terreiro_id=e.terreiro_id;
    end if;
  end if;
end $$;
revoke all on function private_memberships.manage_expense(uuid,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function private_memberships.manage_expense(uuid,jsonb,jsonb,boolean) to authenticated;

create function public.finance_update_expense(p_expense uuid,p_expected jsonb,p_changes jsonb)
returns void language sql security invoker set search_path='' as $$
  select private_memberships.manage_expense(p_expense,p_expected,p_changes,false);
$$;
create function public.finance_delete_expense(p_expense uuid,p_expected jsonb)
returns void language sql security invoker set search_path='' as $$
  select private_memberships.manage_expense(p_expense,p_expected,null,true);
$$;
revoke all on function public.finance_update_expense(uuid,jsonb,jsonb),public.finance_delete_expense(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finance_update_expense(uuid,jsonb,jsonb),public.finance_delete_expense(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
