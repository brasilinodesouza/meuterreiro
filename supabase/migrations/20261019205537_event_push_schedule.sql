-- 11h UTC corresponde às 8h de Brasília. A fila escoa em lotes e só repete falhas.
select cron.schedule('meuterreiro-events-8h','* 11 * * *',$event_job$
 select net.http_post(
  url:='https://dwqdhuijokjokvhkbzck.supabase.co/functions/v1/event-notifications',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='meuterreiro_birthday_cron_token')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000
 );
$event_job$);
