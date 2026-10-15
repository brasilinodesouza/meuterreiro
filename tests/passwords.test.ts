import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { changePassword } from '../src/lib/passwords';
import { createChangeUserPassword } from '../supabase/functions/_shared/change-user-password';

const origin = 'https://app.example.com';
const house = crypto.randomUUID(), actor = crypto.randomUUID(), target = crypto.randomUUID();
const password = ' NovaSenha1 ';
const values = { password, confirm_password: password };
function request(body: unknown = { house_id: house, user_id: target, password }, headers: Record<string, string> = {}) {
  return new Request('https://project.example.com/functions/v1/change-user-password', { method: 'POST', headers: { origin, 'Content-Type': 'application/json', Authorization: 'Bearer actor-token', ...headers }, body: JSON.stringify(body) });
}
function setup(options: { role?: string; targetRole?: string; foreign?: boolean; revoked?: boolean; accessError?: boolean; limit?: boolean; updateStatus?: number; broken?: boolean } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const handler = createChangeUserPassword({ url: 'https://project.example.com', publicKey: 'public-key', serviceKey: 'server-key', origins: [origin], fetcher: async (input, init = {}) => {
    const url = String(input); calls.push({ url, init });
    if (options.broken) throw new Error('server-key internal error');
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: actor, user_metadata: { role: 'responsavel' } }, { status: options.revoked ? 401 : 200 });
    if (url.endsWith('/rpc/terreiro_list_users')) {
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer actor-token');
      assert.equal(new Headers(init.headers).get('apikey'), 'public-key');
      assert.deepEqual(JSON.parse(String(init.body)), { p_house: house });
      if (options.accessError) return Response.json({}, { status: 403 });
      return Response.json([{ user_id: actor, role: options.role ?? 'administrador' }, ...options.foreign ? [] : [{ user_id: target, role: options.targetRole ?? 'usuario' }]]);
    }
    if (url.endsWith('/rpc/auth_take_login_attempt')) return Response.json(options.limit ?? true);
    assert.equal(url, `https://project.example.com/auth/v1/admin/users/${target}`);
    assert.equal(init.method, 'PUT');
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer server-key');
    assert.deepEqual(JSON.parse(String(init.body)), { password });
    return Response.json({ id: target, email: 'private@example.com' }, { status: options.updateStatus ?? 200 });
  } });
  return { handler, calls };
}

test('troca própria usa apenas a sessão atual; confirmação e limites são validados antes de enviar', async () => {
  let updated: unknown;
  const client = { auth: { updateUser: async (body: unknown) => { updated = body; return { error: null }; } } } as unknown as SupabaseClient;
  await changePassword(client, values);
  assert.deepEqual(updated, { password });
  updated = null;
  for (const input of [{ password: 'curta', confirm_password: 'curta' }, { password: 'x'.repeat(21), confirm_password: 'x'.repeat(21) }, { ...values, confirm_password: 'diferente' }]) await assert.rejects(() => changePassword(client, input));
  assert.equal(updated, null);
  const failed = { auth: { updateUser: async () => ({ error: { message: 'internal secrets' } }) } } as unknown as SupabaseClient;
  await assert.rejects(() => changePassword(failed, values), /Não foi possível/);
});

test('cliente administrativo envia somente conta, casa e senha e exige confirmação do servidor', async () => {
  let sent: unknown;
  const client = { functions: { invoke: async (name: string, args: { body: unknown }) => { assert.equal(name, 'change-user-password'); sent = args.body; return { data: { updated: true }, error: null }; } } } as unknown as SupabaseClient;
  await changePassword(client, values, { houseId: house, userId: target });
  assert.deepEqual(sent, { house_id: house, user_id: target, password });
  const invalid = { functions: { invoke: async () => ({ data: {}, error: null }) } } as unknown as SupabaseClient;
  await assert.rejects(() => changePassword(invalid, values, { houseId: house, userId: target }), /confirmar/);
});

test('handler rejeita visitante, origem externa, corpo inválido e senha fora do limite sem acessar serviços', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request(undefined, { Authorization: '' }))).status, 401);
  assert.equal((await handler(request(undefined, { origin: 'https://outsider.example.com' }))).status, 403);
  for (const body of [null, {}, { house_id: house, user_id: '../user', password }, { house_id: house, user_id: target, password: 'curta' }, { house_id: house, user_id: target, password: 'x'.repeat(21) }, { house_id: house, user_id: target, password, extra: 'x'.repeat(4097) }]) assert.equal((await handler(request(body))).status, 400);
  assert.equal(calls.length, 0);
  const preflight = await handler(new Request('https://project.example.com', { method: 'OPTIONS', headers: { origin } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
});

test('administrador e responsável alteram senha de qualquer papel da própria casa sem expor dados do Auth', async () => {
  for (const role of ['administrador', 'responsavel']) for (const targetRole of ['usuario', 'administrador', 'responsavel']) {
    const { handler, calls } = setup({ role, targetRole });
    const response = await handler(request());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { updated: true });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(calls.length, 4);
  }
});

test('papel comum, metadata forjada, casa alheia e sessão inválida nunca chegam à alteração administrativa', async () => {
  for (const scenario of [{ role: 'usuario' }, { foreign: true }, { accessError: true }, { revoked: true }]) {
    const { handler, calls } = setup(scenario);
    assert.equal((await handler(request())).status, scenario.revoked ? 401 : 403);
    assert.equal(calls.some(call => call.init.method === 'PUT'), false);
    assert.equal(calls.some(call => new Headers(call.init.headers).get('apikey') === 'server-key'), false);
  }
});

test('limite, falha no Auth e indisponibilidade não geram falso sucesso nem vazam detalhes', async () => {
  for (const [options, status] of [[{ limit: false }, 429], [{ updateStatus: 422 }, 422], [{ updateStatus: 500 }, 503], [{ broken: true }, 503]] as const) {
    const { handler, calls } = setup(options);
    const response = await handler(request());
    assert.equal(response.status, status);
    const text = await response.text();
    assert.doesNotMatch(text, /server-key|private@example|NovaSenha1|updated/);
    if ('limit' in options) assert.equal(calls.some(call => call.init.method === 'PUT'), false);
  }
});
