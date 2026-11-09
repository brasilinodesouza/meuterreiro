'use client';
import { useRef, useState, type ChangeEvent } from 'react';
import { formatDate, type Medium } from '@/lib/data';
import { money, type Due } from '@/lib/finance';
import { previewDuesImport, type ImportedDue, type ImportResult } from '@/lib/dues-import';
import { readDuesFile } from '@/lib/read-dues-file';

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
    try { setRows(await readDuesFile(file)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível ler este arquivo.'); }
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
    <p>Selecione o relatório de mensalidades em PDF ou o backup JSON. Os nomes serão vinculados aos médiuns cadastrados na sua casa.</p>
    <p>No JSON, data de pagamento vazia significa mensalidade pendente, mesmo que esteja marcada como paga. Somente mensalidades com data de pagamento geram entrada no caixa. Serão importadas apenas as mensalidades; saldos, gastos e outros dados do backup ficam de fora.</p>
    <label className="import-file">Arquivo de mensalidades (PDF ou JSON)<input aria-label="Arquivo de mensalidades em PDF ou JSON" type="file" accept=".pdf,.json,application/pdf,application/json" disabled={busy} onChange={selectFile} /></label>
    {busy && <p role="status">Aguarde, processando o relatório…</p>}
    {error && <p className="alert error" role="alert">{error}</p>}
    {result ? <p className="alert success" role="status">Importação concluída: {result.imported} mensalidades importadas, {result.payments} pagamentos registrados no caixa e {result.skipped} registros já existentes preservados.</p> : preview.length > 0 && <>
      <p><strong>{filename}</strong><br />{rows.length} mensalidades · {ready.length} novas · {existing.length} já cadastradas · {blocked.length} com pendências</p>
      <p>Vencimento no dia 10 de cada mês. No JSON, o valor é o informado no cadastro de cada membro, e a situação é definida pela data de pagamento. Os pagamentos importados entram no caixa nas datas do arquivo.</p>
      {blocked.length > 0 && <p className="alert error" role="alert">Confira os nomes e as divergências abaixo antes de importar. Nenhum registro será salvo enquanto houver pendências.</p>}
      <div className="table-scroll import-preview"><table><thead><tr><th>Nome no arquivo</th><th>Cadastro vinculado</th><th>Mês</th><th>Valor</th><th>Situação</th><th>Pagamento</th><th>Conferência</th></tr></thead><tbody>{preview.map((item,index) => <tr key={index}><td className="finance-description">{item.row.name}</td><td className="finance-description">{item.medium?.name ?? '—'}</td><td>{item.row.reference.slice(0,7).split('-').reverse().join('/')}</td><td>{money(item.row.amount_cents)}</td><td>{item.row.status === 'pago' ? 'Paga' : 'Pendente'}</td><td>{item.row.paid_on ? formatDate(item.row.paid_on) : '—'}</td><td className="finance-description">{item.message}</td></tr>)}</tbody></table></div>
      <button className="button primary" type="button" disabled={busy || blocked.length > 0 || !ready.length} onClick={save}>Importar {ready.length} mensalidades</button>
    </>}
  </div>;
}
