import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
export function migrationHash(sql) {
  return createHash('md5').update(sql.replace(/--[^\n]*/g, '').replace(/[\s;]/g, '')).digest('hex');
}

// Repara somente metadados conferidos em 20/10/2026; não executa os scripts das migrações.
// Qualquer divergência de conteúdo ou registro desconhecido interrompe a transação.
export async function buildMigrationHistoryRepair() {
  const snapshot = JSON.parse(await readFile(new URL('scripts/migration-history-snapshot.json', root), 'utf8'));
  const entries = [];
  for (const file of (await readdir(new URL('supabase/migrations/', root))).filter(name => name.endsWith('.sql')).sort()) {
    const [, version, name] = /^(\d+)_(.+)\.sql$/.exec(file);
    const sql = await readFile(new URL(`supabase/migrations/${file}`, root), 'utf8');
    const baseline = ['001', '002', '003', '004'].includes(version);
    const remote = snapshot.find(row => row.name === name);
    const hash = migrationHash(sql);
    if (!baseline && !remote) throw new Error(`Migração fora da revisão: ${file}`);
    const repairDelimiters = name === 'dues_admin_summary' && migrationHash(sql.replace(/\$\$/g, '$')) === remote?.normalized_hash;
    if (!baseline && hash !== remote.normalized_hash && !repairDelimiters) throw new Error(`Conteúdo alterado desde a revisão: ${file}`);
    entries.push({ version, name, baseline, old_version: remote?.version ?? version, expected_hash: remote?.normalized_hash ?? hash, hash, metadata_sql: baseline || repairDelimiters ? sql : null });
  }
  if (entries.length !== 24 || snapshot.length !== 20) throw new Error('Conjunto de migrações diferente do revisado.');
  const json = JSON.stringify(entries);
  if (json.includes('$history_payload$')) throw new Error('Delimitador reservado no conteúdo.');
  return `begin;
lock table supabase_migrations.schema_migrations in share row exclusive mode;
do $history_repair$
declare
  expected jsonb := $history_payload$${json}$history_payload$::jsonb;
  item jsonb; object_name text; found_count integer; found_name text; found_hash text;
begin
  -- As quatro migrações iniciais foram aplicadas antes do uso do histórico.
  foreach object_name in array array['public.terreiros','public.mediuns','public.mensalidades','public.gastos','public.caixa','public.lembretes','public.account_usernames','private_auth.login_limits'] loop
    if to_regclass(object_name) is null then raise exception 'Baseline ausente: %', object_name; end if;
  end loop;
  foreach object_name in array array['public._finance_lock_house(uuid)','public.finance_create_dues(uuid,uuid[],date,date,integer,boolean)','public.finance_pay_due(uuid,date)','public.finance_create_reminder(uuid,text,text,date,uuid)','public.finance_create_expense(uuid,text,text,integer,date,uuid,uuid)','public.finance_create_income(uuid,text,text,integer,date,uuid)','public._register_account_username()','public.auth_email_for_username(text)','public.auth_take_login_attempt(text[])'] loop
    if to_regprocedure(object_name) is null then raise exception 'Baseline ausente: %', object_name; end if;
  end loop;
  if not exists(select 1 from pg_attribute where attrelid='public.account_usernames'::regclass and attname='full_name' and attnotnull)
    or not exists(select 1 from pg_trigger where tgname='register_account_username' and tgrelid='auth.users'::regclass)
    then raise exception 'Baseline de contas incompleta'; end if;
  if exists(select 1 from supabase_migrations.schema_migrations m where not exists(
    select 1 from jsonb_array_elements(expected) e where m.version in (e->>'version',e->>'old_version')))
    then raise exception 'Histórico contém migrações fora da revisão'; end if;
  -- Valida todo o lote antes da primeira gravação.
  for item in select value from jsonb_array_elements(expected) loop
    select count(*),min(name),min(md5(regexp_replace(regexp_replace(array_to_string(statements,E'\\n'),E'--[^\\n]*','','g'),'[[:space:];]','','g')))
      into found_count,found_name,found_hash from supabase_migrations.schema_migrations
      where version in (item->>'version',item->>'old_version');
    if found_count=0 and (item->>'baseline')::boolean then continue; end if;
    if found_count<>1 or found_name is distinct from item->>'name'
      or found_hash is null or found_hash not in (item->>'expected_hash',item->>'hash')
      then raise exception 'Histórico divergente para %',item->>'name'; end if;
  end loop;
  for item in select value from jsonb_array_elements(expected) loop
    if (item->>'baseline')::boolean then
      insert into supabase_migrations.schema_migrations(version,name,statements)
        values(item->>'version',item->>'name',array[item->>'metadata_sql']) on conflict(version) do nothing;
    else
      update supabase_migrations.schema_migrations set version=item->>'version' where version=item->>'old_version';
      if item->>'metadata_sql' is not null then
        update supabase_migrations.schema_migrations set statements=array[item->>'metadata_sql'] where version=item->>'version';
      end if;
    end if;
  end loop;
end $history_repair$;
commit;
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildMigrationHistoryRepair().then(sql => process.stdout.write(sql)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
