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

    const activeTab = document.querySelector('.tab-btn.active')?.innerText;
    if (activeTab && activeTab.includes('히트맵')) {
      heatmap.show(map, currentUserLat, currentUserLon, radius);
    } else {
      updateNearbyFacilities(currentUserLat, currentUserLon);
    }
  }
}



const riskLevelThreshold = {
  red: 20,
  orange: 40,
  yellow: 60,
  lightgreen: 80,
  green: 101
};

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
      labels: ['CCTV', '가로등'],
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

  // 색상 설정
  let donutColor = '#10b981'; // 기본 색
  if (score >= 80) donutColor = '#6cd38e';           // 초록
  else if (score >= 60) donutColor = '#9df29d';       // 연초록
  else if (score >= 40) donutColor = '#f9ec8d';       // 노랑
  else if (score >= 20) donutColor = '#f8b878';       // 주황
  else donutColor = '#f26d6d';                        // 빨강

  // 도넛 차트 생성
  window.safetyDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['안전점수', '남은점수'],
      datasets: [{
        data: [score, 100 - score],
        backgroundColor: [donutColor, '#e5e7eb'],
        borderWidth: 0
      }]
    },
    options: {
      cutout: '70%',
      plugins: {
        legend: { display: false }
      }
    }
  });

  // 점수 텍스트
  document.getElementById('safetyScoreLabel').innerText = `안전 점수: ${score}점`;

  const riskLevelThreshold = {
    red: 20,
    orange: 40,
    yellow: 60,
    lightgreen: 80,
    green: 101
  };

  const selectedLevel = localStorage.getItem('selectedRiskLevel');
  if (selectedLevel) {
    const threshold = riskLevelThreshold[selectedLevel];
    if (score < threshold) {
      showRiskAlert(score, selectedLevel);
    }
  }

  const circle = document.getElementById('scoreLevelCircle');
  if (circle) {
    circle.classList.remove('red', 'orange', 'yellow', 'lightgreen', 'green');
    if (score >= 80) circle.classList.add('green');
    else if (score >= 60) circle.classList.add('lightgreen');
    else if (score >= 40) circle.classList.add('yellow');
    else if (score >= 20) circle.classList.add('orange');
    else circle.classList.add('red');
  }
}


function showRiskAlert(score, level) {
  // 기존 팝업 제거
  const existing = document.getElementById('riskAlertPopup');
  if (existing) existing.remove();

  // 새 팝업 요소 생성
  const popup = document.createElement('div');
  popup.id = 'riskAlertPopup';
  popup.innerHTML = `
    <div style="
      position: fixed;
      top: 20%;
      left: 50%;
      transform: translateX(-50%);
      background: white;
      border: 2px solid #f26d6d;
      border-radius: 12px;
      padding: 20px 30px;
      z-index: 9999;
      box-shadow: 0 8px 20px rgba(0,0,0,0.2);
      font-family: 'Segoe UI', sans-serif;
      text-align: center;
      max-width: 280px;
    ">
      <div style="font-size: 18px; margin-bottom: 10px;">⚠️ 위험 알림</div>
      <div style="font-size: 15px;">
      현재 구역은 선택한<br>
      위험 레벨 <strong style="color:#f26d6d">${level}</strong> 미만입니다.<br><br>
      <strong>점수: ${score}점</strong>
</div>
      <button style="
        margin-top: 15px;
        padding: 6px 14px;
        background-color: #f26d6d;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
      " onclick="document.getElementById('riskAlertPopup').remove()">닫기</button>
    </div>
  `;
  document.body.appendChild(popup);
}

function closeRiskAlert() {
  document.getElementById('riskAlertPopup').style.display = 'none';
}

function calculateSafetyScore({ cctv, lamp, accidentCount, policeDist }) {
  const cctvWeight = 0.3;
  const lampWeight = 0.2;
  const accidentWeight = -0.3;
  const policeWeight = 0.2;

  // CCTV (최대 50개 기준)
  const cctvScore = Math.min(cctv / 50, 1) * 100;

  // 가로등 (최대 100개 기준)
  const lampScore = Math.min(lamp / 100, 1) * 100;

  // 사고 이력 (최대 10건 감점, 0건 = 100점)
  const accidentScore = Math.max(100 - accidentCount * 10, 0);

  // 경찰서 거리 (1km 이내 = 100점, 3km 이상 = 0점 선형 감소)
  const policeScore = Math.max(0, 100 - (policeDist / 3000) * 100);

  // 종합 점수 계산
  const finalScore = (
    cctvScore * cctvWeight +
    lampScore * lampWeight +
    accidentScore * Math.abs(accidentWeight) + // 감점이므로 보정
    policeScore * policeWeight
  );

  return Math.round(Math.min(finalScore, 100));
}


// 📌 시설 필터링 및 다시 그리기
function updateNearbyFacilities(lat, lon) {
  const filtered = window.lastFetchedCCTV?.filter(loc => getDistance(lat, lon, loc.lat, loc.lot) <= radius) || [];
  const iconSize = parseInt(localStorage.getItem('iconSize')) || 30;
  markers.forEach(m => m.setMap(null));
  infoWindows.forEach(iw => iw.setMap(null));
  markers = [];
  infoWindows = [];
  document.getElementById('resultList').innerHTML = '';

  filtered.forEach((loc, i) => {
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(loc.lat, loc.lot),
      map: map,
      icon: {
        content: `<img src="/public/images/cctv.png" style="width:${iconSize}px;height:${iconSize}px;" />`,
        anchor: new naver.maps.Point(iconSize / 2, iconSize / 2)
      }
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
    store: 0,
    hospital: 0,
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

// ✅ 히트맵 객체 전역 선언
let heatmapOverlay = null;


function showSafetyHeatmap() {
  if (!navigator.geolocation) return alert("위치 정보를 사용할 수 없습니다.");

  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    currentUserLat = lat;
    currentUserLon = lon;
    const locationLatLng = new naver.maps.LatLng(lat, lon);
    map.setCenter(locationLatLng);

    // 1. CCTV 데이터 요청
    let cctvPoints = [];
    try {
      const res = await fetch(`${API_BASE}/api/cctv?q=구`);
      const data = await res.json();
      const nearby = data.filter(item => getDistance(lat, lon, item.lat, item.lot) <= radius);
      cctvPoints = nearby.map(item => new naver.maps.LatLng(item.lat, item.lot));
    } catch (e) {
      console.warn("CCTV 불러오기 실패", e);
    }

    // 2. 가로등 데이터 요청
    let lampPoints = [];
    try {
      const res = await fetch(`${API_BASE}/api/streetlamps/all`);
      const data = await res.json();
      const nearby = data.lamps.filter(item => getDistance(lat, lon, item.lat, item.lng) <= radius);
      lampPoints = nearby.map(item => new naver.maps.LatLng(item.lat, item.lng));
    } catch (e) {
      console.warn("가로등 불러오기 실패", e);
    }

    // 3. 히트맵 표시
    const heatmapData = [...cctvPoints, ...lampPoints];
    if (heatmapOverlay) heatmapOverlay.setMap(null);
    heatmapOverlay = new naver.maps.visualization.HeatMap({
      map: map,
      data: heatmapData,
      radius: 20,
      opacity: 0.6
    });
    heatmapOverlay.setMap(map);

    // 리스트 정보 출력
    document.getElementById("resultList").innerHTML =
      `<div style="font-weight:bold; margin-bottom: 5px;">
        🔥 히트맵 반경 ${radius}m 내 시설 ${heatmapData.length}개
      </div>`;
    document.querySelector('#list h3').innerText = "히트맵 표시 중";
  });
}

navigator.geolocation.getCurrentPosition(async (pos) => {
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  currentUserLat = lat;
  currentUserLon = lon;
  map.setCenter(new naver.maps.LatLng(lat, lon));

  await heatmap.show(map, lat, lon, radius); // 👉 핵심만 호출
});

// ✅ 모든 가로등 보기 기능
// ✅ 5km 반경 가로등 보기
document.getElementById('showAllStreetlampsBtn').addEventListener('click', async () => {
  if (!navigator.geolocation) {
    return alert("위치 정보 사용이 불가능합니다.");
  }

  navigator.geolocation.getCurrentPosition(async (position) => {
    const userLat = position.coords.latitude;
    const userLon = position.coords.longitude;

    try {
      const res = await fetch(`${API_BASE}/api/streetlamps/all`);
      const data = await res.json();

      // 5km 이내만 필터링
      const filtered = data.lamps.filter(lamp =>
        getDistance(userLat, userLon, lamp.lat, lamp.lng) <= 1000
      );

      // 기존 마커 제거
      streetlampMarkers.forEach(m => m.setMap(null));
      streetlampMarkers = [];

      const iconSize = parseInt(localStorage.getItem('iconSize')) || 30;
      const listEl = document.getElementById('resultList');
      listEl.innerHTML = `<div style="font-weight:bold; margin-bottom: 5px;">🔦 5km 이내 가로등 ${filtered.length}개</div>`;

      filtered.forEach((lamp, i) => {
        const marker = new naver.maps.Marker({
          position: new naver.maps.LatLng(lamp.lat, lamp.lng),
          map: map,
          icon: {
            content: `<img src="../../public/images/streetlamp.png" style="width:${iconSize}px;height:${iconSize}px;" />`,
            anchor: new naver.maps.Point(iconSize / 2, iconSize / 2)
          }
        });
        streetlampMarkers.push(marker);

        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerText = lamp.설치장소 || `ID: ${lamp.id}`;
        item.addEventListener('click', () => {
          map.setCenter(marker.getPosition());
        });
        listEl.appendChild(item);
      });

      map.setCenter(new naver.maps.LatLng(userLat, userLon));
      map.setZoom(13);
      document.querySelector('#list h3').innerText = "5km 이내 가로등 목록";

      drawFacilityChart({ cctv: 0, store: 0, hospital: 0, police: 0 });
      drawSafetyDonut(10); // 임의 안전 점수

    } catch (err) {
      console.error('❌ 5km 가로등 불러오기 실패:', err);
      alert('가로등 데이터를 불러오지 못했습니다.');
    }
  }, () => {
    alert("위치 권한이 필요합니다.");
  });
});




// ✅ 가로등 전용 마커 및 데이터
let streetlampMarkers = [];
let lastFetchedStreetlamps = [];

// ✅ 가로등 표시 및 리스트 갱신
function updateNearbyStreetlamps(lat, lon) {
  const filtered = lastFetchedStreetlamps.filter(lamp => getDistance(lat, lon, lamp.lat, lamp.lng) <= radius);
  const iconSize = parseInt(localStorage.getItem('iconSize')) || 30;

  // 기존 마커 제거
  streetlampMarkers.forEach(m => m.setMap(null));
  streetlampMarkers = [];

  // ✅ 히트맵 마커도 초기화
  if (!window.heatmapMarkers) window.heatmapMarkers = [];
  window.heatmapMarkers = window.heatmapMarkers.filter(m => m._cctv); // CCTV 마커만 유지

  // CCTV 리스트와는 별도로 가로등 리스트 영역 만들기
  const listEl = document.getElementById('resultList');
  listEl.innerHTML = `<div style="font-weight:bold; margin-bottom: 5px;">🔦 가로등 ${filtered.length}개</div>`;

  filtered.forEach((lamp, i) => {
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(lamp.lat, lamp.lng),
      map: map,
      icon: {
        content: `<img src="/images/streetlamp.png" style="width:${iconSize}px;height:${iconSize}px;" />`,
        anchor: new naver.maps.Point(iconSize / 2, iconSize / 2)
      }
    });

    // 일반 마커에 저장
    streetlampMarkers.push(marker);

    // ✅ 히트맵 마커로도 저장
    marker._lamp = true; // 구분 태그
    window.heatmapMarkers.push(marker);

    // 리스트 출력
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerText = lamp.설치장소 || '설치장소 미기재';
    item.dataset.index = i;
    item.addEventListener('click', () => {
      map.setCenter(marker.getPosition());
    });
    listEl.appendChild(item);
  });

  // 차트 및 안전 점수 반영
  const facilityData = {
    cctv: 0,
    store: 0,
    hospital: 0,
    police: 0
  };
  drawFacilityChart(facilityData);
  drawSafetyDonut(10); // 현재는 가로등에 대해 임의 점수 10점
}


// ✅ 가로등 API 호출
async function searchStreetlampsByCurrentLocation(lat, lon) {
  try {
    const res = await fetch(`${API_BASE}/api/streetlamps?lat=${lat}&lng=${lon}&radius=${radius}`);
    const data = await res.json();
    lastFetchedStreetlamps = data.lamps;
    updateNearbyStreetlamps(lat, lon);
  } catch (err) {
    console.error('❌ 가로등 검색 실패:', err);
    alert('가로등 데이터를 불러오지 못했습니다.');
  }
}



window.onload = () => {
  // ✅ 초기 상태 설정 (기본값 저장)
  if (localStorage.getItem('iconToggle') === null) {
    localStorage.setItem('iconToggle', 'true');
  }

  const iconToggle = localStorage.getItem('iconToggle') === 'true';
  const tabButtons = document.querySelectorAll('.tab-btn');
  const [heatBtn, lightBtn, cctvBtn] = tabButtons;

  // ✅ 초기 스타일 세팅
  const setButtonState = (btns, isEnabled) => {
    btns.forEach(btn => {
      btn.disabled = !isEnabled;
      btn.classList.toggle('alt', !isEnabled); // 비활성화 시 회색
      btn.style.cursor = isEnabled ? 'pointer' : 'not-allowed';
    });
  };

  // ✅ 아이콘 설정 토글에 따른 버튼 활성/비활성
  setButtonState([lightBtn, cctvBtn], iconToggle);

  // ✅ 히트맵 버튼은 항상 가능 (예시)
  heatBtn.disabled = false;
  heatBtn.classList.remove('alt');
  heatBtn.style.cursor = 'pointer';

  // ✅ 버튼 클릭 시 색상 토글 (비활성 버튼은 무시)
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!btn.disabled) {
        btn.classList.toggle('alt'); // 색상 토글
      }
    });
  }); 

  

  // ✅ 지도 기능 초기화
  initMap();
  initTabSync(map);
  updateRadiusLabel();
  searchByCurrentLocation();
  document.getElementById('radiusInput').addEventListener('input', updateRadiusLabel);
};

