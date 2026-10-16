import type { Due } from './finance';
import type { Medium } from './data';

export function pendingDuesThrough(dues: Due[], day: string) {
  return dues.filter(due => due.status === 'pendente' && due.due_on <= day);
}

export function summarizeDebtors(dues: Due[], mediums: Medium[], day: string) {
  const names = new Map(mediums.map(medium => [medium.id, medium.name]));
  const people = new Map<string, { medium_id: string; name: string; due_count: number; amount_cents: number }>();
  for (const due of pendingDuesThrough(dues, day)) {
    const person = people.get(due.medium_id) ?? { medium_id: due.medium_id, name: names.get(due.medium_id) ?? 'Médium da casa', due_count: 0, amount_cents: 0 };
    person.due_count++;
    person.amount_cents += due.amount_cents;
    people.set(due.medium_id, person);
  }
  return [...people.values()].sort((a,b) => a.name.localeCompare(b.name, 'pt-BR') || a.medium_id.localeCompare(b.medium_id));
}
