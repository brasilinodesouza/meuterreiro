import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuesJson, previewDuesImport } from '../src/lib/dues-import';
import { readDuesFile } from '../src/lib/read-dues-file';
import type { Medium } from '../src/lib/data';
import { mediumFixture } from './fixtures';

function backup(dataPag: unknown = '', status = 'pago') {
  return {
    config: { saldoInicial: 3402.52 },
    membros: [{ id: 'member-1', nome: 'Pessoa de Teste', valor: 125.50, mes: '2026-06', dataPag: '', status: 'pago' }],
    pagamentos: [{ membroId: 'member-1', mes: '2026-11', dataPag, status }],
    fixos: [{ valor: 900 }],
  };
}

test('JSON usa o histórico pagamentos e trata data vazia como pendente mesmo com status pago', () => {
  for (const dataPag of ['', '   ', null, undefined]) {
    const data = backup();
    data.pagamentos[0].dataPag = dataPag;
    const rows = parseDuesJson(JSON.stringify(data));
    assert.deepEqual(rows, [{ name: 'Pessoa de Teste', reference: '2026-11-01', due_on: '2026-11-10', amount_cents: 12550, status: 'pendente', paid_on: null }]);
  }
});

test('JSON preserva a data real e o mês de referência, sem usar a data do cadastro do membro', () => {
  const data = backup(' 2026-10-31 ');
  data.membros[0].dataPag = '2026-06-15';
  const [row] = parseDuesJson('\uFEFF' + JSON.stringify(data));
  assert.equal(row.status, 'pago');
  assert.equal(row.paid_on, '2026-10-31');
  assert.equal(row.reference, '2026-11-01');
});

test('JSON relaciona meses de cada membro pelo identificador, sem confundir a ordem dos cadastros', () => {
  const data = backup();
  data.membros.unshift({ ...data.membros[0], id: 'member-2', nome: 'Outra Pessoa', valor: 50 });
  data.pagamentos.push({ membroId: 'member-2', mes: '2026-12', dataPag: '2026-11-09', status: 'pago' });
  assert.deepEqual(parseDuesJson(JSON.stringify(data)).map(row => [row.name, row.amount_cents, row.status]), [
    ['Pessoa de Teste', 12550, 'pendente'], ['Outra Pessoa', 5000, 'pago'],
  ]);
});

test('JSON inválido, datas impossíveis, valores inválidos e vínculos ausentes bloqueiam o lote', () => {
  assert.throws(() => parseDuesJson('{'), /JSON/);
  for (const data of [null, {}, { membros: [], pagamentos: [] }, { ...backup(), pagamentos: [] }, { ...backup(), membros: [] }]) {
    assert.throws(() => parseDuesJson(JSON.stringify(data)), /Confira o JSON/);
  }
  for (const dataPag of ['2026-02-30', '09/11/2026', '2026-11-09T12:00:00Z', 123]) {
    assert.throws(() => parseDuesJson(JSON.stringify(backup(dataPag))));
  }
  for (const mes of ['2026-13', '2026-00', '2026-1', 'não é um mês']) {
    const data = backup(); data.pagamentos[0].mes = mes;
    assert.throws(() => parseDuesJson(JSON.stringify(data)));
  }
  for (const valor of [0, -100, 1.001, 10000000.01]) {
    const data = backup(); data.membros[0].valor = valor;
    assert.throws(() => parseDuesJson(JSON.stringify(data)), /Confira o JSON/);
  }
  const orphan = backup(); orphan.pagamentos[0].membroId = 'absent';
  assert.throws(() => parseDuesJson(JSON.stringify(orphan)), /não corresponde/);
  const repeated = backup(); repeated.membros.push({ ...repeated.membros[0] });
  assert.throws(() => parseDuesJson(JSON.stringify(repeated)), /mesmo identificador/);
  const oversized = backup(); oversized.pagamentos = Array.from({ length: 2001 }, () => oversized.pagamentos[0]);
  assert.throws(() => parseDuesJson(JSON.stringify(oversized)), /2.000/);
});

test('prévia mantém proteção contra duplicações e divergências para mensalidades do JSON', () => {
  const rows = parseDuesJson(JSON.stringify(backup()));
  const mediums: Medium[] = [{ ...mediumFixture, id: 'medium-1', name: 'Pessoa de Teste', status: 'ativo', terreiro_id: 'house', created_at: '2026-11-09T00:00:00Z' }];
  const due = { ...rows[0], id: 'due-1', medium_id: 'medium-1', terreiro_id: 'house', created_at: '2026-11-09T00:00:00Z', payment_method: null };
  assert.equal(previewDuesImport(rows, mediums, [due])[0].state, 'existing');
  assert.equal(previewDuesImport(rows, mediums, [{ ...due, status: 'pago', paid_on: '2026-11-09' }])[0].state, 'error');
  assert.equal(previewDuesImport([...rows, ...rows], mediums, [])[1].state, 'error');
});

test('seletor aceita JSON e rejeita arquivos fora do formato ou acima de 10 MB', async () => {
  assert.equal((await readDuesFile(new File([JSON.stringify(backup())], 'backup.JSON', { type: 'application/json' })))[0].status, 'pendente');
  await assert.rejects(readDuesFile(new File(['{}'], 'backup.txt')), /PDF.*JSON/);
  await assert.rejects(readDuesFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'backup.json')), /10 MB/);
});
