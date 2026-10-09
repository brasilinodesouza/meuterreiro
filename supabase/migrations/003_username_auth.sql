-- Execute após 001 e 002. Não guarda senhas: Supabase Auth gerencia as credenciais.
begin;
create table public.account_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._-]{6,20}$'),
  created_at timestamptz not null default now()
);
alter table public.account_usernames enable row level security;
revoke all on public.account_usernames from public, anon, authenticated;
grant select on public.account_usernames to authenticated, service_role;
create policy "account reads own username" on public.account_usernames for select to authenticated using (user_id = (select auth.uid()));
create function public._register_account_username() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_username text := lower(trim(new.raw_user_meta_data->>'username'));
begin
  if v_username is null or v_username !~ '^[a-z0-9._-]{6,20}$' then raise exception 'Invalid username'; end if;
  insert into public.account_usernames(user_id,username) values(new.id,v_username);
  return new;
end;
$$;
revoke all on function public._register_account_username() from public, anon, authenticated;
create trigger register_account_username after insert on auth.users for each row execute function public._register_account_username();

-- Somente a função de login no servidor pode resolver o e-mail do usuário.
create function public.auth_email_for_username(p_username text) returns text
language sql security definer set search_path = '' as $$
  select u.email from public.account_usernames n join auth.users u on u.id=n.user_id where n.username=p_username;
$$;
revoke all on function public.auth_email_for_username(text) from public, anon, authenticated;
grant execute on function public.auth_email_for_username(text) to service_role;

-- Limites compartilhados entre instâncias, sem registrar usuário/IP em texto.
create schema if not exists private_auth;
revoke all on schema private_auth from public, anon, authenticated;
create table private_auth.login_limits (
  bucket text primary key,
  window_start timestamptz not null,
  attempts integer not null check (attempts between 1 and 61)
);
create index login_limits_window on private_auth.login_limits(window_start);
revoke all on private_auth.login_limits from public, anon, authenticated;
create function public.auth_take_login_attempt(p_buckets text[]) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_bucket text; v_attempts integer; v_limit integer; v_allowed boolean := true;
  v_window timestamptz := to_timestamp(floor(extract(epoch from now())/900)*900);
begin
  if p_buckets is null or cardinality(p_buckets) not between 1 and 2 then raise exception 'Invalid buckets'; end if;
  if exists(select 1 from unnest(p_buckets) b where b is null or b !~ '^[ui]:[a-f0-9]{64}$') then raise exception 'Invalid bucket'; end if;
  delete from private_auth.login_limits where window_start < now()-interval '1 day';
  -- Ordem constante evita deadlocks de requisições com os mesmos buckets.
  for v_bucket in select distinct b from unnest(p_buckets) b order by b loop
    v_limit := case when left(v_bucket,2)='u:' then 12 else 60 end;
    insert into private_auth.login_limits(bucket,window_start,attempts) values(v_bucket,v_window,1)
      on conflict(bucket) do update set
        attempts=case when private_auth.login_limits.window_start=excluded.window_start then least(private_auth.login_limits.attempts+1,61) else 1 end,
        window_start=excluded.window_start returning attempts into v_attempts;
    if v_attempts>v_limit then v_allowed:=false; end if;
  end loop;
  return v_allowed;
end;
$$;
revoke all on function public.auth_take_login_attempt(text[]) from public, anon, authenticated;
grant execute on function public.auth_take_login_attempt(text[]) to service_role;
commit;
