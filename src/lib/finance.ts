import { z } from 'zod';

export const categories = ['Velas e artigos', 'Limpeza', 'Alimentação', 'Contas da casa', 'Reparos', 'Outros'] as const;
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
export const dueSchema = z.object({ ...record, medium_id: id, reference: date, due_on: date, amount_cents: z.number().int().min(0).max(1000000000), status: z.enum(['pendente','pago','isento']), paid_on: date.nullable() });
export const expenseSchema = z.object({ ...record, description: z.string().trim().min(2).max(160), category: z.enum(categories), amount_cents: amount, spent_on: date, reminder_id: id.nullable(), request_id: id });
export const ledgerSchema = z.object({ ...record, description: z.string().trim().min(2).max(200), category: z.string().min(2).max(80), amount_cents: amount, occurred_on: date, kind: z.enum(['entrada','saida']), due_id: id.nullable(), expense_id: id.nullable(), request_id: id.nullable() });
export const reminderSchema = z.object({ ...record, description: z.string().trim().min(2).max(160), category: z.enum(categories), due_on: date.nullable(), completed_at: z.iso.datetime({ offset: true }).nullable(), request_id: id });
export const financeSchema = z.object({ dues: z.array(dueSchema), expenses: z.array(expenseSchema), ledger: z.array(ledgerSchema), reminders: z.array(reminderSchema) });
export type Due = z.infer<typeof dueSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type LedgerEntry = z.infer<typeof ledgerSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type FinanceState = z.infer<typeof financeSchema>;
export const emptyFinance = (): FinanceState => ({ dues: [], expenses: [], ledger: [], reminders: [] });
export type FinanceCommand =
  | { type: 'dues'; medium_ids: string[]; reference: string; due_on: string; amount_cents: number; exempt: boolean }
  | { type: 'pay'; due_id: string; paid_on: string }
  | { type: 'expense'; description: string; category: typeof categories[number]; amount_cents: number; spent_on: string; reminder_id: string | null; request_id: string }
  | { type: 'income'; description: string; category: typeof incomeCategories[number]; amount_cents: number; occurred_on: string; request_id: string }
  | { type: 'reminder'; description: string; category: typeof categories[number]; due_on: string | null; request_id: string };

export function applyFinance(state: FinanceState, command: FinanceCommand, houseId: string, mediumIds: string[], now = new Date().toISOString()): FinanceState {
  const next = structuredClone(state);
  const base = () => ({ id: crypto.randomUUID(), terreiro_id: houseId, created_at: now });
  if (command.type === 'dues') {
    if (!/^\d{4}-\d{2}-01$/.test(command.reference) || !date.safeParse(command.reference).success || !date.safeParse(command.due_on).success) throw new Error('Confira o mês de referência e o vencimento.');
    if (!command.medium_ids.length || command.medium_ids.some(m => !mediumIds.includes(m))) throw new Error('Selecione um médium da casa.');
    if (!command.exempt) amount.parse(command.amount_cents);
    for (const mediumId of new Set(command.medium_ids)) {
      if (next.dues.some(d => d.terreiro_id === houseId && d.medium_id === mediumId && d.reference === command.reference)) continue;
      next.dues.push(dueSchema.parse({ ...base(), medium_id: mediumId, reference: command.reference, due_on: command.due_on, amount_cents: command.exempt ? 0 : command.amount_cents, status: command.exempt ? 'isento' : 'pendente', paid_on: null }));
    }
  } else if (command.type === 'pay') {
    const due = next.dues.find(d => d.id === command.due_id && d.terreiro_id === houseId);
    if (!due) throw new Error('Mensalidade não encontrada.');
    if (due.status === 'isento') throw new Error('Uma mensalidade isenta não tem pagamento.');
    date.parse(command.paid_on);
    if (due.status === 'pago') return state;
    due.status = 'pago'; due.paid_on = command.paid_on;
    next.ledger.push(ledgerSchema.parse({ ...base(), kind: 'entrada', description: `Mensalidade · ${due.reference.slice(0,7).split('-').reverse().join('/')}`, category: 'Mensalidade', amount_cents: due.amount_cents, occurred_on: command.paid_on, due_id: due.id, expense_id: null, request_id: null }));
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
  const balance = state.ledger.reduce((a,l) => a+(l.kind === 'entrada' ? l.amount_cents : -l.amount_cents),0);
  return { incoming, outgoing, balance, periodBalance: incoming - outgoing };
}
