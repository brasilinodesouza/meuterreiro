import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('service worker mostra o aniversário em segundo plano e mantém clique dentro do app',async()=>{
 const handlers=new Map<string,(event:unknown)=>void>();
 const shown:unknown[]=[];const opened:string[]=[];
 const self={location:{origin:'https://meuterreiro.vercel.app'},addEventListener:(name:string,handler:(event:unknown)=>void)=>handlers.set(name,handler),registration:{showNotification:async(title:string,options:unknown)=>{shown.push({title,options});}},clients:{matchAll:async()=>[],openWindow:async(url:string)=>{opened.push(url);}}};
 runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),{self,URL});
 let pending=Promise.resolve();
 handlers.get('push')!({data:{json:()=>({title:'Aniversário de hoje',body:'Hoje é aniversário de Maria.',tag:'aniversarios-2026-10-13',url:'/?aniversarios=hoje'})},waitUntil:(work:Promise<void>)=>{pending=work;}});
 await pending;
 assert.equal((shown[0] as {title:string}).title,'Aniversário de hoje');
 assert.equal((shown[0] as {options:{body:string}}).options.body,'Hoje é aniversário de Maria.');
 let closed=false;
 handlers.get('notificationclick')!({notification:{data:{url:'https://evil.example/'},close:()=>{closed=true;}},waitUntil:(work:Promise<void>)=>{pending=work;}});
 await pending;
 assert.equal(closed,true);
 assert.deepEqual(opened,['https://meuterreiro.vercel.app/']);
});
