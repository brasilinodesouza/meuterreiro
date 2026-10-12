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
