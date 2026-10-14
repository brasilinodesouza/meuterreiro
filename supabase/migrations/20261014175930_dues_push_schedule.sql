-- Infraestrutura/chaves já utilizadas nos avisos de aniversário.
-- 11h UTC = 8h em Brasília; novas tentativas reivindicam somente falhas.
select cron.schedule('meuterreiro-dues-8h','0,5,10 11 * * *',$dues_job$
 select net.http_post(
  url:='https://dwqdhuijokjokvhkbzck.supabase.co/functions/v1/dues-notifications',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='meuterreiro_birthday_cron_token')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000
 );
$dues_job$);
