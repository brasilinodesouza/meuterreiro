-- Depois de 004: simplifica o cadastro sem apagar informações antigas e habilita a importação atômica.
begin;
alter table public.mediuns alter column role set default 'Médium';
alter table public.mediuns alter column joined_on drop not null;

create function public.finance_import_dues(p_house uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 item jsonb; person_id uuid; matches integer; normalized_name text; seen text[] := '{}'; row_key text;
 ref date; due_date date; paid_date date; amount integer; state text; due public.mensalidades%rowtype;
 imported integer := 0; skipped integer := 0; payments integer := 0;
begin
 perform public._finance_lock_house(p_house);
 if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Informe as mensalidades do relatório'; end if;
 if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 2000 then raise exception 'Informe entre 1 e 2000 mensalidades'; end if;
 for item in select value from jsonb_array_elements(p_rows) loop
   if jsonb_typeof(item) <> 'object' or jsonb_typeof(item->'name') is distinct from 'string'
     or char_length(trim(item->>'name')) not between 3 and 120 then raise exception 'Nome inválido no relatório'; end if;
   normalized_name := lower(regexp_replace(trim(item->>'name'),'\s+',' ','g'));
   if coalesce(item->>'reference','') !~ '^\d{4}-\d{2}-01$' or coalesce(item->>'due_on','') !~ '^\d{4}-\d{2}-\d{2}$'
     or jsonb_typeof(item->'amount_cents') is distinct from 'number' or coalesce(item->>'amount_cents','') !~ '^\d+$'
     or coalesce(item->>'status','') not in ('pago','pendente') then raise exception 'Dados inválidos para %',item->>'name'; end if;
   ref := (item->>'reference')::date; due_date := (item->>'due_on')::date;
   amount := (item->>'amount_cents')::integer; state := item->>'status';
   if amount not between 1 and 1000000000 or due_date <> ref + 9 then raise exception 'Confira o valor e o vencimento de %',item->>'name'; end if;
   if state = 'pago' then
     if coalesce(item->>'paid_on','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Informe a data de pagamento de %',item->>'name'; end if;
     paid_date := (item->>'paid_on')::date;
   else
     if not (item ? 'paid_on') or jsonb_typeof(item->'paid_on') is distinct from 'null' then raise exception 'Mensalidade pendente não tem data de pagamento'; end if;
     paid_date := null;
   end if;
   row_key := normalized_name || '|' || ref::text;
   if row_key = any(seen) then raise exception 'Nome e mês repetidos no relatório: %',item->>'name'; end if;
   seen := array_append(seen,row_key);
   select count(*) into matches from public.mediuns where terreiro_id=p_house and lower(regexp_replace(trim(name),'\s+',' ','g'))=normalized_name;
   if matches <> 1 then raise exception 'O nome % precisa corresponder a um único médium da casa',item->>'name'; end if;
   select id into person_id from public.mediuns where terreiro_id=p_house and lower(regexp_replace(trim(name),'\s+',' ','g'))=normalized_name for share;
   select * into due from public.mensalidades where terreiro_id=p_house and medium_id=person_id and reference=ref for update;
   if found then
     if due.amount_cents <> amount or due.status <> state or due.paid_on is distinct from paid_date then raise exception 'Mensalidade já cadastrada com dados diferentes: % (%)',item->>'name',to_char(ref,'MM/YYYY'); end if;
     skipped := skipped + 1;
     continue;
   end if;
   insert into public.mensalidades(terreiro_id,medium_id,reference,due_on,amount_cents,status)
   values(p_house,person_id,ref,due_date,amount,'pendente') returning * into due;
   if state='pago' then perform public.finance_pay_due(due.id,paid_date); payments := payments + 1; end if;
   imported := imported + 1;
 end loop;
 return jsonb_build_object('imported',imported,'skipped',skipped,'payments',payments);
end $$;
revoke all on function public.finance_import_dues(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finance_import_dues(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
