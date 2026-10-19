import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { calendarDateSchema, calendarToday, isOrixaDay } from '../src/lib/orixa-calendar';
import { orixaPayload } from '../supabase/functions/_shared/orixa-notifications';
import { createBirthdayNotifications, type BirthdayPush, type BirthdayPayload } from '../supabase/functions/_shared/birthday-notifications';

test('calendário valida dias reais e usa a data de Brasília na virada do ano', () => {
  assert.equal(calendarDateSchema.parse({ name: '  Oxóssi  ', month: 1, day: 20 }).name, 'Oxóssi');
  for (const [month, day] of [[2, 30], [4, 31], [0, 1], [13, 1], [1, 0], [1, 1.5]]) assert.equal(calendarDateSchema.safeParse({ name: 'Oxum', month, day }).success, false);
  assert.equal(calendarDateSchema.safeParse({ name: 'Oxum', month: 2, day: 29 }).success, true);
  assert.equal(calendarToday(new Date('2027-01-01T02:59:59Z')), '2026-12-31');
  assert.equal(calendarToday(new Date('2027-01-01T03:00:00Z')), '2027-01-01');
  assert.equal(isOrixaDay({ name: 'Oxum', month: 12, day: 8 }, '2027-12-08'), true);
  assert.equal(isOrixaDay({ name: 'Oxum', month: 12, day: 8 }, '2027-12-09'), false);
});

test('avisos dos orixás usam mensagem própria e só o agendador dispara para todos', async () => {
  const item: BirthdayPush = { id: 'device', endpoint: 'https://fcm.googleapis.com/fcm/send/test', p256dh: 'key', auth_key: 'auth', names: ['Oxum', 'Oxalá'], day: '2027-12-08' };
  const sent: BirthdayPayload[] = []; let claims = 0, finished = 0, removed = 0, failure = 0;
  const handler = createBirthdayNotifications({ cronSecret: 'cron-secret', origins: ['https://meuterreiro.vercel.app'], payload: orixaPayload }, {
    getUser: async token => token === 'user-token' ? 'member' : null,
    find: async (id, endpoint) => id === 'member' && endpoint === item.endpoint ? item : null,
    claim: async () => { claims++; return [item]; },
    send: async (_item, payload) => { if (failure) throw { statusCode: failure }; sent.push(payload); },
    finish: async () => { finished++; }, remove: async () => { removed++; }, health: async () => true,
  });
  const request = (token: string, body: unknown = {}, origin = 'https://meuterreiro.vercel.app') => handler(new Request('https://example.com', { method: 'POST', headers: { authorization: `Bearer ${token}`, origin }, body: JSON.stringify(body) }));
  assert.equal((await request('')).status, 401);
  assert.equal((await request('user-token')).status, 400);
  assert.equal((await request('user-token', { action: 'test', endpoint: item.endpoint + 'other' })).status, 404);
  assert.equal((await request('cron-secret', {}, 'https://evil.example')).status, 403);
  assert.equal(claims, 0);
  assert.equal((await request('cron-secret')).status, 200);
  assert.equal(finished, 1); assert.deepEqual(sent[0], orixaPayload(['Oxum', 'Oxalá'], item.day!));
  assert.match(sent[0].body, /Hoje celebramos Oxum, Oxalá!/);
  assert.equal(sent[0].url, '/?calendario=hoje'); assert.equal(sent[0].tag, 'orixas-2027-12-08');
  failure = 503; assert.equal((await request('cron-secret')).status, 503); assert.equal(finished, 1);
  failure = 410; assert.equal((await request('cron-secret')).status, 200); assert.equal(removed, 1);
});

test('PostgreSQL: calendário por casa, CRUD administrativo, avisos a todos os perfis, sessões e lotes', async t => {
  const db = new PGlite();
  const [owner, admin, member, other, stranger] = Array.from({ length: 5 }, () => crypto.randomUUID());
  const house = crypto.randomUUID(), foreign = crypto.randomUUID();
  const sessions = new Map([owner, admin, member, other, stranger].map(id => [id, crypto.randomUUID()]));
  const migration = async (name: string) => db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  const asUser = async (id: string) => {
    await db.exec('reset role;set role authenticated');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, session_id: sessions.get(id), role: 'authenticated' })]);
  };
  const server = async () => {
    await db.exec('reset role;set role service_role');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  };
  const register = async (id: string) => (await db.query<{ id: string }>('select register_orixa_push($1,$2,$3) id', [`https://fcm.googleapis.com/fcm/send/${id}`, 'B' + 'a'.repeat(86), 'a'.repeat(22)])).rows[0].id;
  const claim = async (day: string) => (await db.query<{ items: BirthdayPush[] }>('select claim_orixa_push($1) items', [day])).rows[0].items;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;`);
    for (const name of ['001_initial.sql', '002_finance.sql', '003_username_auth.sql', '004_names_registration.sql', '005_medium_fields_dues_import.sql', '20261013111959_medium_birth_date.sql', '20261013112855_medium_sex.sql', '20261013153636_birthday_push_notifications.sql', '20261014113327_terreiro_memberships.sql', '20261014175430_dues_push_notifications.sql']) await migration(name);
    for (const [index, id] of [owner, admin, member, other, stranger].entries()) {
      await db.query('insert into auth.users values($1,$2,$3)', [id, `${id}@example.com`, { username: `pessoa_${index}`, role: 'administrador' }]);
      await db.query('insert into auth.sessions values($1,$2,null)', [sessions.get(id), id]);
    }
    // Uma casa antes da migração e outra depois verificam os dois caminhos de carga inicial.
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP')", [house, owner]);
    await migration('20261019195740_orixa_calendar.sql');
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Dois','São Paulo','SP')", [foreign, other]);
    await db.query("insert into terreiro_members(user_id,terreiro_id,role) values($1,$2,'administrador'),($3,$2,'usuario')", [admin, house, member]);
    // Aparelhos que já permitiram notificações também recebem as comemorações.
    await asUser(member); await db.query('select register_dues_push($1,$2,$3)', [`https://fcm.googleapis.com/fcm/send/${member}`, 'B' + 'a'.repeat(86), 'a'.repeat(22)]);
    await db.exec('reset role'); await migration('20261019195746_orixa_push_notifications.sql');
    await migration('20261019200446_orixa_calendar_responsavel_access.sql');
    await t.test('sete datas exatas, visíveis a todos da casa, sem escrita por usuário comum', async () => {
      await asUser(member);
      assert.deepEqual((await db.query('select name,month,day from orixa_calendar order by month,day')).rows, [
        { name: 'Oxóssi', month: 1, day: 20 }, { name: 'Yemanjá', month: 2, day: 2 }, { name: 'Ogum', month: 4, day: 23 }, { name: 'Xangô', month: 9, day: 30 }, { name: 'Yansã', month: 12, day: 4 }, { name: 'Oxum', month: 12, day: 8 }, { name: 'Oxalá', month: 12, day: 25 },
      ]);
      await assert.rejects(() => db.query("insert into orixa_calendar(terreiro_id,name,month,day) values($1,'Intruso',1,1)", [house]));
      assert.equal((await db.query("update orixa_calendar set name='Intruso' returning id")).rows.length, 0);
      assert.equal((await db.query('delete from orixa_calendar returning id')).rows.length, 0);
      assert.equal((await db.query('select * from orixa_calendar where terreiro_id=$1', [foreign])).rows.length, 0);
      await assert.rejects(() => claim('2027-01-20T11:00:00Z'));
      await assert.rejects(() => db.query('select * from private_notifications.orixa_deliveries'));
    });
    await t.test('administrador e responsável alteram a própria casa, com validação no banco', async () => {
      for (const id of [owner, admin]) {
        await asUser(id);
        const entry = (await db.query<{ id: string }>("insert into orixa_calendar(terreiro_id,name,month,day) values($1,'Celebração',2,29) returning id", [house])).rows[0].id;
        assert.equal((await db.query("update orixa_calendar set name='Outra celebração',day=28 where id=$1 returning id", [entry])).rows.length, 1);
        assert.equal((await db.query('delete from orixa_calendar where id=$1 returning id', [entry])).rows.length, 1);
        await assert.rejects(() => db.query("insert into orixa_calendar(terreiro_id,name,month,day) values($1,'Intruso',1,1)", [foreign]));
        await assert.rejects(() => db.query('update orixa_calendar set terreiro_id=$1', [foreign]));
        await assert.rejects(() => db.query("insert into orixa_calendar(terreiro_id,name,month,day) values($1,'Inválido',4,31)", [house]));
        await assert.rejects(() => db.query("insert into orixa_calendar(terreiro_id,name,month,day) values($1,' oxum ',12,8)", [house]));
      }
    });
    const devices = new Map<string, string>();
    for (const id of [owner, admin, member, other, stranger]) { await asUser(id); devices.set(id, await register(id)); }
    await t.test('sessão e dispositivo são privados e nem outro administrador pode apropriar-se deles', async () => {
      await asUser(admin);
      assert.equal((await db.query('select * from orixa_push_subscriptions')).rows.length, 1);
      await assert.rejects(() => register(member));
      await asUser(stranger); assert.equal((await db.query('select * from orixa_calendar')).rows.length, 0);
      await db.exec('reset role;set role anon'); await assert.rejects(() => db.query('select * from orixa_calendar'));
    });
    await t.test('avisa proprietário, administrador e médium sem cadastro associado; respeita horário e não duplica', async () => {
      await server(); assert.equal((await claim('2027-01-20T10:59:59Z')).length, 0);
      assert.equal((await claim('2027-01-19T11:00:00Z')).length, 0);
      const items = await claim('2027-01-20T11:00:00Z');
      assert.equal(items.length, 4); assert.equal(items.some(item => item.id === devices.get(stranger)), false);
      for (const item of items) assert.deepEqual(item.names, ['Oxóssi']);
      assert.equal((await claim('2027-01-20T11:01:00Z')).length, 0);
      await db.query('select finish_orixa_push($1,$2)', [devices.get(member), '2027-01-20']);
      assert.equal((await claim('2027-01-20T11:03:00Z')).length, 3);
      assert.equal((await claim('2027-01-20T11:06:00Z')).length, 3);
      assert.equal((await claim('2027-01-20T11:09:00Z')).length, 0);
      assert.equal((await claim('2028-01-20T11:00:00Z')).length, 4);
    });
    await t.test('edição, exclusão e revogação de sessão/vínculo mudam os próximos avisos', async () => {
      await asUser(admin); await db.query("update orixa_calendar set name='Oxóssi da casa',day=21 where name='Oxóssi'");
      await server(); const original = await claim('2029-01-20T11:00:00Z'); assert.equal(original.length, 1); assert.equal(original[0].id, devices.get(other));
      const moved = await claim('2029-01-21T11:00:00Z'); assert.equal(moved.length, 3); assert.deepEqual(moved[0].names, ['Oxóssi da casa']);
      await db.exec('reset role'); await db.query('delete from auth.sessions where user_id=$1', [member]); await db.query('delete from terreiro_members where user_id=$1', [admin]);
      await server(); assert.equal((await claim('2030-01-21T11:00:00Z')).length, 1);
      await db.exec('reset role'); await db.query("insert into terreiro_members(user_id,terreiro_id,role) values($1,$2,'administrador')", [admin, house]);
      await asUser(admin); await db.query("delete from orixa_calendar where name='Oxóssi da casa'");
      await server(); assert.equal((await claim('2031-01-21T11:00:00Z')).length, 0);
    });
    await t.test('lotes escoam aparelhos além do limite sem ficar presos nos primeiros registros', async () => {
      await db.exec('reset role');
      await db.query(`insert into orixa_push_subscriptions(user_id,session_id,endpoint,p256dh,auth_key)
        select $1,$2,'https://fcm.googleapis.com/fcm/send/bulk-'||n,$3,$4 from generate_series(1,51) n`, [owner, sessions.get(owner), 'B' + 'a'.repeat(86), 'a'.repeat(22)]);
      await server();
      const first = await claim('2032-12-08T11:00:00Z'); assert.equal(first.length, 50);
      const second = await claim('2032-12-08T11:00:30Z'); assert.equal(second.length, 4);
      assert.equal(second.some(item => first.some(previous => previous.id === item.id)), false);
    });
  } finally { await db.close(); }
});

test('tocar no aviso abre o calendário mesmo com o app já aberto', async () => {
  const handlers = new Map<string, (event: unknown) => void>(); const navigated: string[] = []; let focused = false;
  const self = { location: { origin: 'https://meuterreiro.vercel.app' }, addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler), clients: { matchAll: async () => [{ url: 'https://meuterreiro.vercel.app/', navigate: async (url: string) => { navigated.push(url); }, focus: async () => { focused = true; } }] } };
  runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL });
  let pending = Promise.resolve();
  handlers.get('notificationclick')!({ notification: { data: { url: '/?calendario=hoje' }, close: () => {} }, waitUntil: (work: Promise<void>) => { pending = work; } });
  await pending; assert.deepEqual(navigated, ['https://meuterreiro.vercel.app/?calendario=hoje']); assert.equal(focused, true);
});
