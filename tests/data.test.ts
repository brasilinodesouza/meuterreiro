import test from 'node:test';
import assert from 'node:assert/strict';
import { houseSchema, mediumSchema, formatDate } from '../src/lib/data';
import { houseFixture, mediumFixture } from './fixtures';
test('cadastro aceita uma casa brasileira e remove espaços externos', () => {
  assert.equal(houseSchema.parse({ ...houseFixture, name: '  Nossa casa  ' }).name, 'Nossa casa');
  assert.equal(houseSchema.safeParse({ ...houseFixture, state: 'XX' }).success, false);
  assert.equal(houseSchema.safeParse({ ...houseFixture, name: '   ' }).success, false);
});
test('cadastro simplificado aceita telefone opcional com DDD e situação definida', () => {
  const base = mediumFixture;
  assert.equal(mediumSchema.safeParse(base).success, true);
  assert.equal(mediumSchema.safeParse({ ...base, phone: '(11) 99999-8888' }).success, true);
  assert.equal(mediumSchema.safeParse({ ...base, phone: '123' }).success, false);
  assert.deepEqual(mediumSchema.parse({ ...base, email: 'antigo', role: 'Médium', joined_on: '2026-01-01' }), base);
  assert.equal(mediumSchema.safeParse({ ...base, status: 'inventado' }).success, false);
  assert.equal(mediumSchema.safeParse({ ...base, notes: 'a'.repeat(2001) }).success, false);
});
test('datas do financeiro preservam o dia sem deslocamento de fuso', () => {
  assert.equal(formatDate('2026-01-01'), '01/01/2026');
});

test('nascimento é opcional, preserva o dia e recusa datas inválidas ou futuras', () => {
  assert.equal(mediumSchema.parse({ ...mediumFixture, birth_date: '' }).birth_date, null);
  assert.equal(mediumSchema.parse({ ...mediumFixture, birth_date: undefined }).birth_date, null);
  assert.equal(mediumSchema.parse({ ...mediumFixture, birth_date: '2000-02-29' }).birth_date, '2000-02-29');
  assert.equal(formatDate('2000-02-29'), '29/02/2000');
  for (const birth_date of ['2025-02-29', '2000-02-30', '31/12/2000', '0000-01-01', '9999-01-01']) {
    assert.equal(mediumSchema.safeParse({ ...mediumFixture, birth_date }).success, false);
  }
});
