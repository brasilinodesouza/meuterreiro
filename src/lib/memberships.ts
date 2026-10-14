import { z } from 'zod';
import { supabase } from './supabase';

export const accessRoleSchema = z.enum(['usuario', 'administrador', 'responsavel']);
export type AccessRole = z.infer<typeof accessRoleSchema>;
export const roleLabels: Record<AccessRole, string> = { usuario: 'Usuário', administrador: 'Administrador', responsavel: 'Responsável' };
const memberSchema = z.object({ user_id: z.uuid(), full_name: z.string(), username: z.string(), role: accessRoleSchema, medium_id: z.uuid().nullable() });
export type HouseMember = z.infer<typeof memberSchema>;
export function canManageHouse(role: AccessRole) { return role === 'responsavel' || role === 'administrador'; }
export function parseInvite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Informe o link ou código de convite.');
  let token = trimmed;
  if (trimmed.includes('://')) {
    try { token = new URLSearchParams(new URL(trimmed).hash.slice(1)).get('convite') ?? ''; }
    catch { throw new Error('Informe um link de convite válido.'); }
  }
  if (!z.uuid().safeParse(token).success) throw new Error('Convite inválido. Confira o link recebido do responsável.');
  return token;
}
export function invitationLink(origin: string, token: string) { return `${origin}/#convite=${parseInvite(token)}`; }
export const invitationStorageKey = 'meuterreiro-convite';
export async function membershipRpc(name: string, params: Record<string, unknown>) {
  if (!supabase) throw new Error('O acesso ainda está em preparação.');
  const result = await supabase.rpc(name, params);
  if (result.error) {
    if (result.error.code === 'P0001') throw new Error(result.error.message);
    if (result.error.code === 'PGRST202') throw new Error('O acesso de usuários ainda precisa ser habilitado no banco.');
    throw new Error('Não foi possível concluir. Confira sua conexão e tente novamente.');
  }
  return result.data;
}
export async function listHouseMembers(houseId: string) {
  return z.array(memberSchema).parse(await membershipRpc('terreiro_list_users', { p_house: houseId }));
}
export async function createHouseInvite(houseId: string) {
  return z.object({ token: z.uuid(), expires_at: z.iso.datetime({ offset: true }) }).parse(await membershipRpc('terreiro_create_invite', { p_house: houseId }));
}
export async function deleteHouseUser(houseId: string, member: HouseMember) {
  await membershipRpc('terreiro_delete_user', { p_house: houseId, p_user: member.user_id, p_username: member.username });
}
