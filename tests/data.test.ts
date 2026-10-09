import test from 'node:test';
import assert from 'node:assert/strict';
import { houseSchema, mediumSchema, demoHouse, demoMediums, formatDate } from '../src/lib/data';
test('cadastro aceita uma casa brasileira e remove espaços externos', () => {
  assert.equal(houseSchema.parse({ ...demoHouse, name: '  Nossa casa  ' }).name, 'Nossa casa');
  assert.equal(houseSchema.safeParse({ ...demoHouse, state: 'XX' }).success, false);
  assert.equal(houseSchema.safeParse({ ...demoHouse, name: '   ' }).success, false);
});
test('contatos opcionais e data válida, telefone com DDD e situação definida', () => {
  const base = demoMediums[0];
  assert.equal(mediumSchema.safeParse(base).success, true);
  assert.equal(mediumSchema.safeParse({ ...base, phone: '(11) 99999-8888' }).success, true);
  assert.equal(mediumSchema.safeParse({ ...base, phone: '123' }).success, false);
  assert.equal(mediumSchema.safeParse({ ...base, email: 'invalido' }).success, false);
  assert.equal(mediumSchema.safeParse({ ...base, joined_on: '2026-02-30' }).success, false);
  assert.equal(mediumSchema.safeParse({ ...base, status: 'inventado' }).success, false);
  assert.equal(mediumSchema.safeParse({ ...base, notes: 'a'.repeat(2001) }).success, false);
});
test('data de entrada preserva o dia sem deslocamento de fuso', () => {
  assert.equal(formatDate('2026-01-01'), '01/01/2026');
});
