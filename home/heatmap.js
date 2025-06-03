// ✅ heatmap.js 상단에 추가
async function getDistrictName(lat, lon) {
  return new Promise((resolve, reject) => {
    naver.maps.Service.reverseGeocode({
      coords: new naver.maps.LatLng(lat, lon),
      orders: naver.maps.Service.OrderType.ADDR
    }, (status, response) => {
      if (status !== naver.maps.Service.Status.OK) {
        return reject('Reverse geocode 실패');
      }
      const fullAddress = response.v2.address?.jibunAddress || '';
      const district = fullAddress.match(/([가-힣]+구)/)?.[1] || '';
      resolve(district);
    });
  });
}



const heatmap = (() => {
  let heatmapOverlay = null;

  async function show(map, lat, lon, radius) {
    if (!map) return;

    // 🔄 기존 마커 제거
    if (window.heatmapMarkers) {
      window.heatmapMarkers.forEach(m => m.setMap(null));
    }
    window.heatmapMarkers = [];

    const districtName = await getDistrictName(lat, lon); // 주소 변환

    // ✅ CCTV 처리
    let cctvPoints = [];
    let cctvCount = 0;
    try {
      const res = await fetch(`${API_BASE}/api/cctv?q=${encodeURIComponent(districtName)}`);
      const data = await res.json();
      const nearby = data.filter(item => getDistance(lat, lon, item.lat, item.lot) <= radius);
      cctvPoints = nearby.map(item => new naver.maps.LatLng(item.lat, item.lot));
      cctvCount = nearby.length;

      nearby.forEach(item => {
        const marker = new naver.maps.Marker({
          position: new naver.maps.LatLng(item.lat, item.lot),
          map,
          icon: {
            content: `<img src="/public/images/cctv.png" style="width:25px;height:25px;" />`,
            anchor: new naver.maps.Point(12, 12)
          }
        });
        window.heatmapMarkers.push(marker);
      });
    } catch (err) {
      console.warn('❌ CCTV 불러오기 실패:', err);
    }

    // ✅ 가로등 처리
    let lampPoints = [];
    let lampCount = 0;
    try {
      const res = await fetch(`${API_BASE}/api/streetlamps/all`);
      const data = await res.json();
      const nearby = data.lamps.filter(item => getDistance(lat, lon, item.lat, item.lng) <= radius);
      lampPoints = nearby.map(item => new naver.maps.LatLng(item.lat, item.lng));
      lampCount = nearby.length;
    } catch (err) {
      console.warn('❌ 가로등 불러오기 실패:', err);
    }

    // ✅ 히트맵 생성
    const heatmapData = [...cctvPoints, ...lampPoints];
    if (heatmapOverlay) heatmapOverlay.setMap(null);
    heatmapOverlay = new naver.maps.visualization.HeatMap({
      data: heatmapData,
      radius: 30,
      opacity: 0.6
    });
    heatmapOverlay.setMap(map); // 🔥 중요

  }

  return { show };
})();
