import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberUpdater, startMemberUpdates } from '../src/lib/member-updates';

test('mensalidade criada, pagamento e exclusão chegam à consulta sem recarregar a página', async () => {
  let saved: { id:string;status:string;payment_method:string|null }[]=[];
  let shown=structuredClone(saved);
  const updater=createMemberUpdater({read:async()=>structuredClone(saved),onData:data=>{shown=data;},onError:()=>assert.fail('Consulta deveria funcionar'),canCheck:()=>true});
  await updater.check();assert.equal(shown.length,0);
  saved=[{id:'mensalidade',status:'pendente',payment_method:null}];
  await updater.check();assert.equal(shown[0].status,'pendente');
  saved=[{id:'mensalidade',status:'pago',payment_method:'pix'}];
  await updater.check();assert.equal(shown[0].status,'pago');assert.equal(shown[0].payment_method,'pix');
  saved=[];await updater.check();assert.deepEqual(shown,[]);
});

test('consultas concorrentes não duplicam pedidos e respostas após sair são descartadas', async () => {
  let finish!:(data:string[])=>void;let requests=0;let changes=0;
  const updater=createMemberUpdater({read:()=>{requests++;return new Promise<string[]>(resolve=>{finish=resolve;});},onData:()=>{changes++;},onError:()=>assert.fail('Sem erro'),canCheck:()=>true});
  const first=updater.check();await updater.check();assert.equal(requests,1);
  updater.stop();finish(['mensalidade']);await first;await updater.check();
  assert.equal(changes,0);assert.equal(requests,1);
});

test('falha mantém a consulta anterior e a próxima tentativa atualiza os dados', async () => {
  let offline=true;let errors=0;let shown=['mensalidade anterior'];
  const updater=createMemberUpdater({read:async()=>{if(offline)throw new Error('Sem conexão');return ['mensalidade nova'];},onData:data=>{shown=data;},onError:()=>{errors++;},canCheck:()=>true});
  await updater.check();assert.equal(errors,1);assert.deepEqual(shown,['mensalidade anterior']);
  offline=false;await updater.check();assert.deepEqual(shown,['mensalidade nova']);
});

test('erro após desmontar a tela não deixa um aviso na próxima conta', async () => {
  let reject!:(error:Error)=>void;let errors=0;
  const updater=createMemberUpdater({read:()=>new Promise<null>((_,fail)=>{reject=fail;}),onData:()=>assert.fail('Sem resposta'),onError:()=>{errors++;},canCheck:()=>true});
  const pending=updater.check();updater.stop();reject(new Error('Falha'));await pending;
  assert.equal(errors,0);
});

test('intervalo, foco, retorno e conexão atualizam somente a tela visível e param na saída', async () => {
  const browser=new EventTarget(),page=Object.assign(new EventTarget(),{visibilityState:'visible'}),network={onLine:true};
  let interval:()=>void=()=>{};let delay=0;let cleared=false;let requests=0;
  const fakeWindow=Object.assign(browser,{setInterval:(callback:()=>void,ms:number)=>{interval=callback;delay=ms;return 7;},clearInterval:(id:number)=>{assert.equal(id,7);cleared=true;}});
  const originals=new Map(['window','document','navigator'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries({window:fakeWindow,document:page,navigator:network})) Object.defineProperty(globalThis,key,{value,configurable:true});
  const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
  let stop:()=>void=()=>{};
  try {
    stop=startMemberUpdates({read:async()=>{requests++;return [];},onData:()=>{},onError:()=>assert.fail('Sem erro')});
    await flush();assert.equal(requests,1);assert.equal(delay,15000);
    interval();await flush();assert.equal(requests,2);
    browser.dispatchEvent(new Event('focus'));await flush();assert.equal(requests,3);
    page.visibilityState='hidden';interval();browser.dispatchEvent(new Event('focus'));await flush();assert.equal(requests,3);
    page.visibilityState='visible';page.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(requests,4);
    network.onLine=false;interval();await flush();assert.equal(requests,4);
    network.onLine=true;browser.dispatchEvent(new Event('online'));await flush();assert.equal(requests,5);
    browser.dispatchEvent(new Event('pageshow'));await flush();assert.equal(requests,6);
    stop();assert.equal(cleared,true);
    interval();browser.dispatchEvent(new Event('focus'));page.dispatchEvent(new Event('visibilitychange'));browser.dispatchEvent(new Event('online'));await flush();assert.equal(requests,6);
  } finally {
    stop();
    for(const [key,descriptor] of originals) {
      if(descriptor) Object.defineProperty(globalThis,key,descriptor);
      else Reflect.deleteProperty(globalThis,key);
    }
  }
});
