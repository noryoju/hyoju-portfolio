-- 포트폴리오 테이블 전용 SQL (projects, project_media, awards, skills, contacts + 열 공개/비공개)
-- 새 Supabase 프로젝트의 SQL Editor 에 통째로 붙여 넣고 Run 한다. 여러 번 실행해도 안전하다.

-- 01. 포트폴리오 사이트 테이블 (A 그룹)
-- Supabase 대시보드 > SQL Editor 에서 실행한다. 여러 번 실행해도 안전하다(if not exists).
--
-- 이미 있는 테이블
--   projects      : backend/data/supabase-schema.sql 과 같은 구조. 여기서는 없을 때만 만들고, 열만 추가한다.
--   reservations  : backend/data/reservations-schema.sql 로 이미 만들어져 있어 여기서 다시 만들지 않는다.
-- 새로 만드는 테이블
--   project_media, awards, skills, contacts
--
-- 공개/비공개 열 등급은 05_visibility.sql 이 한꺼번에 관리한다.

-- ---------------------------------------------------------------------------
-- projects (기존 구조 유지 + 날짜 열 2개 추가)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key,
  title text not null default '',
  role text not null default '',
  description text not null default '',
  date text not null default '',
  member_count text not null default '',
  note text not null default '',
  video_url text not null default '',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- store.js 는 아직 이 두 열을 쓰지 않는다. 비어 있어도 기존 동작에 영향이 없다.
alter table public.projects add column if not exists start_date date;
alter table public.projects add column if not exists end_date date;

alter table public.projects enable row level security;
revoke all on public.projects from anon, authenticated;

drop policy if exists "projects 공개글만 읽기" on public.projects;
create policy "projects 공개글만 읽기" on public.projects
  for select to anon
  using (status = 'published');

-- ---------------------------------------------------------------------------
-- project_media : 프로젝트에 붙는 영상·이미지·PDF (파일 자체는 Supabase Storage)
-- ---------------------------------------------------------------------------
create table if not exists public.project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('video', 'image', 'pdf')),
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists project_media_project_idx on public.project_media (project_id, sort_order);

alter table public.project_media enable row level security;
revoke all on public.project_media from anon, authenticated;

drop policy if exists "project_media 공개 프로젝트만 읽기" on public.project_media;
create policy "project_media 공개 프로젝트만 읽기" on public.project_media
  for select to anon
  using (exists (
    select 1 from public.projects p
    where p.id = project_media.project_id and p.status = 'published'
  ));

-- ---------------------------------------------------------------------------
-- awards : 수상 (현재 frontend/index.html 에 하드코딩)
-- ---------------------------------------------------------------------------
create table if not exists public.awards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  org text not null default '',
  awarded_on date,
  poster_path text not null default '',   -- Storage 경로. 예) assets/award-poster.jpg
  sort_order integer not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.awards enable row level security;
revoke all on public.awards from anon, authenticated;

drop policy if exists "awards 공개글만 읽기" on public.awards;
create policy "awards 공개글만 읽기" on public.awards
  for select to anon
  using (is_public);

-- ---------------------------------------------------------------------------
-- skills : 스킬 (현재 frontend/index.html 에 하드코딩)
-- ---------------------------------------------------------------------------
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default '',
  level smallint check (level between 1 and 5),
  sort_order integer not null default 0,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.skills enable row level security;
revoke all on public.skills from anon, authenticated;

drop policy if exists "skills 공개글만 읽기" on public.skills;
create policy "skills 공개글만 읽기" on public.skills
  for select to anon
  using (is_public);

-- ---------------------------------------------------------------------------
-- contacts : 문의 폼 (지금은 backend/routes/contact.js 가 저장하지 않고 버린다)
-- ---------------------------------------------------------------------------
-- 방문자는 저장만 가능하고 조회/수정/삭제는 불가능하다 (reservations 와 같은 방식).
create table if not exists public.contacts (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),

  constraint contacts_name check (char_length(btrim(name)) between 1 and 50),
  constraint contacts_email check (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint contacts_message check (char_length(btrim(message)) between 1 and 2000)
);

alter table public.contacts enable row level security;
revoke all on public.contacts from anon, authenticated;

drop policy if exists "contacts 누구나 저장만" on public.contacts;
create policy "contacts 누구나 저장만" on public.contacts
  for insert to anon
  with check (true);

-- ---------------------------------------------------------------------------
-- ① 기준표
-- ---------------------------------------------------------------------------
create table if not exists public.meta_column_visibility (
  table_name text not null,
  column_name text not null,
  visibility text not null check (visibility in ('public', 'admin_only', 'insert_only', 'system')),
  reason text,
  updated_at timestamptz not null default now(),
  primary key (table_name, column_name)
);

alter table public.meta_column_visibility enable row level security;
revoke all on public.meta_column_visibility from anon, authenticated;

-- 열 여러 개를 한 번에 등급 지정
create or replace function public.set_visibility(
  p_table text, p_visibility text, p_cols text[], p_reason text default null
) returns void
language sql
set search_path = ''
as $$
  insert into public.meta_column_visibility (table_name, column_name, visibility, reason)
  select p_table, c, p_visibility, p_reason from unnest(p_cols) as c
  on conflict (table_name, column_name)
  do update set visibility = excluded.visibility,
                reason = coalesce(excluded.reason, public.meta_column_visibility.reason),
                updated_at = now();
$$;

-- 테이블의 모든 열을 같은 등급으로 지정 (분석 중이라 아직 공개 여부를 안 정한 테이블용)
create or replace function public.set_visibility_all(
  p_table text, p_visibility text, p_reason text default null
) returns void
language sql
set search_path = ''
as $$
  select public.set_visibility(
    p_table, p_visibility,
    array(select c.column_name::text from information_schema.columns c
          where c.table_schema = 'public' and c.table_name = p_table
          order by c.ordinal_position),
    p_reason);
$$;

revoke execute on function public.set_visibility(text, text, text[], text) from public, anon, authenticated;
revoke execute on function public.set_visibility_all(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 등급 지정 : A. 포트폴리오
-- ---------------------------------------------------------------------------
select public.set_visibility('projects', 'public',
  array['title','role','description','date','member_count','video_url','start_date','end_date']);
select public.set_visibility('projects', 'public', array['id','status'],
  'RLS 정책(status=published)과 하위 테이블 조인이 이 열을 읽는다');
select public.set_visibility('projects', 'admin_only', array['note'], '본인 메모');
select public.set_visibility('projects', 'system', array['created_at','updated_at']);

select public.set_visibility('project_media', 'public', array['project_id','kind','storage_path','sort_order']);
select public.set_visibility('project_media', 'system', array['id','created_at']);

select public.set_visibility('awards', 'public', array['title','org','awarded_on','poster_path','sort_order']);
select public.set_visibility('awards', 'public', array['is_public'], 'RLS 정책이 읽는다');
select public.set_visibility('awards', 'system', array['id','created_at']);

select public.set_visibility('skills', 'public', array['name','category','level','sort_order']);
select public.set_visibility('skills', 'public', array['is_public'], 'RLS 정책이 읽는다');
select public.set_visibility('skills', 'system', array['id','created_at']);

select public.set_visibility('contacts', 'insert_only', array['name','email','message'], '개인정보. 저장만 가능');
select public.set_visibility('contacts', 'admin_only', array['is_read']);
select public.set_visibility('contacts', 'system', array['id','created_at']);


-- ---------------------------------------------------------------------------
-- ② 기준표를 실제 권한으로 반영
-- ---------------------------------------------------------------------------
create or replace function public.apply_column_visibility()
returns void
language plpgsql
set search_path = ''
as $$
declare
  t record;
  missing text;
  pub_cols text;
  ins_cols text;
begin
  for t in select distinct table_name from public.meta_column_visibility loop
    -- 이 프로젝트에 없는 테이블(예: reservations 를 다른 프로젝트에 둔 경우)은 건너뛴다
    if not exists (select 1 from information_schema.tables
                   where table_schema = 'public' and table_name = t.table_name) then
      raise notice '테이블이 없어 건너뜀: %', t.table_name;
      continue;
    end if;

    -- 기준표에 적힌 열이 실제로 없으면 오타이므로 멈춘다
    select string_agg(m.column_name, ', ') into missing
    from public.meta_column_visibility m
    where m.table_name = t.table_name
      and not exists (select 1 from information_schema.columns c
                      where c.table_schema = 'public' and c.table_name = m.table_name
                        and c.column_name = m.column_name);
    if missing is not null then
      raise exception '% 테이블에 없는 열이 기준표에 있음: %', t.table_name, missing;
    end if;

    select string_agg(quote_ident(column_name), ', ') into pub_cols
      from public.meta_column_visibility
      where table_name = t.table_name and visibility = 'public';
    select string_agg(quote_ident(column_name), ', ') into ins_cols
      from public.meta_column_visibility
      where table_name = t.table_name and visibility = 'insert_only';

    -- 먼저 전부 회수한 뒤, 기준표에 적힌 열만 다시 열어 준다
    execute format('revoke select, insert on public.%I from anon', t.table_name);
    if pub_cols is not null then
      execute format('grant select (%s) on public.%I to anon', pub_cols, t.table_name);
    end if;
    if ins_cols is not null then
      execute format('grant insert (%s) on public.%I to anon', ins_cols, t.table_name);
    end if;
  end loop;
end;
$$;

revoke execute on function public.apply_column_visibility() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ③ 기준표에 아직 안 적은 열 찾기 (적지 않은 열은 자동으로 비공개)
-- ---------------------------------------------------------------------------
create or replace function public.unclassified_columns()
returns table (table_name text, column_name text)
language sql
stable
set search_path = ''
as $$
  select c.table_name::text, c.column_name::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in (select distinct m.table_name from public.meta_column_visibility m)
    and not exists (select 1 from public.meta_column_visibility m
                    where m.table_name = c.table_name and m.column_name = c.column_name)
  order by c.table_name, c.ordinal_position;
$$;

revoke execute on function public.unclassified_columns() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 실행 및 점검
-- ---------------------------------------------------------------------------
select public.apply_column_visibility();

-- (1) 등급을 안 적은 열 목록. 비어 있어야 정상이다.
select * from public.unclassified_columns();

-- (2) 방문자(anon)에게 실제로 열려 있는 열 목록. 기준표의 public / insert_only 와 같아야 한다.
select table_name, column_name, privilege_type
from information_schema.column_privileges
where grantee = 'anon' and table_schema = 'public'
order by table_name, privilege_type, column_name;
