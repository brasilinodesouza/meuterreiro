import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { canManageHouse, invitationLink, parseInvite } from '../src/lib/memberships';

const migration = '20261014113327_terreiro_memberships.sql';
test('convites validam link/código e perfis de usuário não gerenciam a casa', () => {
  const token = crypto.randomUUID();
  const link = invitationLink('https://meuterreiro.vercel.app', token);
  assert.equal(parseInvite(link), token);
  assert.equal(parseInvite(` ${token} `), token);
  for (const invalid of ['', 'qualquer-coisa', 'https://example.com/', 'https://example.com/#convite=admin']) assert.throws(() => parseInvite(invalid));
  assert.equal(canManageHouse('usuario'), false);
  assert.equal(canManageHouse('administrador'), true);
  assert.equal(canManageHouse('responsavel'), true);
});

test('PostgreSQL: convite, isolamento, promoção, revogação e proteção do responsável', async t => {
  const db = new PGlite();
  const owner = crypto.randomUUID(), otherOwner = crypto.randomUUID(), user = crypto.randomUUID(), second = crypto.randomUUID(), stranger = crypto.randomUUID();
  const house = crypto.randomUUID(), otherHouse = crypto.randomUUID(), medium = crypto.randomUUID(), otherMedium = crypto.randomUUID(), foreignMedium = crypto.randomUUID();
  async function asUser(id: string) { await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`); }
  async function queryValue<T>(sql: string, args: unknown[] = []) { return (await db.query<{ value: T }>(sql, args)).rows[0].value; }
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
    for (const name of ['001_initial.sql','002_finance.sql','003_username_auth.sql','004_names_registration.sql','005_medium_fields_dues_import.sql','20261013111959_medium_birth_date.sql','20261013112855_medium_sex.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    for (const [id, username] of [[owner,'dono_01'],[otherOwner,'dono_02'],[user,'pessoa_1'],[second,'pessoa_2'],[stranger,'pessoa_3']]) {
      await db.query('insert into auth.users values($1,$2,$3)', [id, `${id}@example.com`, { username, full_name: username, role: 'administrador' }]);
    }
    await db.query("insert into terreiros(id,owner_id,name,city,state) values($1,$2,'Casa Um','São Paulo','SP'),($3,$4,'Casa Dois','São Paulo','SP')", [house,owner,otherHouse,otherOwner]);
    for (const [id, houseId, name] of [[medium,house,'Pessoa Um'],[otherMedium,house,'Pessoa Dois'],[foreignMedium,otherHouse,'Outra Casa']]) {
      await db.query('insert into mediuns(id,terreiro_id,name) values($1,$2,$3)', [id,houseId,name]);
    }
    await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
    let token = '';
    await t.test('migração preserva dono e dados; convites não são públicos e só o responsável os gera', async () => {
      await asUser(owner);
      assert.equal((await db.query('select * from terreiros')).rows.length, 1);
      assert.equal((await db.query('select * from mediuns')).rows.length, 2);
      const invite = await queryValue<{token:string}>('select terreiro_create_invite($1) value',[house]); token = invite.token;
      await assert.rejects(() => db.query('select terreiro_create_invite($1)',[otherHouse]));
      await assert.rejects(() => db.exec('select * from private_memberships.invites'));
      await asUser(stranger);
      assert.equal((await db.query('select * from terreiro_members')).rows.length, 0);
      assert.equal((await db.query('select * from terreiros')).rows.length, 0);
      await assert.rejects(() => db.query('select terreiro_create_invite($1)',[house]));
      await assert.rejects(() => db.query('select terreiro_join($1)',[crypto.randomUUID()]));
      await db.exec('reset role;set role anon;');
      await assert.rejects(() => db.query('select terreiro_join($1)',[token]));
      await assert.rejects(() => db.exec('select * from terreiro_members'));
      await assert.rejects(() => db.exec('select * from private_memberships.house_access()'));
      await db.exec("reset role;set role authenticated;select set_config('request.jwt.claim.sub','',false);");
      await assert.rejects(() => db.query('select terreiro_join($1)',[token]));
    });
    await t.test('todo convidado entra como usuário, sem autoatribuição de perfil ou acesso a outra casa', async () => {
      await asUser(user);
      assert.equal(await queryValue('select terreiro_join($1) value',[token]),house);
      assert.equal(await queryValue('select terreiro_join($1) value',[token]),house);
      assert.equal(await queryValue('select role value from terreiro_members'),'usuario');
      assert.equal((await db.query('select * from terreiros')).rows.length,1);
      assert.equal((await db.query('select * from mediuns')).rows.length,0);
      await assert.rejects(() => db.query("insert into terreiro_members(user_id,terreiro_id,role) values($1,$2,'administrador')",[stranger,house]));
      await assert.rejects(() => db.exec("update terreiro_members set role='administrador'"));
      await assert.rejects(() => db.query("select terreiro_set_role($1,$2,'administrador')",[house,user]));
      await assert.rejects(() => db.query('select terreiro_list_users($1)',[house]));
      await assert.rejects(() => db.query('select terreiro_link_medium($1,$2,$3)',[house,user,medium]));
      await assert.rejects(() => db.query("insert into terreiros(owner_id,name,city,state) values($1,'Outra Casa','São Paulo','SP')",[user]));
      await asUser(second); await db.query('select terreiro_join($1)',[token]);
      await asUser(owner); await assert.rejects(() => db.query('select terreiro_join($1)',[token]));
    });
    await t.test('usuário consulta somente seu médium e suas mensalidades; financeiro e cadastros não podem ser alterados', async () => {
      await asUser(owner);
      await db.query('select terreiro_link_medium($1,$2,$3)',[house,user,medium]);
      await assert.rejects(() => db.query('select terreiro_link_medium($1,$2,$3)',[house,user,foreignMedium]));
      await assert.rejects(() => db.query('select terreiro_link_medium($1,$2,$3)',[house,second,medium]));
      await db.query("select finance_create_dues($1,array[$2::uuid,$3::uuid],'2026-10-01','2026-10-20',5000,false)",[house,medium,otherMedium]);
      await db.query("select finance_create_income($1,'Entrada da casa','Doação',1000,'2026-10-14',$2)",[house,crypto.randomUUID()]);
      await db.query("select finance_create_reminder($1,'Compra interna','Outros',null,$2)",[house,crypto.randomUUID()]);
      await asUser(user);
      assert.deepEqual((await db.query('select id from mediuns')).rows,[{id:medium}]);
      assert.deepEqual((await db.query('select medium_id from mensalidades')).rows,[{medium_id:medium}]);
      for (const table of ['caixa','gastos','lembretes']) assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
      assert.equal((await db.query("update mediuns set name='Intruso' returning id")).rows.length,0);
      assert.equal((await db.query("update terreiros set name='Intruso' returning id")).rows.length,0);
      await assert.rejects(() => db.query("insert into mediuns(terreiro_id,name) values($1,'Intruso')",[house]));
      const due = await queryValue<string>('select id value from mensalidades');
      await assert.rejects(() => db.query("select finance_pay_due($1,'2026-10-14')",[due]));
      await assert.rejects(() => db.query("select finance_create_income($1,'Intruso','Doação',1000,'2026-10-14',$2)",[house,crypto.randomUUID()]));
      await assert.rejects(() => db.query('select finance_import_dues($1,$2)',[house,[]]));
    });
    await t.test('promoção libera gestão, mas não transferência do dono nem promoção por outro administrador', async () => {
      await asUser(owner);
      await assert.rejects(() => db.query("select terreiro_set_role($1,$2,'responsavel')",[house,user]));
      await assert.rejects(() => db.query('select terreiro_set_role($1,$2,null)',[house,user]));
      await assert.rejects(() => db.query("select terreiro_set_role($1,$2,'usuario')",[house,owner]));
      await assert.rejects(() => db.query("select terreiro_set_role($1,$2,'administrador')",[house,stranger]));
      await db.query("select terreiro_set_role($1,$2,'administrador')",[house,user]);
      await asUser(user);
      await db.query('select terreiro_join($1)',[token]);
      assert.equal(await queryValue('select role value from terreiro_members where user_id=$1',[user]),'administrador');
      assert.equal((await db.query('select * from mediuns')).rows.length,2);
      assert.equal((await db.query('select * from mensalidades')).rows.length,2);
      assert.equal((await db.query('select * from caixa')).rows.length,1);
      assert.equal((await db.query('select * from terreiro_list_users($1)',[house])).rows.length,3);
      await db.exec("update terreiros set name='Casa Atualizada'");
      await db.query("select finance_create_income($1,'Outra entrada','Doação',2000,'2026-10-14',$2)",[house,crypto.randomUUID()]);
      await db.query('select terreiro_link_medium($1,$2,$3)',[house,second,otherMedium]);
      await assert.rejects(() => db.query('update terreiros set owner_id=$1',[user]));
      await assert.rejects(() => db.query("select terreiro_set_role($1,$2,'administrador')",[house,second]));
      await assert.rejects(() => db.query('select terreiro_create_invite($1)',[house]));
      await assert.rejects(() => db.query("select finance_create_income($1,'Intruso','Doação',1000,'2026-10-14',$2)",[otherHouse,crypto.randomUUID()]));
      await asUser(otherOwner); await assert.rejects(() => db.query("select terreiro_set_role($1,$2,'usuario')",[house,user]));
    });
    await t.test('retirar administração vale imediatamente no banco; usuário mantém só seu vínculo', async () => {
      await asUser(owner); await db.query("select terreiro_set_role($1,$2,'usuario')",[house,user]);
      await asUser(user);
      assert.equal((await db.query('select * from caixa')).rows.length,0);
      assert.equal((await db.query('select * from mediuns')).rows.length,1);
      await assert.rejects(() => db.query("select finance_create_income($1,'Intruso','Doação',1000,'2026-10-14',$2)",[house,crypto.randomUUID()]));
      await assert.rejects(() => db.query('select terreiro_list_users($1)',[house]));
      await asUser(owner); await db.query('select terreiro_link_medium($1,$2,null)',[house,user]);
      await asUser(user);
      assert.equal((await db.query('select * from mensalidades')).rows.length,0);
      assert.equal((await db.query('select * from mediuns')).rows.length,0);
    });
    await t.test('novo convite invalida o antigo, expiração bloqueia adesão e vínculo existente não é transferido', async () => {
      await asUser(owner);
      const next = await queryValue<{token:string}>('select terreiro_create_invite($1) value',[house]);
      await asUser(stranger); await assert.rejects(() => db.query('select terreiro_join($1)',[token]));
      await db.query('select terreiro_join($1)',[next.token]);
      await asUser(otherOwner);
      const foreign = await queryValue<{token:string}>('select terreiro_create_invite($1) value',[otherHouse]);
      await asUser(stranger); await assert.rejects(() => db.query('select terreiro_join($1)',[foreign.token]));
      await db.exec("reset role;update private_memberships.invites set expires_at=now()-interval '1 second';");
      await asUser(user); await assert.rejects(() => db.query('select terreiro_join($1)',[next.token]));
      assert.equal(await queryValue('select terreiro_id value from terreiro_members where user_id=$1',[user]),house);
    });
  } finally { await db.close(); }
});
