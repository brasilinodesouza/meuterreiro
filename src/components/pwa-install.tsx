'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { getInstallState, getServerInstallState, requestInstall, subscribeInstallState } from '@/lib/pwa';
import { startAppUpdates } from '@/lib/app-updates';

function subscribeDisplay(callback: () => void) {
  const media = window.matchMedia('(display-mode: standalone)');
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstall() {
  const { prompt, installed } = useSyncExternalStore(subscribeInstallState, getInstallState, getServerInstallState);
  const standalone = useSyncExternalStore(subscribeDisplay, isStandalone, () => false);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
        // A oferta só aparece quando o próprio navegador permite a instalação.
      });
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_APP_VERSION === 'development') return;
    return startAppUpdates(process.env.NEXT_PUBLIC_APP_VERSION);
  }, []);

  function install() {
    if (busy) return;
    // A confirmação nativa é aberta dentro do gesto do usuário.
    const confirmation = requestInstall();
    if (!confirmation) return;
    setBusy(true);
    setError('');
    void confirmation.then(outcome => {
      if (outcome === 'accepted') setHidden(true);
    }).catch(() => {
      setError('Não foi possível instalar agora. Tente novamente mais tarde.');
    }).finally(() => setBusy(false));
  }

  if (standalone || installed || hidden || (!prompt && !busy && !error)) return null;
  return <aside className="pwa-install" aria-label="Instalar MeuTerreiro">
    <div className="pwa-install-row">
      <Smartphone size={24} aria-hidden="true" />
      <strong>MeuTerreiro no seu celular</strong>
      <button className="icon-button" aria-label="Ocultar instalação" onClick={() => setHidden(true)}><X size={20} /></button>
    </div>
    <p>Abra direto pelo ícone, sempre que precisar.</p>
    {!error && <button className="button primary pwa-install-action" disabled={busy || !prompt} onClick={install}>
      <Download size={20} aria-hidden="true" />{busy ? 'Aguardando confirmação…' : 'Instalar MeuTerreiro'}
    </button>}
    {error && <p role="alert">{error}</p>}
    {busy && <span className="sr-only" role="status">Confirme a instalação na janela do seu celular.</span>}
  </aside>;
}
