import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseNewPassword } from './auth';

export async function changePassword(client: SupabaseClient, values: Record<string, unknown>, target?: { houseId: string; userId: string }) {
  const password = parseNewPassword(values);
  if (!target) {
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new Error('Não foi possível alterar a senha. Use uma senha diferente da atual e tente novamente. Se a sessão expirou, entre novamente.');
    return;
  }
  const body = { house_id: z.uuid().parse(target.houseId), user_id: z.uuid().parse(target.userId), password };
  const { data, error } = await client.functions.invoke('change-user-password', { body });
  if (error) {
    if ('context' in error && error.context instanceof Response) {
      if (error.context.status === 401) throw new Error('Sua sessão expirou. Entre novamente.');
      if (error.context.status === 403) throw new Error('Somente a administração pode alterar senhas de usuários da própria casa.');
      if (error.context.status === 429) throw new Error('Muitas alterações em pouco tempo. Aguarde 15 minutos.');
      if (error.context.status === 422) throw new Error('Escolha uma senha diferente da atual e confira os requisitos.');
    }
    throw new Error('Não foi possível alterar a senha. Confira sua conexão e tente novamente.');
  }
  if (data?.updated !== true) throw new Error('Não foi possível confirmar a alteração da senha. Tente novamente.');
}
