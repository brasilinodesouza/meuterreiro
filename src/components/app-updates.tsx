'use client';

import { useEffect, useRef, useState } from 'react';
import { startAppUpdates, type AppUpdateState } from '@/lib/app-updates';

const messages: Record<AppUpdateState, string> = {
  checking: 'Verificando atualizações…',
  current: 'Você está na versão mais recente.',
  pending: 'Nova versão disponível. Termine o preenchimento e saia do formulário ou feche a janela para atualizar.',
  updating: 'Atualizando o app…',
  error: 'Não foi possível verificar agora. Tentaremos novamente com conexão.',
};

export function AppUpdates() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  const builtAt = process.env.NEXT_PUBLIC_APP_BUILT_AT;
  const enabled = process.env.NODE_ENV === 'production' && version && version !== 'development';
  const [state, setState] = useState<AppUpdateState>('checking');
  const monitor = useRef<ReturnType<typeof startAppUpdates> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    monitor.current = startAppUpdates(version, setState);
    return () => { monitor.current?.stop(); monitor.current = null; };
  }, [enabled, version]);
  if (!enabled) return null;
  const published = builtAt ? new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(builtAt)) : '';
  return <footer className="app-update-status" aria-label="Atualizações do aplicativo">
    <div><span>Versão {published}{published ? ' · ' : ''}{version.slice(0, 8)}</span>
      <button type="button" className="text-button" disabled={state === 'checking' || state === 'updating'} onClick={() => monitor.current?.check()}>Verificar atualização</button></div>
    <p role="status" aria-live="polite">{messages[state]}</p>
  </footer>;
}
