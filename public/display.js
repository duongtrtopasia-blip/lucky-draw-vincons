/* =============================================
   VINCONS LUCKY DRAW – Display JS
   Receives WebSocket events & shows animations
   ============================================= */

const socket = io();

// ─── DOM refs ──────────────────────────────────
const slotDigits        = document.getElementById('slot-digits');
const slotMachineInner  = document.getElementById('slot-machine-inner');
const slotGlow          = document.getElementById('slot-glow');
const winnerReveal      = document.getElementById('winner-reveal');
const winnerMnv         = document.getElementById('winner-mnv');
const winnerName        = document.getElementById('winner-name');
const winnerDept        = document.getElementById('winner-dept');
const prizeBadge        = document.getElementById('prize-badge');
const statusDot         = document.getElementById('status-dot');
const statusText        = document.getElementById('status-text');
const waitingHint       = document.getElementById('waiting-hint');

// ─── PARTICLES ─────────────────────────────────
(function initParticles() {
  const container = document.getElementById('particles-container');
  const colors = ['#3d5faf', '#5a7dcc', '#f0c040', '#00d4ff', '#8fa8e0', '#2d4a91', '#f7d96a'];
  for (let i = 0; i < 50; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = 2 + Math.random() * 5;
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

socket.on('config-update', (config) => {
  prizeBadge.textContent = '🏆 ' + (config.prizeName || 'Giải Thưởng');
});

socket.on('state-update', (data) => {
  prizeBadge.textContent = '🏆 ' + (data.config.prizeName || 'Giải Thưởng');
});

socket.on('spin-start', (data) => {
  waitingHint.classList.add('hidden');
  startSlotAnimation(data.targetMNV);
});

socket.on('spin-result', (data) => {
  finalizeResult(data.drawn, data.prizeName);
});

socket.on('undo', () => {
  winnerReveal.style.display = 'none';
  slotDigits.textContent = '0000000';
  slotMachineInner.classList.remove('spinning', 'winning');
  slotGlow.classList.remove('active', 'winner');
  // Remove zoom overlay if present
  const existing = document.getElementById('winner-zoom-overlay');
  if (existing) existing.remove();
});

socket.on('clear', () => {
  winnerReveal.style.display = 'none';
  slotDigits.textContent = '0000000';
  slotMachineInner.classList.remove('spinning', 'winning');
  slotGlow.classList.remove('active', 'winner');
  const existing = document.getElementById('winner-zoom-overlay');
  if (existing) existing.remove();
});

// ─── Slot Machine Animation ────────────────────
function startSlotAnimation(targetMNV) {
  winnerReveal.style.display = 'none';
  slotMachineInner.classList.add('spinning');
  slotGlow.classList.add('active');

  // Remove existing zoom overlay
  const existing = document.getElementById('winner-zoom-overlay');
  if (existing) existing.remove();

  // Clear existing slot digits
  slotDigits.innerHTML = '';

  const cols = [];
  for (let i = 0; i < 7; i++) {
    const col = document.createElement('div');
    col.className = 'slot-col';
    const strip = document.createElement('div');
    strip.className = 'slot-strip';

    const targetDigit = parseInt(targetMNV[i], 10);
    const spins = 4 + i;
    const totalItems = spins * 10 + targetDigit + 1;

    let html = '';
    for (let j = 0; j < totalItems; j++) {
      html += `<div class="slot-digit-item">${j % 10}</div>`;
    }
    strip.innerHTML = html;
    strip.style.transform = 'translateY(0)';

    col.appendChild(strip);
    slotDigits.appendChild(col);
    cols.push({ strip, totalItems });
  }

  // Trigger animation
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cols.forEach((c, i) => {
        const duration = 4 + i * 0.3;
        c.strip.style.transition = `transform ${duration}s cubic-bezier(0.15, 0.85, 0.25, 1)`;
        c.strip.style.transform = `translateY(-${(c.totalItems - 1) * 1.1}em)`;
      });
    });
  });
}

// ─── Finalize Result ────────────────────────────
function finalizeResult(drawn, prizeName) {
  const primary = drawn[drawn.length - 1];
  slotDigits.innerHTML = primary.mnv;

  slotMachineInner.classList.remove('spinning');
  slotMachineInner.classList.add('winning');
  slotGlow.classList.remove('active');
  slotGlow.classList.add('winner');

  // Show winner card
  winnerMnv.textContent  = `MNV: ${primary.mnv}`;
  winnerName.textContent = primary.name || `Công Nhân ${primary.mnv}`;
  winnerDept.textContent = primary.dept ? `📌 ${primary.dept}` : '';
  winnerReveal.style.display = 'flex';

  // Reset classes after 3s
  setTimeout(() => {
    slotMachineInner.classList.remove('winning');
    slotGlow.classList.remove('winner');
  }, 3000);

  // Show zoom overlay
  setTimeout(() => showWinnerZoom(drawn, prizeName), 400);

  // Show waiting hint again after 15s
  setTimeout(() => {
    waitingHint.classList.remove('hidden');
  }, 15000);
}

// ─── Winner Zoom Overlay ────────────────────────
function showWinnerZoom(drawn, prizeName) {
  const existing = document.getElementById('winner-zoom-overlay');
  if (existing) existing.remove();

  const isMulti = drawn.length > 1;
  const totalCount = drawn.length;

  let winnersHtml = '';
  if (isMulti) {
    const cols = Math.min(totalCount, 5);
    const mnvSize  = cols <= 2 ? '2.4rem' : cols === 3 ? '2rem' : cols === 4 ? '1.6rem' : '1.4rem';
    const nameSize = cols <= 2 ? '2.4rem' : cols === 3 ? '2rem' : cols === 4 ? '1.6rem' : '1.4rem';
    const deptSize = cols <= 2 ? '1.5rem' : cols === 3 ? '1.3rem' : '1.1rem';

    winnersHtml = `
      <div class="wzo-multi-grid" style="grid-template-columns: repeat(${cols}, 1fr);">
        ${drawn.map((w, index) => `
          <div class="wzo-multi-card" style="animation-delay: ${0.4 + index * 0.05}s;">
            <div class="wzo-multi-mnv" style="font-size: ${mnvSize};">${w.mnv}</div>
            <div class="wzo-multi-name" style="font-size: ${nameSize};">${escapeHtml(w.name)}</div>
            ${w.dept ? `<div class="wzo-multi-dept" style="font-size: ${deptSize};">📌 ${escapeHtml(w.dept)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } else {
    const winner = drawn[0];
    winnersHtml = `
      <div class="wzo-mnv">
        <span class="wzo-mnv-prefix">MNV</span>
        <span class="wzo-mnv-digits">${winner.mnv}</span>
      </div>
      <div class="wzo-name">${escapeHtml(winner.name)}</div>
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
      <div style="display: flex; align-items: center; justify-content: center; gap: 28px;">
        <span class="wzo-trophy" style="animation-delay: 0.35s">🏆</span>
        <div class="wzo-prize-label">${escapeHtml(prizeName)}</div>
        <span class="wzo-trophy" style="animation-delay: 0.5s">🏆</span>
      </div>
      ${winnersHtml}
      ${isMulti ? `<div class="wzo-multi-title">Danh sách ${totalCount} người trúng giải</div>` : ''}
      <div class="wzo-congrats">🎉 CHÚC MỪNG TRÚNG THƯỞNG! 🎉</div>
    </div>
    <div id="wzo-confetti"></div>
  `;

  // Auto-dismiss on click
  overlay.addEventListener('click', () => {
    overlay.remove();
  });

  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add('wzo-visible');
  });

  spawnZoomParticles();
  launchZoomConfetti();

  // Auto-dismiss after 20s
  setTimeout(() => {
    if (document.getElementById('winner-zoom-overlay')) {
      overlay.remove();
    }
  }, 20000);
}

function spawnZoomParticles() {
  const container = document.getElementById('wzo-particles');
  if (!container) return;
  const colors = ['#3d5faf','#5a7dcc','#f0c040','#00d4ff','#c8d8ff','#f7d96a'];
  for (let i = 0; i < 40; i++) {
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
  for (let i = 0; i < 150; i++) {
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
    `;
    container.appendChild(piece);
  }
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

// ─── Auto Fullscreen on click ───────────────────
document.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
});
