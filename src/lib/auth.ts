import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCredentials, parsePassword, parseRegistration } from '../../supabase/functions/_shared/credentials';
export { USERNAME_PATTERN, parseCredentials, parsePassword, parseUsername } from '../../supabase/functions/_shared/credentials';

export function parseSignup(value: Record<string, unknown>) {
  return parseRegistration(value);
}
export function parseNewPassword(value: Record<string, unknown>) {
  const password = parsePassword(value.password);
  if (password !== value.confirm_password) throw new Error('A confirmação deve ser igual à senha.');
  return password;
}
const tokensSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) });
export async function signInWithUsername(client: SupabaseClient, input: unknown) {
  const body = parseCredentials(input);
  const { data, error } = await client.functions.invoke('username-login', { body });
  if (error) {
    if ('context' in error && error.context instanceof Response) {
      if (error.context.status === 401) throw new Error('Login ou senha incorretos.');
      if (error.context.status === 429) throw new Error('Muitas tentativas. Aguarde 15 minutos para tentar novamente.');
    }
    throw new Error('Não foi possível entrar agora. Confira sua conexão ou tente novamente em instantes.');
  }
  const tokens = tokensSchema.safeParse(data);
  if (!tokens.success) throw new Error('Não foi possível validar o acesso. Tente novamente.');
  const result = await client.auth.setSession(tokens.data);
  if (result.error || !result.data.user) throw new Error('Não foi possível iniciar a sessão. Tente novamente.');
}
export async function registerAccount(client: SupabaseClient, input: Record<string,unknown>) {
  const body={action:'register',...parseSignup(input)};
  const {data,error}=await client.functions.invoke('username-login',{body});
  if(error){
    if('context' in error&&error.context instanceof Response){
      if(error.context.status===409)throw new Error('Esse login já está em uso. Escolha outro.');
      if(error.context.status===429)throw new Error('Muitos cadastros em pouco tempo. Aguarde 15 minutos para tentar novamente.');
    }
    throw new Error('Não foi possível cadastrar agora. Tente novamente em instantes.');
  }
  if(!data||data.registered!==true)throw new Error('Não foi possível confirmar o cadastro. Tente entrar com seu login ou cadastre novamente.');
}
