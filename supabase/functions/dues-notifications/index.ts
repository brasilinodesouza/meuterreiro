import {createClient} from 'npm:@supabase/supabase-js@2.117.3';
import webpush from 'npm:web-push@3.6.7';
import {createDuesNotifications} from '../_shared/dues-notifications.ts';

const database=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async request=>{
  const {data:config,error}=await database.rpc('birthday_push_server_config');
  if(error || !config?.privateKey || !config?.publicKey || !config?.cronSecret)return new Response(JSON.stringify({error:'Avisos temporariamente indisponíveis.'}),{status:503,headers:{'Content-Type':'application/json'}});
  const vapidDetails={subject:'https://meuterreiro.vercel.app',publicKey:config.publicKey,privateKey:config.privateKey};
  return createDuesNotifications({cronSecret:config.cronSecret,origins:['https://meuterreiro.vercel.app','http://localhost:3000']},{
    async getUser(token){const {data,error}=await database.auth.getUser(token);return error?null:data.user?.id??null;},
    async claim(){const {data,error}=await database.rpc('claim_dues_push');if(error)throw error;return data??[];},
    async pending(item){const {data,error}=await database.rpc('dues_push_is_pending',{p_id:item.id,p_due:item.due_id,p_kind:item.kind,p_day:item.day});if(error)throw error;return data===true;},
    async find(userId,endpoint){const {data,error}=await database.from('dues_push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('user_id',userId).eq('endpoint',endpoint).maybeSingle();if(error)throw error;return data;},
    async finish(item){const {error}=await database.rpc('finish_dues_push',{p_id:item.id,p_due:item.due_id,p_kind:item.kind,p_day:item.day});if(error)throw error;},
    async remove(id){const {error}=await database.from('dues_push_subscriptions').delete().eq('id',id);if(error)throw error;},
    async send(item,payload,ttl){
      const details=webpush.generateRequestDetails({endpoint:item.endpoint,keys:{p256dh:item.p256dh,auth:item.auth_key}},JSON.stringify(payload),{vapidDetails,TTL:ttl,urgency:'normal',contentEncoding:'aes128gcm'});
      const response=await fetch(details.endpoint,{method:details.method,headers:details.headers,body:new Uint8Array(details.body),signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Object.assign(new Error('Push provider rejected request'),{statusCode:response.status});
    },
  })(request);
});
