-- NovaCore 002: nuotolinės dvikovos (duels). Paleisti VIENĄ kartą po 001: Supabase → SQL Editor → įklijuoti → Run.
-- Galima paleisti ir pakartotinai (if not exists / or replace / drop policy if exists) – duomenys neištrinami.
-- Vaizdo NIEKADA nesiunčiam: per Realtime kanalą `duel:<id>` keliauja tik taškai, pasiruošimas, laikrodžio ping/pong ir
-- startas. Lentelė saugo kvietimą ir galutinius abiejų rezultatus. Rašoma TIK per funkcijas (security definer) su patikromis;
-- tiesioginių insert/update teisių nėra. Skaito tik du dalyviai (RLS).

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  from_user uuid not null references public.profiles on delete cascade,
  to_user uuid not null references public.profiles on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'playing', 'done', 'expired')),
  settings jsonb not null, -- {duration: 60|180, exercises: text[], seed: int}
  created_at timestamptz not null default now(),
  started_at timestamptz,
  from_score int check (from_score between 0 and 2000), -- ponytail: klientas pats siunčia taškus, kaip games (001)
  to_score int check (to_score between 0 and 2000),
  winner uuid, -- null = lygiosios arba dar nebaigta
  check (from_user <> to_user)
);
create index if not exists duels_to_pending on public.duels (to_user, status, created_at desc);
create index if not exists duels_from_created on public.duels (from_user, created_at desc);

alter table public.duels enable row level security;
drop policy if exists "dvikova matoma dalyviams" on public.duels;
create policy "dvikova matoma dalyviams" on public.duels for select to authenticated
  using (auth.uid() in (from_user, to_user));

-- Kvietimas: abu turi būti tos pačios kompanijos nariai; kvietimas galioja 10 min (tikrinama atsakant ir skaitant).
create or replace function public.invite_duel(p_group uuid, p_to uuid, p_duration int, p_exercises text[])
returns public.duels
language plpgsql security definer set search_path = '' as $$
declare d public.duels;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_to is null or p_to = auth.uid() then raise exception 'duel_self'; end if;
  if p_duration is null or p_duration not in (60, 180)
     or coalesce(cardinality(p_exercises), 0) not between 1 and 12
     or exists (select 1 from unnest(p_exercises) e where e !~ '^[a-z]{2,16}$') then
    raise exception 'duel_bad_settings';
  end if;
  if not public.is_member(p_group)
     or not exists (select 1 from public.group_members where group_id = p_group and user_id = p_to) then
    raise exception 'duel_not_member';
  end if;
  if (select count(*) from public.duels where from_user = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'duel_rate'; -- ponytail: paprasta apsauga nuo kvietimų lietaus
  end if;
  -- vienam draugui – vienas atviras kvietimas (senas atšaukiamas)
  update public.duels set status = 'cancelled' where from_user = auth.uid() and to_user = p_to and status = 'pending';
  insert into public.duels (group_id, from_user, to_user, settings)
  values (p_group, auth.uid(), p_to,
          jsonb_build_object('duration', p_duration, 'exercises', to_jsonb(p_exercises), 'seed', floor(random() * 1000000)::int))
  returning * into d;
  return d;
end $$;

-- Atsakymas (tik kviečiamasis). Pasenęs kvietimas pažymimas 'expired' ir grąžinamas (klientas mato būseną).
create or replace function public.respond_duel(p_id uuid, p_accept boolean)
returns public.duels
language plpgsql security definer set search_path = '' as $$
declare d public.duels;
begin
  select * into d from public.duels where id = p_id and to_user = auth.uid() for update;
  if not found then raise exception 'duel_not_found'; end if;
  if d.status <> 'pending' then raise exception 'duel_closed'; end if;
  update public.duels
     set status = case when d.created_at < now() - interval '10 minutes' then 'expired'
                       when p_accept then 'accepted' else 'declined' end
   where id = p_id returning * into d;
  return d;
end $$;

-- Atšaukti (kviečiantysis kol laukia, bet kuris dalyvis – kol dar nežaidžiama).
create or replace function public.cancel_duel(p_id uuid)
returns public.duels
language plpgsql security definer set search_path = '' as $$
declare d public.duels;
begin
  update public.duels set status = 'cancelled'
   where id = p_id and auth.uid() in (from_user, to_user) and status in ('pending', 'accepted')
  returning * into d;
  return d; -- null, jei jau užbaigta / ne tavo
end $$;

-- Startą skelbia kviečiantysis (šeimininkas), kai abu pasiruošę.
create or replace function public.start_duel(p_id uuid)
returns public.duels
language plpgsql security definer set search_path = '' as $$
declare d public.duels;
begin
  update public.duels set status = 'playing', started_at = now()
   where id = p_id and from_user = auth.uid() and status = 'accepted'
  returning * into d;
  if not found then raise exception 'duel_closed'; end if;
  return d;
end $$;

-- Kiekvienas įrašo SAVO rezultatą vieną kartą; kai abu įrašyti – 'done' ir laimėtojas.
create or replace function public.finish_duel(p_id uuid, p_score int)
returns public.duels
language plpgsql security definer set search_path = '' as $$
declare d public.duels;
begin
  if p_score is null or p_score not between 0 and 2000 then raise exception 'duel_bad_score'; end if;
  select * into d from public.duels where id = p_id and auth.uid() in (from_user, to_user) for update;
  if not found then raise exception 'duel_not_found'; end if;
  if d.status not in ('accepted', 'playing', 'done') then raise exception 'duel_closed'; end if;
  if auth.uid() = d.from_user then d.from_score := coalesce(d.from_score, p_score);
  else d.to_score := coalesce(d.to_score, p_score); end if;
  update public.duels set
    from_score = d.from_score, to_score = d.to_score,
    started_at = coalesce(started_at, now() - make_interval(secs => (settings->>'duration')::int)),
    status = case when d.from_score is not null and d.to_score is not null then 'done' else 'playing' end,
    winner = case when d.from_score > d.to_score then d.from_user when d.to_score > d.from_score then d.to_user end
   where id = p_id returning * into d;
  return d;
end $$;

-- Mano laukiantys kvietimai (ne senesni nei 10 min) su kviečiančiojo slapyvardžiu.
create or replace function public.pending_duels()
returns table (id uuid, group_id uuid, from_user uuid, nickname text, settings jsonb, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select d.id, d.group_id, d.from_user, p.nickname, d.settings, d.created_at
  from public.duels d join public.profiles p on p.id = d.from_user
  where d.to_user = auth.uid() and d.status = 'pending' and d.created_at > now() - interval '10 minutes'
  order by d.created_at desc
$$;

-- Realtime kanalas `duel:<id>` yra PRIVATUS: prisijungti, siųsti ir gauti gali tik du dalyviai.
create or replace function public.duel_topic_ok(p_topic text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_topic ~ '^duel:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
    select 1 from public.duels d where d.id = substr(p_topic, 6)::uuid and auth.uid() in (d.from_user, d.to_user)
  ) else false end
$$;
drop policy if exists "dvikovos kanalas: gauti" on realtime.messages;
create policy "dvikovos kanalas: gauti" on realtime.messages for select to authenticated
  using (public.duel_topic_ok(realtime.topic()));
drop policy if exists "dvikovos kanalas: siųsti" on realtime.messages;
create policy "dvikovos kanalas: siųsti" on realtime.messages for insert to authenticated
  with check (public.duel_topic_ok(realtime.topic()));

-- Kvietimai ir atsakymai ateina gyvai (postgres_changes; RLS galioja – kiekvienas gauna tik savo dvikovas).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'duels') then
    alter publication supabase_realtime add table public.duels;
  end if;
end $$;

revoke all on public.duels from anon, authenticated;
grant select on public.duels to authenticated;
revoke execute on function public.invite_duel, public.respond_duel, public.cancel_duel, public.start_duel,
  public.finish_duel, public.pending_duels, public.duel_topic_ok from public, anon;
grant execute on function public.invite_duel, public.respond_duel, public.cancel_duel, public.start_duel,
  public.finish_duel, public.pending_duels, public.duel_topic_ok to authenticated;
