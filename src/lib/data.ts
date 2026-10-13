import { z } from 'zod';
export const houseSchema = z.object({
  name: z.string().trim().min(3, 'Informe um nome com pelo menos 3 letras.').max(120),
  city: z.string().trim().min(2, 'Informe a cidade.').max(80),
  state: z.string().regex(/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/, 'Selecione o estado.'),
});
export const mediumSchema = z.object({
  name: z.string().trim().min(3, 'Informe um nome com pelo menos 3 letras.').max(120),
  birth_date: z.iso.date('Informe uma data de nascimento válida.')
    .refine(value => value >= '0001-01-01', 'Informe uma data de nascimento válida.')
    .refine(value => value <= new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), 'A data de nascimento não pode estar no futuro.'),
  phone: z.string().trim().min(1, 'Informe o telefone.').max(25).refine(v => /^(?:\+55)?\d{10,11}$/.test(v.replace(/[\s().-]/g, '')), 'Informe um telefone com DDD.'),
  sex: z.enum(['masculino', 'feminino'], { error: 'Selecione masculino ou feminino.' }),
  status: z.enum(['ativo', 'afastado', 'desligado']),
  notes: z.string().trim().max(2000, 'As observações devem ter até 2.000 caracteres.'),
});
export type HouseInput = z.infer<typeof houseSchema>;
export type House = HouseInput & { id: string; owner_id: string; created_at: string };
export type MediumInput = z.infer<typeof mediumSchema>;
export type Medium = Omit<MediumInput, 'birth_date' | 'sex'> & { birth_date: string | null; sex: MediumInput['sex'] | null; id: string; terreiro_id: string; created_at: string };
export const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export const statusLabels = { ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' };
export const sexLabels = { masculino: 'Masculino', feminino: 'Feminino' };
export function formatDate(value: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z')); }
