'use client';
import {useEffect,useState,useSyncExternalStore} from 'react';
import {Bell,Cake} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {currentBirthdaySubscription,disableBirthdayPush,enableBirthdayPush,supportsBirthdayPush,testBirthdayPush} from '@/lib/birthday-push';
import {birthdaysToday} from '@/lib/birthdays';
import type {Medium} from '@/lib/data';

const subscribeSupport=()=>()=>{};
export function BirthdayNotifications({userId}:{userId:string}) {
  const supported=useSyncExternalStore(subscribeSupport,supportsBirthdayPush,()=>false);
  const [enabled,setEnabled]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!supported || !supabase)return;
    let alive=true;
    void currentBirthdaySubscription().then(async subscription=>{
      if(!subscription)return;
      const {data,error}=await supabase!.from('birthday_push_subscriptions').select('id').eq('user_id',userId).eq('endpoint',subscription.endpoint).maybeSingle();
      if(alive){setEnabled(Boolean(data));if(error)setError('Não foi possível consultar os avisos. Tente novamente.');}
    }).catch(()=>{if(alive)setError('Não foi possível consultar as notificações deste aparelho.');});
    return()=>{alive=false;};
  },[supported,userId]);
  async function change(enable:boolean) {
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try {
      if(enable){await enableBirthdayPush();setEnabled(true);setMessage('Avisos ativados neste aparelho, às 8h. Envie um teste para confirmar.');}
      else {await disableBirthdayPush();setEnabled(false);setMessage('Avisos desativados neste aparelho.');}
    }catch(err){setError(err instanceof Error?err.message:'Não foi possível alterar os avisos.');}
    finally{setBusy(false);}
  }
  async function test() {
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{await testBirthdayPush();setMessage('Teste enviado. Confira as notificações do celular.');}
    catch(err){setError(err instanceof Error?err.message:'Não foi possível enviar o teste.');}
    finally{setBusy(false);}
  }
  return <section className="panel settings-panel birthday-settings"><span className="stat-icon"><Bell /></span><h2>Avisos de aniversário</h2>
    <p>Receba às <strong>8h, no horário de Brasília</strong>, quem faz aniversário na sua casa, mesmo com o app fechado.</p>
    <p>Consideramos os médiuns ativos e afastados pela data de nascimento. Para 29/02, o aviso será em 28/02 nos anos sem essa data.</p>
    {supported?<><p className="birthday-notification-state">{enabled?'Ativados neste aparelho.':'Desativados neste aparelho.'}</p><div className="birthday-actions"><button type="button" className={`button ${enabled?'secondary':'primary'}`} disabled={busy} onClick={()=>void change(!enabled)}>{busy?'Aguarde…':enabled?'Desativar avisos':'Ativar avisos neste aparelho'}</button>{enabled&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void test()}>Enviar teste</button>}</div></>:<p>Abra o app instalado em um navegador compatível e permita notificações para ativar os avisos.</p>}
    {message&&<p className="alert success" role="status">{message}</p>}{error&&<p className="alert error" role="alert">{error}</p>}
  </section>;
}

export function BirthdayPanel({mediums,onOpen}:{mediums:Medium[];onOpen:(medium:Medium)=>void}) {
  const people=birthdaysToday(mediums);
  if(!people.length)return null;
  return <section className="panel birthday-today"><div className="panel-heading"><div><h2><Cake size={19}/> Aniversariantes de hoje</h2><p>Um dia para celebrar quem caminha com a casa.</p></div></div><div className="people-list">{people.map(person=><button type="button" className="person-row" key={person.id} onClick={()=>onOpen(person)}><strong>{person.name}</strong><span className="text-button">Ver perfil</span></button>)}</div></section>;
}
