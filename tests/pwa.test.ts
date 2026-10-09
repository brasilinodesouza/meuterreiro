import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { getInstallState, installBootstrap, requestInstall, subscribeInstallState } from '../src/lib/pwa';
import type { InstallPromptEvent } from '../src/lib/pwa';

function setup(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const target = new EventTarget() as EventTarget & { __meuterreiroInstall?: unknown };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  runInNewContext(installBootstrap, { window: target, Event });
  return target;
}

function offer(outcome: 'accepted' | 'dismissed', onPrompt: () => Promise<void> = async () => {}) {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as InstallPromptEvent;
  event.prompt = onPrompt;
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

test('oferta anterior à hidratação é preservada e abre a confirmação dentro do clique', async t => {
  const target = setup(t);
  let called = 0;
  const event = offer('accepted', async () => { called++; });
  target.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(getInstallState().prompt, event);
  const result = requestInstall();
  assert.equal(called, 1, 'prompt deve ser chamado antes de qualquer espera');
  assert.equal(requestInstall(), null, 'duplo clique não pode abrir outra confirmação');
  assert.equal(await result, 'accepted');
});

test('recusar instalação consome a oferta; uma nova oferta do navegador permite tentar novamente', async t => {
  const target = setup(t);
  target.dispatchEvent(offer('dismissed'));
  assert.equal(await requestInstall(), 'dismissed');
  assert.equal(getInstallState().installed, false);
  assert.equal(requestInstall(), null);
  target.dispatchEvent(offer('accepted'));
  assert.equal(await requestInstall(), 'accepted');
});

test('sem oferta nativa não simula instalação; appinstalled remove a oferta e avisa a interface', t => {
  const target = setup(t);
  assert.equal(requestInstall(), null);
  let updates = 0;
  const unsubscribe = subscribeInstallState(() => { updates++; });
  target.dispatchEvent(offer('accepted'));
  target.dispatchEvent(new Event('appinstalled'));
  assert.equal(getInstallState().installed, true);
  assert.equal(getInstallState().prompt, null);
  assert.equal(updates, 2);
  unsubscribe();
  target.dispatchEvent(offer('accepted'));
  assert.equal(updates, 2);
});

test('falha ao abrir a confirmação não reutiliza o evento nem marca instalação concluída', async t => {
  const target = setup(t);
  const error = new Error('browser refused');
  target.dispatchEvent(offer('accepted', () => { throw error; }));
  await assert.rejects(requestInstall()!, error);
  assert.equal(getInstallState().installed, false);
  assert.equal(requestInstall(), null);
});

test('bootstrap executado novamente não apaga a oferta nem registra ouvintes duplicados', t => {
  const target = setup(t);
  const event = offer('accepted');
  target.dispatchEvent(event);
  runInNewContext(installBootstrap, { window: target, Event });
  assert.equal(getInstallState().prompt, event);
  let updates = 0;
  const unsubscribe = subscribeInstallState(() => { updates++; });
  target.dispatchEvent(new Event('appinstalled'));
  assert.equal(updates, 1);
  unsubscribe();
});
