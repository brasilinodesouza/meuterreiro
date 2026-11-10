'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Modal } from './modal';
import { dueSnapshot, parseMoney, type Due, type FinanceCommand } from '@/lib/finance';

export function DueAmountEditor({ due, mediumName, onSave, onClose }: { due: Due; mediumName: string; onSave: (command: FinanceCommand) => Promise<void>; onClose: () => void }) {
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    try {
      const amount = parseMoney(String(new FormData(event.currentTarget).get('amount') ?? ''));
      saving.current = true; setBusy(true); setError('');
      await onSave({ type: 'update_due_amount', due_id: due.id, amount_cents: amount, expected: dueSnapshot(due) });
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar a mensalidade.'); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Modal title="Editar valor da mensalidade" onClose={() => { if (!saving.current) onClose(); }}>
    <form className="form" onSubmit={submit}>
      <p><strong>{mediumName}</strong> · {due.reference.slice(0,7).split('-').reverse().join('/')}</p>
      <label>Valor da mensalidade (R$)<input autoFocus name="amount" inputMode="decimal" required defaultValue={(due.amount_cents / 100).toFixed(2).replace('.', ',')} disabled={busy}/></label>
      {due.status === 'pago' && <p>A entrada deste pagamento será ajustada automaticamente no caixa.</p>}
      {error && <p className="alert error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="button primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar valor'}</button></div>
    </form>
  </Modal>;
}
