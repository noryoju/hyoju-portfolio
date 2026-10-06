// 방문 예약 페이지
// - 캘린더(flatpickr): 공휴일·주말을 제외한 평일만 선택
// - 희망 시간: 13:00 ~ 18:00, 30분 단위
// - 이미 예약된 시간은 '(완료)'로 표시하고 선택 불가, 모든 시간이 찬 날짜는 캘린더에서 선택 불가
//   (최종 중복 방지는 DB의 reservations_slot_key 유일 인덱스가 담당)
// - 필수 입력 + 이메일 형식 + 동의 체크가 모두 충족될 때만 예약하기 버튼 활성화
// - 최종 확인 팝업에서 예약하기를 누르면
//   1) Formspree로 전송 → 운영자 이메일로 예약 내용 수신 (받는 주소는 Formspree 폼 설정에서 지정)
//   2) Supabase reservations 테이블에 기록 보관
//   Supabase를 먼저 저장해 중복 신청(같은 사람·같은 시간)을 거르고,
//   둘 중 하나라도 성공하면 접수 완료로 처리한다.

// Formspree 폼 주소
const FORMSPREE_URL = 'https://formspree.io/f/xppqwwdq';

// Supabase 공개(publishable) 키: 브라우저에 노출되어도 되는 키이며,
// 테이블 권한(RLS)으로 '저장만 가능, 조회 불가'로 제한되어 있다.
const SUPABASE_URL = 'https://opaaxzlfwhjjqkvfozcy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NEd1TVepg7zHlJJYMm73eA_0Qb0EfCr';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

// 희망 시간 목록: 13:00 ~ 18:00, 30분 단위
const TIME_SLOTS = [];
for (let minutes = 13 * 60; minutes <= 18 * 60; minutes += 30) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  TIME_SLOTS.push(`${hh}:${mm}`);
}

const els = {
  form: document.getElementById('reservationForm'),
  holidayStatus: document.getElementById('holidayStatus'),
  slotStatus: document.getElementById('slotStatus'),
  selectedDate: document.getElementById('selectedDate'),
  visitTime: document.getElementById('visitTime'),
  name: document.getElementById('visitorName'),
  email: document.getElementById('visitorEmail'),
  emailError: document.getElementById('emailError'),
  purpose: document.getElementById('visitPurpose'),
  purposeCount: document.getElementById('purposeCount'),
  consent: document.getElementById('consent'),
  reserveBtn: document.getElementById('reserveBtn'),
  confirmModal: document.getElementById('confirmModal'),
  doneModal: document.getElementById('doneModal'),
  cancelBtn: document.getElementById('cancelBtn'),
  confirmBtn: document.getElementById('confirmBtn'),
  submitError: document.getElementById('submitError'),
};

// 공휴일 목록 { 'YYYY-MM-DD': '공휴일 이름' }
const holidays = {};
// 이미 예약된 시간 { 'YYYY-MM-DD': Set(['14:30', ...]) }
const bookedSlots = {};
let selectedDateValue = ''; // 'YYYY-MM-DD'
let emailTouched = false;

/* ---------- 날짜 도우미 ---------- */
function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toKoreanDate(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

function isWeekend(date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function isFullyBooked(isoDate) {
  return (bookedSlots[isoDate]?.size || 0) >= TIME_SLOTS.length;
}

// 선택 불가 날짜: 주말, 공휴일, 모든 시간이 예약된 날
function isDateDisabled(date) {
  const iso = toISODate(date);
  return isWeekend(date) || Boolean(holidays[iso]) || isFullyBooked(iso);
}

// 공휴일/예약 정보를 다시 반영하고, 고른 날짜가 막혔으면 선택 해제
function applyDisabledDates() {
  calendar.set('disable', [isDateDisabled]);
  if (selectedDateValue && isDateDisabled(new Date(`${selectedDateValue}T00:00:00`))) calendar.clear();
}

/* ---------- 1. 캘린더 ---------- */
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const maxDate = new Date();
maxDate.setMonth(maxDate.getMonth() + 3);

const calendar = flatpickr('#calendar', {
  inline: true,
  locale: 'ko',
  minDate: tomorrow,
  maxDate: maxDate,
  disable: [isDateDisabled],
  onDayCreate: (_selected, _str, _fp, dayElem) => {
    const iso = toISODate(dayElem.dateObj);
    const name = holidays[iso];
    if (name) {
      dayElem.classList.add('is-holiday');
      dayElem.title = name;
    } else if (isFullyBooked(iso)) {
      dayElem.title = '예약 마감';
    }
  },
  onChange: (selectedDates) => {
    const date = selectedDates[0];
    selectedDateValue = date ? toISODate(date) : '';
    els.selectedDate.value = date ? toKoreanDate(date) : '';
    refreshTimeOptions();
  },
});

// 공휴일: Nager.Date 공개 API (올해 + 내년)
async function loadHolidays() {
  const years = [...new Set([tomorrow.getFullYear(), maxDate.getFullYear()])];
  try {
    for (const year of years) {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = await res.json();
      list.forEach((h) => { holidays[h.date] = h.localName; });
    }
    els.holidayStatus.textContent = '주말과 공휴일(빨간 취소선)은 선택할 수 없습니다.';
  } catch (err) {
    console.error('공휴일 조회 실패:', err);
    els.holidayStatus.textContent = '공휴일 정보를 불러오지 못해 주말만 제외했습니다. 공휴일 예약은 확인 후 조정될 수 있습니다.';
  }

  applyDisabledDates();
}

// 이미 예약된 날짜·시간: Supabase 함수 get_booked_slots (날짜·시간만 반환, 개인정보 없음)
async function loadBookedSlots() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_booked_slots`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_date: toISODate(tomorrow), to_date: toISODate(maxDate) }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();

    Object.keys(bookedSlots).forEach((key) => delete bookedSlots[key]);
    rows.forEach(({ visit_date: date, visit_time: time }) => {
      (bookedSlots[date] ||= new Set()).add(time);
    });
    els.slotStatus.textContent = '(완료)로 표시된 시간은 이미 예약된 시간이라 선택할 수 없습니다.';
  } catch (err) {
    console.error('예약 현황 조회 실패:', err);
    els.slotStatus.textContent = '예약 현황을 불러오지 못했습니다. 이미 예약된 시간이면 신청 단계에서 안내됩니다.';
  }

  applyDisabledDates();
  refreshTimeOptions();
}

/* ---------- 2. 희망 시간 (13:00 ~ 18:00, 30분 단위) ---------- */
function fillTimeOptions() {
  TIME_SLOTS.forEach((time) => {
    const option = document.createElement('option');
    option.value = time;
    option.textContent = time;
    els.visitTime.appendChild(option);
  });
}

// 선택한 날짜 기준으로 이미 예약된 시간은 '(완료)' 표시 + 선택 불가
function refreshTimeOptions() {
  const booked = bookedSlots[selectedDateValue] || new Set();
  [...els.visitTime.options].forEach((option) => {
    if (!option.value) return; // '시간을 선택하세요'
    const isBooked = booked.has(option.value);
    option.disabled = isBooked;
    option.textContent = isBooked ? `${option.value} (완료)` : option.value;
  });
  if (els.visitTime.selectedOptions[0]?.disabled) els.visitTime.value = '';
  updateButton();
}

/* ---------- 3. 입력 검사 ---------- */
function isEmailValid() {
  return EMAIL_PATTERN.test(els.email.value.trim());
}

function showEmailState() {
  const value = els.email.value.trim();
  const invalid = emailTouched && value !== '' && !isEmailValid();
  els.email.classList.toggle('is-invalid', invalid);
  els.email.setAttribute('aria-invalid', String(invalid));
  els.emailError.hidden = !invalid;
}

function isFormComplete() {
  return (
    selectedDateValue !== '' &&
    els.visitTime.value !== '' &&
    els.name.value.trim() !== '' &&
    isEmailValid() &&
    els.purpose.value.trim() !== '' &&
    els.consent.checked
  );
}

function updateButton() {
  els.reserveBtn.disabled = !isFormComplete();
}

/* ---------- 4. 최종 확인 팝업 ---------- */
function openConfirm() {
  document.getElementById('sumDate').textContent = els.selectedDate.value;
  document.getElementById('sumTime').textContent = els.visitTime.value;
  document.getElementById('sumName').textContent = els.name.value.trim();
  document.getElementById('sumEmail').textContent = els.email.value.trim();
  document.getElementById('sumPurpose').textContent = els.purpose.value.trim();
  els.submitError.hidden = true;
  els.confirmModal.hidden = false;
  els.confirmBtn.focus();
}

function closeConfirm() {
  els.confirmModal.hidden = true;
  els.reserveBtn.focus();
}

function getReservationData() {
  return {
    visit_date: selectedDateValue,
    visit_time: els.visitTime.value,
    name: els.name.value.trim(),
    email: els.email.value.trim(),
    purpose: els.purpose.value.trim(),
    consent: els.consent.checked,
  };
}

// Formspree: 운영자 이메일로 예약 내용 전송
async function sendToFormspree(data) {
  const res = await fetch(FORMSPREE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      _subject: `[방문 예약] ${data.visit_date} ${data.visit_time} - ${data.name}`,
      방문날짜: els.selectedDate.value,
      희망시간: data.visit_time,
      이름: data.name,
      email: data.email, // Formspree가 이 값을 답장 주소(Reply-To)로 사용
      방문목적: data.purpose,
      정보전달동의: data.consent ? '동의함' : '동의하지 않음',
    }),
  });
  if (!res.ok) throw new Error(`Formspree HTTP ${res.status}: ${await res.text()}`);
}

// Supabase: 예약 기록 보관
async function saveToSupabase(data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reservations`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (res.status === 409) {
    // reservations_slot_key: 그 사이 다른 사람이 같은 날짜·시간을 먼저 예약한 경우
    // reservations_reservation_no_key: 같은 이름/이메일로 같은 날짜·시간에 이미 신청한 경우
    const body = await res.text();
    const err = new Error('이미 예약된 날짜·시간입니다.');
    err.code = body.includes('reservations_reservation_no_key') ? 'DUPLICATE' : 'SLOT_TAKEN';
    throw err;
  }
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}: ${await res.text()}`);
}

// Supabase 기록을 먼저 시도해 중복 신청을 거른 뒤 이메일을 보낸다.
async function saveReservation() {
  const data = getReservationData();
  let savedToDb = false;
  try {
    await saveToSupabase(data);
    savedToDb = true;
  } catch (err) {
    if (err.code === 'DUPLICATE' || err.code === 'SLOT_TAKEN') throw err;
    console.error('예약 기록(Supabase) 실패:', err);
  }

  try {
    await sendToFormspree(data);
  } catch (err) {
    console.error('예약 메일(Formspree) 실패:', err);
    if (!savedToDb) throw new Error('모든 전송 실패');
  }
}

async function confirmReservation() {
  els.confirmBtn.disabled = true;
  els.cancelBtn.disabled = true;
  try {
    await saveReservation();
    els.confirmModal.hidden = true;
    els.doneModal.hidden = false;
    els.form.reset();
    calendar.clear();
    emailTouched = false;
    showEmailState();
    els.purposeCount.textContent = '0';
    updateButton();
    loadBookedSlots(); // 방금 예약한 시간도 (완료)로 반영
  } catch (err) {
    console.error('예약 저장 실패:', err);
    const messages = {
      DUPLICATE: '이미 같은 날짜·시간에 신청하신 예약이 있습니다. 다른 시간을 선택해 주세요.',
      SLOT_TAKEN: '방금 다른 분이 이 시간을 먼저 예약했습니다. 팝업을 닫고 다른 시간을 선택해 주세요.',
    };
    els.submitError.textContent = messages[err.code] || '예약을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    els.submitError.hidden = false;
    if (err.code === 'SLOT_TAKEN') loadBookedSlots(); // 드롭다운에 (완료) 반영
  } finally {
    els.confirmBtn.disabled = false;
    els.cancelBtn.disabled = false;
  }
}

/* ---------- 이벤트 연결 ---------- */
[els.visitTime, els.name, els.purpose, els.consent].forEach((el) => {
  el.addEventListener('input', updateButton);
  el.addEventListener('change', updateButton);
});

els.email.addEventListener('blur', () => {
  emailTouched = true;
  showEmailState();
});
els.email.addEventListener('input', () => {
  showEmailState();
  updateButton();
});

els.purpose.addEventListener('input', () => {
  els.purposeCount.textContent = els.purpose.value.length;
});

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  emailTouched = true;
  showEmailState();
  if (isFormComplete()) openConfirm();
});

els.cancelBtn.addEventListener('click', closeConfirm);
els.confirmBtn.addEventListener('click', confirmReservation);
els.confirmModal.addEventListener('click', (event) => {
  if (event.target === els.confirmModal && !els.confirmBtn.disabled) closeConfirm();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !els.confirmModal.hidden && !els.confirmBtn.disabled) closeConfirm();
});

if (window.lucide) lucide.createIcons();
fillTimeOptions();
updateButton();
loadHolidays();
loadBookedSlots();
