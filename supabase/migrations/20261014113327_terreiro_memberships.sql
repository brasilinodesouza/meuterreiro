begin;

-- Vínculos e permissões nunca são lidos do user_metadata editável pelo usuário.
create schema private_memberships;
revoke all on schema private_memberships from public, anon, authenticated;
grant usage on schema private_memberships to authenticated;
alter default privileges in schema private_memberships revoke execute on functions from public;

create table public.terreiro_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terreiro_id uuid not null references public.terreiros(id) on delete restrict,
  role text not null default 'usuario' check (role in ('usuario', 'administrador')),
  medium_id uuid,
  created_at timestamptz not null default now(),
  foreign key (medium_id, terreiro_id) references public.mediuns(id, terreiro_id),
  unique (medium_id)
);
create index terreiro_members_house on public.terreiro_members(terreiro_id);
alter table public.terreiro_members enable row level security;
revoke all on public.terreiro_members from public, anon, authenticated;
grant select on public.terreiro_members to authenticated;

create table private_memberships.invites (
  terreiro_id uuid primary key references public.terreiros(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '7 days'
);
alter table private_memberships.invites enable row level security;
revoke all on private_memberships.invites from public, anon, authenticated;

-- Helpers privados evitam recursão entre políticas de casas e vínculos.
create function private_memberships.house_access()
returns table(house_id uuid, access_role text)
language sql stable security definer set search_path = '' as $$
  select t.id, 'responsavel'::text from public.terreiros t
    where auth.uid() is not null and t.owner_id = (select auth.uid())
  union all
  select m.terreiro_id, m.role from public.terreiro_members m
    where auth.uid() is not null and m.user_id = (select auth.uid());
$$;
create function private_memberships.own_medium_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select medium_id from public.terreiro_members
    where auth.uid() is not null and user_id = (select auth.uid()) and medium_id is not null;
$$;
revoke all on function private_memberships.house_access(), private_memberships.own_medium_ids() from public, anon;
grant execute on function private_memberships.house_access(), private_memberships.own_medium_ids() to authenticated;
create policy "members read own membership" on public.terreiro_members for select to authenticated
  using(user_id = (select auth.uid()) or terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')));

drop policy "owner reads house" on public.terreiros;
create policy "members read house" on public.terreiros for select to authenticated
  using(id in (select house_id from private_memberships.house_access()));
drop policy "owner creates house" on public.terreiros;
create policy "owner creates house" on public.terreiros for insert to authenticated
  with check(owner_id = (select auth.uid()) and not exists(select 1 from public.terreiro_members where user_id = (select auth.uid())));
drop policy "owner updates house" on public.terreiros;
create policy "administrators update house" on public.terreiros for update to authenticated
  using(id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')))
  with check(id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')));
-- Mesmo administradores não podem transferir o responsável ou a identidade da casa.
revoke update on public.terreiros from authenticated;
grant update(name, city, state) on public.terreiros to authenticated;

drop policy "owner reads mediums" on public.mediuns;
drop policy "owner creates mediums" on public.mediuns;
drop policy "owner updates mediums" on public.mediuns;
create policy "members read permitted mediums" on public.mediuns for select to authenticated
  using(terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador'))
    or id in (select private_memberships.own_medium_ids()));
create policy "administrators create mediums" on public.mediuns for insert to authenticated
  with check(terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')));
create policy "administrators update mediums" on public.mediuns for update to authenticated
  using(terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')))
  with check(terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')));

drop policy "owner reads dues" on public.mensalidades;
drop policy "owner reads expenses" on public.gastos;
drop policy "owner reads ledger" on public.caixa;
drop policy "owner reads reminders" on public.lembretes;
create policy "members read permitted dues" on public.mensalidades for select to authenticated
  using(terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador'))
    or medium_id in (select private_memberships.own_medium_ids()));
create policy "administrators read expenses" on public.gastos for select to authenticated
  using(terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')));
create policy "administrators read ledger" on public.caixa for select to authenticated
  using(terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')));
create policy "administrators read reminders" on public.lembretes for select to authenticated
  using(terreiro_id in (select house_id from private_memberships.house_access() where access_role in ('responsavel','administrador')));

create function private_memberships.lock_house(p_house uuid, p_owner_only boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para continuar.'; end if;
  -- Todas as gravações administrativas serializam com as alterações de permissão.
  perform 1 from public.terreiros where id = p_house for update;
  if not found or not exists(select 1 from private_memberships.house_access()
    where house_id = p_house and (access_role = 'responsavel' or (not p_owner_only and access_role = 'administrador')))
    then raise exception 'Você não tem permissão para administrar este terreiro.'; end if;
end;
$$;
revoke all on function private_memberships.lock_house(uuid,boolean) from public,anon;
grant execute on function private_memberships.lock_house(uuid,boolean) to authenticated;

create or replace function public._finance_lock_house(p_house uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform private_memberships.lock_house(p_house);
end;
$$;
-- Mantém a função interna fora da API pública; as RPCs financeiras já existentes a chamam.
revoke all on function public._finance_lock_house(uuid) from public,anon,authenticated;

create function private_memberships.create_invite(p_house uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_invite private_memberships.invites;
begin
  perform private_memberships.lock_house(p_house, true);
  insert into private_memberships.invites(terreiro_id) values(p_house)
    on conflict(terreiro_id) do update set token = gen_random_uuid(), expires_at = now() + interval '7 days'
    returning * into v_invite;
  return jsonb_build_object('token', v_invite.token, 'expires_at', v_invite.expires_at);
end;
$$;

create function private_memberships.join_house(p_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_house uuid; v_existing uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para aceitar o convite.'; end if;
  -- Impede dois convites simultâneos de vincularem a mesma conta a casas distintas.
  perform 1 from auth.users where id = auth.uid() for update;
  if not found then raise exception 'Conta inválida.'; end if;
  select terreiro_id into v_house from private_memberships.invites
    where token = p_token and expires_at > now() for share;
  if not found then raise exception 'Convite inválido ou expirado. Peça um novo link ao responsável.'; end if;
  if exists(select 1 from public.terreiros where owner_id = auth.uid())
    then raise exception 'Esta conta já é responsável por um terreiro. Use uma conta pessoal para aceitar o convite.'; end if;
  select terreiro_id into v_existing from public.terreiro_members where user_id = auth.uid();
  if v_existing is not null then
    if v_existing = v_house then return v_house; end if;
    raise exception 'Sua conta já está vinculada a outro terreiro.';
  end if;
  -- O cliente nunca escolhe o perfil; aceitar novamente não altera uma promoção existente.
  insert into public.terreiro_members(user_id, terreiro_id, role) values(auth.uid(), v_house, 'usuario');
  return v_house;
end;
$$;

create function private_memberships.list_users(p_house uuid)
returns table(user_id uuid, full_name text, username text, role text, medium_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from private_memberships.house_access()
    where house_id = p_house and access_role in ('responsavel','administrador'))
    then raise exception 'Você não tem permissão para consultar os usuários deste terreiro.'; end if;
  return query
    select t.owner_id, n.full_name, n.username, 'responsavel'::text, null::uuid
      from public.terreiros t join public.account_usernames n on n.user_id = t.owner_id where t.id = p_house
    union all
    select m.user_id, n.full_name, n.username, m.role, m.medium_id
      from public.terreiro_members m join public.account_usernames n on n.user_id = m.user_id where m.terreiro_id = p_house;
end;
$$;

create function private_memberships.set_role(p_house uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private_memberships.lock_house(p_house, true);
  if p_role is null or p_role not in ('usuario','administrador') then raise exception 'Perfil inválido.'; end if;
  update public.terreiro_members set role = p_role where terreiro_id = p_house and user_id = p_user;
  if not found then raise exception 'Usuário não encontrado. O responsável mantém seu acesso protegido.'; end if;
end;
$$;
create function private_memberships.link_medium(p_house uuid, p_user uuid, p_medium uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private_memberships.lock_house(p_house);
  if p_medium is not null and not exists(select 1 from public.mediuns where id = p_medium and terreiro_id = p_house)
    then raise exception 'Escolha um médium deste terreiro.'; end if;
  if p_medium is not null and exists(select 1 from public.terreiro_members where medium_id = p_medium and user_id <> p_user)
    then raise exception 'Este cadastro já está associado a outra conta.'; end if;
  update public.terreiro_members set medium_id = p_medium where user_id = p_user and terreiro_id = p_house;
  if not found then raise exception 'Usuário não encontrado neste terreiro.'; end if;
end;
$$;
revoke all on function private_memberships.create_invite(uuid), private_memberships.join_house(uuid), private_memberships.list_users(uuid),
  private_memberships.set_role(uuid,uuid,text), private_memberships.link_medium(uuid,uuid,uuid) from public,anon;
grant execute on function private_memberships.create_invite(uuid), private_memberships.join_house(uuid), private_memberships.list_users(uuid),
  private_memberships.set_role(uuid,uuid,text), private_memberships.link_medium(uuid,uuid,uuid) to authenticated;

-- Wrappers invoker expõem apenas operações autenticadas com validação nos helpers privados.
create function public.terreiro_create_invite(p_house uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private_memberships.create_invite(p_house); $$;
create function public.terreiro_join(p_token uuid) returns uuid
language sql security invoker set search_path = '' as $$ select private_memberships.join_house(p_token); $$;
create function public.terreiro_list_users(p_house uuid)
returns table(user_id uuid, full_name text, username text, role text, medium_id uuid)
language sql security invoker set search_path = '' as $$ select * from private_memberships.list_users(p_house); $$;
create function public.terreiro_set_role(p_house uuid, p_user uuid, p_role text) returns void
language sql security invoker set search_path = '' as $$ select private_memberships.set_role(p_house,p_user,p_role); $$;
create function public.terreiro_link_medium(p_house uuid, p_user uuid, p_medium uuid) returns void
language sql security invoker set search_path = '' as $$ select private_memberships.link_medium(p_house,p_user,p_medium); $$;
revoke all on function public.terreiro_create_invite(uuid), public.terreiro_join(uuid), public.terreiro_list_users(uuid),
  public.terreiro_set_role(uuid,uuid,text), public.terreiro_link_medium(uuid,uuid,uuid) from public,anon;
grant execute on function public.terreiro_create_invite(uuid), public.terreiro_join(uuid), public.terreiro_list_users(uuid),
  public.terreiro_set_role(uuid,uuid,text), public.terreiro_link_medium(uuid,uuid,uuid) to authenticated;

commit;
