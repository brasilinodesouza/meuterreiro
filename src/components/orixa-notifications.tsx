'use client';

import { useEffect } from 'react';
import { supportsBirthdayPush } from '@/lib/birthday-push';
import { createAutomaticDuesPush } from '@/lib/automatic-dues-push';
import { enableOrixaPush } from '@/lib/orixa-push';

export function OrixaNotifications({ userId }: { userId: string }) {
  useEffect(() => {
    if (!supportsBirthdayPush()) return;
    const push = createAutomaticDuesPush({ permission: () => Notification.permission, enable: enableOrixaPush });
    const sync = () => { if (document.visibilityState === 'visible' && navigator.onLine) void push.sync(); };
    const interact = (event: MouseEvent) => {
      if (event.isTrusted && !(event.target instanceof Element && event.target.closest('[aria-label="Sair da conta"]'))) void push.sync(true);
    };
    sync(); document.addEventListener('click', interact); document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync); window.addEventListener('online', sync);
    return () => {
      push.stop(); document.removeEventListener('click', interact); document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync); window.removeEventListener('online', sync);
    };
  }, [userId]);
  return null;
}
