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
