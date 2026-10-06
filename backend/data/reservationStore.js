// 방문 예약 데이터 (Supabase reservations 테이블)
//
// 예약은 공개 예약 페이지(frontend/reservation.js)에서 Supabase로 바로 저장된다.
// 관리자 조회/상태 변경은 이 서버에서만 비밀(secret) 키로 수행한다.
// 프로젝트 저장소(store.js)와 섞이지 않도록 환경변수 이름을 따로 쓴다.
//   RESERVATIONS_SUPABASE_URL
//   RESERVATIONS_SUPABASE_SECRET_KEY  (절대 프론트엔드나 공개 저장소에 노출 금지)

const STATUSES = ["접수", "확정", "변경 요청", "취소"];

const isConfigured = Boolean(
  process.env.RESERVATIONS_SUPABASE_URL && process.env.RESERVATIONS_SUPABASE_SECRET_KEY
);

let supabase = null;
if (isConfigured) {
  const { createClient } = require("@supabase/supabase-js");
  supabase = createClient(
    process.env.RESERVATIONS_SUPABASE_URL,
    process.env.RESERVATIONS_SUPABASE_SECRET_KEY,
    { auth: { persistSession: false } }
  );
}

function fromRow(row) {
  return {
    id: row.id,
    reservationNo: row.reservation_no,
    name: row.name,
    email: row.email,
    visitDate: row.visit_date,
    visitTime: row.visit_time,
    purpose: row.purpose,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertConfigured() {
  if (!isConfigured) {
    const err = new Error("예약 DB 연결 설정(RESERVATIONS_SUPABASE_URL / RESERVATIONS_SUPABASE_SECRET_KEY)이 없습니다.");
    err.code = "NOT_CONFIGURED";
    throw err;
  }
}

// 방문 날짜·시간이 빠른 순으로 정렬
async function getAllReservations() {
  assertConfigured();
  const { data, error } = await supabase
    .from("reservations")
    .select("id, reservation_no, name, email, visit_date, visit_time, purpose, status, created_at, updated_at")
    .order("visit_date", { ascending: true })
    .order("visit_time", { ascending: true });
  if (error) throw error;
  return data.map(fromRow);
}

async function updateReservationStatus(id, status) {
  assertConfigured();
  const { data, error } = await supabase
    .from("reservations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, reservation_no, name, email, visit_date, visit_time, purpose, status, created_at, updated_at")
    .maybeSingle();
  if (error) throw error;
  return data ? fromRow(data) : null;
}

module.exports = { STATUSES, isConfigured, getAllReservations, updateReservationStatus };
