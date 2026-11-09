'use client';
import { useRef, useState, type FormEvent } from 'react';
import { Modal } from './modal';
import { money, parseBalance, type FinanceCommand } from '@/lib/finance';

export function BalanceEditor({balance,onSave,onClose}:{balance:number;onSave:(command:FinanceCommand)=>Promise<void>;onClose:()=>void}) {
  const [initialBalance]=useState(balance);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const operation=useRef(false);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(operation.current)return;
    setError('');
    try {
      const amount=parseBalance(String(new FormData(event.currentTarget).get('amount')??''));
      operation.current=true;setBusy(true);
      await onSave({type:'set_balance',amount_cents:amount,expected_balance:initialBalance});
      onClose();
    } catch(err) {setError(err instanceof Error?err.message:'Não foi possível atualizar o saldo.');}
    finally {operation.current=false;setBusy(false);}
  }
  return <Modal title="Editar saldo atual da casa" onClose={()=>{if(!operation.current)onClose();}}><form className="form" onSubmit={submit}>
    <p>Saldo atual: <strong>{money(initialBalance)}</strong>. Informe o saldo real da casa. As próximas entradas e saídas serão somadas a esse valor.</p>
    <label>Saldo correto (R$)<input name="amount" inputMode="decimal" required defaultValue={(initialBalance/100).toFixed(2).replace('.',',')} disabled={busy}/></label>
    {error&&<p role="alert" className="alert error">{error}</p>}
    <button className="button primary" disabled={busy}>{busy?'Salvando…':'Salvar saldo'}</button>
  </form></Modal>;
}
