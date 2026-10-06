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
