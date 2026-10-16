import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createDuesNotifications,duesPayload,type DuesDelivery} from '../supabase/functions/_shared/dues-notifications';

test('avisos descrevem vencimento e pagamento ausente; autenticação, rechecagem e falhas',async()=>{
 const item:DuesDelivery={id:'device',due_id:'due',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'key',auth_key:'auth',reference:'2026-10-01',due_on:'2026-10-10',amount_cents:5000,kind:'today',day:'2026-10-10'};
 assert.match(duesPayload(item).body,/vence hoje/);
 assert.match(duesPayload({...item,kind:'overdue'}).body,/Não identificamos o pagamento/);
 let claims=0,sent=0,finished=0,removed=0,pending=true,fail=0;
 const handler=createDuesNotifications({cronSecret:'secret',origins:['https://meuterreiro.vercel.app']},{
  getUser:async token=>token==='user'?'member':null,claim:async()=>{claims++;return[item];},pending:async()=>pending,
  find:async(userId,endpoint)=>userId==='member'&&endpoint===item.endpoint?item:null,
  send:async()=>{if(fail)throw{statusCode:fail};sent++;},finish:async()=>{finished++;},remove:async()=>{removed++;},
  claimSummaries:async()=>[],summary:async()=>null,finishSummary:async()=>{},
 });
 const request=(token='',body:unknown={},origin='https://meuterreiro.vercel.app')=>handler(new Request('https://example.com',{method:'POST',headers:{authorization:`Bearer ${token}`,origin},body:JSON.stringify(body)}));
 assert.equal((await request()).status,401);assert.equal((await request('bad')).status,401);
 assert.equal((await request('secret',{},'https://evil.example')).status,403);
 assert.equal((await request('user')).status,400);assert.equal(claims,0);
 assert.equal((await request('user',{action:'test',endpoint:item.endpoint+'/other'})).status,404);
 assert.equal((await request('user',{action:'test',endpoint:item.endpoint})).status,200);
 assert.equal(finished,0);
 pending=false;const skipped=await request('secret');assert.equal((await skipped.json()).skipped,1);assert.equal(sent,1);
 pending=true;assert.equal((await request('secret')).status,200);assert.equal(finished,1);
 fail=503;assert.equal((await request('secret')).status,503);assert.equal(finished,1);
 fail=410;assert.equal((await request('secret')).status,200);assert.equal(removed,1);
});

test('PostgreSQL: só administração configura; avisa dia 10/16, ignora pagos/isentos e isola contas',async()=>{
 const db=new PGlite();
 const owner=crypto.randomUUID(),admin=crypto.randomUUID(),member=crypto.randomUUID(),other=crypto.randomUUID();
 const house=crypto.randomUUID(),foreign=crypto.randomUUID(),medium=crypto.randomUUID(),foreignMedium=crypto.randomUUID();
 const session=crypto.randomUUID(),otherSession=crypto.randomUUID();
 const asUser=async(id:string,sid=session)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,session_id:sid,role:'authenticated'})]);};
 const server=async()=>{await db.exec('reset role;set role service_role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);};
 const claim=async(day:string)=> (await db.query<{items:DuesDelivery[]}>('select claim_dues_push($1) items',[day])).rows[0].items;
 const register=async(endpoint:string)=>(await db.query<{id:string}>('select register_dues_push($1,$2,$3) id',[endpoint,'B'+'a'.repeat(86),'a'.repeat(22)])).rows[0].id;
 const endpoint='https://fcm.googleapis.com/fcm/send/device-one';
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
   create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
   create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
   grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;`);
  for(const name of ['001_initial.sql','002_finance.sql','003_username_auth.sql','004_names_registration.sql','005_medium_fields_dues_import.sql','20261013111959_medium_birth_date.sql','20261013112855_medium_sex.sql','20261013153636_birthday_push_notifications.sql','20261014113327_terreiro_memberships.sql','20261014175430_dues_push_notifications.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
  for(const [id,name] of [[owner,'dono_01'],[admin,'admin_01'],[member,'medium_01'],[other,'medium_02']])await db.query('insert into auth.users values($1,$2,$3)',[id,`${id}@example.com`,{username:name,full_name:name,role:'administrador'}]);
  await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')",[house,owner,foreign,other]);
  await db.query("insert into mediuns(id,terreiro_id,name) values($1,$2,'Pessoa Um'),($3,$4,'Outra Casa')",[medium,house,foreignMedium,foreign]);
  await db.query("insert into terreiro_members(user_id,terreiro_id,role,medium_id) values($1,$2,'usuario',$3),($4,$2,'administrador',null)",[member,house,medium,admin]);
  await db.query('insert into auth.sessions values($1,$2,null),($3,$4,null)',[session,member,otherSession,admin]);
  await db.query("insert into mensalidades(terreiro_id,medium_id,reference,due_on,amount_cents,status,paid_on) values($1,$2,'2026-10-01','2026-10-10',5000,'pendente',null),($1,$2,'2026-09-01','2026-10-10',5000,'pago','2026-10-09'),($1,$2,'2026-08-01','2026-10-10',0,'isento',null),($3,$4,'2026-10-01','2026-10-10',5000,'pendente',null)",[house,medium,foreign,foreignMedium]);
  await asUser(member);const id=await register(endpoint);assert.equal(await register(endpoint),id);
  await assert.rejects(()=>register('https://localhost/internal'));
  await assert.rejects(()=>db.query('select set_dues_notifications($1,true)',[house]));
  await assert.rejects(()=>db.query('insert into dues_notification_settings values($1,true)',[house]));
  await assert.rejects(()=>claim('2026-10-10T11:00:00Z'));
  await server();assert.equal((await claim('2026-10-10T11:00:00Z')).length,0);
  await asUser(admin,otherSession);await db.query('select set_dues_notifications($1,true)',[house]);
  await assert.rejects(()=>db.query('select set_dues_notifications($1,true)',[foreign]));
  await assert.rejects(()=>register(endpoint));assert.equal((await db.query('select * from dues_push_subscriptions')).rows.length,0);
  await server();assert.equal((await claim('2026-10-10T10:59:00Z')).length,0);
  const items=await claim('2026-10-10T11:00:00Z');assert.equal(items.length,1);assert.equal(items[0].kind,'today');assert.equal(items[0].id,id);
  assert.equal((await claim('2026-10-10T11:01:00Z')).length,0);
  const retry=await claim('2026-10-10T11:05:00Z');assert.equal(retry.length,1);
  await db.query('select finish_dues_push($1,$2,$3,$4)',[id,items[0].due_id,'today','2026-10-10']);
  assert.equal((await claim('2026-10-10T11:10:00Z')).length,0);
  assert.equal((await claim('2026-10-15T11:00:00Z')).length,0);
  const late=await claim('2026-10-16T11:00:00Z');assert.equal(late.length,1);assert.equal(late[0].kind,'overdue');
  const isPending=async()=> (await db.query<{pending:boolean}>('select dues_push_is_pending($1,$2,$3,$4,$5) pending',[id,late[0].due_id,'overdue','2026-10-16','2026-10-16T11:01:00Z'])).rows[0].pending;
  assert.equal(await isPending(),true);
  await db.exec('reset role');await db.query("update mensalidades set status='pago',paid_on='2026-10-15' where id=$1",[late[0].due_id]);await server();
  assert.equal(await isPending(),false);assert.equal((await claim('2026-10-16T11:05:00Z')).length,0);
  await db.exec('reset role');await db.query("update mensalidades set status='pendente',paid_on=null where id=$1",[late[0].due_id]);
  await asUser(owner);await db.query('select set_dues_notifications($1,false)',[house]);await server();assert.equal(await isPending(),false);
  await asUser(owner);await db.query('select set_dues_notifications($1,true)',[house]);await server();
  await db.query('select finish_dues_push($1,$2,$3,$4)',[id,late[0].due_id,'overdue','2026-10-16']);
  assert.equal((await claim('2026-10-16T11:10:00Z')).length,0);assert.equal((await claim('2026-10-17T11:00:00Z')).length,0);
  await db.exec('reset role');
  await db.query("insert into mensalidades(terreiro_id,medium_id,reference,due_on,amount_cents,status) values($1,$2,'2026-11-01','2026-11-30',5000,'pendente')",[house,medium]);
  await server();assert.equal((await claim('2026-12-05T11:00:00Z')).length,0);
  const december=await claim('2026-12-06T11:00:00Z');assert.equal(december.length,1);assert.equal(december[0].kind,'overdue');
  assert.equal((await claim('2026-12-06T11:05:00Z')).length,1);assert.equal((await claim('2026-12-06T11:10:00Z')).length,1);
  assert.equal((await claim('2026-12-06T11:15:00Z')).length,0);
  await db.exec('reset role');await db.query("update terreiro_members set role='usuario' where user_id=$1",[admin]);
  await asUser(admin,otherSession);await assert.rejects(()=>db.query('select set_dues_notifications($1,false)',[house]));
  await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[session]);await server();assert.equal(await isPending(),false);
  await asUser(member);await assert.rejects(()=>db.exec('select * from private_notifications.dues_deliveries'));
 }finally{await db.close();}
});
