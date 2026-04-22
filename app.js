/* app.js — TRACS APPAREL Management Web App */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js';
import { getDatabase, ref, set, push, get, child, update, onValue } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// ─── Firebase ─────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: 'AIzaSyCXDUrJtkuJZ4BvqsYOFg9SIjOysIgkqtk',
  authDomain: 'tracs-hr-mangment.firebaseapp.com',
  projectId: 'tracs-hr-mangment',
  storageBucket: 'tracs-hr-mangment.firebasestorage.app',
  messagingSenderId: '1094008024729',
  appId: '1:1094008024729:web:11f1afa99df6272cee9208',
  measurementId: 'G-6ZD2M74F0P',
  databaseURL: 'https://tracs-hr-mangment-default-rtdb.firebaseio.com',
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);
try { getAnalytics(firebaseApp); } catch (e) { console.warn('Analytics initialization failed:', e); }

// ─── Auth State ────────────────────────────────────────────────────────────────
let currentUser = null;
let currentRole = null;

// ─── Storage ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86400000;
const OT_RATE_FACTOR = 0.5 / 100;
const DATA_PATH = 'tracsApparelData/shared';
const PROD_PATH = 'tracsApparelData/production';
const USERS_PATH = 'users';
const ACTIVITY_PATH = 'activity_logs';
const ATTENDANCE_PATH = 'attendance';
const CORRECTION_PATH = 'correction_requests';

// Working hour constants
const WORK_START_H = 8, WORK_START_M = 0;   // 08:00
const WORK_END_H   = 17, WORK_END_M = 0;     // 17:00
const LATE_MAX_H   = 8, LATE_MAX_M = 15;     // 08:15 — PL threshold

// Production stages definition
const PROD_STAGES = [
  { key: 'cutting',    label: 'Cutting',      dateField: 'cuttingDate',    qtyField: 'cuttingQty'    },
  { key: 'sewing_in',  label: 'Sewing In',    dateField: 'sewingInDate',   qtyField: 'sewingInQty'   },
  { key: 'sewing_out', label: 'Sewing Out',   dateField: 'sewingOutDate',  qtyField: 'sewingOutQty'  },
  { key: 'wash',       label: 'Wash',         dateField: 'washDate',       qtyField: 'washQty'       },
  { key: 'finishing',  label: 'Finishing',    dateField: 'finishingDate',  qtyField: 'finishingQty'  },
];

let dataCache = defaultData();
let prodRecords = {};   // live production records cache

function defaultData() {
  return { companyName: 'TRACS APPAREL', employees: [], salaryRecords: [], attendance: {} };
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeData(raw) {
  const base = defaultData();
  const safe = raw && typeof raw === 'object' ? raw : {};
  return {
    companyName: (typeof safe.companyName === 'string' && safe.companyName.trim()) ? safe.companyName : base.companyName,
    employees: Array.isArray(safe.employees) ? safe.employees : [],
    salaryRecords: Array.isArray(safe.salaryRecords) ? safe.salaryRecords : [],
    attendance: safe.attendance && typeof safe.attendance === 'object' ? safe.attendance : {},
  };
}

function getNextSalaryRecordId() {
  return push(ref(database, `${DATA_PATH}/salaryRecords`)).key || uid();
}

async function loadDataFromCloud() {
  const rootRef = ref(database);
  const snap = await get(child(rootRef, DATA_PATH));
  if (snap.exists()) {
    dataCache = normalizeData(snap.val());
    return;
  }
  dataCache = defaultData();
  await set(ref(database, DATA_PATH), dataCache);
}

function loadData() {
  return cloneData(dataCache);
}

async function saveData(data) {
  dataCache = normalizeData(data);
  try {
    await set(ref(database, DATA_PATH), dataCache);
    return true;
  } catch (e) {
    console.error('Failed to save data to Firebase Realtime Database:', e);
    showToast('Cloud save failed. Please try again.', 'error');
    return false;
  }
}

// ─── Salary Calculation ────────────────────────────────────────────────────────

function getDaysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function formatAsYYYYMMDD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateStringToMidnight(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function daysBetweenInclusive(startDate, endDate) {
  const startUTC = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endUTC   = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.floor((endUTC - startUTC) / MS_PER_DAY) + 1;
}

function monthFromDate(dateStr) {
  return (dateStr || '').slice(0, 7);
}

function dayFromDate(dateStr) {
  const day = parseInt((dateStr || '').slice(8, 10), 10);
  return Number.isFinite(day) ? day : 0;
}

function getAttendanceStatus(data, empId, dateStr) {
  if (!empId || !dateStr) return 'P';
  const month = monthFromDate(dateStr);
  const day   = dayFromDate(dateStr);
  if (!month || !day) return 'P';
  const key = `${empId}|${month}`;
  return ((data.attendance || {})[key] || {})[day] || 'P';
}

function setAttendanceStatus(data, empId, dateStr, status) {
  if (!empId || !dateStr) return;
  const month = monthFromDate(dateStr);
  const day   = dayFromDate(dateStr);
  if (!month || !day) return;
  if (!data.attendance) data.attendance = {};
  const key = `${empId}|${month}`;
  if (!data.attendance[key]) data.attendance[key] = {};
  data.attendance[key][day] = status;
}

function calcSalary(basic, otHours, bonus, festivalBonus, absentDays, daysInMonth, deductions, advance) {
  const otAmount        = otHours * (basic * OT_RATE_FACTOR);
  const absentDeduction = daysInMonth > 0 ? (basic / daysInMonth) * absentDays : 0;
  const total           = Math.max(0, basic + otAmount + bonus + festivalBonus - absentDeduction - deductions - advance);
  return { otAmount, absentDeduction, total };
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function fmt(amount) {
  const n = parseFloat(amount) || 0;
  return '\u09F3' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtPDF(amount) {
  const n = parseFloat(amount) || 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMonth(ms) {
  if (!ms) return '';
  const [y, m] = ms.split('-');
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  return names[parseInt(m, 10) - 1] + ' ' + y;
}

function formatOtHours(hours) {
  return (parseFloat(hours) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function getLast6Months() {
  const months = [];
  const now    = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function initials(name) {
  return (name || '').split(' ').filter(n => n).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const TOAST_ICONS = {
  success: 'fa-check-circle',
  error:   'fa-times-circle',
  warning: 'fa-exclamation-triangle',
  info:    'fa-info-circle',
};

function showToast(msg, type = 'success') {
  const t   = document.getElementById('toast');
  const tm  = document.getElementById('toastMessage');
  const ico = document.getElementById('toastIcon');
  tm.textContent = msg;
  ico.className  = `toast-icon fas ${TOAST_ICONS[type] || TOAST_ICONS.success}`;
  t.className    = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

// Compress & resize image to ≤200px for faster cloud sync
function compressImage(dataUrl, cb) {
  const img = new Image();
  img.onload = () => {
    const maxSize = 200;
    let w = img.width, h = img.height;
    if (w > h && w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
    else if (h >= w && h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    cb(c.toDataURL('image/jpeg', 0.75));
  };
  img.src = dataUrl;
}

// ─── App Object ────────────────────────────────────────────────────────────────

const app = {
  _photo:           null,
  _editEmpId:       null,
  _chart:           null,
  _tempAttendance:  {},
  _attEmpId:        null,
  _attMonth:        null,
  _attMgmtDate:     null,

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  async init() {
    document.getElementById('currentDate').textContent =
      new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = formatAsYYYYMMDD(now);
    document.getElementById('se-month').value      = thisMonth;
    document.getElementById('summary-month').value = thisMonth;
    document.getElementById('att-man-month').value = thisMonth;
    document.getElementById('att-man-date').value  = today;
    this._attMgmtDate = today;

    document.getElementById('companyNameInput').addEventListener('change', async e => {
      const d = loadData();
      d.companyName = e.target.value.trim() || 'TRACS APPAREL';
      await saveData(d);
    });

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', e => this.login(e));

    const setupForm = document.getElementById('setupForm');
    if (setupForm) setupForm.addEventListener('submit', e => this.createAdminAccount(e));

    const changePassForm = document.getElementById('changePassForm');
    if (changePassForm) changePassForm.addEventListener('submit', e => this.saveNewPassword(e));

    // Sidebar nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        this.navigateTo(item.dataset.view);
      });
    });

    // Mobile sidebar toggle
    document.getElementById('sidebarToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('show');
    });
    document.getElementById('sidebarOverlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('show');
    });

    // Keyboard: close modals with Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.closeEmployeeModal();
        this.closeConfirmModal();
        this.closeAttendanceModal();
        this.closeEmpHistoryModal();
      }
    });

    this._setAppAccess(false);
    this._hideOperatorShell();
    // Auth state is managed by onAuthStateChanged at the bottom of this module
  },

  _syncCompanyNameInput() {
    const data = loadData();
    const input = document.getElementById('companyNameInput');
    if (input) input.value = data.companyName || 'TRACS APPAREL';
  },

  _showLogin(show) {
    const modal = document.getElementById('loginModal');
    if (!modal) return;
    modal.classList.toggle('show', !!show);
  },

  _showSetup(show) {
    const el = document.getElementById('setupScreen');
    if (el) el.style.display = show ? 'flex' : 'none';
  },

  _showChangePassword(show) {
    const el = document.getElementById('changePasswordScreen');
    if (el) el.style.display = show ? 'flex' : 'none';
  },

  _setAppAccess(isAllowed) {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('mainContent');
    const toggle = document.getElementById('sidebarToggle');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.style.display = isAllowed ? 'flex' : 'none';
    if (main) main.style.display = isAllowed ? 'flex' : 'none';
    if (toggle) toggle.style.display = isAllowed ? '' : 'none';
    if (overlay && !isAllowed) overlay.classList.remove('show');
  },

  _showOperatorShell() {
    const el = document.getElementById('operatorShell');
    if (el) el.style.display = 'flex';
  },

  _hideOperatorShell() {
    const el = document.getElementById('operatorShell');
    if (el) el.style.display = 'none';
  },

  _applyAuthHeader(isLoggedIn) {
    const badge = document.getElementById('authUserBadge');
    const logoutBtn = document.getElementById('logoutBtn');
    if (!badge || !logoutBtn) return;
    if (!isLoggedIn) {
      badge.style.display = 'none';
      logoutBtn.style.display = 'none';
      return;
    }
    const roleLabel = currentRole === 'operator' ? 'OPERATOR' : 'ADMIN';
    badge.textContent = roleLabel;
    badge.className = `auth-user-badge role-${currentRole || 'admin'}`;
    badge.style.display = 'inline-flex';
    logoutBtn.style.display = 'inline-flex';
  },

  _applyRoleBasedUI(role) {
    // Show/hide sidebar nav items
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = role === 'admin' ? '' : 'none';
    });
    document.querySelectorAll('.operator-only').forEach(el => {
      el.style.display = role === 'operator' ? '' : 'none';
    });
  },

  toggleLoginPassword() {
    const input = document.getElementById('loginPassword');
    const icon  = document.getElementById('loginEyeIcon');
    if (!input || !icon) return;
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.className = isHidden ? 'fas fa-eye-slash' : 'fas fa-eye';
  },

  async forgotPassword() {
    const emailEl = document.getElementById('loginEmail');
    const email = emailEl ? emailEl.value.trim() : '';
    if (!email) {
      showToast('Please enter your email address first.', 'warning');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('Password reset email sent! Check your inbox.', 'success');
    } catch (err) {
      showToast('Could not send reset email. Check the address and try again.', 'error');
    }
  },

  async login(evt) {
    evt.preventDefault();
    const email    = (document.getElementById('loginEmail')?.value || '').trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl  = document.getElementById('loginError');
    const btn      = document.getElementById('loginSubmitBtn');

    if (!email) {
      if (errorEl) { errorEl.textContent = 'Please enter your email address.'; errorEl.style.display = 'flex'; }
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in…'; }
    if (errorEl) errorEl.style.display = 'none';

    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle the rest
    } catch (err) {
      console.log("Login Error: ", err);
      const msg = err.message || 'Login failed. Please check your credentials.';
      if (errorEl) { errorEl.textContent = msg; errorEl.style.display = 'flex'; }
      alert(msg);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Sign In'; }
    }
  },

  async logout() {
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Logout failed:', e);
    }
    // onAuthStateChanged will handle UI reset
  },

  navigateTo(view) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${view}`);
    if (el) el.classList.add('active');

    const titles = {
      dashboard:            'Dashboard',
      employees:            'Employees',
      'salary-entry':       'Salary Entry',
      attendance:           'Attendance',
      history:              'History',
      'monthly-summary':    'Monthly Summary',
      'payroll-reports':    'Payroll Reports',
      production:           'Production Tracking',
      'correction-admin':   'Correction Requests',
      'settings-users':     'Settings › Users',
      'settings-activity':  'Settings › Activity Log',
    };
    document.getElementById('pageTitle').textContent = titles[view] || view;

    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');

    if (view === 'dashboard')          this.renderDashboard();
    if (view === 'employees')          this.renderEmployees();
    if (view === 'salary-entry')       this.loadSalaryEntrySelects();
    if (view === 'attendance')         this.renderAttendanceManagement();
    if (view === 'history')            this.renderHistory();
    if (view === 'monthly-summary')    { /* user clicks Load */ }
    if (view === 'payroll-reports')    this.renderPayrollReports();
    if (view === 'production')         this.initProductionView();
    if (view === 'correction-admin')   this.loadCorrectionRequestsAdmin();
    if (view === 'settings-users')     this.loadUsersPage();
    if (view === 'settings-activity')  this.loadActivityLog();
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────

  renderDashboard() {
    const data = loadData();
    const now  = new Date();
    const tm   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = formatAsYYYYMMDD(now);
    const recs = data.salaryRecords.filter(r => r.month === tm);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    let presentCount = 0;
    let absentCount = 0;
    data.employees.forEach(emp => {
      const st = getAttendanceStatus(data, emp.id, today);
      if (st === 'A') absentCount++;
      else presentCount++;
    });

    const weekOt = data.salaryRecords
      .filter(r => r.createdAt && r.createdAt >= weekStart.getTime() && r.createdAt <= weekEnd.getTime())
      .reduce((s, r) => s + (r.otHours || 0), 0);

    document.getElementById('stat-total-employees').textContent    = data.employees.length;
    document.getElementById('stat-this-month-payroll').textContent = fmt(recs.reduce((s, r) => s + r.totalSalary, 0));
    document.getElementById('stat-today-attendance').textContent   = `P: ${presentCount} | A: ${absentCount}`;
    document.getElementById('stat-week-ot').textContent            = `${formatOtHours(weekOt)} hours`;

    const recent = [...data.salaryRecords].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
    const tbody  = document.getElementById('recent-entries-tbody');
    if (!recent.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No records yet</td></tr>';
    } else {
      tbody.innerHTML = recent.map(r => {
        const emp = data.employees.find(e => e.id === r.employeeId);
        return `<tr>
          <td>${emp ? esc(emp.name) : 'Unknown'}</td>
          <td>${fmtMonth(r.month)}</td>
          <td>${fmt(r.basicSalary)}</td>
          <td class="amount-positive">${fmt(r.totalSalary)}</td>
        </tr>`;
      }).join('');
    }

    this._renderChart(data);
  },

  _renderChart(data) {
    const months = getLast6Months();
    const labels = months.map(m => {
      const [y, mo] = m.split('-');
      const names   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return names[parseInt(mo, 10) - 1] + " '" + y.slice(2);
    });

    const payrollData = months.map(m =>
      data.salaryRecords.filter(r => r.month === m).reduce((s, r) => s + r.totalSalary, 0)
    );

    const presentWorkersData = months.map(m =>
      [...new Set(data.salaryRecords.filter(r => r.month === m).map(r => r.employeeId))].length
    );

    const ctx = document.getElementById('dashboardChart');
    if (!ctx) return;

    if (this._chart) {
      this._chart.destroy();
      this._chart = null;
    }

    this._chart = new Chart(ctx, {
      data: {
        labels,
        datasets: [
          {
            type:            'bar',
            label:           'Total Salary Payout (BDT)',
            data:            payrollData,
            backgroundColor: 'rgba(13,115,119,.65)',
            borderColor:     '#0d7377',
            borderWidth:     1,
            borderRadius:    4,
            yAxisID:         'y',
          },
          {
            type:            'line',
            label:           'Present Workers',
            data:            presentWorkersData,
            borderColor:     '#32e0c4',
            backgroundColor: 'rgba(50,224,196,.15)',
            borderWidth:     2.5,
            pointRadius:     5,
            pointBackgroundColor: '#32e0c4',
            tension:         0.35,
            fill:            true,
            yAxisID:         'y1',
          },
        ],
      },
      options: {
        responsive:          true,
        maintainAspectRatio: false,
        interaction:         { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12 }, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label(ctx) {
                if (ctx.datasetIndex === 0) return ` \u09F3${ctx.parsed.y.toLocaleString('en-US')}`;
                return ` ${ctx.parsed.y} worker${ctx.parsed.y !== 1 ? 's' : ''}`;
              },
            },
          },
        },
        scales: {
          y: {
            type:     'linear',
            position: 'left',
            title:    { display: true, text: 'Salary Payout (BDT)', color: '#64748b', font: { size: 11 } },
            grid:     { color: 'rgba(0,0,0,.05)' },
            ticks:    { color: '#64748b', font: { size: 11 } },
          },
          y1: {
            type:     'linear',
            position: 'right',
            title:    { display: true, text: 'Workers', color: '#64748b', font: { size: 11 } },
            grid:     { drawOnChartArea: false },
            ticks:    { color: '#64748b', font: { size: 11 }, stepSize: 1, precision: 0 },
            min:      0,
          },
          x: {
            grid:  { color: 'rgba(0,0,0,.04)' },
            ticks: { color: '#64748b', font: { size: 11 } },
          },
        },
      },
    });
  },

  // ── Employees ──────────────────────────────────────────────────────────────

  renderEmployees(filter = '') {
    const data = loadData();
    const lf   = filter.toLowerCase();
    const list = data.employees.filter(e =>
      e.name.toLowerCase().includes(lf) || e.id.toLowerCase().includes(lf)
    );

    const grid = document.getElementById('employee-grid');
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state-full"><i class="fas fa-users"></i>
        <p>${filter ? 'No employees match your search.' : 'No employees yet. Add your first employee!'}</p></div>`;
      return;
    }

    grid.innerHTML = list.map(emp => `
      <div class="employee-card">
        <div class="emp-card-header">
          <div class="emp-card-actions">
            <button class="icon-btn edit" onclick="app.openEditEmployee('${esc(emp.id)}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="icon-btn delete" onclick="app.confirmDeleteEmployee('${esc(emp.id)}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
          <div class="emp-avatar">
            ${emp.photo ? `<img src="${esc(emp.photo)}" alt="${esc(emp.name)}">` : `<span>${initials(emp.name)}</span>`}
          </div>
        </div>
        <div class="emp-card-body">
          <h3>${esc(emp.name)}</h3>
          <p class="emp-id"><i class="fas fa-id-badge"></i> ${esc(emp.id)}</p>
          ${emp.department ? `<p><i class="fas fa-building"></i> ${esc(emp.department)}</p>` : ''}
          <p class="emp-salary"><i class="fas fa-money-bill"></i> Basic: ${fmt(emp.basicSalary)}</p>
        </div>
        <div class="emp-card-footer">
          <button class="btn btn-sm btn-primary" onclick="app.openSalaryEntry('${esc(emp.id)}')">
            <i class="fas fa-calculator"></i> Add Salary
          </button>
          <button class="btn-history" onclick="app.openEmpHistoryModal('${esc(emp.id)}')">
            <i class="fas fa-history"></i> History
          </button>
        </div>
      </div>
    `).join('');
  },

  filterEmployees() {
    this.renderEmployees(document.getElementById('employeeSearch').value);
  },

  openAddEmployee() {
    this._editEmpId = null;
    this._photo     = null;
    document.getElementById('employeeModalTitle').textContent = 'Add Employee';
    document.getElementById('employeeForm').reset();
    document.getElementById('emp-edit-id').value = '';
    document.getElementById('photoPreview').innerHTML = '<i class="fas fa-user"></i>';
    document.getElementById('employeeModal').classList.add('show');
  },

  openEditEmployee(id) {
    const data = loadData();
    const emp  = data.employees.find(e => e.id === id);
    if (!emp) return;

    this._editEmpId = id;
    this._photo     = emp.photo || null;

    document.getElementById('employeeModalTitle').textContent = 'Edit Employee';
    document.getElementById('emp-name').value       = emp.name;
    document.getElementById('emp-id').value         = emp.id;
    document.getElementById('emp-basic').value      = emp.basicSalary;
    document.getElementById('emp-department').value = emp.department || '';
    document.getElementById('emp-edit-id').value    = id;

    const prev = document.getElementById('photoPreview');
    prev.innerHTML = emp.photo
      ? `<img src="${emp.photo}" alt="${esc(emp.name)}">`
      : `<span>${initials(emp.name)}</span>`;

    document.getElementById('employeeModal').classList.add('show');
  },

  closeEmployeeModal() {
    document.getElementById('employeeModal').classList.remove('show');
  },

  handlePhotoUpload(evt) {
    const file = evt.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Image must be under 5 MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      compressImage(e.target.result, compressed => {
        this._photo = compressed;
        document.getElementById('photoPreview').innerHTML = `<img src="${compressed}" alt="Preview">`;
      });
    };
    reader.readAsDataURL(file);
  },

  removePhoto() {
    this._photo = null;
    document.getElementById('photoPreview').innerHTML = '<i class="fas fa-user"></i>';
    document.getElementById('photoInput').value = '';
  },

  async saveEmployee(evt) {
    evt.preventDefault();
    const data   = loadData();
    const name   = document.getElementById('emp-name').value.trim();
    const id     = document.getElementById('emp-id').value.trim();
    const basic  = parseFloat(document.getElementById('emp-basic').value) || 0;
    const dept   = document.getElementById('emp-department').value.trim();
    const editId = document.getElementById('emp-edit-id').value;

    if (data.employees.some(e => e.id === id && e.id !== editId)) {
      showToast('Employee ID already exists!', 'error');
      document.getElementById('emp-id').focus();
      return;
    }

    if (editId) {
      const idx = data.employees.findIndex(e => e.id === editId);
      if (idx !== -1) {
        data.employees[idx] = { ...data.employees[idx], name, id, basicSalary: basic, department: dept, photo: this._photo };
        if (editId !== id) {
          data.salaryRecords.forEach(r => { if (r.employeeId === editId) r.employeeId = id; });
          const attKeys = Object.keys(data.attendance || {}).filter(k => k.startsWith(editId + '|'));
          attKeys.forEach(oldKey => {
            const newKey = id + '|' + oldKey.split('|')[1];
            data.attendance[newKey] = data.attendance[oldKey];
            delete data.attendance[oldKey];
          });
        }
      }
      showToast('Employee updated!');
    } else {
      data.employees.push({ name, id, basicSalary: basic, department: dept, photo: this._photo, createdAt: Date.now() });
      showToast('Employee added!');
    }

    await saveData(data);
    this.closeEmployeeModal();
    this.renderEmployees();
    this.renderAttendanceManagement();
    this.renderPayrollReports();
  },

  confirmDeleteEmployee(id) {
    const data = loadData();
    const emp  = data.employees.find(e => e.id === id);
    if (!emp) return;
    document.getElementById('confirmMessage').textContent =
      `Delete "${emp.name}"? All their salary records will also be removed.`;
    document.getElementById('confirmBtn').onclick = () => this.deleteEmployee(id);
    document.getElementById('confirmModal').classList.add('show');
  },

  async deleteEmployee(id) {
    const data = loadData();
    data.employees     = data.employees.filter(e => e.id !== id);
    data.salaryRecords = data.salaryRecords.filter(r => r.employeeId !== id);
    Object.keys(data.attendance || {}).forEach(k => {
      if (k.startsWith(id + '|')) delete data.attendance[k];
    });
    await saveData(data);
    this.closeConfirmModal();
    this.renderEmployees();
    this.renderAttendanceManagement();
    this.renderPayrollReports();
    showToast('Employee deleted!');
  },

  closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('show');
  },

  // ── Employee History Modal ──────────────────────────────────────────────────

  openEmpHistoryModal(empId) {
    const data = loadData();
    const emp  = data.employees.find(e => e.id === empId);
    if (!emp) return;

    document.getElementById('empHistoryTitle').textContent = emp.name + ' \u2014 Salary History';

    const records = data.salaryRecords
      .filter(r => r.employeeId === empId)
      .sort((a, b) => b.month.localeCompare(a.month));

    const tbody = document.getElementById('emp-history-tbody');
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No records</td></tr>';
    } else {
      tbody.innerHTML = records.map(r => {
        const totalDed = (r.absentDeduction || 0) + r.deductions + r.advance;
        return `<tr>
          <td>${fmtMonth(r.month)}</td>
          <td>${fmt(r.basicSalary)}</td>
          <td>${r.otHours}</td>
          <td>${fmt(r.otAmount)}</td>
          <td>${fmt(r.bonus)}</td>
          <td>${fmt(r.festivalBonus || 0)}</td>
          <td>${r.absentDays || 0}</td>
          <td class="amount-negative">${fmt(totalDed)}</td>
          <td class="amount-positive"><strong>${fmt(r.totalSalary)}</strong></td>
          <td>
            <button class="icon-btn primary" onclick="app.generateSlipPDF('${r.id}')" title="Download Slip">
              <i class="fas fa-download"></i>
            </button>
          </td>
        </tr>`;
      }).join('');
    }

    document.getElementById('empHistoryModal').classList.add('show');
  },

  closeEmpHistoryModal() {
    document.getElementById('empHistoryModal').classList.remove('show');
  },

  // ── Salary Entry ────────────────────────────────────────────────────────────

  openSalaryEntry(empId) {
    this.navigateTo('salary-entry');
    setTimeout(() => {
      document.getElementById('se-employee').value = empId;
      this.onEmployeeSelect();
    }, 50);
  },

  loadSalaryEntrySelects() {
    const data = loadData();
    const sel  = document.getElementById('se-employee');
    const cur  = sel.value;
    sel.innerHTML = '<option value="">— Select Employee —</option>' +
      data.employees.map(e => `<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.id)})</option>`).join('');
    if (cur) sel.value = cur;

    this._populateHistoryFilters(data);
    this._updateAttendanceRow();
  },

  onEmployeeSelect() {
    const data  = loadData();
    const empId = document.getElementById('se-employee').value;
    const emp   = data.employees.find(e => e.id === empId);
    document.getElementById('se-basic').value = emp ? emp.basicSalary : '';
    this._syncAbsentDays();
    this.calcPreview();
  },

  onMonthChange() {
    this._syncAbsentDays();
    this.calcPreview();
  },

  _syncAbsentDays() {
    const data  = loadData();
    const empId = document.getElementById('se-employee').value;
    const month = document.getElementById('se-month').value;

    if (empId && month) {
      const key        = `${empId}|${month}`;
      const attendance = (data.attendance || {})[key] || {};
      const days       = getDaysInMonth(month);
      let   absent     = 0;
      for (let d = 1; d <= days; d++) {
        if ((attendance[d] || 'P') === 'A') absent++;
      }
      document.getElementById('se-absent-days').value          = absent;
      document.getElementById('att-absent-count').textContent  = absent;
      document.getElementById('att-month-days').textContent    = `/ ${days} days in month`;
    } else {
      document.getElementById('se-absent-days').value          = 0;
      document.getElementById('att-absent-count').textContent  = '0';
      document.getElementById('att-month-days').textContent    = '';
    }
  },

  _updateAttendanceRow() {
    const month = document.getElementById('se-month').value;
    if (month) {
      const days = getDaysInMonth(month);
      document.getElementById('att-month-days').textContent = `/ ${days} days in month`;
    }
  },

  calcPreview() {
    const basic         = parseFloat(document.getElementById('se-basic').value)          || 0;
    const otHours       = parseFloat(document.getElementById('se-ot-hours').value)       || 0;
    const bonus         = parseFloat(document.getElementById('se-bonus').value)          || 0;
    const festivalBonus = parseFloat(document.getElementById('se-festival-bonus').value) || 0;
    const deductions    = parseFloat(document.getElementById('se-deductions').value)     || 0;
    const advance       = parseFloat(document.getElementById('se-advance').value)        || 0;
    const absentDays    = parseInt(document.getElementById('se-absent-days').value)      || 0;
    const month         = document.getElementById('se-month').value;
    const daysInMonth   = month ? getDaysInMonth(month) : 30;

    const { otAmount, absentDeduction, total } =
      calcSalary(basic, otHours, bonus, festivalBonus, absentDays, daysInMonth, deductions, advance);

    document.getElementById('prev-basic').textContent          = fmt(basic);
    document.getElementById('prev-ot').textContent             = fmt(otAmount);
    document.getElementById('prev-bonus').textContent          = fmt(bonus);
    document.getElementById('prev-festival-bonus').textContent = fmt(festivalBonus);
    document.getElementById('prev-absent-ded').textContent     = fmt(absentDeduction);
    document.getElementById('prev-deductions').textContent     = fmt(deductions);
    document.getElementById('prev-advance').textContent        = fmt(advance);
    document.getElementById('prev-total').textContent          = fmt(total);
  },

  async saveSalaryEntry(evt) {
    evt.preventDefault();
    const data          = loadData();
    const empId         = document.getElementById('se-employee').value;
    const month         = document.getElementById('se-month').value;
    const basic         = parseFloat(document.getElementById('se-basic').value)          || 0;
    const otHours       = parseFloat(document.getElementById('se-ot-hours').value)       || 0;
    const bonus         = parseFloat(document.getElementById('se-bonus').value)          || 0;
    const festivalBonus = parseFloat(document.getElementById('se-festival-bonus').value) || 0;
    const deductions    = parseFloat(document.getElementById('se-deductions').value)     || 0;
    const advance       = parseFloat(document.getElementById('se-advance').value)        || 0;
    const absentDays    = parseInt(document.getElementById('se-absent-days').value)      || 0;
    const daysInMonth   = month ? getDaysInMonth(month) : 30;

    if (!empId || !month) { showToast('Select employee and month!', 'error'); return; }

    const { otAmount, absentDeduction, total } =
      calcSalary(basic, otHours, bonus, festivalBonus, absentDays, daysInMonth, deductions, advance);

    const existIdx = data.salaryRecords.findIndex(r => r.employeeId === empId && r.month === month);

    const record = {
      id:               existIdx !== -1 ? data.salaryRecords[existIdx].id : getNextSalaryRecordId(),
      employeeId:       empId,
      month,
      basicSalary:      basic,
      otHours,
      otAmount,
      bonus,
      festivalBonus,
      absentDays,
      absentDeduction,
      deductions,
      advance,
      totalSalary:      total,
      createdAt:        Date.now(),
    };

    if (existIdx !== -1) {
      data.salaryRecords[existIdx] = record;
      showToast('Record updated!');
    } else {
      data.salaryRecords.push(record);
      showToast('Record saved!');
    }

    await saveData(data);
    this.resetSalaryForm();
    this.renderPayrollReports();
  },

  resetSalaryForm() {
    const zeroFields = ['se-ot-hours', 'se-bonus', 'se-festival-bonus', 'se-deductions', 'se-advance'];
    document.getElementById('se-employee').value         = '';
    document.getElementById('se-basic').value            = '';
    document.getElementById('se-absent-days').value      = '0';
    document.getElementById('att-absent-count').textContent = '0';
    document.getElementById('att-month-days').textContent   = '';
    zeroFields.forEach(id => { document.getElementById(id).value = '0'; });
    this.calcPreview();
  },

  // ── Attendance Modal ────────────────────────────────────────────────────────

  openAttendanceModal() {
    const empId = document.getElementById('se-employee').value;
    const month = document.getElementById('se-month').value;

    if (!empId) { showToast('Please select an employee first!', 'warning'); return; }
    if (!month) { showToast('Please select a month first!', 'warning'); return; }

    this._attEmpId = empId;
    this._attMonth = month;

    const data = loadData();
    const key  = `${empId}|${month}`;
    this._tempAttendance = Object.assign({}, (data.attendance || {})[key] || {});

    const emp = data.employees.find(e => e.id === empId);
    document.getElementById('attModalTitle').textContent =
      'Attendance \u2014 ' + (emp ? emp.name : empId) + ' (' + fmtMonth(month) + ')';

    this._renderAttCalendar();
    document.getElementById('attendanceModal').classList.add('show');
  },

  _renderAttCalendar() {
    const month       = this._attMonth;
    const [y, m]      = month.split('-').map(Number);
    const daysInMonth = getDaysInMonth(month);
    const firstDay    = new Date(y, m - 1, 1).getDay();

    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div class="att-day-empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
      const status = (this._tempAttendance[day] || 'P');
      html += `<div class="att-day att-${status.toLowerCase()}" data-day="${day}" onclick="app.toggleAttDay(${day})">
        <span class="att-day-num">${day}</span>
        <span class="att-day-label">${status}</span>
      </div>`;
    }

    document.getElementById('attGrid').innerHTML = html;
    this._updateAttSummary();
  },

  toggleAttDay(day) {
    const current = this._tempAttendance[day] || 'P';
    const next    = { P: 'A', A: 'H', H: 'P' }[current];
    this._tempAttendance[day] = next;

    const cell = document.querySelector(`.att-day[data-day="${day}"]`);
    if (cell) {
      cell.className = `att-day att-${next.toLowerCase()}`;
      cell.querySelector('.att-day-label').textContent = next;
    }
    this._updateAttSummary();
  },

  _updateAttSummary() {
    const days = getDaysInMonth(this._attMonth);
    let p = 0, a = 0, h = 0;
    for (let d = 1; d <= days; d++) {
      const s = this._tempAttendance[d] || 'P';
      if (s === 'P') p++;
      else if (s === 'A') a++;
      else if (s === 'H') h++;
    }
    document.getElementById('att-sum-p').textContent = p;
    document.getElementById('att-sum-a').textContent = a;
    document.getElementById('att-sum-h').textContent = h;
  },

  async saveAttendance() {
    const data = loadData();
    if (!data.attendance) data.attendance = {};
    const key = `${this._attEmpId}|${this._attMonth}`;
    data.attendance[key] = { ...this._tempAttendance };
    await saveData(data);

    const days = getDaysInMonth(this._attMonth);
    let absent = 0;
    for (let d = 1; d <= days; d++) {
      if ((this._tempAttendance[d] || 'P') === 'A') absent++;
    }
    document.getElementById('se-absent-days').value          = absent;
    document.getElementById('att-absent-count').textContent  = absent;
    document.getElementById('att-month-days').textContent    = `/ ${days} days in month`;
    this.calcPreview();

    this.closeAttendanceModal();
    this.renderAttendanceManagement();
    this.renderPayrollReports();
    showToast('Attendance saved!');
  },

  closeAttendanceModal() {
    document.getElementById('attendanceModal').classList.remove('show');
  },

  // ── Attendance Management View (IN/OUT Tracking) ─────────────────────────────

  renderAttendanceManagement() {
    const dateInput = document.getElementById('att-man-date');
    const now = new Date();
    const today = formatAsYYYYMMDD(now);
    if (!dateInput) return;
    if (!dateInput.value) dateInput.value = today;
    this._attMgmtDate = dateInput.value;

    // Initialise PL month picker
    const plMonthEl = document.getElementById('att-pl-month');
    if (plMonthEl && !plMonthEl.value) {
      plMonthEl.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    this._renderDailyAttendanceRows(this._attMgmtDate, 'admin');
    if (plMonthEl && plMonthEl.value) this.renderPLSummary();
  },

  onAttendanceDateChange() {
    const dateEl = document.getElementById('att-man-date');
    if (!dateEl || !dateEl.value) return;
    this._attMgmtDate = dateEl.value;
    this._renderDailyAttendanceRows(this._attMgmtDate, 'admin');
  },

  // ── Shared daily attendance renderer ─────────────────────────────────────────

  async _renderDailyAttendanceRows(dateStr, mode) {
    // mode = 'admin' | 'operator'
    const tbodyId = mode === 'operator' ? 'opAttList' : 'attendance-list-tbody';
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const data = loadData();
    if (!data.employees.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No employees found</td></tr>`;
      this._updateAttSummaryCounters([], mode);
      return;
    }

    // Fetch this date's attendance from Firebase
    const snap = await get(ref(database, `${ATTENDANCE_PATH}/${dateStr}`));
    const attDay = snap.exists() ? snap.val() : {};

    const today = formatAsYYYYMMDD(new Date());
    const isToday = dateStr === today;
    const isAdmin = mode === 'admin';

    const rows = data.employees.map(emp => {
      const rec = attDay[emp.id] || {};
      const inTime  = rec.in_time  || '';
      const outTime = rec.out_time || '';
      const status  = rec.status   || 'A';
      const regHrs  = typeof rec.reg_hours === 'number' ? rec.reg_hours.toFixed(2) : '—';
      const otHrs   = typeof rec.ot_hours === 'number' ? rec.ot_hours.toFixed(2) : '—';

      // Can edit if admin OR (operator AND today)
      const canEdit = isAdmin || isToday;
      const hasIn  = !!inTime;
      const hasOut = !!outTime;

      const statusBadge = `<span class="att-status-badge att-badge-${status}">${status}</span>`;

      const inBtn  = hasIn
        ? `<span style="font-weight:600;color:#16a34a">${inTime}</span>`
        : (canEdit ? `<button class="btn-mark-in" onclick="app.markAttendance('${esc(emp.id)}','${dateStr}','in','${mode}')"><i class="fas fa-sign-in-alt me-1"></i>Mark IN</button>` : '—');

      const outBtn = hasIn && !hasOut
        ? (canEdit ? `<button class="btn-mark-out" onclick="app.markAttendance('${esc(emp.id)}','${dateStr}','out','${mode}')"><i class="fas fa-sign-out-alt me-1"></i>Mark OUT</button>` : '—')
        : (hasOut ? `<span style="font-weight:600;color:#dc2626">${outTime}</span>` : '—');

      const adminEditBtn = isAdmin
        ? `<button class="icon-btn edit ms-1" title="Edit" onclick="app.openEditAttendance('${esc(emp.id)}','${dateStr}')"><i class="fas fa-edit"></i></button>`
        : '';

      return `<tr>
        <td>${esc(emp.name)}</td>
        <td>${esc(emp.id)}</td>
        <td>${inBtn}</td>
        <td>${outBtn}</td>
        <td>${regHrs}</td>
        <td>${otHrs}</td>
        <td>${statusBadge}</td>
        <td>${adminEditBtn}</td>
      </tr>`;
    });

    tbody.innerHTML = rows.join('');
    this._updateAttSummaryCounters(data.employees.map(e => (attDay[e.id] || {}).status || 'A'), mode);
  },

  _updateAttSummaryCounters(statuses, mode) {
    const prefix = mode === 'operator' ? 'op-att' : 'att-man';
    let p = 0, l = 0, pl = 0, a = 0, h = 0;
    statuses.forEach(s => {
      if (s === 'P') p++;
      else if (s === 'L') l++;
      else if (s === 'PL') pl++;
      else if (s === 'A') a++;
      else if (s === 'H') h++;
    });
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set(`${prefix}-p`, p);
    set(`${prefix}-l`, l);
    set(`${prefix}-pl`, pl);
    set(`${prefix}-a`, a);
    if (mode === 'admin') set('att-man-h', h);
  },

  // ── Mark IN / OUT ─────────────────────────────────────────────────────────────

  async markAttendance(empId, dateStr, type, mode) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    try {
      const snap = await get(ref(database, `${ATTENDANCE_PATH}/${dateStr}/${empId}`));
      const existing = snap.exists() ? snap.val() : {};

      if (type === 'in') {
        const inStatus = this._calcInStatus(timeStr);
        const updates = {
          in_time: timeStr,
          status: inStatus,
          out_time: existing.out_time || '',
          reg_hours: existing.reg_hours || 0,
          ot_hours: existing.ot_hours || 0,
          empId,
        };
        await set(ref(database, `${ATTENDANCE_PATH}/${dateStr}/${empId}`), updates);
      } else {
        // Mark OUT
        const inTime  = existing.in_time || '';
        const { regHrs, otHrs } = this._calcHours(inTime, timeStr);
        await update(ref(database, `${ATTENDANCE_PATH}/${dateStr}/${empId}`), {
          out_time: timeStr,
          reg_hours: regHrs,
          ot_hours: otHrs,
        });
      }

      this._renderDailyAttendanceRows(dateStr, mode);
      showToast(`${type === 'in' ? 'IN' : 'OUT'} marked for ${empId}.`, 'success');
    } catch (err) {
      console.error('markAttendance failed:', err);
      showToast('Failed to mark attendance.', 'error');
    }
  },

  // ── Calculate IN status (P / L / PL) ─────────────────────────────────────────

  _calcInStatus(timeStr) {
    if (!timeStr) return 'A';
    const [h, m] = timeStr.split(':').map(Number);
    const mins = h * 60 + m;
    const workStart  = WORK_START_H * 60 + WORK_START_M;  // 480 mins = 8:00
    const lateLimit  = 8 * 60 + 5;                        // 485 mins = 8:05
    const penaltyLim = LATE_MAX_H * 60 + LATE_MAX_M;      // 495 mins = 8:15
    if (mins <= lateLimit)  return 'P';
    if (mins <= penaltyLim) return 'L';
    return 'PL';
  },

  // ── Calculate reg/OT hours ────────────────────────────────────────────────────

  _calcHours(inTimeStr, outTimeStr) {
    if (!inTimeStr || !outTimeStr) return { regHrs: 0, otHrs: 0 };
    const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const inMins  = toMins(inTimeStr);
    const outMins = toMins(outTimeStr);
    const workEnd = WORK_END_H * 60 + WORK_END_M; // 1020 mins = 17:00
    const totalMins = Math.max(0, outMins - inMins);
    const regMins   = Math.min(totalMins, Math.max(0, workEnd - inMins));
    const otMins    = outMins > workEnd ? outMins - workEnd : 0;
    return {
      regHrs: parseFloat((regMins / 60).toFixed(2)),
      otHrs:  parseFloat((otMins  / 60).toFixed(2)),
    };
  },

  // ── Admin Edit Attendance ────────────────────────────────────────────────────

  async openEditAttendance(empId, dateStr) {
    const snap = await get(ref(database, `${ATTENDANCE_PATH}/${dateStr}/${empId}`));
    const rec = snap.exists() ? snap.val() : {};
    const inTime  = prompt(`Edit IN time for ${empId} on ${dateStr} (HH:MM):`, rec.in_time  || '');
    if (inTime === null) return;
    const outTime = prompt(`Edit OUT time for ${empId} on ${dateStr} (HH:MM):`, rec.out_time || '');
    if (outTime === null) return;

    const inStatus = this._calcInStatus(inTime);
    const { regHrs, otHrs } = this._calcHours(inTime, outTime);
    try {
      await set(ref(database, `${ATTENDANCE_PATH}/${dateStr}/${empId}`), {
        in_time:   inTime,
        out_time:  outTime,
        reg_hours: regHrs,
        ot_hours:  otHrs,
        status:    inStatus,
        empId,
      });
      this._renderDailyAttendanceRows(dateStr, 'admin');
      showToast('Attendance updated.', 'success');
    } catch (err) {
      showToast('Failed to update attendance.', 'error');
    }
  },

  // ── PL Penalty Summary ────────────────────────────────────────────────────────

  async renderPLSummary() {
    const monthEl = document.getElementById('att-pl-month');
    if (!monthEl || !monthEl.value) return;
    const month = monthEl.value;
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = getDaysInMonth(month);
    const data = loadData();
    const tbody = document.getElementById('att-pl-tbody');
    if (!tbody) return;

    // Fetch all attendance for this month from Firebase
    const rows = [];
    for (const emp of data.employees) {
      let plCount = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${month}-${String(d).padStart(2, '0')}`;
        const snap = await get(ref(database, `${ATTENDANCE_PATH}/${dateStr}/${emp.id}`));
        if (snap.exists()) {
          const rec = snap.val();
          if (rec.status === 'PL') plCount++;
        }
      }
      const deducted = Math.floor(plCount / 3);
      rows.push({ emp, plCount, deducted });
    }

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No employees</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `<tr>
      <td>${esc(r.emp.name)}</td>
      <td>${esc(r.emp.id)}</td>
      <td>${r.plCount > 0 ? `<span class="att-status-badge att-badge-PL">${r.plCount}</span>` : '0'}</td>
      <td>${r.deducted > 0 ? `<span style="color:var(--danger);font-weight:600">${r.deducted}</span>` : '0'}</td>
      <td>${daysInMonth - r.deducted}</td>
    </tr>`).join('');
  },

  // ── Payroll Reports ──────────────────────────────────────────────────────────

  renderPayrollReports() {
    const periodEl = document.getElementById('pr-period');
    const startEl  = document.getElementById('pr-start-date');
    const endEl    = document.getElementById('pr-end-date');
    if (!periodEl || !startEl || !endEl) return;
    if (!startEl.value || !endEl.value) this.onPayrollPeriodChange();
  },

  onPayrollPeriodChange() {
    const period = document.getElementById('pr-period').value;
    const startEl = document.getElementById('pr-start-date');
    const endEl   = document.getElementById('pr-end-date');
    const base = startEl.value ? dateStringToMidnight(startEl.value) : new Date();
    let start = new Date(base);
    let end   = new Date(base);

    if (period === 'daily') {
      // start/end stay same day
    } else if (period === 'weekly') {
      start.setDate(base.getDate() - base.getDay());
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else {
      start = new Date(base.getFullYear(), base.getMonth(), 1);
      end   = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    }

    startEl.value = formatAsYYYYMMDD(start);
    endEl.value   = formatAsYYYYMMDD(end);
  },

  loadPayrollReport() {
    const data     = loadData();
    const startStr = document.getElementById('pr-start-date').value;
    const endStr   = document.getElementById('pr-end-date').value;
    const tbody    = document.getElementById('pr-tbody');
    const tfoot    = document.getElementById('pr-tfoot');
    if (!startStr || !endStr) { showToast('Select start and end dates!', 'error'); return; }

    const start = dateStringToMidnight(startStr);
    const end   = dateStringToMidnight(endStr);
    if (start > end) { showToast('Start date must be before end date!', 'error'); return; }

    if (!data.employees.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No employees found</td></tr>';
      tfoot.innerHTML = '';
      document.getElementById('pr-total-attendance').textContent = '0 / 0 / 0';
      document.getElementById('pr-total-salary').textContent = fmt(0);
      return;
    }

    const salaryRecordsByEmployee = data.salaryRecords.reduce((acc, record) => {
      if (!acc[record.employeeId]) acc[record.employeeId] = [];
      acc[record.employeeId].push(record);
      return acc;
    }, {});

    let totalP = 0, totalA = 0, totalH = 0, totalOt = 0, totalSalary = 0;
    const rows = data.employees.map(emp => {
      let p = 0, a = 0, h = 0, salary = 0, ot = 0;

      const startUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
      const endUTC   = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
      for (let ts = startUTC; ts <= endUTC; ts += MS_PER_DAY) {
        const dateStr = formatAsYYYYMMDD(new Date(ts));
        const status = getAttendanceStatus(data, emp.id, dateStr);
        if (status === 'A') a++;
        else if (status === 'H') h++;
        else p++;
      }

      (salaryRecordsByEmployee[emp.id] || []).forEach(r => {
          const daysInMonth = getDaysInMonth(r.month);
          const monthStart = dateStringToMidnight(`${r.month}-01`);
          const monthEnd   = dateStringToMidnight(`${r.month}-${String(daysInMonth).padStart(2, '0')}`);
          const overlapStart = monthStart > start ? monthStart : start;
          const overlapEnd   = monthEnd < end ? monthEnd : end;
          if (overlapStart > overlapEnd) return;
          const overlapDays = daysBetweenInclusive(overlapStart, overlapEnd);
          const factor = overlapDays / daysInMonth;
          salary += (r.totalSalary || 0) * factor;
          ot += (r.otHours || 0) * factor;
        });

      totalP += p;
      totalA += a;
      totalH += h;
      totalOt += ot;
      totalSalary += salary;

      return `<tr>
        <td>${esc(emp.name)}</td>
        <td>${esc(emp.id)}</td>
        <td>${p}</td>
        <td>${a}</td>
        <td>${h}</td>
        <td>${formatOtHours(ot)}</td>
        <td class="amount-positive"><strong>${fmt(salary)}</strong></td>
      </tr>`;
    });

    tbody.innerHTML = rows.join('');
    tfoot.innerHTML = `<tr>
      <td colspan="2"><strong>TOTALS (${data.employees.length} employees)</strong></td>
      <td><strong>${totalP}</strong></td>
      <td><strong>${totalA}</strong></td>
      <td><strong>${totalH}</strong></td>
      <td><strong>${formatOtHours(totalOt)}</strong></td>
      <td class="amount-positive"><strong>${fmt(totalSalary)}</strong></td>
    </tr>`;

    document.getElementById('pr-total-attendance').textContent = `${totalP} / ${totalA} / ${totalH}`;
    document.getElementById('pr-total-salary').textContent = fmt(totalSalary);
  },

  // ── History ─────────────────────────────────────────────────────────────────

  _populateHistoryFilters(data) {
    const empSel   = document.getElementById('hist-employee');
    const mthSel   = document.getElementById('hist-month');
    const curEmp   = empSel.value;
    const curMonth = mthSel.value;

    empSel.innerHTML = '<option value="">All Employees</option>' +
      data.employees.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');

    const months = [...new Set(data.salaryRecords.map(r => r.month))].sort().reverse();
    mthSel.innerHTML = '<option value="">All Months</option>' +
      months.map(m => `<option value="${m}">${fmtMonth(m)}</option>`).join('');

    if (curEmp)   empSel.value = curEmp;
    if (curMonth) mthSel.value = curMonth;
  },

  renderHistory() {
    const data = loadData();
    this._populateHistoryFilters(data);
    this.filterHistory();
  },

  filterHistory() {
    const data     = loadData();
    const empF     = document.getElementById('hist-employee').value;
    const mthF     = document.getElementById('hist-month').value;
    let   records  = data.salaryRecords;

    if (empF) records = records.filter(r => r.employeeId === empF);
    if (mthF) records = records.filter(r => r.month === mthF);

    records.sort((a, b) => b.month.localeCompare(a.month) || a.employeeId.localeCompare(b.employeeId));

    const tbody = document.getElementById('history-tbody');
    if (!records.length) {
      tbody.innerHTML = '<tr><td colspan="14" class="empty-state">No records found</td></tr>';
      return;
    }

    tbody.innerHTML = records.map(r => {
      const emp = data.employees.find(e => e.id === r.employeeId);
      return `<tr>
        <td>${emp ? esc(emp.name) : 'Unknown'}</td>
        <td>${esc(r.employeeId)}</td>
        <td>${fmtMonth(r.month)}</td>
        <td>${fmt(r.basicSalary)}</td>
        <td>${r.otHours}</td>
        <td>${fmt(r.otAmount)}</td>
        <td>${fmt(r.bonus)}</td>
        <td>${fmt(r.festivalBonus || 0)}</td>
        <td>${r.absentDays || 0}</td>
        <td class="amount-negative">${fmt(r.absentDeduction || 0)}</td>
        <td class="amount-negative">${fmt(r.deductions)}</td>
        <td class="amount-negative">${fmt(r.advance)}</td>
        <td class="amount-positive"><strong>${fmt(r.totalSalary)}</strong></td>
        <td>
          <button class="icon-btn primary" onclick="app.generateSlipPDF('${r.id}')" title="Salary Slip PDF"><i class="fas fa-download"></i></button>
          <button class="icon-btn delete"  onclick="app.confirmDeleteRecord('${r.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  },

  confirmDeleteRecord(id) {
    document.getElementById('confirmMessage').textContent = 'Delete this salary record? This cannot be undone.';
    document.getElementById('confirmBtn').onclick = () => this.deleteRecord(id);
    document.getElementById('confirmModal').classList.add('show');
  },

  async deleteRecord(id) {
    const data = loadData();
    data.salaryRecords = data.salaryRecords.filter(r => r.id !== id);
    await saveData(data);
    this.closeConfirmModal();
    this.filterHistory();
    showToast('Record deleted!');
  },

  // ── Monthly Summary ─────────────────────────────────────────────────────────

  loadSummary() {
    const month = document.getElementById('summary-month').value;
    if (!month) { showToast('Please select a month!', 'error'); return; }

    const data    = loadData();
    const records = data.salaryRecords.filter(r => r.month === month);
    const tbody   = document.getElementById('summary-tbody');
    const tfoot   = document.getElementById('summary-tfoot');

    if (!records.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty-state">No records for ${esc(fmtMonth(month))}</td></tr>`;
      tfoot.innerHTML = '';
      return;
    }

    let totBasic = 0, totOtHrs = 0, totOtAmt = 0, totBonus = 0, totFest = 0,
        totAbsentDays = 0, totDed = 0, totNet = 0;

    tbody.innerHTML = records.map((r, i) => {
      const emp      = data.employees.find(e => e.id === r.employeeId);
      const totalDed = (r.absentDeduction || 0) + r.deductions + r.advance;
      totBasic      += r.basicSalary;
      totOtHrs      += r.otHours;
      totOtAmt      += r.otAmount;
      totBonus      += r.bonus;
      totFest       += (r.festivalBonus || 0);
      totAbsentDays += (r.absentDays || 0);
      totDed        += totalDed;
      totNet        += r.totalSalary;

      return `<tr>
        <td>${i + 1}</td>
        <td>${emp ? esc(emp.name) : 'Unknown'}</td>
        <td>${esc(r.employeeId)}</td>
        <td>${fmt(r.basicSalary)}</td>
        <td>${r.otHours}</td>
        <td>${fmt(r.otAmount)}</td>
        <td>${fmt(r.bonus)}</td>
        <td>${fmt(r.festivalBonus || 0)}</td>
        <td>${r.absentDays || 0}</td>
        <td class="amount-negative">${fmt(totalDed)}</td>
        <td class="amount-positive"><strong>${fmt(r.totalSalary)}</strong></td>
        <td>
          <button class="icon-btn primary" onclick="app.generateSlipPDF('${r.id}')" title="Salary Slip PDF"><i class="fas fa-file-pdf"></i></button>
        </td>
      </tr>`;
    }).join('');

    tfoot.innerHTML = `<tr>
      <td colspan="3"><strong>TOTALS (${records.length} employees)</strong></td>
      <td><strong>${fmt(totBasic)}</strong></td>
      <td><strong>${totOtHrs}</strong></td>
      <td><strong>${fmt(totOtAmt)}</strong></td>
      <td><strong>${fmt(totBonus)}</strong></td>
      <td><strong>${fmt(totFest)}</strong></td>
      <td><strong>${totAbsentDays}</strong></td>
      <td class="amount-negative"><strong>${fmt(totDed)}</strong></td>
      <td class="amount-positive"><strong>${fmt(totNet)}</strong></td>
      <td></td>
    </tr>`;
  },

  // ── PDF: Individual Salary Slip ─────────────────────────────────────────────

  generateSlipPDF(recordId) {
    const data   = loadData();
    const record = data.salaryRecords.find(r => r.id === recordId);
    if (!record) { showToast('Record not found!', 'error'); return; }

    const emp = data.employees.find(e => e.id === record.employeeId);
    if (!emp)  { showToast('Employee not found!', 'error'); return; }

    const { jsPDF } = window.jspdf;
    const doc    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW  = doc.internal.pageSize.getWidth();
    const margin = 15;
    let y = 0;

    const headerColor = [13, 115, 119];

    // ── Header banner
    doc.setFillColor(...headerColor);
    doc.rect(0, 0, pageW, 38, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(data.companyName || 'TRACS APPAREL', pageW / 2, 13, { align: 'center' });

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('EMPLOYEE SALARY SLIP', pageW / 2, 22, { align: 'center' });

    doc.setFontSize(9);
    doc.text(fmtMonth(record.month), pageW / 2, 30, { align: 'center' });

    y = 44;

    if (emp.photo) {
      try { doc.addImage(emp.photo, 'JPEG', margin, y, 22, 22); } catch (e) { /* ignore */ }
    }

    const detailX = emp.photo ? margin + 26 : margin;
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 252, 252);
    doc.setDrawColor(200, 230, 230);
    doc.roundedRect(margin, y, pageW - margin * 2, 30, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    const labelX  = detailX + 2;
    const valueX  = detailX + 32;
    const label2X = pageW / 2 + 5;
    const value2X = pageW / 2 + 35;

    const rows = [
      ['Name:',         emp.name,                              'Pay Period:',  fmtMonth(record.month)],
      ['Employee ID:',  emp.id,                                'Department:',  emp.department || 'N/A'],
      ['Basic Salary:', 'BDT ' + fmtPDF(record.basicSalary),  'Absent Days:', String(record.absentDays || 0)],
    ];
    rows.forEach((row, i) => {
      const ry = y + 7 + i * 8;
      doc.setFont('helvetica', 'bold');   doc.text(row[0], labelX, ry);
      doc.setFont('helvetica', 'normal'); doc.text(row[1], valueX, ry);
      if (row[2]) { doc.setFont('helvetica', 'bold');   doc.text(row[2], label2X, ry); }
      if (row[3]) { doc.setFont('helvetica', 'normal'); doc.text(row[3], value2X, ry); }
    });

    y += 36;

    const festBonus = record.festivalBonus || 0;
    const absentDed = record.absentDeduction || 0;
    const gross     = record.basicSalary + record.otAmount + record.bonus + festBonus;
    const totalDed  = absentDed + record.deductions + record.advance;

    doc.autoTable({
      startY: y,
      head:   [['EARNINGS', 'Amount (BDT)']],
      body:   [
        ['Basic Salary',                      fmtPDF(record.basicSalary)],
        ['Overtime (' + record.otHours + ' hrs)', fmtPDF(record.otAmount)],
        ['Regular Bonus',                     fmtPDF(record.bonus)],
        ['Festival Bonus',                    fmtPDF(festBonus)],
        ['Gross Earnings',                    fmtPDF(gross)],
      ],
      theme:        'grid',
      headStyles:   { fillColor: headerColor, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles:       { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      margin:       { left: margin, right: pageW / 2 + 2 },
    });

    const earningsY = doc.lastAutoTable.finalY;

    doc.autoTable({
      startY: y,
      head:   [['DEDUCTIONS', 'Amount (BDT)']],
      body:   [
        ['Absent Deduction',   fmtPDF(absentDed)],
        ['General Deductions', fmtPDF(record.deductions)],
        ['Advance',            fmtPDF(record.advance)],
        ['Total Deductions',   fmtPDF(totalDed)],
      ],
      theme:        'grid',
      headStyles:   { fillColor: [180, 50, 50], textColor: 255, fontStyle: 'bold', fontSize: 9 },
      styles:       { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      margin:       { left: pageW / 2 + 2, right: margin },
    });

    y = Math.max(earningsY, doc.lastAutoTable.finalY) + 5;

    doc.setFillColor(...headerColor);
    doc.rect(margin, y, pageW - margin * 2, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('NET PAY:', margin + 5, y + 9);
    doc.text('BDT ' + fmtPDF(record.totalSalary), pageW - margin - 5, y + 9, { align: 'right' });

    y += 22;

    doc.setTextColor(80, 80, 80);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Employee Signature: _______________________', margin, y);
    doc.text('Authorized Signature: _______________________', pageW - margin, y, { align: 'right' });

    y += 6;
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text('This is a system-generated document.', pageW / 2, y, { align: 'center' });

    doc.setFillColor(240, 245, 245);
    doc.rect(0, 283, pageW, 14, 'F');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('Generated on ' + new Date().toLocaleDateString() + ' | ' + data.companyName, pageW / 2, 291, { align: 'center' });

    doc.save('Salary_Slip_' + emp.name.replace(/\s+/g, '_') + '_' + record.month + '.pdf');
    showToast('Salary slip downloaded!', 'info');
  },

  // ── PDF: Monthly Summary Sheet ──────────────────────────────────────────────

  generateSummaryPDF() {
    const month = document.getElementById('summary-month').value;
    if (!month) { showToast('Please select a month!', 'error'); return; }

    const data    = loadData();
    const records = data.salaryRecords.filter(r => r.month === month);
    if (!records.length) { showToast('No records for selected month!', 'error'); return; }

    const { jsPDF } = window.jspdf;
    const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const headerColor = [13, 115, 119];

    doc.setFillColor(...headerColor);
    doc.rect(0, 0, pageW, 32, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(data.companyName || 'TRACS APPAREL', pageW / 2, 11, { align: 'center' });

    doc.setFontSize(11);
    doc.text('MONTHLY SALARY SUMMARY SHEET', pageW / 2, 20, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtMonth(month), pageW / 2, 28, { align: 'center' });

    let totBasic = 0, totOtHrs = 0, totOtAmt = 0, totBonus = 0, totFest = 0,
        totAbsent = 0, totDed = 0, totNet = 0;

    const tableRows = records.map((r, i) => {
      const emp      = data.employees.find(e => e.id === r.employeeId);
      const totalDed = (r.absentDeduction || 0) + r.deductions + r.advance;
      totBasic  += r.basicSalary;
      totOtHrs  += r.otHours;
      totOtAmt  += r.otAmount;
      totBonus  += r.bonus;
      totFest   += (r.festivalBonus || 0);
      totAbsent += (r.absentDays || 0);
      totDed    += totalDed;
      totNet    += r.totalSalary;

      return [
        i + 1,
        emp ? emp.name : 'Unknown',
        r.employeeId,
        fmtPDF(r.basicSalary),
        r.otHours,
        fmtPDF(r.otAmount),
        fmtPDF(r.bonus),
        fmtPDF(r.festivalBonus || 0),
        r.absentDays || 0,
        fmtPDF(totalDed),
        fmtPDF(r.totalSalary),
      ];
    });

    const totalRow = [
      '', 'TOTAL', '',
      fmtPDF(totBasic), totOtHrs, fmtPDF(totOtAmt),
      fmtPDF(totBonus), fmtPDF(totFest), totAbsent,
      fmtPDF(totDed),   fmtPDF(totNet),
    ];
    tableRows.push(totalRow);

    doc.autoTable({
      startY: 38,
      head:   [['#', 'Employee Name', 'ID', 'Basic (BDT)', 'OT Hrs', 'OT Amt', 'Bonus', 'Fest. Bonus', 'Absent Days', 'Total Deduction', 'Net Salary (BDT)']],
      body:   tableRows,
      theme:  'grid',
      headStyles:  { fillColor: headerColor, textColor: 255, fontStyle: 'bold', fontSize: 8 },
      styles:      { fontSize: 8, cellPadding: 2.5 },
      columnStyles: {
        0:  { cellWidth: 8,  halign: 'center' },
        1:  { cellWidth: 40 },
        2:  { cellWidth: 18, halign: 'center' },
        3:  { halign: 'right' },
        4:  { cellWidth: 12, halign: 'center' },
        5:  { halign: 'right' },
        6:  { halign: 'right' },
        7:  { halign: 'right' },
        8:  { cellWidth: 14, halign: 'center' },
        9:  { halign: 'right' },
        10: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell(hook) {
        if (hook.row.index === tableRows.length - 1) {
          hook.cell.styles.fillColor = [210, 245, 240];
          hook.cell.styles.fontStyle = 'bold';
          hook.cell.styles.fontSize  = 9;
        }
      },
    });

    const fy = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Total Employees: ' + records.length + '  |  Generated: ' + new Date().toLocaleDateString(), 14, fy);
    doc.text('Authorized Signature: _______________________', pageW - 14, fy, { align: 'right' });

    doc.save('Monthly_Summary_' + month + '.pdf');
    showToast('Monthly summary PDF downloaded!', 'info');
  },

  // ── First-Time Setup ────────────────────────────────────────────────────────

  async _checkFirstTimeSetup() {
    try {
      const snap = await get(ref(database, 'setup_complete'));
      if (!snap.exists() || snap.val() !== true) {
        this._showSetup(true);
        this._showLogin(false);
      } else {
        this._showSetup(false);
        this._showLogin(true);
      }
    } catch (e) {
      this._showLogin(true);
    }
  },

  async createAdminAccount(evt) {
    evt.preventDefault();
    const email  = (document.getElementById('setupEmail')?.value || '').trim();
    const pass   = document.getElementById('setupPassword')?.value || '';
    const pass2  = document.getElementById('setupPassword2')?.value || '';
    const errEl  = document.getElementById('setupError');
    const btn    = document.getElementById('setupBtn');

    if (errEl) errEl.style.display = 'none';
    if (pass.length < 6) {
      if (errEl) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; }
      return;
    }
    if (pass !== pass2) {
      if (errEl) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; }
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Creating…'; }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const uid  = cred.user.uid;
      await set(ref(database, `${USERS_PATH}/${uid}`), {
        email, role: 'admin', status: 'active',
        createdAt: Date.now(), lastLogin: Date.now(), mustChangePassword: false,
      });
      await set(ref(database, 'setup_complete'), true);
      this._showSetup(false);
      showToast('Admin account created! Welcome.', 'success');
      // onAuthStateChanged fires automatically
    } catch (err) {
      let msg = 'Failed to create admin account.';
      if (err.code === 'auth/email-already-in-use') msg = 'That email is already in use.';
      if (err.code === 'auth/invalid-email')        msg = 'Invalid email address.';
      if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-shield me-1"></i>Create Admin Account'; }
    }
  },

  // ── Change Password (first login) ──────────────────────────────────────────

  async saveNewPassword(evt) {
    evt.preventDefault();
    const newPass  = document.getElementById('newPassword')?.value || '';
    const newPass2 = document.getElementById('newPassword2')?.value || '';
    const errEl    = document.getElementById('changePassError');
    const btn      = document.getElementById('changePassBtn');

    if (errEl) errEl.style.display = 'none';
    if (newPass.length < 6) {
      if (errEl) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; }
      return;
    }
    if (newPass !== newPass2) {
      if (errEl) { errEl.textContent = 'Passwords do not match.'; errEl.style.display = 'block'; }
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saving…'; }
    try {
      await updatePassword(auth.currentUser, newPass);
      await update(ref(database, `${USERS_PATH}/${auth.currentUser.uid}`), { mustChangePassword: false });
      this._showChangePassword(false);
      showToast('Password updated successfully!', 'success');
      // Now proceed with normal login flow
      await this._bootstrapAfterAuth(auth.currentUser);
    } catch (err) {
      let msg = 'Failed to update password.';
      if (err.code === 'auth/requires-recent-login') msg = 'Session expired. Please log in again.';
      if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-key me-1"></i>Set New Password'; }
    }
  },

  async _bootstrapAfterAuth(user) {
    try {
      await loadDataFromCloud();
      this._syncCompanyNameInput();
      await update(ref(database, `${USERS_PATH}/${user.uid}`), { lastLogin: Date.now() });

      if (currentRole === 'admin') {
        this._setAppAccess(true);
        this._hideOperatorShell();
        this._applyAuthHeader(true);
        this._applyRoleBasedUI('admin');
        this.navigateTo('dashboard');
        showToast('Welcome back, Admin!', 'success');
      } else if (currentRole === 'operator') {
        this._setAppAccess(false);
        this._applyAuthHeader(false);
        this._showOperatorShell();
        const emailEl = document.getElementById('opUserEmail');
        if (emailEl) emailEl.textContent = user.email;
        this.loadOperatorOrders();
        showToast('Signed in as Operator.', 'info');
      }
    } catch (err) {
      console.error('Bootstrap after auth failed:', err);
      showToast('Failed to load data. Please try again.', 'error');
      await signOut(auth);
    }
  },

  // ── Operator Dashboard ──────────────────────────────────────────────────────

  loadOperatorOrders() {
    const tbody = document.getElementById('opOrdersList');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4">
      <div class="spinner-border text-secondary" role="status"><span class="visually-hidden">Loading…</span></div>
    </td></tr>`;

    onValue(ref(database, PROD_PATH), snap => {
      const records = snap.exists() ? snap.val() : {};
      const list = Object.entries(records)
        .map(([id, r]) => ({ id, ...r }))
        .filter(r => !this._isOrderComplete(r))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5" style="color:#64748b">
          <i class="fas fa-check-circle fa-2x mb-2 d-block opacity-25"></i>No active orders found.
        </td></tr>`;
        return;
      }

      tbody.innerHTML = list.map((rec, idx) => {
        const stage = this._deriveStage(rec);
        return `<tr>
          <td><strong>#${idx + 1}</strong></td>
          <td><strong>${escHtml(rec.buyerName || '—')}</strong></td>
          <td>${escHtml(rec.styleNo || '—')}</td>
          <td>${(rec.totalQty || 0).toLocaleString()}</td>
          <td><span class="stage-chip ${stage.cls}">${stage.label}</span></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="app.openUpdateProdModal('${rec.id}')">
              <i class="fas fa-edit me-1"></i>Update
            </button>
          </td>
        </tr>`;
      }).join('');
    });
  },

  _isOrderComplete(rec) {
    return (rec.washingQty || 0) > 0 && (rec.washingQty || 0) >= (rec.totalQty || 0);
  },

  _deriveStage(rec) {
    if ((rec.washingQty || 0) > 0) return { label: 'Washing/Complete', cls: 'complete' };
    if (rec.washingDate)            return { label: 'Washing',          cls: 'washing'  };
    if ((rec.sewingQty || 0) > 0)   return { label: 'Sewing',           cls: 'sewing'   };
    if (rec.cuttingDate)            return { label: 'Cutting',           cls: 'cutting'  };
    return { label: 'Pending', cls: 'cutting' };
  },

  _opEditRecord: null,

  async openUpdateProdModal(orderId) {
    const snap = await get(ref(database, `${PROD_PATH}/${orderId}`));
    if (!snap.exists()) return;
    const rec = snap.val();
    this._opEditRecord = { id: orderId, ...rec };

    document.getElementById('opUpdateOrderId').value   = orderId;
    document.getElementById('opUpdateBuyer').textContent = rec.buyerName || '—';
    document.getElementById('opUpdateStyle').textContent = rec.styleNo || '—';
    document.getElementById('opUpdateQty').textContent   = (rec.totalQty || 0).toLocaleString();

    const stage = this._deriveStage(rec);
    document.getElementById('opUpdateCurrentStage').textContent = stage.label;

    // Reset form
    document.getElementById('opUpdateStage').value = 'cutting';
    document.getElementById('opUpdateDate').value  = new Date().toISOString().slice(0, 10);
    document.getElementById('opUpdateQtyInput').value = '';
    document.getElementById('opUpdateError').style.display = 'none';

    document.getElementById('updateProdModal').classList.add('show');
  },

  closeUpdateProdModal() {
    document.getElementById('updateProdModal').classList.remove('show');
    this._opEditRecord = null;
  },

  async saveProductionUpdate(evt) {
    evt.preventDefault();
    const orderId   = document.getElementById('opUpdateOrderId').value;
    const stage     = document.getElementById('opUpdateStage').value;
    const date      = document.getElementById('opUpdateDate').value;
    const qty       = parseInt(document.getElementById('opUpdateQtyInput').value) || 0;
    const errEl     = document.getElementById('opUpdateError');
    const btn       = document.getElementById('opUpdateSaveBtn');

    if (errEl) errEl.style.display = 'none';
    if (!date) {
      if (errEl) { errEl.textContent = 'Please select a date.'; errEl.style.display = 'block'; }
      return;
    }
    if (qty <= 0) {
      if (errEl) { errEl.textContent = 'Quantity must be greater than 0.'; errEl.style.display = 'block'; }
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Saving…'; }

    try {
      const snap = await get(ref(database, `${PROD_PATH}/${orderId}`));
      if (!snap.exists()) throw new Error('Order not found');
      const rec = snap.val();

      const fieldMap = {
        cutting: { dateField: 'cuttingDate', qtyField: 'cuttingQty' },
        sewing:  { dateField: 'sewingDate',  qtyField: 'sewingQty'  },
        washing: { dateField: 'washingDate', qtyField: 'washingQty' },
      };
      const fields = fieldMap[stage];
      if (!fields) throw new Error('Invalid stage');

      const oldQty = rec[fields.qtyField] || 0;
      const updates = {
        [fields.dateField]: date,
        [fields.qtyField]:  qty,
        updatedAt:          Date.now(),
      };

      await update(ref(database, `${PROD_PATH}/${orderId}`), updates);

      // Log activity
      const user = auth.currentUser;
      await push(ref(database, ACTIVITY_PATH), {
        userEmail:  user ? user.email : 'Unknown',
        userId:     user ? user.uid : '',
        orderKey:   orderId,
        buyerName:  rec.buyerName || '',
        styleNo:    rec.styleNo || '',
        stage:      stage.charAt(0).toUpperCase() + stage.slice(1),
        oldQty,
        newQty:     qty,
        timestamp:  Date.now(),
      });

      this.closeUpdateProdModal();
      showOpToast('Production updated successfully!', 'success');
    } catch (err) {
      console.error('Save production update failed:', err);
      if (errEl) { errEl.textContent = 'Failed to save update. Please try again.'; errEl.style.display = 'block'; }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save me-1"></i>Save Update'; }
    }
  },

  // ── Admin: User Management ──────────────────────────────────────────────────

  async loadUsersPage() {
    const tbody = document.getElementById('usersTableTbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4">
      <div class="spinner-border text-secondary" role="status"></div>
    </td></tr>`;

    try {
      const snap = await get(ref(database, USERS_PATH));
      const users = snap.exists() ? snap.val() : {};
      const list = Object.entries(users).map(([uid, u]) => ({ uid, ...u }));

      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No users found.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(u => {
        const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never';
        const statusBadge = u.status === 'active'
          ? '<span class="badge bg-success">Active</span>'
          : '<span class="badge bg-secondary">Inactive</span>';
        const roleBadge = u.role === 'admin'
          ? '<span class="badge bg-primary">Admin</span>'
          : '<span class="badge bg-info text-dark">Operator</span>';
        return `<tr>
          <td>${esc(u.email || '')}</td>
          <td>${roleBadge}</td>
          <td>${statusBadge}</td>
          <td>${lastLogin}</td>
          <td>
            <div class="d-flex gap-1 flex-wrap">
              ${u.role !== 'admin' ? `
              <button class="btn btn-sm btn-outline-secondary"
                      onclick="app.toggleUserStatus('${u.uid}', ${u.status !== 'active'})"
                      title="${u.status === 'active' ? 'Deactivate' : 'Activate'}">
                <i class="fas fa-${u.status === 'active' ? 'user-slash' : 'user-check'}"></i>
              </button>
              <button class="btn btn-sm btn-outline-warning"
                      onclick="app.resetUserPasswordAdmin('${esc(u.email || '')}')"
                      title="Send Password Reset">
                <i class="fas fa-key"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger"
                      onclick="app.confirmDeleteUser('${u.uid}', '${esc(u.email || '')}')"
                      title="Delete User">
                <i class="fas fa-trash"></i>
              </button>` : '<span class="text-muted" style="font-size:.8rem">—</span>'}
            </div>
          </td>
        </tr>`;
      }).join('');
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state text-danger">Failed to load users.</td></tr>';
    }
  },

  async addOperator(evt) {
    evt.preventDefault();
    const email   = (document.getElementById('newOpEmail')?.value || '').trim();
    const pass    = document.getElementById('newOpPassword')?.value || '';
    const errEl   = document.getElementById('addOpError');
    const resultEl = document.getElementById('addOpResult');
    const btn     = document.getElementById('addOpBtn');

    if (errEl) errEl.style.display = 'none';
    if (resultEl) resultEl.style.display = 'none';
    if (!email || pass.length < 6) {
      if (errEl) { errEl.textContent = 'Email and password (min 6 chars) required.'; errEl.style.display = 'block'; }
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Creating…'; }

    try {
      // Use secondary Firebase app to create user without logging out admin
      const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
      const uid = cred.user.uid;
      await signOut(secondaryAuth);

      await set(ref(database, `${USERS_PATH}/${uid}`), {
        email, role: 'operator', status: 'active',
        createdAt: Date.now(), lastLogin: null, mustChangePassword: true,
      });

      document.getElementById('newOpEmail').value = '';
      document.getElementById('newOpPassword').value = '';
      if (resultEl) {
        resultEl.innerHTML = `<strong>Operator created!</strong><br>
          Email: <code>${esc(email)}</code><br>
          Temp Password: <code>${esc(pass)}</code><br>
          <small class="text-muted">Copy and share these credentials. The operator will be prompted to change their password on first login.</small>`;
        resultEl.style.display = 'block';
      }
      showToast('Operator account created!', 'success');
      this.loadUsersPage();
    } catch (err) {
      let msg = 'Failed to create operator.';
      if (err.code === 'auth/email-already-in-use') msg = 'That email is already in use.';
      if (err.code === 'auth/invalid-email')        msg = 'Invalid email address.';
      if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus me-1"></i>Add Operator'; }
    }
  },

  async toggleUserStatus(uid, makeActive) {
    try {
      await update(ref(database, `${USERS_PATH}/${uid}`), { status: makeActive ? 'active' : 'inactive' });
      showToast(`User ${makeActive ? 'activated' : 'deactivated'}.`, 'info');
      this.loadUsersPage();
    } catch (e) {
      showToast('Failed to update user status.', 'error');
    }
  },

  async resetUserPasswordAdmin(email) {
    if (!email) return;
    try {
      await sendPasswordResetEmail(auth, email);
      showToast(`Password reset email sent to ${email}.`, 'success');
    } catch (e) {
      showToast('Failed to send password reset email.', 'error');
    }
  },

  confirmDeleteUser(uid, email) {
    document.getElementById('confirmMessage').textContent =
      `Delete user "${email}"? This cannot be undone.`;
    document.getElementById('confirmBtn').onclick = () => this.deleteUserFromDb(uid);
    document.getElementById('confirmModal').classList.add('show');
  },

  async deleteUserFromDb(uid) {
    try {
      await set(ref(database, `${USERS_PATH}/${uid}`), null);
      this.closeConfirmModal();
      showToast('User removed from database.', 'info');
      this.loadUsersPage();
    } catch (e) {
      showToast('Failed to delete user.', 'error');
    }
  },

  // ── Admin: Activity Log ──────────────────────────────────────────────────────

  async loadActivityLog() {
    const tbody   = document.getElementById('activityLogTbody');
    const searchEl = document.getElementById('activitySearch');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">
      <div class="spinner-border text-secondary" role="status"></div>
    </td></tr>`;

    try {
      const snap = await get(ref(database, ACTIVITY_PATH));
      const raw  = snap.exists() ? snap.val() : {};
      let logs = Object.values(raw)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 100);

      const render = (filter = '') => {
        const lf = filter.toLowerCase().trim();
        const filtered = lf
          ? logs.filter(l =>
              (l.userEmail  || '').toLowerCase().includes(lf) ||
              (l.buyerName  || '').toLowerCase().includes(lf) ||
              (l.styleNo    || '').toLowerCase().includes(lf) ||
              (l.stage      || '').toLowerCase().includes(lf))
          : logs;

        if (!filtered.length) {
          tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No activity found.</td></tr>';
          return;
        }
        tbody.innerHTML = filtered.map(l => `<tr>
          <td>${new Date(l.timestamp || 0).toLocaleString()}</td>
          <td>${esc(l.userEmail || '—')}</td>
          <td>${esc(l.buyerName || '—')}</td>
          <td>${esc(l.styleNo   || '—')}</td>
          <td>${esc(l.stage     || '—')}</td>
          <td>${(l.oldQty || 0).toLocaleString()} → ${(l.newQty || 0).toLocaleString()}</td>
        </tr>`).join('');
      };

      render(searchEl ? searchEl.value : '');
      if (searchEl) {
        searchEl.oninput = () => render(searchEl.value);
      }
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state text-danger">Failed to load activity log.</td></tr>';
    }
  },
};

// ─── HTML escape helpers ───────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escHtml(str) { return esc(str); }

// ─── Operator Toast ────────────────────────────────────────────────────────────

function showOpToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  el.textContent = msg;
  const container = document.getElementById('opToastContainer') || document.getElementById('toast-container');
  if (container) {
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  } else {
    showToast(msg, type);
  }
}

// ─── Boot ──────────────────────────────────────────────────────────────────────

window.app = app;
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await app.init();
  } catch (err) {
    console.error('App initialization failed:', err);
    showToast('Failed to initialize app.', 'error');
  }
});

// ─── Firebase Auth State Listener ─────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      const snap = await get(ref(database, `${USERS_PATH}/${user.uid}/role`));
      currentRole = snap.exists() ? snap.val() : null;

      if (!currentRole) {
        // No role assigned — sign out
        showToast('Your account has no role assigned. Contact the admin.', 'error');
        await signOut(auth);
        return;
      }

      // Check must-change-password flag
      const mustSnap = await get(ref(database, `${USERS_PATH}/${user.uid}/mustChangePassword`));
      if (mustSnap.val() === true) {
        app._showLogin(false);
        app._setAppAccess(false);
        app._hideOperatorShell();
        app._showChangePassword(true);
        return;
      }

      app._showLogin(false);
      app._showChangePassword(false);
      await app._bootstrapAfterAuth(user);
    } catch (err) {
      console.error('Auth state handling failed:', err);
      showToast('Error loading account. Please try again.', 'error');
      await signOut(auth);
    }
  } else {
    currentUser = null;
    currentRole = null;
    dataCache = defaultData();
    app._applyAuthHeader(false);
    app._setAppAccess(false);
    app._hideOperatorShell();
    app._showChangePassword(false);
    // Check first-time setup
    await app._checkFirstTimeSetup();
  }
});
