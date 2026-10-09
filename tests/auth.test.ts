import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCredentials, parseNewPassword, parseSignup, signInWithUsername } from '../src/lib/auth';
import { createUsernameLogin } from '../supabase/functions/_shared/username-login';

test('usuário e senha aceitam os limites 6 e 20, normalizam só o usuário e recusam fora deles',()=>{
  for(const length of [6,20])assert.deepEqual(parseCredentials({username:'A'.repeat(length),password:' '.repeat(length)}),{username:'a'.repeat(length),password:' '.repeat(length)});
  for(const length of [0,5,21]){
    assert.throws(()=>parseCredentials({username:'a'.repeat(length),password:'abcdef'}));
    assert.throws(()=>parseCredentials({username:'abcdef',password:'a'.repeat(length)}));
  }
  assert.equal(parseCredentials({username:'  Pessoa_123  ',password:' Senha '} ).username,'pessoa_123');
  for(const username of ['pessoa teste','pessoa@teste','pessoaç'])assert.throws(()=>parseCredentials({username,password:'123456'}));
});
test('cadastro e recuperação exigem confirmação da senha e cadastro exige e-mail válido',()=>{
  const account={username:'pessoa_1',password:'Senha1',confirm_password:'Senha1',email:'teste@example.com'};
  assert.equal(parseSignup(account).email,account.email);
  assert.throws(()=>parseSignup({...account,email:'inválido'}));
  assert.throws(()=>parseSignup({...account,confirm_password:'senha1'}));
  assert.throws(()=>parseNewPassword({password:'123456',confirm_password:'123457'}));
  assert.equal(parseNewPassword({password:'123456',confirm_password:'123456'}),'123456');
});
test('cliente autentica por função de usuário e inicia somente uma sessão válida',async()=>{
  let body:unknown;let session:unknown;
  const client={functions:{invoke:async(name:string,args:{body:unknown})=>{assert.equal(name,'username-login');body=args.body;return{data:{access_token:'access',refresh_token:'refresh'},error:null};}},auth:{setSession:async(tokens:unknown)=>{session=tokens;return{data:{user:{id:'user'}},error:null};}}} as unknown as SupabaseClient;
  await signInWithUsername(client,{username:'Pessoa_1',password:'Senha1'});
  assert.deepEqual(body,{username:'pessoa_1',password:'Senha1'});assert.deepEqual(session,{access_token:'access',refresh_token:'refresh'});
  const invalid={...client,functions:{invoke:async()=>({data:{email:'should-not-be-returned'},error:null})}} as unknown as SupabaseClient;
  await assert.rejects(()=>signInWithUsername(invalid,{username:'pessoa_1',password:'Senha1'}));
});

const origin='https://app.example.com';
function request(body:unknown,from=origin){return new Request('https://supabase.example.com/functions/v1/username-login',{method:'POST',headers:{origin:from,'Content-Type':'application/json'},body:JSON.stringify(body)});}
function handler(fetcher:typeof fetch){return createUsernameLogin({url:'https://supabase.example.com',publicKey:'public-test-key',serviceKey:'server-test-key',origins:[origin],fetcher});}
test('função valida origem, tamanho e credenciais antes de acessar qualquer serviço',async()=>{
  let requests=0;const login=handler(async()=>{requests++;throw new Error('unexpected');});
  assert.equal((await login(request({username:'pessoa_1',password:'Senha1'},'https://other.example.com'))).status,403);
  assert.equal((await login(request({username:'curto',password:'Senha1'}))).status,400);
  assert.equal((await login(request({username:'pessoa_1',password:'a'.repeat(21)}))).status,400);
  assert.equal((await login(request({username:'pessoa_1',password:'Senha1',extra:'a'.repeat(4100)}))).status,400);
  const options=await login(new Request('https://example.com',{method:'OPTIONS',headers:{origin}}));
  assert.equal(options.status,204);assert.equal(options.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(requests,0);
});
test('função entrega apenas tokens, usa chave pública no Auth e nunca expõe e-mail ou chave administrativa',async()=>{
  const login=handler(async(url,options)=>{
    const target=String(url);
    if(target.endsWith('auth_take_login_attempt'))return Response.json(true);
    if(target.endsWith('auth_email_for_username'))return Response.json('private@example.com');
    assert.equal((options!.headers as Record<string,string>).apikey,'public-test-key');
    assert.deepEqual(JSON.parse(String(options!.body)),{email:'private@example.com',password:'Senha1'});
    return Response.json({access_token:'access',refresh_token:'refresh',user:{email:'private@example.com'}});
  });
  const result=await login(request({username:'Pessoa_1',password:'Senha1'}));
  assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'no-store');assert.deepEqual(await result.json(),{access_token:'access',refresh_token:'refresh'});
});
test('usuário ausente e senha errada retornam o mesmo erro; limite e falha do banco bloqueiam o login',async()=>{
  const errors=[];
  for(const email of [null,'private@example.com']){
    const login=handler(async url=>String(url).endsWith('auth_take_login_attempt')?Response.json(true):String(url).endsWith('auth_email_for_username')?Response.json(email):Response.json({error:'Invalid credentials'},{status:400}));
    const result=await login(request({username:'pessoa_1',password:'errada'}));assert.equal(result.status,401);errors.push(await result.text());
  }
  assert.equal(errors[0],errors[1]);
  assert.equal((await handler(async()=>Response.json(false))(request({username:'pessoa_1',password:'Senha1'}))).status,429);
  assert.equal((await handler(async()=>{throw new Error('private database detail');})(request({username:'pessoa_1',password:'Senha1'}))).status,503);
});
test('PostgreSQL: usuário único, cadastro atômico, privacidade e limites do login',async t=>{
  const db=new PGlite();const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    for(const name of ['001_initial.sql','002_finance.sql','003_username_auth.sql'])await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
    await t.test('normaliza o usuário e impede duplicação ou cadastro inválido sem deixar conta parcial',async()=>{
      await db.query("insert into auth.users values($1,'first@example.com',$2)",[first,{username:'Pessoa_1'}]);
      await assert.rejects(()=>db.query("insert into auth.users values($1,'second@example.com',$2)",[second,{username:'PESSOA_1'}]));
      for(const username of ['abcde','a'.repeat(21),'com espaço'])await assert.rejects(()=>db.query("insert into auth.users values($1,'second@example.com',$2)",[second,{username}]));
      assert.equal((await db.query('select * from auth.users')).rows.length,1);
      await db.query("insert into auth.users values($1,'second@example.com',$2)",[second,{username:'pessoa_2'}]);
    });
    await t.test('uma conta só lê seu usuário e não altera identificadores ou resolve e-mails',async()=>{
      await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${first}',false);`);
      assert.deepEqual((await db.query('select username from account_usernames')).rows,[{username:'pessoa_1'}]);
      await assert.rejects(()=>db.exec("update account_usernames set username='pessoa_3'"));
      await assert.rejects(()=>db.exec("select auth_email_for_username('pessoa_2')"));
      await db.exec('reset role;set role anon;');
      await assert.rejects(()=>db.exec('select * from account_usernames'));
      await assert.rejects(()=>db.exec("select auth_take_login_attempt(array['u:'||repeat('a',64)])"));
      await db.exec('reset role;set role service_role;');
      assert.equal((await db.query<{email:string}>("select auth_email_for_username('pessoa_1') as email")).rows[0].email,'first@example.com');
    });
    await t.test('limite é persistente, independente entre usuários e expira na janela seguinte',async()=>{
      const key='u:'+'a'.repeat(64),other='u:'+'b'.repeat(64);
      for(let i=0;i<12;i++)assert.equal((await db.query<{allowed:boolean}>('select auth_take_login_attempt($1) allowed',[[key]])).rows[0].allowed,true);
      assert.equal((await db.query<{allowed:boolean}>('select auth_take_login_attempt($1) allowed',[[key]])).rows[0].allowed,false);
      assert.equal((await db.query<{allowed:boolean}>('select auth_take_login_attempt($1) allowed',[[other]])).rows[0].allowed,true);
      await db.exec("reset role;update private_auth.login_limits set window_start=now()-interval '16 minutes';set role service_role;");
      assert.equal((await db.query<{allowed:boolean}>('select auth_take_login_attempt($1) allowed',[[key]])).rows[0].allowed,true);
      await assert.rejects(()=>db.exec("select auth_take_login_attempt(array['invalid'])"));
    });
  }finally{await db.close();}
});
