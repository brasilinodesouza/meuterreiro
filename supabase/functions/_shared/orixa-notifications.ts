import type { BirthdayPayload } from './birthday-notifications.ts';

export function orixaPayload(names: string[], day: string): BirthdayPayload {
  const summary = names.slice(0, 3).map(name => name.slice(0, 80)).join(', ');
  return {
    title: 'Calendário ✨',
    body: `Hoje celebramos ${summary}${names.length > 3 ? ` e mais ${names.length - 3} comemorações` : ''}! Um dia de fé, respeito e gratidão.`,
    url: '/?calendario=hoje', tag: `orixas-${day}`,
  };
}
