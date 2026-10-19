import { z } from 'zod';

export const calendarDateSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome da comemoração.').max(80, 'Use até 80 caracteres.'),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
}).refine(value => value.day <= new Date(Date.UTC(2000, value.month, 0)).getUTCDate(), {
  message: 'Informe um dia válido para o mês.', path: ['day'],
});
export const calendarEntrySchema = calendarDateSchema.safeExtend({ id: z.uuid(), terreiro_id: z.uuid() });
export type CalendarDateInput = z.infer<typeof calendarDateSchema>;
export type CalendarEntry = z.infer<typeof calendarEntrySchema>;
export const calendarMonths = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, month, 1))));

export function calendarToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}
export function isOrixaDay(entry: CalendarDateInput, day: string) {
  return Number(day.slice(5, 7)) === entry.month && Number(day.slice(8, 10)) === entry.day;
}
