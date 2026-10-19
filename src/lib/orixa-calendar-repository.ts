import { z } from 'zod';
import { supabase } from './supabase';
import { calendarDateSchema, calendarEntrySchema, type CalendarDateInput } from './orixa-calendar';

function calendarError(code: string) {
  if (code === '42501') return new Error('Somente administradores e responsáveis podem cadastrar, editar ou excluir datas. Atualize a página para conferir seu acesso.');
  if (code === '23505') return new Error('Este orixá já está cadastrado nesta data.');
  if (code === '42P01' || code === 'PGRST205') return new Error('O calendário ainda precisa ser habilitado no banco.');
  if (code === 'PGRST116') return new Error('A data não está mais disponível ou seu acesso mudou. Atualize o calendário.');
  return new Error('Não foi possível concluir. Confira a conexão e tente novamente.');
}
export async function loadCalendar(houseId: string) {
  if (!supabase) throw new Error('Banco não conectado.');
  const entries = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('orixa_calendar').select('id,terreiro_id,name,month,day').eq('terreiro_id', houseId)
      .order('month').order('day').order('name').order('id').range(from, from + 999);
    if (error) throw calendarError(error.code);
    const page = z.array(calendarEntrySchema).parse(data);
    entries.push(...page);
    if (page.length < 1000) return entries;
  }
}
export async function saveCalendarDate(houseId: string, input: CalendarDateInput, id?: string) {
  if (!supabase) throw new Error('Banco não conectado.');
  const values = calendarDateSchema.parse(input);
  const query = id ? supabase.from('orixa_calendar').update(values).eq('terreiro_id', houseId).eq('id', id)
    : supabase.from('orixa_calendar').insert({ ...values, terreiro_id: houseId });
  const { data, error } = await query.select('id,terreiro_id,name,month,day').single();
  if (error) throw calendarError(error.code);
  return calendarEntrySchema.parse(data);
}
export async function deleteCalendarDate(houseId: string, id: string) {
  if (!supabase) throw new Error('Banco não conectado.');
  const { error } = await supabase.from('orixa_calendar').delete().eq('terreiro_id', houseId).eq('id', id).select('id').single();
  if (error) throw calendarError(error.code);
}
