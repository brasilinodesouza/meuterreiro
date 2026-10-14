type MemberUpdateOptions<T> = {
  read: () => Promise<T>;
  onData: (data: T) => void;
  onError: () => void;
  canCheck: () => boolean;
};

export function createMemberUpdater<T>({ read, onData, onError, canCheck }: MemberUpdateOptions<T>) {
  let checking = false;
  let stopped = false;
  return {
    async check() {
      if (stopped || checking || !canCheck()) return;
      checking = true;
      try {
        const data = await read();
        if (!stopped) onData(data);
      } catch { if (!stopped) onError(); }
      finally { checking = false; }
    },
    stop() { stopped = true; },
  };
}

export function startMemberUpdates<T>(options: Omit<MemberUpdateOptions<T>, 'canCheck'>) {
  const updater = createMemberUpdater({ ...options, canCheck: () => document.visibilityState === 'visible' && navigator.onLine });
  const check = () => { void updater.check(); };
  const interval = window.setInterval(check, 15000);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', check);
  check();
  return () => {
    updater.stop();
    window.clearInterval(interval);
    window.removeEventListener('focus', check);
    window.removeEventListener('pageshow', check);
    window.removeEventListener('online', check);
    document.removeEventListener('visibilitychange', check);
  };
}
