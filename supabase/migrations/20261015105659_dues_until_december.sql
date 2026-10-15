begin;

-- Uma única chamada mantém todos os meses na mesma transação.
-- A função mensal existente verifica o acesso, trava a casa e ignora duplicatas.
create function public.finance_create_dues_until_december(
  p_house uuid, p_medium_ids uuid[], p_reference date, p_due_on date,
  p_amount integer, p_exempt boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  due_year integer;
  due_month integer;
  original_day integer;
  month_reference date;
  month_due date;
  created_count integer := 0;
  people_count integer;
begin
  if p_reference is null or p_due_on is null or p_medium_ids is null
    or cardinality(p_medium_ids) = 0 or p_amount is null or p_exempt is null
    then raise exception 'Informe os médiuns, o mês inicial, o vencimento e o valor.'; end if;
  due_year := extract(year from p_reference)::integer;
  if due_year not between 1 and 9999 or extract(day from p_reference) <> 1
    or date_trunc('month', p_reference) <> date_trunc('month', p_due_on)
    then raise exception 'O primeiro vencimento deve estar no mês inicial da geração.'; end if;
  if not p_exempt and p_amount not between 1 and 1000000000
    then raise exception 'Informe um valor de mensalidade válido.'; end if;
  original_day := extract(day from p_due_on)::integer;
  select count(distinct person)::integer into people_count from unnest(p_medium_ids) person;
  for due_month in extract(month from p_reference)::integer..12 loop
    month_reference := make_date(due_year, due_month, 1);
    month_due := month_reference + (least(original_day,
      extract(day from month_reference + interval '1 month - 1 day')::integer) - 1);
    created_count := created_count + public.finance_create_dues(
      p_house, p_medium_ids, month_reference, month_due, p_amount, p_exempt);
  end loop;
  return jsonb_build_object('created', created_count,
    'skipped', people_count * (13 - extract(month from p_reference)::integer) - created_count);
end;
$$;

revoke all on function public.finance_create_dues_until_december(uuid,uuid[],date,date,integer,boolean) from public, anon;
grant execute on function public.finance_create_dues_until_december(uuid,uuid[],date,date,integer,boolean) to authenticated;

commit;
