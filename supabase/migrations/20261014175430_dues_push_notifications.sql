begin;

create table public.dues_notification_settings (
 terreiro_id uuid primary key references public.terreiros(id) on delete cascade,
 enabled boolean not null default false
);
alter table public.dues_notification_settings enable row level security;
revoke all on public.dues_notification_settings from public,anon,authenticated;
grant select on public.dues_notification_settings to authenticated;
grant all on public.dues_notification_settings to service_role;
create policy "members read dues notification settings" on public.dues_notification_settings for select to authenticated
 using(terreiro_id in (select house_id from private_memberships.house_access()));

create function private_memberships.set_dues_notifications(p_house uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform private_memberships.lock_house(p_house);
 if p_enabled is null then raise exception 'Informe se os avisos devem ser ativados.'; end if;
 insert into public.dues_notification_settings(terreiro_id,enabled) values(p_house,p_enabled)
 on conflict(terreiro_id) do update set enabled=excluded.enabled;
end $$;
revoke all on function private_memberships.set_dues_notifications(uuid,boolean) from public,anon;
grant execute on function private_memberships.set_dues_notifications(uuid,boolean) to authenticated;
create function public.set_dues_notifications(p_house uuid,p_enabled boolean)
returns void language sql security invoker set search_path='' as $$
 select private_memberships.set_dues_notifications(p_house,p_enabled)
$$;
revoke all on function public.set_dues_notifications(uuid,boolean) from public,anon;
grant execute on function public.set_dues_notifications(uuid,boolean) to authenticated;

create table public.dues_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 endpoint text not null unique check (length(endpoint) between 20 and 2048 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^?#[:space:]]+$'),
 p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}=?$'),
 auth_key text not null check (auth_key ~ '^[A-Za-z0-9_-]{22}==?$|^[A-Za-z0-9_-]{22}$'),
 created_at timestamptz not null default now()
);
create index dues_push_user on public.dues_push_subscriptions(user_id);
alter table public.dues_push_subscriptions enable row level security;
revoke all on public.dues_push_subscriptions from public,anon,authenticated;
grant select,insert,update,delete on public.dues_push_subscriptions to authenticated;
grant all on public.dues_push_subscriptions to service_role;
create policy dues_push_select on public.dues_push_subscriptions for select to authenticated using ((select auth.uid())=user_id);
create policy dues_push_insert on public.dues_push_subscriptions for insert to authenticated with check ((select auth.uid())=user_id and session_id=((select auth.jwt())->>'session_id')::uuid);
create policy dues_push_update on public.dues_push_subscriptions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and session_id=((select auth.jwt())->>'session_id')::uuid);
create policy dues_push_delete on public.dues_push_subscriptions for delete to authenticated using ((select auth.uid())=user_id);

create function public.register_dues_push(p_endpoint text,p_p256dh text,p_auth text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare subscription_id uuid;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
 insert into public.dues_push_subscriptions(user_id,session_id,endpoint,p256dh,auth_key)
 values(auth.uid(),(auth.jwt()->>'session_id')::uuid,p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set session_id=excluded.session_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key
 returning id into subscription_id;
 return subscription_id;
end $$;
revoke all on function public.register_dues_push(text,text,text) from public,anon;
grant execute on function public.register_dues_push(text,text,text) to authenticated;

create table private_notifications.dues_deliveries (
 subscription_id uuid not null references public.dues_push_subscriptions(id) on delete cascade,
 due_id uuid not null references public.mensalidades(id) on delete cascade,
 kind text not null check(kind in ('today','overdue')),
 day date not null, sent_at timestamptz, lease_until timestamptz not null,
 attempts integer not null default 1 check(attempts between 1 and 3),
 primary key(subscription_id,due_id,kind)
);
alter table private_notifications.dues_deliveries enable row level security;
revoke all on private_notifications.dues_deliveries from public,anon,authenticated;

create function public.claim_dues_push(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare item record; claimed uuid; result jsonb:='[]'; notification_day date:=(p_now at time zone 'America/Sao_Paulo')::date;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 if extract(hour from p_now at time zone 'America/Sao_Paulo')<>8 then return result; end if;
 for item in
  select s.id,s.endpoint,s.p256dh,s.auth_key,d.id as due_id,d.reference,d.due_on,d.amount_cents,
   case when d.due_on=notification_day then 'today' else 'overdue' end as kind
  from public.dues_push_subscriptions s
  join public.terreiro_members m on m.user_id=s.user_id
  join public.dues_notification_settings c on c.terreiro_id=m.terreiro_id and c.enabled
  join public.mensalidades d on d.terreiro_id=m.terreiro_id and d.medium_id=m.medium_id
  left join private_notifications.dues_deliveries sent on sent.subscription_id=s.id and sent.due_id=d.id
   and sent.kind=case when d.due_on=notification_day then 'today' else 'overdue' end
  where d.status='pendente' and (d.due_on=notification_day or d.due_on+6=notification_day)
   and (sent.subscription_id is null or (sent.sent_at is null and sent.lease_until<=p_now and sent.attempts<3))
   and exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id and (a.not_after is null or a.not_after>p_now))
  order by d.id,s.id limit 500
 loop
  claimed:=null;
  insert into private_notifications.dues_deliveries(subscription_id,due_id,kind,day,lease_until)
  values(item.id,item.due_id,item.kind,notification_day,p_now+interval '2 minutes')
  on conflict(subscription_id,due_id,kind) do update set day=excluded.day,lease_until=excluded.lease_until,attempts=private_notifications.dues_deliveries.attempts+1
   where private_notifications.dues_deliveries.sent_at is null and private_notifications.dues_deliveries.lease_until<=p_now and private_notifications.dues_deliveries.attempts<3
  returning subscription_id into claimed;
  if claimed is not null then result:=result||jsonb_build_array(to_jsonb(item)||jsonb_build_object('day',notification_day)); end if;
 end loop;
 return result;
end $$;
revoke all on function public.claim_dues_push(timestamptz) from public,anon,authenticated;
grant execute on function public.claim_dues_push(timestamptz) to service_role;

-- Reconfere pagamento, configuração, vínculo e sessão imediatamente antes do envio.
create function public.dues_push_is_pending(p_id uuid,p_due uuid,p_kind text,p_day date,p_now timestamptz default now())
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 return exists(select 1 from public.dues_push_subscriptions s
  join public.terreiro_members m on m.user_id=s.user_id
  join public.dues_notification_settings c on c.terreiro_id=m.terreiro_id and c.enabled
  join public.mensalidades d on d.terreiro_id=m.terreiro_id and d.medium_id=m.medium_id
  where s.id=p_id and d.id=p_due and d.status='pendente'
   and p_day=(p_now at time zone 'America/Sao_Paulo')::date
   and ((p_kind='today' and d.due_on=p_day) or (p_kind='overdue' and d.due_on+6=p_day))
   and exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id and (a.not_after is null or a.not_after>p_now)));
end $$;
revoke all on function public.dues_push_is_pending(uuid,uuid,text,date,timestamptz) from public,anon,authenticated;
grant execute on function public.dues_push_is_pending(uuid,uuid,text,date,timestamptz) to service_role;

create function public.finish_dues_push(p_id uuid,p_due uuid,p_kind text,p_day date)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 update private_notifications.dues_deliveries set sent_at=now()
 where subscription_id=p_id and due_id=p_due and kind=p_kind and day=p_day;
end $$;
revoke all on function public.finish_dues_push(uuid,uuid,text,date) from public,anon,authenticated;
grant execute on function public.finish_dues_push(uuid,uuid,text,date) to service_role;

commit;
