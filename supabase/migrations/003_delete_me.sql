-- NovaCore 003: „Ištrinti mano duomenis" (Google Play reikalauja, kad programėlėje sukurtą paskyrą būtų galima ištrinti).
-- Paleisti vieną kartą po 001 ir 002: Supabase → SQL Editor → įklijuoti → Run. Galima paleisti pakartotinai.
-- Ištrina tik kvietėjo duomenis: jo sukurtas kompanijas (su narystėmis ir dvikovomis – on delete cascade), dvikovas,
-- profilį (su žaidimais ir narystėmis – cascade) ir patį anoniminį vartotoją.

create or replace function public.delete_my_data() returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not_authenticated'; end if;
  delete from public.duels where me in (from_user, to_user);
  delete from public.groups where owner_id = me;
  delete from public.profiles where id = me;
  delete from auth.users where id = me;
end $$;

revoke execute on function public.delete_my_data from public, anon;
grant execute on function public.delete_my_data to authenticated;
