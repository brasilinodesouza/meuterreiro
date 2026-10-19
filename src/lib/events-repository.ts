import { z } from 'zod';
import { supabase } from './supabase';
import { eventAttendeeSchema, eventCalendar, eventConfirmationSchema, eventInputSchema, eventSchema, type EventInput } from './events';

function eventError(code: string) {
  if (code === '42501') return new Error('Somente a administração da casa pode cadastrar ou alterar eventos. Atualize a página para conferir seu acesso.');
  if (code === '42P01' || code === 'PGRST205') return new Error('A lista de eventos ainda precisa ser habilitada no banco.');
  return new Error('Não foi possível concluir. Confira sua conexão e tente novamente.');
}

export async function loadEvents(houseId: string, canManage: boolean) {
  if (!supabase) throw new Error('Banco não conectado.');
  const { today, nextMonth } = eventCalendar();
  const events = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from('eventos').select('id,terreiro_id,title,occurs_on,starts_at,location,description,created_at')
      .eq('terreiro_id', houseId).gte('occurs_on', today)
      .order('occurs_on').order('starts_at', { nullsFirst: false }).order('id').range(from, from + pageSize - 1);
    if (!canManage) query = query.lt('occurs_on', nextMonth);
    const result = await query;
    if (result.error) throw eventError(result.error.code);
    const page = z.array(eventSchema).parse(result.data);
    events.push(...page);
    if (page.length < pageSize) return events;
  }
}

export async function saveEvent(houseId: string, input: EventInput, id?: string) {
  if (!supabase) throw new Error('Banco não conectado.');
  const values = eventInputSchema.parse(input);
  if (values.occurs_on < eventCalendar().today) throw new Error('Escolha hoje ou uma data futura para o evento.');
  const query = id
    ? supabase.from('eventos').update(values).eq('terreiro_id', houseId).eq('id', id)
    : supabase.from('eventos').insert({ ...values, terreiro_id: houseId });
  const result = await query.select().single();
  if (result.error?.code === 'PGRST116') throw new Error('O evento não está mais disponível ou seu acesso mudou. Atualize a lista.');
  if (result.error) throw eventError(result.error.code);
  return eventSchema.parse(result.data);
}

export async function deleteEvent(houseId: string, id: string) {
  if (!supabase) throw new Error('Banco não conectado.');
  const result = await supabase.from('eventos').delete().eq('terreiro_id', houseId).eq('id', id).select('id').single();
  if (result.error?.code === 'PGRST116') throw new Error('O evento não está mais disponível ou seu acesso mudou. Atualize a lista.');
  if (result.error) throw eventError(result.error.code);
}

export async function loadEventConfirmations(houseId: string, canManage: boolean) {
  if (!supabase) throw new Error('Banco não conectado.');
  const { today, nextMonth } = eventCalendar();
  const confirmations = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from('evento_presencas').select('event_id,user_id,eventos!inner(terreiro_id,occurs_on)')
      .eq('eventos.terreiro_id', houseId).gte('eventos.occurs_on', today)
      .order('event_id').order('user_id').range(from, from + pageSize - 1);
    if (!canManage) query = query.lt('eventos.occurs_on', nextMonth);
    const result = await query;
    if (result.error) throw new Error('Não foi possível consultar as confirmações de presença.');
    const page = z.array(eventConfirmationSchema).parse(result.data);
    confirmations.push(...page);
    if (page.length < pageSize) return confirmations;
  }
}

export async function setEventConfirmation(eventId: string, userId: string, confirmed: boolean) {
  if (!supabase) throw new Error('Banco não conectado.');
  const values = eventConfirmationSchema.parse({ event_id: eventId, user_id: userId });
  // A chave única e DO NOTHING tornam cliques repetidos e confirmações em dois aparelhos idempotentes.
  const result = confirmed
    ? await supabase.from('evento_presencas').upsert(values, { onConflict: 'event_id,user_id', ignoreDuplicates: true })
    : await supabase.from('evento_presencas').delete().eq('event_id', eventId).eq('user_id', userId);
  if (result.error?.code === '42501') throw new Error('Este evento não está disponível para confirmar presença. Atualize a lista.');
  if (result.error) throw new Error('Não foi possível alterar sua presença. Confira a conexão e tente novamente.');
}

export async function loadEventAttendees(eventId: string) {
  if (!supabase) throw new Error('Banco não conectado.');
  const attendees = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await supabase.rpc('event_list_attendees', { p_event: z.uuid().parse(eventId) }).range(from, from + pageSize - 1);
    if (result.error?.code === '42501') throw new Error('Somente a administração da casa pode consultar quem confirmou presença.');
    if (result.error) throw new Error('Não foi possível carregar quem confirmou presença. Tente novamente.');
    const page = z.array(eventAttendeeSchema).parse(result.data);
    attendees.push(...page);
    if (page.length < pageSize) return attendees;
  }
}
