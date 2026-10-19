'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarDays, CheckCircle2, Clock3, LoaderCircle, MapPin, Pencil, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { formatDate } from '@/lib/data';
import { eventCalendar, eventInputSchema, upcomingEvents, type EventAttendee, type EventConfirmation, type HouseEvent } from '@/lib/events';
import { deleteEvent, loadEventAttendees, loadEventConfirmations, loadEvents, saveEvent, setEventConfirmation } from '@/lib/events-repository';
import { startMemberUpdates } from '@/lib/member-updates';
import { Modal } from './modal';

export function EventsPanel({ houseId, userId, canManage = false }: { houseId: string; userId: string; canManage?: boolean }) {
  const [events, setEvents] = useState<HouseEvent[]>([]);
  const [confirmations, setConfirmations] = useState<EventConfirmation[]>([]);
  const [attendeesEventId, setAttendeesEventId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState<{ eventId: string; message: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [editor, setEditor] = useState<HouseEvent | 'new' | null>(null);
  const [removing, setRemoving] = useState<HouseEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [calendar, setCalendar] = useState(() => eventCalendar());
  const writing = useRef(false);
  const revision = useRef(0);

  useEffect(() => startMemberUpdates({
    async read() {
      const version = revision.current;
      const [events, confirmations] = await Promise.all([loadEvents(houseId, canManage), loadEventConfirmations(houseId, canManage)]);
      return { version, events, confirmations };
    },
    onData(result) {
      if (result.version !== revision.current || writing.current) return;
      setEvents(result.events); setConfirmations(result.confirmations); setLoaded(true); setError('');
    },
    onError() { if (!writing.current) setError('Não foi possível atualizar os eventos. Tente novamente pelo botão Atualizar eventos.'); },
  }), [houseId, canManage, refresh]);

  useEffect(() => {
    const check = () => setCalendar(current => {
      const next = eventCalendar();
      return next.today === current.today ? current : next;
    });
    const interval = window.setInterval(check, 1000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, []);

  const visible = upcomingEvents(events, canManage);
  const attendeesEvent = visible.find(event => event.id === attendeesEventId);
  const { monthLabel } = calendar;
  function closeEditor() { if (!writing.current) setEditor(null); }
  async function changeConfirmation(event: HouseEvent, confirmed: boolean) {
    if (writing.current) return;
    writing.current = true; revision.current++; setBusy(true); setConfirmingId(event.id); setConfirmationError(null); setNotice('');
    try {
      await setEventConfirmation(event.id, userId, confirmed);
      setConfirmations(current => {
        const others = current.filter(row => row.event_id !== event.id || row.user_id !== userId);
        return confirmed ? [...others, { event_id: event.id, user_id: userId }] : others;
      });
      setNotice(confirmed ? `Presença confirmada em ${event.title}.` : `Sua confirmação em ${event.title} foi cancelada.`);
    } catch (err) { setConfirmationError({ eventId: event.id, message: err instanceof Error ? err.message : 'Não foi possível alterar sua presença.' }); }
    finally { writing.current = false; revision.current++; setBusy(false); setConfirmingId(null); setRefresh(value => value + 1); }
  }
  async function confirmDelete() {
    if (!removing || writing.current || !canManage) return;
    writing.current = true; revision.current++; setBusy(true); setDeleteError('');
    try {
      await deleteEvent(houseId, removing.id);
      setEvents(current => current.filter(event => event.id !== removing.id));
      setRemoving(null); setNotice('Evento excluído.');
    } catch (err) { setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir o evento.'); }
    finally { writing.current = false; revision.current++; setBusy(false); setRefresh(value => value + 1); }
  }

  return <section className="panel events-panel" aria-label="Próximos eventos">
    <div className="panel-heading events-heading"><div><h2>Próximos eventos</h2><p>{canManage ? 'Organize a agenda da casa. Os médiuns veem somente os próximos eventos do mês atual.' : `Agenda da casa · ${monthLabel}.`}</p></div>
      <div className="events-actions"><button type="button" className="icon-button" aria-label="Atualizar eventos" title="Atualizar eventos" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18} /></button>{canManage && <button type="button" className="button primary" onClick={() => { setNotice(''); setEditor('new'); }}><Plus size={17} /> Cadastrar evento</button>}</div>
    </div>
    <div className="events-body">
      {error && <p className="alert error" role="alert">{error}</p>}
      {notice && <p className="alert success" role="status">{notice}</p>}
      {!loaded ? <p role="status">{error ? 'A lista está indisponível. Use Atualizar eventos para tentar novamente.' : 'Carregando eventos…'}</p> : visible.length ? <ol className="events-list">{visible.map(event => {
        const attendees = confirmations.filter(row => row.event_id === event.id);
        const confirmed = attendees.some(row => row.user_id === userId);
        return <li className="event-card" key={event.id}>
        <div className="event-date"><CalendarDays size={19} aria-hidden="true" /><time dateTime={event.occurs_on}>{formatDate(event.occurs_on)}</time></div>
        <div className="event-details"><h3>{event.title}</h3><div className="event-meta"><span><Clock3 size={15} aria-hidden="true" />{event.starts_at ? <time dateTime={`${event.occurs_on}T${event.starts_at}`}>{event.starts_at}</time> : 'Horário a definir'}</span>{event.location && <span><MapPin size={15} aria-hidden="true" />{event.location}</span>}</div>{event.description && <p className="event-description">{event.description}</p>}
          <div className="event-attendance">
            {confirmed && <span className="event-confirmed" role="status"><CheckCircle2 size={16} aria-hidden="true" /> Presença confirmada</span>}
            <div className="events-actions"><button type="button" className={`button ${confirmed ? 'secondary' : 'primary'}`} disabled={busy} aria-label={`${confirmed ? 'Cancelar confirmação' : 'Confirmar presença'} em ${event.title}`} onClick={() => void changeConfirmation(event, !confirmed)}>{confirmingId === event.id && <LoaderCircle size={16} className="spin" />}{confirmingId === event.id ? 'Salvando…' : confirmed ? 'Cancelar confirmação' : 'Confirmar presença'}</button>
              {canManage && <button type="button" className="button secondary event-attendance-count" aria-label={`Ver quem confirmou em ${event.title}: ${attendees.length} ${attendees.length === 1 ? 'confirmação' : 'confirmações'}`} onClick={() => setAttendeesEventId(event.id)}><Users size={16} aria-hidden="true" /><span><strong>{attendees.length} {attendees.length === 1 ? 'confirmação' : 'confirmações'}</strong><small>Ver quem confirmou</small></span></button>}
            </div>
            {confirmationError?.eventId === event.id && <p className="alert error" role="alert">{confirmationError.message}</p>}
          </div>
        </div>
        {canManage && <div className="event-controls"><button type="button" className="icon-button" aria-label={`Editar evento ${event.title}`} title="Editar evento" onClick={() => { setNotice(''); setEditor(event); }}><Pencil size={17} /></button><button type="button" className="icon-button" aria-label={`Excluir evento ${event.title}`} title="Excluir evento" onClick={() => { setNotice(''); setDeleteError(''); setRemoving(event); }}><Trash2 size={17} /></button></div>}
      </li>; })}</ol> : <div className="events-empty"><CalendarDays size={30} aria-hidden="true" /><h3>{canManage ? 'Nenhum próximo evento cadastrado.' : 'Nenhum próximo evento neste mês.'}</h3><p>{canManage ? 'Cadastre um evento para organizar os próximos encontros da casa.' : 'Os eventos aparecem aqui no mês em que vão acontecer.'}</p></div>}
    </div>
    {canManage && editor && <Modal title={editor === 'new' ? 'Cadastrar evento' : 'Editar evento'} onClose={closeEditor}><EventForm initial={editor === 'new' ? undefined : editor} onBusy={value => { writing.current = value; revision.current++; setBusy(value); }} houseId={houseId} onSave={event => { setEvents(current => [...current.filter(item => item.id !== event.id), event]); setLoaded(true); setEditor(null); setNotice('Evento salvo. Ele aparece para os médiuns somente no mês em que acontece.'); setRefresh(value => value + 1); }} /></Modal>}
    {canManage && removing && <Modal title="Excluir evento" onClose={() => { if (!writing.current) setRemoving(null); }}><p>Excluir o evento <strong>{removing.title}</strong>, de {formatDate(removing.occurs_on)}? Ele será retirado da agenda da casa.</p>{deleteError && <p className="alert error" role="alert">{deleteError}</p>}<div className="events-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setRemoving(null)}>Cancelar</button><button type="button" className="button primary" disabled={busy} onClick={() => void confirmDelete()}>{busy ? <LoaderCircle size={17} className="spin" /> : <Trash2 size={17} />} Excluir evento</button></div></Modal>}
    {canManage && attendeesEvent && <Modal title="Quem confirmou presença" onClose={() => setAttendeesEventId(null)}><p><strong>{attendeesEvent.title}</strong> · {formatDate(attendeesEvent.occurs_on)}</p><EventAttendees eventId={attendeesEvent.id} /></Modal>}
  </section>;
}

function EventAttendees({ eventId }: { eventId: string }) {
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => startMemberUpdates({
    read: () => loadEventAttendees(eventId),
    onData(data) { setAttendees(data); setLoaded(true); setError(''); },
    onError() { setAttendees([]); setLoaded(false); setError('Não foi possível consultar os nomes. Confira sua conexão e seu acesso de administrador e tente novamente.'); },
  }), [eventId, refresh]);
  return <div className="event-attendees">
    <div className="event-attendees-heading"><strong>{loaded ? `${attendees.length} ${attendees.length === 1 ? 'presença confirmada' : 'presenças confirmadas'}` : 'Confirmações de presença'}</strong><button type="button" className="icon-button" aria-label="Atualizar lista de presenças" title="Atualizar lista de presenças" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={17} /></button></div>
    {error && <p className="alert error" role="alert">{error}</p>}
    {!loaded ? !error && <p role="status">Carregando confirmações…</p> : attendees.length ? <ul className="event-attendees-list">{attendees.map(person => <li key={person.user_id}><strong>{person.full_name}</strong><small>Login: {person.username}</small></li>)}</ul> : <p>Ninguém confirmou presença ainda.</p>}
  </div>;
}

function EventForm({ houseId, initial, onSave, onBusy }: { houseId: string; initial?: HouseEvent; onSave: (event: HouseEvent) => void; onBusy: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const writing = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (writing.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = eventInputSchema.safeParse({ ...values, starts_at: values.starts_at || null });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    writing.current = true; setBusy(true); onBusy(true); setError('');
    try { onSave(await saveEvent(houseId, parsed.data, initial?.id)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar o evento.'); }
    finally { writing.current = false; setBusy(false); onBusy(false); }
  }
  return <form className="form" onSubmit={submit}>
    <p className="form-intro">A administração pode cadastrar com antecedência. Os médiuns veem somente os próximos eventos do mês atual. Datas e horários seguem o horário de Brasília.</p>
    <fieldset className="event-fields" disabled={busy}><label>Nome do evento<input name="title" required minLength={3} maxLength={120} defaultValue={initial?.title} placeholder="Ex.: Gira de caboclos" autoFocus /></label>
      <div className="form-grid"><label>Data<input name="occurs_on" type="date" required min={eventCalendar().today} max="9999-12-31" defaultValue={initial?.occurs_on} /></label><label>Horário (opcional)<input name="starts_at" type="time" step="60" defaultValue={initial?.starts_at ?? ''} /></label></div>
      <label>Local (opcional)<input name="location" maxLength={200} defaultValue={initial?.location} placeholder="Ex.: Salão principal do terreiro" /></label>
      <label>Descrição (opcional)<textarea name="description" rows={4} maxLength={2000} defaultValue={initial?.description} placeholder="Informações para as pessoas da casa" /></label>
    </fieldset>
    {error && <p className="alert error" role="alert">{error}</p>}
    <button className="button primary" type="submit" disabled={busy}>{busy && <LoaderCircle size={17} className="spin" />}{busy ? 'Salvando…' : 'Salvar evento'}</button>
  </form>;
}
