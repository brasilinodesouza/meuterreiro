import { z } from 'zod';
export const houseSchema = z.object({
  name: z.string().trim().min(3, 'Informe um nome com pelo menos 3 letras.').max(120),
  city: z.string().trim().min(2, 'Informe a cidade.').max(80),
  state: z.string().regex(/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/, 'Selecione o estado.'),
});
export const mediumSchema = z.object({
  name: z.string().trim().min(3, 'Informe um nome com pelo menos 3 letras.').max(120),
  phone: z.string().trim().max(25).refine(v => !v || /^(?:\+55)?\d{10,11}$/.test(v.replace(/[\s().-]/g, '')), 'Informe um telefone com DDD.'),
  email: z.union([z.literal(''), z.email('Confira o e-mail informado.')]),
  role: z.string().trim().min(2, 'Informe a função na casa.').max(80),
  status: z.enum(['ativo', 'afastado', 'desligado']),
  joined_on: z.iso.date('Informe uma data válida.'),
  notes: z.string().trim().max(2000, 'As observações devem ter até 2.000 caracteres.'),
});
export type HouseInput = z.infer<typeof houseSchema>;
export type House = HouseInput & { id: string; owner_id: string; created_at: string };
export type MediumInput = z.infer<typeof mediumSchema>;
export type Medium = MediumInput & { id: string; terreiro_id: string; created_at: string };
export const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export const statusLabels = { ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' };
export function formatDate(value: string) { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z')); }
