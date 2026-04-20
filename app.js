/* app.js — TRACS APPAREL Management Web App */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js';
import { getDatabase, ref, set, push, get, child } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// ─── Firebase ─────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: 'AIzaSyCXDUrJtkuJZ4BvqsYOFg9SIjOysIgkqtk',
  authDomain: 'tracs-hr-mangment.firebaseapp.com',
  projectId: 'tracs-hr-mangment',
  storageBucket: 'tracs-hr-mangment.firebasestorage.app',
  messagingSenderId: '1094008024729',
  appId: '1:1094008024729:web:11f1afa99df6272cee9208',
  measurementId: 'G-6ZD2M74F0P',
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);
let analytics = null;
try { analytics = getAnalytics(firebaseApp); } catch (e) { analytics = null; }

void analytics;

// ─── Storage ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86400000;
const OT_RATE_FACTOR = 0.5 / 100;
const DATA_ROOT = 'tracsApparelData';
const ROLE_ROOT = 'tracsRoles';

let currentUserId = null;
let dataCache = defaultData();

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

function getUserDataPath(uid) {
  return `${DATA_ROOT}/${uid}`;
}

async function loadUserDataFromCloud(uid) {
  const rootRef = ref(database);
  const snap = await get(child(rootRef, getUserDataPath(uid)));
  if (snap.exists()) {
    dataCache = normalizeData(snap.val());
    return;
  }
  dataCache = defaultData();
  await set(ref(database, getUserDataPath(uid)), dataCache);
}

function loadData() {
  return cloneData(dataCache);
}

async function saveData(data) {
  dataCache = normalizeData(data);
  if (!currentUserId) return false;
  try {
    await set(ref(database, getUserDataPath(currentUserId)), dataCache);
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
  _pendingRole:     null,
  _currentUserRole: null,
  _currentUserEmail: '',
  _authBootstrapped: false,

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
    this._showLogin(true);

    onAuthStateChanged(auth, async user => {
      if (!user) {
        currentUserId = null;
        dataCache = defaultData();
        this._currentUserRole = null;
        this._currentUserEmail = '';
        this._applyAuthHeader();
        this._setAppAccess(false);
        this._showLogin(true);
        return;
      }

      try {
        const role = await this._resolveUserRole(user, this._pendingRole);
        if (!role) {
          await signOut(auth);
          showToast('No role assigned for this account.', 'error');
          return;
        }
        if (this._pendingRole && role !== this._pendingRole) {
          const expected = this._pendingRole;
          this._pendingRole = null;
          await signOut(auth);
          showToast(`Role mismatch. Sign in as ${expected.toUpperCase()}.`, 'error');
          return;
        }

        this._pendingRole = null;
        currentUserId = user.uid;
        this._currentUserRole = role;
        this._currentUserEmail = user.email || '';
        await loadUserDataFromCloud(user.uid);
        this._syncCompanyNameInput();
        this._applyAuthHeader();
        this._showLogin(false);
        this._setAppAccess(true);
        this.navigateTo('dashboard');
        if (!this._authBootstrapped) showToast('Signed in successfully.');
        this._authBootstrapped = true;
      } catch (err) {
        console.error('Authentication bootstrap failed:', err);
        await signOut(auth);
        showToast('Authentication failed. Please sign in again.', 'error');
      }
    });
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

  _applyAuthHeader() {
    const badge = document.getElementById('authUserBadge');
    const logoutBtn = document.getElementById('logoutBtn');
    if (!badge || !logoutBtn) return;
    if (!this._currentUserRole || !this._currentUserEmail) {
      badge.style.display = 'none';
      logoutBtn.style.display = 'none';
      return;
    }
    badge.textContent = `${this._currentUserRole.toUpperCase()} • ${this._currentUserEmail}`;
    badge.style.display = 'inline-flex';
    logoutBtn.style.display = 'inline-flex';
  },

  async _resolveUserRole(user, selectedRole) {
    const rootRef = ref(database);
    const rolePath = `${ROLE_ROOT}/${user.uid}/role`;
    const roleSnap = await get(child(rootRef, rolePath));
    if (roleSnap.exists()) return String(roleSnap.val() || '').toLowerCase();
    if (!selectedRole) return null;
    await set(ref(database, `${ROLE_ROOT}/${user.uid}`), {
      role: selectedRole,
      email: user.email || '',
      updatedAt: Date.now(),
    });
    return selectedRole;
  },

  async login(evt) {
    evt.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const role = document.getElementById('loginRole').value;
    if (!email || !password || !role) {
      showToast('Enter email, password and role.', 'error');
      return;
    }
    this._pendingRole = role.toLowerCase();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      this._pendingRole = null;
      console.error('Sign in failed:', err);
      showToast('Invalid login credentials.', 'error');
    }
  },

  async logout() {
    try {
      await signOut(auth);
      showToast('Logged out.', 'info');
    } catch (err) {
      console.error('Logout failed:', err);
      showToast('Logout failed. Please try again.', 'error');
    }
  },

  navigateTo(view) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(`view-${view}`);
    if (el) el.classList.add('active');

    const titles = {
      dashboard:         'Dashboard',
      employees:         'Employees',
      'salary-entry':    'Salary Entry',
      attendance:        'Attendance',
      history:           'History',
      'monthly-summary': 'Monthly Summary',
      'payroll-reports': 'Payroll Reports',
    };
    document.getElementById('pageTitle').textContent = titles[view] || view;

    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('show');

    if (view === 'dashboard')       this.renderDashboard();
    if (view === 'employees')       this.renderEmployees();
    if (view === 'salary-entry')    this.loadSalaryEntrySelects();
    if (view === 'attendance')      this.renderAttendanceManagement();
    if (view === 'history')         this.renderHistory();
    if (view === 'monthly-summary') { /* user clicks Load */ }
    if (view === 'payroll-reports') this.renderPayrollReports();
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
      id:               existIdx !== -1 ? data.salaryRecords[existIdx].id : (push(ref(database, `${getUserDataPath(currentUserId)}/salaryRecords`)).key || uid()),
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

  // ── Attendance Management View ───────────────────────────────────────────────

  renderAttendanceManagement() {
    const data = loadData();
    const monthInput = document.getElementById('att-man-month');
    const dateInput  = document.getElementById('att-man-date');
    if (!monthInput || !dateInput) return;

    if (!monthInput.value) {
      const now = new Date();
      monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const activeMonth = monthInput.value;
    if (!dateInput.value || monthFromDate(dateInput.value) !== activeMonth) {
      dateInput.value = `${activeMonth}-01`;
    }
    this._attMgmtDate = dateInput.value;
    this._renderAttendanceManagementRows(data);
  },

  onAttendanceMonthChange() {
    const month = document.getElementById('att-man-month').value;
    const dateEl = document.getElementById('att-man-date');
    if (!month || !dateEl) return;
    const days = getDaysInMonth(month);
    let day = dayFromDate(dateEl.value) || 1;
    day = Math.min(Math.max(day, 1), days);
    dateEl.value = `${month}-${String(day).padStart(2, '0')}`;
    this._attMgmtDate = dateEl.value;
    this.renderAttendanceManagement();
  },

  onAttendanceDateChange() {
    const dateEl  = document.getElementById('att-man-date');
    const monthEl = document.getElementById('att-man-month');
    if (!dateEl || !monthEl || !dateEl.value) return;
    monthEl.value = monthFromDate(dateEl.value);
    this._attMgmtDate = dateEl.value;
    this.renderAttendanceManagement();
  },

  _renderAttendanceManagementRows(data) {
    const dateStr = this._attMgmtDate || document.getElementById('att-man-date').value;
    const tbody = document.getElementById('attendance-list-tbody');
    if (!tbody) return;

    if (!data.employees.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No employees found</td></tr>';
      document.getElementById('att-man-p').textContent = '0';
      document.getElementById('att-man-a').textContent = '0';
      document.getElementById('att-man-h').textContent = '0';
      return;
    }

    let p = 0, a = 0, h = 0;
    tbody.innerHTML = data.employees.map(emp => {
      const status = getAttendanceStatus(data, emp.id, dateStr);
      if (status === 'A') a++;
      else if (status === 'H') h++;
      else p++;
      return `<tr>
        <td>${esc(emp.name)}</td>
        <td>${esc(emp.id)}</td>
        <td>
          <select class="att-status-select" onchange="app.setAttendanceForDate('${esc(emp.id)}', this.value)">
            <option value="P" ${status === 'P' ? 'selected' : ''}>Present</option>
            <option value="A" ${status === 'A' ? 'selected' : ''}>Absent</option>
            <option value="H" ${status === 'H' ? 'selected' : ''}>Company Holiday</option>
          </select>
        </td>
      </tr>`;
    }).join('');

    document.getElementById('att-man-p').textContent = p;
    document.getElementById('att-man-a').textContent = a;
    document.getElementById('att-man-h').textContent = h;
  },

  async setAttendanceForDate(empId, status) {
    const data = loadData();
    const dateStr = document.getElementById('att-man-date').value;
    setAttendanceStatus(data, empId, dateStr, status);
    await saveData(data);
    this._attMgmtDate = dateStr;
    this._renderAttendanceManagementRows(data);
    this._syncAbsentDays();
    this.calcPreview();
    this.renderDashboard();
    this.renderPayrollReports();
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
};

// ─── HTML escape helper ────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
