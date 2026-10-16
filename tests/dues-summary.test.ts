import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createDuesNotifications, duesSummaryPayload, type DuesSummary, type DuesSummaryDelivery } from '../supabase/functions/_shared/dues-notifications';
import { pendingDuesThrough, summarizeDebtors } from '../src/lib/dues-summary';
import type { Due } from '../src/lib/finance';
import type { Medium } from '../src/lib/data';

test('resumo usa a lista atualizada, limita o push e só cron pode enviar',async()=>{
 const item:DuesSummaryDelivery={id:'device',terreiro_id:'house',day:'2026-10-16',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'key',auth_key:'auth'};
 let summary:DuesSummary|null={house_name:'Casa Um',medium_count:7,due_count:9,amount_cents:45000,names:['Ana','Bia','Caio','Dani','Eva']};
 const payload=duesSummaryPayload(item,summary);
 assert.match(payload.title,/7 médiuns/);assert.match(payload.body,/Ana, Bia, Caio, Dani, Eva e mais 2/);assert.match(payload.body,/450,00/);
 assert.equal(payload.url,'/?mensalidades=pendentes');assert.match(payload.tag,/house-2026-10-16/);
 assert.ok(Buffer.byteLength(JSON.stringify(duesSummaryPayload(item,{...summary,house_name:'Á'.repeat(500),names:Array(8).fill('Á'.repeat(500))})))<3500);
 let sent=0,finished=0,removed=0,claims=0,failure=0;
 const handler=createDuesNotifications({cronSecret:'cron',origins:[]},{
  getUser:async()=> 'member',claim:async()=>[],pending:async()=>false,find:async()=>null,finish:async()=>{},
  claimSummaries:async()=>{claims++;return[item];},summary:async()=>summary,finishSummary:async()=>{finished++;},
  send:async(_item,message)=>{if(failure)throw{statusCode:failure};assert.equal(message.url,'/?mensalidades=pendentes');sent++;},remove:async()=>{removed++;},
 });
 const request=(token:string)=>handler(new Request('https://example.com',{method:'POST',headers:{authorization:`Bearer ${token}`},body:'{}'}));
 assert.equal((await request('user')).status,400);assert.equal(claims,0);
 assert.deepEqual(await (await request('cron')).json(),{sent:1,failed:0,expired:0,skipped:0});assert.equal(finished,1);
 summary=null;assert.equal((await (await request('cron')).json()).skipped,1);assert.equal(sent,1);assert.equal(finished,1);
 summary={house_name:'Casa Um',medium_count:1,due_count:1,amount_cents:5000,names:['Ana']};
 failure=503;assert.equal((await request('cron')).status,503);assert.equal(finished,1);
 failure=410;assert.equal((await request('cron')).status,200);assert.equal(removed,1);
});

test('lista completa reúne meses anteriores por médium e exclui futuros, pagos e isentos',()=>{
 const due=(id:string,medium_id:string,due_on:string,status:Due['status']='pendente')=>({id,medium_id,due_on,status,amount_cents:5000} as Due);
 const dues=[due('1','ana','2026-09-10'),due('2','ana','2026-10-16'),due('3','bia','2026-10-10'),due('4','bia','2026-11-10'),due('5','caio','2026-10-10','pago'),due('6','dani','2026-10-10','isento')];
 const mediums=[{id:'ana',name:'Ana'},{id:'bia',name:'Bia'}] as Medium[];
 assert.equal(pendingDuesThrough(dues,'2026-10-16').length,3);
 assert.deepEqual(summarizeDebtors(dues,mediums,'2026-10-16'),[
  {medium_id:'ana',name:'Ana',due_count:2,amount_cents:10000},
  {medium_id:'bia',name:'Bia',due_count:1,amount_cents:5000},
 ]);
 assert.equal(summarizeDebtors(dues.map(d=>({...d,status:'pago'})),mediums,'2026-10-16').length,0);
});

test('PostgreSQL: responsável e administradores recebem resumo isolado, com rechecagem e sem duplicação',async()=>{
 const db=new PGlite();
 const owner=crypto.randomUUID(),admin=crypto.randomUUID(),member=crypto.randomUUID(),other=crypto.randomUUID();
 const house=crypto.randomUUID(),foreign=crypto.randomUUID(),medium=crypto.randomUUID(),unlinked=crypto.randomUUID(),foreignMedium=crypto.randomUUID();
 const sessions=new Map([owner,admin,member,other].map(id=>[id,crypto.randomUUID()]));
 const asUser=async(id:string)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:sessions.get(id),role:'authenticated'})]);};
 const server=async()=>{await db.exec('reset role;set role service_role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);};
 const claim=async(time='2026-10-16T11:00:00Z')=>(await db.query<{items:DuesSummaryDelivery[]}>('select claim_dues_summaries($1) items',[time])).rows[0].items;
 const summary=async(id:string,h=house,day='2026-10-16',time='2026-10-16T11:01:00Z')=>(await db.query<{item:DuesSummary|null}>('select dues_summary($1,$2,$3,$4) item',[id,h,day,time])).rows[0].item;
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
   create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
   grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;`);
  for(const name of ['001_initial.sql','002_finance.sql','003_username_auth.sql','004_names_registration.sql','005_medium_fields_dues_import.sql','20261013111959_medium_birth_date.sql','20261013112855_medium_sex.sql','20261013153636_birthday_push_notifications.sql','20261014113327_terreiro_memberships.sql','20261014175430_dues_push_notifications.sql','20261016160751_dues_admin_summary.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
  for(const [index,id] of [owner,admin,member,other].entries()){
   await db.query('insert into auth.users values($1,$2,$3)',[id,`${id}@example.com`,{username:`pessoa_${index}`,full_name:`Pessoa ${index}`}]);
   await db.query('insert into auth.sessions values($1,$2,null)',[sessions.get(id),id]);
  }
  await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')",[house,owner,foreign,other]);
  await db.query("insert into mediuns(id,terreiro_id,name) values($1,$2,'Ana'),($3,$2,'Bia sem conta'),($4,$5,'Outra Casa')",[medium,house,unlinked,foreignMedium,foreign]);
  await db.query("insert into terreiro_members(user_id,terreiro_id,role,medium_id) values($1,$2,'usuario',$3),($4,$2,'administrador',null)",[member,house,medium,admin]);
  await db.query(`insert into mensalidades(terreiro_id,medium_id,reference,due_on,amount_cents,status,paid_on) values
   ($1,$2,'2026-10-01','2026-10-16',5000,'pendente',null),($1,$2,'2026-09-01','2026-09-10',5000,'pendente',null),
   ($1,$3,'2026-10-01','2026-10-10',5000,'pendente',null),($1,$3,'2026-11-01','2026-11-10',5000,'pendente',null),
   ($1,$2,'2026-08-01','2026-10-16',5000,'pago','2026-10-15'),($1,$2,'2026-07-01','2026-10-16',0,'isento',null),
   ($4,$5,'2026-10-01','2026-10-16',9000,'pendente',null)`,[house,medium,unlinked,foreign,foreignMedium]);
  const devices=new Map<string,string>();
  for(const id of [owner,admin,member,other]){
   await asUser(id);
   devices.set(id,(await db.query<{id:string}>('select register_dues_push($1,$2,$3) id',[`https://fcm.googleapis.com/fcm/send/${id}`,'B'+'a'.repeat(86),'a'.repeat(22)])).rows[0].id);
  }
  await asUser(owner);await db.query('select set_dues_notifications($1,true)',[house]);
  await asUser(member);await assert.rejects(()=>claim());await assert.rejects(()=>summary(devices.get(owner)!));
  await assert.rejects(()=>db.exec('select * from private_notifications.dues_summary_deliveries'));
  await db.exec('reset role;set role anon');await assert.rejects(()=>claim());
  await server();assert.equal((await claim('2026-10-16T10:59:00Z')).length,0);
  const items=await claim();assert.equal(items.length,2);assert.deepEqual(new Set(items.map(i=>i.id)),new Set([devices.get(owner),devices.get(admin)]));
  assert.equal((await claim('2026-10-16T11:01:00Z')).length,0);assert.equal((await claim('2026-10-16T11:05:00Z')).length,2);
  assert.deepEqual(await summary(devices.get(owner)!),{house_name:'Casa Um',medium_count:2,due_count:3,amount_cents:15000,names:['Ana','Bia sem conta']});
  assert.equal(await summary(devices.get(member)!),null);assert.equal(await summary(devices.get(other)!),null);
  assert.equal(await summary(devices.get(owner)!,foreign),null);assert.equal(await summary(devices.get(owner)!,house,'2026-10-15'),null);
  await asUser(other);await db.query('select set_dues_notifications($1,true)',[foreign]);await server();
  assert.equal(await summary(devices.get(owner)!,foreign),null);
  assert.deepEqual(await summary(devices.get(other)!,foreign),{house_name:'Casa Dois',medium_count:1,due_count:1,amount_cents:9000,names:['Outra Casa']});
  const foreignItems=await claim('2026-10-16T11:06:00Z');assert.equal(foreignItems.length,1);assert.equal(foreignItems[0].terreiro_id,foreign);
  await db.query('select finish_dues_summary($1,$2,$3)',[devices.get(other),foreign,'2026-10-16']);
  await asUser(other);await db.query('select set_dues_notifications($1,false)',[foreign]);await server();
  await db.exec('reset role');await db.query("update mensalidades set status='pago',paid_on='2026-10-16' where terreiro_id=$1 and due_on='2026-10-16' and status='pendente'",[house]);
  await server();assert.equal((await summary(devices.get(owner)!))?.due_count,2);
  await db.exec('reset role');await db.query("update mensalidades set status='isento',amount_cents=0 where medium_id=$1 and due_on='2026-10-10'",[unlinked]);await server();
  assert.equal(await summary(devices.get(owner)!),null); // Sem pendência na data programada, não envia o resumo antigo.
  await db.exec('reset role');await db.query("update mensalidades set status='pendente',paid_on=null where terreiro_id=$1 and reference='2026-10-01' and medium_id=$2",[house,medium]);
  await db.query("update terreiro_members set role='usuario' where user_id=$1",[admin]);await server();assert.equal(await summary(devices.get(admin)!),null);
  await asUser(owner);await db.query('select set_dues_notifications($1,false)',[house]);await server();assert.equal(await summary(devices.get(owner)!),null);
  await asUser(owner);await db.query('select set_dues_notifications($1,true)',[house]);await server();
  await db.query('select finish_dues_summary($1,$2,$3)',[devices.get(owner),house,'2026-10-16']);assert.equal((await claim('2026-10-16T11:10:00Z')).length,0);
  assert.equal((await claim('2026-10-17T11:00:00Z')).length,0);
  assert.equal((await claim('2026-10-22T11:00:00Z')).length,1);assert.equal((await claim('2026-10-22T11:05:00Z')).length,1);assert.equal((await claim('2026-10-22T11:10:00Z')).length,1);assert.equal((await claim('2026-10-22T11:15:00Z')).length,0);
  await db.exec('reset role');await db.query('update auth.sessions set not_after=$1 where id=$2',['2026-10-16T10:00:00Z',sessions.get(owner)]);await server();assert.equal(await summary(devices.get(owner)!),null);
  await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[sessions.get(owner)]);await server();assert.equal(await summary(devices.get(owner)!),null);
 }finally{await db.close();}
});
