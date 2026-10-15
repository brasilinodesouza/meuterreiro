import test from 'node:test';
import assert from 'node:assert/strict';
import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { observeAuth } from '../src/lib/auth-observer';

const first: User = { id: 'first-account', user_metadata: { full_name: 'Pessoa Um' }, app_metadata: {}, aud: 'authenticated', created_at: '2026-10-15T10:00:00Z' };
const second: User = { ...first, id: 'second-account', user_metadata: { full_name: 'Pessoa Dois' } };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function setup() {
  let resolve!: (value: { data: { user: User | null } }) => void;
  let reject!: (error: Error) => void;
  let listener!: (event: AuthChangeEvent, session: Session | null) => void;
  let unsubscribed = false;
  const initial = new Promise<{ data: { user: User | null } }>((done, fail) => { resolve = done; reject = fail; });
  const auth = {
    getUser: () => initial,
    onAuthStateChange(callback: typeof listener) { listener = callback; return { data: { subscription: { unsubscribe: () => { unsubscribed = true; } } } }; },
  } as unknown as Pick<SupabaseClient['auth'], 'getUser' | 'onAuthStateChange'>;
  const state = { user: null as User | null, house: null as string | null, view: 'inicio', form: '', accountChanges: 0, ready: 0, recovery: 0, loading: true };
  const stop = observeAuth(auth, {
    onUser: user => { state.user = user; },
    onAccountChange: user => { state.accountChanges++; state.house = null; state.view = 'inicio'; state.form = ''; state.loading = Boolean(user); },
    onReadyWithoutUser: () => { state.ready++; state.loading = false; },
    onRecovery: () => { state.recovery++; },
  });
  return { state, stop, finish: (user: User | null) => resolve({ data: { user } }), fail: () => reject(new Error('offline')), emit: (event: AuthChangeEvent, user: User | null) => listener(event,user ? { user } as Session : null), unsubscribed: () => unsubscribed };
}

test('voltar à aba e reconfirmar a mesma sessão preserva casa, tela e formulário', async () => {
  const app = setup();
  app.finish(first); await flush();
  app.state.house = 'casa-carregada'; app.state.view = 'mensalidades'; app.state.form = 'valor em edição'; app.state.loading = false;
  for (let i = 0; i < 5; i++) app.emit('SIGNED_IN',structuredClone(first));
  assert.equal(app.state.house,'casa-carregada'); assert.equal(app.state.view,'mensalidades'); assert.equal(app.state.form,'valor em edição');
  assert.equal(app.state.loading,false); assert.equal(app.state.accountChanges,1); assert.equal(app.state.user?.id,first.id);
  app.stop();
});

test('renovação do token e alteração de senha atualizam o usuário sem apagar os dados', async () => {
  const app = setup(); app.finish(first); await flush(); app.state.house = 'casa-carregada';
  const updated = { ...first, user_metadata: { full_name: 'Nome Atualizado' } };
  app.emit('TOKEN_REFRESHED',updated); app.emit('USER_UPDATED',updated);
  assert.equal(app.state.user?.user_metadata.full_name,'Nome Atualizado'); assert.equal(app.state.house,'casa-carregada'); assert.equal(app.state.accountChanges,1);
  app.stop();
});

test('saída e troca real de conta limpam dados anteriores e aguardam o carregamento da nova casa', async () => {
  const app = setup(); app.finish(first); await flush(); app.state.house = 'casa-da-primeira';
  app.emit('SIGNED_IN',second);
  assert.equal(app.state.user?.id,second.id); assert.equal(app.state.house,null); assert.equal(app.state.loading,true); assert.equal(app.state.accountChanges,2);
  app.state.house = 'casa-da-segunda'; app.emit('SIGNED_OUT',null);
  assert.equal(app.state.user,null); assert.equal(app.state.house,null); assert.equal(app.state.loading,false);
  app.emit('SIGNED_IN',second); assert.equal(app.state.accountChanges,4); assert.equal(app.state.loading,true);
  app.stop();
});

test('resposta inicial atrasada não restaura usuário após saída ou troca de conta', async () => {
  for (const event of ['SIGNED_OUT','SIGNED_IN'] as const) {
    const app = setup(); app.emit('SIGNED_IN',first); app.emit(event,event === 'SIGNED_OUT' ? null : second);
    app.finish(first); await flush();
    assert.equal(app.state.user?.id ?? null,event === 'SIGNED_OUT' ? null : second.id);
    assert.equal(app.state.loading,event !== 'SIGNED_OUT');
    app.stop();
  }
});

test('sessão inicial, recuperação de senha e ausência de usuário saem do carregamento corretamente', async () => {
  const app = setup(); app.emit('INITIAL_SESSION',first); app.finish(first); await flush();
  assert.equal(app.state.accountChanges,1); assert.equal(app.state.loading,true);
  app.emit('PASSWORD_RECOVERY',first); assert.equal(app.state.recovery,1); assert.equal(app.state.accountChanges,1);
  app.stop();
  const visitor = setup(); visitor.finish(null); await flush(); assert.equal(visitor.state.loading,false); assert.equal(visitor.state.user,null); visitor.stop();
  const offline = setup(); offline.fail(); await flush(); assert.equal(offline.state.loading,false); offline.stop();
});

test('falha ou ausência de usuário em consulta inicial atrasada não interrompe a nova sessão', async () => {
  for (const fail of [false,true]) {
    const app = setup(); app.emit('SIGNED_IN',second);
    if (fail) app.fail(); else app.finish(null);
    await flush();
    assert.equal(app.state.user?.id,second.id); assert.equal(app.state.loading,true); assert.equal(app.state.ready,0);
    app.stop();
  }
});

test('limpeza cancela a inscrição e descarta eventos ou respostas depois de desmontar a tela', async () => {
  const app = setup(); app.stop(); app.emit('SIGNED_IN',first); app.finish(first); await flush();
  assert.equal(app.unsubscribed(),true); assert.equal(app.state.user,null); assert.equal(app.state.accountChanges,0); assert.equal(app.state.ready,0);
});
