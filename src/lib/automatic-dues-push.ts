type AutomaticDuesPushOptions = {
  permission: () => NotificationPermission;
  enable: (signal: AbortSignal) => Promise<unknown>;
};

export function createAutomaticDuesPush({permission,enable}: AutomaticDuesPushOptions) {
  const controller = new AbortController();
  let busy = false;
  let registered = false;
  let requested = false;
  return {
    async sync(interaction = false) {
      if (controller.signal.aborted || busy || registered) return;
      const current = permission();
      if (current === 'denied' || (current === 'default' && (!interaction || requested))) return;
      if (current === 'default') requested = true;
      busy = true;
      try {
        await enable(controller.signal);
        registered = !controller.signal.aborted;
      } catch { /* Repetir ao recuperar conexão/foco, sem insistir na permissão do aparelho. */ }
      finally { busy = false; }
    },
    stop() { controller.abort(); },
  };
}
