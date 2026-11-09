import { z } from 'zod';

export const categories = ['Velas e artigos', 'Limpeza', 'Alimentação', 'Contas da casa', 'Reparos', 'Outros'] as const;
export const expenseCategorySchema = z.string().trim().min(2).max(80);
export const incomeCategories = ['Doação', 'Saldo inicial', 'Evento', 'Outras entradas'] as const;
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); }
export function money(cents: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100); }
export function parseMoney(value: string) {
  const clean = value.trim().replace(/^R\$\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(clean)) throw new Error('Informe o valor em reais, por exemplo: 25,90.');
  const [whole, fraction = ''] = clean.replace(/\./g, '').split(',');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1000000000) throw new Error('Informe um valor maior que zero e de até R$ 10.000.000,00.');
  return cents;
}
const id = z.string().min(1);
const amount = z.number().int().min(1).max(1000000000);
const date = z.iso.date();
const record = { id, terreiro_id: id, created_at: z.iso.datetime({ offset: true }) };
export const paymentMethodSchema = z.enum(['pix','dinheiro']);
export const paymentMethodLabels = { pix: 'Pix', dinheiro: 'Dinheiro' };
export const dueSchema = z.object({ ...record, medium_id: id, reference: date, due_on: date, amount_cents: z.number().int().min(0).max(1000000000), status: z.enum(['pendente','pago','isento']), paid_on: date.nullable(), payment_method: paymentMethodSchema.nullable().default(null) });
export const expenseSchema = z.object({ ...record, description: z.string().trim().min(2).max(160), category: expenseCategorySchema, amount_cents: amount, spent_on: date, notes: z.string().max(2000).default(''), reminder_id: id.nullable(), request_id: id });
export const ledgerSchema = z.object({ ...record, description: z.string().trim().min(2).max(200), category: z.string().min(2).max(80), amount_cents: amount, occurred_on: date, kind: z.enum(['entrada','saida']), due_id: id.nullable(), expense_id: id.nullable(), request_id: id.nullable() });
export const reminderSchema = z.object({ ...record, description: z.string().trim().min(2).max(160), category: expenseCategorySchema, due_on: date.nullable(), completed_at: z.iso.datetime({ offset: true }).nullable(), request_id: id });
export const financeSchema = z.object({ balance_offset_cents: z.number().int().default(0), expense_categories: z.array(expenseCategorySchema).default([]), dues: z.array(dueSchema), expenses: z.array(expenseSchema), ledger: z.array(ledgerSchema), reminders: z.array(reminderSchema) });
export type Due = z.infer<typeof dueSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export function expenseSnapshot(expense: Pick<Expense, 'description' | 'category' | 'amount_cents' | 'spent_on' | 'reminder_id'>) {
  const { description, category, amount_cents, spent_on, reminder_id } = expense;
  return { description, category, amount_cents, spent_on, reminder_id };
}
export type ExpenseSnapshot = ReturnType<typeof expenseSnapshot>;
export type ExpenseChanges = Omit<ExpenseSnapshot, 'reminder_id'>;
export type LedgerEntry = z.infer<typeof ledgerSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type FinanceState = Omit<z.infer<typeof financeSchema>, 'balance_offset_cents' | 'expense_categories' | 'expenses'> & { balance_offset_cents?: number; expense_categories?: string[]; expenses: (Omit<Expense, 'notes'> & { notes?: string })[] };
export function parseBalance(value: string) { const s=value.trim(); if (/^-?0(?:,0{1,2})?$/.test(s)) return 0; return (s.startsWith('-') ? -1 : 1)*parseMoney(s.replace(/^-/,'').trim()); }
export const emptyFinance = (): FinanceState => ({ balance_offset_cents: 0, expense_categories: [], dues: [], expenses: [], ledger: [], reminders: [] });
export function dueSnapshot(due: Due) {
  const { medium_id, reference, due_on, amount_cents, status, paid_on } = due;
  return { medium_id, reference, due_on, amount_cents, status, paid_on, payment_method: due.payment_method ?? null };
}
export type DueSnapshot = ReturnType<typeof dueSnapshot>;
export function paymentMethodText(due: Due) { return due.status === 'pago' ? due.payment_method ? paymentMethodLabels[due.payment_method] : 'Não informado' : '—'; }
export function expenseCategoryOptions(state: FinanceState) {
  const names = [...categories, ...(state.expense_categories ?? []), ...state.expenses.map(e => e.category), ...state.reminders.map(r => r.category)];
  return [...new Map(names.map(name => [name.toLocaleLowerCase('pt-BR'), name])).values()].sort((a,b) => a.localeCompare(b, 'pt-BR'));
}
export type FinanceCommand =
  | { type: 'update_expense'; expense_id: string; expected: ExpenseSnapshot; changes: ExpenseChanges }
  | { type: 'delete_expense'; expense_id: string; expected: ExpenseSnapshot }
  | { type: 'expense_category'; name: string }
  | { type: 'set_balance'; amount_cents: number; expected_balance: number }
  | { type: 'dues'; medium_ids: string[]; reference: string; due_on: string; amount_cents: number; exempt: boolean; through_year_end?: boolean }
  | { type: 'pay'; due_id: string; paid_on: string; payment_method: z.infer<typeof paymentMethodSchema> }
  | { type: 'update_due'; due_id: string; expected: DueSnapshot; changes: DueSnapshot }
  | { type: 'delete_due'; due_id: string; expected: DueSnapshot }
  | { type: 'expense'; description: string; category: string; amount_cents: number; spent_on: string; reminder_id: string | null; request_id: string }
  | { type: 'income'; description: string; category: typeof incomeCategories[number]; amount_cents: number; occurred_on: string; request_id: string }
  | { type: 'reminder'; description: string; category: string; due_on: string | null; request_id: string };

export function duesSchedule(reference: string, dueOn: string, throughYearEnd = false) {
  if (!/^\d{4}-\d{2}-01$/.test(reference) || !date.safeParse(reference).success || !date.safeParse(dueOn).success || Number(reference.slice(0,4)) < 1) throw new Error('Confira o mês de referência e o vencimento.');
  if (!throughYearEnd) return [{ reference, due_on: dueOn }];
  if (dueOn.slice(0,7) !== reference.slice(0,7)) throw new Error('O primeiro vencimento deve estar no mês inicial da geração.');
  const year = Number(reference.slice(0,4)), firstMonth = Number(reference.slice(5,7)), day = Number(dueOn.slice(8,10));
  return Array.from({ length: 13 - firstMonth }, (_, index) => {
    const month = firstMonth + index;
    const prefix = `${reference.slice(0,4)}-${String(month).padStart(2,'0')}`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { reference: `${prefix}-01`, due_on: `${prefix}-${String(Math.min(day,lastDay)).padStart(2,'0')}` };
  });
}

export function applyFinance(state: FinanceState, command: FinanceCommand, houseId: string, mediumIds: string[], now = new Date().toISOString()): FinanceState {
  const next = structuredClone(state);
  const base = () => ({ id: crypto.randomUUID(), terreiro_id: houseId, created_at: now });
  if (command.type === 'expense_category') {
    const name = expenseCategorySchema.parse(command.name);
    if (!expenseCategoryOptions(next).some(c => c.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) next.expense_categories = [...(next.expense_categories ?? []), name];
  } else if (command.type === 'set_balance') {
    z.number().int().min(-1000000000).max(1000000000).parse(command.amount_cents);
    const current=summarize(state).balance;
    if(current!==command.expected_balance) throw new Error('O saldo mudou. Atualize a tela antes de editar.');
    next.balance_offset_cents=(state.balance_offset_cents??0)+command.amount_cents-current;
  } else if (command.type === 'dues') {
    const schedule = duesSchedule(command.reference,command.due_on,command.through_year_end);
    if (!command.medium_ids.length || command.medium_ids.some(m => !mediumIds.includes(m))) throw new Error('Selecione um médium da casa.');
    if (!command.exempt) amount.parse(command.amount_cents);
    for (const month of schedule) for (const mediumId of new Set(command.medium_ids)) {
      if (next.dues.some(d => d.terreiro_id === houseId && d.medium_id === mediumId && d.reference === month.reference)) continue;
      next.dues.push(dueSchema.parse({ ...base(), medium_id: mediumId, ...month, amount_cents: command.exempt ? 0 : command.amount_cents, status: command.exempt ? 'isento' : 'pendente', paid_on: null }));
    }
  } else if (command.type === 'pay') {
    const due = next.dues.find(d => d.id === command.due_id && d.terreiro_id === houseId);
    if (!due) throw new Error('Mensalidade não encontrada.');
    if (due.status === 'isento') throw new Error('Uma mensalidade isenta não tem pagamento.');
    date.parse(command.paid_on);
    paymentMethodSchema.parse(command.payment_method);
    if (due.status === 'pago') return state;
    due.status = 'pago'; due.paid_on = command.paid_on; due.payment_method = command.payment_method;
    next.ledger.push(ledgerSchema.parse({ ...base(), kind: 'entrada', description: `Mensalidade · ${due.reference.slice(0,7).split('-').reverse().join('/')}`, category: 'Mensalidade', amount_cents: due.amount_cents, occurred_on: command.paid_on, due_id: due.id, expense_id: null, request_id: null }));
  } else if (command.type === 'update_due' || command.type === 'delete_due') {
    const due = next.dues.find(d => d.id === command.due_id && d.terreiro_id === houseId);
    if (!due) throw new Error('Mensalidade não encontrada. Atualize a lista.');
    const snapshot = dueSnapshot(due);
    if (Object.keys(snapshot).some(key => snapshot[key as keyof DueSnapshot] !== command.expected[key as keyof DueSnapshot])) throw new Error('Esta mensalidade foi alterada. Atualize a lista antes de continuar.');
    if (command.type === 'delete_due') {
      next.dues = next.dues.filter(d => d.id !== due.id);
      next.ledger = next.ledger.filter(entry => entry.due_id !== due.id);
    } else {
      const edited = dueSchema.parse({ ...due, ...command.changes });
      if (!mediumIds.includes(edited.medium_id)) throw new Error('Escolha um médium deste terreiro.');
      if (!/^\d{4}-\d{2}-01$/.test(edited.reference)) throw new Error('Confira o mês de referência.');
      if (next.dues.some(d => d.id !== due.id && d.medium_id === edited.medium_id && d.reference === edited.reference)) throw new Error('Já existe uma mensalidade para este médium e mês.');
      if (edited.status === 'pago') {
        amount.parse(edited.amount_cents); date.parse(edited.paid_on); paymentMethodSchema.parse(edited.payment_method);
        const entry = next.ledger.find(entry => entry.due_id === due.id);
        const cash = ledgerSchema.parse({ ...(entry ?? base()), kind: 'entrada', description: `Mensalidade · ${edited.reference.slice(0,7).split('-').reverse().join('/')}`, category: 'Mensalidade', amount_cents: edited.amount_cents, occurred_on: edited.paid_on, due_id: due.id, expense_id: null, request_id: null });
        next.ledger = [...next.ledger.filter(entry => entry.due_id !== due.id), cash];
      } else {
        if (edited.paid_on !== null || edited.payment_method !== null || (edited.status === 'isento' ? edited.amount_cents !== 0 : !amount.safeParse(edited.amount_cents).success)) throw new Error('Confira a situação, o valor e o pagamento.');
        next.ledger = next.ledger.filter(entry => entry.due_id !== due.id);
      }
      Object.assign(due, edited);
    }
  } else if (command.type === 'update_expense' || command.type === 'delete_expense') {
    const expense = next.expenses.find(e => e.id === command.expense_id && e.terreiro_id === houseId);
    if (!expense) throw new Error('Gasto não encontrado. Atualize a lista.');
    const snapshot = expenseSnapshot(expense);
    if (Object.keys(snapshot).some(key => snapshot[key as keyof ExpenseSnapshot] !== command.expected[key as keyof ExpenseSnapshot])) throw new Error('Este gasto foi alterado. Atualize a lista antes de continuar.');
    const reminder = next.reminders.find(r => r.id === expense.reminder_id && r.terreiro_id === houseId);
    if (command.type === 'delete_expense') {
      next.expenses = next.expenses.filter(e => e.id !== expense.id);
      next.ledger = next.ledger.filter(entry => entry.expense_id !== expense.id);
      if (reminder) reminder.completed_at = null;
    } else {
      const edited = expenseSchema.parse({ ...expense, ...command.changes });
      Object.assign(expense, edited);
      const entry = next.ledger.find(entry => entry.expense_id === expense.id);
      const cash = ledgerSchema.parse({ ...(entry ?? base()), kind: 'saida', description: edited.description, category: edited.category, amount_cents: edited.amount_cents, occurred_on: edited.spent_on, due_id: null, expense_id: expense.id, request_id: null });
      next.ledger = [...next.ledger.filter(entry => entry.expense_id !== expense.id), cash];
      if (reminder) { reminder.description = edited.description; reminder.category = edited.category; }
    }
  } else if (command.type === 'expense') {
    if (next.expenses.some(e => e.terreiro_id === houseId && e.request_id === command.request_id)) return state;
    let reminder: Reminder | undefined;
    if (command.reminder_id) {
      reminder = next.reminders.find(r => r.id === command.reminder_id && r.terreiro_id === houseId);
      if (!reminder) throw new Error('Lembrete não encontrado.');
      if (reminder.completed_at) return state;
    }
    const expense = expenseSchema.parse({ ...base(), ...command, description: reminder?.description ?? command.description, category: reminder?.category ?? command.category });
    next.expenses.push(expense);
    next.ledger.push(ledgerSchema.parse({ ...base(), kind: 'saida', description: expense.description, category: expense.category, amount_cents: expense.amount_cents, occurred_on: expense.spent_on, due_id: null, expense_id: expense.id, request_id: null }));
    if (reminder) reminder.completed_at = now;
  } else if (command.type === 'income') {
    if (next.ledger.some(l => l.terreiro_id === houseId && l.request_id === command.request_id)) return state;
    next.ledger.push(ledgerSchema.parse({ ...base(), ...command, kind: 'entrada', due_id: null, expense_id: null }));
  } else {
    if (next.reminders.some(r => r.terreiro_id === houseId && r.request_id === command.request_id)) return state;
    next.reminders.push(reminderSchema.parse({ ...base(), ...command, completed_at: null }));
  }
  return financeSchema.parse(next);
}
export function summarize(state: FinanceState, period = '') {
  const entries = state.ledger.filter(l => !period || l.occurred_on.startsWith(period));
  const incoming = entries.filter(l => l.kind === 'entrada').reduce((a,l) => a+l.amount_cents,0);
  const outgoing = entries.filter(l => l.kind === 'saida').reduce((a,l) => a+l.amount_cents,0);
  const balance = (state.balance_offset_cents??0)+state.ledger.reduce((a,l) => a+(l.kind === 'entrada' ? l.amount_cents : -l.amount_cents),0);
  const pendingDues=state.dues.filter(d=>d.status==='pendente'&&(!period||d.reference.startsWith(period)));
  const pending=pendingDues.reduce((sum,d)=>sum+d.amount_cents,0);
  return { incoming, outgoing, balance, pending, pendingCount: pendingDues.length, periodBalance: incoming - outgoing };
}
