import {supabase} from './supabase';

export function supportsBirthdayPush() {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
export async function currentBirthdaySubscription() {
  const registration=await navigator.serviceWorker.getRegistration('/');
  return await registration?.pushManager.getSubscription()??null;
}
export async function enableBirthdayPush() {
  if(!supabase)throw new Error('Entre na sua conta para ativar os avisos.');
  const permission=await Notification.requestPermission();
  if(permission!=='granted')throw new Error('Permita notificações nas configurações deste app ou navegador para receber os avisos.');
  const response=await fetch('/push-config.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Não foi possível preparar os avisos. Tente novamente.');
  const {publicKey}=await response.json() as {publicKey:string};
  const key=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
  await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
  const registration=await navigator.serviceWorker.ready;
  let subscription=await registration.pushManager.getSubscription();
  if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  const data=subscription.toJSON();
  if(!data.keys?.p256dh || !data.keys.auth)throw new Error('O aparelho não forneceu os dados de notificação.');
  const {error}=await supabase.rpc('register_birthday_push',{p_endpoint:subscription.endpoint,p_p256dh:data.keys.p256dh,p_auth:data.keys.auth});
  if(error)throw new Error('Não foi possível ativar os avisos nesta conta. Tente novamente.');
  return subscription;
}
export async function disableBirthdayPush() {
  if(!supportsBirthdayPush())return;
  const subscription=await currentBirthdaySubscription();
  if(!subscription)return;
  if(supabase){
    const {error}=await supabase.from('birthday_push_subscriptions').delete().eq('endpoint',subscription.endpoint);
    if(error)throw new Error('Não foi possível desativar os avisos. Tente novamente.');
  }
  await subscription.unsubscribe();
}
export async function testBirthdayPush() {
  const subscription=await currentBirthdaySubscription();
  if(!supabase || !subscription)throw new Error('Ative os avisos neste aparelho primeiro.');
  const {error}=await supabase.functions.invoke('birthday-notifications',{body:{action:'test',endpoint:subscription.endpoint}});
  if(error)throw new Error('Não foi possível entregar o teste. Confira a permissão de notificações e tente novamente.');
}
