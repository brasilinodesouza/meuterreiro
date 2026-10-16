import { allowedPushEndpoint, type BirthdayPayload } from './birthday-notifications.ts';

export type DuesPush = {id:string;endpoint:string;p256dh:string;auth_key:string};
export type DuesDelivery = DuesPush & {due_id:string;reference:string;due_on:string;amount_cents:number;kind:'today'|'overdue';day:string};
export type DuesSummaryDelivery = DuesPush & {terreiro_id:string;day:string};
export type DuesSummary = {house_name:string;medium_count:number;due_count:number;amount_cents:number;names:string[]};
type Dependencies = {
  getUser:(token:string)=>Promise<string|null>;
  claim:()=>Promise<DuesDelivery[]>;
  pending:(item:DuesDelivery)=>Promise<boolean>;
  find:(userId:string,endpoint:string)=>Promise<DuesPush|null>;
  send:(item:DuesPush,payload:BirthdayPayload,ttl:number)=>Promise<void>;
  finish:(item:DuesDelivery)=>Promise<void>;
  claimSummaries:()=>Promise<DuesSummaryDelivery[]>;
  summary:(item:DuesSummaryDelivery)=>Promise<DuesSummary|null>;
  finishSummary:(item:DuesSummaryDelivery)=>Promise<void>;
  remove:(id:string)=>Promise<void>;
};
export function duesSummaryPayload(item:DuesSummaryDelivery,summary:DuesSummary):BirthdayPayload {
  const value=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(summary.amount_cents/100);
  const names=summary.names.slice(0,5).map(name=>name.slice(0,120)).join(', ');
  const remaining=Math.max(0,summary.medium_count-Math.min(summary.names.length,5));
  return {title:`${summary.medium_count} ${summary.medium_count===1?'médium com mensalidade pendente':'médiuns com mensalidades pendentes'}`,
    body:`${summary.house_name.slice(0,120)}: ${names}${remaining?` e mais ${remaining}`:''}. ${summary.due_count} mensalidade(s), total de ${value}. Toque para ver a lista completa.`,
    url:'/?mensalidades=pendentes',tag:`resumo-mensalidades-${item.terreiro_id}-${item.day}`};
}
export function duesPayload(item:DuesDelivery):BirthdayPayload {
  const reference=item.reference.slice(0,7).split('-').reverse().join('/');
  const value=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(item.amount_cents/100);
  const due=item.due_on.split('-').reverse().join('/');
  return {title:item.kind==='today'?'Sua mensalidade vence hoje':'Mensalidade pendente',
    body:item.kind==='today'?`Sua mensalidade de ${reference}, no valor de ${value}, vence hoje.`:`Não identificamos o pagamento da sua mensalidade de ${reference}, no valor de ${value}, vencida em ${due}. Se já pagou, fale com a administração.`,
    url:'/?mensalidades=avisos',tag:`mensalidade-${item.due_id}-${item.kind}`};
}
export function createDuesNotifications(config:{cronSecret:string;origins:string[]},dependencies:Dependencies) {
  return async(request:Request)=>{
    const origin=request.headers.get('origin');
    const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    if(origin && config.origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
    const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(origin && !config.origins.includes(origin))return reply({error:'Origem não permitida.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}});
    if(request.method!=='POST')return reply({error:'Método não permitido.'},405);
    const token=request.headers.get('authorization')?.replace(/^Bearer /i,'')??'';
    if(!token)return reply({error:'Entre na sua conta.'},401);
    try {
      const text=await request.text();
      if(text.length>4096)return reply({error:'Pedido muito grande.'},413);
      const input:unknown=JSON.parse(text||'{}');
      if(!input || typeof input!=='object' || Array.isArray(input))return reply({error:'Pedido inválido.'},400);
      const body=input as {action?:string;endpoint?:string};
      if(config.cronSecret && token===config.cronSecret) {
        let sent=0,failed=0,expired=0,skipped=0;
        const items=await dependencies.claim();
        for(let start=0;start<items.length;start+=10)await Promise.all(items.slice(start,start+10).map(async item=>{
          try {
            if(!allowedPushEndpoint(item.endpoint))throw new Error('Invalid endpoint');
            if(!await dependencies.pending(item)){skipped++;return;}
            const end=Date.parse(`${item.day}T03:00:00Z`)+86400000;
            const ttl=Math.max(0,Math.min(86400,Math.floor((end-Date.now())/1000)));
            await dependencies.send(item,duesPayload(item),ttl);
            await dependencies.finish(item);sent++;
          }catch(error){
            if([404,410].includes((error as {statusCode?:number})?.statusCode??0)){await dependencies.remove(item.id);expired++;}
            else failed++;
          }
        }));
        const summaries=await dependencies.claimSummaries();
        for(let start=0;start<summaries.length;start+=10)await Promise.all(summaries.slice(start,start+10).map(async item=>{
          try {
            if(!allowedPushEndpoint(item.endpoint))throw new Error('Invalid endpoint');
            const summary=await dependencies.summary(item);
            if(!summary){skipped++;return;}
            const end=Date.parse(`${item.day}T03:00:00Z`)+86400000;
            const ttl=Math.max(0,Math.min(86400,Math.floor((end-Date.now())/1000)));
            await dependencies.send(item,duesSummaryPayload(item,summary),ttl);
            await dependencies.finishSummary(item);sent++;
          }catch(error){
            if([404,410].includes((error as {statusCode?:number})?.statusCode??0)){await dependencies.remove(item.id);expired++;}
            else failed++;
          }
        }));
        return reply({sent,failed,expired,skipped},failed?503:200);
      }
      const userId=await dependencies.getUser(token);
      if(!userId)return reply({error:'Entre novamente na sua conta.'},401);
      if(body.action!=='test' || typeof body.endpoint!=='string' || !allowedPushEndpoint(body.endpoint))return reply({error:'Pedido inválido.'},400);
      const item=await dependencies.find(userId,body.endpoint);
      if(!item)return reply({error:'Permita os avisos neste aparelho primeiro.'},404);
      try {await dependencies.send(item,{title:'MeuTerreiro',body:'Este aparelho está pronto para receber avisos de mensalidade. Responsáveis e administradores também recebem o resumo de pendências da casa, quando os avisos estão ativados.',url:'/?mensalidades=avisos',tag:'teste-mensalidades'},60);}
      catch(error){
        if([404,410].includes((error as {statusCode?:number})?.statusCode??0)){await dependencies.remove(item.id);return reply({error:'Permita os avisos novamente neste aparelho.'},410);}
        throw error;
      }
      return reply({sent:true});
    }catch{return reply({error:'Não foi possível enviar o aviso agora.'},503);}
  };
}
