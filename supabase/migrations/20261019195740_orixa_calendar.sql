begin;

create table public.orixa_calendar (
 id uuid primary key default gen_random_uuid(),
 terreiro_id uuid not null references public.terreiros(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 80),
 month integer not null check (month between 1 and 12),
 day integer not null check (day between 1 and extract(day from (make_date(2000,month,1) + interval '1 month - 1 day'))),
 created_at timestamptz not null default now()
);
create unique index orixa_calendar_house_date_name on public.orixa_calendar(terreiro_id,month,day,lower(btrim(name)));
alter table public.orixa_calendar enable row level security;
revoke all on public.orixa_calendar from public,anon,authenticated;
grant select,delete on public.orixa_calendar to authenticated;
grant insert(terreiro_id,name,month,day) on public.orixa_calendar to authenticated;
grant update(name,month,day) on public.orixa_calendar to authenticated;
grant all on public.orixa_calendar to service_role;

create policy calendar_read on public.orixa_calendar for select to authenticated using (
 terreiro_id in (select house_id from private_memberships.house_access())
);
create policy calendar_insert on public.orixa_calendar for insert to authenticated with check (
 terreiro_id in (select house_id from private_memberships.house_access() where access_role = 'administrador')
);
create policy calendar_update on public.orixa_calendar for update to authenticated using (
 terreiro_id in (select house_id from private_memberships.house_access() where access_role = 'administrador')
) with check (
 terreiro_id in (select house_id from private_memberships.house_access() where access_role = 'administrador')
);
create policy calendar_delete on public.orixa_calendar for delete to authenticated using (
 terreiro_id in (select house_id from private_memberships.house_access() where access_role = 'administrador')
);

-- As sete datas informadas pela casa; não representam uma padronização de tradições.
insert into public.orixa_calendar(terreiro_id,name,month,day)
select t.id,d.name,d.month,d.day from public.terreiros t cross join (values
 ('Oxóssi',1,20),('Yemanjá',2,2),('Ogum',4,23),('Xangô',9,30),
 ('Yansã',12,4),('Oxum',12,8),('Oxalá',12,25)
) as d(name,month,day);

create schema private_calendar;
revoke all on schema private_calendar from public,anon,authenticated;
-- O trigger só insere datas fixas na casa que acabou de ser criada.
create function private_calendar.seed_new_house()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.orixa_calendar(terreiro_id,name,month,day) values
 (new.id,'Oxóssi',1,20),(new.id,'Yemanjá',2,2),(new.id,'Ogum',4,23),
 (new.id,'Xangô',9,30),(new.id,'Yansã',12,4),(new.id,'Oxum',12,8),(new.id,'Oxalá',12,25);
 return new;
end $$;
revoke all on function private_calendar.seed_new_house() from public,anon,authenticated,service_role;
create trigger seed_orixa_calendar after insert on public.terreiros for each row execute function private_calendar.seed_new_house();

commit;
