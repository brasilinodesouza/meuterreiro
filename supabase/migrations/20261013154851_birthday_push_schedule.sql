create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- pg_cron usa UTC: 11h UTC = 8h em Brasília. Novas tentativas só reenviam falhas.
select cron.schedule('meuterreiro-birthdays-8h','0,5,10 11 * * *',$birthday_job$
 select net.http_post(
  url:='https://dwqdhuijokjokvhkbzck.supabase.co/functions/v1/birthday-notifications',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='meuterreiro_birthday_cron_token')),
  body:='{}'::jsonb,
  timeout_milliseconds:=60000
 );
$birthday_job$);
