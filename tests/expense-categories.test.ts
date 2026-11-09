import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFinance, emptyFinance, expenseCategoryOptions, financeSchema, summarize } from '../src/lib/finance';

test('categoria criada persiste no estado e pode ser usada em gastos e lembretes', () => {
  const original = emptyFinance();
  const categorized = applyFinance(original, { type: 'expense_category', name: '  Aluguel  ' }, 'house', []);
  const restored = financeSchema.parse(JSON.parse(JSON.stringify(categorized)));
  assert.ok(expenseCategoryOptions(restored).includes('Aluguel'));
  assert.deepEqual(original.expense_categories, []);
  assert.deepEqual(summarize(restored), summarize(original));
  const reminder = applyFinance(restored, { type: 'reminder', description: 'Pagar aluguel', category: 'Aluguel', due_on: null, request_id: 'reminder' }, 'house', []);
  const spent = applyFinance(reminder, { type: 'expense', description: 'Pagamento do aluguel', category: 'Aluguel', amount_cents: 15000, spent_on: '2026-11-09', reminder_id: reminder.reminders[0].id, request_id: 'expense' }, 'house', []);
  assert.equal(spent.expenses[0].category, 'Aluguel');
  assert.equal(spent.ledger[0].category, 'Aluguel');
  assert.equal(summarize(spent).balance, -15000);
  assert.ok(spent.reminders[0].completed_at);
});

test('categorias rejeitam nomes inválidos e não duplicam nomes existentes', () => {
  const state = applyFinance(emptyFinance(), { type: 'expense_category', name: 'Aluguel' }, 'house', []);
  for (const name of [' aluguel ', 'ALUGUEL', 'Outros']) {
    assert.deepEqual(applyFinance(state, { type: 'expense_category', name }, 'house', []).expense_categories, ['Aluguel']);
  }
  for (const name of ['', ' ', 'A', 'A'.repeat(81)]) {
    assert.throws(() => applyFinance(state, { type: 'expense_category', name }, 'house', []));
  }
});
