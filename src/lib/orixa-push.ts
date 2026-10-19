import { supabase } from './supabase';
import { currentBirthdaySubscription, enableAppPush, supportsBirthdayPush } from './birthday-push';

export async function enableOrixaPush(signal?: AbortSignal) { return enableAppPush('register_orixa_push', signal); }
export async function disableOrixaPush() {
  if (!supabase || !supportsBirthdayPush()) return;
  const subscription = await currentBirthdaySubscription();
  if (!subscription) return;
  const { error } = await supabase.from('orixa_push_subscriptions').delete().eq('endpoint', subscription.endpoint);
  if (error) throw new Error('Não foi possível desativar os avisos do calendário neste aparelho.');
}
