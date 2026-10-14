import { mediumSchema, type MediumInput } from './data';

type Sex = MediumInput['sex'];
export type BirthNumerology = { sum: number; expression: string; orixas: string[] | null; note: string | null };

type HeadOrixasRow = { label: string; min: number; max: number; exceptions: number[]; masculino: string[]; feminino: string[]; footnote?: string };

export const headOrixasTable: HeadOrixasRow[] = [
  { label: 'De 1 a 20 (com exceção do 14 e 17)', min: 1, max: 20, exceptions: [14, 17], masculino: ['Oxalá'], feminino: ['Yemanjá'] },
  { label: '14 ou 17', min: 14, max: 17, exceptions: [15, 16], masculino: ['Ogum'], feminino: ['Iansã'] },
  { label: 'De 21 a 29 (com exceção do 26 e 28)', min: 21, max: 29, exceptions: [26, 28], masculino: ['Ogum'], feminino: ['Yemanjá'] },
  { label: '26', min: 26, max: 26, exceptions: [], masculino: ['Oxóssi (Odé)'], feminino: ['Iansã'], footnote: '*' },
  { label: '28', min: 28, max: 28, exceptions: [], masculino: ['Oxóssi', 'Iansã', 'Yemanjá'], feminino: ['Iansã', 'Yemanjá', 'Oxóssi'], footnote: '**' },
  { label: 'De 30 a 33', min: 30, max: 33, exceptions: [], masculino: ['Xangô'], feminino: ['Oxum'] },
  { label: '34 ou mais', min: 34, max: Infinity, exceptions: [], masculino: ['Oxalá'], feminino: ['Iansã'] },
];

export const female28Note = 'Conforme a tabela, para mulheres com soma 28, o Orixá maior é Iansã quando não há filhos ou há até 2 filhos; com 3 ou mais filhos, é Yemanjá.';

export function headOrixas(sum: number, sex: Sex): string[] {
  if (!Number.isInteger(sum) || sum < 1) throw new Error('Informe uma soma válida.');
  const row = headOrixasTable.find(row => sum >= row.min && sum <= row.max && !row.exceptions.includes(sum))!;
  return [...row[sex]];
}

export function birthNumerology(birthDate: string | null, sex: Sex | '' | null): BirthNumerology | null {
  const date = mediumSchema.shape.birth_date.safeParse(birthDate);
  if (!date.success) return null;
  const [year, month, day] = date.data.split('-');
  const digits = (day + month + year).split('').map(Number);
  const sum = digits.reduce((total, digit) => total + digit, 0);
  return {
    sum,
    expression: `${digits.join(' + ')} = ${sum}`,
    orixas: sex ? headOrixas(sum, sex) : null,
    note: sum === 28 && sex ? sex === 'feminino'
      ? female28Note
      : 'Para a soma 28, a tabela aponta estes três Orixás.' : null,
  };
}
