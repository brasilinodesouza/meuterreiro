import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { parseDuesReport, pdfItemsToLines, previewDuesImport, type ImportedDue } from '../src/lib/dues-import';
import type { Medium } from '../src/lib/data';
import type { Due } from '../src/lib/finance';
import { mediumFixture } from './fixtures';

const header = ['Centro de Umbanda Casa de Teste','Relatório de Mensalidades','Nome Valor Mês Ref. Data Pag. Status'];
const report = [...header, 'Médium Um R$ 100,00 Setembro/2026 2026-08-31 Pago', header[2], 'Médium Dois R$ 50,00 Outubro/2026 — Pendente'];
const people: Medium[] = ['Médium Um','Médium Dois'].map((name,index) => ({ ...mediumFixture, status: 'ativo', name, id: String(index), terreiro_id: 'house', created_at: '2026-01-01T00:00:00Z' }));
test('relatório preserva competência, valores e pagamento antecipado, com vencimento no dia 10', () => {
  const rows = parseDuesReport(report);
  assert.deepEqual(rows, [
    { name: 'Médium Um', reference: '2026-09-01', due_on: '2026-09-10', amount_cents: 10000, status: 'pago', paid_on: '2026-08-31' },
    { name: 'Médium Dois', reference: '2026-10-01', due_on: '2026-10-10', amount_cents: 5000, status: 'pendente', paid_on: null },
  ]);
  for (const invalid of [report.slice(2), [...report,'Médium Três R$ 100,00 Outubro/2026 — Isento'], [...report,'Médium Três R$ 100,00 Outubro/2026 — Pago'], [...report,'Médium Três R$ 100,00 Outubro/2026 2026-02-30 Pago'], [...report,'Médium Três R$ 100,00 Outubro/2026 2026-10-01 Pendente'], [...report,'Linha incompleta']]) assert.throws(() => parseDuesReport(invalid));
});
test('texto do PDF é ordenado por linha e coluna, sem misturar nomes e valores', () => {
  const item = (str:string,x:number,y:number) => ({ str, transform:[1,0,0,1,x,y] });
  assert.deepEqual(pdfItemsToLines([item('R$ 100,00',100,80),item('Cabeçalho',0,100),item('Médium Um',0,80),item('Pago',200,80.2)]),['Cabeçalho','Médium Um R$ 100,00 Pago']);
});
test('prévia bloqueia nomes ausentes, homônimos, duplicações e divergências', () => {
  const rows = parseDuesReport(report);
  assert.deepEqual(previewDuesImport(rows,people,[]).map(row => row.state),['new','new']);
  assert.equal(previewDuesImport([{ ...rows[0], name:'  MÉDIUM   UM  ' }],people,[])[0].medium?.id,'0');
  assert.equal(previewDuesImport(rows,[],[])[0].state,'error');
  assert.equal(previewDuesImport(rows,[...people,{...people[0],id:'other'}],[])[0].state,'error');
  assert.equal(previewDuesImport([rows[0],rows[0]],people,[])[1].state,'error');
  const existing: Due = { ...rows[0], medium_id:'0',id:'due',terreiro_id:'house',created_at:'2026-10-01T00:00:00Z' };
  assert.equal(previewDuesImport(rows,people,[existing])[0].state,'existing');
  assert.equal(previewDuesImport(rows,people,[{...existing,amount_cents:5000}])[0].state,'error');
  assert.equal(previewDuesImport(rows,people,[{...existing,paid_on:'2026-09-01'}])[0].state,'error');
});

test('PostgreSQL: importação atômica, isolamento, repetição e cadastro sem campos removidos', async t => {
  const db = new PGlite();
  const owner1='11111111-1111-4111-8111-111111111111',owner2='22222222-2222-4222-8222-222222222222';
  const house1='33333333-3333-4333-8333-333333333333',house2='44444444-4444-4444-8444-444444444444';
  const person1='55555555-5555-4555-8555-555555555555';
  const rows = parseDuesReport(report);
  const save = (records: ImportedDue[], house = house1) => db.query<{ result:{imported:number;skipped:number;payments:number} }>('select finance_import_dues($1,$2::jsonb) result',[house,JSON.stringify(records)]);
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const file of ['001_initial.sql','002_finance.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
    await db.query('insert into auth.users values($1),($2)',[owner1,owner2]);
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')",[house1,owner1,house2,owner2]);
    await db.query("insert into mediuns(id,terreiro_id,name,role,joined_on,email) values($1,$2,'Médium Um','Cambone','2020-01-01','antigo@example.com')",[person1,house1]);
    await db.exec(await readFile(new URL('../supabase/migrations/005_medium_fields_dues_import.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261013111959_medium_birth_date.sql',import.meta.url),'utf8'));
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${owner1}',false);`);
    await t.test('cadastro simplificado mantém informações antigas e permite novas pessoas sem data inventada', async () => {
      assert.deepEqual((await db.query<{role:string;joined_on:string;email:string}>('select role,joined_on::text,email from mediuns where id=$1',[person1])).rows[0],{role:'Cambone',joined_on:'2020-01-01',email:'antigo@example.com'});
      await db.query("insert into mediuns(terreiro_id,name) values($1,'Médium Dois')",[house1]);
      assert.equal((await db.query<{joined_on:null}>("select joined_on from mediuns where name='Médium Dois'")).rows[0].joined_on,null);
    });
    await t.test('nome ausente, repetição no arquivo e data inválida revertem o lote inteiro', async () => {
      await assert.rejects(save([rows[0],{...rows[1],name:'Pessoa ausente'}]));
      await assert.rejects(save([rows[0],rows[0]]));
      await assert.rejects(save([rows[0],{...rows[1],due_on:'2026-02-30'}]));
      await assert.rejects(save([rows[0],{...rows[1],due_on:'2026-10-11'}]));
      assert.equal((await db.query('select id from mensalidades')).rows.length,0);
      assert.equal((await db.query('select id from caixa')).rows.length,0);
    });
    await t.test('nascimento vazio preserva cadastros e a edição aceita somente datas válidas sem fuso', async () => {
      assert.equal((await db.query<{birth_date:null}>('select birth_date from mediuns where id=$1',[person1])).rows[0].birth_date,null);
      await db.query("update mediuns set birth_date='2000-02-29' where id=$1",[person1]);
      assert.equal((await db.query<{birth_date:string}>('select birth_date::text from mediuns where id=$1',[person1])).rows[0].birth_date,'2000-02-29');
      await assert.rejects(db.query("update mediuns set birth_date='2025-02-29' where id=$1",[person1]));
      await assert.rejects(db.query("update mediuns set birth_date='9999-01-01' where id=$1",[person1]));
      await db.query('update mediuns set birth_date=null where id=$1',[person1]);
      assert.equal((await db.query<{birth_date:null}>('select birth_date from mediuns where id=$1',[person1])).rows[0].birth_date,null);
    });
    await t.test('falha na entrada de caixa reverte mensalidades e pagamentos', async () => {
      await db.exec("reset role;create function public.fail_import_cash() returns trigger language plpgsql as $$ begin raise exception 'Falha simulada'; end $$;create trigger fail_import_cash before insert on caixa for each row execute function public.fail_import_cash();set role authenticated;");
      await assert.rejects(save(rows));
      assert.equal((await db.query('select id from mensalidades')).rows.length,0);
      await db.exec('reset role;drop trigger fail_import_cash on caixa;drop function public.fail_import_cash();set role authenticated;');
    });
    await t.test('pagamento é único e pendência não gera entrada no caixa', async () => {
      assert.deepEqual((await save(rows)).rows[0].result,{imported:2,skipped:0,payments:1});
      assert.deepEqual((await save(rows)).rows[0].result,{imported:0,skipped:2,payments:0});
      assert.equal((await db.query('select id from mensalidades')).rows.length,2);
      assert.deepEqual((await db.query<{amount_cents:number;occurred_on:string}>('select amount_cents,occurred_on::text from caixa')).rows,[{amount_cents:10000,occurred_on:'2026-08-31'}]);
    });
    await t.test('conflito em registro existente reverte também novos registros do lote', async () => {
      await assert.rejects(save([{...rows[0],reference:'2026-11-01',due_on:'2026-11-10'},{...rows[1],amount_cents:10000}]));
      assert.equal((await db.query('select id from mensalidades')).rows.length,2);
    });
    await t.test('homônimos impedem vínculo automático', async () => {
      await db.query("insert into mediuns(terreiro_id,name) values($1,'Médium Um')",[house1]);
      await assert.rejects(save([{...rows[0],reference:'2026-11-01',due_on:'2026-11-10'}]));
    });
    await t.test('outra conta e visitante não conseguem importar nesta casa', async () => {
      await db.exec(`select set_config('request.jwt.claim.sub','${owner2}',false)`);
      await assert.rejects(save(rows));
      await assert.rejects(save(rows,house2));
      await db.query("update mediuns set birth_date='2000-01-01' where id=$1",[person1]);
      await db.exec(`select set_config('request.jwt.claim.sub','${owner1}',false)`);
      assert.equal((await db.query<{birth_date:null}>('select birth_date from mediuns where id=$1',[person1])).rows[0].birth_date,null);
      await db.exec(`select set_config('request.jwt.claim.sub','${owner2}',false)`);
      assert.equal((await db.query('select id from mensalidades')).rows.length,0);
      await db.exec('set role anon');
      await assert.rejects(save(rows));
    });
  } finally { await db.close(); }
});
