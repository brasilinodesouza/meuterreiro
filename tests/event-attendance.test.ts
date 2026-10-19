import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: confirmações únicas, privacidade dos nomes e contagem exclusiva da administração', async t => {
  const db = new PGlite();
  const [owner, admin, member, second, otherOwner, stranger] = Array.from({ length: 6 }, () => crypto.randomUUID());
  const house = crypto.randomUUID(), otherHouse = crypto.randomUUID();
  const asUser = async (id: string) => { await db.exec('reset role; set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
  const confirm = (eventId: string, userId: string) => db.query('insert into evento_presencas(event_id,user_id) values($1,$2) on conflict(event_id,user_id) do nothing', [eventId, userId]);
  const list = async (eventId: string) => (await db.query<{ user_id: string; full_name: string; username: string }>('select * from event_list_attendees($1)', [eventId])).rows;
  const count = async (eventId: string) => (await db.query<{ total: number }>('select count(*)::int total from evento_presencas where event_id=$1', [eventId])).rows[0].total;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const name of ['001_initial.sql', '002_finance.sql', '003_username_auth.sql', '004_names_registration.sql', '005_medium_fields_dues_import.sql', '20261013111959_medium_birth_date.sql', '20261013112855_medium_sex.sql', '20261014113327_terreiro_memberships.sql', '20261019154338_house_events.sql', '20261019161559_event_attendance.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    for (const [index, id] of [owner, admin, member, second, otherOwner, stranger].entries()) await db.query('insert into auth.users values($1,$2,$3)', [id, `${id}@example.com`, { username: `presenca_${index}`, full_name: `Pessoa ${index}`, role: 'administrador' }]);
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')", [house, owner, otherHouse, otherOwner]);
    await db.query("insert into terreiro_members(user_id,terreiro_id,role) values($1,$2,'administrador'),($3,$2,'usuario'),($4,$2,'usuario')", [admin, house, member, second]);
    const dates = (await db.query<{ today: string; yesterday: string; next_month: string }>(`select
      ((now() at time zone 'America/Sao_Paulo')::date)::text today,
      ((now() at time zone 'America/Sao_Paulo')::date - 1)::text yesterday,
      ((date_trunc('month',now() at time zone 'America/Sao_Paulo') + interval '1 month')::date)::text next_month`)).rows[0];
    const createEvent = async (houseId: string, title: string, date: string) => (await db.query<{ id: string }>('insert into eventos(terreiro_id,title,occurs_on) values($1,$2,$3) returning id', [houseId, title, date])).rows[0].id;
    const current = await createEvent(house, 'Encontro atual', dates.today), future = await createEvent(house, 'Encontro futuro', dates.next_month), past = await createEvent(house, 'Encontro passado', dates.yesterday), foreign = await createEvent(otherHouse, 'Outra casa', dates.today);

    await t.test('cada conta confirma a si mesma uma vez, inclusive em repetição por outro aparelho', async () => {
      await asUser(member); await confirm(current, member); await confirm(current, member);
      assert.equal(await count(current), 1);
      for (const userId of [second, owner, admin]) { await asUser(userId); await confirm(current, userId); await confirm(current, userId); }
      assert.equal(await count(current), 4);
      for (const userId of [owner, admin]) { await asUser(userId); await confirm(future, userId); }
      assert.equal(await count(future), 2);
    });
    await t.test('médium só lê a própria confirmação e não pode personificar, alterar data ou confirmar evento oculto', async () => {
      await asUser(member);
      assert.equal(await count(current), 1);
      await assert.rejects(() => list(current));
      await assert.rejects(() => confirm(current, stranger));
      for (const eventId of [future, past, foreign, crypto.randomUUID()]) await assert.rejects(() => confirm(eventId, member));
      await assert.rejects(() => db.query('update evento_presencas set user_id=$1', [second]));
      await assert.rejects(() => db.query("insert into evento_presencas(event_id,user_id,confirmed_at) values($1,$2,now())", [current, member]));
      assert.equal((await db.query('delete from evento_presencas where user_id=$1 returning user_id', [second])).rows.length, 0);
    });
    await t.test('responsável e administrador veem total e nomes corretos somente da própria casa', async () => {
      for (const userId of [owner, admin]) {
        await asUser(userId);
        assert.equal(await count(current), 4);
        assert.deepEqual((await list(current)).map(row => row.full_name), ['Pessoa 0', 'Pessoa 1', 'Pessoa 2', 'Pessoa 3']);
        assert.equal((await list(future)).length, 2);
        await assert.rejects(() => list(foreign));
        assert.equal((await db.query('delete from evento_presencas where event_id=$1 and user_id=$2 returning user_id', [current, member])).rows.length, 0);
      }
    });
    await t.test('cancelar a própria confirmação é repetível e atualiza a contagem e os nomes', async () => {
      await asUser(member);
      for (const expected of [1, 0]) assert.equal((await db.query('delete from evento_presencas where event_id=$1 and user_id=$2 returning user_id', [current, member])).rows.length, expected);
      await asUser(admin); assert.equal(await count(current), 3); assert.equal((await list(current)).some(row => row.user_id === member), false);
      await asUser(member); await confirm(current, member);
    });
    await t.test('troca de mês do evento oculta a confirmação do médium e preserva a contagem administrativa', async () => {
      await asUser(owner); await db.query('update eventos set occurs_on=$1 where id=$2', [dates.next_month, current]);
      await asUser(member); assert.equal(await count(current), 0); await assert.rejects(() => confirm(current, member));
      assert.equal((await db.query('delete from evento_presencas where event_id=$1 returning user_id', [current])).rows.length, 0);
      await asUser(owner); assert.equal(await count(current), 4); assert.equal((await list(current)).length, 4);
      await db.query('update eventos set occurs_on=$1 where id=$2', [dates.today, current]);
    });
    await t.test('visitantes, casa alheia e administração revogada não consultam nomes', async () => {
      for (const userId of [otherOwner, stranger, '']) { await asUser(userId); assert.equal(await count(current), 0); await assert.rejects(() => list(current)); }
      await db.exec('reset role; set role anon;');
      await assert.rejects(() => count(current)); await assert.rejects(() => list(current)); await assert.rejects(() => confirm(current, member));
      await db.exec('reset role'); await db.query("update terreiro_members set role='usuario' where user_id=$1", [admin]);
      await asUser(admin); assert.equal(await count(current), 1); assert.equal(await count(future), 0); await assert.rejects(() => list(current));
      await db.exec('reset role'); await db.query("update terreiro_members set role='administrador' where user_id=$1", [admin]);
    });
    await t.test('excluir conta ou evento remove as confirmações sem deixar contagens órfãs', async () => {
      await db.exec('reset role'); await db.query('delete from auth.users where id=$1', [second]);
      await asUser(owner); assert.equal(await count(current), 3); assert.equal((await list(current)).length, 3);
      await db.query('delete from eventos where id=$1', [current]);
      assert.equal(await count(current), 0); await assert.rejects(() => list(current));
      await db.exec('reset role'); assert.equal((await db.query<{ total: number }>('select count(*)::int total from evento_presencas where event_id=$1', [current])).rows[0].total, 0);
    });
  } finally { await db.close(); }
});
