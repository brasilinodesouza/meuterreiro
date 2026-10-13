import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {isBirthday} from '../src/lib/birthdays';
import {allowedPushEndpoint,birthdayPayload,createBirthdayNotifications,type BirthdayPush} from '../supabase/functions/_shared/birthday-notifications';

test('aniversários ignoram ano e tratam 29/02 sem duplicar em ano bissexto',()=>{
 assert.equal(isBirthday('1980-10-13','2026-10-13'),true);
 assert.equal(isBirthday('1980-10-13','2026-10-12'),false);
 assert.equal(isBirthday(null,'2026-10-13'),false);
 assert.equal(isBirthday('2000-02-29','2027-02-28'),true);
 assert.equal(isBirthday('2000-02-29','2028-02-28'),false);
 assert.equal(isBirthday('2000-02-29','2028-02-29'),true);
 assert.equal(isBirthday('2000-02-29','2100-02-28'),true);
 assert.equal(birthdayPayload(['Maria'],'2026-10-13').tag,'aniversarios-2026-10-13');
 assert.equal(allowedPushEndpoint('https://fcm.googleapis.com/fcm/send/test'),true);
 for(const endpoint of ['http://fcm.googleapis.com/a','https://localhost/a','https://fcm.googleapis.com.evil.example/a','https://user:pass@fcm.googleapis.com/a'])assert.equal(allowedPushEndpoint(endpoint),false);
});

test('handler exige autenticação, isola o teste e remove inscrições expiradas',async()=>{
 const row:BirthdayPush={id:'device',endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:'key',auth_key:'auth',names:['Maria'],day:'2026-10-13'};
 let claims=0,sent=0,finished=0,removed=0,expire=false;
 const handler=createBirthdayNotifications({cronSecret:'cron-secret',origins:['https://meuterreiro.vercel.app']},{
  getUser:async token=>token==='user-token'?'owner':null,
  claim:async()=>{claims++;return[row];},
  find:async(userId,endpoint)=>userId==='owner'&&endpoint===row.endpoint?row:null,
  send:async()=>{if(expire)throw{statusCode:410};sent++;},
  finish:async()=>{finished++;},remove:async()=>{removed++;},health:async()=>true,
 });
 const request=(token='',body:unknown={},origin='https://meuterreiro.vercel.app')=>handler(new Request('https://example/functions/v1/birthday-notifications',{method:'POST',headers:{authorization:`Bearer ${token}`,origin},body:JSON.stringify(body)}));
 assert.equal((await request()).status,401);
 assert.equal((await request('bad')).status,401);
 assert.equal((await request('cron-secret',{},'https://evil.example')).status,403);
 assert.equal((await request('user-token',{})).status,400);
 assert.equal(claims,0);
 assert.equal((await request('user-token',{action:'test',endpoint:row.endpoint+'/other'})).status,404);
 assert.equal((await request('user-token',{action:'test',endpoint:row.endpoint})).status,200);
 assert.equal(finished,0);
 assert.equal((await request('cron-secret')).status,200);
 assert.equal(claims,1);assert.equal(sent,2);assert.equal(finished,1);
 expire=true;
 assert.equal((await request('cron-secret')).status,200);
 assert.equal(removed,1);
});

test('PostgreSQL: dispositivos privados, sessões válidas, horário e entregas sem repetição',async()=>{
 const db=new PGlite();
 const owner1='11111111-1111-4111-8111-111111111111',owner2='22222222-2222-4222-8222-222222222222';
 const session1='33333333-3333-4333-8333-333333333333',session2='44444444-4444-4444-8444-444444444444';
 const house1='55555555-5555-4555-8555-555555555555',house2='66666666-6666-4666-8666-666666666666';
 const claims=(userId:string,sessionId:string)=>JSON.stringify({sub:userId,session_id:sessionId,role:'authenticated'});
 const switchUser=async(userId:string,sessionId:string)=>{await db.exec('reset role;set role authenticated;');await db.query("select set_config('request.jwt.claims',$1,false)",[claims(userId,sessionId)]);};
 const register=(endpoint:string)=>db.query<{id:string}>('select register_birthday_push($1,$2,$3) as id',[endpoint,'B'+'a'.repeat(86),'a'.repeat(22)]);
 const claim=(timestamp:string)=>db.query<{items:BirthdayPush[]}>('select claim_birthday_push($1::timestamptz) as items',[timestamp]);
 try {
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;create function auth.uid() returns uuid language sql as $$ select (auth.jwt()->>'sub')::uuid $$;grant usage on schema auth to authenticated,anon,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;");
  for(const file of ['001_initial.sql','005_medium_fields_dues_import.sql','20261013111959_medium_birth_date.sql']){
   if(file==='005_medium_fields_dues_import.sql')continue;
   await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  }
  await db.exec(await readFile(new URL('../supabase/migrations/20261013153636_birthday_push_notifications.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1),($2)',[owner1,owner2]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[session1,owner1,session2,owner2]);
  await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')",[house1,owner1,house2,owner2]);
  await db.query("insert into mediuns(terreiro_id,name,role,joined_on,birth_date,status) values($1,'Pessoa Fevereiro','Médium','2020-01-01','2000-02-29','ativo'),($1,'Pessoa Desligada','Médium','2020-01-01','1980-02-28','desligado'),($2,'Pessoa Outra Casa','Médium','2020-01-01','1980-02-28','ativo')",[house1,house2]);
  await switchUser(owner1,session1);
  const id1=(await register('https://fcm.googleapis.com/fcm/send/device-one')).rows[0].id;
  assert.equal((await register('https://fcm.googleapis.com/fcm/send/device-one')).rows[0].id,id1);
  await assert.rejects(register('https://localhost/internal'));
  await switchUser(owner2,session2);
  await register('https://fcm.googleapis.com/fcm/send/device-two');
  assert.equal((await db.query('select id from birthday_push_subscriptions')).rows.length,1);
  await assert.rejects(register('https://fcm.googleapis.com/fcm/send/device-one'));
  await assert.rejects(claim('2027-02-28T11:00:00Z'));
  await db.exec('reset role;set role service_role;');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
  assert.equal((await claim('2027-02-28T10:59:00Z')).rows[0].items.length,0);
  const items=(await claim('2027-02-28T11:00:00Z')).rows[0].items;
  assert.equal(items.length,2);
  assert.deepEqual(items.find(item=>item.id===id1)?.names,['Pessoa Fevereiro']);
  assert.equal((await claim('2027-02-28T11:01:00Z')).rows[0].items.length,0);
  await db.query('select finish_birthday_push($1,$2)',[id1,'2027-02-28']);
  assert.equal((await claim('2027-02-28T11:05:00Z')).rows[0].items.some(item=>item.id===id1),false);
  await db.exec('reset role;');
  await db.query('delete from auth.sessions where id=$1',[session1]);
  await db.exec('set role service_role;');
  assert.equal((await claim('2028-02-29T11:00:00Z')).rows[0].items.some(item=>item.id===id1),false);
 }finally{await db.close();}
});
