import type { BirthdayPayload } from './birthday-notifications.ts';

export function eventPayload(events: string[], day: string): BirthdayPayload {
  const summary = events.slice(0, 3).map(event => event.slice(0, 180)).join('; ');
  const remaining = events.length - 3;
  return {
    title: events.length === 1 ? 'Evento de hoje 📅' : 'Eventos de hoje 📅',
    body: `Hoje: ${summary}${remaining > 0 ? ` e mais ${remaining} ${remaining === 1 ? 'evento' : 'eventos'}` : ''}. Confira a agenda da casa.`,
    url: '/?eventos=hoje', tag: `eventos-${day}`,
  };
}
