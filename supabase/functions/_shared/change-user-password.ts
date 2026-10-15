import { parsePassword } from './credentials.ts';

type Options = { url: string; publicKey: string; serviceKey: string; origins: string[]; fetcher?: typeof fetch };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createChangeUserPassword(options: Options) {
  const fetcher = options.fetcher ?? fetch;
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin') ?? '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
    const reply = (status: number, error: string) => Response.json({ error }, { status, headers });
    if (!options.origins.includes(origin)) return reply(403, 'Origem não permitida.');
    Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, 'Método não permitido.');
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer \S+$/i.test(authorization)) return reply(401, 'Entre novamente.');
    if (!options.url || !options.publicKey || !options.serviceKey) return reply(503, 'Serviço indisponível.');
    let houseId: string, userId: string, password: string;
    try {
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !request.body) throw new Error();
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length;
          if (size > 4096) { await reader.cancel(); throw new Error(); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof body?.house_id !== 'string' || !uuid.test(body.house_id) || typeof body.user_id !== 'string' || !uuid.test(body.user_id)) throw new Error();
      houseId = body.house_id; userId = body.user_id; password = parsePassword(body.password);
    } catch { return reply(400, 'Confira a conta e a senha de 6 a 20 caracteres.'); }
    const callerHeaders = { apikey: options.publicKey, Authorization: authorization, 'Content-Type': 'application/json' };
    const adminHeaders = { apikey: options.serviceKey, Authorization: `Bearer ${options.serviceKey}`, 'Content-Type': 'application/json' };
    try {
      const auth = await fetcher(`${options.url}/auth/v1/user`, { headers: callerHeaders });
      if (!auth.ok) return reply(auth.status >= 500 ? 503 : 401, 'Não foi possível validar sua sessão.');
      const caller = await auth.json();
      if (typeof caller?.id !== 'string' || !uuid.test(caller.id)) return reply(401, 'Entre novamente.');
      // A consulta usa o JWT do solicitante: o banco exige administração desta casa.
      const access = await fetcher(`${options.url}/rest/v1/rpc/terreiro_list_users`, { method: 'POST', headers: callerHeaders, body: JSON.stringify({ p_house: houseId }) });
      if (!access.ok) return reply(access.status >= 500 ? 503 : 403, 'Sem permissão nesta casa.');
      const members = await access.json();
      if (!Array.isArray(members) || !members.some(member => member.user_id === caller.id && ['administrador', 'responsavel'].includes(member.role)) || !members.some(member => member.user_id === userId)) return reply(403, 'Sem permissão para esta conta.');
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`password-change:${caller.id}`));
      const bucket = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
      const limit = await fetcher(`${options.url}/rest/v1/rpc/auth_take_login_attempt`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ p_buckets: [`u:${bucket}`] }) });
      if (!limit.ok) return reply(503, 'Serviço indisponível.');
      if (await limit.json() !== true) return reply(429, 'Aguarde 15 minutos.');
      const updated = await fetcher(`${options.url}/auth/v1/admin/users/${userId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password }) });
      if (!updated.ok) return reply(updated.status === 429 ? 429 : updated.status < 500 ? 422 : 503, 'Não foi possível alterar a senha.');
      return Response.json({ updated: true }, { headers });
    } catch { return reply(503, 'Não foi possível alterar a senha.'); }
  };
}
