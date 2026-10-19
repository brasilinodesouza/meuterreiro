-- O agendador usa UTC: a janela das 11h corresponde às 8h em Brasília.
-- Consulta por minuto para escoar todos os aparelhos em lotes, sem reenviar sucessos.
select cron.schedule('meuterreiro-orixas-8h','* 11 * * *',$orixa_job$
 select net.http_post(
  url:='https://dwqdhuijokjokvhkbzck.supabase.co/functions/v1/orixa-notifications',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='meuterreiro_birthday_cron_token')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000
 );
$orixa_job$);
