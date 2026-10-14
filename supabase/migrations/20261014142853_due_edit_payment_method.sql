begin;

alter table public.mensalidades add column payment_method text
  check(payment_method in ('pix','dinheiro'));
alter table public.mensalidades add constraint mensalidades_payment_status
  check(status='pago' or payment_method is null);

create function private_memberships.due_snapshot(d public.mensalidades) returns jsonb
language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('medium_id',d.medium_id,'reference',d.reference,'due_on',d.due_on,
    'amount_cents',d.amount_cents,'status',d.status,'paid_on',d.paid_on,'payment_method',d.payment_method);
$$;
revoke all on function private_memberships.due_snapshot(public.mensalidades) from public,anon,authenticated;

-- A casa é bloqueada antes da mensalidade, como nas demais operações financeiras.
create function private_memberships.lock_due(p_due uuid,p_owner_only boolean,p_expected jsonb default null)
returns public.mensalidades language plpgsql security definer set search_path='' as $$
declare d public.mensalidades;
begin
  select * into d from public.mensalidades where id=p_due;
  if not found then raise exception 'Mensalidade não encontrada. Atualize a lista.'; end if;
  perform private_memberships.lock_house(d.terreiro_id,p_owner_only);
  select * into d from public.mensalidades where id=p_due for update;
  if not found then raise exception 'Mensalidade não encontrada. Atualize a lista.'; end if;
  if p_owner_only and private_memberships.due_snapshot(d) is distinct from p_expected
    then raise exception 'Esta mensalidade foi alterada. Atualize a lista antes de continuar.'; end if;
  return d;
end $$;
revoke all on function private_memberships.lock_due(uuid,boolean,jsonb) from public,anon,authenticated;

create function private_memberships.pay_due_with_method(p_due uuid,p_paid_on date,p_payment_method text)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.mensalidades; entry_id uuid;
begin
  d := private_memberships.lock_due(p_due,false);
  if p_payment_method is null or p_payment_method not in ('pix','dinheiro')
    then raise exception 'Escolha Pix ou Dinheiro.'; end if;
  -- Mantém data e forma originais quando uma confirmação é repetida.
  if d.status='pago' then
    select id into entry_id from public.caixa where due_id=d.id;
    return entry_id;
  end if;
  entry_id := public.finance_pay_due(p_due,p_paid_on);
  update public.mensalidades set payment_method=p_payment_method where id=p_due;
  return entry_id;
end $$;

create function private_memberships.update_due(p_due uuid,p_medium uuid,p_reference date,p_due_on date,
  p_amount integer,p_status text,p_paid_on date,p_payment_method text,p_expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare d public.mensalidades;
begin
  d := private_memberships.lock_due(p_due,true,p_expected);
  if p_medium is null or not exists(select 1 from public.mediuns where id=p_medium and terreiro_id=d.terreiro_id)
    then raise exception 'Escolha um médium deste terreiro.'; end if;
  if p_reference is null or extract(day from p_reference)<>1 or p_due_on is null
    then raise exception 'Confira a referência e o vencimento.'; end if;
  if p_status is null or p_status not in ('pendente','pago','isento') or p_amount is null
    or (p_status='isento' and p_amount<>0) or (p_status<>'isento' and p_amount not between 1 and 1000000000)
    then raise exception 'Confira a situação e o valor da mensalidade.'; end if;
  if (p_status='pago' and (p_paid_on is null or p_payment_method is null or p_payment_method not in ('pix','dinheiro')))
    or (p_status<>'pago' and (p_paid_on is not null or p_payment_method is not null))
    then raise exception 'Confira a data e a forma de pagamento.'; end if;

  update public.mensalidades set medium_id=p_medium,reference=p_reference,due_on=p_due_on,
    amount_cents=p_amount,status=p_status,paid_on=p_paid_on,payment_method=p_payment_method where id=d.id;
  if p_status='pago' then
    insert into public.caixa(terreiro_id,description,category,amount_cents,occurred_on,kind,due_id)
    values(d.terreiro_id,'Mensalidade · '||to_char(p_reference,'MM/YYYY'),'Mensalidade',p_amount,p_paid_on,'entrada',d.id)
    on conflict(due_id) do update set description=excluded.description,amount_cents=excluded.amount_cents,occurred_on=excluded.occurred_on;
  else
    delete from public.caixa where due_id=d.id and terreiro_id=d.terreiro_id;
  end if;
exception when unique_violation then
  raise exception 'Já existe uma mensalidade para este médium e mês. Nenhum dado foi alterado.';
end $$;

create function private_memberships.delete_due(p_due uuid,p_expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare d public.mensalidades;
begin
  d := private_memberships.lock_due(p_due,true,p_expected);
  delete from public.caixa where due_id=d.id and terreiro_id=d.terreiro_id;
  delete from public.mensalidades where id=d.id;
end $$;

revoke all on function private_memberships.pay_due_with_method(uuid,date,text),
  private_memberships.update_due(uuid,uuid,date,date,integer,text,date,text,jsonb),
  private_memberships.delete_due(uuid,jsonb) from public,anon,authenticated;
grant execute on function private_memberships.pay_due_with_method(uuid,date,text),
  private_memberships.update_due(uuid,uuid,date,date,integer,text,date,text,jsonb),
  private_memberships.delete_due(uuid,jsonb) to authenticated;

create function public.finance_pay_due_with_method(p_due uuid,p_paid_on date,p_payment_method text)
returns uuid language sql security invoker set search_path='' as $$
  select private_memberships.pay_due_with_method(p_due,p_paid_on,p_payment_method);
$$;
create function public.finance_update_due(p_due uuid,p_medium uuid,p_reference date,p_due_on date,
  p_amount integer,p_status text,p_paid_on date,p_payment_method text,p_expected jsonb)
returns void language sql security invoker set search_path='' as $$
  select private_memberships.update_due(p_due,p_medium,p_reference,p_due_on,p_amount,p_status,p_paid_on,p_payment_method,p_expected);
$$;
create function public.finance_delete_due(p_due uuid,p_expected jsonb)
returns void language sql security invoker set search_path='' as $$ select private_memberships.delete_due(p_due,p_expected); $$;
revoke all on function public.finance_pay_due_with_method(uuid,date,text),
  public.finance_update_due(uuid,uuid,date,date,integer,text,date,text,jsonb),public.finance_delete_due(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finance_pay_due_with_method(uuid,date,text),
  public.finance_update_due(uuid,uuid,date,date,integer,text,date,text,jsonb),public.finance_delete_due(uuid,jsonb) to authenticated;

-- Pagamentos antigos e importações de PDF sem forma informada permanecem null.
-- A RPC original continua disponível para esses fluxos e versões anteriores.
notify pgrst,'reload schema';
commit;
