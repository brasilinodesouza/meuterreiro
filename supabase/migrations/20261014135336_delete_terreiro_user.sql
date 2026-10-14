begin;

-- A API pública não recebe acesso de gravação ao Auth. Apenas este helper
-- privado pode excluir uma conta, após validar sessão, responsável e vínculo.
create function private_memberships.delete_user(p_house uuid, p_user uuid, p_username text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private_memberships.lock_house(p_house, true);
  if not exists (
    select 1 from auth.sessions s
    where s.user_id = auth.uid() and s.id::text = auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after > now())
  ) then raise exception 'Sua sessão expirou. Entre novamente para apagar um usuário.'; end if;

  if p_user = auth.uid() or exists(select 1 from public.terreiros where owner_id = p_user)
    then raise exception 'A conta do responsável não pode ser apagada.'; end if;

  -- Serializa com adesão a convites e criação de vínculos para esta conta.
  perform 1 from auth.users where id = p_user for update;
  if not found or not exists (
    select 1 from public.terreiro_members m join public.account_usernames n on n.user_id = m.user_id
    where m.terreiro_id = p_house and m.user_id = p_user and n.username = p_username
  ) then raise exception 'Usuário não encontrado neste terreiro. Atualize a lista e tente novamente.'; end if;

  -- As duas exclusões pertencem à mesma transação. Uma falha preserva tudo.
  delete from auth.sessions where user_id = p_user;
  delete from auth.users where id = p_user;
  -- As FKs removem login, vínculo, identidades e inscrições de notificações.
  -- Médiuns e registros financeiros não pertencem à conta e são preservados.
exception when foreign_key_violation or restrict_violation then
  raise exception 'Esta conta possui vínculos que impedem a exclusão. Nenhum dado foi apagado.';
end;
$$;
revoke all on function private_memberships.delete_user(uuid,uuid,text) from public, anon, authenticated;
grant execute on function private_memberships.delete_user(uuid,uuid,text) to authenticated;

create function public.terreiro_delete_user(p_house uuid, p_user uuid, p_username text) returns void
language sql security invoker set search_path = '' as $$
  select private_memberships.delete_user(p_house, p_user, p_username);
$$;
revoke all on function public.terreiro_delete_user(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.terreiro_delete_user(uuid,uuid,text) to authenticated;

commit;
