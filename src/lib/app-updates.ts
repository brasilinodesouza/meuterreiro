type UpdateOptions = {
  version: string;
  readVersion: () => Promise<string | null>;
  canReload: () => boolean;
  reload: () => void;
};

export function createAppUpdater({ version, readVersion, canReload, reload }: UpdateOptions) {
  let checking = false;
  let pending = false;
  let stopped = false;
  let reloading = false;
  function apply() {
    if (!stopped && !reloading && pending && canReload()) {
      reloading = true;
      reload();
    }
  }
  return {
    async check() {
      if (stopped || checking || reloading) return;
      checking = true;
      try {
        const latest = await readVersion();
        if (typeof latest === 'string' && latest.trim()) {
          pending = latest !== version;
          apply();
        }
      } catch {
        // Sem rede ou deploy indisponível: mantém a versão atual e tenta depois.
      } finally {
        checking = false;
      }
    },
    apply,
    stop() { stopped = true; },
  };
}

export function startAppUpdates(version: string) {
  const dirtyForms = new Set<HTMLFormElement>();
  function isAvailable() {
    return document.visibilityState === 'visible' && navigator.onLine;
  }
  const updater = createAppUpdater({
    version,
    async readVersion() {
      const response = await fetch(`/app-version.json?t=${Date.now()}`, {
        cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return null;
      const data: unknown = await response.json();
      return data && typeof data === 'object' && 'version' in data && typeof data.version === 'string' ? data.version : null;
    },
    canReload() {
      for (const form of dirtyForms) if (!form.isConnected) dirtyForms.delete(form);
      return isAvailable() && !dirtyForms.size && !document.querySelector('dialog[open]')
        && !document.querySelector('form button[type="submit"]:disabled')
        && !document.activeElement?.matches('input, select, textarea, [contenteditable="true"]');
    },
    reload: () => window.location.reload(),
  });
  function check() { if (isAvailable()) void updater.check(); }
  function edited(event: Event) {
    const form = event.target instanceof Element ? event.target.closest('form') : null;
    if (form) dirtyForms.add(form);
  }
  function reset(event: Event) {
    if (event.target instanceof HTMLFormElement) dirtyForms.delete(event.target);
  }
  const interval = window.setInterval(check, 60000);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', check);
  document.addEventListener('input', edited, true);
  document.addEventListener('change', edited, true);
  document.addEventListener('reset', reset, true);
  check();
  return () => {
    updater.stop();
    window.clearInterval(interval);
    window.removeEventListener('focus', check);
    window.removeEventListener('pageshow', check);
    window.removeEventListener('online', check);
    document.removeEventListener('visibilitychange', check);
    document.removeEventListener('input', edited, true);
    document.removeEventListener('change', edited, true);
    document.removeEventListener('reset', reset, true);
  };
}
