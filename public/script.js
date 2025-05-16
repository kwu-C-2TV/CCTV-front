// 📌 상단 설정
const API_BASE = 'https://cctv-api-server.onrender.com';
let map, radius = 100;
let markers = [], infoWindows = [], circles = [], userCircle = null;
let currentUserLat = null, currentUserLon = null;

// 📌 거리 계산 함수 (Haversine)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 📌 지도 초기화
function initMap() {
  map = new naver.maps.Map('map', {
    center: new naver.maps.LatLng(37.5665, 126.978),
    zoom: 15
  });
}

// 📌 반경 라벨 및 지도 반영
function updateRadiusLabel() {
  radius = parseInt(document.getElementById('radiusInput').value);
  document.getElementById('radiusLabel').innerText = radius;

  if (userCircle && currentUserLat && currentUserLon) {
    userCircle.setRadius(radius);
    updateNearbyFacilities(currentUserLat, currentUserLon);
  }
}

// 📌 주소 → 전체 주소 + 구 이름 추출
function reverseGeocode(lat, lon, callback) {
  naver.maps.Service.reverseGeocode({
    coords: new naver.maps.LatLng(lat, lon),
    orders: naver.maps.Service.OrderType.ADDR
  }, function (status, response) {
    if (status !== naver.maps.Service.Status.OK) {
      callback(null, null);
      return;
    }
    const fullAddress = response.v2.address?.jibunAddress || '주소 없음';
    const district = fullAddress.match(/([가-힣]+구)/)?.[1] || null;
    callback(fullAddress, district);
  });
}

// 📌 차트 그리기 함수 (막대 & 도넛)
function drawFacilityChart(data) {
  const ctx = document.getElementById('facilityChart').getContext('2d');
  if (window.facilityChart instanceof Chart) window.facilityChart.destroy();
  window.facilityChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['CCTV', '편의점', '병원', '경찰서'],
      datasets: [{
        label: '시설 개수',
        data: [data.cctv, data.store, data.hospital, data.police],
        backgroundColor: ['#2f80ed', '#10b981', '#f59e0b', '#ef4444']
      }]
    },
    options: { responsive: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

function drawSafetyDonut(score) {
  const ctx = document.getElementById('safetyDonut').getContext('2d');
  if (window.safetyDonut instanceof Chart) window.safetyDonut.destroy();
  window.safetyDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['안전점수', '남은점수'],
      datasets: [{
        data: [score, 100 - score],
        backgroundColor: ['#10b981', '#e5e7eb'],
        borderWidth: 0
      }]
    },
    options: {
      cutout: '70%',
      plugins: { legend: { display: false } }
    }
  });
  document.getElementById('safetyScoreLabel').innerText = `안전 점수: ${score}점`;
}

function calculateSafetyScore({ cctv, store, hospital, police }) {
  const weight = { cctv: 5, store: 7, hospital: 10, police: 15 };
  const rawScore = cctv * weight.cctv + store * weight.store + hospital * weight.hospital + police * weight.police;
  const maxScore = 10 * weight.cctv + 5 * weight.store + 2 * weight.hospital + 2 * weight.police;
  return Math.min(Math.round((rawScore / maxScore) * 100), 100);
}

// 📌 시설 필터링 및 다시 그리기
function updateNearbyFacilities(lat, lon) {
  const filtered = window.lastFetchedCCTV?.filter(loc => getDistance(lat, lon, loc.lat, loc.lot) <= radius) || [];

  markers.forEach(m => m.setMap(null));
  infoWindows.forEach(iw => iw.setMap(null));
  markers = [];
  infoWindows = [];
  document.getElementById('resultList').innerHTML = '';

  filtered.forEach((loc, i) => {
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(loc.lat, loc.lot),
      map: map
    });
    markers.push(marker);

    const infoWindow = new naver.maps.InfoWindow({
      content: `<div style="padding:5px;">${loc.address}</div>`
    });
    infoWindows.push(infoWindow);

    marker.addListener('click', () => {
      infoWindows.forEach(iw => iw.close());
      infoWindow.open(map, marker);
    });

    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerText = loc.address;
    item.dataset.index = i;
    item.addEventListener('click', () => {
      map.setCenter(marker.getPosition());
      infoWindow.open(map, marker);
    });
    document.getElementById('resultList').appendChild(item);
  });

  const facilityData = {
    cctv: filtered.length,
    store: 2,
    hospital: 1,
    police: 0
  };
  drawFacilityChart(facilityData);
  drawSafetyDonut(calculateSafetyScore(facilityData));
}

// 📌 메인 기능: 현 위치 기반 자동 검색
function searchByCurrentLocation() {
  if (!navigator.geolocation) return alert('위치 정보를 사용할 수 없습니다.');

  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    currentUserLat = lat;
    currentUserLon = lon;
    const locationLatLng = new naver.maps.LatLng(lat, lon);

    map.setCenter(locationLatLng);
    map.setZoom(15);

    new naver.maps.Marker({
      position: locationLatLng,
      map: map,
      icon: {
        content: `<div style="width: 18px; height: 18px; background: red; border-radius: 50%; border: 2px solid white;"></div>`,
        anchor: new naver.maps.Point(9, 9)
      }
    });

    if (userCircle) userCircle.setMap(null);
    userCircle = new naver.maps.Circle({
      map: map,
      center: locationLatLng,
      radius: radius,
      strokeColor: '#2f80ed',
      strokeOpacity: 0.8,
      strokeWeight: 1,
      fillColor: '#2f80ed',
      fillOpacity: 0.2
    });

    reverseGeocode(lat, lon, async (fullAddress, districtName) => {
      if (!districtName) return alert('구 이름을 찾을 수 없습니다.');
      document.getElementById('currentAddress').innerText = `📍 현위치 주소: ${fullAddress}`;

      try {
        const res = await fetch(`${API_BASE}/api/cctv?q=${encodeURIComponent(districtName)}`);
        const data = await res.json();
        window.lastFetchedCCTV = data; // 저장
        updateNearbyFacilities(lat, lon);
      } catch (err) {
        console.error('❌ 오류:', err);
        alert(err.message || 'CCTV 검색 실패');
      }
    });
  }, () => {
    alert('위치 권한이 필요합니다.');
  });
}

// 📌 페이지 로드 시 자동 실행
window.onload = () => {
  initMap();
  updateRadiusLabel();
  searchByCurrentLocation();
  document.getElementById('radiusInput').addEventListener('input', updateRadiusLabel);
};
