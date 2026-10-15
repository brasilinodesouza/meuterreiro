import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { applyFinance, duesSchedule, emptyFinance } from '../src/lib/finance';

test('calendário anual para em dezembro, aceita novo ano explícito e ajusta meses curtos', () => {
  assert.deepEqual(duesSchedule('2026-10-01','2026-10-31',true), [
    { reference: '2026-10-01', due_on: '2026-10-31' },
    { reference: '2026-11-01', due_on: '2026-11-30' },
    { reference: '2026-12-01', due_on: '2026-12-31' },
  ]);
  assert.equal(duesSchedule('2026-12-01','2026-12-10',true).length,1);
  const nextYear = duesSchedule('2028-01-01','2028-01-31',true);
  assert.equal(nextYear.length,12); assert.equal(nextYear[1].due_on,'2028-02-29'); assert.equal(nextYear.at(-1)?.reference,'2028-12-01');
  assert.equal(duesSchedule('2027-01-01','2027-01-31',true)[1].due_on,'2027-02-28');
  assert.equal(duesSchedule('2026-10-01','2026-10-10').length,1);
  for (const [reference,due] of [['2026-13-01','2026-10-10'],['2026-10-02','2026-10-10'],['0000-01-01','0000-01-10'],['2026-10-01','2027-10-10'],['2026-10-01','2026-11-10']]) assert.throws(()=>duesSchedule(reference,due,true));
});

test('validação local preenche lacunas e preserva pagamentos, isenções, valores e caixa', () => {
  const single = { type: 'dues' as const, medium_ids: ['a'], reference: '2026-10-01', due_on: '2026-10-10', amount_cents: 5000, exempt: false };
  let state = applyFinance(emptyFinance(),single,'casa',['a','b']);
  state = applyFinance(state,{ type: 'pay', due_id: state.dues[0].id, paid_on: '2026-10-05', payment_method: 'pix' },'casa',['a','b']);
  state = applyFinance(state,{ ...single, medium_ids: ['b'], reference: '2026-11-01', due_on: '2026-11-10', exempt: true },'casa',['a','b']);
  const saved = structuredClone(state);
  const annual = { ...single, medium_ids: ['a','a','b'], amount_cents: 7500, through_year_end: true };
  const generated = applyFinance(state,annual,'casa',['a','b']);
  assert.equal(generated.dues.length,6); assert.deepEqual(generated.ledger,saved.ledger);
  for (const old of saved.dues) assert.deepEqual(generated.dues.find(d=>d.id===old.id),old);
  assert.deepEqual(applyFinance(generated,annual,'casa',['a','b']),generated);
  assert.deepEqual(state,saved);
  assert.throws(()=>applyFinance(state,{ ...annual, medium_ids: ['estrangeiro'] },'casa',['a','b']));
});

test('PostgreSQL: geração anual atômica, permissões, limite de dezembro e duplicatas', async t => {
  const db = new PGlite();
  const owner = crypto.randomUUID(), admin = crypto.randomUUID(), user = crypto.randomUUID(), foreignOwner = crypto.randomUUID();
  const house = crypto.randomUUID(), foreignHouse = crypto.randomUUID(), first = crypto.randomUUID(), second = crypto.randomUUID(), foreign = crypto.randomUUID();
  const asUser = async (id: string) => { await db.exec('reset role;set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); };
  async function value<T>(sql: string,args: unknown[] = []) { return (await db.query<{ value: T }>(sql,args)).rows[0].value; }
  const generate = (reference='2026-10-01',due='2026-10-31',ids: (string|null)[]=[first,first,second],targetHouse=house,amount=7500,exempt=false) => value<{created:number;skipped:number}>('select finance_create_dues_until_december($1,$2::uuid[],$3::date,$4::date,$5,$6) value',[targetHouse,ids,reference,due,amount,exempt]);
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    for (const name of ['001_initial.sql','002_finance.sql','003_username_auth.sql','004_names_registration.sql','005_medium_fields_dues_import.sql','20261013111959_medium_birth_date.sql','20261013112855_medium_sex.sql','20261014113327_terreiro_memberships.sql','20261015105659_dues_until_december.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
    for (const [id,username] of [[owner,'dono_01'],[admin,'admin_01'],[user,'pessoa_1'],[foreignOwner,'dono_02']]) await db.query('insert into auth.users values($1,$2,$3)',[id,`${id}@example.com`,{username,full_name:username}]);
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')",[house,owner,foreignHouse,foreignOwner]);
    for (const [id,houseId,name] of [[first,house,'Pessoa Um'],[second,house,'Pessoa Dois'],[foreign,foreignHouse,'Outra Casa']]) await db.query('insert into mediuns(id,terreiro_id,name) values($1,$2,$3)',[id,houseId,name]);
    await db.query("insert into terreiro_members(user_id,terreiro_id,role) values($1,$2,'administrador'),($3,$2,'usuario')",[admin,house,user]);
    await asUser(owner);
    await db.query("select finance_create_dues($1,array[$2::uuid],'2026-10-01','2026-10-10',5000,false)",[house,first]);
    const paid = await value<string>('select id value from mensalidades');
    await db.query("select finance_pay_due($1,'2026-10-05')",[paid]);
    await db.query("select finance_create_dues($1,array[$2::uuid],'2026-11-01','2026-11-10',0,true)",[house,second]);
    const existing = await db.query<{ id: string }>('select * from mensalidades order by reference');

    await t.test('administrador gera até dezembro, preserva existentes e informa criadas/ignoradas',async()=>{
      await asUser(admin);
      assert.deepEqual(await generate(),{created:4,skipped:2});
      assert.equal(await value<number>('select count(*)::int value from mensalidades'),6);
      assert.equal(await value<string>('select max(reference)::text value from mensalidades'),'2026-12-01');
      assert.equal(await value<string>("select due_on::text value from mensalidades where medium_id=$1 and reference='2026-11-01'",[first]),'2026-11-30');
      for (const row of existing.rows) assert.deepEqual((await db.query('select * from mensalidades where id=$1',[row.id])).rows[0],row);
      assert.equal(await value<number>('select count(*)::int value from caixa'),1);
      assert.deepEqual(await generate(),{created:0,skipped:6});
    });
    await t.test('dezembro gera somente dezembro; ano novo exige geração explícita; fevereiro respeita bissexto',async()=>{
      assert.deepEqual(await generate('2027-12-01','2027-12-31',[first]),{created:1,skipped:0});
      assert.equal(await value<number>("select count(*)::int value from mensalidades where reference>='2028-01-01'"),0);
      assert.deepEqual(await generate('2028-01-01','2028-01-31',[first]),{created:12,skipped:0});
      assert.equal(await value<string>("select due_on::text value from mensalidades where reference='2028-02-01'"),'2028-02-29');
      assert.deepEqual(await generate('2027-02-01','2027-02-28',[second],house,0,true),{created:11,skipped:0});
      assert.equal(await value<number>("select count(*)::int value from mensalidades where medium_id=$1 and reference>='2027-02-01' and reference<='2027-12-01' and status='isento' and amount_cents=0",[second]),11);
    });
    await t.test('dados inválidos e médium de outra casa são recusados sem geração parcial',async()=>{
      const count = await value<number>('select count(*)::int value from mensalidades');
      await assert.rejects(()=>generate('2026-10-02'));
      await assert.rejects(()=>generate('2026-10-01','2026-11-10'));
      await assert.rejects(()=>generate('2026-10-01','2026-10-10',[]));
      await assert.rejects(()=>generate('2026-10-01','2026-10-10',[null]));
      await assert.rejects(()=>generate('2026-10-01','2026-10-10',[first],house,0));
      await assert.rejects(()=>generate('2026-10-01','2026-10-10',[first,foreign]));
      assert.equal(await value<number>('select count(*)::int value from mensalidades'),count);
    });
    await t.test('usuário, outra casa, visitante e administração revogada não podem gerar',async()=>{
      for (const actor of [user,foreignOwner]) { await asUser(actor); await assert.rejects(()=>generate()); }
      await db.exec('reset role;set role anon;'); await assert.rejects(()=>generate());
      await db.exec('reset role;'); await db.query("update terreiro_members set role='usuario' where user_id=$1",[admin]);
      await asUser(admin); await assert.rejects(()=>generate());
      await asUser(owner); await assert.rejects(()=>generate('2026-10-01','2026-10-10',[foreign],foreignHouse));
    });
    await t.test('falha em novembro reverte outubro; repetição após corrigir gera o lote inteiro',async()=>{
      await db.exec(`reset role;create function reject_annual_due() returns trigger language plpgsql as $$ begin if new.reference='2029-11-01' then raise exception 'falha simulada';end if;return new;end $$;
        create trigger reject_annual_due before insert on mensalidades for each row execute function reject_annual_due();`);
      await asUser(owner);
      await assert.rejects(()=>generate('2029-10-01','2029-10-10',[first]),/falha simulada/);
      assert.equal(await value<number>("select count(*)::int value from mensalidades where reference>='2029-01-01'"),0);
      await db.exec('reset role;drop trigger reject_annual_due on mensalidades;drop function reject_annual_due();');
      await asUser(owner); assert.deepEqual(await generate('2029-10-01','2029-10-10',[first]),{created:3,skipped:0});
      assert.equal(await value<boolean>("select prosecdef value from pg_proc where oid='finance_create_dues_until_december(uuid,uuid[],date,date,integer,boolean)'::regprocedure"),false);
    });
  } finally { await db.close(); }
});
