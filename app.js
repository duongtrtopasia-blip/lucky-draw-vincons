/* =============================================
   VINCONS LUCKY DRAW – JavaScript Logic
   ============================================= */

// ─── State ─────────────────────────────────────
const state = {
  workers: [],   // { mnv, name, dept }
  winners: [],   // { mnv, name, dept, prize, time, rank }
  isSpinning: false,
};

// ─── DOM refs ──────────────────────────────────
const slotDigits        = document.getElementById('slot-digits');
const slotMachineInner  = document.querySelector('.slot-machine-inner');
const slotGlow          = document.getElementById('slot-glow');
const winnerReveal      = document.getElementById('winner-reveal');
const winnerMnv         = document.getElementById('winner-mnv');
const winnerName        = document.getElementById('winner-name');
const winnerDept        = document.getElementById('winner-dept');
const workerListEl      = document.getElementById('worker-list');
const winnersListEl     = document.getElementById('winners-list');
const spinBtn           = document.getElementById('btn-spin');
const spinLabel         = document.getElementById('spin-label');
const drawHint          = document.getElementById('draw-hint');
const statTotal         = document.getElementById('stat-total');
const statWinners       = document.getElementById('stat-winners');
const statRemain        = document.getElementById('stat-remain');
const prizeBadge        = document.getElementById('prize-badge');
const winnerBadge       = document.getElementById('winner-badge');
const prizeNameInput    = document.getElementById('prize-name');
const prizeCountInput   = document.getElementById('prize-count');
const allowRepeatInput  = document.getElementById('allow-repeat');

// ─── Update prize badge on input ───────────────
prizeNameInput.addEventListener('input', () => {
  prizeBadge.textContent = '🏆 ' + (prizeNameInput.value || 'Giải Thưởng');
});

// ─── PARTICLES ─────────────────────────────────
(function initParticles() {
  const container = document.getElementById('particles-container');
  const colors = ['#3d5faf', '#5a7dcc', '#f0c040', '#00d4ff', '#8fa8e0', '#2d4a91', '#f7d96a'];
  for (let i = 0; i < 40; i++) {
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

// ─── IMPORT CSV ────────────────────────────────
function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Reset input so same file can be re-imported
  event.target.value = '';

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, {type: 'array'});
      const firstSheet = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheet];
      const json = XLSX.utils.sheet_to_json(worksheet, {header: 1});
      parseExcel(json);
    } catch (err) {
      showToast('Lỗi khi đọc file Excel!', 'error');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseExcel(rows) {
  if (!rows || rows.length < 2) {
    showToast('File Excel rỗng hoặc không đúng định dạng!', 'error');
    return;
  }

  // Lấy dòng tiêu đề (loại bỏ các cột rỗng nếu có)
  const headers = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());

  // Find columns (flexible matching)
  const idx = {
    mnv:  findColIdx(headers, ['mnv','mã nv','ma nv','employee id','employeeid','id']),
    name: findColIdx(headers, ['hoten','họ tên','ho ten','name','fullname','tên']),
    dept: findColIdx(headers, ['todoi','tổ đội','to doi','phongban','phòng ban','phong ban','department','dept','bộ phận']),
  };

  if (idx.mnv === -1) {
    showToast('Không tìm thấy cột MNV trong file!', 'error');
    showModal();
    return;
  }

  let added = 0, skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i] || [];
    // Skip empty rows
    if (cols.length === 0 || cols.every(c => !c)) continue;

    const mnvRaw = String(cols[idx.mnv] || '').trim();
    const mnv  = padMNV(mnvRaw);
    if (!mnv || !validateMNV(mnv)) { skipped++; continue; }
    if (!allowRepeatInput.checked && state.workers.find(w => w.mnv === mnv)) { skipped++; continue; }

    state.workers.push({
      mnv,
      name: idx.name !== -1 ? String(cols[idx.name] || '').trim() : `Công Nhân ${mnv}`,
      dept: idx.dept !== -1 ? String(cols[idx.dept] || '').trim() : '',
    });
    added++;
  }

  renderWorkerList();
  updateStats();
  showToast(`✅ Import thành công: ${added} công nhân${skipped ? ` (bỏ qua ${skipped})` : ''}`, 'success');
}

function findColIdx(headers, aliases) {
  for (const alias of aliases) {
    const i = headers.findIndex(h => h.replace(/\s+/g,'').includes(alias.replace(/\s+/g,'')));
    if (i !== -1) return i;
  }
  return -1;
}

// ─── MANUAL ADD ────────────────────────────────
function addManual() {
  const mnvRaw  = document.getElementById('manual-mnv').value.trim();
  const nameRaw = document.getElementById('manual-name').value.trim();
  const mnv     = padMNV(mnvRaw);

  if (!validateMNV(mnv)) {
    showToast('MNV phải có đúng 7 chữ số!', 'error');
    return;
  }
  if (!nameRaw) {
    showToast('Vui lòng nhập họ tên!', 'error');
    return;
  }
  if (state.workers.find(w => w.mnv === mnv)) {
    showToast(`MNV ${mnv} đã tồn tại!`, 'error');
    return;
  }

  state.workers.push({ mnv, name: nameRaw, dept: '' });
  document.getElementById('manual-mnv').value  = '';
  document.getElementById('manual-name').value = '';
  renderWorkerList();
  updateStats();
  showToast(`➕ Đã thêm: ${nameRaw} (${mnv})`, 'success');
}

// ─── CLEAR ─────────────────────────────────────
function clearWorkers() {
  if (!confirm('Xóa toàn bộ danh sách công nhân?')) return;
  state.workers = [];
  state.winners = [];
  renderWorkerList();
  renderWinnersList();
  updateStats();
  winnerReveal.style.display = 'none';
  slotDigits.textContent = '0000000';
  showToast('🗑️ Đã xóa toàn bộ danh sách', 'info');
}

// ─── VALIDATION ────────────────────────────────
function validateMNV(mnv) { return /^\d{7}$/.test(mnv); }
function padMNV(raw) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(7, '0').slice(-7);
}

// ─── DRAW / SPIN ────────────────────────────────
function startDraw() {
  if (state.isSpinning) return;

  const prizeCount = parseInt(prizeCountInput.value) || 1;
  const prizeName  = prizeNameInput.value.trim() || 'Giải Thưởng';
  const allowRpt   = allowRepeatInput.checked;

  // Get eligible pool
  const pool = allowRpt
    ? state.workers
    : state.workers.filter(w => !state.winners.find(wn => wn.mnv === w.mnv));

  if (pool.length === 0) {
    showToast('Không còn công nhân đủ điều kiện!', 'error');
    return;
  }

  // Draw multiple winners at once
  const count = Math.min(prizeCount, pool.length);
  const drawn = [];
  const poolCopy = [...pool];

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * poolCopy.length);
    drawn.push(poolCopy.splice(idx, 1)[0]);
  }

  state.isSpinning = true;
  spinBtn.disabled = true;
  winnerReveal.style.display = 'none';
  slotMachineInner.classList.add('spinning');
  slotGlow.classList.add('active');
  drawHint.textContent = '🎲 Đang bốc thăm...';

  // Slot animation – exactly 6 seconds (120 frames × 50ms)
  let frame = 0;
  const totalFrames = 120; // 120 × 50ms = 6000ms
  const spinInterval = setInterval(() => {
    frame++;
    // Fast 0→70%, slow-down 70→100%
    const progress = frame / totalFrames;
    const speed = progress < 0.70 ? 1 : Math.max(0.06, 1 - (progress - 0.70) / 0.30);

    if (Math.random() < speed) {
      slotDigits.textContent = String(Math.floor(Math.random() * 9999999)).padStart(7, '0');
    }

    // Tick sound-like flash at high speed phase
    if (progress < 0.70 && frame % 4 === 0) {
      slotDigits.style.opacity = '0.6';
      setTimeout(() => { slotDigits.style.opacity = '1'; }, 30);
    }

    if (frame >= totalFrames) {
      clearInterval(spinInterval);
      finalizeDraw(drawn, prizeName);
    }
  }, 50);
}

function finalizeDraw(drawn, prizeName) {
  const rank = state.winners.length + 1;

  // Show final winner (last drawn or first if only one)
  const primary = drawn[drawn.length - 1];
  slotDigits.textContent = primary.mnv;

  // Register all drawn winners
  drawn.forEach((w, i) => {
    state.winners.push({
      ...w,
      prize: prizeName,
      time: new Date().toLocaleTimeString('vi-VN'),
      rank: rank + i,
    });
  });

  slotMachineInner.classList.remove('spinning');
  slotMachineInner.classList.add('winning');
  slotGlow.classList.remove('active');
  slotGlow.classList.add('winner');

  // Update small reveal card
  winnerMnv.textContent  = `MNV: ${primary.mnv}`;
  winnerName.textContent = primary.name || `Công Nhân ${primary.mnv}`;
  winnerDept.textContent = primary.dept ? `📌 ${primary.dept}` : '';
  winnerReveal.style.display = 'flex';

  // Update UI first
  renderWorkerList();
  renderWinnersList();
  updateStats();
  drawHint.textContent = `🎉 ${drawn.length > 1 ? drawn.length + ' người' : primary.name} đã trúng ${prizeName}!`;

  spinBtn.disabled = false;
  state.isSpinning = false;
  spinLabel.textContent = 'QUAY TIẾP';

  setTimeout(() => {
    slotMachineInner.classList.remove('winning');
    slotGlow.classList.remove('winner');
  }, 3000);

  // 🎉 ZOOM REVEAL – fullscreen dramatic winner announcement
  setTimeout(() => showWinnerZoom(drawn, prizeName), 400);

  showToast(`🏆 ${drawn.length > 1 ? drawn.length + ' người trúng thưởng!' : primary.name + ' trúng ' + prizeName + '!'}`, 'success');
}

// ─── UNDO ───────────────────────────────────────
function undoLastWinner() {
  if (state.winners.length === 0) {
    showToast('Chưa có người trúng thưởng để hủy!', 'error');
    return;
  }
  const last = state.winners.pop();
  renderWorkerList();
  renderWinnersList();
  updateStats();
  winnerReveal.style.display = 'none';
  slotDigits.textContent = '0000000';
  showToast(`↩️ Đã hủy: ${last.name} (${last.mnv})`, 'info');
}

// ─── WINNER ZOOM OVERLAY ────────────────────────
function showWinnerZoom(drawn, prizeName) {
  // Remove any existing overlay
  const existing = document.getElementById('winner-zoom-overlay');
  if (existing) existing.remove();

  const isMulti = drawn.length > 1;
  const totalCount = drawn.length;

  let winnersHtml = '';
  if (isMulti) {
    winnersHtml = `
      <div class="wzo-multi-grid ${totalCount > 5 ? 'many' : ''}">
        ${drawn.map((w, index) => `
          <div class="wzo-multi-card" style="animation-delay: ${0.4 + index * 0.05}s">
            <div class="wzo-multi-mnv">${w.mnv}</div>
            <div class="wzo-multi-name">${escapeHtml(w.name)}</div>
            ${w.dept ? `<div class="wzo-multi-dept">📌 ${escapeHtml(w.dept)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } else {
    const winner = drawn[0];
    winnersHtml = `
      <div class="wzo-mnv" id="wzo-mnv">
        <span class="wzo-mnv-prefix">MNV</span>
        <span class="wzo-mnv-digits" id="wzo-mnv-digits">${winner.mnv}</span>
      </div>
      <div class="wzo-name" id="wzo-name">${escapeHtml(winner.name)}</div>
      ${winner.dept ? `<div class="wzo-dept">📌 ${escapeHtml(winner.dept)}</div>` : ''}
    `;
  }

  const overlay = document.createElement('div');
  overlay.id = 'winner-zoom-overlay';
  overlay.innerHTML = `
    <div class="wzo-bg-glow"></div>
    <div class="wzo-particles" id="wzo-particles"></div>
    <div class="wzo-content ${isMulti ? 'wzo-is-multi' : ''}">

      <div class="wzo-logo-row">
        <img src="vincons-logo.jpg" alt="Vincons" class="wzo-logo" />
      </div>

      <div class="wzo-prize-label" id="wzo-prize">${escapeHtml(prizeName)}</div>

      <div class="wzo-trophy-row">
        <span class="wzo-trophy">🏆</span>
      </div>

      ${winnersHtml}

      ${isMulti ? `<div class="wzo-multi-title">Danh sách ${totalCount} người trúng giải</div>` : ''}

      <div class="wzo-congrats">🎉 CHÚC MỪNG TRÚNG THƯỞNG! 🎉</div>

      <button class="wzo-close" onclick="document.getElementById('winner-zoom-overlay').remove()">
        ✕ Đóng
      </button>
    </div>
    <div id="wzo-confetti"></div>
  `;

  document.body.appendChild(overlay);

  // Trigger entrance animation
  requestAnimationFrame(() => {
    overlay.classList.add('wzo-visible');
  });

  // Spawn overlay particles
  spawnZoomParticles();

  // Launch confetti inside overlay
  launchZoomConfetti();

}

function spawnZoomParticles() {
  const container = document.getElementById('wzo-particles');
  if (!container) return;
  const colors = ['#3d5faf','#5a7dcc','#f0c040','#00d4ff','#c8d8ff','#f7d96a'];
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'wzo-particle';
    const size = 3 + Math.random() * 5;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      animation-duration:${5 + Math.random()*8}s;
      animation-delay:${Math.random()*4}s;
    `;
    container.appendChild(p);
  }
}

function launchZoomConfetti() {
  const container = document.getElementById('wzo-confetti');
  if (!container) return;
  const colors = ['#3d5faf','#5a7dcc','#f0c040','#00d4ff','#8fa8e0','#f7d96a','#2d4a91','#c8d8ff','#fff'];
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement('div');
    piece.className = 'wzo-confetti-piece';
    const w = 6 + Math.random() * 9;
    const h = 9 + Math.random() * 12;
    piece.style.cssText = `
      left:${Math.random()*100}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      width:${w}px; height:${h}px;
      animation-duration:${2 + Math.random()*2.5}s;
      animation-delay:${Math.random()*1.8}s;
      border-radius:${Math.random() > 0.4 ? '50%' : '2px'};
      transform-origin: center;
    `;
    container.appendChild(piece);
  }
}

// ─── CONFETTI (in draw stage) ───────────────────
function launchConfetti() {
  const container = document.getElementById('confetti-container');
  container.innerHTML = '';
  const colors = ['#3d5faf','#5a7dcc','#f0c040','#00d4ff','#8fa8e0','#f7d96a','#2d4a91','#c8d8ff'];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left  = Math.random() * 100;
    const delay = Math.random() * 1.5;
    const dur   = 1.5 + Math.random() * 2;
    const w = 5 + Math.random() * 8;
    const h = 8 + Math.random() * 10;
    piece.style.cssText = `
      left:${left}%;
      background:${color};
      width:${w}px; height:${h}px;
      animation-duration:${dur}s;
      animation-delay:${delay}s;
      border-radius:${Math.random() > 0.5 ? '50%' : '1px'};
    `;
    container.appendChild(piece);
  }
  setTimeout(() => { container.innerHTML = ''; }, 5000);
}

// ─── RENDER ─────────────────────────────────────
function renderWorkerList() {
  if (state.workers.length === 0) {
    workerListEl.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <p>Chưa có công nhân.<br/>Import CSV hoặc thêm thủ công.</p>
      </div>`;
    return;
  }

  workerListEl.innerHTML = state.workers.map(w => {
    const won = state.winners.find(wn => wn.mnv === w.mnv);
    return `<div class="worker-item${won ? ' is-winner' : ''}">
      <span class="worker-mnv-tag">${w.mnv}</span>
      <span class="worker-name-tag">${escapeHtml(w.name)}</span>
      ${w.dept ? `<span class="worker-dept-tag">${escapeHtml(w.dept)}</span>` : ''}
    </div>`;
  }).join('');
}

function renderWinnersList() {
  winnerBadge.textContent = state.winners.length;

  if (state.winners.length === 0) {
    winnersListEl.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <p>Chưa có người trúng thưởng.<br/>Hãy bắt đầu quay số!</p>
      </div>`;
    return;
  }

  winnersListEl.innerHTML = [...state.winners].reverse().map((w, i) => `
    <div class="winner-card">
      <span class="winner-card-rank">#${w.rank} – ${escapeHtml(w.prize)}</span>
      <div class="winner-card-mnv">MNV: ${w.mnv}</div>
      <div class="winner-card-name">${escapeHtml(w.name)}</div>
      ${w.dept ? `<div class="winner-card-prize">📌 ${escapeHtml(w.dept)}</div>` : ''}
      <div class="winner-card-prize" style="color:var(--text-muted);font-size:0.7rem;margin-top:2px">🕐 ${w.time}</div>
    </div>`).join('');
}

function updateStats() {
  const allowRpt   = allowRepeatInput.checked;
  const wonMNVs    = new Set(state.winners.map(w => w.mnv));
  const remaining  = allowRpt ? state.workers.length : state.workers.filter(w => !wonMNVs.has(w.mnv)).length;

  statTotal.textContent   = state.workers.length;
  statWinners.textContent = state.winners.length;
  statRemain.textContent  = remaining;
}

// ─── EXPORT ─────────────────────────────────────
function exportWinners() {
  if (state.winners.length === 0) {
    showToast('Chưa có người trúng thưởng!', 'error');
    return;
  }

  try {
    const data = state.winners.map((w, i) => ({
      'STT': i + 1,
      'MNV': w.mnv,
      'Họ Tên': w.name,
      'Tổ Đội': w.dept || '',
      'Giải Thưởng': w.prize,
      'Thời Gian': w.time
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DanhSachTrungThuong");

    const date = new Date().toLocaleDateString('vi-VN').replace(/\//g,'-');
    XLSX.writeFile(wb, `VINCONS_TrungThuong_${date}.xlsx`);

    showToast(`📋 Đã xuất Excel ${state.winners.length} người!`, 'success');
  } catch (err) {
    showToast('Có lỗi khi xuất file Excel!', 'error');
    console.error(err);
  }
}

// ─── MODAL ──────────────────────────────────────
function showModal() {
  document.getElementById('modal-overlay').style.display = 'grid';
}
function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

// ─── TOAST ──────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// ─── UTILS ──────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── SAMPLE DATA ────────────────────────────────
function loadSampleData() {
  const samples = [
    { mnv: '0001001', name: 'Nguyễn Văn An',     dept: 'Thi Công' },
    { mnv: '0001002', name: 'Trần Thị Bình',      dept: 'Kỹ Thuật' },
    { mnv: '0001003', name: 'Lê Hoàng Cường',     dept: 'Thi Công' },
    { mnv: '0001004', name: 'Phạm Thị Dung',      dept: 'Hành Chính' },
    { mnv: '0001005', name: 'Vũ Minh Đức',        dept: 'Kỹ Thuật' },
    { mnv: '0001006', name: 'Đặng Thị Hoa',       dept: 'Thi Công' },
    { mnv: '0001007', name: 'Bùi Quang Hùng',     dept: 'Vật Tư' },
    { mnv: '0001008', name: 'Ngô Thị Lan',        dept: 'Kế Toán' },
    { mnv: '0001009', name: 'Hoàng Văn Long',     dept: 'Thi Công' },
    { mnv: '0001010', name: 'Lý Thị Mai',         dept: 'Hành Chính' },
    { mnv: '0001011', name: 'Trương Quốc Nam',    dept: 'Kỹ Thuật' },
    { mnv: '0001012', name: 'Đinh Thị Oanh',      dept: 'Thi Công' },
    { mnv: '0001013', name: 'Dương Văn Phong',    dept: 'Vật Tư' },
    { mnv: '0001014', name: 'Tô Thị Quỳnh',       dept: 'Kế Toán' },
    { mnv: '0001015', name: 'Văn Thanh Sang',     dept: 'Thi Công' },
  ];
  state.workers.push(...samples);
  renderWorkerList();
  updateStats();
  showToast('📋 Đã nạp 15 công nhân mẫu', 'info');
}

// Load sample data on start
loadSampleData();

// Keyboard shortcut: Space = spin
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.matches('input')) {
    e.preventDefault();
    startDraw();
  }
});
