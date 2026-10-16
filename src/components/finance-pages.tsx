'use client';
import { useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { ArrowDownLeft, ArrowUpRight, Bell, Check, Pencil, Plus, ShoppingBag, Trash2, Upload, Wallet } from 'lucide-react';
import { Modal } from './modal';
import { DuesImport } from './dues-import';
import type { ImportedDue, ImportResult } from '@/lib/dues-import';
import { formatDate, type Medium } from '@/lib/data';
import { categories, duesSchedule, dueSnapshot, incomeCategories, money, parseMoney, paymentMethodSchema, paymentMethodText, summarize, today, type Due, type FinanceCommand, type FinanceState, type Reminder } from '@/lib/finance';
import { pendingDuesThrough, summarizeDebtors } from '@/lib/dues-summary';

export type FinanceView = 'mensalidades' | 'caixa' | 'gastos' | 'lembretes';
type Dialog = { kind: 'due' } | { kind: 'pay'; due: Due } | { kind: 'edit_due'; due: Due } | { kind: 'expense'; reminder?: Reminder } | { kind: 'income' } | { kind: 'reminder' };
type Props = { view: FinanceView; finance: FinanceState; mediums: Medium[]; onSave: (command: FinanceCommand) => Promise<void>; onImport: (rows: ImportedDue[]) => Promise<ImportResult>; onNavigate: (view: FinanceView) => void; unavailable: boolean; canEditDues: boolean };
const titles = { mensalidades: 'Mensalidades', caixa: 'Caixa', gastos: 'Gastos', lembretes: 'Lembretes' };
const descriptions = {
  mensalidades: 'Acompanhe os pagamentos e as pendências de cada mês.', caixa: 'Todas as entradas e saídas da casa, em um só lugar.',
  gastos: 'Registre o que foi comprado ou pago pelo terreiro.', lembretes: 'O que a casa precisa. Ao concluir uma compra, informe quanto gastou.',
};

export function FinancePages({ view, finance, mediums, onSave, onImport, onNavigate, unavailable, canEditDues }: Props) {
  const [period, setPeriod] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mensalidades') === 'pendentes' ? '' : today().slice(0,7));
  const [filter, setFilter] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mensalidades') === 'pendentes' ? 'devedores' : 'todos');
  const [reminderFilter, setReminderFilter] = useState('pendentes');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const importBusy = useRef(false);
  const dialogBusy = useRef(false);
  const [deletion, setDeletion] = useState<Due | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const totals = summarize(finance,period);
  const dues = (filter === 'devedores' ? pendingDuesThrough(finance.dues,today()) : finance.dues.filter(d => (!period || d.reference.startsWith(period)) && (filter === 'todos' || d.status === filter))).sort((a,b) => a.due_on.localeCompare(b.due_on));
  const debtors = summarizeDebtors(finance.dues,mediums,today());
  const expenses = finance.expenses.filter(e => !period || e.spent_on.startsWith(period)).sort((a,b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at));
  const ledger = finance.ledger.filter(e => !period || e.occurred_on.startsWith(period)).sort((a,b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at));
  const reminders = finance.reminders.filter(r => reminderFilter === 'todos' || (reminderFilter === 'concluidos' ? !!r.completed_at : !r.completed_at)).sort((a,b) => (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999') || a.created_at.localeCompare(b.created_at));
  const dueSummary = finance.dues.filter(d => !period || d.reference.startsWith(period));
  const mediumName = (id: string) => mediums.find(m => m.id === id)?.name ?? 'Médium da casa';
  const openPrimary = () => setDialog({ kind: view === 'mensalidades' ? 'due' : view === 'gastos' ? 'expense' : view === 'lembretes' ? 'reminder' : 'income' });
  async function deleteDue() {
    if (!deletion || deleteBusy || !canEditDues) return;
    setDeleteBusy(true); setDeleteError('');
    try { await onSave({ type: 'delete_due', due_id: deletion.id, expected: dueSnapshot(deletion) }); setDeletion(null); }
    catch (err) { setDeleteError(err instanceof Error ? err.message : 'Não foi possível apagar a mensalidade.'); }
    finally { setDeleteBusy(false); }
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow">CUIDADO NA ROTINA DA CASA</span><h1>{titles[view]}<span>.</span></h1><p>{descriptions[view]}</p></div><div className="heading-actions">{view === 'mensalidades' && <button className="button secondary" disabled={unavailable || !mediums.length} onClick={() => setImportOpen(true)}><Upload size={17} /> Importar PDF</button>}{view === 'caixa' && <button className="button secondary" disabled={unavailable} onClick={() => setDialog({ kind: 'expense' })}><ArrowUpRight size={17} /> Registrar gasto</button>}<button className="button primary" disabled={unavailable || (view === 'mensalidades' && mediums.length === 0)} onClick={openPrimary}><Plus size={17} />{view === 'mensalidades' ? 'Gerar mensalidades' : view === 'gastos' ? 'Registrar gasto' : view === 'lembretes' ? 'Novo lembrete' : 'Registrar entrada'}</button></div></div>
    {unavailable && <p className="alert error" role="alert">O financeiro não foi carregado. Confira a conexão e a migração do banco; recarregue para tentar novamente.</p>}
    {view !== 'lembretes' && !(view === 'mensalidades' && filter === 'devedores') && <div className="finance-period"><label>Mês {view === 'mensalidades' ? 'de referência' : 'dos lançamentos'}<input aria-label="Mês do financeiro" type="month" value={period} onChange={e => setPeriod(e.target.value)} /></label><button className="text-button" onClick={() => setPeriod('')}>Ver todo o histórico</button>{!period && <button className="text-button" onClick={() => setPeriod(today().slice(0,7))}>Voltar ao mês atual</button>}</div>}
    {!unavailable && view === 'caixa' && <div className="stats finance-stats"><Summary label="Saldo atual da casa" amount={totals.balance} text="Total de todas as movimentações" /><Summary label={period ? 'Entradas no mês' : 'Total de entradas'} amount={totals.incoming} text="Mensalidades e outras entradas" /><Summary label={period ? 'Saídas no mês' : 'Total de saídas'} amount={totals.outgoing} text="Gastos registrados" /></div>}
    {!unavailable && view === 'gastos' && <div className="finance-callout"><ShoppingBag size={23} /><div><span>{period ? 'Gastos do mês' : 'Gastos de todo o histórico'}</span><strong>{money(expenses.reduce((a,e) => a+e.amount_cents,0))}</strong></div><small>{expenses.length} {expenses.length === 1 ? 'registro' : 'registros'} · já descontados do caixa</small></div>}
    {!unavailable && view === 'mensalidades' && filter !== 'devedores' && <div className="stats finance-stats"><Summary label="Recebidas" amount={dueSummary.filter(d => d.status === 'pago').reduce((a,d) => a+d.amount_cents,0)} text={`${dueSummary.filter(d=>d.status==='pago').length} pagamentos registrados`} /><Summary label="Pendentes" amount={dueSummary.filter(d=>d.status==='pendente').reduce((a,d)=>a+d.amount_cents,0)} text={`${dueSummary.filter(d=>d.status==='pendente').length} mensalidades a receber`} /><div className="stat-card"><span>Isenções</span><strong>{dueSummary.filter(d=>d.status==='isento').length}</strong><small>Não geram movimentação no caixa</small></div></div>}
    {!unavailable && view === 'mensalidades' && filter === 'devedores' && <section className="panel settings-panel"><h2>Médiuns com mensalidades pendentes</h2><p>Mensalidades vencidas ou vencendo hoje ({formatDate(today())}), de todos os meses. Pagamentos e isenções já registrados ficam fora desta lista.</p><p>{debtors.length} {debtors.length === 1 ? 'médium' : 'médiuns'} · Total pendente: <strong>{money(debtors.reduce((sum,person) => sum+person.amount_cents,0))}</strong></p>{debtors.length ? <div className="table-scroll"><table><thead><tr><th>Médium</th><th>Mensalidades pendentes</th><th>Total pendente</th></tr></thead><tbody>{debtors.map(person => <tr key={person.medium_id}><td>{person.name}</td><td>{person.due_count}</td><td>{money(person.amount_cents)}</td></tr>)}</tbody></table></div> : <p>Nenhum médium com mensalidade pendente até hoje.</p>}</section>}
    <section className="panel">
      {view === 'mensalidades' && <><div className="filter-bar"><select aria-label="Situação da mensalidade" value={filter} onChange={e=>setFilter(e.target.value)}><option value="devedores">Devedores até hoje (todos os meses)</option><option value="todos">Todas as situações</option><option value="pendente">Pendentes</option><option value="pago">Pagas</option><option value="isento">Isentas</option></select><span>{dues.length} mensalidades</span></div>{!dues.length ? <FinanceEmpty text={mediums.length ? 'Nenhuma mensalidade neste período ou filtro.' : 'Cadastre os médiuns antes de criar mensalidades.'} /> : <div className="table-scroll"><table><thead><tr><th>Médium</th><th>Referência</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th>Pagamento</th><th>Forma de pagamento</th>{canEditDues&&<th>Ações</th>}</tr></thead><tbody>{dues.map(d=><tr key={d.id}><td className="finance-description">{mediumName(d.medium_id)}</td><td>{d.reference.slice(0,7).split('-').reverse().join('/')}</td><td>{formatDate(d.due_on)}{d.status==='pendente'&&d.due_on<today()&&<small className="overdue">Em atraso</small>}</td><td>{money(d.amount_cents)}</td><td><span className={`status ${d.status==='pago'?'ativo':d.status==='isento'?'desligado':'afastado'}`}>{d.status==='pago'?'Paga':d.status==='isento'?'Isenta':'Pendente'}</span></td><td>{d.status==='pendente'?<button className="button small-button secondary" disabled={unavailable} onClick={()=>setDialog({kind:'pay',due:d})}>Registrar pagamento</button>:d.paid_on?formatDate(d.paid_on):'—'}</td><td>{paymentMethodText(d)}</td>{canEditDues&&<td><div className="member-actions"><button type="button" className="button small-button secondary" disabled={unavailable} aria-label={`Editar mensalidade de ${mediumName(d.medium_id)} de ${d.reference.slice(0,7)}`} onClick={()=>setDialog({kind:'edit_due',due:d})}><Pencil size={14}/> Editar</button><button type="button" className="button small-button user-delete-button" disabled={unavailable} aria-label={`Apagar mensalidade de ${mediumName(d.medium_id)} de ${d.reference.slice(0,7)}`} onClick={()=>{setDeleteError('');setDeletion(d);}}><Trash2 size={14}/> Apagar</button></div></td>}</tr>)}</tbody></table></div>}</>}
      {view === 'gastos' && (!expenses.length ? <FinanceEmpty text="Nenhum gasto registrado neste período." /> : <div className="table-scroll"><table><thead><tr><th>Gasto realizado</th><th>Categoria</th><th>Data</th><th>Valor</th><th>Origem</th></tr></thead><tbody>{expenses.map(e=><tr key={e.id}><td className="finance-description">{e.description}</td><td>{e.category}</td><td>{formatDate(e.spent_on)}</td><td className="amount-out">{money(e.amount_cents)}</td><td>{e.reminder_id ? 'Lembrete concluído' : 'Cadastro direto'}</td></tr>)}</tbody></table></div>)}
      {view === 'caixa' && (!ledger.length ? <FinanceEmpty text="Nenhuma movimentação neste período. Registre uma entrada ou um gasto para começar." /> : <div className="table-scroll"><table><thead><tr><th>Movimentação</th><th>Categoria</th><th>Data</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>{ledger.map(e=><tr key={e.id}><td className="finance-description">{e.description}{e.due_id && <small>{mediumName(finance.dues.find(d=>d.id===e.due_id)?.medium_id ?? '')}</small>}</td><td>{e.category}</td><td>{formatDate(e.occurred_on)}</td><td><span className={`movement ${e.kind}`} >{e.kind==='entrada'?<ArrowDownLeft size={15}/>:<ArrowUpRight size={15}/>} {e.kind==='entrada'?'Entrada':'Saída'}</span></td><td className={e.kind==='entrada'?'amount-in':'amount-out'}>{e.kind==='entrada'?'+':'−'} {money(e.amount_cents)}</td></tr>)}</tbody></table></div>)}
      {view === 'lembretes' && <><div className="filter-bar"><select aria-label="Situação do lembrete" value={reminderFilter} onChange={e=>setReminderFilter(e.target.value)}><option value="pendentes">Pendentes</option><option value="concluidos">Concluídos</option><option value="todos">Todos os lembretes</option></select><span>{finance.reminders.filter(r=>!r.completed_at).length} pendentes</span></div>{!reminders.length ? <FinanceEmpty text="Nenhum lembrete neste filtro. Anote o que a casa precisa comprar." /> : <div className="reminder-list">{reminders.map(r=><div className={`reminder-row ${r.completed_at?'completed':''}`} key={r.id}><input type="checkbox" aria-label={`Concluir ${r.description}`} checked={!!r.completed_at} disabled={!!r.completed_at || unavailable} onChange={()=>setDialog({kind:'expense',reminder:r})}/><div><strong>{r.description}</strong><small>{r.category}{r.due_on ? ` · Até ${formatDate(r.due_on)}` : ' · Sem prazo'}</small>{r.completed_at && <small>Concluído · {money(finance.expenses.find(e=>e.reminder_id===r.id)?.amount_cents ?? 0)}</small>}</div>{r.completed_at ? <button className="text-button" onClick={()=>{setPeriod(finance.expenses.find(e=>e.reminder_id===r.id)?.spent_on.slice(0,7)??'');onNavigate('gastos');}}>Ver gasto</button> : <button className="text-button" disabled={unavailable} onClick={()=>setDialog({kind:'expense',reminder:r})}><Check size={15}/> Concluir compra</button>}</div>)}</div>}<p className="finance-footnote"><Bell size={14}/> Lembretes são uma lista de compras e tarefas; ainda não enviam notificações.</p></>}
    </section>
    {importOpen && <Modal title="Importar mensalidades" onClose={() => { if (!importBusy.current) setImportOpen(false); }}><DuesImport mediums={mediums} dues={finance.dues} onSave={onImport} onBusy={busy => { importBusy.current = busy; }} /></Modal>}
    {dialog && <Modal title={dialog.kind==='due'?'Gerar mensalidades':dialog.kind==='edit_due'?'Editar mensalidade':dialog.kind==='pay'?'Registrar pagamento':dialog.kind==='income'?'Registrar entrada':dialog.kind==='reminder'?'Novo lembrete':dialog.reminder?'Concluir compra e registrar gasto':'Registrar gasto'} onClose={()=>{if(!dialogBusy.current)setDialog(null);}}><FinanceForm dialog={dialog} mediums={mediums} period={period || today().slice(0,7)} onBusy={busy=>{dialogBusy.current=busy;}} onSave={async command=>{await onSave(command);setDialog(null);if(command.type==='expense'&&command.reminder_id){setPeriod(command.spent_on.slice(0,7));onNavigate('gastos');}}} /></Modal>}
    {deletion && <Modal title="Apagar mensalidade" onClose={()=>{if(!deleteBusy)setDeletion(null);}}>
      <p>Apagar a mensalidade de <strong>{mediumName(deletion.medium_id)}</strong>, referência <strong>{deletion.reference.slice(0,7).split('-').reverse().join('/')}</strong>, no valor de <strong>{money(deletion.amount_cents)}</strong>?</p>
      <p>{deletion.status==='pago'?'A entrada deste pagamento também será removida do caixa, reduzindo o saldo pelo valor recebido.':'Esta exclusão não altera o saldo do caixa.'} A ação é definitiva.</p>
      {deleteError && <p className="alert error" role="alert">{deleteError}</p>}
      <div className="users-actions"><button type="button" className="button secondary" disabled={deleteBusy} onClick={()=>setDeletion(null)}>Cancelar</button><button type="button" className="button user-delete-button" disabled={deleteBusy} onClick={()=>void deleteDue()}>{deleteBusy?'Apagando…':'Apagar mensalidade'}</button></div>
    </Modal>}
  </>;
}
function Summary({ label, amount, text }: { label:string;amount:number;text:string }) { return <div className="stat-card"><span>{label}</span><strong className={`money-total ${amount<0?'amount-out':''}`}>{money(amount)}</strong><small>{text}</small></div>; }
function FinanceEmpty({text}:{text:string}) { return <div className="empty"><Wallet size={28}/><h3>Organize um registro de cada vez.</h3><p>{text}</p></div>; }

function FinanceForm({ dialog, mediums, period, onSave, onBusy }: { dialog:Dialog;mediums:Medium[];period:string;onSave:(c:FinanceCommand)=>Promise<void>;onBusy:(busy:boolean)=>void }) {
  const requestId = useRef(crypto.randomUUID());
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [exempt,setExempt]=useState(false);
  const isExpense = dialog.kind==='expense'; const isReminder = dialog.kind==='reminder'; const isIncome=dialog.kind==='income';
  const [dueStatus,setDueStatus]=useState<Due['status']>(dialog.kind==='edit_due'?dialog.due.status:'pendente');
  const [throughYearEnd,setThroughYearEnd]=useState(true);
  const [generationMonth,setGenerationMonth]=useState(period);
  const [generationDue,setGenerationDue]=useState(period+'-10');
  function changeGenerationMonth(month: string) {
    setGenerationMonth(month);
    if (/^\d{4}-\d{2}$/.test(month)) {
      const day = generationDue.slice(8,10) || '10';
      const lastDay = new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
      setGenerationDue(`${month}-${String(Math.min(Number(day),lastDay)).padStart(2,'0')}`);
    }
  }
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(busy)return; setError('');
    const f=new FormData(e.currentTarget); const field=(key:string)=>String(f.get(key)??'');
    try {
      let command:FinanceCommand;
      if(dialog.kind==='due') { const choice=field('medium'); duesSchedule(field('reference')+'-01',field('due_on'),throughYearEnd); command={type:'dues',medium_ids:choice==='all'?mediums.filter(m=>m.status==='ativo').map(m=>m.id):[choice],reference:field('reference')+'-01',due_on:field('due_on'),amount_cents:exempt?0:parseMoney(field('amount')),exempt,through_year_end:throughYearEnd}; }
      else if(dialog.kind==='pay') command={type:'pay',due_id:dialog.due.id,paid_on:field('date'),payment_method:paymentMethodSchema.parse(field('payment_method'))};
      else if(dialog.kind==='edit_due') command={type:'update_due',due_id:dialog.due.id,expected:dueSnapshot(dialog.due),changes:{medium_id:field('medium'),reference:field('reference')+'-01',due_on:field('due_on'),amount_cents:dueStatus==='isento'?0:parseMoney(field('amount')),status:dueStatus,paid_on:dueStatus==='pago'?field('date'):null,payment_method:dueStatus==='pago'?paymentMethodSchema.parse(field('payment_method')):null}};
      else if(dialog.kind==='reminder') command={type:'reminder',description:field('description').trim(),category:z.enum(categories).parse(field('category')),due_on:field('date')||null,request_id:requestId.current};
      else if(dialog.kind==='income') command={type:'income',description:field('description').trim(),category:z.enum(incomeCategories).parse(field('category')),amount_cents:parseMoney(field('amount')),occurred_on:field('date'),request_id:requestId.current};
      else command={type:'expense',description:dialog.reminder?.description??field('description').trim(),category:dialog.reminder?.category??z.enum(categories).parse(field('category')),amount_cents:parseMoney(field('amount')),spent_on:field('date'),reminder_id:dialog.reminder?.id??null,request_id:requestId.current};
      setBusy(true); onBusy(true); await onSave(command);
    } catch(err) { setError(err instanceof z.ZodError?'Confira os dados do formulário.':err instanceof Error?err.message:'Não foi possível salvar. Tente novamente.'); }
    finally { setBusy(false); onBusy(false); }
  }
  return <form className="form" onSubmit={submit}>
    {dialog.kind==='expense'&&dialog.reminder&&<div className="finance-confirmation"><ShoppingBag size={21}/><div><strong>{dialog.reminder.description}</strong><p>Informe o valor gasto. A confirmação conclui o lembrete, registra o gasto e gera uma saída no caixa.</p></div></div>}
    {dialog.kind==='due'&&<><label>Médium<select name="medium" required defaultValue=""><option value="" disabled>Selecione</option>{mediums.some(m=>m.status==='ativo')&&<option value="all">Todos os médiuns ativos</option>}{mediums.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className="form-grid"><label>Mês inicial<input name="reference" type="month" required min="0001-01" max="9999-12" value={generationMonth} disabled={busy} onChange={event=>changeGenerationMonth(event.target.value)}/></label><label>Primeiro vencimento<input name="due_on" type="date" required value={generationDue} disabled={busy} onChange={event=>setGenerationDue(event.target.value)}/></label></div><div className="dues-generation-options" role="group" aria-label="Período de geração"><button type="button" className={`button ${throughYearEnd?'primary':'secondary'}`} aria-pressed={throughYearEnd} disabled={busy} onClick={()=>setThroughYearEnd(true)}>Até o final do ano</button><button type="button" className={`button ${throughYearEnd?'secondary':'primary'}`} aria-pressed={!throughYearEnd} disabled={busy} onClick={()=>setThroughYearEnd(false)}>Somente este mês</button></div><p className="form-intro">{throughYearEnd?`Serão geradas mensalidades do mês inicial até dezembro de ${generationMonth.slice(0,4)}. A geração para em dezembro; o próximo ano exige uma nova geração.`:'Será gerada apenas a mensalidade do mês escolhido.'} O dia de vencimento se repete; em meses mais curtos, usamos o último dia.</p><label className="checkbox-label"><input type="checkbox" checked={exempt} onChange={e=>setExempt(e.target.checked)}/> Isentar as mensalidades geradas</label>{!exempt&&<label>Valor da mensalidade (R$)<input name="amount" inputMode="decimal" required placeholder="Ex.: 50,00" autoComplete="off"/></label>}<p className="form-intro">Mensalidades já existentes para o médium e mês serão preservadas, inclusive pagas ou isentas. Somente as que faltam serão criadas.</p></>}
    {dialog.kind==='edit_due'&&<>
      <label>Médium<select name="medium" required defaultValue={dialog.due.medium_id}>{mediums.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <div className="form-grid"><label>Mês de referência<input name="reference" type="month" required defaultValue={dialog.due.reference.slice(0,7)}/></label><label>Vencimento<input name="due_on" type="date" required defaultValue={dialog.due.due_on}/></label></div>
      <label>Situação<select value={dueStatus} onChange={event=>setDueStatus(event.target.value as Due['status'])}><option value="pendente">Pendente</option><option value="pago">Paga</option><option value="isento">Isenta</option></select></label>
      {dueStatus!=='isento'&&<label>Valor da mensalidade (R$)<input name="amount" inputMode="decimal" required defaultValue={dialog.due.amount_cents?(dialog.due.amount_cents/100).toFixed(2).replace('.',','):''}/></label>}
      <p>Mensalidades pagas atualizam a entrada correspondente no caixa. Ao mudar para pendente ou isenta, essa entrada será removida.</p>
    </>}
    {dialog.kind==='pay'&&<div className="finance-confirmation"><Wallet size={21}/><div><strong>{mediums.find(m=>m.id===dialog.due.medium_id)?.name}</strong><p>Mensalidade {dialog.due.reference.slice(0,7).split('-').reverse().join('/')} · {money(dialog.due.amount_cents)}. O valor recebido entra automaticamente no caixa.</p></div></div>}
    {(dialog.kind==='pay'||(dialog.kind==='edit_due'&&dueStatus==='pago'))&&<>
      <label>Data do recebimento<input name="date" type="date" required defaultValue={dialog.kind==='edit_due'?dialog.due.paid_on??today():today()}/></label>
      <label>Forma de pagamento<select name="payment_method" required defaultValue={dialog.kind==='edit_due'?dialog.due.payment_method??'':''}><option value="" disabled>Selecione</option><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option></select></label>
    </>}
    {(isIncome||isReminder||(isExpense&&!dialog.reminder))&&<><label>{isReminder?'O que precisa ser feito ou comprado?':'Descrição'}<input name="description" minLength={2} maxLength={160} required placeholder={isReminder?'Ex.: Comprar vela':isIncome?'Ex.: Doação recebida':'Ex.: Compra de produto de limpeza'}/></label><label>Categoria<select name="category" required defaultValue={isIncome?'Doação':'Outros'}>{(isIncome?incomeCategories:categories).map(c=><option key={c}>{c}</option>)}</select></label></>}
    {(isIncome||isExpense)&&<label>Valor {isExpense?'gasto':'recebido'} (R$)<input name="amount" inputMode="decimal" required placeholder="Ex.: 25,90" autoComplete="off"/></label>}
    {(isIncome||isExpense||isReminder)&&<label>{isReminder?'Prazo (opcional)':isExpense?'Data do gasto':'Data da entrada'}<input name="date" type="date" required={!isReminder} defaultValue={isReminder?'':today()}/></label>}
    {error&&<p role="alert" className="alert error">{error}</p>}
    <div className="form-actions"><button className="button primary" disabled={busy} type="submit">{busy?'Salvando…':dialog.kind==='due'?'Gerar mensalidades':dialog.kind==='edit_due'?'Salvar alterações':dialog.kind==='pay'?'Confirmar recebimento':dialog.kind==='reminder'?'Salvar lembrete':isExpense?'Confirmar gasto':'Salvar entrada'}</button></div>
  </form>;
}
