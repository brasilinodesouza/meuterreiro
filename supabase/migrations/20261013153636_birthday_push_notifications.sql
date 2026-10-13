create schema if not exists private_notifications;
revoke all on schema private_notifications from public, anon, authenticated;

create table public.birthday_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 endpoint text not null unique check (length(endpoint) between 20 and 2048 and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^?#[:space:]]+$'),
 p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}=?$'),
 auth_key text not null check (auth_key ~ '^[A-Za-z0-9_-]{22}==?$|^[A-Za-z0-9_-]{22}$'),
 created_at timestamptz not null default now()
);
create index birthday_push_user on public.birthday_push_subscriptions(user_id);
alter table public.birthday_push_subscriptions enable row level security;
grant select, insert, update, delete on public.birthday_push_subscriptions to authenticated;
grant all on public.birthday_push_subscriptions to service_role;
create policy birthday_push_select on public.birthday_push_subscriptions for select to authenticated using ((select auth.uid())=user_id);
create policy birthday_push_insert on public.birthday_push_subscriptions for insert to authenticated with check ((select auth.uid())=user_id and session_id=((select auth.jwt())->>'session_id')::uuid);
create policy birthday_push_update on public.birthday_push_subscriptions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id and session_id=((select auth.jwt())->>'session_id')::uuid);
create policy birthday_push_delete on public.birthday_push_subscriptions for delete to authenticated using ((select auth.uid())=user_id);

create function public.register_birthday_push(p_endpoint text,p_p256dh text,p_auth text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare subscription_id uuid;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
 insert into public.birthday_push_subscriptions(user_id,session_id,endpoint,p256dh,auth_key)
 values(auth.uid(),(auth.jwt()->>'session_id')::uuid,p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint) do update set session_id=excluded.session_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key
 returning id into subscription_id;
 return subscription_id;
end $$;
revoke all on function public.register_birthday_push(text,text,text) from public,anon;
grant execute on function public.register_birthday_push(text,text,text) to authenticated;

create function public.is_medium_birthday(p_birth date,p_day date)
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(to_char(p_birth,'MM-DD')=to_char(p_day,'MM-DD') or
  (to_char(p_birth,'MM-DD')='02-29' and to_char(p_day,'MM-DD')='02-28'
   and extract(day from (date_trunc('year',p_day)+interval '2 months - 1 day'))=28),false)
$$;
revoke all on function public.is_medium_birthday(date,date) from public,anon;
grant execute on function public.is_medium_birthday(date,date) to authenticated,service_role;

create table private_notifications.birthday_deliveries (
 subscription_id uuid not null references public.birthday_push_subscriptions(id) on delete cascade,
 day date not null, sent_at timestamptz, lease_until timestamptz not null,
 attempts integer not null default 1 check(attempts between 1 and 3),
 primary key(subscription_id,day)
);
alter table private_notifications.birthday_deliveries enable row level security;

-- Apenas o servidor pode consultar sessões e reivindicar entregas. Nada fica exposto a usuários.
create function public.claim_birthday_push(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare item record; claimed uuid; result jsonb:='[]'; birthday_day date:=(p_now at time zone 'America/Sao_Paulo')::date;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 if extract(hour from p_now at time zone 'America/Sao_Paulo')<>8 then return result; end if;
 for item in
  select s.id,s.endpoint,s.p256dh,s.auth_key,
   (select jsonb_agg(m.name order by m.name) from public.mediuns m where m.terreiro_id=t.id and m.status in ('ativo','afastado') and public.is_medium_birthday(m.birth_date,birthday_day)) as names
  from public.birthday_push_subscriptions s join public.terreiros t on t.owner_id=s.user_id
  where exists(select 1 from auth.sessions a where a.id=s.session_id and a.user_id=s.user_id and (a.not_after is null or a.not_after>p_now))
  order by s.id limit 500
 loop
  if item.names is null then continue; end if;
  claimed:=null;
  insert into private_notifications.birthday_deliveries(subscription_id,day,lease_until)
  values(item.id,birthday_day,p_now+interval '2 minutes')
  on conflict(subscription_id,day) do update set lease_until=excluded.lease_until,attempts=private_notifications.birthday_deliveries.attempts+1
   where private_notifications.birthday_deliveries.sent_at is null and private_notifications.birthday_deliveries.lease_until<=p_now and private_notifications.birthday_deliveries.attempts<3
  returning subscription_id into claimed;
  if claimed is not null then result:=result||jsonb_build_array(jsonb_build_object('id',item.id,'endpoint',item.endpoint,'p256dh',item.p256dh,'auth_key',item.auth_key,'names',item.names,'day',birthday_day)); end if;
 end loop;
 delete from private_notifications.birthday_deliveries where day<birthday_day-35;
 return result;
end $$;
revoke all on function public.claim_birthday_push(timestamptz) from public,anon,authenticated;
grant execute on function public.claim_birthday_push(timestamptz) to service_role;

create function public.finish_birthday_push(p_id uuid,p_day date)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 update private_notifications.birthday_deliveries set sent_at=now() where subscription_id=p_id and day=p_day;
end $$;
revoke all on function public.finish_birthday_push(uuid,date) from public,anon,authenticated;
grant execute on function public.finish_birthday_push(uuid,date) to service_role;

create function public.birthday_push_server_config()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao servidor.'; end if;
 select jsonb_build_object(
  'publicKey',(select decrypted_secret from vault.decrypted_secrets where name='meuterreiro_vapid_public'),
  'privateKey',(select decrypted_secret from vault.decrypted_secrets where name='meuterreiro_vapid_private'),
  'cronSecret',(select decrypted_secret from vault.decrypted_secrets where name='meuterreiro_birthday_cron_token')
 ) into result;
 return result;
end $$;
revoke all on function public.birthday_push_server_config() from public,anon,authenticated;
grant execute on function public.birthday_push_server_config() to service_role;
