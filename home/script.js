// 📌 상단 설정
const API_BASE = 'https://cctv-api-server.onrender.com';
let map, radius = 100;
let markers = [], infoWindows = [], circles = [], userCircle = null;
let currentUserLat = null, currentUserLon = null;
let cctvVisible = true; // CCTV 마커 표시 여부
let lampVisible = true; // 가로등 마커 표시 여부
let heatmapVisible = false;

function enableHeatmap() {
  if (!heatmapVisible) {
    toggleHeatmap();
  }
}


function toggleHeatmap() {
  heatmapVisible = !heatmapVisible;

  const heatBtn = document.getElementById('btnHeat');
  if (heatBtn) {
    heatBtn.classList.remove('active', 'alt');
    heatBtn.classList.add(heatmapVisible ? 'active' : 'alt');
  }

  if (heatmapOverlay) {
    heatmapOverlay.setMap(null);
    heatmapOverlay = null;
  }

  if (heatmapVisible && currentUserLat && currentUserLon) {
    const cctvFiltered = window.lastFetchedCCTV?.filter(loc =>
      getDistance(currentUserLat, currentUserLon, loc.lat, loc.lot) <= radius
    ) || [];

    const lampFiltered = window.lastFetchedStreetlamps?.filter(lamp =>
      getDistance(currentUserLat, currentUserLon, lamp.lat, lamp.lng) <= radius
    ) || [];

    const heatmapPoints = [
      ...cctvFiltered.map(loc => new naver.maps.LatLng(loc.lat, loc.lot)),
      ...lampFiltered.map(lamp => new naver.maps.LatLng(lamp.lat, lamp.lng))
    ];

    heatmapOverlay = new naver.maps.visualization.HeatMap({
      map: map,
      radius: 30,
      opacity: 0.6,
      data: heatmapPoints
    });
  }
}


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
      toggleHeatmap();  // 끄고
      toggleHeatmap();  // 다시 켬
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
      labels: ['시설'],
      datasets: [
        {
          label: 'CCTV',
          data: [data.cctv || 0],
          backgroundColor: '#2f80ed'
        },
        {
          label: '가로등',
          data: [data.lamp || 0],
          backgroundColor: '#10b981'
        }
      ]
    },
    options: {
      responsive: false,
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    }
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

function calculateSafetyScore({ cctv = 0, lamp = 0, accidentCount = 0, policeDist = 0 }) {
  const cctvWeight = 0.3;
  const lampWeight = 0.2;
  const accidentWeight = -0.3;
  const policeWeight = 0.2;

  const cctvScore = Math.min(cctv / 50, 1) * 100;
  const lampScore = Math.min(lamp / 100, 1) * 100;
  const accidentScore = Math.max(100 - accidentCount * 10, 0);
  const policeScore = Math.max(0, 100 - (policeDist / 3000) * 100);

  const finalScore = (
    cctvScore * cctvWeight +
    lampScore * lampWeight +
    accidentScore * Math.abs(accidentWeight) +
    policeScore * policeWeight
  );

  return Math.round(Math.min(finalScore, 100));
}



// 📌 시설 필터링 및 다시 그리기
function updateNearbyFacilities(lat, lon) {
  const filtered = window.lastFetchedCCTV?.filter(loc => getDistance(lat, lon, loc.lat, loc.lot) <= radius) || [];
  const iconSize = parseInt(localStorage.getItem('iconSize')) || 30;
  markers.forEach(m => {
  if (cctvVisible) {
      m.setMap(map);
    } else {
      m.setMap(null);
    }
  });
  infoWindows.forEach(iw => iw.setMap(null));
  markers = [];
  infoWindows = [];
  document.getElementById('resultList').innerHTML = '';

  filtered.forEach((loc, i) => {
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(loc.lat, loc.lot),
      map: cctvVisible ? map : null, // 🔧 상태 반영
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

    marker.addListener('mouseover', () => {
      infoWindows.forEach(iw => iw.close());
      infoWindow.open(map, marker);
    });
    marker.addListener('mouseout', () => {
      infoWindow.close();
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
    lamp: lastFetchedStreetlamps?.filter(lamp => getDistance(lat, lon, lamp.lat, lamp.lng) <= radius).length || 0,
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
      if (!districtName) return;

      try {
        const res = await fetch(`${API_BASE}/api/cctv?q=${encodeURIComponent(districtName)}`);
        const data = await res.json();
        window.lastFetchedCCTV = data;

        updateNearbyFacilities(lat, lon);
        searchStreetlampsByCurrentLocation(lat, lon);

        // ✅ 데이터 로드 후 히트맵 표시
        enableHeatmap();
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
  listEl.innerHTML = `<div style="font-weight:bold; margin-bottom: 5px;"> -> 가로등 ${filtered.length}개</div>`;

  filtered.forEach((lamp, i) => {
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(lamp.lat, lamp.lng),
      map: lampVisible ? map : null, // 🔧 이거 필수
      icon: {
        content: `<img src="/public/images/streetlamp.png" style="width:${iconSize}px;height:${iconSize}px;" />`,
        anchor: new naver.maps.Point(iconSize / 2, iconSize / 2)
      }
    });
    ;

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
    cctv: filtered.length,
    lamp: lastFetchedStreetlamps?.filter(lamp => getDistance(lat, lon, lamp.lat, lamp.lng) <= radius).length || 0,
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

    // 🔁 가로등 반영 후, CCTV와 함께 시설 차트 다시 그림
    updateNearbyFacilities(lat, lon); // ✅ 여기서 다시 호출
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

  // ✅ 지도 기능 초기화 (map 먼저 세팅해야 이후 함수 오류 안남)
  initMap();
  initTabSync(map);
  updateRadiusLabel();

  // ✅ 히트맵 버튼 스타일 및 클릭 연결
  if (heatBtn) {
    heatBtn.disabled = false;
    heatBtn.style.cursor = 'pointer';
    
    // ✅ 항상 활성 상태로 시작
    heatBtn.classList.add('active');
    heatBtn.classList.remove('alt');

    heatmapVisible = true; // ✅ 상태도 true로 미리 설정
    heatBtn.addEventListener('click', toggleHeatmap);

    if (heatmapVisible) {
      heatBtn.classList.add('active');
      heatBtn.classList.remove('alt');
    } else {
      heatBtn.classList.add('alt');
      heatBtn.classList.remove('active');
    }

    heatBtn.addEventListener('click', toggleHeatmap);
  }

  // ✅ 아이콘 설정 토글에 따른 CCTV / 가로등 버튼 상태 세팅
  const setButtonState = (btns, isEnabled) => {
    btns.forEach(btn => {
      btn.disabled = !isEnabled;
      btn.classList.toggle('alt', !isEnabled); // 비활성화 시 회색
      btn.style.cursor = isEnabled ? 'pointer' : 'not-allowed';
    });
  };
  setButtonState([lightBtn, cctvBtn], iconToggle);

  // ✅ 탭 버튼 클릭 시 alt 토글
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!btn.disabled && btn !== heatBtn) {
        btn.classList.toggle('alt');
      }
    });
  });

  // ✅ 항상 현위치 기반 탐색 실행
  searchByCurrentLocation();

  // ✅ 반경 슬라이더 입력 이벤트 연결
  document.getElementById('radiusInput').addEventListener('input', updateRadiusLabel);
};



document.getElementById('radiusLabel').addEventListener('click', () => {
  const labelSpan = document.getElementById('radiusLabel');
  const currentValue = labelSpan.innerText;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = 50;
  input.max = 1500;
  input.value = currentValue;
  input.style.width = '60px';
  input.id = 'radiusTextInput';

  labelSpan.replaceWith(input);
  input.focus();

  let alreadyFinalized = false;

  const finalizeInput = () => {
    if (alreadyFinalized) return;
    alreadyFinalized = true;

    let val = parseInt(input.value);
    if (isNaN(val)) val = radius;
    val = Math.max(50, Math.min(1500, val));
    document.getElementById('radiusInput').value = val;
    updateRadiusLabel();

    const span = document.createElement('span');
    span.id = 'radiusLabel';
    span.innerText = val;
    span.style.cursor = 'pointer';

    if (input.parentNode && input.parentNode.contains(input)) {
      input.replaceWith(span);
    }

    span.addEventListener('click', () => {
      input.value = span.innerText;
      span.replaceWith(input);
      input.focus();
      alreadyFinalized = false;
    });
  };

  input.addEventListener('blur', finalizeInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finalizeInput();
  });
});


let lampMarkers = []; // 전역에 선언되어 있어야 함

function updateNearbyStreetlamps(lat, lon) {
  // 기존 마커 제거
  lampMarkers.forEach(m => m.setMap(null));
  lampMarkers = [];

  if (!lastFetchedStreetlamps) return;

  const iconSize = 20;

  // 반경 내 필터링
  const filtered = lastFetchedStreetlamps.filter(lamp =>
    getDistance(lat, lon, lamp.lat, lamp.lng) <= radius
  );

  filtered.forEach(lamp => {
    const marker = new naver.maps.Marker({
      position: new naver.maps.LatLng(lamp.lat, lamp.lng),
      map: lampVisible ? map : null,
      icon: {
        content: `<img src="/public/images/streetlamp.png" style="width:${iconSize}px;height:${iconSize}px;" />`,
        anchor: new naver.maps.Point(iconSize / 2, iconSize / 2)
      }
    });

    lampMarkers.push(marker);
  });
}

function toggleCCTVMarkers() {
  cctvVisible = !cctvVisible;
  markers.forEach(m => m.setMap(cctvVisible ? map : null));
  
  const btn = document.getElementById('btnCCTV');
  btn.classList.toggle('active', cctvVisible);
  btn.classList.toggle('alt', !cctvVisible);
}



function toggleLampMarkers() {
  lampVisible = !lampVisible;
  lampMarkers.forEach(m => m.setMap(lampVisible ? map : null));

  const btn = document.getElementById('btnLamp');
  btn.classList.toggle('active', lampVisible);
  btn.classList.toggle('alt', !lampVisible);
}


// 반경 라벨 클릭 시 입력창으로 전환
document.getElementById('radiusLabel').addEventListener('click', () => {
  const labelSpan = document.getElementById('radiusLabel');
  const currentValue = labelSpan.innerText;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = 50;
  input.max = 1500;
  input.value = currentValue;
  input.style.width = '60px';
  input.id = 'radiusTextInput';

  labelSpan.replaceWith(input);
  input.focus();

  let alreadyFinalized = false;  // 💡 플래그 추가

  const finalizeInput = () => {
    if (alreadyFinalized) return; // 중복 방지
    alreadyFinalized = true;

    let val = parseInt(input.value);
    if (isNaN(val)) val = radius;
    val = Math.max(50, Math.min(1500, val));
    document.getElementById('radiusInput').value = val;
    updateRadiusLabel();

    const span = document.createElement('span');
    span.id = 'radiusLabel';
    span.innerText = val;
    span.style.cursor = 'pointer';

    if (input.parentNode && input.parentNode.contains(input)) {
      input.replaceWith(span);
    }

    // 다시 클릭 이벤트 연결
    span.addEventListener('click', () => {
      input.value = span.innerText;
      span.replaceWith(input);
      input.focus();
      alreadyFinalized = false; // 재진입 가능하게 초기화
    });
  };

  input.addEventListener('blur', finalizeInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finalizeInput();
  });
});


document.getElementById('searchBtn').addEventListener('click', async () => {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return alert("주소를 입력해주세요.");

  naver.maps.Service.geocode({ query }, async (status, response) => {
    if (status !== naver.maps.Service.Status.OK) {
      return alert('주소 검색 실패');
    }

    const result = response.v2.addresses[0];
    if (!result?.x || !result?.y) return alert('좌표 정보를 찾을 수 없습니다.');

    const lat = parseFloat(result.y);
    const lon = parseFloat(result.x);
    const location = new naver.maps.LatLng(lat, lon);
    currentUserLat = lat;
    currentUserLon = lon;

    map.setCenter(location);
    map.setZoom(15);

    // 🔄 기존 원 제거 후 새로 생성
    if (userCircle) userCircle.setMap(null);
    userCircle = new naver.maps.Circle({
      map: map,
      center: location,
      radius: radius,
      strokeColor: '#2f80ed',
      strokeOpacity: 0.8,
      strokeWeight: 1,
      fillColor: '#2f80ed',
      fillOpacity: 0.2
    });

    // 🔵 파란 원 중앙 마커
    new naver.maps.Marker({
      position: location,
      map: map,
      icon: {
        content: `<div style="width: 18px; height: 18px; background: blue; border-radius: 50%; border: 2px solid white;"></div>`,
        anchor: new naver.maps.Point(9, 9)
      }
    });

    // 📍 주소 출력
    document.getElementById('currentAddress').innerText =
      `📍 검색 주소: ${result.roadAddress || result.jibunAddress}`;

    // 📡 CCTV 불러오기
    const district = result.jibunAddress?.match(/([가-힣]+구)/)?.[1];
    if (!district) return alert('구 정보를 찾을 수 없습니다.');

    try {
      const res = await fetch(`${API_BASE}/api/cctv?q=${encodeURIComponent(district)}`);
      const data = await res.json();
      window.lastFetchedCCTV = data; // 데이터 저장
      updateNearbyFacilities(lat, lon);
    } catch (err) {
      console.error('❌ CCTV 검색 실패:', err);
      alert('CCTV 정보를 불러오지 못했습니다.');
    }

    // 🔦 가로등도 호출
    searchStreetlampsByCurrentLocation(lat, lon);
  });
});
