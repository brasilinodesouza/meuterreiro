export type AppUpdateState = 'checking' | 'current' | 'pending' | 'updating' | 'error';
type UpdateOptions = {
  version: string;
  readVersion: () => Promise<string | null>;
  canReload: () => boolean;
  reload: () => void;
  onState?: (state: AppUpdateState) => void;
};

export function createAppUpdater({ version, readVersion, canReload, reload, onState }: UpdateOptions) {
  let checking = false;
  let pending = false;
  let stopped = false;
  let reloading = false;
  function apply() {
    if (!stopped && !reloading && pending && canReload()) {
      reloading = true;
      onState?.('updating');
      reload();
    }
  }
  return {
    async check() {
      if (stopped || checking || reloading) return;
      checking = true;
      onState?.('checking');
      try {
        const latest = await readVersion();
        if (stopped) return;
        if (typeof latest === 'string' && latest.trim()) {
          pending = latest !== version;
          onState?.(pending ? 'pending' : 'current');
          apply();
        } else onState?.('error');
      } catch {
        // Sem rede ou deploy indisponível: mantém a versão atual e tenta depois.
        if (!stopped) onState?.('error');
      } finally {
        checking = false;
      }
    },
    apply,
    stop() { stopped = true; },
  };
}

export function startAppUpdates(version: string, onState?: (state: AppUpdateState) => void) {
  const dirtyForms = new Set<HTMLFormElement>();
  function isAvailable() {
    return document.visibilityState === 'visible' && navigator.onLine;
  }
  const updater = createAppUpdater({
    version,
    onState,
    async readVersion() {
      // AbortSignal.timeout não existe em alguns navegadores de apps instalados.
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`/app-version.json?t=${Date.now()}`, {
          cache: 'no-store', credentials: 'omit', signal: controller.signal,
        });
        if (!response.ok) return null;
        const data: unknown = await response.json();
        return data && typeof data === 'object' && 'version' in data && typeof data.version === 'string' ? data.version : null;
      } finally { window.clearTimeout(timeout); }
    },
    canReload() {
      for (const form of dirtyForms) if (!form.isConnected) dirtyForms.delete(form);
      return isAvailable() && !dirtyForms.size && !document.querySelector('dialog[open]')
        && !document.querySelector('form button[type="submit"]:disabled')
        && !document.activeElement?.matches('input, select, textarea, [contenteditable="true"]');
    },
    reload: () => window.location.reload(),
  });
  function check() {
    if (isAvailable()) void updater.check();
    else if (document.visibilityState === 'visible') onState?.('error');
  }
  function edited(event: Event) {
    const form = event.target instanceof Element ? event.target.closest('form') : null;
    if (form) dirtyForms.add(form);
  }
  function reset(event: Event) {
    if (event.target instanceof HTMLFormElement) dirtyForms.delete(event.target);
  }
  function settled() { window.setTimeout(updater.apply, 0); }
  // Aplica assim que a janela é fechada ou a gravação termina, sem esperar outro minuto.
  const observer = new MutationObserver(updater.apply);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'disabled'] });
  const interval = window.setInterval(check, 60000);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', check);
  document.addEventListener('input', edited, true);
  document.addEventListener('change', edited, true);
  document.addEventListener('reset', reset, true);
  document.addEventListener('reset', settled);
  document.addEventListener('focusout', settled);
  check();
  function stop() {
    updater.stop();
    observer.disconnect();
    window.clearInterval(interval);
    window.removeEventListener('focus', check);
    window.removeEventListener('pageshow', check);
    window.removeEventListener('online', check);
    document.removeEventListener('visibilitychange', check);
    document.removeEventListener('input', edited, true);
    document.removeEventListener('change', edited, true);
    document.removeEventListener('reset', reset, true);
    document.removeEventListener('reset', settled);
    document.removeEventListener('focusout', settled);
  }
  return { check, stop };
}
