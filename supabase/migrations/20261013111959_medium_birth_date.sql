begin;
alter table public.mediuns add column birth_date date;
alter table public.mediuns add constraint mediuns_birth_date_valid
  check (birth_date is null or birth_date between date '0001-01-01' and (current_timestamp at time zone 'America/Sao_Paulo')::date);
notify pgrst, 'reload schema';
commit;
