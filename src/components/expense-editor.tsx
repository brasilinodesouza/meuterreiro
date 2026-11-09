'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Modal } from './modal';
import { expenseSnapshot, money, parseMoney, type FinanceCommand, type FinanceState } from '@/lib/finance';

type Props = { expense: FinanceState['expenses'][number]; categories: string[]; deleting?: boolean; onSave: (command: FinanceCommand) => Promise<void>; onClose: () => void };

export function ExpenseEditor({ expense, categories, deleting = false, onSave, onClose }: Props) {
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try {
      const form = new FormData(event.currentTarget);
      const field = (key: string) => String(form.get(key) ?? '');
      const expected = expenseSnapshot(expense);
      await onSave(deleting
        ? { type: 'delete_expense', expense_id: expense.id, expected }
        : { type: 'update_expense', expense_id: expense.id, expected, changes: { description: field('description').trim(), category: field('category'), amount_cents: parseMoney(field('amount')), spent_on: field('date') } });
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar o gasto.'); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Modal title={deleting ? 'Excluir gasto' : 'Editar gasto'} onClose={() => { if (!saving.current) onClose(); }}>
    <form className="form" onSubmit={submit}>
      {deleting ? <>
        <p>Excluir o gasto <strong>{expense.description}</strong>, no valor de <strong>{money(expense.amount_cents)}</strong>?</p>
        <p>A saída correspondente será removida do caixa, devolvendo esse valor ao saldo. Esta exclusão é definitiva.</p>
        {expense.reminder_id && <p>O lembrete vinculado voltará a ficar pendente.</p>}
      </> : <>
        <label>Descrição<input autoFocus name="description" required minLength={2} maxLength={160} defaultValue={expense.description} disabled={busy}/></label>
        <label>Categoria<select name="category" required defaultValue={expense.category} disabled={busy}>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
        <label>Valor gasto (R$)<input name="amount" inputMode="decimal" required defaultValue={(expense.amount_cents / 100).toFixed(2).replace('.', ',')} disabled={busy}/></label>
        <label>Data do gasto<input name="date" type="date" required defaultValue={expense.spent_on} disabled={busy}/></label>
        <p>As alterações atualizam automaticamente a saída correspondente no caixa.</p>
      </>}
      {error && <p className="alert error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><button type="submit" className={`button ${deleting ? 'user-delete-button' : 'primary'}`} disabled={busy}>{busy ? 'Salvando…' : deleting ? 'Excluir gasto' : 'Salvar alterações'}</button></div>
    </form>
  </Modal>;
}
