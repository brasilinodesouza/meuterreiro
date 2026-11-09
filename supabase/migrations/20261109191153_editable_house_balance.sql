alter table public.terreiros add column balance_offset_cents bigint not null default 0;
create function private_memberships.set_balance(p_house uuid,p_amount bigint,p_expected bigint)
returns void language plpgsql security definer set search_path='' as $$
declare current_balance bigint; movements bigint;
begin
 perform private_memberships.lock_house(p_house,true);
 if p_amount is null or p_amount not between -1000000000 and 1000000000 then raise exception 'Informe um saldo válido.'; end if;
 select coalesce(sum(case when kind='entrada' then amount_cents else -amount_cents end),0) into movements from public.caixa where terreiro_id=p_house;
 select balance_offset_cents+movements into current_balance from public.terreiros where id=p_house;
 if current_balance is distinct from p_expected then raise exception 'O saldo mudou. Atualize a tela antes de editar.'; end if;
 update public.terreiros set balance_offset_cents=p_amount-movements where id=p_house;
end; $$;
revoke all on function private_memberships.set_balance(uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function private_memberships.set_balance(uuid,bigint,bigint) to authenticated;
create function public.finance_set_balance(p_house uuid,p_amount bigint,p_expected bigint)
returns void language sql security invoker set search_path='' as $$ select private_memberships.set_balance(p_house,p_amount,p_expected); $$;
revoke all on function public.finance_set_balance(uuid,bigint,bigint) from public,anon,authenticated;
grant execute on function public.finance_set_balance(uuid,bigint,bigint) to authenticated;
notify pgrst,'reload schema';
