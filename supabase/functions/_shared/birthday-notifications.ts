export type BirthdayPush = { id: string; endpoint: string; p256dh: string; auth_key: string; names?: string[]; day?: string };
export type BirthdayPayload = { title: string; body: string; url: string; tag: string };
type Dependencies = {
  getUser: (token: string) => Promise<string | null>;
  claim: () => Promise<BirthdayPush[]>;
  find: (userId: string, endpoint: string) => Promise<BirthdayPush | null>;
  send: (item: BirthdayPush, payload: BirthdayPayload, ttl: number) => Promise<void>;
  finish: (id: string, day: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  health: () => Promise<boolean>;
};

export function birthdayPayload(names: string[], day: string): BirthdayPayload {
  const summary = names.slice(0,3).map(name=>name.slice(0,80)).join(', ');
  return {title: names.length === 1 ? 'Aniversário de hoje 🎂' : 'Aniversários de hoje 🎂', body: `Hoje é aniversário de ${summary}${names.length>3?` e mais ${names.length-3} médiuns`:''}.`, url:'/?aniversarios=hoje', tag:`aniversarios-${day}`};
}
export function allowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol==='https:' && !url.username && !url.password && !url.port && !url.hash && !url.search
      && ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(url.hostname);
  } catch { return false; }
}

export function createBirthdayNotifications(config: {cronSecret: string; origins: string[]}, dependencies: Dependencies) {
  return async (request: Request) => {
    const origin=request.headers.get('origin');
    const cors: Record<string,string> = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    if(origin && config.origins.includes(origin)) cors['Access-Control-Allow-Origin']=origin;
    const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
    if(origin && !config.origins.includes(origin)) return reply({error:'Origem não permitida.'},403);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}});
    if(request.method!=='POST') return reply({error:'Método não permitido.'},405);
    const token=request.headers.get('authorization')?.replace(/^Bearer /i,'')??'';
    if(!token) return reply({error:'Entre na sua conta.'},401);
    try {
      const text=await request.text();
      if(text.length>4096)return reply({error:'Pedido muito grande.'},413);
      const body:unknown=JSON.parse(text||'{}');
      if(!body || typeof body!=='object')return reply({error:'Pedido inválido.'},400);
      const input=body as {action?:string;endpoint?:string};
      if(config.cronSecret && token===config.cronSecret) {
        if(input.action==='health') return reply({ready:await dependencies.health()});
        const items=await dependencies.claim();
        let sent=0,failed=0,expired=0;
        for(let start=0;start<items.length;start+=10) {
          await Promise.all(items.slice(start,start+10).map(async item=>{
            try {
              if(!allowedPushEndpoint(item.endpoint) || !item.day || !item.names?.length)throw new Error('Invalid subscription');
              const end=Date.parse(`${item.day}T03:00:00Z`)+86400000;
              const ttl=Math.max(0,Math.min(86400,Math.floor((end-Date.now())/1000)));
              await dependencies.send(item,birthdayPayload(item.names,item.day),ttl);
              await dependencies.finish(item.id,item.day);
              sent++;
            } catch(error) {
              const status=(error as {statusCode?:number})?.statusCode;
              if(status===404 || status===410){await dependencies.remove(item.id);expired++;}
              else failed++;
            }
          }));
        }
        return reply({sent,failed,expired},failed?503:200);
      }
      const userId=await dependencies.getUser(token);
      if(!userId)return reply({error:'Entre novamente na sua conta.'},401);
      if(input.action!=='test' || typeof input.endpoint!=='string' || !allowedPushEndpoint(input.endpoint))return reply({error:'Pedido inválido.'},400);
      const item=await dependencies.find(userId,input.endpoint);
      if(!item)return reply({error:'Ative os avisos neste aparelho primeiro.'},404);
      try {
        await dependencies.send(item,{title:'MeuTerreiro',body:'Avisos de aniversário ativos neste celular, às 8h.',url:'/',tag:'teste-aniversarios'},60);
      } catch(error) {
        if([404,410].includes((error as {statusCode?:number})?.statusCode??0)){await dependencies.remove(item.id);return reply({error:'Ative os avisos novamente neste aparelho.'},410);}
        throw error;
      }
      return reply({sent:true});
    } catch {
      return reply({error:'Não foi possível enviar o aviso agora.'},503);
    }
  };
}
