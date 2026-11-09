import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { applyFinance, emptyFinance, expenseSnapshot, summarize } from '../src/lib/finance';

test('editar e excluir gasto ajusta caixa, mantém saldo conciliado e reabre lembrete', () => {
  let state = applyFinance(emptyFinance(), { type: 'reminder', description: 'Comprar vela', category: 'Outros', due_on: null, request_id: 'reminder' }, 'house', []);
  state = applyFinance(state, { type: 'expense', description: 'Comprar vela', category: 'Outros', amount_cents: 1000, spent_on: '2026-11-09', reminder_id: state.reminders[0].id, request_id: 'expense' }, 'house', []);
  state.balance_offset_cents = 5000;
  const expense = state.expenses[0];
  const changes = { description: 'Velas novas', category: 'Limpeza', amount_cents: 2500, spent_on: '2026-11-08' };
  const edited = applyFinance(state, { type: 'update_expense', expense_id: expense.id, expected: expenseSnapshot(expense), changes }, 'house', []);
  assert.equal(summarize(edited).balance, 2500);
  assert.equal(edited.ledger.length, 1);
  assert.equal(edited.ledger[0].occurred_on, changes.spent_on);
  assert.equal(edited.reminders[0].description, changes.description);
  assert.equal(state.expenses[0].amount_cents, 1000);
  assert.throws(() => applyFinance(edited, { type: 'delete_expense', expense_id: expense.id, expected: expenseSnapshot(expense) }, 'house', []), /alterado/);
  assert.throws(() => applyFinance(edited, { type: 'delete_expense', expense_id: expense.id, expected: expenseSnapshot(edited.expenses[0]) }, 'other', []), /não encontrado/);
  const deleted = applyFinance(edited, { type: 'delete_expense', expense_id: expense.id, expected: expenseSnapshot(edited.expenses[0]) }, 'house', []);
  assert.equal(summarize(deleted).balance, 5000);
  assert.equal(deleted.expenses.length, 0);
  assert.equal(deleted.ledger.length, 0);
  assert.equal(deleted.reminders[0].completed_at, null);
});

test('PostgreSQL: edição, exclusão, permissões, conflitos e atomicidade de gastos', async () => {
  const db = new PGlite();
  const owner = crypto.randomUUID(), admin = crypto.randomUUID(), member = crypto.randomUUID(), outsider = crypto.randomUUID(), house = crypto.randomUUID();
  const asUser = async (id: string) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const name of ['001_initial.sql','002_finance.sql','003_username_auth.sql','004_names_registration.sql','005_medium_fields_dues_import.sql','20261013111959_medium_birth_date.sql','20261013112855_medium_sex.sql','20261014113327_terreiro_memberships.sql','20261109193518_expense_categories.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    await db.exec(await readFile(new URL('../supabase/migrations/20261109195247_expense_edit_delete.sql', import.meta.url), 'utf8'));
    for (const [id, name] of [[owner,'owner_01'],[admin,'admin_01'],[member,'member_01'],[outsider,'outside_01']]) {
      await db.query('insert into auth.users values($1,$2,$3)', [id, `${id}@example.com`, { username: name, full_name: name }]);
    }
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa teste','Brusque','SC')", [house,owner]);
    await db.query("insert into terreiro_members(user_id,terreiro_id,role) values($1,$3,'administrador'),($2,$3,'usuario')", [admin,member,house]);
    await asUser(owner);
    const reminder = (await db.query<{id:string}>("select finance_create_reminder($1,'Comprar vela','Outros',null,$2) id", [house,crypto.randomUUID()])).rows[0].id;
    const expense = (await db.query<{id:string}>("select finance_create_expense($1,'Comprar vela','Outros',1000,'2026-11-09',$2,$3) id", [house,reminder,crypto.randomUUID()])).rows[0].id;
    const snapshot = async () => (await db.query<{value:Record<string,unknown>}>("select jsonb_build_object('description',description,'category',category,'amount_cents',amount_cents,'spent_on',spent_on,'reminder_id',reminder_id) value from gastos where id=$1", [expense])).rows[0].value;
    const original = await snapshot();
    const changes = { description:'Velas novas',category:'Limpeza',amount_cents:2500,spent_on:'2026-11-08' };
    for (const id of [member,outsider]) {
      await asUser(id);
      await assert.rejects(db.query('select finance_update_expense($1,$2,$3)', [expense,original,changes]), /permissão/);
      await assert.rejects(db.query('select finance_delete_expense($1,$2)', [expense,original]), /permissão/);
    }
    await asUser(admin);
    await db.query('select finance_update_expense($1,$2,$3)', [expense,original,changes]);
    assert.equal((await db.query<{amount_cents:number}>('select amount_cents from caixa where expense_id=$1', [expense])).rows[0].amount_cents,2500);
    assert.equal((await db.query<{description:string}>('select description from lembretes where id=$1', [reminder])).rows[0].description,changes.description);
    await assert.rejects(db.query('select finance_delete_expense($1,$2)', [expense,original]), /alterado/);
    const edited = await snapshot();
    await assert.rejects(db.query('select finance_update_expense($1,$2,$3)', [expense,edited,{...changes,amount_cents:0}]), /Confira/);
    assert.deepEqual(await snapshot(),edited);
    await db.exec('reset role');
    await db.exec("create function public.fail_cash_update() returns trigger language plpgsql as $$ begin raise exception 'cash failed'; end $$; create trigger fail_cash_update before update on public.caixa for each row execute function public.fail_cash_update();");
    await asUser(owner);
    await assert.rejects(db.query('select finance_update_expense($1,$2,$3)', [expense,edited,{...changes,amount_cents:3000}]), /cash failed/);
    assert.deepEqual(await snapshot(),edited);
    await db.query('select finance_delete_expense($1,$2)', [expense,edited]);
    assert.equal((await db.query('select id from gastos where id=$1', [expense])).rows.length,0);
    assert.equal((await db.query('select id from caixa where expense_id=$1', [expense])).rows.length,0);
    assert.equal((await db.query<{completed_at:null}>('select completed_at from lembretes where id=$1', [reminder])).rows[0].completed_at,null);
    await db.exec('set role anon');
    await assert.rejects(db.query('select finance_delete_expense($1,$2)', [expense,edited]), /permission denied/);
  } finally { await db.close(); }
});
