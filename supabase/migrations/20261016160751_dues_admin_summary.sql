begin;

-- Um resumo por aparelho/casa/dia; reutiliza a permissão de avisos de mensalidade.
create table private_notifications.dues_summary_deliveries (
 subscription_id uuid not null references public.dues_push_subscriptions(id) on delete cascade,
 terreiro_id uuid not null references public.terreiros(id) on delete cascade,
 day date not null,
 sent_at timestamptz,
 lease_until timestamptz not null,
 attempts integer not null default 1 check(attempts between 1 and 3),
 primary key(subscription_id,terreiro_id,day)
);
alter table private_notifications.dues_summary_deliveries enable row level security;
revoke all on private_notifications.dues_summary_deliveries from public,anon,authenticated;
grant usage on schema private_notifications to service_role;

create function private_notifications.dues_summary(p_id uuid,p_house uuid,p_day date,p_now timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 if p_day<>(p_now at time zone 'America/Sao_Paulo')::date then return null; end if;
 -- Reconfere perfil, casa, configuração e sessão imediatamente antes do envio.
 if not exists(
  select 1 from public.dues_push_subscriptions s
  join public.terreiros t on t.id=p_house
  join public.dues_notification_settings c on c.terreiro_id=t.id and c.enabled
  join auth.sessions a on a.id=s.session_id and a.user_id=s.user_id and (a.not_after is null or a.not_after>p_now)
  where s.id=p_id and (t.owner_id=s.user_id or exists(
   select 1 from public.terreiro_members m where m.user_id=s.user_id and m.terreiro_id=t.id and m.role='administrador'))
 ) then return null; end if;
 if not exists(select 1 from public.mensalidades d where d.terreiro_id=p_house and d.status='pendente'
  and (d.due_on=p_day or d.due_on+6=p_day)) then return null; end if;
 -- Inclui todos os vencidos e vencendo hoje, mesmo sem conta vinculada ao médium.
 select jsonb_build_object('house_name',(select t.name from public.terreiros t where t.id=p_house),
  'medium_count',count(*),'due_count',sum(g.due_count),'amount_cents',sum(g.amount_cents),
  'names',to_jsonb((array_agg(left(g.name,120) order by g.name,g.medium_id))[1:5])) into result
 from (
  select d.medium_id,m.name,count(*) due_count,sum(d.amount_cents) amount_cents
  from public.mensalidades d join public.mediuns m on m.id=d.medium_id and m.terreiro_id=d.terreiro_id
  where d.terreiro_id=p_house and d.status='pendente' and d.due_on<=p_day
  group by d.medium_id,m.name
 ) g;
 if (result->>'medium_count')::integer=0 then return null; end if;
 return result;
end $$;

create function private_notifications.claim_dues_summaries(p_now timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item record; claimed uuid; result jsonb:='[]'; notification_day date:=(p_now at time zone 'America/Sao_Paulo')::date;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 if extract(hour from p_now at time zone 'America/Sao_Paulo')<>8 then return result; end if;
 for item in
  with managers as (
   select t.owner_id user_id,t.id terreiro_id from public.terreiros t
   union
   select m.user_id,m.terreiro_id from public.terreiro_members m where m.role='administrador'
  )
  select s.id,s.endpoint,s.p256dh,s.auth_key,m.terreiro_id
  from managers m join public.dues_push_subscriptions s on s.user_id=m.user_id
  join public.dues_notification_settings c on c.terreiro_id=m.terreiro_id and c.enabled
  left join private_notifications.dues_summary_deliveries sent on sent.subscription_id=s.id and sent.terreiro_id=m.terreiro_id and sent.day=notification_day
  where (sent.subscription_id is null or (sent.sent_at is null and sent.lease_until<=p_now and sent.attempts<3))
   and exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id and (a.not_after is null or a.not_after>p_now))
   and exists(select 1 from public.mensalidades d where d.terreiro_id=m.terreiro_id and d.status='pendente'
    and (d.due_on=notification_day or d.due_on+6=notification_day))
  order by m.terreiro_id,s.id limit 500
 loop
  claimed:=null;
  insert into private_notifications.dues_summary_deliveries(subscription_id,terreiro_id,day,lease_until)
  values(item.id,item.terreiro_id,notification_day,p_now+interval '2 minutes')
  on conflict(subscription_id,terreiro_id,day) do update set lease_until=excluded.lease_until,attempts=private_notifications.dues_summary_deliveries.attempts+1
   where private_notifications.dues_summary_deliveries.sent_at is null and private_notifications.dues_summary_deliveries.lease_until<=p_now and private_notifications.dues_summary_deliveries.attempts<3
  returning subscription_id into claimed;
  if claimed is not null then result:=result||jsonb_build_array(to_jsonb(item)||jsonb_build_object('day',notification_day)); end if;
 end loop;
 delete from private_notifications.dues_summary_deliveries where day<notification_day-35;
 return result;
end $$;

create function private_notifications.finish_dues_summary(p_id uuid,p_house uuid,p_day date)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 update private_notifications.dues_summary_deliveries set sent_at=now()
 where subscription_id=p_id and terreiro_id=p_house and day=p_day;
end $$;
revoke all on function private_notifications.dues_summary(uuid,uuid,date,timestamptz),private_notifications.claim_dues_summaries(timestamptz),private_notifications.finish_dues_summary(uuid,uuid,date) from public,anon,authenticated;
grant execute on function private_notifications.dues_summary(uuid,uuid,date,timestamptz),private_notifications.claim_dues_summaries(timestamptz),private_notifications.finish_dues_summary(uuid,uuid,date) to service_role;

create function public.claim_dues_summaries(p_now timestamptz default now())
returns jsonb language sql security invoker set search_path='' as $$ select private_notifications.claim_dues_summaries(p_now) $$;
create function public.dues_summary(p_id uuid,p_house uuid,p_day date,p_now timestamptz default now())
returns jsonb language sql security invoker set search_path='' as $$ select private_notifications.dues_summary(p_id,p_house,p_day,p_now) $$;
create function public.finish_dues_summary(p_id uuid,p_house uuid,p_day date)
returns void language sql security invoker set search_path='' as $$ select private_notifications.finish_dues_summary(p_id,p_house,p_day) $$;
revoke all on function public.claim_dues_summaries(timestamptz),public.dues_summary(uuid,uuid,date,timestamptz),public.finish_dues_summary(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.claim_dues_summaries(timestamptz),public.dues_summary(uuid,uuid,date,timestamptz),public.finish_dues_summary(uuid,uuid,date) to service_role;

commit;
