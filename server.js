/* =============================================
   VINCONS LUCKY DRAW – Node.js Server
   Express + Socket.IO + Real-time Multi-device
   ============================================= */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vincons2024';
const SESSION_SECRET = process.env.SESSION_SECRET || 'vincons-secret';
const DATA_FILE = path.join(__dirname, 'data-backup.json');

// ─── Middleware ─────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24h
});
app.use(sessionMiddleware);

// Share session with Socket.IO
io.engine.use(sessionMiddleware);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// File upload
const upload = multer({ storage: multer.memoryStorage() });

// ─── State ──────────────────────────────────────
let state = {
  workers: [],         // { mnv, name, dept }
  winners: [],         // { mnv, name, dept, prize, time, rank }
  isSpinning: false,
  config: {
    prizeName: 'Giải Đặc Biệt',
    prizeCount: 1,
    allowRepeat: false,
  }
};

// Load backup data on start
function loadBackup() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      state.workers = data.workers || [];
      state.winners = data.winners || [];
      state.config = { ...state.config, ...(data.config || {}) };
      console.log(`📂 Loaded backup: ${state.workers.length} workers, ${state.winners.length} winners`);
    }
  } catch (err) {
    console.error('⚠️ Failed to load backup:', err.message);
  }
}

function saveBackup() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      workers: state.workers,
      winners: state.winners,
      config: state.config,
    }, null, 2));
  } catch (err) {
    console.error('⚠️ Failed to save backup:', err.message);
  }
}

loadBackup();

// ─── Auth Middleware ────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ─── Helper Functions ───────────────────────────
function validateMNV(mnv) { return /^\d{7}$/.test(mnv); }
function padMNV(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(7, '0').slice(-7);
}

function findColIdx(headers, aliases) {
  for (const alias of aliases) {
    const i = headers.findIndex(h => h.replace(/\s+/g, '').includes(alias.replace(/\s+/g, '')));
    if (i !== -1) return i;
  }
  return -1;
}

function getPublicState() {
  const wonMNVs = new Set(state.winners.map(w => w.mnv));
  const remaining = state.config.allowRepeat
    ? state.workers.length
    : state.workers.filter(w => !wonMNVs.has(w.mnv)).length;

  return {
    totalWorkers: state.workers.length,
    totalWinners: state.winners.length,
    remaining,
    winners: state.winners,
    isSpinning: state.isSpinning,
    config: state.config,
  };
}

function getAdminState() {
  return {
    ...getPublicState(),
    workers: state.workers,
  };
}

// ─── API Routes ─────────────────────────────────

// Login
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Mật khẩu không đúng!' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check auth
app.get('/api/auth', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// Get state
app.get('/api/state', (req, res) => {
  if (req.session && req.session.isAdmin) {
    res.json(getAdminState());
  } else {
    res.json(getPublicState());
  }
});

// Upload Excel (admin only)
app.post('/api/upload', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (!rows || rows.length < 2) {
      return res.status(400).json({ error: 'File Excel rỗng hoặc không đúng định dạng!' });
    }

    const headers = (rows[0] || []).map(h => String(h || '').trim().toLowerCase());
    const idx = {
      mnv: findColIdx(headers, ['mnv', 'mã nv', 'ma nv', 'employee id', 'employeeid', 'id']),
      name: findColIdx(headers, ['hoten', 'họ tên', 'ho ten', 'name', 'fullname', 'tên']),
      dept: findColIdx(headers, ['todoi', 'tổ đội', 'to doi', 'phongban', 'phòng ban', 'phong ban', 'department', 'dept', 'bộ phận']),
    };

    if (idx.mnv === -1) {
      return res.status(400).json({ error: 'Không tìm thấy cột MNV trong file!' });
    }

    let added = 0, skipped = 0;
    for (let i = 1; i < rows.length; i++) {
      const cols = rows[i] || [];
      if (cols.length === 0 || cols.every(c => !c)) continue;

      const mnvRaw = String(cols[idx.mnv] || '').trim();
      const mnv = padMNV(mnvRaw);
      if (!mnv || !validateMNV(mnv)) { skipped++; continue; }
      if (!state.config.allowRepeat && state.workers.find(w => w.mnv === mnv)) { skipped++; continue; }

      state.workers.push({
        mnv,
        name: idx.name !== -1 ? String(cols[idx.name] || '').trim() : `Công Nhân ${mnv}`,
        dept: idx.dept !== -1 ? String(cols[idx.dept] || '').trim() : '',
      });
      added++;
    }

    saveBackup();
    io.emit('state-update', getPublicState());
    io.emit('admin-state-update', getAdminState());

    res.json({ success: true, added, skipped });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Lỗi khi đọc file Excel!' });
  }
});

// Update config (admin only)
app.post('/api/config', requireAdmin, (req, res) => {
  const { prizeName, prizeCount, allowRepeat } = req.body;
  if (prizeName !== undefined) state.config.prizeName = prizeName;
  if (prizeCount !== undefined) state.config.prizeCount = Math.max(1, parseInt(prizeCount) || 1);
  if (allowRepeat !== undefined) state.config.allowRepeat = !!allowRepeat;

  saveBackup();
  io.emit('config-update', state.config);
  io.emit('state-update', getPublicState());

  res.json({ success: true, config: state.config });
});

// Add worker manually (admin only)
app.post('/api/worker', requireAdmin, (req, res) => {
  const { mnv: mnvRaw, name, dept } = req.body;
  const mnv = padMNV(mnvRaw || '');

  if (!validateMNV(mnv)) return res.status(400).json({ error: 'MNV phải có đúng 7 chữ số!' });
  if (!name) return res.status(400).json({ error: 'Vui lòng nhập họ tên!' });
  if (state.workers.find(w => w.mnv === mnv)) return res.status(400).json({ error: `MNV ${mnv} đã tồn tại!` });

  state.workers.push({ mnv, name: name.trim(), dept: (dept || '').trim() });
  saveBackup();
  io.emit('state-update', getPublicState());
  io.emit('admin-state-update', getAdminState());

  res.json({ success: true });
});

// Draw (from controller or admin)
app.post('/api/draw', (req, res) => {
  if (state.isSpinning) return res.status(400).json({ error: 'Đang quay số!' });

  const pool = state.config.allowRepeat
    ? state.workers
    : state.workers.filter(w => !state.winners.find(wn => wn.mnv === w.mnv));

  if (pool.length === 0) return res.status(400).json({ error: 'Không còn công nhân đủ điều kiện!' });

  const count = Math.min(state.config.prizeCount, pool.length);
  const drawn = [];
  const poolCopy = [...pool];

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * poolCopy.length);
    drawn.push(poolCopy.splice(idx, 1)[0]);
  }

  state.isSpinning = true;

  // Broadcast spin start to display
  const targetMNV = drawn[drawn.length - 1].mnv;
  io.emit('spin-start', { targetMNV, prizeName: state.config.prizeName });
  io.emit('state-update', getPublicState());

  // After animation duration, finalize
  setTimeout(() => {
    const rank = state.winners.length + 1;
    drawn.forEach((w, i) => {
      state.winners.push({
        ...w,
        prize: state.config.prizeName,
        time: new Date().toLocaleTimeString('vi-VN'),
        rank: rank + i,
      });
    });

    state.isSpinning = false;
    saveBackup();

    io.emit('spin-result', { drawn, prizeName: state.config.prizeName });
    io.emit('state-update', getPublicState());
    io.emit('admin-state-update', getAdminState());
  }, 6500);

  res.json({ success: true, message: 'Đang quay số...' });
});

// Undo last winner (admin only)
app.post('/api/undo', requireAdmin, (req, res) => {
  if (state.winners.length === 0) return res.status(400).json({ error: 'Chưa có người trúng thưởng!' });

  const last = state.winners.pop();
  saveBackup();
  io.emit('state-update', getPublicState());
  io.emit('admin-state-update', getAdminState());
  io.emit('undo', { undone: last });

  res.json({ success: true, undone: last });
});

// Clear all (admin only)
app.post('/api/clear', requireAdmin, (req, res) => {
  state.workers = [];
  state.winners = [];
  saveBackup();
  io.emit('state-update', getPublicState());
  io.emit('admin-state-update', getAdminState());
  io.emit('clear', {});

  res.json({ success: true });
});

// Shuffle workers (admin only)
app.post('/api/shuffle', requireAdmin, (req, res) => {
  for (let i = state.workers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.workers[i], state.workers[j]] = [state.workers[j], state.workers[i]];
  }
  saveBackup();
  io.emit('admin-state-update', getAdminState());
  res.json({ success: true });
});

// Export winners
app.get('/api/export', requireAdmin, (req, res) => {
  if (state.winners.length === 0) return res.status(400).json({ error: 'Chưa có người trúng thưởng!' });

  const data = state.winners.map((w, i) => ({
    'STT': i + 1,
    'MNV': w.mnv,
    'Họ Tên': w.name,
    'Tổ Đội': w.dept || '',
    'Giải Thưởng': w.prize,
    'Thời Gian': w.time,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DanhSachTrungThuong');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const date = new Date().toLocaleDateString('vi-VN').replace(/\//g, '-');

  res.setHeader('Content-Disposition', `attachment; filename=VINCONS_TrungThuong_${date}.xlsx`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(Buffer.from(buf));
});

// ─── Page Routes ────────────────────────────────
app.get('/', (req, res) => res.redirect('/display'));
app.get('/display', (req, res) => res.sendFile(path.join(__dirname, 'public', 'display.html')));
app.get('/controller', (req, res) => res.sendFile(path.join(__dirname, 'public', 'controller.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ─── Socket.IO ──────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Send current state on connect
  socket.emit('state-update', getPublicState());

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// ─── Start Server ───────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
  }

  console.log('');
  console.log('🎰 ═══════════════════════════════════════════');
  console.log('   VINCONS LUCKY DRAW SERVER');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log(`  📺 Display (TV):      http://${localIP}:${PORT}/display`);
  console.log(`  📱 Controller (iPad): http://${localIP}:${PORT}/controller`);
  console.log(`  🔐 Admin:             http://${localIP}:${PORT}/admin`);
  console.log('');
  console.log(`  🔑 Admin Password:    ${ADMIN_PASSWORD}`);
  console.log(`  📦 Workers loaded:    ${state.workers.length}`);
  console.log(`  🏆 Winners loaded:    ${state.winners.length}`);
  console.log('');
  console.log('═══════════════════════════════════════════════');
});
