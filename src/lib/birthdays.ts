import type { Medium } from './data';
import { today } from './finance';

export function isBirthday(birthDate: string | null, day = today()) {
  if (!birthDate) return false;
  const birthday = birthDate.slice(5);
  if (birthday === day.slice(5)) return true;
  const year = Number(day.slice(0,4));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return birthday === '02-29' && day.slice(5) === '02-28' && !leap;
}
export function birthdaysToday(mediums: Medium[], day = today()) {
  return mediums.filter(m => m.status !== 'desligado' && isBirthday(m.birth_date,day));
}
