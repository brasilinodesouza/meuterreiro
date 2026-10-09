-- Preserve contas existentes. Novas contas são criadas no servidor com nome, login e senha.
begin;
alter table public.account_usernames add column full_name text;
update public.account_usernames n set full_name=coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),n.username)
  from auth.users u where u.id=n.user_id;
alter table public.account_usernames alter column full_name set not null;
alter table public.account_usernames add constraint account_name_length check(char_length(trim(full_name)) between 2 and 120);
create or replace function public._register_account_username() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_username text := lower(trim(new.raw_user_meta_data->>'username'));
  v_name text := coalesce(new.raw_user_meta_data->>'full_name',v_username);
begin
  if v_username is null or v_username !~ '^[a-z0-9._-]{6,20}$' then raise exception 'Invalid username'; end if;
  if v_name is null or char_length(trim(v_name)) not between 2 and 120 then raise exception 'Invalid name'; end if;
  insert into public.account_usernames(user_id,username,full_name) values(new.id,v_username,trim(v_name));
  return new;
end;
$$;
revoke all on function public._register_account_username() from public, anon, authenticated;
create or replace function public.auth_take_login_attempt(p_buckets text[]) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_bucket text; v_attempts integer; v_limit integer; v_allowed boolean := true;
  v_window timestamptz := to_timestamp(floor(extract(epoch from now())/900)*900);
begin
  if p_buckets is null or cardinality(p_buckets) not between 1 and 3 then raise exception 'Invalid buckets'; end if;
  if exists(select 1 from unnest(p_buckets) b where b is null or b !~ '^[ui]:[a-f0-9]{64}$') then raise exception 'Invalid bucket'; end if;
  delete from private_auth.login_limits where window_start < now()-interval '1 day';
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
