/* =============================================
   VINCONS LUCKY DRAW – Controller JS
   iPad spin button → triggers server draw
   ============================================= */

const socket = io();

// ─── DOM refs ──────────────────────────────────
const spinBtn       = document.getElementById('ctrl-spin-btn');
const spinText      = document.getElementById('ctrl-spin-text');
const spinHint      = document.getElementById('ctrl-spin-hint');
const prizeName     = document.getElementById('ctrl-prize-name');
const totalEl       = document.getElementById('ctrl-total');
const winnersEl     = document.getElementById('ctrl-winners');
const remainEl      = document.getElementById('ctrl-remain');
const lastWinnerEl  = document.getElementById('ctrl-last-winner');
const winnerMnvEl   = document.getElementById('ctrl-winner-mnv');
const winnerNameEl  = document.getElementById('ctrl-winner-name');
const winnerDeptEl  = document.getElementById('ctrl-winner-dept');
const statusDot     = document.getElementById('ctrl-status-dot');
const statusText    = document.getElementById('ctrl-status-text');

let isSpinning = false;

// ─── PARTICLES ─────────────────────────────────
(function initParticles() {
  const container = document.getElementById('particles-container');
  const colors = ['#3d5faf', '#5a7dcc', '#f0c040', '#00d4ff', '#8fa8e0', '#2d4a91', '#f7d96a'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = 2 + Math.random() * 4;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${6+Math.random()*10}s;
      animation-delay:${Math.random()*10}s;
    `;
    container.appendChild(p);
  }
})();

// ─── Socket Events ─────────────────────────────
socket.on('connect', () => {
  statusDot.classList.add('connected');
  statusText.textContent = 'Đã kết nối';
});

socket.on('disconnect', () => {
  statusDot.classList.remove('connected');
  statusText.textContent = 'Mất kết nối...';
});

socket.on('state-update', (data) => {
  totalEl.textContent   = data.totalWorkers;
  winnersEl.textContent = data.totalWinners;
  remainEl.textContent  = data.remaining;
  prizeName.textContent = data.config.prizeName || 'Giải Thưởng';

  if (data.isSpinning && !isSpinning) {
    setSpinningState();
  } else if (!data.isSpinning && isSpinning) {
    setReadyState();
  }
});

socket.on('config-update', (config) => {
  prizeName.textContent = config.prizeName || 'Giải Thưởng';
});

socket.on('spin-start', () => {
  setSpinningState();
});

socket.on('spin-result', (data) => {
  setReadyState();

  // Show last winner
  const primary = data.drawn[data.drawn.length - 1];
  winnerMnvEl.textContent  = `MNV: ${primary.mnv}`;
  winnerNameEl.textContent = primary.name;
  winnerDeptEl.textContent = primary.dept ? `📌 ${primary.dept}` : '';
  lastWinnerEl.style.display = 'block';

  // Re-trigger animation
  lastWinnerEl.style.animation = 'none';
  requestAnimationFrame(() => {
    lastWinnerEl.style.animation = '';
  });

  spinText.textContent = 'QUAY TIẾP';
  spinHint.textContent = '🎉 Chúc mừng người trúng thưởng!';

  setTimeout(() => {
    spinHint.textContent = 'Chạm để quay số tiếp theo';
  }, 5000);
});

socket.on('undo', () => {
  lastWinnerEl.style.display = 'none';
  spinText.textContent = 'QUAY SỐ';
  spinHint.textContent = 'Chạm để bắt đầu quay số';
});

socket.on('clear', () => {
  lastWinnerEl.style.display = 'none';
  spinText.textContent = 'QUAY SỐ';
  spinHint.textContent = 'Chạm để bắt đầu quay số';
});

// ─── Spin Request ───────────────────────────────
async function requestSpin() {
  if (isSpinning) return;

  try {
    const res = await fetch('/api/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Có lỗi xảy ra!', 'error');
      return;
    }
  } catch (err) {
    showToast('Lỗi kết nối server!', 'error');
  }
}

// ─── UI State ───────────────────────────────────
function setSpinningState() {
  isSpinning = true;
  spinBtn.disabled = true;
  spinBtn.classList.add('spinning');
  spinText.textContent = 'ĐANG QUAY...';
  spinHint.textContent = '🎲 Đang bốc thăm...';
}

function setReadyState() {
  isSpinning = false;
  spinBtn.disabled = false;
  spinBtn.classList.remove('spinning');
}

// ─── Utils ──────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// Prevent pull-to-refresh on iPad
document.addEventListener('touchmove', (e) => {
  if (e.target === document.body || e.target === document.documentElement) {
    e.preventDefault();
  }
}, { passive: false });
