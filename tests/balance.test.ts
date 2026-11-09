import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFinance,emptyFinance,parseBalance,summarize} from '../src/lib/finance';
test('saldo conciliado não é somado duas vezes nem altera entradas e saídas',()=>{
  const state=applyFinance(emptyFinance(),{type:'income',description:'Doação',category:'Doação',amount_cents:10000,occurred_on:'2026-11-01',request_id:'one'},'house',[]);
  const next=applyFinance(state,{type:'set_balance',amount_cents:813879,expected_balance:10000},'house',[]);
  assert.equal(summarize(next).balance,813879);
  assert.equal(summarize(next,'2026-11').incoming,10000);
  assert.deepEqual(next.ledger,state.ledger);
  const later=applyFinance(next,{type:'income',description:'Doação',category:'Doação',amount_cents:5000,occurred_on:'2026-11-09',request_id:'two'},'house',[]);
  assert.equal(summarize(later).balance,818879);
  assert.throws(()=>applyFinance(later,{type:'set_balance',amount_cents:0,expected_balance:813879},'house',[]),/saldo mudou/);
});
test('edição aceita saldo zero, negativo e valores brasileiros',()=>{
  assert.equal(parseBalance('8.138,79'),813879);
  assert.equal(parseBalance('0,00'),0);
  assert.equal(parseBalance('-100,50'),-10050);
  for(const value of ['abc','8.138,799','Infinity'])assert.throws(()=>parseBalance(value));
});
test('pendências seguem referência selecionada e excluem pagas e isentas',()=>{
  const state=applyFinance(emptyFinance(),{type:'dues',medium_ids:['m'],reference:'2026-11-01',due_on:'2026-11-10',amount_cents:10000,exempt:false,through_year_end:true},'house',['m']);
  assert.equal(summarize(state,'2026-11').pending,10000);
  assert.equal(summarize(state,'2026-11').pendingCount,1);
  assert.equal(summarize(state).pending,20000);
  const paid=applyFinance(state,{type:'pay',due_id:state.dues[0].id,paid_on:'2026-10-31',payment_method:'pix'},'house',['m']);
  assert.equal(summarize(paid,'2026-11').pending,0);
  assert.equal(summarize(paid,'2026-12').pending,10000);
});
