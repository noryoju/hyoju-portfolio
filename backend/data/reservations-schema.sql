-- 방문 예약 신청 테이블 (Supabase 'hyoju Project'에 적용 완료, 2026-10-06)
-- frontend/reservation.js가 공개(publishable) 키로 이 테이블에 저장한다.
-- 익명 방문자는 저장(insert)만 가능하고 조회/수정/삭제는 불가하다.
-- 접수된 예약은 Supabase 대시보드 > Table Editor > reservations 에서 확인한다.

create table public.reservations (
  id bigint generated always as identity primary key,
  visit_date date not null,
  visit_time text not null,
  name text not null,
  email text not null,
  purpose text not null,
  consent boolean not null,
  created_at timestamptz not null default now(),

  constraint reservations_weekday check (extract(isodow from visit_date) between 1 and 5),
  constraint reservations_time check (visit_time in ('13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00')),
  constraint reservations_name check (char_length(btrim(name)) between 1 and 50),
  constraint reservations_email check (char_length(email) <= 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  constraint reservations_purpose check (char_length(btrim(purpose)) between 1 and 1000),
  constraint reservations_consent check (consent = true)
);

alter table public.reservations enable row level security;

revoke all on public.reservations from anon, authenticated;
grant insert (visit_date, visit_time, name, email, purpose, consent) on public.reservations to anon;

create policy "anon can insert reservations"
  on public.reservations
  for insert
  to anon
  with check (consent = true and visit_date > current_date);

-- ---------------------------------------------------------------------------
-- 2026-10-06 추가: 예약 번호 + 처리 상태 (관리자 '예약하기 관리' 화면용)
-- ---------------------------------------------------------------------------
-- 처리 상태 4가지: 접수(기본) / 확정 / 변경 요청 / 취소
-- 익명 방문자는 status, reservation_no를 직접 넣을 수 없다(컬럼 권한 없음).
alter table public.reservations
  add column status text not null default '접수',
  add column reservation_no text,
  add column updated_at timestamptz not null default now();

alter table public.reservations
  add constraint reservations_status check (status in ('접수', '확정', '변경 요청', '취소'));

-- 예약 번호 = 방문 날짜·시간 + 신청자(이름/이메일) 식별값. 예) R261007-1430-a3f9
create or replace function public.set_reservation_no()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reservation_no :=
    'R' || to_char(new.visit_date, 'YYMMDD')
    || '-' || replace(new.visit_time, ':', '')
    || '-' || substr(md5(lower(btrim(new.email)) || '|' || btrim(new.name)), 1, 4);
  return new;
end;
$$;

create trigger reservations_set_no
  before insert or update of visit_date, visit_time, name, email
  on public.reservations
  for each row execute function public.set_reservation_no();

-- 같은 사람이 같은 날짜·시간에 중복 신청하는 것을 막는다
-- (다른 사람끼리의 시간 겹침 방지는 추후 구현 예정)
alter table public.reservations
  add constraint reservations_reservation_no_key unique (reservation_no);

update public.reservations set name = name;
alter table public.reservations alter column reservation_no set not null;

revoke execute on function public.set_reservation_no() from public, anon, authenticated;
