
const iconSlider = document.getElementById('iconSlider');
const icon1 = document.getElementById('icon1');
const icon2 = document.getElementById('icon2');
const iconValue = document.getElementById('iconValue');
const iconToggle = document.getElementById('iconToggle');

const heatSlider = document.getElementById('heatSlider');
const heatValue = document.getElementById('heatValue');
const heatToggle = document.getElementById('heatToggle');

// 초기값 불러오기
window.addEventListener('DOMContentLoaded', () => {
    const savedIcon = localStorage.getItem('iconSize');
    const savedHeat = localStorage.getItem('heatOpacity');
    const iconToggled = localStorage.getItem('iconToggle') === 'true';
    const heatToggled = localStorage.getItem('heatToggle') === 'true';

    if (savedIcon) {
        iconSlider.value = savedIcon;
        icon1.style.width = `${savedIcon}px`;
        icon2.style.width = `${savedIcon}px`;
        iconValue.textContent = `${savedIcon}px`;
    }
    if (savedHeat) {
        heatSlider.value = savedHeat;
        heatValue.textContent = `${savedHeat}%`;
    }

    if (!iconToggled) iconToggle.classList.remove('active');
    if (!heatToggled) heatToggle.classList.remove('active');
});

iconSlider.addEventListener('input', () => {
    const size = iconSlider.value;
    icon1.style.width = `${size}px`;
    icon2.style.width = `${size}px`;
    iconValue.textContent = `${size}px`;
    localStorage.setItem('iconSize', size);
});

heatSlider.addEventListener('input', () => {
    heatValue.textContent = `${heatSlider.value}%`;
    localStorage.setItem('heatOpacity', heatSlider.value);
});

[iconToggle, heatToggle].forEach(toggle => {
    toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        localStorage.setItem(
            toggle.id === 'iconToggle' ? 'iconToggle' : 'heatToggle',
            toggle.classList.contains('active')
        );
    });
});

const openPopupBtn = document.querySelectorAll(".btn")[0];
const popupOverlay = document.getElementById("popupOverlay");
const circles = document.querySelectorAll('.circle');

// 팝업 열기
openPopupBtn.addEventListener('click', () => {
    popupOverlay.style.display = 'flex';
    const saved = localStorage.getItem('selectedRiskLevel');
    if (saved) {
        circles.forEach(c => {
            c.classList.toggle('selected', c.dataset.risk === saved);
        });
    } else {
        circles.forEach(c => c.classList.remove('selected'));
    }
});

// 팝업 닫기 함수
function closePopup() {
    popupOverlay.style.display = 'none';
}

// 선택/해제 로직 + 저장
circles.forEach(circle => {
    circle.addEventListener('click', () => {
        if (circle.classList.contains('selected')) {
            circle.classList.remove('selected');
            localStorage.removeItem('selectedRiskLevel');
        } else {
            circles.forEach(c => c.classList.remove('selected'));
            circle.classList.add('selected');
            localStorage.setItem('selectedRiskLevel', circle.dataset.risk);
        }
    });
});

const heatDots = [
    document.getElementById('dotRed'),
    document.getElementById('dotOrange'),
    document.getElementById('dotYellow'),
    document.getElementById('dotLightGreen'),
    document.getElementById('dotGreen')
];

function updateHeatDotOpacity(val) {
    const opacity = val / 100;
    heatDots.forEach(dot => {
        dot.style.opacity = opacity;
    });
}

// 슬라이더 변경 시 투명도 적용
document.getElementById('heatSlider').addEventListener('input', (e) => {
    const value = e.target.value;
    document.getElementById('heatValue').textContent = `${value}%`;
    updateHeatDotOpacity(value);
    localStorage.setItem('heatOpacity', value);
});

window.addEventListener('DOMContentLoaded', () => {
  // ✅ 기본값 없으면 true로 저장
  if (localStorage.getItem('iconToggle') === null) {
    localStorage.setItem('iconToggle', 'true');
  }
  if (localStorage.getItem('heatToggle') === null) {
    localStorage.setItem('heatToggle', 'true');
  }

  // ✅ 토글 DOM 요소
  const iconToggle = document.getElementById('iconToggle');
  const heatToggle = document.getElementById('heatToggle');

  // ✅ iconToggle UI 상태 반영
  const iconToggled = localStorage.getItem('iconToggle') === 'true';
  if (iconToggled) {
    iconToggle.classList.add('active');
  } else {
    iconToggle.classList.remove('active');
  }

  // ✅ heatToggle UI 상태 반영
  const heatToggled = localStorage.getItem('heatToggle') === 'true';
  if (heatToggled) {
    heatToggle.classList.add('active');
  } else {
    heatToggle.classList.remove('active');
  }

  // ✅ 아이콘 크기 초기화
  const savedIcon = localStorage.getItem('iconSize');
  if (savedIcon) {
    iconSlider.value = savedIcon;
    icon1.style.width = `${savedIcon}px`;
    icon2.style.width = `${savedIcon}px`;
    iconValue.textContent = `${savedIcon}px`;
  }

  // ✅ 히트맵 투명도 초기화
  const savedHeat = localStorage.getItem('heatOpacity') || '50';
  heatSlider.value = savedHeat;
  heatValue.textContent = `${savedHeat}%`;

  updateHeatDotOpacity(savedHeat); // ← 투명도 시각 적용 함수
});



