export const USERNAME_PATTERN = '[A-Za-z0-9._-]{6,20}';
export function parseUsername(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Informe seu usuário.');
  const username = value.trim().toLowerCase();
  if (username.length < 6 || username.length > 20) throw new Error('O usuário deve ter de 6 a 20 caracteres.');
  if (!/^[a-z0-9._-]+$/.test(username)) throw new Error('Use apenas letras, números, ponto, hífen ou sublinhado no usuário.');
  return username;
}
export function parsePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 6 || value.length > 20) throw new Error('A senha deve ter de 6 a 20 caracteres.');
  return value;
}
export function parseCredentials(value: unknown): { username: string; password: string } {
  if (!value || typeof value !== 'object') throw new Error('Informe o usuário e a senha.');
  const input = value as Record<string, unknown>;
  return { username: parseUsername(input.username), password: parsePassword(input.password) };
}
export function parseRegistration(value: unknown): { name: string; username: string; password: string } {
  const credentials=parseCredentials(value);
  const input=value as Record<string,unknown>;
  if(typeof input.name!=='string')throw new Error('Informe seu nome.');
  const name=input.name.trim();
  if(name.length<2||name.length>120)throw new Error('O nome deve ter de 2 a 120 caracteres.');
  return {name,...credentials};
}
