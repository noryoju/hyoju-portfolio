// 방문 예약 페이지
// - 캘린더(flatpickr): 공휴일·주말을 제외한 평일만 선택
// - 희망 시간: 13:00 ~ 18:00, 30분 단위
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

const els = {
  form: document.getElementById('reservationForm'),
  holidayStatus: document.getElementById('holidayStatus'),
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
  disable: [(date) => isWeekend(date) || Boolean(holidays[toISODate(date)])],
  onDayCreate: (_selected, _str, _fp, dayElem) => {
    const name = holidays[toISODate(dayElem.dateObj)];
    if (name) {
      dayElem.classList.add('is-holiday');
      dayElem.title = name;
    }
  },
  onChange: (selectedDates) => {
    const date = selectedDates[0];
    selectedDateValue = date ? toISODate(date) : '';
    els.selectedDate.value = date ? toKoreanDate(date) : '';
    updateButton();
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

  // 공휴일을 반영해 다시 그리고, 이미 고른 날짜가 공휴일이면 선택 해제
  calendar.set('disable', [(date) => isWeekend(date) || Boolean(holidays[toISODate(date)])]);
  if (selectedDateValue && holidays[selectedDateValue]) calendar.clear();
}

/* ---------- 2. 희망 시간 (13:00 ~ 18:00, 30분 단위) ---------- */
function fillTimeOptions() {
  for (let minutes = 13 * 60; minutes <= 18 * 60; minutes += 30) {
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    const option = document.createElement('option');
    option.value = `${hh}:${mm}`;
    option.textContent = `${hh}:${mm}`;
    els.visitTime.appendChild(option);
  }
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
    // 같은 이름/이메일로 같은 날짜·시간에 이미 신청한 경우 (예약 번호 중복)
    const err = new Error('이미 같은 날짜·시간에 신청하신 예약이 있습니다.');
    err.code = 'DUPLICATE';
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
    if (err.code === 'DUPLICATE') throw err;
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
  } catch (err) {
    console.error('예약 저장 실패:', err);
    els.submitError.textContent = err.code === 'DUPLICATE'
      ? '이미 같은 날짜·시간에 신청하신 예약이 있습니다. 다른 시간을 선택해 주세요.'
      : '예약을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    els.submitError.hidden = false;
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
