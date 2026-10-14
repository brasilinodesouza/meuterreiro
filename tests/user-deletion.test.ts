import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: exclusão definitiva protege contas, sessões e histórico da casa', async t => {
  const db = new PGlite();
  const owner = crypto.randomUUID(), admin = crypto.randomUUID(), user = crypto.randomUUID();
  const otherOwner = crypto.randomUUID(), foreignUser = crypto.randomUUID(), stranger = crypto.randomUUID();
  const house = crypto.randomUUID(), otherHouse = crypto.randomUUID(), medium = crypto.randomUUID();
  const sessions = new Map([owner, admin, user, otherOwner, foreignUser, stranger].map(id => [id, crypto.randomUUID()]));
  async function asUser(id: string, sessionId = sessions.get(id)) {
    await db.exec('reset role; set role authenticated;');
    await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claims',$2,false)", [id, JSON.stringify({ session_id: sessionId })]);
  }
  async function value<T>(sql: string, args: unknown[] = []) { return (await db.query<{ value: T }>(sql, args)).rows[0].value; }
  const remove = (target = user, username = 'pessoa_1', targetHouse = house) => db.query('select terreiro_delete_user($1,$2,$3)', [targetHouse, target, username]);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
      create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id) on delete cascade, not_after timestamptz);
      create table auth.refresh_tokens(id uuid primary key, session_id uuid references auth.sessions(id) on delete cascade);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid(),auth.jwt() to authenticated,anon;`);
    for (const name of ['001_initial.sql', '002_finance.sql', '003_username_auth.sql', '004_names_registration.sql', '005_medium_fields_dues_import.sql', '20261013111959_medium_birth_date.sql', '20261013112855_medium_sex.sql', '20261014113327_terreiro_memberships.sql', '20261014135336_delete_terreiro_user.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    for (const [id, username] of [[owner, 'dono_01'], [admin, 'admin_01'], [user, 'pessoa_1'], [otherOwner, 'dono_02'], [foreignUser, 'pessoa_2'], [stranger, 'pessoa_3']]) {
      await db.query('insert into auth.users values($1,$2,$3)', [id, `${id}@example.com`, { username, full_name: username }]);
      await db.query('insert into auth.sessions values($1,$2,null)', [sessions.get(id), id]);
      await db.query('insert into auth.refresh_tokens values($1,$2)', [crypto.randomUUID(), sessions.get(id)]);
    }
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')", [house, owner, otherHouse, otherOwner]);
    await db.query("insert into mediuns(id,terreiro_id,name) values($1,$2,'Pessoa Um')", [medium, house]);
    await db.query("insert into terreiro_members(user_id,terreiro_id,role,medium_id) values($1,$2,'usuario',$3),($4,$2,'administrador',null),($5,$6,'usuario',null)", [user, house, medium, admin, foreignUser, otherHouse]);
    await asUser(owner);
    await db.query("select finance_create_dues($1,array[$2::uuid],'2026-10-01','2026-10-20',5000,false)", [house, medium]);
    const due = await value<string>('select id value from mensalidades');
    await db.query("select finance_pay_due($1,'2026-10-14')", [due]);

    await t.test('visitantes, usuários e administradores não podem excluir contas nem gravar diretamente no Auth', async () => {
      await db.exec('reset role;set role anon;');
      await assert.rejects(() => remove());
      for (const actor of [user, admin, stranger, otherOwner]) {
        await asUser(actor);
        await assert.rejects(() => remove(), /permissão/);
        await assert.rejects(() => db.query('delete from auth.users where id=$1', [user]));
        await assert.rejects(() => db.query('delete from terreiro_members where user_id=$1', [user]));
      }
    });
    await t.test('responsável não pode apagar a própria conta, outro responsável ou pessoa de outra casa', async () => {
      await asUser(owner);
      await assert.rejects(() => remove(owner, 'dono_01'), /responsável/);
      await assert.rejects(() => remove(otherOwner, 'dono_02'), /responsável/);
      await assert.rejects(() => remove(foreignUser, 'pessoa_2'), /não encontrado/);
      await assert.rejects(() => remove(stranger, 'pessoa_3'), /não encontrado/);
      await assert.rejects(() => remove(user, 'login_errado'), /não encontrado/);
      await assert.rejects(() => remove(user, 'pessoa_1', otherHouse), /permissão/);
    });
    await t.test('sessão ausente, revogada, expirada ou de outra pessoa bloqueia a exclusão', async () => {
      for (const session of [undefined, crypto.randomUUID(), sessions.get(user)]) {
        await asUser(owner, session ?? '');
        await assert.rejects(() => remove(), /sessão expirou/);
      }
      await db.exec('reset role;');
      await db.query("update auth.sessions set not_after=now()-interval '1 second' where user_id=$1", [owner]);
      await asUser(owner); await assert.rejects(() => remove(), /sessão expirou/);
      await db.exec('reset role;');
      await db.query('update auth.sessions set not_after=null where user_id=$1', [owner]);
    });
    await t.test('falha de dependência reverte exclusão de sessões e preserva conta, login e vínculo', async () => {
      await db.exec('create table public.account_dependencies(user_id uuid references auth.users(id) on delete restrict);');
      await db.query('insert into account_dependencies values($1)', [user]);
      await asUser(owner);
      await assert.rejects(() => remove(), /Nenhum dado foi apagado/);
      await db.exec('reset role;');
      for (const table of ['auth.users', 'auth.sessions', 'account_usernames', 'terreiro_members']) {
        assert.equal(await value(`select count(*)::int value from ${table} where ${table === 'auth.users' ? 'id' : 'user_id'}=$1`, [user]), 1);
      }
      assert.equal(await value('select count(*)::int value from auth.refresh_tokens where session_id=$1', [sessions.get(user)]), 1);
      await db.exec('drop table account_dependencies;');
    });
    await t.test('exclusão remove conta, login, vínculo, sessões e renovação sem apagar médium ou financeiro', async () => {
      await asUser(owner); await remove();
      assert.equal(await value('select count(*)::int value from mediuns where id=$1', [medium]), 1);
      assert.equal(await value('select status value from mensalidades where id=$1', [due]), 'pago');
      assert.equal(await value('select count(*)::int value from caixa'), 1);
      assert.equal(await value('select count(*)::int value from terreiros'), 1);
      await assert.rejects(() => remove(), /não encontrado/);
      await db.exec('reset role;');
      for (const table of ['auth.users', 'auth.sessions', 'account_usernames', 'terreiro_members']) {
        assert.equal(await value(`select count(*)::int value from ${table} where ${table === 'auth.users' ? 'id' : 'user_id'}=$1`, [user]), 0);
      }
      assert.equal(await value('select count(*)::int value from auth.refresh_tokens where session_id=$1', [sessions.get(user)]), 0);
      assert.equal(await value('select count(*)::int value from auth.users'), 5);
    });
    await t.test('JWT anterior perde acesso e não consegue recriar vínculo ou administrar a casa', async () => {
      await asUser(owner);
      const invite = await value<{ token: string }>('select terreiro_create_invite($1) value', [house]);
      await asUser(user);
      for (const table of ['terreiros', 'mediuns', 'mensalidades', 'caixa', 'account_usernames', 'terreiro_members']) assert.equal(await value(`select count(*)::int value from ${table}`), 0);
      await assert.rejects(() => db.query('select terreiro_join($1)', [invite.token]), /Conta inválida/);
      await assert.rejects(() => db.query('select terreiro_list_users($1)', [house]));
      await assert.rejects(() => remove(admin, 'admin_01'));
      await assert.rejects(() => db.query("select finance_create_income($1,'Intruso','Doação',1000,'2026-10-14',$2)", [house, crypto.randomUUID()]));
      await assert.rejects(() => db.query("insert into terreiros(owner_id,name,city,state) values($1,'Nova Casa','São Paulo','SP')", [user]));
    });
    await t.test('responsável também pode apagar administrador e o login liberado exige novo cadastro e convite', async () => {
      await asUser(owner); await remove(admin, 'admin_01');
      assert.equal(await value('select count(*)::int value from terreiro_members'), 0);
      await db.exec('reset role;');
      const replacement = crypto.randomUUID();
      await db.query('insert into auth.users values($1,$2,$3)', [replacement, `${replacement}@example.com`, { username: 'pessoa_1', full_name: 'Nova Pessoa' }]);
      await asUser(replacement);
      assert.equal(await value('select count(*)::int value from terreiros'), 0);
      assert.equal(await value('select count(*)::int value from mediuns'), 0);
      await asUser(owner);
      assert.equal(await value('select count(*)::int value from mediuns'), 1);
      assert.equal(await value('select count(*)::int value from mensalidades'), 1);
      assert.equal(await value('select count(*)::int value from caixa'), 1);
    });
  } finally { await db.close(); }
});
