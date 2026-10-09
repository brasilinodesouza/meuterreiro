import { parseCredentials } from './credentials.ts';

type Options = { url: string; publicKey: string; serviceKey: string; origins: string[]; fetcher?: typeof fetch };
const invalidLogin = 'Usuário ou senha incorretos.';
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function readBody(request: Request) {
  if (!request.body) throw new Error('Empty body');
  const reader=request.body.getReader(); const chunks:Uint8Array[]=[]; let length=0;
  try {
    while (true) { const {done,value}=await reader.read(); if(done)break; length+=value.length; if(length>4096) { await reader.cancel(); throw new Error('Body too large'); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function createUsernameLogin(options: Options) {
  const fetcher=options.fetcher??fetch;
  return async function handler(request: Request): Promise<Response> {
    const origin=request.headers.get('origin')??'';
    const permitted=options.origins.includes(origin);
    const headers:Record<string,string>={ 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin' };
    if(permitted) { headers['Access-Control-Allow-Origin']=origin; headers['Access-Control-Allow-Headers']='authorization, x-client-info, apikey, content-type'; headers['Access-Control-Allow-Methods']='POST, OPTIONS'; }
    const response=(status:number,error:string)=>Response.json({error},{status,headers});
    if(!permitted)return response(403,'Origem não permitida.');
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return response(405,'Método não permitido.');
    if(!options.url||!options.serviceKey||!options.publicKey)return response(503,'Acesso indisponível.');
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return response(400,'Envie os dados em JSON.');
    let credentials:ReturnType<typeof parseCredentials>;
    try { credentials=parseCredentials(await readBody(request)); } catch { return response(400,'Informe usuário e senha com 6 a 20 caracteres.'); }
    const adminHeaders={apikey:options.serviceKey,Authorization:`Bearer ${options.serviceKey}`,'Content-Type':'application/json'};
    try {
      const buckets=[`u:${await digest(credentials.username)}`];
      // IP é um limite adicional; o limite por usuário é aplicado mesmo sem esse cabeçalho.
      const ip=request.headers.get('x-forwarded-for')?.split(',').pop()?.trim();
      if(ip)buckets.push(`i:${await digest(ip)}`);
      const limit=await fetcher(`${options.url}/rest/v1/rpc/auth_take_login_attempt`,{method:'POST',headers:adminHeaders,body:JSON.stringify({p_buckets:buckets})});
      if(!limit.ok)return response(503,'Acesso indisponível.');
      if(await limit.json()!==true)return response(429,'Muitas tentativas. Aguarde 15 minutos.');
      const lookup=await fetcher(`${options.url}/rest/v1/rpc/auth_email_for_username`,{method:'POST',headers:adminHeaders,body:JSON.stringify({p_username:credentials.username})});
      if(!lookup.ok)return response(503,'Acesso indisponível.');
      const email=await lookup.json();
      // Ambos os casos passam pelo Auth para retornar a mesma resposta de credenciais inválidas.
      const auth=await fetcher(`${options.url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:options.publicKey,'Content-Type':'application/json'},body:JSON.stringify({email:typeof email==='string'?email:`${crypto.randomUUID()}@invalid.invalid`,password:credentials.password})});
      if(auth.status===429)return response(429,'Muitas tentativas. Aguarde 15 minutos.');
      if(auth.status>=500)return response(503,'Acesso indisponível.');
      if(!auth.ok||typeof email!=='string')return response(401,invalidLogin);
      const session=await auth.json();
      if(typeof session.access_token!=='string'||!session.access_token||typeof session.refresh_token!=='string'||!session.refresh_token)return response(503,'Acesso indisponível.');
      return Response.json({access_token:session.access_token,refresh_token:session.refresh_token},{headers});
    } catch { return response(503,'Acesso indisponível.'); }
  };
}
