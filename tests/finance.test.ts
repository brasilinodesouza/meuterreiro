import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { applyFinance, emptyFinance, money, parseMoney, summarize, type FinanceState } from '../src/lib/finance';

test('valores em reais são convertidos sem arredondamento de ponto flutuante', () => {
  assert.equal(parseMoney('25,90'),2590);
  assert.equal(parseMoney('R$ 1.234,56'),123456);
  assert.equal(parseMoney('0,01'),1);
  for (const invalid of ['0','-10','1,999','1e3','12.34','NaN','10.000.000,01']) assert.throws(()=>parseMoney(invalid));
  assert.equal(money(2590).replace(/\s/g,''),'R$25,90');
});
test('lembrete concluído cria um gasto e uma saída, sem duplicar ou alterar o estado anterior', () => {
  const original:FinanceState={...emptyFinance(),reminders:[{id:'r',terreiro_id:'demo',description:'Comprar vela',category:'Velas e artigos',due_on:null,completed_at:null,request_id:'req-r',created_at:'2026-10-01T12:00:00Z'}]};
  const command={type:'expense' as const,description:'Outro texto',category:'Outros' as const,amount_cents:2590,spent_on:'2026-10-09',reminder_id:'r',request_id:'req-e'};
  const saved=applyFinance(original,command,'demo',[]);
  assert.equal(original.expenses.length,0);assert.equal(original.reminders[0].completed_at,null);
  assert.equal(saved.expenses.length,1);assert.equal(saved.ledger.length,1);assert.equal(saved.expenses[0].description,'Comprar vela');assert.ok(saved.reminders[0].completed_at);
  const retry=applyFinance(saved,{...command,request_id:'req-second'},'demo',[]);
  assert.equal(retry.expenses.length,1);assert.equal(retry.ledger.length,1);
  assert.deepEqual(summarize(retry,'2026-10'),{incoming:0,outgoing:2590,balance:-2590,periodBalance:-2590});
  assert.throws(()=>applyFinance(original,{...command,amount_cents:0},'demo',[]));assert.equal(original.reminders[0].completed_at,null);
  assert.throws(()=>applyFinance(original,command,'other-house',[]));
});
test('mensalidades não duplicam por mês, recebimento é único e isenção não gera caixa', () => {
  const create={type:'dues' as const,medium_ids:['m','m'],reference:'2026-10-01',due_on:'2026-10-10',amount_cents:5000,exempt:false};
  const created=applyFinance(emptyFinance(),create,'demo',['m']);
  assert.equal(applyFinance(created,create,'demo',['m']).dues.length,1);
  const command={type:'pay' as const,due_id:created.dues[0].id,paid_on:'2026-10-09',payment_method:'pix' as const};
  const paid=applyFinance(created,command,'demo',['m']);
  assert.equal(applyFinance(paid,command,'demo',['m']).ledger.length,1);assert.equal(summarize(paid).balance,5000);
  const exempt=applyFinance(emptyFinance(),{...create,exempt:true},'demo',['m']);
  assert.equal(exempt.dues[0].amount_cents,0);assert.throws(()=>applyFinance(exempt,{...command,due_id:exempt.dues[0].id},'demo',['m']));assert.equal(exempt.ledger.length,0);
  assert.throws(()=>applyFinance(emptyFinance(),{...create,medium_ids:['another-house-medium']},'demo',['m']));
});

test('PostgreSQL: isolamento, atomicidade e repetição segura das operações financeiras', async t => {
  const db=new PGlite();
  const owner1='11111111-1111-4111-8111-111111111111', owner2='22222222-2222-4222-8222-222222222222';
  const house1='33333333-3333-4333-8333-333333333333',house2='44444444-4444-4444-8444-444444444444';
  const medium1='55555555-5555-4555-8555-555555555555',medium2='66666666-6666-4666-8666-666666666666';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(await readFile(new URL('../supabase/migrations/001_initial.sql',import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/002_finance.sql',import.meta.url),'utf8'));
    await db.query('insert into auth.users values($1),($2)',[owner1,owner2]);
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')",[house1,owner1,house2,owner2]);
    await db.query("insert into mediuns(id,terreiro_id,name,role,joined_on) values($1,$2,'Médium Um','Médium','2026-01-01'),($3,$4,'Médium Dois','Médium','2026-01-01')",[medium1,house1,medium2,house2]);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner1}',false);`);
    await t.test('uma mensalidade por médium/mês e uma entrada por recebimento',async()=>{
      const sql="select finance_create_dues($1,array[$2::uuid],'2026-10-01','2026-10-10',5000,false)";
      await db.query(sql,[house1,medium1]);await db.query(sql,[house1,medium1]);
      const dues=await db.query<{id:string}>('select id from mensalidades');assert.equal(dues.rows.length,1);
      await db.query("select finance_pay_due($1,'2026-10-09')",[dues.rows[0].id]);await db.query("select finance_pay_due($1,'2026-10-09')",[dues.rows[0].id]);
      const cash=await db.query<{amount_cents:number}>('select amount_cents from caixa');assert.equal(cash.rows.length,1);assert.equal(cash.rows[0].amount_cents,5000);
      await assert.rejects(db.query(sql,[house1,medium2]));
    });
    await t.test('concluir lembrete cria apenas um gasto e uma saída mesmo em repetição',async()=>{
      const reminder=await db.query<{id:string}>("select finance_create_reminder($1,'Comprar vela','Velas e artigos',null,$2) id",[house1,crypto.randomUUID()]);
      const r=reminder.rows[0].id;const sql="select finance_create_expense($1,'Outro texto','Outros',2590,'2026-10-09',$2,$3) id";
      const first=await db.query<{id:string}>(sql,[house1,r,crypto.randomUUID()]);
      const again=await db.query<{id:string}>(sql,[house1,r,crypto.randomUUID()]);assert.equal(first.rows[0].id,again.rows[0].id);
      const expenses=await db.query<{description:string}>('select description from gastos');assert.equal(expenses.rows.length,1);assert.equal(expenses.rows[0].description,'Comprar vela');
      const cash=await db.query<{kind:string;amount_cents:number}>('select kind,amount_cents from caixa');assert.equal(cash.rows.length,2);assert.equal(cash.rows.reduce((a,e)=>a+(e.kind==='entrada'?e.amount_cents:-e.amount_cents),0),2410);
      assert.ok((await db.query<{completed_at:string|null}>('select completed_at from lembretes')).rows[0].completed_at);
    });
    await t.test('falha no caixa reverte o gasto e a conclusão do lembrete',async()=>{
      const reminder=await db.query<{id:string}>("select finance_create_reminder($1,'Comprar limpeza','Limpeza',null,$2) id",[house1,crypto.randomUUID()]);
      await db.exec("reset role; create function public.test_reject_cash() returns trigger language plpgsql as $$ begin raise exception 'Falha simulada no caixa'; end $$; create trigger test_cash_failure before insert on caixa for each row execute function public.test_reject_cash(); set role authenticated;");
      await assert.rejects(db.query("select finance_create_expense($1,'Limpeza','Limpeza',1000,'2026-10-09',$2,$3)",[house1,reminder.rows[0].id,crypto.randomUUID()]));
      assert.equal((await db.query<{completed_at:string|null}>('select completed_at from lembretes where id=$1',[reminder.rows[0].id])).rows[0].completed_at,null);
      assert.equal((await db.query('select id from gastos')).rows.length,1);
      await db.exec('reset role; drop trigger test_cash_failure on caixa; drop function public.test_reject_cash(); set role authenticated;');
    });
    await t.test('outra conta não vê ou altera registros e não pode gravar direto no financeiro',async()=>{
      const privateDue=(await db.query<{id:string}>('select id from mensalidades')).rows[0].id;
      await db.exec(`select set_config('request.jwt.claim.sub','${owner2}',false)`);
      for(const table of ['mensalidades','caixa','gastos','lembretes']) assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
      await assert.rejects(db.query("select finance_pay_due($1,'2026-10-09')",[privateDue]));
      await assert.rejects(db.query("select finance_create_income($1,'Doação','Doação',2000,'2026-10-09',$2)",[house1,crypto.randomUUID()]));
      await assert.rejects(db.query("update mensalidades set status='pendente'"));
      await assert.rejects(db.query("insert into caixa(terreiro_id,description,category,amount_cents,occurred_on,kind,request_id) values($1,'Entrada','Doação',100,'2026-10-09','entrada',$2)",[house2,crypto.randomUUID()]));
      await db.exec('set role anon');await assert.rejects(db.query("select finance_create_reminder($1,'Comprar vela','Outros',null,$2)",[house2,crypto.randomUUID()]));
    });
  } finally { await db.close(); }
});
