import { z } from 'zod';

export const eventInputSchema = z.object({
  title: z.string().trim().min(3, 'Informe um nome com pelo menos 3 letras.').max(120, 'O nome deve ter até 120 caracteres.'),
  occurs_on: z.iso.date('Informe uma data válida.').refine(value => value >= '0001-01-01', 'Informe uma data válida.'),
  starts_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário válido.').nullable(),
  location: z.string().trim().max(200, 'O local deve ter até 200 caracteres.'),
  description: z.string().trim().max(2000, 'A descrição deve ter até 2.000 caracteres.'),
});

export type EventInput = z.infer<typeof eventInputSchema>;
export const eventSchema = eventInputSchema.extend({
  id: z.uuid(),
  terreiro_id: z.uuid(),
  // PostgreSQL devolve também os segundos para colunas time.
  starts_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d:00$/).transform(value => value.slice(0, 5)).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});
export type HouseEvent = z.infer<typeof eventSchema>;

export function eventCalendar(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  const [year, month] = today.split('-').map(Number);
  const nextMonth = `${String(month === 12 ? year + 1 : year).padStart(4, '0')}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`;
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(now);
  return { today, nextMonth, monthLabel };
}

export function upcomingEvents(events: HouseEvent[], canManage: boolean, now = new Date()) {
  const { today, nextMonth } = eventCalendar(now);
  return events.filter(event => event.occurs_on >= today && (canManage || event.occurs_on < nextMonth))
    .sort((a, b) => a.occurs_on.localeCompare(b.occurs_on) || (a.starts_at ?? '24:00').localeCompare(b.starts_at ?? '24:00') || a.id.localeCompare(b.id));
}
