import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createAutomaticDuesPush } from '../src/lib/automatic-dues-push';
import { DuesNotifications } from '../src/components/dues-notifications';

test('painel de avisos aparece somente para a administração',()=>{
  const props={houseId:crypto.randomUUID(),userId:crypto.randomUUID()};
  assert.equal(renderToStaticMarkup(createElement(DuesNotifications,props)),'');
  assert.equal(renderToStaticMarkup(createElement(DuesNotifications,{...props,canManage:false})), '');
  const admin=renderToStaticMarkup(createElement(DuesNotifications,{...props,canManage:true}));
  assert.match(admin,/Avisos de mensalidade/);
  assert.match(admin,/Ativar avisos da casa/);
});

test('médium com permissão concedida é registrado automaticamente e sem pedidos duplicados',async()=>{
  let calls=0,finish!:()=>void;
  const automatic=createAutomaticDuesPush({permission:()=> 'granted',enable:async()=>{calls++;await new Promise<void>(resolve=>{finish=resolve;});}});
  const first=automatic.sync();
  await automatic.sync(true);assert.equal(calls,1);
  finish();await first;await automatic.sync();assert.equal(calls,1);
  automatic.stop();
});

test('primeira permissão exige interação; dispensar não provoca novos pedidos na mesma sessão',async()=>{
  let permission:NotificationPermission='default',calls=0;
  const automatic=createAutomaticDuesPush({permission:()=>permission,enable:async()=>{calls++;throw new Error('Permissão não concedida');}});
  await automatic.sync();assert.equal(calls,0);
  await automatic.sync(true);assert.equal(calls,1);
  await automatic.sync(true);await automatic.sync();assert.equal(calls,1);
  permission='denied';await automatic.sync(true);assert.equal(calls,1);
  automatic.stop();
});

test('bloqueio do aparelho é respeitado; liberar no sistema permite o registro automático',async()=>{
  let permission:NotificationPermission='denied',calls=0;
  const automatic=createAutomaticDuesPush({permission:()=>permission,enable:async()=>{calls++;}});
  await automatic.sync();await automatic.sync(true);assert.equal(calls,0);
  permission='granted';await automatic.sync();assert.equal(calls,1);
  automatic.stop();
});

test('falha de conexão permite nova tentativa, mas sair cancela o registro pendente',async()=>{
  let calls=0,receivedSignal:AbortSignal|undefined,finish!:()=>void;
  const automatic=createAutomaticDuesPush({permission:()=> 'granted',enable:async signal=>{
    calls++;
    if(calls===1)throw new Error('Sem conexão');
    receivedSignal=signal;await new Promise<void>(resolve=>{finish=resolve;});
  }});
  await automatic.sync();assert.equal(calls,1);
  const retry=automatic.sync();assert.equal(calls,2);
  automatic.stop();assert.equal(receivedSignal?.aborted,true);
  finish();await retry;await automatic.sync(true);assert.equal(calls,2);
  const anotherUser=createAutomaticDuesPush({permission:()=> 'granted',enable:async()=>{calls++;}});
  await anotherUser.sync();assert.equal(calls,3);anotherUser.stop();
});
