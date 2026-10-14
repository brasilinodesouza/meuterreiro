import { supabase } from './supabase';
import { z } from 'zod';
import { importedDuesSchema, type ImportedDue, type ImportResult } from './dues-import';
import { dueSchema, financeSchema, type FinanceCommand, type FinanceState } from './finance';
import { roleMessage } from './memberships';
export async function loadFinance(houseId: string): Promise<FinanceState> {
  if (!supabase) throw new Error('Banco não conectado.');
  const [dues,expenses,ledger,reminders] = await Promise.all([
    supabase.from('mensalidades').select('*').eq('terreiro_id',houseId),
    supabase.from('gastos').select('*').eq('terreiro_id',houseId),
    supabase.from('caixa').select('*').eq('terreiro_id',houseId),
    supabase.from('lembretes').select('*').eq('terreiro_id',houseId),
  ]);
  if ([dues,expenses,ledger,reminders].some(r => r.error)) throw new Error('Não foi possível carregar o financeiro. Confira a conexão e execute a migração 002 no Supabase.');
  return financeSchema.parse({ dues: dues.data, expenses: expenses.data, ledger: ledger.data, reminders: reminders.data });
}
export async function loadMemberDues(houseId: string, mediumId: string | null) {
  if (!supabase) throw new Error('Banco não conectado.');
  if (!mediumId) return [];
  const result = await supabase.from('mensalidades').select('*').eq('terreiro_id', houseId).eq('medium_id', mediumId);
  if (result.error) throw new Error('Não foi possível atualizar suas mensalidades.');
  return z.array(dueSchema).parse(result.data);
}
export async function saveFinance(houseId: string, command: FinanceCommand) {
  if (!supabase) throw new Error('Banco não conectado.');
  let fn: string; let params: Record<string, unknown>;
  if (command.type === 'dues') { fn = 'finance_create_dues'; params = { p_house: houseId, p_medium_ids: command.medium_ids, p_reference: command.reference, p_due_on: command.due_on, p_amount: command.amount_cents, p_exempt: command.exempt }; }
  else if (command.type === 'pay') { fn = 'finance_pay_due_with_method'; params = { p_due: command.due_id, p_paid_on: command.paid_on, p_payment_method: command.payment_method }; }
  else if (command.type === 'update_due') { const d = command.changes; fn = 'finance_update_due'; params = { p_due: command.due_id, p_medium: d.medium_id, p_reference: d.reference, p_due_on: d.due_on, p_amount: d.amount_cents, p_status: d.status, p_paid_on: d.paid_on, p_payment_method: d.payment_method, p_expected: command.expected }; }
  else if (command.type === 'delete_due') { fn = 'finance_delete_due'; params = { p_due: command.due_id, p_expected: command.expected }; }
  else if (command.type === 'expense') { fn = 'finance_create_expense'; params = { p_house: houseId, p_description: command.description, p_category: command.category, p_amount: command.amount_cents, p_spent_on: command.spent_on, p_reminder: command.reminder_id, p_request: command.request_id }; }
  else if (command.type === 'income') { fn = 'finance_create_income'; params = { p_house: houseId, p_description: command.description, p_category: command.category, p_amount: command.amount_cents, p_occurred_on: command.occurred_on, p_request: command.request_id }; }
  else { fn = 'finance_create_reminder'; params = { p_house: houseId, p_description: command.description, p_category: command.category, p_due_on: command.due_on, p_request: command.request_id }; }
  const result = await supabase.rpc(fn,params);
  if (result.error) {
    if (result.error.code === 'P0001') throw new Error(roleMessage(result.error.message));
    if (result.error.code === 'PGRST202') throw new Error('Esta operação ainda precisa ser habilitada no banco.');
    throw new Error('Não foi possível salvar. Confira a conexão e os dados.');
  }
}

export async function importDues(houseId: string, rows: ImportedDue[]): Promise<ImportResult> {
  if (!supabase) throw new Error('Banco não conectado.');
  const result = await supabase.rpc('finance_import_dues', { p_house: houseId, p_rows: importedDuesSchema.parse(rows) });
  if (result.error) {
    if (result.error.code === 'PGRST202') throw new Error('A importação ainda precisa ser habilitada no banco. Execute a migração 005.');
    if (result.error.code === 'P0001') throw new Error(roleMessage(result.error.message));
    throw new Error('Não foi possível importar. Confira a conexão e tente novamente; a repetição não duplica os registros.');
  }
  return z.object({ imported: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), payments: z.number().int().nonnegative() }).parse(result.data);
}
