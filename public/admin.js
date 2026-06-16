/* =============================================
   VINCONS LUCKY DRAW – Admin JS
   Login, CRUD, real-time sync via Socket.IO
   ============================================= */

const socket = io();

// ─── DOM refs ──────────────────────────────────
const loginOverlay    = document.getElementById('login-overlay');
const adminWrapper    = document.getElementById('admin-wrapper');
const loginPassword   = document.getElementById('login-password');
const loginError      = document.getElementById('login-error');
const prizeNameInput  = document.getElementById('prize-name');
const prizeCountInput = document.getElementById('prize-count');
const allowRepeatInput = document.getElementById('allow-repeat');
const prizeBadge      = document.getElementById('admin-prize-badge');
const statTotal       = document.getElementById('admin-stat-total');
const statWinners     = document.getElementById('admin-stat-winners');
const statRemain      = document.getElementById('admin-stat-remain');
const workerListEl    = document.getElementById('worker-list');
const winnersListEl   = document.getElementById('winners-list');
const winnerBadge     = document.getElementById('admin-winner-badge');
const slotDisplay     = document.querySelector('.admin-slot-display');
const slotDigits      = document.getElementById('admin-slot-digits');
const winnerReveal    = document.getElementById('admin-winner-reveal');
const winnerMnv       = document.getElementById('admin-winner-mnv');
const winnerNameEl    = document.getElementById('admin-winner-name');
const spinBtn         = document.getElementById('admin-spin-btn');
const spinLabel       = document.getElementById('admin-spin-label');
const drawHint        = document.getElementById('admin-draw-hint');

let isSpinning = false;
let workers = [];
let winners = [];

// ─── Check Auth on Load ────────────────────────
(async function checkAuth() {
  try {
    const res = await fetch('/api/auth');
    const data = await res.json();
    if (data.isAdmin) {
      showAdminPanel();
    }
  } catch (err) {
    // Not logged in
  }
})();

// ─── Login ──────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const password = loginPassword.value;

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    const data = await res.json();

    if (res.ok) {
      showAdminPanel();
    } else {
      loginError.textContent = data.error || 'Đăng nhập thất bại!';
      loginError.style.display = 'block';
      loginPassword.value = '';
      loginPassword.focus();
    }
  } catch (err) {
    loginError.textContent = 'Lỗi kết nối server!';
    loginError.style.display = 'block';
  }
}

async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST' });
    loginOverlay.style.display = 'flex';
    adminWrapper.style.display = 'none';
    loginPassword.value = '';
    loginError.style.display = 'none';
  } catch (err) {
    showToast('Lỗi đăng xuất!', 'error');
  }
}

function showAdminPanel() {
  loginOverlay.style.display = 'none';
  adminWrapper.style.display = 'block';
  loadState();
}

// ─── Load State ─────────────────────────────────
async function loadState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();

    workers = data.workers || [];
    winners = data.winners || [];

    statTotal.textContent   = data.totalWorkers;
    statWinners.textContent = data.totalWinners;
    statRemain.textContent  = data.remaining;

    if (data.config) {
      prizeNameInput.value    = data.config.prizeName || 'Giải Đặc Biệt';
      prizeCountInput.value   = data.config.prizeCount || 1;
      allowRepeatInput.checked = !!data.config.allowRepeat;
      prizeBadge.textContent  = '🏆 ' + (data.config.prizeName || 'Giải Đặc Biệt');
    }

    renderWorkerList();
    renderWinnersList();

    // Update link URLs with current host
    const host = window.location.host;
    document.getElementById('display-link').textContent = `http://${host}/display`;
    document.getElementById('display-link').href = `/display`;
    document.getElementById('controller-link').textContent = `http://${host}/controller`;
    document.getElementById('controller-link').href = `/controller`;
  } catch (err) {
    showToast('Lỗi tải dữ liệu!', 'error');
  }
}

// ─── Socket Events ─────────────────────────────
socket.on('state-update', (data) => {
  statTotal.textContent   = data.totalWorkers;
  statWinners.textContent = data.totalWinners;
  statRemain.textContent  = data.remaining;

  if (data.config) {
    prizeBadge.textContent = '🏆 ' + (data.config.prizeName || 'Giải Đặc Biệt');
  }

  if (data.isSpinning && !isSpinning) {
    isSpinning = true;
    spinBtn.disabled = true;
    slotDisplay.classList.add('spinning');
    drawHint.textContent = '🎲 Đang bốc thăm...';
  }
});

socket.on('admin-state-update', (data) => {
  workers = data.workers || [];
  winners = data.winners || [];

  statTotal.textContent   = data.totalWorkers;
  statWinners.textContent = data.totalWinners;
  statRemain.textContent  = data.remaining;

  renderWorkerList();
  renderWinnersList();
});

socket.on('spin-start', (data) => {
  isSpinning = true;
  spinBtn.disabled = true;
  slotDisplay.classList.add('spinning');
  drawHint.textContent = '🎲 Đang bốc thăm...';

  // Mini slot animation
  animateSlotDigits(data.targetMNV);
});

socket.on('spin-result', (data) => {
  isSpinning = false;
  spinBtn.disabled = false;
  slotDisplay.classList.remove('spinning');
  slotDisplay.classList.add('winning');

  const primary = data.drawn[data.drawn.length - 1];
  slotDigits.textContent = primary.mnv;
  winnerMnv.textContent  = `MNV: ${primary.mnv}`;
  winnerNameEl.textContent = primary.name;
  winnerReveal.style.display = 'flex';

  // Re-trigger animation
  winnerReveal.style.animation = 'none';
  requestAnimationFrame(() => {
    winnerReveal.style.animation = '';
  });

  spinLabel.textContent = 'QUAY TIẾP';
  drawHint.textContent = `🎉 ${primary.name} trúng ${data.prizeName}!`;

  setTimeout(() => {
    slotDisplay.classList.remove('winning');
  }, 3000);
});

socket.on('config-update', (config) => {
  prizeNameInput.value    = config.prizeName || '';
  prizeCountInput.value   = config.prizeCount || 1;
  allowRepeatInput.checked = !!config.allowRepeat;
  prizeBadge.textContent  = '🏆 ' + (config.prizeName || 'Giải Thưởng');
});

socket.on('undo', (data) => {
  winnerReveal.style.display = 'none';
  slotDigits.textContent = '0000000';
  slotDisplay.classList.remove('winning');
  showToast(`↩️ Đã hủy: ${data.undone.name}`, 'info');
});

socket.on('clear', () => {
  winnerReveal.style.display = 'none';
  slotDigits.textContent = '0000000';
  slotDisplay.classList.remove('winning');
});

// ─── Mini Slot Animation ────────────────────────
function animateSlotDigits(targetMNV) {
  let frame = 0;
  const totalFrames = 60;
  const interval = setInterval(() => {
    frame++;
    let digits = '';
    for (let i = 0; i < 7; i++) {
      if (frame > totalFrames - (7 - i) * 5) {
        digits += targetMNV[i];
      } else {
        digits += Math.floor(Math.random() * 10);
      }
    }
    slotDigits.textContent = digits;
    if (frame >= totalFrames) clearInterval(interval);
  }, 80);
}

// ─── Update Config ──────────────────────────────
async function updateConfig() {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prizeName: prizeNameInput.value.trim() || 'Giải Thưởng',
        prizeCount: parseInt(prizeCountInput.value) || 1,
        allowRepeat: allowRepeatInput.checked,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      showToast('✅ Đã lưu cấu hình!', 'success');
    } else {
      showToast(data.error || 'Lỗi lưu cấu hình!', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối server!', 'error');
  }
}

// ─── File Upload ────────────────────────────────
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`✅ Import thành công: ${data.added} công nhân${data.skipped ? ` (bỏ qua ${data.skipped})` : ''}`, 'success');
    } else {
      showToast(data.error || 'Lỗi import!', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối server!', 'error');
  }
}

// ─── Manual Add ─────────────────────────────────
async function addManual() {
  const mnv  = document.getElementById('manual-mnv').value.trim();
  const name = document.getElementById('manual-name').value.trim();

  if (!mnv || !name) {
    showToast('Vui lòng nhập MNV và họ tên!', 'error');
    return;
  }

  try {
    const res = await fetch('/api/worker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mnv, name, dept: '' }),
    });

    const data = await res.json();
    if (res.ok) {
      document.getElementById('manual-mnv').value  = '';
      document.getElementById('manual-name').value = '';
      showToast(`➕ Đã thêm: ${name}`, 'success');
    } else {
      showToast(data.error || 'Lỗi thêm CN!', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối server!', 'error');
  }
}

// ─── Admin Spin ─────────────────────────────────
async function adminSpin() {
  if (isSpinning) return;

  try {
    const res = await fetch('/api/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Có lỗi xảy ra!', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối server!', 'error');
  }
}

// ─── Undo ───────────────────────────────────────
async function undoLastWinner() {
  try {
    const res = await fetch('/api/undo', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Lỗi!', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối server!', 'error');
  }
}

// ─── Clear ──────────────────────────────────────
async function clearWorkers() {
  if (!confirm('Xóa toàn bộ danh sách công nhân và người trúng thưởng?')) return;

  try {
    const res = await fetch('/api/clear', { method: 'POST' });
    if (res.ok) {
      showToast('🗑️ Đã xóa toàn bộ!', 'info');
    }
  } catch (err) {
    showToast('Lỗi kết nối!', 'error');
  }
}

// ─── Shuffle ────────────────────────────────────
async function shuffleWorkers() {
  try {
    const res = await fetch('/api/shuffle', { method: 'POST' });
    if (res.ok) {
      showToast('🔀 Đã xáo trộn!', 'success');
    }
  } catch (err) {
    showToast('Lỗi kết nối!', 'error');
  }
}

// ─── Export ─────────────────────────────────────
function exportWinners() {
  if (winners.length === 0) {
    showToast('Chưa có người trúng thưởng!', 'error');
    return;
  }
  window.location.href = '/api/export';
}

// ─── Render ─────────────────────────────────────
function renderWorkerList() {
  if (workers.length === 0) {
    workerListEl.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <p>Chưa có công nhân.<br/>Import Excel hoặc thêm thủ công.</p>
      </div>`;
    return;
  }

  const wonSet = new Set(winners.map(w => w.mnv));
  workerListEl.innerHTML = workers.map(w => {
    const won = wonSet.has(w.mnv);
    return `<div class="worker-item${won ? ' is-winner' : ''}">
      <span class="worker-mnv-tag">${w.mnv}</span>
      <span class="worker-name-tag">${escapeHtml(w.name)}</span>
      ${w.dept ? `<span class="worker-dept-tag">${escapeHtml(w.dept)}</span>` : ''}
    </div>`;
  }).join('');
}

function renderWinnersList() {
  winnerBadge.textContent = winners.length;

  if (winners.length === 0) {
    winnersListEl.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <p>Chưa có người trúng thưởng.<br/>Hãy bắt đầu quay số!</p>
      </div>`;
    return;
  }

  winnersListEl.innerHTML = [...winners].reverse().map(w => `
    <div class="winner-card">
      <span class="winner-card-rank">#${w.rank} – ${escapeHtml(w.prize)}</span>
      <div class="winner-card-mnv">MNV: ${w.mnv}</div>
      <div class="winner-card-name">${escapeHtml(w.name)}</div>
      ${w.dept ? `<div class="winner-card-prize">📌 ${escapeHtml(w.dept)}</div>` : ''}
      <div class="winner-card-prize" style="color:var(--text-muted);font-size:0.7rem;margin-top:2px">🕐 ${w.time}</div>
    </div>`).join('');
}

// ─── Utils ──────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ─── Keyboard Shortcut ──────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.matches('input')) {
    e.preventDefault();
    adminSpin();
  }
});
