begin;
alter table public.mediuns add column sex text
  constraint mediuns_sex_valid check (sex in ('masculino', 'feminino'));
notify pgrst, 'reload schema';
commit;
