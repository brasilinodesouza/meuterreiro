import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildMigrationHistoryRepair } from '../scripts/reconcile-migration-history.mjs';

test('reconciliação do histórico valida o lote, preserva SQL e dados e é idempotente', async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);`);
    for (const name of ['001_initial.sql','002_finance.sql','003_username_auth.sql','004_names_registration.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    const snapshot = JSON.parse(await readFile(new URL('../scripts/migration-history-snapshot.json', import.meta.url), 'utf8')) as {version:string;name:string}[];
    const files = await readdir(new URL('../supabase/migrations/', import.meta.url));
    for (const row of snapshot) {
      const file = files.find(file => file.replace(/^\d+_/, '').replace(/\.sql$/, '') === row.name)!;
      let sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
      if (row.name === 'dues_admin_summary') sql = sql.replace(/\$\$/g, '$');
      await db.query('insert into supabase_migrations.schema_migrations values($1,$2,$3)', [row.version,row.name,[sql]]);
    }
    const repair = await buildMigrationHistoryRepair();
    const history = async () => (await db.query<{version:string;name:string;statements:string[]}>('select * from supabase_migrations.schema_migrations order by version')).rows;
    await t.test('conteúdo inesperado interrompe sem registrar baseline nem mudar outras versões', async () => {
      await db.exec("update supabase_migrations.schema_migrations set statements=array['select 123'] where name='medium_sex'");
      const before = await history();
      await assert.rejects(() => db.exec(repair), /Histórico divergente/);
      await db.exec('rollback');
      assert.deepEqual(await history(), before);
      const sql = await readFile(new URL('../supabase/migrations/20261013112855_medium_sex.sql', import.meta.url), 'utf8');
      await db.query("update supabase_migrations.schema_migrations set statements=$1 where name='medium_sex'", [[sql]]);
    });
    await t.test('baseline ausente aborta sem reaplicar criação de tabelas', async () => {
      await db.exec('alter table public.account_usernames alter column full_name drop not null');
      const before = await history();
      await assert.rejects(() => db.exec(repair), /Baseline de contas incompleta/);
      await db.exec('rollback');
      assert.deepEqual(await history(), before);
      await db.exec('alter table public.account_usernames alter column full_name set not null');
    });
    await t.test('corrige datas e delimitadores nos metadados e pode executar novamente', async () => {
      await db.exec(repair);
      const first = await history();
      assert.equal(first.length, 24);
      assert.deepEqual(first.map(row => row.version), files.map(file => file.split('_')[0]).sort());
      const summary = first.find(row => row.name === 'dues_admin_summary')!;
      assert.deepEqual(summary.statements, [await readFile(new URL('../supabase/migrations/20261016160751_dues_admin_summary.sql', import.meta.url), 'utf8')]);
      await db.exec(repair);
      assert.deepEqual(await history(), first);
      assert.equal((await db.query<{count:number}>('select count(*)::integer as count from public.terreiros')).rows[0].count, 0);
    });
  } finally { await db.close(); }
});
