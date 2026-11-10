import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { applyFinance, dueSnapshot, emptyFinance, summarize, type DueSnapshot } from '../src/lib/finance';

test('editar somente valor preserva demais campos e atualiza recebimento legado', () => {
  const state = applyFinance(emptyFinance(), { type:'dues',medium_ids:['m'],reference:'2026-11-01',due_on:'2026-11-10',amount_cents:10000,exempt:false }, 'house', ['m']);
  const pending = applyFinance(state,{type:'update_due_amount',due_id:state.dues[0].id,expected:dueSnapshot(state.dues[0]),amount_cents:12500},'house',[]);
  assert.equal(pending.ledger.length,0);
  assert.equal(state.dues[0].amount_cents,10000);
  const paid = applyFinance(pending,{type:'pay',due_id:pending.dues[0].id,paid_on:'2026-11-09',payment_method:'pix'},'house',[]);
  paid.dues[0].payment_method = null;
  const expected = dueSnapshot(paid.dues[0]);
  const edited = applyFinance(paid,{type:'update_due_amount',due_id:paid.dues[0].id,expected,amount_cents:15000},'house',[]);
  assert.deepEqual(dueSnapshot(edited.dues[0]),{...expected,amount_cents:15000});
  assert.equal(edited.ledger.length,1);
  assert.equal(edited.ledger[0].id,paid.ledger[0].id);
  assert.equal(summarize(edited).balance,15000);
  assert.throws(()=>applyFinance(edited,{type:'update_due_amount',due_id:edited.dues[0].id,expected,amount_cents:20000},'house',[]),/alterada/);
  for (const amount of [0,-1,1.5,1000000001]) assert.throws(()=>applyFinance(paid,{type:'update_due_amount',due_id:paid.dues[0].id,expected,amount_cents:amount},'house',[]));
});

test('PostgreSQL: administrador altera só valor, com isolamento, concorrência e ajuste atômico do caixa', async () => {
  const db = new PGlite();
  const owner=crypto.randomUUID(),admin=crypto.randomUUID(),member=crypto.randomUUID(),outsider=crypto.randomUUID(),house=crypto.randomUUID(),medium=crypto.randomUUID();
  const asUser=async (id:string)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
    for(const name of ['001_initial.sql','002_finance.sql','003_username_auth.sql','004_names_registration.sql','005_medium_fields_dues_import.sql','20261014113327_terreiro_memberships.sql','20261014142853_due_edit_payment_method.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/20261110114212_admin_due_amount.sql',import.meta.url),'utf8'));
    for(const [id,name] of [[owner,'owner_01'],[admin,'admin_01'],[member,'member_01'],[outsider,'outside_01']]) await db.query('insert into auth.users values($1,$2,$3)',[id,`${id}@example.com`,{username:name,full_name:name}]);
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Teste','Brusque','SC')",[house,owner]);
    await db.query("insert into mediuns(id,terreiro_id,name) values($1,$2,'Médium teste')",[medium,house]);
    await db.query("insert into terreiro_members(user_id,terreiro_id,role) values($1,$3,'administrador'),($2,$3,'usuario')",[admin,member,house]);
    await asUser(owner);
    await db.query("select finance_create_dues($1,array[$2::uuid],'2026-11-01','2026-11-10',10000,false)",[house,medium]);
    const due=(await db.query<{id:string}>('select id from mensalidades')).rows[0].id;
    const snapshot=async ()=>(await db.query<{value:DueSnapshot}>("select jsonb_build_object('medium_id',medium_id,'reference',reference,'due_on',due_on,'amount_cents',amount_cents,'status',status,'paid_on',paid_on,'payment_method',payment_method) value from mensalidades where id=$1",[due])).rows[0].value;
    const original=await snapshot();
    for(const actor of [member,outsider]) {
      await asUser(actor);
      await assert.rejects(db.query('select finance_update_due_amount($1,12500,$2)',[due,original]),/permissão/);
    }
    await asUser(admin);
    await db.query('select finance_update_due_amount($1,12500,$2)',[due,original]);
    assert.deepEqual(await snapshot(),{...original,amount_cents:12500});
    assert.equal((await db.query('select * from caixa')).rows.length,0);
    await assert.rejects(db.query('select finance_update_due_amount($1,15000,$2)',[due,original]),/alterada/);
    await db.query("select finance_pay_due($1,'2026-11-09')",[due]);
    const paid=await snapshot();
    assert.equal(paid.payment_method,null);
    const cash=(await db.query<{id:string}>('select id from caixa where due_id=$1',[due])).rows[0].id;
    await db.query('select finance_update_due_amount($1,15000,$2)',[due,paid]);
    const edited=await snapshot();
    assert.deepEqual(edited,{...paid,amount_cents:15000});
    assert.deepEqual((await db.query('select id,amount_cents,occurred_on::text from caixa where due_id=$1',[due])).rows,[{id:cash,amount_cents:15000,occurred_on:'2026-11-09'}]);
    for(const amount of [0,-1,1000000001,null]) await assert.rejects(db.query('select finance_update_due_amount($1,$2,$3)',[due,amount,edited]),/valor/);
    await assert.rejects(db.query('select finance_delete_due($1,$2)',[due,edited]),/permissão/);
    await assert.rejects(db.query('select finance_update_due($1,$2,$3,$4,$5,$6,$7,$8,$9)',[due,medium,edited.reference,edited.due_on,17000,'pago',edited.paid_on,'pix',edited]),/permissão/);
    await db.exec('reset role');
    await db.exec("create function public.test_due_amount_failure() returns trigger language plpgsql as $$begin raise exception 'cash failed'; end$$;create trigger test_due_amount_failure before update on public.caixa for each row execute function public.test_due_amount_failure();");
    await asUser(admin);
    await assert.rejects(db.query('select finance_update_due_amount($1,17500,$2)',[due,edited]),/cash failed/);
    assert.deepEqual(await snapshot(),edited);
    await db.exec('reset role;drop trigger test_due_amount_failure on public.caixa');
    await db.query("update terreiro_members set role='usuario' where user_id=$1",[admin]);
    await asUser(admin);
    await assert.rejects(db.query('select finance_update_due_amount($1,17500,$2)',[due,edited]),/permissão/);
    await asUser(owner);
    await db.query("select finance_create_dues($1,array[$2::uuid],'2026-12-01','2026-12-10',0,true)",[house,medium]);
    const exempt=(await db.query<{id:string}>('select id from mensalidades where status=\'isento\'')).rows[0].id;
    const exemptSnapshot={...original,reference:'2026-12-01',due_on:'2026-12-10',status:'isento',amount_cents:0};
    await assert.rejects(db.query('select finance_update_due_amount($1,100,$2)',[exempt,exemptSnapshot]),/isenta/);
    await db.exec('set role anon');
    await assert.rejects(db.query('select finance_update_due_amount($1,17500,$2)',[due,edited]),/permission denied/);
  } finally {await db.close();}
});
