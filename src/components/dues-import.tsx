'use client';
import { useRef, useState, type ChangeEvent } from 'react';
import { formatDate, type Medium } from '@/lib/data';
import { money, type Due } from '@/lib/finance';
import { previewDuesImport, type ImportedDue, type ImportResult } from '@/lib/dues-import';
import { readDuesPdf } from '@/lib/read-dues-pdf';

export function DuesImport({ mediums, dues, onSave, onBusy }: { mediums: Medium[]; dues: Due[]; onSave: (rows: ImportedDue[]) => Promise<ImportResult>; onBusy: (busy: boolean) => void }) {
  const [rows, setRows] = useState<ImportedDue[]>([]);
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const operation = useRef(false);
  const preview = rows.length ? previewDuesImport(rows, mediums, dues) : [];
  const ready = preview.filter(item => item.state === 'new');
  const blocked = preview.filter(item => item.state === 'error');
  const existing = preview.filter(item => item.state === 'existing');
  function setWorking(value: boolean) { operation.current = value; setBusy(value); onBusy(value); }
  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file || operation.current) return;
    setRows([]); setResult(null); setError(''); setFilename(file.name); setWorking(true);
    try { setRows(await readDuesPdf(file)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível ler este PDF.'); }
    finally { setWorking(false); }
  }
  async function save() {
    if (operation.current || blocked.length || !ready.length || result) return;
    setError(''); setWorking(true);
    try { setResult(await onSave(rows)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível importar.'); }
    finally { setWorking(false); }
  }
  return <div className="dues-import">
    <p>Selecione o relatório de mensalidades em PDF. Os nomes serão vinculados aos médiuns cadastrados na sua casa.</p>
    <label className="import-file">Relatório de mensalidades<input aria-label="Relatório de mensalidades em PDF" type="file" accept=".pdf,application/pdf" disabled={busy} onChange={selectFile} /></label>
    {busy && <p role="status">Aguarde, processando o relatório…</p>}
    {error && <p className="alert error" role="alert">{error}</p>}
    {result ? <p className="alert success" role="status">Importação concluída: {result.imported} mensalidades importadas, {result.payments} pagamentos registrados no caixa e {result.skipped} registros já existentes preservados.</p> : preview.length > 0 && <>
      <p><strong>{filename}</strong><br />{rows.length} mensalidades · {ready.length} novas · {existing.length} já cadastradas · {blocked.length} com pendências</p>
      <p>Vencimento no dia 10 de cada mês. Valores, situações e datas de pagamento serão preservados. Os pagamentos importados entram no caixa nas datas do relatório.</p>
      {blocked.length > 0 && <p className="alert error" role="alert">Confira os nomes e as divergências abaixo antes de importar. Nenhum registro será salvo enquanto houver pendências.</p>}
      <div className="table-scroll import-preview"><table><thead><tr><th>Nome no PDF</th><th>Cadastro vinculado</th><th>Mês</th><th>Valor</th><th>Situação</th><th>Pagamento</th><th>Conferência</th></tr></thead><tbody>{preview.map((item,index) => <tr key={index}><td className="finance-description">{item.row.name}</td><td className="finance-description">{item.medium?.name ?? '—'}</td><td>{item.row.reference.slice(0,7).split('-').reverse().join('/')}</td><td>{money(item.row.amount_cents)}</td><td>{item.row.status === 'pago' ? 'Paga' : 'Pendente'}</td><td>{item.row.paid_on ? formatDate(item.row.paid_on) : '—'}</td><td className="finance-description">{item.message}</td></tr>)}</tbody></table></div>
      <button className="button primary" type="button" disabled={busy || blocked.length > 0 || !ready.length} onClick={save}>Importar {ready.length} mensalidades</button>
    </>}
  </div>;
}
