begin;

create schema private_event_notifications;
revoke all on schema private_event_notifications from public,anon,authenticated;
grant usage on schema private_event_notifications to service_role;

-- Os mesmos aparelhos autorizados recebem calendário e eventos, sem novo pedido de permissão.
create table private_event_notifications.deliveries (
 subscription_id uuid not null references public.orixa_push_subscriptions(id) on delete cascade,
 day date not null,
 sent_at timestamptz,
 lease_until timestamptz not null,
 attempts integer not null default 1 check(attempts between 1 and 3),
 primary key(subscription_id,day)
);
alter table private_event_notifications.deliveries enable row level security;
revoke all on private_event_notifications.deliveries from public,anon,authenticated;

-- Reconfere eventos, sessão e vínculo no momento do envio. Nenhum nome fica público.
create function private_event_notifications.current_push(p_id uuid,p_day date,p_now timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 if p_day<>(p_now at time zone 'America/Sao_Paulo')::date
    or extract(hour from p_now at time zone 'America/Sao_Paulo')<>8 then return null; end if;
 select jsonb_build_object('id',s.id,'endpoint',s.endpoint,'p256dh',s.p256dh,'auth_key',s.auth_key,'day',p_day,'names',events.names)
 into result
 from public.orixa_push_subscriptions s
 join lateral (
  select jsonb_agg(e.title || case when e.starts_at is null then '' else ' às ' || to_char(e.starts_at,'HH24:MI') end
   || case when e.location='' then '' else ' · ' || e.location end order by e.starts_at nulls last,e.title,e.id) names
  from public.eventos e join public.terreiros t on t.id=e.terreiro_id
  where e.occurs_on=p_day
   and (t.owner_id=s.user_id or exists(select 1 from public.terreiro_members m where m.terreiro_id=t.id and m.user_id=s.user_id))
 ) events on events.names is not null
 where s.id=p_id and exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id and (a.not_after is null or a.not_after>p_now));
 return result;
end $$;
revoke all on function private_event_notifications.current_push(uuid,date,timestamptz) from public,anon,authenticated;
grant execute on function private_event_notifications.current_push(uuid,date,timestamptz) to service_role;
create function public.current_event_push(p_id uuid,p_day date,p_now timestamptz default now())
returns jsonb language sql security invoker set search_path='' as $$ select private_event_notifications.current_push(p_id,p_day,p_now) $$;
revoke all on function public.current_event_push(uuid,date,timestamptz) from public,anon,authenticated;
grant execute on function public.current_event_push(uuid,date,timestamptz) to service_role;

create function private_event_notifications.claim_push(p_now timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item record; claimed uuid; payload jsonb; result jsonb:='[]'; event_day date:=(p_now at time zone 'America/Sao_Paulo')::date;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 if extract(hour from p_now at time zone 'America/Sao_Paulo')<>8 then return result; end if;
 for item in
  select s.id from public.orixa_push_subscriptions s
  where exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id and (a.not_after is null or a.not_after>p_now))
  and exists(select 1 from public.eventos e join public.terreiros t on t.id=e.terreiro_id
   where e.occurs_on=event_day and (t.owner_id=s.user_id or exists(select 1 from public.terreiro_members m where m.terreiro_id=t.id and m.user_id=s.user_id)))
  and not exists(select 1 from private_event_notifications.deliveries d where d.subscription_id=s.id and d.day=event_day
   and (d.sent_at is not null or d.lease_until>p_now or d.attempts>=3))
  order by s.id limit 50
 loop
  payload:=private_event_notifications.current_push(item.id,event_day,p_now);
  if payload is null then continue; end if;
  claimed:=null;
  insert into private_event_notifications.deliveries(subscription_id,day,lease_until)
  values(item.id,event_day,p_now+interval '2 minutes')
  on conflict(subscription_id,day) do update set lease_until=excluded.lease_until,attempts=private_event_notifications.deliveries.attempts+1
   where private_event_notifications.deliveries.sent_at is null and private_event_notifications.deliveries.lease_until<=p_now and private_event_notifications.deliveries.attempts<3
  returning subscription_id into claimed;
  if claimed is not null then result:=result||jsonb_build_array(payload); end if;
 end loop;
 delete from private_event_notifications.deliveries where day<event_day-35;
 return result;
end $$;
revoke all on function private_event_notifications.claim_push(timestamptz) from public,anon,authenticated;
grant execute on function private_event_notifications.claim_push(timestamptz) to service_role;
create function public.claim_event_push(p_now timestamptz default now())
returns jsonb language sql security invoker set search_path='' as $$ select private_event_notifications.claim_push(p_now) $$;
revoke all on function public.claim_event_push(timestamptz) from public,anon,authenticated;
grant execute on function public.claim_event_push(timestamptz) to service_role;

create function private_event_notifications.finish_push(p_id uuid,p_day date)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 update private_event_notifications.deliveries set sent_at=now() where subscription_id=p_id and day=p_day;
end $$;
revoke all on function private_event_notifications.finish_push(uuid,date) from public,anon,authenticated;
grant execute on function private_event_notifications.finish_push(uuid,date) to service_role;
create function public.finish_event_push(p_id uuid,p_day date)
returns void language sql security invoker set search_path='' as $$ select private_event_notifications.finish_push(p_id,p_day) $$;
revoke all on function public.finish_event_push(uuid,date) from public,anon,authenticated;
grant execute on function public.finish_event_push(uuid,date) to service_role;

commit;
