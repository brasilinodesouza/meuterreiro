-- Execute depois de 001_initial.sql. Registros financeiros são criados por funções atômicas.
begin;
alter table public.mediuns add constraint mediuns_id_house unique(id, terreiro_id);
create table public.mensalidades (
 id uuid primary key default gen_random_uuid(), terreiro_id uuid not null references public.terreiros(id),
 medium_id uuid not null, reference date not null check(extract(day from reference)=1), due_on date not null,
 amount_cents integer not null check(amount_cents between 0 and 1000000000),
 status text not null check(status in ('pendente','pago','isento')), paid_on date,
 created_at timestamptz not null default now(), unique(id,terreiro_id), unique(terreiro_id,medium_id,reference),
 foreign key(medium_id,terreiro_id) references public.mediuns(id,terreiro_id),
 check((status='isento' and amount_cents=0 and paid_on is null) or (status='pendente' and amount_cents>0 and paid_on is null) or (status='pago' and amount_cents>0 and paid_on is not null))
);
create table public.lembretes (
 id uuid primary key default gen_random_uuid(), terreiro_id uuid not null references public.terreiros(id),
 description text not null check(char_length(trim(description)) between 2 and 160),
 category text not null check(category in ('Velas e artigos','Limpeza','Alimentação','Contas da casa','Reparos','Outros')),
 due_on date, completed_at timestamptz, request_id uuid not null,
 created_at timestamptz not null default now(), unique(id,terreiro_id), unique(terreiro_id,request_id)
);
create table public.gastos (
 id uuid primary key default gen_random_uuid(), terreiro_id uuid not null references public.terreiros(id),
 description text not null check(char_length(trim(description)) between 2 and 160),
 category text not null check(category in ('Velas e artigos','Limpeza','Alimentação','Contas da casa','Reparos','Outros')),
 amount_cents integer not null check(amount_cents between 1 and 1000000000), spent_on date not null,
 reminder_id uuid unique, request_id uuid not null, created_at timestamptz not null default now(),
 unique(id,terreiro_id), unique(terreiro_id,request_id),
 foreign key(reminder_id,terreiro_id) references public.lembretes(id,terreiro_id)
);
create table public.caixa (
 id uuid primary key default gen_random_uuid(), terreiro_id uuid not null references public.terreiros(id),
 description text not null check(char_length(trim(description)) between 2 and 200), category text not null check(char_length(category) between 2 and 80),
 amount_cents integer not null check(amount_cents between 1 and 1000000000), occurred_on date not null,
 kind text not null check(kind in ('entrada','saida')), due_id uuid unique, expense_id uuid unique, request_id uuid,
 created_at timestamptz not null default now(), unique(terreiro_id,request_id),
 foreign key(due_id,terreiro_id) references public.mensalidades(id,terreiro_id),
 foreign key(expense_id,terreiro_id) references public.gastos(id,terreiro_id),
 check((kind='saida' and expense_id is not null and due_id is null and request_id is null) or
       (kind='entrada' and expense_id is null and ((due_id is not null and request_id is null) or (due_id is null and request_id is not null))))
);
create index caixa_house_date on public.caixa(terreiro_id,occurred_on);
create index gastos_house_date on public.gastos(terreiro_id,spent_on);
create index lembretes_house on public.lembretes(terreiro_id);
alter table public.mensalidades enable row level security;
alter table public.gastos enable row level security;
alter table public.caixa enable row level security;
alter table public.lembretes enable row level security;
revoke all on public.mensalidades,public.gastos,public.caixa,public.lembretes from anon,authenticated;
grant select on public.mensalidades,public.gastos,public.caixa,public.lembretes to authenticated;
create policy "owner reads dues" on public.mensalidades for select to authenticated using(exists(select 1 from public.terreiros t where t.id=terreiro_id and t.owner_id=(select auth.uid())));
create policy "owner reads expenses" on public.gastos for select to authenticated using(exists(select 1 from public.terreiros t where t.id=terreiro_id and t.owner_id=(select auth.uid())));
create policy "owner reads ledger" on public.caixa for select to authenticated using(exists(select 1 from public.terreiros t where t.id=terreiro_id and t.owner_id=(select auth.uid())));
create policy "owner reads reminders" on public.lembretes for select to authenticated using(exists(select 1 from public.terreiros t where t.id=terreiro_id and t.owner_id=(select auth.uid())));

create function public._finance_lock_house(p_house uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.terreiros where id=p_house and owner_id=auth.uid() for update;
 if not found then raise exception 'Casa não autorizada'; end if;
end $$;

create function public.finance_create_dues(p_house uuid,p_medium_ids uuid[],p_reference date,p_due_on date,p_amount integer,p_exempt boolean default false)
returns integer language plpgsql security definer set search_path='' as $$
declare count_created integer;
begin
 perform public._finance_lock_house(p_house);
 if p_medium_ids is null or cardinality(p_medium_ids)=0 or p_reference is null or p_due_on is null or p_amount is null or p_exempt is null then raise exception 'Dados obrigatórios'; end if;
 if exists(select 1 from unnest(p_medium_ids) m where m is null or not exists(select 1 from public.mediuns where id=m and terreiro_id=p_house)) then raise exception 'Médium não pertence à casa'; end if;
 insert into public.mensalidades(terreiro_id,medium_id,reference,due_on,amount_cents,status)
 select p_house,m,p_reference,p_due_on,case when p_exempt then 0 else p_amount end,case when p_exempt then 'isento' else 'pendente' end from (select distinct unnest(p_medium_ids) m) people
 on conflict(terreiro_id,medium_id,reference) do nothing;
 get diagnostics count_created = row_count; return count_created;
end $$;

create function public.finance_pay_due(p_due uuid,p_paid_on date) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.mensalidades%rowtype; entry_id uuid;
begin
 select * into d from public.mensalidades where id=p_due;
 if not found then raise exception 'Mensalidade não encontrada'; end if;
 perform public._finance_lock_house(d.terreiro_id);
 select * into d from public.mensalidades where id=p_due for update;
 if d.status='isento' then raise exception 'Mensalidade isenta'; end if;
 if d.status='pago' then select id into entry_id from public.caixa where due_id=d.id; return entry_id; end if;
 if p_paid_on is null then raise exception 'Informe a data'; end if;
 update public.mensalidades set status='pago',paid_on=p_paid_on where id=d.id;
 insert into public.caixa(terreiro_id,description,category,amount_cents,occurred_on,kind,due_id)
 values(d.terreiro_id,'Mensalidade · '||to_char(d.reference,'MM/YYYY'),'Mensalidade',d.amount_cents,p_paid_on,'entrada',d.id) returning id into entry_id;
 return entry_id;
end $$;

create function public.finance_create_reminder(p_house uuid,p_description text,p_category text,p_due_on date,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
 perform public._finance_lock_house(p_house);
 select id into result_id from public.lembretes where terreiro_id=p_house and request_id=p_request;
 if found then return result_id; end if;
 insert into public.lembretes(terreiro_id,description,category,due_on,request_id) values(p_house,trim(p_description),p_category,p_due_on,p_request) returning id into result_id;
 return result_id;
end $$;

create function public.finance_create_expense(p_house uuid,p_description text,p_category text,p_amount integer,p_spent_on date,p_reminder uuid,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid; r public.lembretes%rowtype;
begin
 perform public._finance_lock_house(p_house);
 select id into result_id from public.gastos where terreiro_id=p_house and request_id=p_request;
 if found then return result_id; end if;
 if p_reminder is not null then
   select * into r from public.lembretes where id=p_reminder and terreiro_id=p_house for update;
   if not found then raise exception 'Lembrete não pertence à casa'; end if;
   if r.completed_at is not null then select id into result_id from public.gastos where reminder_id=r.id; return result_id; end if;
   p_description := r.description; p_category := r.category;
 end if;
 insert into public.gastos(terreiro_id,description,category,amount_cents,spent_on,reminder_id,request_id)
 values(p_house,trim(p_description),p_category,p_amount,p_spent_on,p_reminder,p_request) returning id into result_id;
 insert into public.caixa(terreiro_id,description,category,amount_cents,occurred_on,kind,expense_id)
 values(p_house,trim(p_description),p_category,p_amount,p_spent_on,'saida',result_id);
 if p_reminder is not null then update public.lembretes set completed_at=now() where id=p_reminder; end if;
 return result_id;
end $$;

create function public.finance_create_income(p_house uuid,p_description text,p_category text,p_amount integer,p_occurred_on date,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
 perform public._finance_lock_house(p_house);
 select id into result_id from public.caixa where terreiro_id=p_house and request_id=p_request;
 if found then return result_id; end if;
 if p_category not in ('Doação','Saldo inicial','Evento','Outras entradas') then raise exception 'Categoria inválida'; end if;
 insert into public.caixa(terreiro_id,description,category,amount_cents,occurred_on,kind,request_id)
 values(p_house,trim(p_description),p_category,p_amount,p_occurred_on,'entrada',p_request) returning id into result_id;
 return result_id;
end $$;
revoke all on function public._finance_lock_house(uuid) from public,anon,authenticated;
revoke all on function public.finance_create_dues(uuid,uuid[],date,date,integer,boolean),public.finance_pay_due(uuid,date),public.finance_create_reminder(uuid,text,text,date,uuid),public.finance_create_expense(uuid,text,text,integer,date,uuid,uuid),public.finance_create_income(uuid,text,text,integer,date,uuid) from public,anon,authenticated;
grant execute on function public.finance_create_dues(uuid,uuid[],date,date,integer,boolean),public.finance_pay_due(uuid,date),public.finance_create_reminder(uuid,text,text,date,uuid),public.finance_create_expense(uuid,text,text,integer,date,uuid,uuid),public.finance_create_income(uuid,text,text,integer,date,uuid) to authenticated;
commit;
