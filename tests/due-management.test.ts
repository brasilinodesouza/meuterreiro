import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { applyFinance, dueSchema, dueSnapshot, emptyFinance, paymentMethodText, summarize, type Due, type DueSnapshot } from '../src/lib/finance';

test('formas de pagamento preservam legado e edição/exclusão ajustam o caixa sem duplicação', () => {
  const created = applyFinance(emptyFinance(), { type:'dues', medium_ids:['m'], reference:'2026-10-01', due_on:'2026-10-10', amount_cents:5000, exempt:false }, 'h', ['m']);
  const paid = applyFinance(created, { type:'pay', due_id:created.dues[0].id, paid_on:'2026-10-14', payment_method:'pix' }, 'h', ['m']);
  assert.equal(paymentMethodText(paid.dues[0]), 'Pix');
  assert.equal(paymentMethodText(dueSchema.parse({ ...paid.dues[0], payment_method:undefined })), 'Não informado');
  assert.equal(paymentMethodText(created.dues[0]), '—');
  const expected = dueSnapshot(paid.dues[0]);
  const changes = { ...expected, amount_cents:7000, payment_method:'dinheiro' as const, paid_on:'2026-10-15' };
  const edited = applyFinance(paid, { type:'update_due', due_id:paid.dues[0].id, expected, changes }, 'h', ['m']);
  assert.equal(summarize(edited).balance,7000); assert.equal(edited.ledger.length,1);
  assert.equal(edited.ledger[0].id,paid.ledger[0].id); assert.equal(paymentMethodText(edited.dues[0]),'Dinheiro');
  assert.equal(summarize(paid).balance,5000);
  assert.throws(()=>applyFinance(edited,{ type:'delete_due', due_id:edited.dues[0].id, expected },'h',['m']),/foi alterada/);
  const pending = applyFinance(edited,{ type:'update_due', due_id:edited.dues[0].id, expected:dueSnapshot(edited.dues[0]), changes:{ ...changes,status:'pendente',paid_on:null,payment_method:null } },'h',['m']);
  assert.equal(pending.ledger.length,0);
  const removed = applyFinance(edited,{ type:'delete_due', due_id:edited.dues[0].id, expected:dueSnapshot(edited.dues[0]) },'h',['m']);
  assert.equal(removed.dues.length,0); assert.equal(summarize(removed).balance,0);
  assert.throws(()=>applyFinance(paid,{ type:'update_due',due_id:paid.dues[0].id,expected,changes:{...changes,medium_id:'foreign'} },'h',['m']));
});

test('PostgreSQL: responsável edita/apaga e Pix/Dinheiro mantêm mensalidade e caixa consistentes', async t => {
  const db = new PGlite();
  const owner=crypto.randomUUID(),admin=crypto.randomUUID(),user=crypto.randomUUID(),foreignOwner=crypto.randomUUID();
  const house=crypto.randomUUID(),foreignHouse=crypto.randomUUID(),medium=crypto.randomUUID(),otherMedium=crypto.randomUUID(),foreignMedium=crypto.randomUUID();
  let dueId='',legacyId='';
  async function asUser(id:string) { await db.exec('reset role;set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); }
  async function value<T>(sql:string,args:unknown[]=[]) { return (await db.query<{value:T}>(sql,args)).rows[0].value; }
  async function due(id=dueId):Promise<Due> { return dueSchema.parse(await value('select to_jsonb(m) value from mensalidades m where id=$1',[id])); }
  async function update(changes:Partial<DueSnapshot>={},expected?:DueSnapshot,id=dueId) {
    const current=dueSnapshot(await due(id)),d={...current,...changes};
    return db.query('select finance_update_due($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,d.medium_id,d.reference,d.due_on,d.amount_cents,d.status,d.paid_on,d.payment_method,JSON.stringify(expected??current)]);
  }
  const remove=(id:string,expected:DueSnapshot)=>db.query('select finance_delete_due($1,$2)',[id,JSON.stringify(expected)]);
  async function create(reference:string,person=medium) {
    await db.query('select finance_create_dues($1,array[$2::uuid],$3,$4,5000,false)',[house,person,reference,reference.slice(0,7)+'-10']);
    return value<string>('select id value from mensalidades where medium_id=$1 and reference=$2',[person,reference]);
  }
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    for(const name of ['001_initial.sql','002_finance.sql','003_username_auth.sql','004_names_registration.sql','005_medium_fields_dues_import.sql','20261013111959_medium_birth_date.sql','20261013112855_medium_sex.sql','20261014113327_terreiro_memberships.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
    for(const [id,username] of [[owner,'dono_01'],[admin,'admin_01'],[user,'pessoa_1'],[foreignOwner,'dono_02']]) await db.query('insert into auth.users values($1,$2,$3)',[id,`${id}@example.com`,{username,full_name:username}]);
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')",[house,owner,foreignHouse,foreignOwner]);
    for(const [id,home,name] of [[medium,house,'Pessoa Um'],[otherMedium,house,'Pessoa Dois'],[foreignMedium,foreignHouse,'Pessoa Outra']]) await db.query('insert into mediuns(id,terreiro_id,name) values($1,$2,$3)',[id,home,name]);
    await db.query("insert into terreiro_members(user_id,terreiro_id,role,medium_id) values($1,$2,'usuario',$3),($4,$2,'administrador',null)",[user,house,medium,admin]);
    await asUser(owner); legacyId=await create('2026-09-01'); await db.query("select finance_pay_due($1,'2026-09-10')",[legacyId]);
    await db.exec('reset role;');
    await db.exec(await readFile(new URL('../supabase/migrations/20261014142853_due_edit_payment_method.sql',import.meta.url),'utf8'));
    await asUser(owner);dueId=await create('2026-10-01');

    await t.test('migração preserva pagamentos anteriores sem inventar forma; pendentes não têm forma',async()=>{
      assert.equal((await due(legacyId)).payment_method,null);
      assert.equal((await due()).payment_method,null);
      assert.equal(await value('select count(*)::int value from caixa'),1);
    });
    await t.test('administrador registra Pix, repetição preserva forma/data e não duplica caixa',async()=>{
      await asUser(admin);
      for(const method of [null,'','cartao']) await assert.rejects(()=>db.query("select finance_pay_due_with_method($1,'2026-10-14',$2)",[dueId,method]),/Pix ou Dinheiro/);
      assert.equal((await due()).status,'pendente');
      const first=await value<string>("select finance_pay_due_with_method($1,'2026-10-14','pix') value",[dueId]);
      const again=await value<string>("select finance_pay_due_with_method($1,'2026-10-15','dinheiro') value",[dueId]);
      assert.equal(first,again);assert.equal((await due()).payment_method,'pix');assert.equal((await due()).paid_on,'2026-10-14');
      assert.equal(await value('select count(*)::int value from caixa'),2);
    });
    await t.test('administrador, usuário, visitante e outra casa não editam nem apagam',async()=>{
      const expected=dueSnapshot(await due());
      for(const actor of [admin,user,foreignOwner]) {
        await asUser(actor);
        await assert.rejects(()=>db.query('select finance_delete_due($1,$2)',[dueId,JSON.stringify(expected)]),/permissão/);
        await assert.rejects(()=>db.query('select finance_update_due($1,$2,$3,$4,$5,$6,$7,$8,$9)',[dueId,medium,'2026-10-01','2026-10-10',5000,'pago','2026-10-14','pix',JSON.stringify(expected)]),/permissão/);
        await assert.rejects(()=>db.exec("update mensalidades set amount_cents=9000"));
      }
      await asUser(user);assert.equal((await due()).payment_method,'pix');
      await assert.rejects(()=>db.query("select finance_pay_due_with_method($1,'2026-10-14','dinheiro')",[dueId]));
      await db.exec('reset role;set role anon;');await assert.rejects(()=>remove(dueId,expected));
      await asUser(owner);
    });
    await t.test('edição de valor, referência, médium e pagamento atualiza a mesma entrada',async()=>{
      const entryId=await value<string>('select id value from caixa where due_id=$1',[dueId]);
      await update({amount_cents:7000,reference:'2026-11-01',due_on:'2026-11-12',medium_id:otherMedium,paid_on:'2026-11-13',payment_method:'dinheiro'});
      const cash=(await db.query<{id:string;amount_cents:number;description:string;occurred_on:string}>('select id,amount_cents,description,occurred_on::text from caixa where due_id=$1',[dueId])).rows[0];
      assert.equal(cash.id,entryId);assert.equal(cash.amount_cents,7000);assert.equal(cash.description,'Mensalidade · 11/2026');assert.equal(String(cash.occurred_on),'2026-11-13');
      assert.equal((await due()).payment_method,'dinheiro');
      await assert.rejects(()=>update({medium_id:foreignMedium}),/médium/);
      const conflict=await create('2026-12-01',otherMedium);
      await assert.rejects(()=>update({reference:'2026-12-01'}),/Já existe/);
      assert.equal((await due()).reference,'2026-11-01');
      await remove(conflict,dueSnapshot(await due(conflict)));
    });
    await t.test('trocar para pendente/isenta remove entrada; tornar paga cria uma única entrada',async()=>{
      await update({status:'pendente',paid_on:null,payment_method:null});
      assert.equal(await value('select count(*)::int value from caixa where due_id=$1',[dueId]),0);
      await update({status:'isento',amount_cents:0});assert.equal((await due()).amount_cents,0);
      await update({status:'pago',amount_cents:6000,paid_on:'2026-11-15',payment_method:'pix'});
      assert.equal(await value('select count(*)::int value from caixa where due_id=$1',[dueId]),1);
      assert.equal(await value('select amount_cents value from caixa where due_id=$1',[dueId]),6000);
    });
    await t.test('um pagamento durante a edição bloqueia alterações e exclusões com dados antigos',async()=>{
      const pendingId=await create('2027-01-01');const expected=dueSnapshot(await due(pendingId));
      await asUser(admin);await db.query("select finance_pay_due_with_method($1,'2027-01-10','dinheiro')",[pendingId]);
      await asUser(owner);
      await assert.rejects(()=>remove(pendingId,expected),/foi alterada/);
      await assert.rejects(()=>update({status:'pendente',paid_on:null,payment_method:null},expected,pendingId),/foi alterada/);
      assert.equal((await due(pendingId)).status,'pago');
      await remove(pendingId,dueSnapshot(await due(pendingId)));
    });
    await t.test('falha no caixa ou na exclusão da mensalidade reverte toda a operação',async()=>{
      await db.exec("reset role;create function reject_due_change() returns trigger language plpgsql as $$begin raise exception 'Falha simulada';end$$;create trigger reject_cash_update before update on caixa for each row execute function reject_due_change();set role authenticated;");
      await assert.rejects(()=>update({amount_cents:8000}),/Falha simulada/);
      assert.equal((await due()).amount_cents,6000);assert.equal(await value('select amount_cents value from caixa where due_id=$1',[dueId]),6000);
      await db.exec('reset role;drop trigger reject_cash_update on caixa;create trigger reject_due_delete before delete on mensalidades for each row execute function reject_due_change();set role authenticated;');
      await assert.rejects(async()=>remove(dueId,dueSnapshot(await due())),/Falha simulada/);
      assert.equal(await value('select count(*)::int value from caixa where due_id=$1',[dueId]),1);
      await db.exec('reset role;drop trigger reject_due_delete on mensalidades;drop function reject_due_change();set role authenticated;');
    });
    await t.test('PDF antigo continua importando sem forma e repetição preserva forma preenchida',async()=>{
      const rows=[{name:'Pessoa Um',reference:'2027-02-01',due_on:'2027-02-10',amount_cents:5000,status:'pago',paid_on:'2027-02-10'}];
      await db.query('select finance_import_dues($1,$2)',[house,JSON.stringify(rows)]);
      const importedId=await value<string>("select id value from mensalidades where reference='2027-02-01'");
      assert.equal((await due(importedId)).payment_method,null);
      await update({payment_method:'pix'},undefined,importedId);
      await db.query('select finance_import_dues($1,$2)',[house,JSON.stringify(rows)]);
      assert.equal((await due(importedId)).payment_method,'pix');
      await remove(importedId,dueSnapshot(await due(importedId)));
    });
    await t.test('apagar paga remove só sua entrada; apagar pendente não altera o caixa',async()=>{
      const pendingId=await create('2027-03-01');
      await remove(pendingId,dueSnapshot(await due(pendingId)));
      assert.equal(await value('select count(*)::int value from caixa'),2);
      await remove(dueId,dueSnapshot(await due()));
      assert.equal(await value('select count(*)::int value from caixa'),1);
      assert.equal(await value('select amount_cents value from caixa where due_id=$1',[legacyId]),5000);
      await assert.rejects(()=>remove(dueId,{} as DueSnapshot),/não encontrada/);
    });
  } finally { await db.close(); }
});
