import type { AuthChangeEvent, SupabaseClient, User } from '@supabase/supabase-js';

type Effects = {
  onUser: (user: User | null) => void;
  onAccountChange: (user: User | null) => void;
  onRecovery: () => void;
  onReadyWithoutUser: () => void;
};

export function observeAuth(auth: Pick<SupabaseClient['auth'], 'getUser' | 'onAuthStateChange'>, effects: Effects) {
  let active = true;
  let currentUserId: string | null = null;
  let revision = 0;
  function apply(event: AuthChangeEvent, user: User | null) {
    if (!active) return;
    const nextUser = event === 'SIGNED_OUT' ? null : user;
    const nextUserId = nextUser?.id ?? null;
    // SIGNED_IN também acontece ao voltar à aba, sem mudança de conta.
    if (nextUserId !== currentUserId || event === 'SIGNED_OUT') effects.onAccountChange(nextUser);
    currentUserId = nextUserId;
    effects.onUser(nextUser);
    if (!nextUser) effects.onReadyWithoutUser();
    if (event === 'PASSWORD_RECOVERY') effects.onRecovery();
  }
  const initialRevision = revision;
  const initialUser = auth.getUser();
  const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
    revision++;
    apply(event, session?.user ?? null);
  });
  void initialUser.then(({ data }) => {
    // Uma resposta inicial atrasada não pode restaurar uma conta após sair ou trocar.
    if (active && revision === initialRevision) apply('INITIAL_SESSION', data.user);
  }).catch(() => {
    if (active && revision === initialRevision) effects.onReadyWithoutUser();
  });
  return () => { active = false; subscription.unsubscribe(); };
}
