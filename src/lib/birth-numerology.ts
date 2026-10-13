import { mediumSchema, type MediumInput } from './data';

type Sex = MediumInput['sex'];
export type BirthNumerology = { sum: number; expression: string; orixas: string[] | null; note: string | null };

export function headOrixas(sum: number, sex: Sex): string[] {
  if (!Number.isInteger(sum) || sum < 1) throw new Error('Informe uma soma válida.');
  if (sum === 28) return sex === 'masculino' ? ['Oxóssi', 'Iansã', 'Yemanjá'] : ['Iansã', 'Yemanjá', 'Oxóssi'];
  if (sum === 26) return sex === 'masculino' ? ['Oxóssi (Odé)'] : ['Iansã'];
  if ([7, 14, 17].includes(sum)) return sex === 'masculino' ? ['Ogum'] : ['Iansã'];
  if (sum === 8) return sex === 'masculino' ? ['Xangô'] : ['Oxum'];
  if (sum <= 20) return sex === 'masculino' ? ['Oxalá'] : ['Yemanjá'];
  if (sum <= 29) return sex === 'masculino' ? ['Ogum'] : ['Yemanjá'];
  if (sum <= 33) return sex === 'masculino' ? ['Xangô'] : ['Oxum'];
  return sex === 'masculino' ? ['Oxalá'] : ['Iansã'];
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
      ? 'Para a soma 28, a tabela aponta três Orixás. A definição do Orixá maior para mulheres depende também do número de filhos.'
      : 'Para a soma 28, a tabela aponta estes três Orixás.' : null,
  };
}
