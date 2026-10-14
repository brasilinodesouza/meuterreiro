import test from 'node:test';
import assert from 'node:assert/strict';
import { birthNumerology, headOrixas } from '../src/lib/birth-numerology';

test('soma cada dígito da data sem reduzir a soma e reproduz o exemplo da imagem', () => {
  assert.deepEqual(birthNumerology('1940-05-13', 'masculino'), { sum: 23, expression: '1 + 3 + 0 + 5 + 1 + 9 + 4 + 0 = 23', orixas: ['Ogum'], note: null });
  assert.deepEqual(birthNumerology('1940-05-13', 'feminino')?.orixas, ['Yemanjá']);
  assert.equal(birthNumerology('2000-02-29', 'feminino')?.sum, 15);
  assert.equal(birthNumerology('1940-05-13', '')?.sum, 23);
  assert.equal(birthNumerology('1940-05-13', null)?.orixas, null);
  for (const invalid of [null, '', '13/05/1940', '2001-02-29', '2026-02-30', '9999-01-01']) assert.equal(birthNumerology(invalid, 'masculino'), null);
});

test('faixas, limites e exceções correspondem à tabela enviada', () => {
  const cases: [number, string[], string[]][] = [
    [1, ['Oxalá'], ['Yemanjá']], [6, ['Oxalá'], ['Yemanjá']], [7, ['Oxalá'], ['Yemanjá']], [8, ['Oxalá'], ['Yemanjá']],
    [13, ['Oxalá'], ['Yemanjá']], [15, ['Oxalá'], ['Yemanjá']], [16, ['Oxalá'], ['Yemanjá']], [18, ['Oxalá'], ['Yemanjá']],
    [14, ['Ogum'], ['Iansã']], [17, ['Ogum'], ['Iansã']], [20, ['Oxalá'], ['Yemanjá']],
    [21, ['Ogum'], ['Yemanjá']], [23, ['Ogum'], ['Yemanjá']], [26, ['Oxóssi (Odé)'], ['Iansã']],
    [28, ['Oxóssi', 'Iansã', 'Yemanjá'], ['Iansã', 'Yemanjá', 'Oxóssi']], [29, ['Ogum'], ['Yemanjá']],
    [30, ['Xangô'], ['Oxum']], [33, ['Xangô'], ['Oxum']], [34, ['Oxalá'], ['Iansã']], [40, ['Oxalá'], ['Iansã']],
  ];
  for (const [sum, male, female] of cases) {
    assert.deepEqual(headOrixas(sum, 'masculino'), male, `Masculino, soma ${sum}`);
    assert.deepEqual(headOrixas(sum, 'feminino'), female, `Feminino, soma ${sum}`);
  }
});

test('soma 28 mostra os três Orixás e mantém a observação para mulheres', () => {
  const male = birthNumerology('1980-05-14', 'masculino')!;
  const female = birthNumerology('1980-05-14', 'feminino')!;
  assert.equal(male.sum, 28);
  assert.equal(male.orixas?.length, 3);
  assert.equal(female.orixas?.length, 3);
  assert.match(female.note!, /até 2 filhos/);
  assert.match(female.note!, /3 ou mais filhos, é Yemanjá/);
  assert.notEqual(male.note, female.note);
});
