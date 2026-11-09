import { z } from 'zod';
import type { Medium } from './data';
import { parseMoney, type Due } from './finance';

const months = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export const importedDueSchema = z.object({
  name: z.string().trim().min(3).max(120),
  reference: z.iso.date().regex(/^\d{4}-\d{2}-01$/),
  due_on: z.iso.date(),
  amount_cents: z.number().int().min(1).max(1000000000),
  status: z.enum(['pago','pendente']),
  paid_on: z.iso.date().nullable(),
}).refine(row => (row.status === 'pago') === (row.paid_on !== null), 'Confira a situação e a data de pagamento.');
export const importedDuesSchema = z.array(importedDueSchema).min(1).max(2000);
export type ImportedDue = z.infer<typeof importedDueSchema>;
export type ImportResult = { imported: number; skipped: number; payments: number };
export function normalizeMediumName(name: string) { return name.trim().replace(/\s+/g, ' ').toLowerCase(); }

const duesBackupSchema = z.object({
  membros: z.array(z.object({
    id: z.string().trim().min(1),
    nome: z.string().trim().min(3).max(120),
    valor: z.number().positive().max(10000000).multipleOf(0.01),
  })).min(1).max(2000),
  pagamentos: z.array(z.object({
    membroId: z.string().trim().min(1),
    mes: z.string().regex(/^\d{4}-\d{2}$/),
    dataPag: z.string().trim().nullish(),
  })).min(1).max(2000),
});

export function parseDuesJson(text: string): ImportedDue[] {
  let data: unknown;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Não foi possível ler o JSON. Selecione um arquivo de backup válido.'); }
  const parsed = duesBackupSchema.safeParse(data);
  if (!parsed.success) throw new Error('Confira o JSON: são necessárias as listas membros (id, nome e valor em reais) e pagamentos (membroId, mes e dataPag). Limite de 2.000 mensalidades.');
  const members = new Map<string, (typeof parsed.data.membros)[number]>();
  for (const member of parsed.data.membros) {
    if (members.has(member.id)) throw new Error('O JSON contém cadastros com o mesmo identificador. Confira os membros antes de importar.');
    members.set(member.id, member);
  }
  const rows = parsed.data.pagamentos.map(payment => {
    const member = members.get(payment.membroId);
    if (!member) throw new Error('Uma mensalidade do JSON não corresponde a nenhum membro do arquivo. Nenhum dado foi importado.');
    const paidOn = payment.dataPag || null;
    const row = importedDueSchema.safeParse({
      name: member.nome,
      reference: `${payment.mes}-01`,
      due_on: `${payment.mes}-10`,
      amount_cents: Math.round(member.valor * 100),
      status: paidOn ? 'pago' : 'pendente',
      paid_on: paidOn,
    });
    if (!row.success) throw new Error(`Confira o mês, valor e a data de pagamento de ${member.nome} (${payment.mes}). Nenhum dado foi importado.`);
    return row.data;
  });
  return importedDuesSchema.parse(rows);
}

export function parseDuesReport(lines: string[], dueDay = 10): ImportedDue[] {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new Error('Informe um vencimento entre os dias 1 e 28.');
  if (!lines.some(line => line.trim() === 'Relatório de Mensalidades')) throw new Error('Selecione o relatório de mensalidades com nome, valor, mês, data de pagamento e situação.');
  const rows: ImportedDue[] = [];
  for (const line of lines) {
    const clean = line.trim().replace(/\s+/g, ' ');
    if (!clean || clean.startsWith('Centro de ') || clean === 'Relatório de Mensalidades' || /^Nome Valor Mês Ref\. Data Pag\. Status$/.test(clean)) continue;
    const match = clean.match(/^(.+?)\s+R\$\s+([\d.,]+)\s+([\p{L}]+)\/(\d{4})\s+(\d{4}-\d{2}-\d{2}|[—–-])\s+(Pago|Pendente)$/u);
    if (!match) throw new Error(`Não foi possível ler uma linha do relatório: ${clean.slice(0, 120)}. Nenhum dado foi importado.`);
    const [, name, amount, month, year, paidOn, status] = match;
    const monthIndex = months.indexOf(month.toLowerCase());
    if (monthIndex < 0) throw new Error(`Mês não reconhecido: ${month}.`);
    const period = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    rows.push(importedDueSchema.parse({ name, reference: `${period}-01`, due_on: `${period}-${String(dueDay).padStart(2, '0')}`, amount_cents: parseMoney(amount), status: status === 'Pago' ? 'pago' : 'pendente', paid_on: /^[—–-]$/.test(paidOn) ? null : paidOn }));
  }
  return importedDuesSchema.parse(rows);
}

export type ImportPreviewRow = { row: ImportedDue; medium?: Medium; state: 'new' | 'existing' | 'error'; message: string };
export function previewDuesImport(rows: ImportedDue[], mediums: Medium[], dues: Due[]): ImportPreviewRow[] {
  const seen = new Set<string>();
  return importedDuesSchema.parse(rows).map(row => {
    const name = normalizeMediumName(row.name);
    const key = `${name}|${row.reference}`;
    if (seen.has(key)) return { row, state: 'error', message: 'Nome e mês repetidos no arquivo.' };
    seen.add(key);
    const matches = mediums.filter(m => normalizeMediumName(m.name) === name);
    if (matches.length !== 1) return { row, state: 'error', message: matches.length ? 'Mais de um cadastro com este nome.' : 'Nome não encontrado no cadastro.' };
    const medium = matches[0];
    const existing = dues.find(d => d.medium_id === medium.id && d.reference === row.reference);
    if (!existing) return { row, medium, state: 'new', message: 'Pronta para importar' };
    if (existing.amount_cents === row.amount_cents && existing.status === row.status && existing.paid_on === row.paid_on) return { row, medium, state: 'existing', message: 'Já cadastrada; será preservada' };
    return { row, medium, state: 'error', message: 'Já existe uma mensalidade com valor, situação ou pagamento diferente.' };
  });
}

export type PdfTextItem = { str: string; transform: number[] };
export function pdfItemsToLines(items: PdfTextItem[]): string[] {
  const lines: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const y = item.transform[5];
    let line = lines.find(line => Math.abs(line.y - y) < 2);
    if (!line) { line = { y, items: [] }; lines.push(line); }
    line.items.push(item);
  }
  return lines.sort((a,b) => b.y - a.y).map(line => line.items.sort((a,b) => a.transform[4] - b.transform[4]).map(item => item.str).join(' '));
}
