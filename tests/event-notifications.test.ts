import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { eventPayload } from '../supabase/functions/_shared/event-notifications';
import { createBirthdayNotifications, type BirthdayPush, type BirthdayPayload } from '../supabase/functions/_shared/birthday-notifications';

test('avisos de eventos autenticam, reconsultam antes do envio e tratam falhas', async () => {
  const row: BirthdayPush = { id: 'device', endpoint: 'https://fcm.googleapis.com/fcm/send/device', p256dh: 'key', auth_key: 'auth', day: '2027-12-08', names: ['Título antigo'] };
  const sent: BirthdayPayload[] = []; let claims = 0, finished = 0, removed = 0, failure = 0, available = true;
  const handler = createBirthdayNotifications({ cronSecret: 'cron-secret', origins: ['https://meuterreiro.vercel.app'], payload: eventPayload }, {
    getUser: async token => token === 'member-token' ? 'member' : null,
    claim: async () => { claims++; return [row]; },
    refresh: async item => available ? { ...item, names: ['Gira de atendimento às 20:00 · Templo'] } : null,
    find: async (user, endpoint) => user === 'member' && endpoint === row.endpoint ? row : null,
    send: async (_item, payload) => { if (failure) throw { statusCode: failure }; sent.push(payload); },
    finish: async () => { finished++; }, remove: async () => { removed++; }, health: async () => true,
  });
  const request = (token = '', body: unknown = {}, origin = 'https://meuterreiro.vercel.app') => handler(new Request('https://example.com', { method: 'POST', headers: { authorization: `Bearer ${token}`, origin }, body: JSON.stringify(body) }));
  assert.equal((await request()).status, 401); assert.equal((await request('bad')).status, 401);
  assert.equal((await request('cron-secret', {}, 'https://evil.example')).status, 403);
  assert.equal((await request('member-token')).status, 400); assert.equal(claims, 0);
  assert.equal((await request('member-token', { action: 'test', endpoint: row.endpoint + '-other' })).status, 404);
  assert.equal((await request('cron-secret', { action: 'health' })).status, 200); assert.equal(claims, 0);
  assert.equal((await request('cron-secret')).status, 200); assert.equal(finished, 1);
  assert.equal(sent[0].title, 'Evento de hoje 📅'); assert.match(sent[0].body, /Gira de atendimento às 20:00 · Templo/);
  assert.equal(sent[0].url, '/?eventos=hoje'); assert.equal(sent[0].tag, 'eventos-2027-12-08');
  available = false; await request('cron-secret'); assert.equal(sent.length, 1); assert.equal(finished, 1);
  available = true; failure = 503; assert.equal((await request('cron-secret')).status, 503); assert.equal(finished, 1);
  failure = 410; assert.equal((await request('cron-secret')).status, 200); assert.equal(removed, 1);
  const summary = eventPayload(['A', 'B', 'C', 'D'], '2027-12-08');
  assert.equal(summary.title, 'Eventos de hoje 📅'); assert.match(summary.body, /e mais 1 evento\./);
});

test('PostgreSQL: todos os perfis recebem eventos da própria casa sem exigir confirmação de presença', async t => {
  const db = new PGlite();
  const [owner, admin, member, other, outsider] = Array.from({ length: 5 }, () => crypto.randomUUID());
  const house = crypto.randomUUID(), foreign = crypto.randomUUID();
  const sessions = new Map([owner, admin, member, other, outsider].map(id => [id, crypto.randomUUID()]));
  const devices = new Map<string, string>();
  const asUser = async (id: string) => {
    await db.exec('reset role;set role authenticated');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, session_id: sessions.get(id), role: 'authenticated' })]);
  };
  const server = async () => {
    await db.exec('reset role;set role service_role');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  };
  const claim = async (now: string) => (await db.query<{ items: BirthdayPush[] }>('select claim_event_push($1) items', [now])).rows[0].items;
  const current = async (id: string, day = '2027-12-08', now = '2027-12-08T11:01:00Z') => (await db.query<{ item: BirthdayPush | null }>('select current_event_push($1,$2,$3) item', [id, day, now])).rows[0].item;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;`);
    for (const name of ['001_initial.sql', '002_finance.sql', '003_username_auth.sql', '004_names_registration.sql', '005_medium_fields_dues_import.sql', '20261013111959_medium_birth_date.sql', '20261013112855_medium_sex.sql', '20261013153636_birthday_push_notifications.sql', '20261014113327_terreiro_memberships.sql', '20261014175430_dues_push_notifications.sql', '20261019154338_house_events.sql', '20261019195740_orixa_calendar.sql', '20261019195746_orixa_push_notifications.sql', '20261019205531_event_push_notifications.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    for (const [index, id] of [owner, admin, member, other, outsider].entries()) {
      await db.query('insert into auth.users values($1,$2,$3)', [id, `${id}@example.com`, { username: `pessoa_${index}`, role: 'administrador' }]);
      await db.query('insert into auth.sessions values($1,$2,null)', [sessions.get(id), id]);
    }
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')", [house, owner, foreign, other]);
    await db.query("insert into terreiro_members(user_id,terreiro_id,role) values($1,$2,'administrador'),($3,$2,'usuario')", [admin, house, member]);
    await db.query(`insert into eventos(terreiro_id,title,occurs_on,starts_at,location) values
      ($1,'Gira de atendimento','2027-12-08','20:00','Templo'),($1,'Reunião','2027-12-08',null,''),
      ($1,'Ontem','2027-12-07',null,''),($1,'Amanhã','2027-12-09',null,''),($2,'Outra casa','2027-12-08',null,'')`, [house, foreign]);
    for (const id of [owner, admin, member, other, outsider]) {
      await asUser(id);
      const device = (await db.query<{ id: string }>('select register_orixa_push($1,$2,$3) id', [`https://fcm.googleapis.com/fcm/send/${id}`, 'B' + 'a'.repeat(86), 'a'.repeat(22)])).rows[0].id;
      devices.set(id, device);
    }
    await t.test('fila e nomes não são acessíveis a usuários nem visitantes', async () => {
      await asUser(member);
      await assert.rejects(() => claim('2027-12-08T11:00:00Z'));
      await assert.rejects(() => current(devices.get(member)!));
      await assert.rejects(() => db.query('select finish_event_push($1,$2)', [devices.get(member), '2027-12-08']));
      await assert.rejects(() => db.query('select * from private_event_notifications.deliveries'));
      await db.exec('reset role;set role anon'); await assert.rejects(() => claim('2027-12-08T11:00:00Z'));
    });
    await t.test('horário, data e eventos são isolados por casa e incluem responsável, administrador e médium', async () => {
      await server(); assert.equal((await claim('2027-12-08T10:59:59Z')).length, 0);
      assert.equal((await claim('2027-12-08T12:00:00Z')).length, 0); assert.equal((await claim('2027-12-06T11:00:00Z')).length, 0);
      assert.equal(await current(devices.get(member)!, '2027-12-09'), null);
      const items = await claim('2027-12-08T11:00:00Z'); assert.equal(items.length, 4);
      assert.equal(items.some(item => item.id === devices.get(outsider)), false);
      for (const id of [owner, admin, member]) assert.deepEqual(items.find(item => item.id === devices.get(id))?.names, ['Gira de atendimento às 20:00 · Templo', 'Reunião']);
      assert.deepEqual(items.find(item => item.id === devices.get(other))?.names, ['Outra casa']);
      assert.equal((await claim('2027-12-08T11:01:00Z')).length, 0);
      await db.query('select finish_event_push($1,$2)', [devices.get(member), '2027-12-08']);
      assert.equal((await claim('2027-12-08T11:03:00Z')).length, 3);
      assert.equal((await claim('2027-12-08T11:06:00Z')).length, 3);
      assert.equal((await claim('2027-12-08T11:09:00Z')).length, 0);
    });
    await t.test('reconsulta aplica edição/exclusão e ignora vínculo revogado e sessão encerrada/expirada', async () => {
      await db.exec('reset role'); await db.query("update eventos set title='Gira alterada',starts_at='19:30' where title='Gira de atendimento'"); await server();
      assert.deepEqual((await current(devices.get(member)!))?.names, ['Gira alterada às 19:30 · Templo', 'Reunião']);
      await db.exec('reset role'); await db.query('delete from terreiro_members where user_id=$1', [member]); await server(); assert.equal(await current(devices.get(member)!), null);
      await db.exec('reset role'); await db.query("update auth.sessions set not_after='2027-12-08T10:00:00Z' where user_id=$1", [admin]); await server(); assert.equal(await current(devices.get(admin)!), null);
      await db.exec('reset role'); await db.query('delete from auth.sessions where user_id=$1', [owner]); await server(); assert.equal(await current(devices.get(owner)!), null);
      await db.exec('reset role'); await db.query('delete from eventos where terreiro_id=$1', [foreign]); await server(); assert.equal(await current(devices.get(other)!), null);
      await db.exec('reset role'); await db.query('delete from eventos where terreiro_id=$1', [house]); await server(); assert.equal((await claim('2027-12-09T11:00:00Z')).length, 0);
    });
    await t.test('lotes atendem mais de 50 aparelhos e o controle de envio é independente do calendário', async () => {
      await db.exec('reset role');
      await db.query('insert into auth.sessions values($1,$2,null)', [sessions.get(owner), owner]);
      await db.query("insert into eventos(terreiro_id,title,occurs_on) values($1,'Evento em janeiro','2028-01-20')", [house]);
      await db.query(`insert into orixa_push_subscriptions(user_id,session_id,endpoint,p256dh,auth_key)
        select $1,$2,'https://fcm.googleapis.com/fcm/send/bulk-event-'||n,$3,$4 from generate_series(1,51) n`, [owner, sessions.get(owner), 'B' + 'a'.repeat(86), 'a'.repeat(22)]);
      await server();
      const calendar = (await db.query<{ items: BirthdayPush[] }>("select claim_orixa_push('2028-01-20T11:00:00Z') items")).rows[0].items;
      assert.equal(calendar.length, 50);
      const first = await claim('2028-01-20T11:00:00Z'); assert.equal(first.length, 50);
      const second = await claim('2028-01-20T11:00:30Z'); assert.equal(second.length, 2);
      assert.equal(second.some(item => first.some(previous => previous.id === item.id)), false);
    });
  } finally { await db.close(); }
});

test('tocar no aviso abre Eventos com o app aberto ou fechado e rejeita links externos', async () => {
  const handlers = new Map<string, (event: unknown) => void>(); const navigated: string[] = [], opened: string[] = []; let running = true, focused = false;
  const self = { location: { origin: 'https://meuterreiro.vercel.app' }, addEventListener: (name: string, handler: (event: unknown) => void) => handlers.set(name, handler), clients: {
    matchAll: async () => running ? [{ url: 'https://meuterreiro.vercel.app/', navigate: async (url: string) => { navigated.push(url); }, focus: async () => { focused = true; } }] : [],
    openWindow: async (url: string) => { opened.push(url); },
  } };
  runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL });
  let pending = Promise.resolve();
  const click = (url: string) => handlers.get('notificationclick')!({ notification: { data: { url }, close: () => {} }, waitUntil: (work: Promise<void>) => { pending = work; } });
  click('/?eventos=hoje'); await pending; assert.deepEqual(navigated, ['https://meuterreiro.vercel.app/?eventos=hoje']); assert.equal(focused, true);
  running = false; click('/?eventos=hoje'); await pending; assert.equal(opened[0], 'https://meuterreiro.vercel.app/?eventos=hoje');
  click('https://evil.example/?eventos=hoje'); await pending; assert.equal(opened[1], 'https://meuterreiro.vercel.app/');
});
