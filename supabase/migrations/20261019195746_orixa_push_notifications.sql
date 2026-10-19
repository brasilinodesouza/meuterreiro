create schema if not exists private_notifications;
revoke all on schema private_notifications from public, anon, authenticated;

create table public.orixa_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 endpoint text not null unique check (length(endpoint) between 20 and 2048 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^?#[:space:]]+$'),
 p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}=?$'),
 auth_key text not null check (auth_key ~ '^[A-Za-z0-9_-]{22}==?$|^[A-Za-z0-9_-]{22}$'),
 created_at timestamptz not null default now()
);
create index orixa_push_user on public.orixa_push_subscriptions(user_id);
alter table public.orixa_push_subscriptions enable row level security;
revoke all on public.orixa_push_subscriptions from public,anon,authenticated;
grant select, insert, update, delete on public.orixa_push_subscriptions to authenticated;
grant all on public.orixa_push_subscriptions to service_role;
create policy orixa_push_select on public.orixa_push_subscriptions for select to authenticated using ((select auth.uid())=user_id);
create policy orixa_push_insert on public.orixa_push_subscriptions for insert to authenticated with check ((select auth.uid())=user_id and session_id=((select auth.jwt())->>'session_id')::uuid);
create policy orixa_push_update on public.orixa_push_subscriptions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and session_id=((select auth.jwt())->>'session_id')::uuid);
create policy orixa_push_delete on public.orixa_push_subscriptions for delete to authenticated using ((select auth.uid())=user_id);

create function public.register_orixa_push(p_endpoint text,p_p256dh text,p_auth text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare subscription_id uuid;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
 insert into public.orixa_push_subscriptions(user_id,session_id,endpoint,p256dh,auth_key)
 values(auth.uid(),(auth.jwt()->>'session_id')::uuid,p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set session_id=excluded.session_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key
 returning id into subscription_id;
 return subscription_id;
end $$;
revoke all on function public.register_orixa_push(text,text,text) from public,anon;
grant execute on function public.register_orixa_push(text,text,text) to authenticated;

create table private_notifications.orixa_deliveries (
 subscription_id uuid not null references public.orixa_push_subscriptions(id) on delete cascade,
 day date not null, sent_at timestamptz, lease_until timestamptz not null,
 attempts integer not null default 1 check(attempts between 1 and 3),
 primary key(subscription_id,day)
);
alter table private_notifications.orixa_deliveries enable row level security;

-- Reaproveita os aparelhos já autorizados, inclusive dos médiuns sem acesso administrativo.
insert into public.orixa_push_subscriptions(user_id,session_id,endpoint,p256dh,auth_key,created_at)
select distinct on (s.endpoint) s.user_id,s.session_id,s.endpoint,s.p256dh,s.auth_key,s.created_at
from (
 select user_id,session_id,endpoint,p256dh,auth_key,created_at from public.birthday_push_subscriptions
 union all
 select user_id,session_id,endpoint,p256dh,auth_key,created_at from public.dues_push_subscriptions
) s
where exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id and (a.not_after is null or a.not_after>now()))
order by s.endpoint,s.created_at desc;

grant usage on schema private_calendar to service_role;
create function private_calendar.claim_push(p_now timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item record; claimed uuid; result jsonb:='[]'; calendar_day date:=(p_now at time zone 'America/Sao_Paulo')::date;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 if extract(hour from p_now at time zone 'America/Sao_Paulo')<>8 then return result; end if;
 for item in
  select s.id,s.endpoint,s.p256dh,s.auth_key,dates.names
  from public.orixa_push_subscriptions s
  join lateral (
   select jsonb_agg(distinct c.name order by c.name) names from public.orixa_calendar c
   join public.terreiros t on t.id=c.terreiro_id
   where c.month=extract(month from calendar_day) and c.day=extract(day from calendar_day)
   and (t.owner_id=s.user_id or exists(select 1 from public.terreiro_members m where m.terreiro_id=t.id and m.user_id=s.user_id))
  ) dates on dates.names is not null
  where exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id and (a.not_after is null or a.not_after>p_now))
  and not exists(select 1 from private_notifications.orixa_deliveries d where d.subscription_id=s.id and d.day=calendar_day and (d.sent_at is not null or d.lease_until>p_now or d.attempts>=3))
  order by s.id limit 50
 loop
  claimed:=null;
  insert into private_notifications.orixa_deliveries(subscription_id,day,lease_until)
  values(item.id,calendar_day,p_now+interval '2 minutes')
  on conflict(subscription_id,day) do update set lease_until=excluded.lease_until,attempts=private_notifications.orixa_deliveries.attempts+1
   where private_notifications.orixa_deliveries.sent_at is null and private_notifications.orixa_deliveries.lease_until<=p_now and private_notifications.orixa_deliveries.attempts<3
  returning subscription_id into claimed;
  if claimed is not null then result:=result||jsonb_build_array(jsonb_build_object('id',item.id,'endpoint',item.endpoint,'p256dh',item.p256dh,'auth_key',item.auth_key,'names',item.names,'day',calendar_day)); end if;
 end loop;
 delete from private_notifications.orixa_deliveries where day<calendar_day-35;
 return result;
end $$;
revoke all on function private_calendar.claim_push(timestamptz) from public,anon,authenticated;
grant execute on function private_calendar.claim_push(timestamptz) to service_role;
create function public.claim_orixa_push(p_now timestamptz default now())
returns jsonb language sql security invoker set search_path='' as $$ select private_calendar.claim_push(p_now) $$;
revoke all on function public.claim_orixa_push(timestamptz) from public,anon,authenticated;
grant execute on function public.claim_orixa_push(timestamptz) to service_role;

create function private_calendar.finish_push(p_id uuid,p_day date)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 update private_notifications.orixa_deliveries set sent_at=now() where subscription_id=p_id and day=p_day;
end $$;
revoke all on function private_calendar.finish_push(uuid,date) from public,anon,authenticated;
grant execute on function private_calendar.finish_push(uuid,date) to service_role;
create function public.finish_orixa_push(p_id uuid,p_day date)
returns void language sql security invoker set search_path='' as $$ select private_calendar.finish_push(p_id,p_day) $$;
revoke all on function public.finish_orixa_push(uuid,date) from public,anon,authenticated;
grant execute on function public.finish_orixa_push(uuid,date) to service_role;
