export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallState = { prompt: InstallPromptEvent | null; installed: boolean };
declare global {
  interface Window { __meuterreiroInstall?: InstallState }
}

const initialState: InstallState = { prompt: null, installed: false };
export const installStateEvent = 'meuterreiro-install-state';

// Captura o evento antes da hidratação, para não perder a oferta do navegador.
export const installBootstrap = `(()=>{
  if(window.__meuterreiroInstall)return;
  window.__meuterreiroInstall={prompt:null,installed:false};
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    window.__meuterreiroInstall={prompt:event,installed:false};
    window.dispatchEvent(new Event('meuterreiro-install-state'));
  });
  window.addEventListener('appinstalled',()=>{
    window.__meuterreiroInstall={prompt:null,installed:true};
    window.dispatchEvent(new Event('meuterreiro-install-state'));
  });
})();`;

export function getInstallState(): InstallState {
  return window.__meuterreiroInstall ?? initialState;
}
export function getServerInstallState(): InstallState { return initialState; }
export function subscribeInstallState(callback: () => void) {
  window.addEventListener(installStateEvent, callback);
  return () => window.removeEventListener(installStateEvent, callback);
}

// Deve ser chamado diretamente pelo clique, sem esperar rede ou timers.
export function requestInstall(): Promise<'accepted' | 'dismissed'> | null {
  const event = getInstallState().prompt;
  if (!event) return null;
  window.__meuterreiroInstall = { prompt: null, installed: false };
  window.dispatchEvent(new Event(installStateEvent));
  try {
    const confirmation = event.prompt();
    return Promise.resolve(confirmation).then(() => event.userChoice).then(choice => choice.outcome);
  } catch (error) {
    return Promise.reject(error);
  }
}
