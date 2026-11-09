alter table public.gastos add column notes text not null default '' check (char_length(notes) <= 2000);
notify pgrst,'reload schema';
