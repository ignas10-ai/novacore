-- NovaCore 001: profiliai, kompanijos (grupės su kodu), žaidimai, lyderių lentelė, iššūkiai.
-- Paleisti vieną kartą: Supabase → SQL Editor → įklijuoti → Run.
-- Žaidėjai prisijungia anonimiškai (rolė `authenticated`); `anon` rolei nieko neduodam.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 20),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 30),
  code text not null unique default upper(substr(md5(random()::text), 1, 6)),
  owner_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  players smallint not null check (players in (1, 2)),
  duration smallint not null check (duration in (60, 180)),
  score int not null check (score between 0 and 2000), -- ponytail: klientas pats siunčia taškus; draugų žaidimui OK, serverio patikra jei bus prizai
  reps jsonb not null default '{}',
  exercises text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index games_user_created on public.games (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.games enable row level security;

-- Narystės patikra be RLS rekursijos (group_members politika negali skaityti pati savęs).
create function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid())
$$;

create policy "profiliai matomi prisijungusiems" on public.profiles for select to authenticated using (true);
create policy "savas profilis: kurti" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "savas profilis: keisti" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "grupė matoma nariams" on public.groups for select to authenticated using (public.is_member(id));
create policy "grupę trina savininkas" on public.groups for delete to authenticated using (owner_id = auth.uid());

create policy "nariai matomi nariams" on public.group_members for select to authenticated using (public.is_member(group_id));
create policy "išeiti iš grupės" on public.group_members for delete to authenticated using (user_id = auth.uid());

create policy "savi žaidimai: skaityti" on public.games for select to authenticated using (user_id = auth.uid());
create policy "savi žaidimai: įrašyti" on public.games for insert to authenticated with check (user_id = auth.uid());

-- Grupės kuriamos ir jungiamasi tik per šias funkcijas.
create function public.create_group(p_name text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  insert into public.groups (name, owner_id) values (trim(p_name), auth.uid()) returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

create function public.join_group(p_code text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  select * into g from public.groups where code = upper(trim(p_code));
  if not found then raise exception 'group_not_found'; end if;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g;
end $$;

-- Savaitės lentelė: geriausias 3 min solo rezultatas.
-- ponytail: 2 žaidėjų partijos neskaičiuojamos (nežinom, kuris P yra telefono savininkas); pridėti, kai bus abu prisijungę.
create function public.group_leaderboard(gid uuid, since timestamptz default date_trunc('week', now()))
returns table (user_id uuid, nickname text, best int, games bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nickname, max(g.score), count(g.id)
  from public.group_members m
  join public.profiles p on p.id = m.user_id
  left join public.games g on g.user_id = m.user_id and g.players = 1 and g.duration = 180 and g.created_at >= since
  where m.group_id = gid and public.is_member(gid)
  group by p.id, p.nickname
  order by max(g.score) desc nulls last, p.nickname
$$;

-- Iššūkio nuoroda (/?c=<game id>): rodom tik slapyvardį ir rezultatą.
create function public.get_challenge(game_id uuid)
returns table (nickname text, score int, duration smallint, players smallint, exercises text[], created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.nickname, g.score, g.duration, g.players, g.exercises, g.created_at
  from public.games g join public.profiles p on p.id = g.user_id
  where g.id = game_id
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on function public.is_member, public.create_group, public.join_group, public.group_leaderboard, public.get_challenge from public, anon;
grant execute on function public.is_member, public.create_group, public.join_group, public.group_leaderboard, public.get_challenge to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, delete on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
grant select, insert on public.games to authenticated;
