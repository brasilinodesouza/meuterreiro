export const themeStorage='meuterreiro.theme.v1';
export const themeEvent='meuterreiro-theme';
export type Theme='light'|'dark';
// Executa antes da tela aparecer, evitando um clarão ao abrir no tema escuro.
export const themeBootstrap=`try{document.documentElement.dataset.theme=localStorage.getItem('${themeStorage}')==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}`;
export function getTheme():Theme {return document.documentElement.dataset.theme==='dark'?'dark':'light';}
export function changeTheme(theme:Theme) {
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem(themeStorage,theme);}catch{/* A escolha continua válida nesta sessão. */}
  window.dispatchEvent(new Event(themeEvent));
}
export function subscribeTheme(callback:()=>void){
  const onStorage=(event:StorageEvent)=>{if(event.key===themeStorage){document.documentElement.dataset.theme=event.newValue==='dark'?'dark':'light';callback();}};
  window.addEventListener(themeEvent,callback);window.addEventListener('storage',onStorage);
  return()=>{window.removeEventListener(themeEvent,callback);window.removeEventListener('storage',onStorage);};
}
