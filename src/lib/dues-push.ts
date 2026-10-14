import { supabase } from './supabase';
import { currentBirthdaySubscription, enableAppPush, supportsBirthdayPush } from './birthday-push';
import { membershipRpc } from './memberships';

export async function loadDuesNotifications(houseId: string) {
  if (!supabase) throw new Error('Banco não conectado.');
  const {data,error} = await supabase.from('dues_notification_settings').select('enabled').eq('terreiro_id',houseId).maybeSingle();
  if (error) throw new Error('Não foi possível consultar os avisos de mensalidade.');
  return data?.enabled === true;
}
export async function setDuesNotifications(houseId: string, enabled: boolean) {
  await membershipRpc('set_dues_notifications',{p_house:houseId,p_enabled:enabled});
}
export async function enableDuesPush() { return enableAppPush('register_dues_push'); }
export async function disableDuesPush() {
  if (!supabase || !supportsBirthdayPush()) return;
  const subscription = await currentBirthdaySubscription();
  if (!subscription) return;
  const {error} = await supabase.from('dues_push_subscriptions').delete().eq('endpoint',subscription.endpoint);
  if (error) throw new Error('Não foi possível desativar os avisos de mensalidade neste aparelho.');
}
export async function testDuesPush() {
  const subscription = await currentBirthdaySubscription();
  if (!supabase || !subscription) throw new Error('Permita os avisos neste aparelho primeiro.');
  const {error} = await supabase.functions.invoke('dues-notifications',{body:{action:'test',endpoint:subscription.endpoint}});
  if (error) throw new Error('Não foi possível enviar o teste. Confira a permissão de notificações.');
}
