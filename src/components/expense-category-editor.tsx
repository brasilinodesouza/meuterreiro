'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Modal } from './modal';
import { expenseCategorySchema, type FinanceCommand } from '@/lib/finance';

export function ExpenseCategoryEditor({ categories, onSave, onClose }: { categories:string[]; onSave:(command:FinanceCommand)=>Promise<void>; onClose:()=>void }) {
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const parsed = expenseCategorySchema.safeParse(new FormData(event.currentTarget).get('name'));
    if (!parsed.success) { setError('Informe um nome entre 2 e 80 caracteres.'); return; }
    if (categories.some(name => name.toLocaleLowerCase('pt-BR') === parsed.data.toLocaleLowerCase('pt-BR'))) { setError('Esta categoria já existe.'); return; }
    saving.current = true; setBusy(true); setError('');
    try { await onSave({ type:'expense_category', name:parsed.data }); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível criar a categoria.'); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Modal title="Nova categoria de gastos" onClose={() => { if (!saving.current) onClose(); }}><form className="form" onSubmit={submit}>
    <label>Nome da categoria<input autoFocus name="name" required minLength={2} maxLength={80} placeholder="Ex.: Aluguel" disabled={busy}/></label>
    <p>A categoria ficará disponível ao registrar gastos e lembretes desta casa.</p>
    {error && <p className="alert error" role="alert">{error}</p>}
    <div className="form-actions"><button className="button secondary" disabled={busy} type="button" onClick={onClose}>Cancelar</button><button className="button primary" disabled={busy} type="submit">{busy ? 'Salvando…' : 'Criar categoria'}</button></div>
  </form></Modal>;
}
