import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppUpdater, type AppUpdateState } from '../src/lib/app-updates';

test('nova publicação recarrega uma única vez; mesma versão não recarrega', async () => {
  let latest = 'v1';
  let reloads = 0;
  const updater = createAppUpdater({version: 'v1', readVersion: async () => latest, canReload: () => true, reload: () => { reloads++; }});
  await updater.check();
  assert.equal(reloads, 0);
  latest = 'v2';
  await updater.check();
  await updater.check();
  updater.apply();
  assert.equal(reloads, 1);
});

test('aguarda o formulário terminar e depois aplica a publicação pendente', async () => {
  let busy = true;
  let reloads = 0;
  const updater = createAppUpdater({version: 'v1', readVersion: async () => 'v2', canReload: () => !busy, reload: () => { reloads++; }});
  await updater.check();
  updater.apply();
  assert.equal(reloads, 0);
  busy = false;
  await updater.check();
  assert.equal(reloads, 1);
});

test('rede indisponível e respostas inválidas mantêm o app, com nova tentativa depois', async () => {
  let latest: string | null = null;
  let offline = true;
  let reloads = 0;
  const updater = createAppUpdater({version: 'v1', readVersion: async () => { if (offline) throw new Error('offline'); return latest; }, canReload: () => true, reload: () => { reloads++; }});
  await updater.check();
  offline = false;
  await updater.check();
  latest = ' ';
  await updater.check();
  assert.equal(reloads, 0);
  latest = 'v2';
  await updater.check();
  assert.equal(reloads, 1);
});

test('interromper durante a consulta impede recarga e consultas concorrentes não duplicam o pedido', async () => {
  let finish!: (version: string) => void;
  let requests = 0;
  let reloads = 0;
  const updater = createAppUpdater({version: 'v1', readVersion: () => { requests++; return new Promise(resolve => { finish = resolve; }); }, canReload: () => true, reload: () => { reloads++; }});
  const checking = updater.check();
  await updater.check();
  assert.equal(requests, 1);
  updater.stop();
  finish('v2');
  await checking;
  await updater.check();
  assert.equal(reloads, 0);
  assert.equal(requests, 1);
});

test('publicação revertida antes de concluir o formulário cancela a recarga pendente', async () => {
  let latest = 'v2';
  let busy = true;
  let reloads = 0;
  const updater = createAppUpdater({version: 'v1', readVersion: async () => latest, canReload: () => !busy, reload: () => { reloads++; }});
  await updater.check();
  latest = 'v1';
  busy = false;
  await updater.check();
  updater.apply();
  assert.equal(reloads, 0);
});

test('informa quando a recarga aguarda o formulário e quando a consulta falha', async () => {
  const states: AppUpdateState[] = [];
  let latest: string | null = 'v2';
  const updater = createAppUpdater({version: 'v1', readVersion: async () => latest, canReload: () => false, reload: () => assert.fail('Não deve apagar o formulário'), onState: state => states.push(state)});
  await updater.check();
  assert.deepEqual(states, ['checking', 'pending']);
  latest = null;
  await updater.check();
  assert.deepEqual(states.slice(-2), ['checking', 'error']);
  latest = 'v1';
  await updater.check();
  assert.deepEqual(states.slice(-2), ['checking', 'current']);
});

test('não atualiza estado da interface depois que o monitor foi removido', async () => {
  const states: AppUpdateState[] = [];
  let reject!: (error: Error) => void;
  const updater = createAppUpdater({version: 'v1', readVersion: () => new Promise((_resolve, fail) => { reject = fail; }), canReload: () => true, reload: () => assert.fail('Monitor removido'), onState: state => states.push(state)});
  const checking = updater.check();
  updater.stop();
  reject(new Error('network'));
  await checking;
  assert.deepEqual(states, ['checking']);
});
