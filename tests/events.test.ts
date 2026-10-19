import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { eventCalendar, eventInputSchema, eventSchema, upcomingEvents, type HouseEvent } from '../src/lib/events';

const input = { title: 'Gira da casa', occurs_on: '2026-10-25', starts_at: '19:30', location: 'Salão principal', description: 'Encontro da casa.' };
const event = (date: string, time: string | null = null): HouseEvent => ({ ...input, id: crypto.randomUUID(), terreiro_id: crypto.randomUUID(), occurs_on: date, starts_at: time, created_at: '2026-10-01T12:00:00Z' });

test('eventos validam campos, datas reais e horário opcional sem segundos', () => {
  assert.equal(eventInputSchema.parse({ ...input, title: '  Gira da casa  ' }).title, input.title);
  assert.equal(eventInputSchema.safeParse({ ...input, starts_at: null }).success, true);
  assert.equal(eventInputSchema.safeParse({ ...input, occurs_on: '2028-02-29' }).success, true);
  for (const change of [{ title: '  ' }, { title: 'a'.repeat(121) }, { occurs_on: '2026-02-29' }, { occurs_on: '0000-01-01' }, { starts_at: '24:00' }, { starts_at: '19:30:01' }, { location: 'a'.repeat(201) }, { description: 'a'.repeat(2001) }]) {
    assert.equal(eventInputSchema.safeParse({ ...input, ...change }).success, false);
  }
  assert.equal(eventSchema.parse({ ...event('2026-10-25'), starts_at: '19:30:00' }).starts_at, '19:30');
});

test('agenda respeita Brasília na virada do mês, dezembro e fevereiro bissexto', () => {
  assert.deepEqual(eventCalendar(new Date('2026-11-01T02:59:59Z')), { today: '2026-10-31', nextMonth: '2026-11-01', monthLabel: 'outubro de 2026' });
  assert.equal(eventCalendar(new Date('2026-11-01T03:00:00Z')).today, '2026-11-01');
  assert.equal(eventCalendar(new Date('2026-12-31T15:00:00Z')).nextMonth, '2027-01-01');
  assert.equal(eventCalendar(new Date('2028-02-29T15:00:00Z')).nextMonth, '2028-03-01');
  const events = [event('2026-11-01'), event('2026-10-31', '21:00'), event('2026-10-30'), event('2026-10-31'), event('2026-10-31', '19:00')];
  const before = new Date('2026-11-01T02:59:59Z');
  assert.deepEqual(upcomingEvents(events, false, before).map(item => item.starts_at), ['19:00', '21:00', null]);
  assert.equal(upcomingEvents(events, true, before).length, 4);
  assert.deepEqual(upcomingEvents(events, false, new Date('2026-11-01T03:00:00Z')).map(item => item.occurs_on), ['2026-11-01']);
});

test('PostgreSQL: somente administração grava; médiuns consultam só próximos eventos do mês da própria casa', async t => {
  const db = new PGlite();
  const owner = crypto.randomUUID(), admin = crypto.randomUUID(), member = crypto.randomUUID(), stranger = crypto.randomUUID(), otherOwner = crypto.randomUUID();
  const house = crypto.randomUUID(), otherHouse = crypto.randomUUID();
  const asUser = async (id: string) => { await db.exec('reset role; set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const name of ['001_initial.sql', '002_finance.sql', '003_username_auth.sql', '004_names_registration.sql', '005_medium_fields_dues_import.sql', '20261013111959_medium_birth_date.sql', '20261013112855_medium_sex.sql', '20261014113327_terreiro_memberships.sql', '20261019154338_house_events.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    for (const [index, id] of [owner, admin, member, stranger, otherOwner].entries()) await db.query('insert into auth.users values($1,$2,$3)', [id, `${id}@example.com`, { username: `pessoa_${index}`, role: 'administrador' }]);
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')", [house, owner, otherHouse, otherOwner]);
    await db.query("insert into terreiro_members(user_id,terreiro_id,role) values($1,$2,'administrador'),($3,$2,'usuario')", [admin, house, member]);
    const dates = (await db.query<{ today: string; yesterday: string; last_day: string; next_month: string; previous_month: string }>(`select
      ((now() at time zone 'America/Sao_Paulo')::date)::text today,
      ((now() at time zone 'America/Sao_Paulo')::date - 1)::text yesterday,
      ((date_trunc('month',now() at time zone 'America/Sao_Paulo') + interval '1 month - 1 day')::date)::text last_day,
      ((date_trunc('month',now() at time zone 'America/Sao_Paulo') + interval '1 month')::date)::text next_month,
      ((date_trunc('month',now() at time zone 'America/Sao_Paulo') - interval '1 month')::date)::text previous_month`)).rows[0];
    for (const [title, date] of [['Anterior', dates.previous_month], ['Passado', dates.yesterday], ['Hoje', dates.today], ['Fim do mês', dates.last_day], ['Mês futuro', dates.next_month]]) await db.query('insert into eventos(terreiro_id,title,occurs_on) values($1,$2,$3)', [house, title, date]);
    await db.query("insert into eventos(terreiro_id,title,occurs_on) values($1,'Outra casa',$2)", [otherHouse, dates.today]);
    await t.test('responsável e administrador cadastram, editam e excluem, inclusive eventos futuros', async () => {
      for (const id of [owner, admin]) {
        await asUser(id);
        assert.equal((await db.query('select * from eventos')).rows.length, 5);
        const row = (await db.query<{ id: string }>("insert into eventos(terreiro_id,title,occurs_on,starts_at) values($1,'Novo encontro',$2,'19:30') returning id", [house, dates.next_month])).rows[0];
        assert.equal((await db.query("update eventos set title='Encontro alterado' where id=$1 returning id", [row.id])).rows.length, 1);
        assert.equal((await db.query('delete from eventos where id=$1 returning id', [row.id])).rows.length, 1);
        await assert.rejects(() => db.query("insert into eventos(terreiro_id,title,occurs_on) values($1,'Intruso',$2)", [otherHouse, dates.today]));
        await assert.rejects(() => db.query('update eventos set terreiro_id=$1', [otherHouse]));
        await assert.rejects(() => db.query('update eventos set id=$1', [crypto.randomUUID()]));
        await assert.rejects(() => db.query("update eventos set created_at=now()"));
      }
    });
    await t.test('médium sem cadastro associado vê só hoje e o restante do mês, sem poder gravar', async () => {
      await asUser(member);
      await db.exec("set time zone 'Pacific/Kiritimati'");
      assert.deepEqual((await db.query<{ title: string }>('select title from eventos order by title')).rows.map(row => row.title), ['Fim do mês', 'Hoje']);
      assert.equal((await db.query('select * from eventos where occurs_on >= $1', [dates.next_month])).rows.length, 0);
      await assert.rejects(() => db.query("insert into eventos(terreiro_id,title,occurs_on) values($1,'Proibido',$2)", [house, dates.today]));
      assert.equal((await db.query("update eventos set title='Proibido' returning id")).rows.length, 0);
      assert.equal((await db.query('delete from eventos returning id')).rows.length, 0);
    });
    await t.test('anon, contas sem vínculo e outra casa não acessam a agenda', async () => {
      await asUser(stranger); assert.equal((await db.query('select * from eventos')).rows.length, 0);
      await asUser(otherOwner); assert.deepEqual((await db.query<{ title: string }>('select title from eventos')).rows.map(row => row.title), ['Outra casa']);
      await asUser(''); assert.equal((await db.query('select * from eventos')).rows.length, 0);
      await db.exec('reset role; set role anon;');
      await assert.rejects(() => db.query('select * from eventos'));
      await assert.rejects(() => db.query("insert into eventos(terreiro_id,title,occurs_on) values($1,'Proibido',$2)", [house, dates.today]));
    });
    await t.test('rebaixar administrador retira acesso futuro e escrita imediatamente', async () => {
      await db.exec('reset role'); await db.query("update terreiro_members set role='usuario' where user_id=$1", [admin]);
      await asUser(admin);
      assert.equal((await db.query('select * from eventos')).rows.length, 2);
      await assert.rejects(() => db.query("insert into eventos(terreiro_id,title,occurs_on) values($1,'Proibido',$2)", [house, dates.today]));
      assert.equal((await db.query('delete from eventos returning id')).rows.length, 0);
    });
    await t.test('banco também recusa campos inválidos, horários com segundos e datas infinitas', async () => {
      await asUser(owner);
      for (const values of [{ title: '  ', date: dates.today, time: null }, { title: 'a'.repeat(121), date: dates.today, time: null }, { title: 'Inválido', date: 'infinity', time: null }, { title: 'Inválido', date: dates.today, time: '24:00' }, { title: 'Inválido', date: dates.today, time: '19:00:01' }]) {
        await assert.rejects(() => db.query('insert into eventos(terreiro_id,title,occurs_on,starts_at) values($1,$2,$3,$4)', [house, values.title, values.date, values.time]));
      }
    });
  } finally { await db.close(); }
});
