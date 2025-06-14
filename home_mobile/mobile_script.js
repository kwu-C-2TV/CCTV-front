// 📌 상단 설정
const API_BASE = 'https://cctv-api-server.onrender.com';
let map, radius = 100;
let markers = [], infoWindows = [], circles = [], userCircle = null;
let currentUserLat = null, currentUserLon = null;
let cctvVisible = true; // CCTV 마커 표시 여부
let lampVisible = true; // CCTV 마커 표시 여부
let heatmapVisible = false;
let heatmapOverlay = null;

function toggleHeatmap() {
  heatmapVisible = !heatmapVisible;

  const heatBtn = document.getElementById('btnHeat');
  if (heatBtn) {
    heatBtn.classList.remove('active', 'alt');
    heatBtn.classList.add(heatmapVisible ? 'active' : 'alt');
  }

  // 기존 히트맵 제거
  if (heatmapOverlay) {
    heatmapOverlay.setMap(null);
    heatmapOverlay = null;
  }

  // 히트맵 다시 생성 (현재 위치 주변 시설 기준)
  if (heatmapVisible && currentUserLat && currentUserLon) {
    const filtered = window.lastFetchedCCTV?.filter(loc =>
      getDistance(currentUserLat, currentUserLon, loc.lat, loc.lot) <= radius
    ) || [];

    const heatmapPoints = filtered.map(loc => new naver.maps.LatLng(loc.lat, loc.lot));

    heatmapOverlay = new naver.maps.visualization.HeatMap({
      map: map,
      radius: 30,
      opacity: 0.6,
      data: heatmapPoints,
      gradient: [
        'rgba(255, 255, 204, 0)',   // 밝은 노랑
        'rgba(199, 233, 180, 0.6)', // 연초록
        'rgba(127, 205, 187, 0.7)', // 청록
        'rgba(65, 182, 196, 0.8)',  // 청록 중간
        'rgba(44, 127, 184, 0.9)',  // 파랑
        'rgba(37, 52, 148, 1)'      // 짙은 파랑
      ]
    });
  }

  //console.log('🔥 히트맵 토글됨 →', heatmapVisible);
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
  
  const label = document.getElementById('radiusLabel');
  if (label) label.innerText = radius; // 🔧 null 체크 추가

  if (userCircle) {
    userCircle.setRadius(radius);
    userCircle.setCenter(new naver.maps.LatLng(currentUserLat, currentUserLon));
  }

  if (userCircle && currentUserLat && currentUserLon) {
    updateNearbyFacilities(currentUserLat, currentUserLon);
    searchStreetlampsByCurrentLocation(currentUserLat, currentUserLon);
    updateNearbyStreetlamps(currentUserLat, currentUserLon);
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
  document.getElementById('safetyScoreLabel').innerText = `${score}점`;

  // 점수에 따라 score-badge 배경색 변경
  const scoreBadge = document.getElementById('safetyScoreLabel');
  if (score >= 80) scoreBadge.style.backgroundColor = '#6cd38e'; // 초록
  else if (score >= 60) scoreBadge.style.backgroundColor = '#9df29d'; // 연초록
  else if (score >= 40) scoreBadge.style.backgroundColor = '#f9ec8d'; // 노랑
  else if (score >= 20) scoreBadge.style.backgroundColor = '#f8b878'; // 주황
  else scoreBadge.style.backgroundColor = '#f26d6d'; // 빨강

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

function calculateSafetyScore({ cctv, store, hospital, police }) {
  const weight = { cctv: 5, store: 7, hospital: 10, police: 15 };
  const rawScore = cctv * weight.cctv + store * weight.store + hospital * weight.hospital + police * weight.police;
  const maxScore = 10 * weight.cctv + 5 * weight.store + 2 * weight.hospital + 2 * weight.police;
  return Math.min(Math.round((rawScore / maxScore) * 100), 100);
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
        content: `<img src="../public/images/cctv.png" style="width:${iconSize}px;height:${iconSize}px;" />`,
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

window.onload = () => {
  if (localStorage.getItem('iconToggle') === null) {
    localStorage.setItem('iconToggle', 'true');
  }

  const iconToggle = localStorage.getItem('iconToggle') === 'true';
  const tabButtons = document.querySelectorAll('.circle-btn');
  const [heatBtn, lightBtn, cctvBtn] = tabButtons;
  

  const setButtonState = (btns, isEnabled) => {
    btns.forEach(btn => {
      btn.disabled = !isEnabled;
      btn.classList.toggle('alt', !isEnabled);
      btn.style.cursor = isEnabled ? 'pointer' : 'not-allowed';
    });
  };

  setButtonState([lightBtn, cctvBtn], iconToggle);

  heatBtn.disabled = false;
  heatBtn.style.cursor = 'pointer';

  // 🔧 버튼 클릭 시 .alt 토글은 heatBtn 제외
  tabButtons.forEach(btn => {
    if (btn.id !== 'btnHeat') {
      btn.addEventListener('click', () => {
        if (!btn.disabled) {
          btn.classList.toggle('alt');
        }
      });
    }
  });

  // 🔧 heatBtn 초기 스타일 동기화
  if (heatmapVisible) {
    heatBtn.classList.add('active');
    heatBtn.classList.remove('alt');
  } else {
    heatBtn.classList.add('alt');
    heatBtn.classList.remove('active');
  }

  // 🔧 heatBtn 기능 연결
  heatBtn.addEventListener('click', () => {
    toggleHeatmap();
  });

  initMap();
  updateRadiusLabel();
  searchByCurrentLocation();
  document.getElementById('radiusInput').addEventListener('input', updateRadiusLabel);
};



//토글
function toggleCCTVMarkers() {
  cctvVisible = !cctvVisible;
  markers.forEach(marker => {
    marker.setMap(cctvVisible ? map : null);
  });
}


document.getElementById('searchBtn').addEventListener('click', () => {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return alert("주소를 입력해주세요.");

  naver.maps.Service.geocode({
    query: query
  }, async function (status, response) {
    if (status !== naver.maps.Service.Status.OK) {
      return alert('주소 검색 실패');
    }

    const results = response.v2.addresses;
    if (!results || results.length === 0) {
      return alert('검색 결과가 없습니다. 에) 광운로 20');
    }

    const result = results[0];

    if (!result.y || !result.x) {
      return alert('좌표 정보를 찾을 수 없습니다.');
    }

    //const result = response.v2.addresses[0];
    const lat = parseFloat(result.y);
    const lon = parseFloat(result.x);
    const location = new naver.maps.LatLng(lat, lon);


    currentUserLat = lat;
    currentUserLon = lon;


    // 지도 이동
    map.setCenter(location);
    map.setZoom(15);

    // 기존 원 제거
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

    new naver.maps.Marker({
      position: location,
      map: map,
      icon: {
        content: `<div style="width: 18px; height: 18px; background: blue; border-radius: 50%; border: 2px solid white;"></div>`,
        anchor: new naver.maps.Point(9, 9)
      }
    });

    // 주소 표시
    document.getElementById('currentAddress').innerText = `📍 검색 주소: ${result.roadAddress || result.jibunAddress}`;

    // CCTV 불러오기
    const district = result.jibunAddress?.match(/([가-힣]+구)/)?.[1];
    if (!district) return alert('구 정보를 찾을 수 없습니다.');

    try {
      const res = await fetch(`${API_BASE}/api/cctv?q=${encodeURIComponent(district)}`);
      const data = await res.json();
      window.lastFetchedCCTV = data;
      updateNearbyFacilities(lat, lon);
    } catch (err) {
      console.error('❌ CCTV 검색 실패:', err);
      alert('CCTV 정보를 불러오지 못했습니다.');
    }

    // 가로등도 불러오기
    searchStreetlampsByCurrentLocation(lat, lon);
  });
});

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
        content: `<img src="../public/images/streetlamp.png" style="width:${iconSize}px;height:${iconSize}px;" />`,
        anchor: new naver.maps.Point(iconSize / 2, iconSize / 2)
      }
    });

    lampMarkers.push(marker);
  });
}


function toggleLampMarkers() {
  lampVisible = !lampVisible;
  lampMarkers.forEach(marker => {
    marker.setMap(lampVisible ? map : null);
  });
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
