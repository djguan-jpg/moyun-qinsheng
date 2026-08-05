create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('participant', 'admin');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.user_role not null default 'participant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  registration_no text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  school_name text,
  teacher_name text,
  category text not null,
  division text,
  repertoire text not null,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded')),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'needs_revision', 'rejected')),
  documents jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  title text not null,
  description text,
  cover_url text,
  video_url text,
  score_url text,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (work_id, voter_id)
);

create table if not exists public.judges (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  category text not null,
  title text,
  bio text,
  photo_url text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  category text not null default 'announcement',
  title text not null,
  content text not null,
  is_pinned boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.competition_settings (
  id boolean primary key default true check (id),
  site_name text not null default '墨韻琴聲｜全國音樂大賽',
  organizer text,
  contact_email text,
  registration_deadline date,
  updated_at timestamptz not null default now()
);

create index if not exists registrations_user_id_idx on public.registrations(user_id);
create index if not exists registrations_status_idx on public.registrations(review_status, payment_status);
create index if not exists works_published_idx on public.works(is_published, is_featured);
create index if not exists votes_work_id_idx on public.votes(work_id);
create index if not exists announcements_published_idx on public.announcements(is_published, published_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'::public.user_role
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.registrations enable row level security;
alter table public.works enable row level security;
alter table public.votes enable row level security;
alter table public.judges enable row level security;
alter table public.announcements enable row level security;
alter table public.competition_settings enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
create policy "registrations_select_own_or_admin" on public.registrations for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "registrations_insert_own" on public.registrations for insert to authenticated with check (user_id = auth.uid());
create policy "registrations_update_own_or_admin" on public.registrations for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "works_read_published_or_admin" on public.works for select using (is_published or public.is_admin());
create policy "works_manage_admin" on public.works for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "votes_read_own_or_admin" on public.votes for select to authenticated using (voter_id = auth.uid() or public.is_admin());
create policy "votes_insert_own" on public.votes for insert to authenticated with check (voter_id = auth.uid());
create policy "votes_manage_admin" on public.votes for delete to authenticated using (public.is_admin());
create policy "judges_read_published_or_admin" on public.judges for select using (is_published or public.is_admin());
create policy "judges_manage_admin" on public.judges for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "announcements_read_published_or_admin" on public.announcements for select using (is_published or public.is_admin());
create policy "announcements_manage_admin" on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "settings_read_admin" on public.competition_settings for select to authenticated using (public.is_admin());
create policy "settings_manage_admin" on public.competition_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.works, public.judges, public.announcements to anon;
grant select, insert, update, delete on public.profiles, public.registrations, public.works, public.votes, public.judges, public.announcements, public.competition_settings to authenticated;
