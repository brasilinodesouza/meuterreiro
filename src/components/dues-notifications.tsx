'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { currentBirthdaySubscription, supportsBirthdayPush } from '@/lib/birthday-push';
import { disableDuesPush, enableDuesPush, loadDuesNotifications, setDuesNotifications, testDuesPush } from '@/lib/dues-push';

const subscribeSupport = () => () => {};
export function DuesNotifications({houseId,userId,canManage=false}:{houseId:string;userId:string;canManage?:boolean}) {
  const supported = useSyncExternalStore(subscribeSupport,supportsBirthdayPush,()=>false);
  const [enabled,setEnabled] = useState<boolean|null>(null);
  const [device,setDevice] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  useEffect(()=>{
    let alive=true;
    void (async()=>{
      const active=await loadDuesNotifications(houseId);
      let registered=false;
      if(supported && supabase) {
        const subscription=await currentBirthdaySubscription();
        if(subscription) {
          const result=await supabase.from('dues_push_subscriptions').select('id').eq('user_id',userId).eq('endpoint',subscription.endpoint).maybeSingle();
          if(result.error) throw new Error('Não foi possível consultar os avisos deste aparelho.');
          registered=Boolean(result.data);
        }
      }
      if(alive){setEnabled(active);setDevice(registered);}
    })().catch(err=>{if(alive)setError(err instanceof Error?err.message:'Não foi possível consultar os avisos.');});
    return()=>{alive=false;};
  },[houseId,userId,supported]);
  async function act(action:'house'|'device'|'test') {
    if(busy || enabled===null)return;
    setBusy(true);setError('');setMessage('');
    try {
      if(action==='house' && canManage){await setDuesNotifications(houseId,!enabled);setEnabled(!enabled);setMessage(enabled?'Avisos automáticos desativados para a casa.':'Avisos automáticos ativados para a casa.');}
      if(action==='device'){
        if(device)await disableDuesPush();else await enableDuesPush();
        setDevice(!device);setMessage(device?'Recebimento desativado neste aparelho.':'Este aparelho está pronto para receber os avisos.');
      }
      if(action==='test'){await testDuesPush();setMessage('Teste enviado. Confira as notificações do celular.');}
    }catch(err){setError(err instanceof Error?err.message:'Não foi possível alterar os avisos.');}
    finally{setBusy(false);}
  }
  return <section className="panel settings-panel birthday-settings"><span className="stat-icon"><Bell /></span><h2>Avisos de mensalidade</h2>
    <p>Aviso às <strong>8h, no horário de Brasília</strong>, no dia do vencimento e seis dias depois se a mensalidade continuar pendente. Exemplo: vence dia 10; novo aviso dia 16, se não houver pagamento registrado até dia 15.</p>
    <p>Mensalidades pagas ou isentas não geram avisos. Cada médium recebe apenas avisos das próprias mensalidades, com a conta associada ao seu cadastro.</p>
    <p role="status">{enabled===null?'Consultando configuração…':enabled?'Avisos automáticos ativados para a casa.':'Avisos automáticos desativados para a casa.'}</p>
    {canManage && <button type="button" className={`button ${enabled?'secondary':'primary'}`} disabled={busy || enabled===null} onClick={()=>void act('house')}>{busy?'Aguarde…':enabled?'Desativar avisos da casa':'Ativar avisos da casa'}</button>}
    {!canManage && <p>Somente a administração pode ativar ou desativar os avisos automáticos da casa.</p>}
    {supported?<><p>{device?'Recebimento permitido neste aparelho.':'Permita notificações neste aparelho para receber os avisos, mesmo com o app fechado.'}</p><div className="birthday-actions"><button type="button" className="button secondary" disabled={busy || enabled===null} onClick={()=>void act('device')}>{device?'Parar de receber neste aparelho':'Permitir avisos neste aparelho'}</button>{device && <button type="button" className="button secondary" disabled={busy} onClick={()=>void act('test')}>Enviar teste</button>}</div></>:<p>Abra o aplicativo instalado em um navegador compatível com notificações para receber os avisos.</p>}
    {message && <p className="alert success" role="status">{message}</p>}{error && <p className="alert error" role="alert">{error}</p>}
  </section>;
}
