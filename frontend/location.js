// 찾아오는 길 페이지: 아이콘 표시 + 주소 기준 현재 날씨(온도, 습도) 조회

// 상명대학교 천안캠퍼스 좌표 (OpenStreetMap Nominatim 기준)
const CAMPUS_LAT = 36.833;
const CAMPUS_LON = 127.179;

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${CAMPUS_LAT}&longitude=${CAMPUS_LON}` +
  '&current=temperature_2m,relative_humidity_2m&timezone=Asia%2FSeoul';

function initMap() {
  if (!window.L) return;
  const map = L.map('campusMap', { scrollWheelZoom: false }).setView([CAMPUS_LAT, CAMPUS_LON], 16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  L.marker([CAMPUS_LAT, CAMPUS_LON])
    .addTo(map)
    .bindPopup('상명대학교 천안캠퍼스<br>C404a')
    .openPopup();
}

async function loadWeather() {
  const tempEl = document.getElementById('weatherTemp');
  const humidityEl = document.getElementById('weatherHumidity');
  const timeEl = document.getElementById('weatherTime');

  try {
    const res = await fetch(WEATHER_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const current = data.current;

    tempEl.textContent = `${current.temperature_2m}${data.current_units.temperature_2m}`;
    humidityEl.textContent = `${current.relative_humidity_2m}${data.current_units.relative_humidity_2m}`;
    timeEl.textContent = `기준 시각: ${current.time.replace('T', ' ')} (한국 시간)`;
  } catch (err) {
    console.error('날씨 조회 실패:', err);
    timeEl.textContent = '날씨 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}

if (window.lucide) lucide.createIcons();
initMap();
loadWeather();
