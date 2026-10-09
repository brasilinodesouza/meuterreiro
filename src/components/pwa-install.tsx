'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
function subscribe(callback: () => void) {
  const media = window.matchMedia('(display-mode: standalone)');
  media.addEventListener('change', callback);
  window.addEventListener('appinstalled', callback);
  return () => { media.removeEventListener('change', callback); window.removeEventListener('appinstalled', callback); };
}
function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstall() {
  const installed = useSyncExternalStore(subscribe, isInstalled, () => false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [message, setMessage] = useState('');
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const onInstalled = () => { setHidden(true); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if ('serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
        setMessage('Não foi possível preparar a instalação. Recarregue a página e tente novamente.');
      });
    }
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  async function install() {
    if (!window.isSecureContext) {
      setMessage('Para instalar, abra o link HTTPS da prévia no navegador do seu celular.');
      return;
    }
    if (prompt) {
      setBusy(true);
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        setPrompt(null);
        if (choice.outcome === 'accepted') setHidden(true);
      } catch { setMessage('Abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.'); }
      finally { setBusy(false); }
      return;
    }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setMessage(ios
      ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.'
      : 'No Chrome do Android, abra o menu ⋮ e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”. Se não aparecer, recarregue o link HTTPS.');
  }

  if (installed || hidden) return null;
  return <aside className="pwa-install" aria-label="Instalar MeuTerreiro">
    <div className="pwa-install-row"><Smartphone size={18} /><button className="text-button" disabled={busy} onClick={install}><Download size={15} />{busy ? 'Preparando…' : 'Instalar MeuTerreiro'}</button><button className="icon-button" aria-label="Ocultar instalação" onClick={() => setHidden(true)}><X size={15} /></button></div>
    {message && <p role="status">{message}</p>}
  </aside>;
}
