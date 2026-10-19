'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { calendarDateSchema, calendarMonths, calendarToday, isOrixaDay, type CalendarDateInput, type CalendarEntry } from '@/lib/orixa-calendar';
import { deleteCalendarDate, loadCalendar, saveCalendarDate } from '@/lib/orixa-calendar-repository';
import { startMemberUpdates } from '@/lib/member-updates';
import { Modal } from './modal';

export function OrixaCalendar({ houseId, canManage = false }: { houseId: string; canManage?: boolean }) {
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<CalendarEntry | 'new' | null>(null);
  const [removing, setRemoving] = useState<CalendarEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [today, setToday] = useState(calendarToday);
  const writing = useRef(false);
  const revision = useRef(0);
  useEffect(() => startMemberUpdates({
    async read() { const version = revision.current; return { version, entries: await loadCalendar(houseId) }; },
    onData(result) {
      if (writing.current || result.version !== revision.current) return;
      setEntries(result.entries); setLoaded(true); setError(''); setToday(calendarToday());
    },
    onError() { if (!writing.current) setError('Não foi possível atualizar o calendário. Use Atualizar calendário para tentar novamente.'); },
  }), [houseId, refresh]);

  async function save(input: CalendarDateInput) {
    if (!canManage || writing.current) throw new Error('Você não pode alterar o calendário agora.');
    writing.current = true; revision.current++; setBusy(true);
    try {
      const entry = await saveCalendarDate(houseId, input, editor && editor !== 'new' ? editor.id : undefined);
      setEntries(current => [...current.filter(item => item.id !== entry.id), entry]);
      setEditor(null); setNotice('Data salva no calendário.');
    } finally { writing.current = false; revision.current++; setBusy(false); setRefresh(value => value + 1); }
  }
  async function remove() {
    if (!removing || !canManage || writing.current) return;
    writing.current = true; revision.current++; setBusy(true); setDeleteError('');
    try {
      await deleteCalendarDate(houseId, removing.id);
      setEntries(current => current.filter(item => item.id !== removing.id)); setRemoving(null); setNotice('Data excluída do calendário.');
    } catch (err) { setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir a data.'); }
    finally { writing.current = false; revision.current++; setBusy(false); setRefresh(value => value + 1); }
  }
  const celebrants = entries.filter(entry => isOrixaDay(entry, today));
  return <section className="panel orixa-calendar" aria-label="Calendário">
    <div className="panel-heading events-heading"><div><h2>Calendário</h2><p>Datas da nossa tradição, celebradas todos os anos.</p></div><div className="events-actions">
      <button type="button" className="icon-button" aria-label="Atualizar calendário" title="Atualizar calendário" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18} /></button>
      {canManage && <button type="button" className="button primary" disabled={busy} onClick={() => { setNotice(''); setEditor('new'); }}><Plus size={17} /> Cadastrar data</button>}
    </div></div>
    <div className="events-body">
      {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert success" role="status">{notice}</p>}
      {celebrants.length > 0 && <div className="orixa-today" role="status"><CalendarDays size={23} /><div><strong>Hoje celebramos {celebrants.map(entry => entry.name).join(', ')}!</strong><p>Um dia de fé, respeito e gratidão.</p></div></div>}
      {canManage && <p className="orixa-notification-note">Em cada data do calendário, os avisos são enviados às 8h de Brasília. Permita notificações no aparelho para recebê-los, mesmo com o app fechado.</p>}
      {!loaded ? <p role="status">{error ? 'Calendário indisponível. Tente atualizar.' : 'Carregando calendário…'}</p> : entries.length ? <div className="orixa-months">{calendarMonths.map((month, index) => {
        const dates = entries.filter(entry => entry.month === index + 1).sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, 'pt-BR'));
        return dates.length > 0 && <section className="orixa-month" key={month} aria-label={month}><h3>{month}</h3><ol>{dates.map(entry => <li key={entry.id} className={isOrixaDay(entry, today) ? 'orixa-date is-today' : 'orixa-date'}>
          <span className="orixa-day">{String(entry.day).padStart(2, '0')}</span><div className="orixa-name"><strong>{entry.name}</strong><small>{entry.day} de {month}{isOrixaDay(entry, today) ? ' · Hoje' : ''}</small></div>
          {canManage && <div className="event-controls"><button type="button" className="icon-button" aria-label={`Editar data de ${entry.name}`} disabled={busy} onClick={() => setEditor(entry)}><Pencil size={16} /></button><button type="button" className="icon-button" aria-label={`Excluir data de ${entry.name}`} disabled={busy} onClick={() => { setDeleteError(''); setRemoving(entry); }}><Trash2 size={16} /></button></div>}
        </li>)}</ol></section>;
      })}</div> : <div className="events-empty"><CalendarDays size={30} /><h3>Nenhuma data cadastrada</h3><p>{canManage ? 'Cadastre a primeira celebração da casa.' : 'A administração pode adicionar as datas da casa.'}</p></div>}
    </div>
    {canManage && editor && <Modal title={editor === 'new' ? 'Cadastrar data' : 'Editar data'} onClose={() => { if (!writing.current) setEditor(null); }}><CalendarForm entry={editor === 'new' ? undefined : editor} onSave={save} onCancel={() => setEditor(null)} /></Modal>}
    {canManage && removing && <Modal title="Excluir data" onClose={() => { if (!writing.current) setRemoving(null); }}><p>Excluir a comemoração de <strong>{removing.name}</strong>, em {removing.day} de {calendarMonths[removing.month - 1]}? Ela deixará de aparecer e de gerar avisos nos próximos anos.</p>{deleteError && <p className="alert error" role="alert">{deleteError}</p>}<div className="form-actions"><button className="button secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancelar</button><button className="button danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Excluindo…' : 'Excluir data'}</button></div></Modal>}
  </section>;
}

function CalendarForm({ entry, onSave, onCancel }: { entry?: CalendarEntry; onSave: (input: CalendarDateInput) => Promise<void>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    const parsed = calendarDateSchema.safeParse({ name: data.get('name'), day: Number(data.get('day')), month: Number(data.get('month')) });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    submitting.current = true; setBusy(true); setError('');
    try { await onSave(parsed.data); } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar a data.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <form className="form" onSubmit={submit}><fieldset className="event-fields" disabled={busy}>
    <label>Nome da comemoração<input name="name" required minLength={2} maxLength={80} defaultValue={entry?.name} autoFocus placeholder="Nome da comemoração" /></label>
    <div className="form-grid"><label>Dia<input type="number" name="day" required min={1} max={31} defaultValue={entry?.day} /></label><label>Mês<select name="month" required defaultValue={entry?.month ?? ''}><option value="" disabled>Selecione</option>{calendarMonths.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label></div>
    <p>A comemoração se repete anualmente. O aviso será enviado na data cadastrada.</p>
    {error && <p className="alert error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={onCancel}>Cancelar</button><button type="submit" className="button primary">{busy && <LoaderCircle className="spin" size={16} />}{busy ? 'Salvando…' : 'Salvar data'}</button></div>
  </fieldset></form>;
}
