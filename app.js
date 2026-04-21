/* app.js — TRACS APPAREL Management Web App v3.0 (Firebase Edition) */
'use strict';

// ─── Firebase Config ───────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyCXDUrJtkuJZ4BvqsYOFg9SIjOysIgkqtk',
  authDomain:        'tracs-hr-mangment.firebaseapp.com',
  databaseURL:       'https://tracs-hr-mangment-default-rtdb.firebaseio.com',
  projectId:         'tracs-hr-mangment',
  storageBucket:     'tracs-hr-mangment.firebasestorage.app',
  messagingSenderId: '1094008024729',
  appId:             '1:1094008024729:web:11f1afa99df6272cee9208',
  measurementId:     'G-6ZD2M74F0P',
};
firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const fbDb   = firebase.database();

// ─── App State ────────────────────────────────────────────────────────────────
const appState = {
  currentUser:   null,
  userRole:      null,      // 'admin' | 'worker'
  currentEmpId:  null,
  employees:     [],
  salaryRecords: [],
  attendance:    {},        // { [safeEmpId]: { [YYYY-MM-DD]: {...} } }
  users:         {},
  settings: {
    shiftStart:    '08:00',
    shiftEnd:      '17:00',
    lateMark:      '08:05',
    lateThreshold: '09:00',
    otRateFactor:  0.5,
    companyName:   'TRACS APPAREL',
    adminUid:      null,
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────
const MS_PER_DAY = 86400000;

// ─── Utility: Firebase Key Sanitizer ──────────────────────────────────────────
function safeKey(str) {
  return String(str).replace(/[.$#[\]/]/g, '_');
}

function objectToArray(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.values(obj);
}

// ─── Date / Time Utilities ────────────────────────────────────────────────────
function getDaysInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function formatAsYYYYMMDD(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function todayStr() { return formatAsYYYYMMDD(new Date()); }
function dateStringToMidnight(s) { return new Date(`${s}T00:00:00`); }
function daysBetweenInclusive(a, b) {
  const su = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const eu = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((eu - su) / MS_PER_DAY) + 1;
}
function monthFromDate(s) { return (s||'').slice(0,7); }
function dayFromDate(s)   { return parseInt((s||'').slice(8,10),10) || 0; }
function timeToMins(t) {
  if (!t) return 0;
  const [h,m] = t.split(':').map(Number);
  return h*60+m;
}
function minsToTimeStr(mins) {
  const h=Math.floor(mins/60), m=mins%60;
  const ap = h<12?'AM':'PM', hh=h%12===0?12:h%12;
  return `${hh}:${String(m).padStart(2,'0')} ${ap}`;
}
function fmtMonth(ms) {
  if (!ms) return '';
  const [y,m] = ms.split('-');
  const names=['January','February','March','April','May','June','July','August','September','October','November','December'];
  return names[parseInt(m,10)-1]+' '+y;
}
function getLast6Months() {
  const out=[]; const now=new Date();
  for (let i=5;i>=0;i--) {
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    out.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return out;
}
function uid() { return Date.now().toString(36)+Math.random().toString(36).slice(2); }
function initials(name) { return (name||'').split(' ').filter(Boolean).map(n=>n[0]).join('').toUpperCase().slice(0,2); }
const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ─── OT / Late Calculation ────────────────────────────────────────────────────
/**
 * Calculate Late status and final OT hours for a day.
 * Rule:
 *   - isLate = inTime > lateMark (default 08:05)
 *   - If inTime > lateThreshold (default 09:00):
 *       lateDeduction = inTime - shiftStart (e.g. 9:30 - 8:00 = 90 mins)
 *   - rawOT = max(0, outTime - shiftEnd)
 *   - finalOT = max(0, rawOT - lateDeduction)
 */
function calcDayOT(inTime, outTime, settings) {
  if (!inTime) return { isLate:false, lateMinutes:0, finalOtHours:0 };
  const shiftStartMins   = timeToMins(settings.shiftStart    || '08:00');
  const shiftEndMins     = timeToMins(settings.shiftEnd      || '17:00');
  const lateMarkMins     = timeToMins(settings.lateMark      || '08:05');
  const lateThreshMins   = timeToMins(settings.lateThreshold || '09:00');
  const inMins           = timeToMins(inTime);
  const isLate           = inMins > lateMarkMins;
  let lateDeductionMins  = 0;
  if (inMins > lateThreshMins) {
    lateDeductionMins = Math.max(0, inMins - shiftStartMins);
  }
  let finalOtHours = 0;
  if (outTime) {
    const outMins   = timeToMins(outTime);
    const rawOtMins = Math.max(0, outMins - shiftEndMins);
    const netOtMins = Math.max(0, rawOtMins - lateDeductionMins);
    finalOtHours    = Math.round((netOtMins/60)*100)/100;
  }
  return { isLate, lateMinutes: Math.max(0, inMins - shiftStartMins), finalOtHours };
}

// ─── Salary Calculation ───────────────────────────────────────────────────────
function calcSalary(basic, otHours, bonus, festivalBonus, absentDays, daysInMonth, deductions, advance) {
  const rate = (appState.settings.otRateFactor||0.5)/100;
  const otAmount        = otHours * (basic * rate);
  const absentDeduction = daysInMonth>0 ? (basic/daysInMonth)*absentDays : 0;
  const total           = Math.max(0, basic+otAmount+bonus+festivalBonus-absentDeduction-deductions-advance);
  return { otAmount, absentDeduction, total };
}

// ─── Format Helpers ───────────────────────────────────────────────────────────
function fmt(amount) {
  const n = parseFloat(amount)||0;
  return '\u09F3'+n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
}
function fmtPDF(amount) {
  return (parseFloat(amount)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function formatOtHours(h) { return (parseFloat(h)||0).toLocaleString('en-US',{maximumFractionDigits:2}); }
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
const TOAST_ICONS={success:'fa-check-circle',error:'fa-times-circle',warning:'fa-exclamation-triangle',info:'fa-info-circle'};
function showToast(msg,type='success') {
  const t=document.getElementById('toast'),tm=document.getElementById('toastMessage'),ic=document.getElementById('toastIcon');
  if(!t) return;
  tm.textContent=msg; ic.className=`toast-icon fas ${TOAST_ICONS[type]||TOAST_ICONS.success}`;
  t.className=`toast ${type} show`; clearTimeout(t._timer);
  t._timer=setTimeout(()=>t.classList.remove('show'),3200);
}

// ─── Loading Overlay ──────────────────────────────────────────────────────────
function showLoading() { const el=document.getElementById('loadingOverlay'); if(el) el.style.display='flex'; }
function hideLoading() { const el=document.getElementById('loadingOverlay'); if(el) el.style.display='none'; }

// ─── Image Compress ───────────────────────────────────────────────────────────
function compressImage(dataUrl,cb) {
  const img=new Image();
  img.onload=()=>{
    const maxSize=200; let w=img.width,h=img.height;
    if(w>h&&w>maxSize){h=(h*maxSize)/w;w=maxSize;}else if(h>=w&&h>maxSize){w=(w*maxSize)/h;h=maxSize;}
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    c.getContext('2d').drawImage(img,0,0,w,h); cb(c.toDataURL('image/jpeg',0.75));
  };
  img.src=dataUrl;
}

// ─── Attendance Helpers ───────────────────────────────────────────────────────
function getAttRecord(empId, dateStr) {
  const key=safeKey(empId);
  return ((appState.attendance[key]||{})[dateStr])||{status:'P'};
}
function getAttStatus(empId, dateStr) { return getAttRecord(empId, dateStr).status||'P'; }
async function setAttRecord(empId, dateStr, data) {
  const key=safeKey(empId), path=`attendance/${key}/${dateStr}`;
  await fbDb.ref(path).update(data);
  if(!appState.attendance[key]) appState.attendance[key]={};
  appState.attendance[key][dateStr]={...(appState.attendance[key][dateStr]||{}),...data};
}

// ─── Load All Data from Firebase ─────────────────────────────────────────────
async function loadAllData() {
  const [sS,eS,rS,aS,uS] = await Promise.all([
    fbDb.ref('settings').once('value'),
    fbDb.ref('employees').once('value'),
    fbDb.ref('salaryRecords').once('value'),
    fbDb.ref('attendance').once('value'),
    fbDb.ref('users').once('value'),
  ]);
  const rs = sS.val()||{};
  appState.settings = {
    shiftStart:    rs.shiftStart    || '08:00',
    shiftEnd:      rs.shiftEnd      || '17:00',
    lateMark:      rs.lateMark      || '08:05',
    lateThreshold: rs.lateThreshold || '09:00',
    otRateFactor:  rs.otRateFactor  != null ? rs.otRateFactor : 0.5,
    companyName:   rs.companyName   || 'TRACS APPAREL',
    adminUid:      rs.adminUid      || null,
  };
  appState.employees    = objectToArray(eS.val());
  appState.salaryRecords= objectToArray(rS.val());
  appState.attendance   = aS.val()||{};
  appState.users        = uS.val()||{};
}

// ─── Auth Module ──────────────────────────────────────────────────────────────
const authModule = {
  showRegister() {
    document.getElementById('loginForm').style.display='none';
    document.getElementById('registerForm').style.display='block';
    document.getElementById('registerError').textContent='';
  },
  showLogin() {
    document.getElementById('registerForm').style.display='none';
    document.getElementById('loginForm').style.display='block';
    document.getElementById('loginError').textContent='';
  },
  async handleLogin(e) {
    e.preventDefault();
    const email=document.getElementById('login-email').value.trim();
    const pass =document.getElementById('login-password').value;
    const errEl=document.getElementById('loginError');
    const btn  =document.getElementById('loginBtn');
    errEl.textContent=''; btn.disabled=true;
    btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Signing in…';
    try { await fbAuth.signInWithEmailAndPassword(email,pass); }
    catch(err) {
      errEl.textContent=authModule._friendly(err.code);
      btn.disabled=false; btn.innerHTML='<i class="fas fa-sign-in-alt"></i> Sign In';
    }
  },
  async handleRegister(e) {
    e.preventDefault();
    const email  =document.getElementById('reg-email').value.trim();
    const pass   =document.getElementById('reg-password').value;
    const confirm=document.getElementById('reg-confirm').value;
    const errEl  =document.getElementById('registerError');
    const btn    =document.getElementById('registerBtn');
    errEl.textContent='';
    if(pass!==confirm){errEl.textContent='Passwords do not match.';return;}
    btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Creating…';
    try {
      const cred=await fbAuth.createUserWithEmailAndPassword(email,pass);
      const uid=cred.user.uid;
      const adminSnap=await fbDb.ref('settings/adminUid').once('value');
      const role=adminSnap.val()?'worker':'admin';
      if(!adminSnap.val()) await fbDb.ref('settings/adminUid').set(uid);
      await fbDb.ref(`users/${uid}`).set({role,email});
    } catch(err) {
      errEl.textContent=authModule._friendly(err.code);
      btn.disabled=false; btn.innerHTML='<i class="fas fa-user-plus"></i> Create Account';
    }
  },
  async logout() { await fbAuth.signOut(); },
  _friendly(code) {
    const m={
      'auth/user-not-found':'No account found with this email.',
      'auth/wrong-password':'Incorrect password.',
      'auth/invalid-email':'Invalid email address.',
      'auth/email-already-in-use':'This email is already registered.',
      'auth/weak-password':'Password must be at least 6 characters.',
      'auth/too-many-requests':'Too many attempts. Please try again later.',
      'auth/invalid-credential':'Invalid email or password.',
    };
    return m[code]||'An error occurred. Please try again.';
  },
};

// ─── Routing ──────────────────────────────────────────────────────────────────
fbAuth.onAuthStateChanged(async user => {
  showLoading();
  if (user) {
    appState.currentUser = user;
    try {
      await loadAllData();
    } catch(err) {
      console.error('loadAllData failed:', err);
    }
    let userRecord = appState.users[user.uid];
    if (!userRecord) {
      const adminUid = appState.settings.adminUid;
      const role = adminUid ? 'worker' : 'admin';
      if (!adminUid) {
        await fbDb.ref('settings/adminUid').set(user.uid);
        appState.settings.adminUid = user.uid;
      }
      userRecord = { role, email: user.email };
      await fbDb.ref(`users/${user.uid}`).set(userRecord);
      appState.users[user.uid] = userRecord;
    }
    appState.userRole = userRecord.role;
    if (appState.userRole === 'worker') {
      let empId = userRecord.employeeId || null;
      if (!empId) {
        const emp = appState.employees.find(e => e.email && e.email.toLowerCase()===(user.email||'').toLowerCase());
        if (emp) {
          empId = emp.id;
          await fbDb.ref(`users/${user.uid}`).update({ employeeId: empId });
          appState.users[user.uid].employeeId = empId;
        }
      }
      appState.currentEmpId = empId;
    }
    hideLoading();
    if (appState.userRole === 'admin') { showAdminApp(); }
    else { showWorkerApp(); }
  } else {
    appState.currentUser = null; appState.userRole = null; appState.currentEmpId = null;
    hideAll(); hideLoading();
    document.getElementById('loginScreen').style.display = 'flex';
    authModule.showLogin();
  }
});

function hideAll() { ['loginScreen','adminApp','workerApp'].forEach(id=>{ document.getElementById(id).style.display='none'; }); }

function showAdminApp() {
  hideAll(); document.getElementById('adminApp').style.display='';
  const u=appState.currentUser;
  const el=document.getElementById('adminUserEmail');
  if(el&&u) el.textContent=u.email;
  app.init();
}

function showWorkerApp() {
  hideAll(); document.getElementById('workerApp').style.display='';
  const u=appState.currentUser;
  const el=document.getElementById('workerUserEmail');
  if(el&&u) el.textContent=u.email;
  workerApp.init();
}

// ─── Admin App ────────────────────────────────────────────────────────────────
const app = {
  _photo:null, _editEmpId:null, _chart:null,
  _tempAttendance:{}, _attEmpId:null, _attMonth:null, _attMgmtDate:null,
  _linkUid:null, _currentView:'dashboard',

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  init() {
    document.getElementById('currentDate').textContent =
      new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const now=new Date();
    const thisMonth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const today=formatAsYYYYMMDD(now);
    ['se-month','summary-month'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=thisMonth;});
    const am=document.getElementById('att-man-month'); if(am) am.value=thisMonth;
    const ad=document.getElementById('att-man-date');  if(ad) ad.value=today;
    this._attMgmtDate=today;

    document.querySelectorAll('.nav-item').forEach(item=>{
      item.addEventListener('click',e=>{ e.preventDefault(); this.navigateTo(item.dataset.view); });
    });
    const toggle=document.getElementById('sidebarToggle');
    const overlay=document.getElementById('sidebarOverlay');
    if(toggle) toggle.addEventListener('click',()=>{ document.getElementById('sidebar').classList.toggle('open'); if(overlay)overlay.classList.toggle('show'); });
    if(overlay) overlay.addEventListener('click',()=>{ document.getElementById('sidebar').classList.remove('open'); overlay.classList.remove('show'); });
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){this.closeEmployeeModal();this.closeConfirmModal();this.closeAttendanceModal();this.closeEmpHistoryModal();this.closeLinkEmpModal();}
    });
    this.navigateTo('dashboard');
  },

  navigateTo(view) {
    this._currentView=view;
    document.querySelectorAll('.nav-item').forEach(i=>i.classList.toggle('active',i.dataset.view===view));
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    const el=document.getElementById(`view-${view}`); if(el) el.classList.add('active');
    const titles={dashboard:'Dashboard',employees:'Employees','salary-entry':'Salary Entry',
      attendance:'Attendance',history:'History','monthly-summary':'Monthly Summary',
      'payroll-reports':'Payroll Reports',settings:'Settings'};
    document.getElementById('pageTitle').textContent=titles[view]||view;
    document.getElementById('sidebar').classList.remove('open');
    const ov=document.getElementById('sidebarOverlay'); if(ov) ov.classList.remove('show');
    if(view==='dashboard')       this.renderDashboard();
    if(view==='employees')       this.renderEmployees();
    if(view==='salary-entry')    this.loadSalaryEntrySelects();
    if(view==='attendance')      this.renderAttendanceManagement();
    if(view==='history')         this.renderHistory();
    if(view==='payroll-reports') this.renderPayrollReports();
    if(view==='settings')        this.renderSettings();
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  renderDashboard() {
    const now=new Date();
    const tm=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const today=formatAsYYYYMMDD(now);
    const recs=appState.salaryRecords.filter(r=>r.month===tm);
    const ws=new Date(now); ws.setDate(now.getDate()-now.getDay()); ws.setHours(0,0,0,0);
    const we=new Date(ws); we.setDate(ws.getDate()+6); we.setHours(23,59,59,999);
    let pc=0,ac=0;
    appState.employees.forEach(emp=>{ if(getAttStatus(emp.id,today)==='A') ac++; else pc++; });
    const weekOt=appState.salaryRecords.filter(r=>r.createdAt&&r.createdAt>=ws.getTime()&&r.createdAt<=we.getTime()).reduce((s,r)=>s+(r.otHours||0),0);
    document.getElementById('stat-total-employees').textContent=appState.employees.length;
    document.getElementById('stat-this-month-payroll').textContent=fmt(recs.reduce((s,r)=>s+r.totalSalary,0));
    document.getElementById('stat-today-attendance').textContent=`P: ${pc} | A: ${ac}`;
    document.getElementById('stat-week-ot').textContent=`${formatOtHours(weekOt)} hours`;
    const recent=[...appState.salaryRecords].sort((a,b)=>b.createdAt-a.createdAt).slice(0,5);
    const tbody=document.getElementById('recent-entries-tbody');
    tbody.innerHTML=!recent.length?'<tr><td colspan="4" class="empty-state">No records yet</td></tr>':
      recent.map(r=>{const emp=appState.employees.find(e=>e.id===r.employeeId);return `<tr><td>${emp?esc(emp.name):'Unknown'}</td><td>${fmtMonth(r.month)}</td><td>${fmt(r.basicSalary)}</td><td class="amount-positive">${fmt(r.totalSalary)}</td></tr>`;}).join('');
    this._renderChart();
  },

  _renderChart() {
    const months=getLast6Months();
    const labels=months.map(m=>{const[y,mo]=m.split('-');const n=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return n[parseInt(mo,10)-1]+" '"+y.slice(2);});
    const payrollData=months.map(m=>appState.salaryRecords.filter(r=>r.month===m).reduce((s,r)=>s+r.totalSalary,0));
    const workerData=months.map(m=>[...new Set(appState.salaryRecords.filter(r=>r.month===m).map(r=>r.employeeId))].length);
    const ctx=document.getElementById('dashboardChart'); if(!ctx) return;
    if(this._chart){this._chart.destroy();this._chart=null;}
    this._chart=new Chart(ctx,{
      data:{labels,datasets:[
        {type:'bar',label:'Total Salary Payout (BDT)',data:payrollData,backgroundColor:'rgba(13,115,119,.65)',borderColor:'#0d7377',borderWidth:1,borderRadius:4,yAxisID:'y'},
        {type:'line',label:'Present Workers',data:workerData,borderColor:'#32e0c4',backgroundColor:'rgba(50,224,196,.15)',borderWidth:2.5,pointRadius:5,pointBackgroundColor:'#32e0c4',tension:0.35,fill:true,yAxisID:'y1'},
      ]},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{position:'top',labels:{font:{size:12},usePointStyle:true}},
          tooltip:{callbacks:{label(c){return c.datasetIndex===0?` \u09F3${c.parsed.y.toLocaleString('en-US')}`:` ${c.parsed.y} worker${c.parsed.y!==1?'s':''}`;}}}},
        scales:{
          y:{type:'linear',position:'left',title:{display:true,text:'Salary Payout (BDT)',color:'#64748b',font:{size:11}},grid:{color:'rgba(0,0,0,.05)'},ticks:{color:'#64748b',font:{size:11}}},
          y1:{type:'linear',position:'right',title:{display:true,text:'Workers',color:'#64748b',font:{size:11}},grid:{drawOnChartArea:false},ticks:{color:'#64748b',font:{size:11},stepSize:1,precision:0},min:0},
          x:{grid:{color:'rgba(0,0,0,.04)'},ticks:{color:'#64748b',font:{size:11}}},
        },
      },
    });
  },

  // ── Employees ──────────────────────────────────────────────────────────────
  renderEmployees(filter='') {
    const lf=filter.toLowerCase();
    const list=appState.employees.filter(e=>e.name.toLowerCase().includes(lf)||e.id.toLowerCase().includes(lf));
    const grid=document.getElementById('employee-grid');
    if(!list.length){
      grid.innerHTML=`<div class="empty-state-full"><i class="fas fa-users"></i><p>${filter?'No employees match your search.':'No employees yet. Add your first employee!'}</p></div>`;
      return;
    }
    grid.innerHTML=list.map(emp=>`
      <div class="employee-card">
        <div class="emp-card-header">
          <div class="emp-card-actions">
            <button class="icon-btn edit" onclick="app.openEditEmployee('${esc(emp.id)}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="icon-btn delete" onclick="app.confirmDeleteEmployee('${esc(emp.id)}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
          <div class="emp-avatar">${emp.photo?`<img src="${esc(emp.photo)}" alt="${esc(emp.name)}">`:`<span>${initials(emp.name)}</span>`}</div>
        </div>
        <div class="emp-card-body">
          <h3>${esc(emp.name)}</h3>
          <p class="emp-id"><i class="fas fa-id-badge"></i> ${esc(emp.id)}</p>
          ${emp.department?`<p><i class="fas fa-building"></i> ${esc(emp.department)}</p>`:''}
          <p class="emp-salary"><i class="fas fa-money-bill"></i> Basic: ${fmt(emp.basicSalary)}</p>
        </div>
        <div class="emp-card-footer">
          <button class="btn btn-sm btn-primary" onclick="app.openSalaryEntry('${esc(emp.id)}')"><i class="fas fa-calculator"></i> Add Salary</button>
          <button class="btn-history" onclick="app.openEmpHistoryModal('${esc(emp.id)}')"><i class="fas fa-history"></i> History</button>
        </div>
      </div>`).join('');
  },

  filterEmployees() { this.renderEmployees(document.getElementById('employeeSearch').value); },

  openAddEmployee() {
    this._editEmpId=null; this._photo=null;
    document.getElementById('employeeModalTitle').textContent='Add Employee';
    document.getElementById('employeeForm').reset();
    document.getElementById('emp-edit-id').value='';
    document.getElementById('emp-email').value='';
    document.getElementById('photoPreview').innerHTML='<i class="fas fa-user"></i>';
    document.getElementById('employeeModal').classList.add('show');
  },

  openEditEmployee(id) {
    const emp=appState.employees.find(e=>e.id===id); if(!emp) return;
    this._editEmpId=id; this._photo=emp.photo||null;
    document.getElementById('employeeModalTitle').textContent='Edit Employee';
    document.getElementById('emp-name').value=emp.name;
    document.getElementById('emp-id').value=emp.id;
    document.getElementById('emp-basic').value=emp.basicSalary;
    document.getElementById('emp-department').value=emp.department||'';
    document.getElementById('emp-email').value=emp.email||'';
    document.getElementById('emp-edit-id').value=id;
    const prev=document.getElementById('photoPreview');
    prev.innerHTML=emp.photo?`<img src="${emp.photo}" alt="${esc(emp.name)}">`:`<span>${initials(emp.name)}</span>`;
    document.getElementById('employeeModal').classList.add('show');
  },

  closeEmployeeModal() { document.getElementById('employeeModal').classList.remove('show'); },

  handlePhotoUpload(evt) {
    const file=evt.target.files[0]; if(!file) return;
    if(file.size>5*1024*1024){showToast('Image must be under 5 MB','error');return;}
    const reader=new FileReader();
    reader.onload=e=>{ compressImage(e.target.result,compressed=>{ this._photo=compressed; document.getElementById('photoPreview').innerHTML=`<img src="${compressed}" alt="Preview">`; }); };
    reader.readAsDataURL(file);
  },

  removePhoto() {
    this._photo=null;
    document.getElementById('photoPreview').innerHTML='<i class="fas fa-user"></i>';
    document.getElementById('photoInput').value='';
  },

  async saveEmployee(evt) {
    evt.preventDefault();
    const name=document.getElementById('emp-name').value.trim();
    const id=document.getElementById('emp-id').value.trim();
    const basic=parseFloat(document.getElementById('emp-basic').value)||0;
    const dept=document.getElementById('emp-department').value.trim();
    const email=(document.getElementById('emp-email').value||'').trim().toLowerCase()||null;
    const editId=document.getElementById('emp-edit-id').value;
    if(appState.employees.some(e=>e.id===id&&e.id!==editId)){showToast('Employee ID already exists!','error');return;}
    showLoading();
    try {
      const key=safeKey(id);
      if(editId) {
        const oldKey=safeKey(editId);
        const existing=appState.employees.find(e=>e.id===editId)||{};
        const updated={...existing,name,id,basicSalary:basic,department:dept,photo:this._photo||null,email};
        await fbDb.ref(`employees/${key}`).set(updated);
        if(editId!==id) {
          await fbDb.ref(`employees/${oldKey}`).remove();
          const updates={};
          appState.salaryRecords.forEach(r=>{if(r.employeeId===editId) updates[`salaryRecords/${r.id}/employeeId`]=id;});
          const oldAtt=appState.attendance[oldKey]||{};
          if(Object.keys(oldAtt).length){updates[`attendance/${key}`]=oldAtt;updates[`attendance/${oldKey}`]=null;}
          if(Object.keys(updates).length) await fbDb.ref().update(updates);
          appState.salaryRecords.forEach(r=>{if(r.employeeId===editId) r.employeeId=id;});
          if(appState.attendance[oldKey]){appState.attendance[key]=appState.attendance[oldKey];delete appState.attendance[oldKey];}
        }
        const idx=appState.employees.findIndex(e=>e.id===editId);
        if(idx!==-1) appState.employees[idx]=updated;
        showToast('Employee updated!');
      } else {
        const newEmp={name,id,basicSalary:basic,department:dept,photo:this._photo||null,email,createdAt:Date.now()};
        await fbDb.ref(`employees/${key}`).set(newEmp);
        appState.employees.push(newEmp);
        showToast('Employee added!');
      }
    } catch(err){ showToast('Error: '+err.message,'error'); }
    hideLoading();
    this.closeEmployeeModal();
    this.renderEmployees();
  },

  confirmDeleteEmployee(id) {
    const emp=appState.employees.find(e=>e.id===id); if(!emp) return;
    document.getElementById('confirmMessage').textContent=`Delete "${emp.name}"? All their salary records will also be removed.`;
    document.getElementById('confirmBtn').onclick=()=>this.deleteEmployee(id);
    document.getElementById('confirmModal').classList.add('show');
  },

  async deleteEmployee(id) {
    showLoading();
    const key=safeKey(id);
    try {
      const updates={[`employees/${key}`]:null,[`attendance/${key}`]:null};
      appState.salaryRecords.filter(r=>r.employeeId===id).forEach(r=>{updates[`salaryRecords/${r.id}`]=null;});
      await fbDb.ref().update(updates);
      appState.employees=appState.employees.filter(e=>e.id!==id);
      appState.salaryRecords=appState.salaryRecords.filter(r=>r.employeeId!==id);
      delete appState.attendance[key];
    } catch(err){ showToast('Error: '+err.message,'error'); }
    hideLoading();
    this.closeConfirmModal();
    this.renderEmployees();
    showToast('Employee deleted!');
  },

  closeConfirmModal() { document.getElementById('confirmModal').classList.remove('show'); },

  // ── Employee History Modal ──────────────────────────────────────────────────
  openEmpHistoryModal(empId) {
    const emp=appState.employees.find(e=>e.id===empId); if(!emp) return;
    document.getElementById('empHistoryTitle').textContent=emp.name+' \u2014 Salary History';
    const records=appState.salaryRecords.filter(r=>r.employeeId===empId).sort((a,b)=>b.month.localeCompare(a.month));
    const tbody=document.getElementById('emp-history-tbody');
    tbody.innerHTML=!records.length?'<tr><td colspan="10" class="empty-state">No records</td></tr>':
      records.map(r=>{
        const totalDed=(r.absentDeduction||0)+r.deductions+r.advance;
        return `<tr>
          <td>${fmtMonth(r.month)}</td><td>${fmt(r.basicSalary)}</td>
          <td>${formatOtHours(r.otHours)}</td><td>${fmt(r.otAmount)}</td>
          <td>${fmt(r.bonus)}</td><td>${fmt(r.festivalBonus||0)}</td>
          <td>${r.absentDays||0}</td>
          <td class="amount-negative">${fmt(totalDed)}</td>
          <td class="amount-positive"><strong>${fmt(r.totalSalary)}</strong></td>
          <td><button class="icon-btn primary" onclick="app.generateSlipPDF('${r.id}')" title="Download Slip"><i class="fas fa-download"></i></button></td>
        </tr>`;
      }).join('');
    document.getElementById('empHistoryModal').classList.add('show');
  },

  closeEmpHistoryModal() { document.getElementById('empHistoryModal').classList.remove('show'); },

  // ── Salary Entry ────────────────────────────────────────────────────────────
  openSalaryEntry(empId) {
    this.navigateTo('salary-entry');
    setTimeout(()=>{ document.getElementById('se-employee').value=empId; this.onEmployeeSelect(); },50);
  },

  loadSalaryEntrySelects() {
    const sel=document.getElementById('se-employee'), cur=sel.value;
    sel.innerHTML='<option value="">— Select Employee —</option>'+
      appState.employees.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.id)})</option>`).join('');
    if(cur) sel.value=cur;
    this._populateHistoryFilters();
    this._updateAttendanceRow();
  },

  onEmployeeSelect() {
    const empId=document.getElementById('se-employee').value;
    const emp=appState.employees.find(e=>e.id===empId);
    document.getElementById('se-basic').value=emp?emp.basicSalary:'';
    this._syncAbsentDays(); this.calcPreview();
  },

  onMonthChange() { this._syncAbsentDays(); this.calcPreview(); },

  _syncAbsentDays() {
    const empId=document.getElementById('se-employee').value;
    const month=document.getElementById('se-month').value;
    if(empId&&month) {
      const days=getDaysInMonth(month);
      let absent=0,late=0;
      for(let d=1;d<=days;d++) {
        const dateStr=`${month}-${String(d).padStart(2,'0')}`;
        const rec=getAttRecord(empId,dateStr);
        if((rec.status||'P')==='A') absent++;
        if(rec.isLate) late++;
      }
      document.getElementById('se-absent-days').value=absent;
      document.getElementById('att-absent-count').textContent=absent;
      document.getElementById('att-month-days').textContent=`/ ${days} days in month`;
      const lb=document.getElementById('att-late-badge');
      const ln=document.getElementById('att-late-num');
      if(lb){ lb.style.display=late>0?'':'none'; if(ln) ln.textContent=late; }
    } else {
      document.getElementById('se-absent-days').value=0;
      document.getElementById('att-absent-count').textContent='0';
      document.getElementById('att-month-days').textContent='';
    }
  },

  _updateAttendanceRow() {
    const month=document.getElementById('se-month').value;
    if(month) document.getElementById('att-month-days').textContent=`/ ${getDaysInMonth(month)} days in month`;
  },

  autoFillOT() {
    const empId=document.getElementById('se-employee').value;
    const month=document.getElementById('se-month').value;
    if(!empId||!month){showToast('Select employee and month first!','warning');return;}
    const key=safeKey(empId);
    const empAtt=appState.attendance[key]||{};
    const days=getDaysInMonth(month);
    let totalOT=0;
    for(let d=1;d<=days;d++){
      const dateStr=`${month}-${String(d).padStart(2,'0')}`;
      const rec=empAtt[dateStr];
      if(rec&&rec.finalOtHours) totalOT+=rec.finalOtHours;
    }
    document.getElementById('se-ot-hours').value=Math.round(totalOT*100)/100;
    this.calcPreview();
    showToast(`Auto-filled OT: ${formatOtHours(totalOT)} hrs`,'info');
  },

  calcPreview() {
    const basic=parseFloat(document.getElementById('se-basic').value)||0;
    const otHours=parseFloat(document.getElementById('se-ot-hours').value)||0;
    const bonus=parseFloat(document.getElementById('se-bonus').value)||0;
    const festivalBonus=parseFloat(document.getElementById('se-festival-bonus').value)||0;
    const deductions=parseFloat(document.getElementById('se-deductions').value)||0;
    const advance=parseFloat(document.getElementById('se-advance').value)||0;
    const absentDays=parseInt(document.getElementById('se-absent-days').value)||0;
    const month=document.getElementById('se-month').value;
    const daysInMonth=month?getDaysInMonth(month):30;
    const{otAmount,absentDeduction,total}=calcSalary(basic,otHours,bonus,festivalBonus,absentDays,daysInMonth,deductions,advance);
    document.getElementById('prev-basic').textContent=fmt(basic);
    document.getElementById('prev-ot').textContent=fmt(otAmount);
    document.getElementById('prev-bonus').textContent=fmt(bonus);
    document.getElementById('prev-festival-bonus').textContent=fmt(festivalBonus);
    document.getElementById('prev-absent-ded').textContent=fmt(absentDeduction);
    document.getElementById('prev-deductions').textContent=fmt(deductions);
    document.getElementById('prev-advance').textContent=fmt(advance);
    document.getElementById('prev-total').textContent=fmt(total);
  },

  async saveSalaryEntry(evt) {
    evt.preventDefault();
    const empId=document.getElementById('se-employee').value;
    const month=document.getElementById('se-month').value;
    const basic=parseFloat(document.getElementById('se-basic').value)||0;
    const otHours=parseFloat(document.getElementById('se-ot-hours').value)||0;
    const bonus=parseFloat(document.getElementById('se-bonus').value)||0;
    const festivalBonus=parseFloat(document.getElementById('se-festival-bonus').value)||0;
    const deductions=parseFloat(document.getElementById('se-deductions').value)||0;
    const advance=parseFloat(document.getElementById('se-advance').value)||0;
    const absentDays=parseInt(document.getElementById('se-absent-days').value)||0;
    const daysInMonth=month?getDaysInMonth(month):30;
    if(!empId||!month){showToast('Select employee and month!','error');return;}
    const{otAmount,absentDeduction,total}=calcSalary(basic,otHours,bonus,festivalBonus,absentDays,daysInMonth,deductions,advance);
    const existing=appState.salaryRecords.find(r=>r.employeeId===empId&&r.month===month);
    const recordId=existing?existing.id:uid();
    const record={id:recordId,employeeId:empId,month,basicSalary:basic,otHours,otAmount,bonus,festivalBonus,absentDays,absentDeduction,deductions,advance,totalSalary:total,createdAt:Date.now()};
    showLoading();
    try {
      await fbDb.ref(`salaryRecords/${recordId}`).set(record);
      const idx=appState.salaryRecords.findIndex(r=>r.id===recordId);
      if(idx>=0) appState.salaryRecords[idx]=record; else appState.salaryRecords.push(record);
      showToast(existing?'Record updated!':'Record saved!');
    } catch(err){ showToast('Error: '+err.message,'error'); }
    hideLoading();
    this.resetSalaryForm();
  },

  resetSalaryForm() {
    ['se-ot-hours','se-bonus','se-festival-bonus','se-deductions','se-advance'].forEach(id=>{document.getElementById(id).value='0';});
    document.getElementById('se-employee').value='';
    document.getElementById('se-basic').value='';
    document.getElementById('se-absent-days').value='0';
    document.getElementById('att-absent-count').textContent='0';
    document.getElementById('att-month-days').textContent='';
    const lb=document.getElementById('att-late-badge'); if(lb) lb.style.display='none';
    this.calcPreview();
  },

  // ── Attendance Calendar Modal ────────────────────────────────────────────────
  openAttendanceModal() {
    const empId=document.getElementById('se-employee').value;
    const month=document.getElementById('se-month').value;
    if(!empId){showToast('Please select an employee first!','warning');return;}
    if(!month){showToast('Please select a month first!','warning');return;}
    this._attEmpId=empId; this._attMonth=month;
    const key=safeKey(empId);
    this._tempAttendance={};
    const empAtt=appState.attendance[key]||{};
    const days=getDaysInMonth(month);
    for(let d=1;d<=days;d++){
      const dateStr=`${month}-${String(d).padStart(2,'0')}`;
      this._tempAttendance[d]=(empAtt[dateStr]||{}).status||'P';
    }
    const emp=appState.employees.find(e=>e.id===empId);
    document.getElementById('attModalTitle').textContent='Attendance \u2014 '+(emp?emp.name:empId)+' ('+fmtMonth(month)+')';
    this._renderAttCalendar();
    document.getElementById('attendanceModal').classList.add('show');
  },

  _renderAttCalendar() {
    const month=this._attMonth;
    const[y,m]=month.split('-').map(Number);
    const daysInMonth=getDaysInMonth(month);
    const firstDay=new Date(y,m-1,1).getDay();
    let html='';
    for(let i=0;i<firstDay;i++) html+='<div class="att-day-empty"></div>';
    for(let day=1;day<=daysInMonth;day++){
      const status=this._tempAttendance[day]||'P';
      html+=`<div class="att-day att-${status.toLowerCase()}" data-day="${day}" onclick="app.toggleAttDay(${day})">
        <span class="att-day-num">${day}</span><span class="att-day-label">${status}</span></div>`;
    }
    document.getElementById('attGrid').innerHTML=html;
    this._updateAttSummary();
  },

  toggleAttDay(day) {
    const current=this._tempAttendance[day]||'P';
    const next={P:'A',A:'H',H:'P'}[current];
    this._tempAttendance[day]=next;
    const cell=document.querySelector(`.att-day[data-day="${day}"]`);
    if(cell){cell.className=`att-day att-${next.toLowerCase()}`;cell.querySelector('.att-day-label').textContent=next;}
    this._updateAttSummary();
  },

  _updateAttSummary() {
    const days=getDaysInMonth(this._attMonth);
    let p=0,a=0,h=0;
    for(let d=1;d<=days;d++){const s=this._tempAttendance[d]||'P';if(s==='P')p++;else if(s==='A')a++;else if(s==='H')h++;}
    document.getElementById('att-sum-p').textContent=p;
    document.getElementById('att-sum-a').textContent=a;
    document.getElementById('att-sum-h').textContent=h;
  },

  async saveAttendance() {
    const empId=this._attEmpId, month=this._attMonth;
    const days=getDaysInMonth(month);
    showLoading();
    try {
      const updates={};
      for(let d=1;d<=days;d++){
        const dateStr=`${month}-${String(d).padStart(2,'0')}`;
        const status=this._tempAttendance[d]||'P';
        const key=safeKey(empId);
        const existing=(appState.attendance[key]||{})[dateStr]||{};
        updates[`attendance/${key}/${dateStr}/status`]=status;
        if(!appState.attendance[key]) appState.attendance[key]={};
        appState.attendance[key][dateStr]={...existing,status};
      }
      await fbDb.ref().update(updates);
    } catch(err){ showToast('Error: '+err.message,'error'); }
    hideLoading();
    this._syncAbsentDays(); this.calcPreview();
    this.closeAttendanceModal();
    showToast('Attendance saved!');
  },

  closeAttendanceModal() { document.getElementById('attendanceModal').classList.remove('show'); },

  // ── Attendance Management View ───────────────────────────────────────────────
  renderAttendanceManagement() {
    const monthInput=document.getElementById('att-man-month');
    const dateInput=document.getElementById('att-man-date');
    if(!monthInput||!dateInput) return;
    if(!monthInput.value){const now=new Date();monthInput.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;}
    const activeMonth=monthInput.value;
    if(!dateInput.value||monthFromDate(dateInput.value)!==activeMonth) dateInput.value=`${activeMonth}-01`;
    this._attMgmtDate=dateInput.value;
    this._renderAttMgmtRows();
  },

  onAttendanceMonthChange() {
    const month=document.getElementById('att-man-month').value;
    const dateEl=document.getElementById('att-man-date');
    if(!month||!dateEl) return;
    const days=getDaysInMonth(month);
    let day=Math.min(Math.max(dayFromDate(dateEl.value)||1,1),days);
    dateEl.value=`${month}-${String(day).padStart(2,'0')}`;
    this._attMgmtDate=dateEl.value;
    this._renderAttMgmtRows();
  },

  onAttendanceDateChange() {
    const dateEl=document.getElementById('att-man-date');
    const monthEl=document.getElementById('att-man-month');
    if(!dateEl||!monthEl||!dateEl.value) return;
    monthEl.value=monthFromDate(dateEl.value);
    this._attMgmtDate=dateEl.value;
    this._renderAttMgmtRows();
  },

  _renderAttMgmtRows() {
    const dateStr=this._attMgmtDate||document.getElementById('att-man-date').value;
    const tbody=document.getElementById('attendance-list-tbody');
    if(!tbody) return;
    if(!appState.employees.length){
      tbody.innerHTML='<tr><td colspan="6" class="empty-state">No employees found</td></tr>';
      ['att-man-p','att-man-a','att-man-h','att-man-l'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent='0';});
      return;
    }
    let p=0,a=0,h=0,l=0;
    tbody.innerHTML=appState.employees.map(emp=>{
      const rec=getAttRecord(emp.id,dateStr);
      const status=rec.status||'P';
      const inT=rec.inTime?minsToTimeStr(timeToMins(rec.inTime)):'—';
      const outT=rec.outTime?minsToTimeStr(timeToMins(rec.outTime)):'—';
      const ot=rec.finalOtHours!=null?formatOtHours(rec.finalOtHours):'—';
      if(status==='A') a++; else if(status==='H') h++; else p++;
      if(rec.isLate) l++;
      return `<tr>
        <td>${esc(emp.name)}</td><td>${esc(emp.id)}</td>
        <td>${inT}</td><td>${outT}</td>
        <td>
          <select class="att-status-select" onchange="app.setAttendanceForDate('${esc(emp.id)}','${esc(dateStr)}',this.value)">
            <option value="P" ${status==='P'?'selected':''}>Present</option>
            <option value="A" ${status==='A'?'selected':''}>Absent</option>
            <option value="H" ${status==='H'?'selected':''}>Holiday</option>
          </select>
          ${rec.isLate?'<span class="badge badge-late">Late</span>':''}
        </td>
        <td>${ot}</td>
      </tr>`;
    }).join('');
    document.getElementById('att-man-p').textContent=p;
    document.getElementById('att-man-a').textContent=a;
    document.getElementById('att-man-h').textContent=h;
    document.getElementById('att-man-l').textContent=l;
  },

  async setAttendanceForDate(empId, dateStr, status) {
    showLoading();
    try { await setAttRecord(empId, dateStr, {status}); }
    catch(err){ showToast('Error: '+err.message,'error'); }
    hideLoading();
    this._attMgmtDate=dateStr;
    this._renderAttMgmtRows();
    this._syncAbsentDays();
    this.calcPreview();
  },

  // ── History ─────────────────────────────────────────────────────────────────
  _populateHistoryFilters() {
    const empSel=document.getElementById('hist-employee');
    const mthSel=document.getElementById('hist-month');
    if(!empSel||!mthSel) return;
    const curEmp=empSel.value, curMonth=mthSel.value;
    empSel.innerHTML='<option value="">All Employees</option>'+
      appState.employees.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
    const months=[...new Set(appState.salaryRecords.map(r=>r.month))].sort().reverse();
    mthSel.innerHTML='<option value="">All Months</option>'+
      months.map(m=>`<option value="${m}">${fmtMonth(m)}</option>`).join('');
    if(curEmp) empSel.value=curEmp;
    if(curMonth) mthSel.value=curMonth;
  },

  renderHistory() { this._populateHistoryFilters(); this.filterHistory(); },

  filterHistory() {
    const empF=document.getElementById('hist-employee').value;
    const mthF=document.getElementById('hist-month').value;
    let records=appState.salaryRecords;
    if(empF) records=records.filter(r=>r.employeeId===empF);
    if(mthF) records=records.filter(r=>r.month===mthF);
    records.sort((a,b)=>b.month.localeCompare(a.month)||a.employeeId.localeCompare(b.employeeId));
    const tbody=document.getElementById('history-tbody');
    if(!records.length){tbody.innerHTML='<tr><td colspan="14" class="empty-state">No records found</td></tr>';return;}
    tbody.innerHTML=records.map(r=>{
      const emp=appState.employees.find(e=>e.id===r.employeeId);
      return `<tr>
        <td>${emp?esc(emp.name):'Unknown'}</td><td>${esc(r.employeeId)}</td>
        <td>${fmtMonth(r.month)}</td><td>${fmt(r.basicSalary)}</td>
        <td>${formatOtHours(r.otHours)}</td><td>${fmt(r.otAmount)}</td>
        <td>${fmt(r.bonus)}</td><td>${fmt(r.festivalBonus||0)}</td>
        <td>${r.absentDays||0}</td>
        <td class="amount-negative">${fmt(r.absentDeduction||0)}</td>
        <td class="amount-negative">${fmt(r.deductions)}</td>
        <td class="amount-negative">${fmt(r.advance)}</td>
        <td class="amount-positive"><strong>${fmt(r.totalSalary)}</strong></td>
        <td>
          <button class="icon-btn primary" onclick="app.generateSlipPDF('${r.id}')" title="Salary Slip"><i class="fas fa-download"></i></button>
          <button class="icon-btn delete" onclick="app.confirmDeleteRecord('${r.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('');
  },

  confirmDeleteRecord(id) {
    document.getElementById('confirmMessage').textContent='Delete this salary record? This cannot be undone.';
    document.getElementById('confirmBtn').onclick=()=>this.deleteRecord(id);
    document.getElementById('confirmModal').classList.add('show');
  },

  async deleteRecord(id) {
    showLoading();
    try { await fbDb.ref(`salaryRecords/${id}`).remove(); appState.salaryRecords=appState.salaryRecords.filter(r=>r.id!==id); }
    catch(err){ showToast('Error: '+err.message,'error'); }
    hideLoading();
    this.closeConfirmModal(); this.filterHistory(); showToast('Record deleted!');
  },

  // ── Monthly Summary ─────────────────────────────────────────────────────────
  loadSummary() {
    const month=document.getElementById('summary-month').value;
    if(!month){showToast('Please select a month!','error');return;}
    const records=appState.salaryRecords.filter(r=>r.month===month);
    const tbody=document.getElementById('summary-tbody'), tfoot=document.getElementById('summary-tfoot');
    if(!records.length){tbody.innerHTML=`<tr><td colspan="12" class="empty-state">No records for ${esc(fmtMonth(month))}</td></tr>`;tfoot.innerHTML='';return;}
    let totBasic=0,totOtHrs=0,totOtAmt=0,totBonus=0,totFest=0,totAbsent=0,totDed=0,totNet=0;
    tbody.innerHTML=records.map((r,i)=>{
      const emp=appState.employees.find(e=>e.id===r.employeeId);
      const totalDed=(r.absentDeduction||0)+r.deductions+r.advance;
      totBasic+=r.basicSalary;totOtHrs+=r.otHours;totOtAmt+=r.otAmount;
      totBonus+=r.bonus;totFest+=(r.festivalBonus||0);totAbsent+=(r.absentDays||0);totDed+=totalDed;totNet+=r.totalSalary;
      return `<tr>
        <td>${i+1}</td><td>${emp?esc(emp.name):'Unknown'}</td><td>${esc(r.employeeId)}</td>
        <td>${fmt(r.basicSalary)}</td><td>${formatOtHours(r.otHours)}</td><td>${fmt(r.otAmount)}</td>
        <td>${fmt(r.bonus)}</td><td>${fmt(r.festivalBonus||0)}</td><td>${r.absentDays||0}</td>
        <td class="amount-negative">${fmt(totalDed)}</td>
        <td class="amount-positive"><strong>${fmt(r.totalSalary)}</strong></td>
        <td><button class="icon-btn primary" onclick="app.generateSlipPDF('${r.id}')" title="Salary Slip PDF"><i class="fas fa-file-pdf"></i></button></td>
      </tr>`;
    }).join('');
    tfoot.innerHTML=`<tr>
      <td colspan="3"><strong>TOTALS (${records.length} employees)</strong></td>
      <td><strong>${fmt(totBasic)}</strong></td><td><strong>${formatOtHours(totOtHrs)}</strong></td><td><strong>${fmt(totOtAmt)}</strong></td>
      <td><strong>${fmt(totBonus)}</strong></td><td><strong>${fmt(totFest)}</strong></td><td><strong>${totAbsent}</strong></td>
      <td class="amount-negative"><strong>${fmt(totDed)}</strong></td>
      <td class="amount-positive"><strong>${fmt(totNet)}</strong></td><td></td>
    </tr>`;
  },

  // ── Payroll Reports ──────────────────────────────────────────────────────────
  renderPayrollReports() {
    const startEl=document.getElementById('pr-start-date'), endEl=document.getElementById('pr-end-date');
    if(!startEl||!endEl) return;
    if(!startEl.value||!endEl.value) this.onPayrollPeriodChange();
  },

  onPayrollPeriodChange() {
    const period=document.getElementById('pr-period').value;
    const startEl=document.getElementById('pr-start-date'), endEl=document.getElementById('pr-end-date');
    const base=startEl.value?dateStringToMidnight(startEl.value):new Date();
    let start=new Date(base), end=new Date(base);
    if(period==='weekly'){start.setDate(base.getDate()-base.getDay());end=new Date(start);end.setDate(start.getDate()+6);}
    else if(period==='monthly'){start=new Date(base.getFullYear(),base.getMonth(),1);end=new Date(base.getFullYear(),base.getMonth()+1,0);}
    const fmt2=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    startEl.value=fmt2(start); endEl.value=fmt2(end);
  },

  loadPayrollReport() {
    const startStr=document.getElementById('pr-start-date').value;
    const endStr=document.getElementById('pr-end-date').value;
    const tbody=document.getElementById('pr-tbody'), tfoot=document.getElementById('pr-tfoot');
    if(!startStr||!endStr){showToast('Select start and end dates!','error');return;}
    const start=dateStringToMidnight(startStr), end=dateStringToMidnight(endStr);
    if(start>end){showToast('Start date must be before end date!','error');return;}
    if(!appState.employees.length){
      tbody.innerHTML='<tr><td colspan="7" class="empty-state">No employees found</td></tr>';
      tfoot.innerHTML='';
      document.getElementById('pr-total-attendance').textContent='0 / 0 / 0';
      document.getElementById('pr-total-salary').textContent=fmt(0);
      return;
    }
    const salByEmp=appState.salaryRecords.reduce((acc,r)=>{(acc[r.employeeId]||(acc[r.employeeId]=[])).push(r);return acc;},{});
    let totP=0,totA=0,totH=0,totOt=0,totSal=0;
    const rows=appState.employees.map(emp=>{
      let p=0,a=0,h=0,salary=0,ot=0;
      const su=Date.UTC(start.getFullYear(),start.getMonth(),start.getDate());
      const eu=Date.UTC(end.getFullYear(),end.getMonth(),end.getDate());
      for(let ts=su;ts<=eu;ts+=MS_PER_DAY){
        const ds=formatAsYYYYMMDD(new Date(ts));
        const st=getAttStatus(emp.id,ds);
        if(st==='A') a++; else if(st==='H') h++; else p++;
      }
      (salByEmp[emp.id]||[]).forEach(r=>{
        const dim=getDaysInMonth(r.month);
        const ms=dateStringToMidnight(`${r.month}-01`);
        const me=dateStringToMidnight(`${r.month}-${String(dim).padStart(2,'0')}`);
        const os=ms>start?ms:start, oe=me<end?me:end;
        if(os>oe) return;
        const factor=daysBetweenInclusive(os,oe)/dim;
        salary+=(r.totalSalary||0)*factor; ot+=(r.otHours||0)*factor;
      });
      totP+=p;totA+=a;totH+=h;totOt+=ot;totSal+=salary;
      return `<tr><td>${esc(emp.name)}</td><td>${esc(emp.id)}</td>
        <td>${p}</td><td>${a}</td><td>${h}</td>
        <td>${formatOtHours(ot)}</td>
        <td class="amount-positive"><strong>${fmt(salary)}</strong></td></tr>`;
    });
    tbody.innerHTML=rows.join('');
    tfoot.innerHTML=`<tr><td colspan="2"><strong>TOTALS (${appState.employees.length} employees)</strong></td>
      <td><strong>${totP}</strong></td><td><strong>${totA}</strong></td><td><strong>${totH}</strong></td>
      <td><strong>${formatOtHours(totOt)}</strong></td>
      <td class="amount-positive"><strong>${fmt(totSal)}</strong></td></tr>`;
    document.getElementById('pr-total-attendance').textContent=`${totP} / ${totA} / ${totH}`;
    document.getElementById('pr-total-salary').textContent=fmt(totSal);
  },

  // ── Settings ────────────────────────────────────────────────────────────────
  renderSettings() {
    const s=appState.settings;
    document.getElementById('setting-company-name').value=s.companyName||'TRACS APPAREL';
    document.getElementById('setting-shift-start').value=s.shiftStart||'08:00';
    document.getElementById('setting-shift-end').value=s.shiftEnd||'17:00';
    document.getElementById('setting-late-mark').value=s.lateMark||'08:05';
    document.getElementById('setting-late-threshold').value=s.lateThreshold||'09:00';
    document.getElementById('setting-ot-rate').value=s.otRateFactor!=null?s.otRateFactor:0.5;
    const em=document.getElementById('settings-admin-email');
    if(em&&appState.currentUser) em.textContent=appState.currentUser.email||'—';
    this._renderUsersList();
  },

  async saveSettings(evt) {
    evt.preventDefault();
    const newSettings={
      companyName:   document.getElementById('setting-company-name').value.trim()||'TRACS APPAREL',
      shiftStart:    document.getElementById('setting-shift-start').value,
      shiftEnd:      document.getElementById('setting-shift-end').value,
      lateMark:      document.getElementById('setting-late-mark').value,
      lateThreshold: document.getElementById('setting-late-threshold').value,
      otRateFactor:  parseFloat(document.getElementById('setting-ot-rate').value)||0.5,
      adminUid:      appState.settings.adminUid,
    };
    showLoading();
    try {
      await fbDb.ref('settings').update(newSettings);
      appState.settings={...appState.settings,...newSettings};
      showToast('Settings saved!');
    } catch(err){ showToast('Error: '+err.message,'error'); }
    hideLoading();
  },

  _renderUsersList() {
    const tbody=document.getElementById('users-tbody');
    if(!tbody) return;
    const users=appState.users;
    if(!Object.keys(users).length){tbody.innerHTML='<tr><td colspan="4" class="empty-state">No users registered yet</td></tr>';return;}
    tbody.innerHTML=Object.entries(users).map(([uid,u])=>{
      const emp=u.employeeId?appState.employees.find(e=>e.id===u.employeeId):null;
      return `<tr>
        <td>${esc(u.email||'—')}</td>
        <td><span class="role-badge role-${u.role||'worker'}">${u.role||'worker'}</span></td>
        <td>${emp?esc(emp.name+' ('+emp.id+')'):'<em>None</em>'}</td>
        <td>
          ${u.role!=='admin'?`<button class="icon-btn primary" onclick="app.promoteToAdmin('${uid}')" title="Promote to Admin"><i class="fas fa-crown"></i></button>`:''}
          <button class="icon-btn edit" onclick="app.openLinkEmpModal('${uid}','${esc(u.email||'')}')" title="Link Employee"><i class="fas fa-link"></i></button>
        </td>
      </tr>`;
    }).join('');
  },

  async promoteToAdmin(uid) {
    showLoading();
    try {
      await fbDb.ref(`users/${uid}`).update({role:'admin'});
      if(appState.users[uid]) appState.users[uid].role='admin';
      this._renderUsersList();
      showToast('User promoted to Admin!');
    } catch(err){ showToast('Error: '+err.message,'error'); }
    hideLoading();
  },

  openLinkEmpModal(uid, email) {
    this._linkUid=uid;
    document.getElementById('linkEmpUserEmail').textContent=email||uid;
    const sel=document.getElementById('linkEmpSelect');
    sel.innerHTML='<option value="">— Select Employee —</option>'+
      appState.employees.map(e=>`<option value="${esc(e.id)}">${esc(e.name)} (${esc(e.id)})</option>`).join('');
    const existingEmpId=(appState.users[uid]||{}).employeeId;
    if(existingEmpId) sel.value=existingEmpId;
    document.getElementById('linkEmpModal').classList.add('show');
  },

  closeLinkEmpModal() { document.getElementById('linkEmpModal').classList.remove('show'); },

  async saveLinkEmployee() {
    const empId=document.getElementById('linkEmpSelect').value;
    if(!this._linkUid) return;
    showLoading();
    try {
      await fbDb.ref(`users/${this._linkUid}`).update({employeeId:empId||null});
      if(appState.users[this._linkUid]) appState.users[this._linkUid].employeeId=empId||null;
      this._renderUsersList();
      showToast('Employee linked!');
    } catch(err){ showToast('Error: '+err.message,'error'); }
    hideLoading();
    this.closeLinkEmpModal();
  },

  // ── PDF: Individual Salary Slip ─────────────────────────────────────────────
  generateSlipPDF(recordId) {
    const record=appState.salaryRecords.find(r=>r.id===recordId);
    if(!record){showToast('Record not found!','error');return;}
    const emp=appState.employees.find(e=>e.id===record.employeeId);
    if(!emp){showToast('Employee not found!','error');return;}
    const{jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const pageW=doc.internal.pageSize.getWidth(), margin=15;
    const hc=[13,115,119];
    let y=0;
    doc.setFillColor(...hc); doc.rect(0,0,pageW,38,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(16); doc.setFont('helvetica','bold');
    doc.text(appState.settings.companyName||'TRACS APPAREL',pageW/2,13,{align:'center'});
    doc.setFontSize(11); doc.setFont('helvetica','normal');
    doc.text('EMPLOYEE SALARY SLIP',pageW/2,22,{align:'center'});
    doc.setFontSize(9); doc.text(fmtMonth(record.month),pageW/2,30,{align:'center'});
    y=44;
    if(emp.photo){try{doc.addImage(emp.photo,'JPEG',margin,y,22,22);}catch(e){}}
    const detailX=emp.photo?margin+26:margin;
    doc.setTextColor(0,0,0);
    doc.setFillColor(245,252,252); doc.setDrawColor(200,230,230);
    doc.roundedRect(margin,y,pageW-margin*2,30,2,2,'FD');
    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    const lx=detailX+2,vx=detailX+32,l2=pageW/2+5,v2=pageW/2+35;
    [[`Name:`,emp.name,`Pay Period:`,fmtMonth(record.month)],
     [`Employee ID:`,emp.id,`Department:`,emp.department||'N/A'],
     [`Basic Salary:`,`BDT ${fmtPDF(record.basicSalary)}`,`Absent Days:`,String(record.absentDays||0)]]
    .forEach((row,i)=>{
      const ry=y+7+i*8;
      doc.setFont('helvetica','bold'); doc.text(row[0],lx,ry);
      doc.setFont('helvetica','normal'); doc.text(row[1],vx,ry);
      if(row[2]){doc.setFont('helvetica','bold');doc.text(row[2],l2,ry);}
      if(row[3]){doc.setFont('helvetica','normal');doc.text(row[3],v2,ry);}
    });
    y+=36;
    const fest=record.festivalBonus||0, absDed=record.absentDeduction||0;
    const gross=record.basicSalary+record.otAmount+record.bonus+fest;
    const totalDed=absDed+record.deductions+record.advance;
    doc.autoTable({startY:y,head:[['EARNINGS','Amount (BDT)']],
      body:[['Basic Salary',fmtPDF(record.basicSalary)],['Overtime ('+formatOtHours(record.otHours)+' hrs)',fmtPDF(record.otAmount)],['Regular Bonus',fmtPDF(record.bonus)],['Festival Bonus',fmtPDF(fest)],['Gross Earnings',fmtPDF(gross)]],
      theme:'grid',headStyles:{fillColor:hc,textColor:255,fontStyle:'bold',fontSize:9},
      styles:{fontSize:9},columnStyles:{1:{halign:'right'}},margin:{left:margin,right:pageW/2+2}});
    const earningsY=doc.lastAutoTable.finalY;
    doc.autoTable({startY:y,head:[['DEDUCTIONS','Amount (BDT)']],
      body:[['Absent Deduction',fmtPDF(absDed)],['General Deductions',fmtPDF(record.deductions)],['Advance',fmtPDF(record.advance)],['Total Deductions',fmtPDF(totalDed)]],
      theme:'grid',headStyles:{fillColor:[180,50,50],textColor:255,fontStyle:'bold',fontSize:9},
      styles:{fontSize:9},columnStyles:{1:{halign:'right'}},margin:{left:pageW/2+2,right:margin}});
    y=Math.max(earningsY,doc.lastAutoTable.finalY)+5;
    doc.setFillColor(...hc); doc.rect(margin,y,pageW-margin*2,14,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(11); doc.setFont('helvetica','bold');
    doc.text('NET PAY:',margin+5,y+9);
    doc.text('BDT '+fmtPDF(record.totalSalary),pageW-margin-5,y+9,{align:'right'});
    y+=22;
    doc.setTextColor(80,80,80); doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.text('Employee Signature: _______________________',margin,y);
    doc.text('Authorized Signature: _______________________',pageW-margin,y,{align:'right'});
    y+=6; doc.setFontSize(7); doc.setTextColor(140,140,140);
    doc.text('This is a system-generated document.',pageW/2,y,{align:'center'});
    doc.setFillColor(240,245,245); doc.rect(0,283,pageW,14,'F');
    doc.setFontSize(8); doc.setTextColor(120,120,120);
    doc.text('Generated on '+new Date().toLocaleDateString()+' | '+(appState.settings.companyName||'TRACS APPAREL'),pageW/2,291,{align:'center'});
    doc.save('Salary_Slip_'+emp.name.replace(/\s+/g,'_')+'_'+record.month+'.pdf');
    showToast('Salary slip downloaded!','info');
  },

  // ── PDF: Monthly Summary Sheet ──────────────────────────────────────────────
  generateSummaryPDF() {
    const month=document.getElementById('summary-month').value;
    if(!month){showToast('Please select a month!','error');return;}
    const records=appState.salaryRecords.filter(r=>r.month===month);
    if(!records.length){showToast('No records for selected month!','error');return;}
    const{jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const pageW=doc.internal.pageSize.getWidth(), hc=[13,115,119];
    doc.setFillColor(...hc); doc.rect(0,0,pageW,32,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(15); doc.setFont('helvetica','bold');
    doc.text(appState.settings.companyName||'TRACS APPAREL',pageW/2,11,{align:'center'});
    doc.setFontSize(11); doc.text('MONTHLY SALARY SUMMARY SHEET',pageW/2,20,{align:'center'});
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text(fmtMonth(month),pageW/2,28,{align:'center'});
    let totBasic=0,totOtHrs=0,totOtAmt=0,totBonus=0,totFest=0,totAbsent=0,totDed=0,totNet=0;
    const tableRows=records.map((r,i)=>{
      const emp=appState.employees.find(e=>e.id===r.employeeId);
      const totalDed=(r.absentDeduction||0)+r.deductions+r.advance;
      totBasic+=r.basicSalary;totOtHrs+=r.otHours;totOtAmt+=r.otAmount;
      totBonus+=r.bonus;totFest+=(r.festivalBonus||0);totAbsent+=(r.absentDays||0);totDed+=totalDed;totNet+=r.totalSalary;
      return[i+1,emp?emp.name:'Unknown',r.employeeId,fmtPDF(r.basicSalary),formatOtHours(r.otHours),fmtPDF(r.otAmount),fmtPDF(r.bonus),fmtPDF(r.festivalBonus||0),r.absentDays||0,fmtPDF(totalDed),fmtPDF(r.totalSalary)];
    });
    tableRows.push(['','TOTAL','',fmtPDF(totBasic),formatOtHours(totOtHrs),fmtPDF(totOtAmt),fmtPDF(totBonus),fmtPDF(totFest),totAbsent,fmtPDF(totDed),fmtPDF(totNet)]);
    doc.autoTable({startY:38,head:[['#','Employee Name','ID','Basic (BDT)','OT Hrs','OT Amt','Bonus','Fest. Bonus','Absent Days','Total Deduction','Net Salary (BDT)']],
      body:tableRows,theme:'grid',
      headStyles:{fillColor:hc,textColor:255,fontStyle:'bold',fontSize:8},
      styles:{fontSize:8,cellPadding:2.5},
      columnStyles:{0:{cellWidth:8,halign:'center'},1:{cellWidth:40},2:{cellWidth:18,halign:'center'},3:{halign:'right'},4:{cellWidth:12,halign:'center'},5:{halign:'right'},6:{halign:'right'},7:{halign:'right'},8:{cellWidth:14,halign:'center'},9:{halign:'right'},10:{halign:'right',fontStyle:'bold'}},
      didParseCell(hook){if(hook.row.index===tableRows.length-1){hook.cell.styles.fillColor=[210,245,240];hook.cell.styles.fontStyle='bold';hook.cell.styles.fontSize=9;}}
    });
    const fy=doc.lastAutoTable.finalY+8;
    doc.setFontSize(8); doc.setTextColor(100,100,100);
    doc.text('Total Employees: '+records.length+'  |  Generated: '+new Date().toLocaleDateString(),14,fy);
    doc.text('Authorized Signature: _______________________',pageW-14,fy,{align:'right'});
    doc.save('Monthly_Summary_'+month+'.pdf');
    showToast('Monthly summary PDF downloaded!','info');
  },
};

// ─── Worker App ───────────────────────────────────────────────────────────────
const workerApp = {
  _clockTimer: null,

  init() {
    const empId = appState.currentEmpId;
    if (!empId) {
      document.getElementById('workerNoProfile').style.display = '';
      document.getElementById('workerProfileContent').style.display = 'none';
      document.getElementById('workerClockCard').style.display = 'none';
      document.getElementById('workerBreakdownCard').style.display = 'none';
      return;
    }
    const emp = appState.employees.find(e => e.id === empId);
    if (!emp) {
      document.getElementById('workerNoProfile').style.display = '';
      document.getElementById('workerProfileContent').style.display = 'none';
      return;
    }
    // Show profile
    document.getElementById('workerNoProfile').style.display = 'none';
    document.getElementById('workerProfileContent').style.display = '';
    document.getElementById('workerClockCard').style.display = '';
    document.getElementById('workerBreakdownCard').style.display = '';

    document.getElementById('workerName').textContent = emp.name;
    document.getElementById('workerEmpId').textContent = emp.id;
    const deptRow = document.getElementById('workerDeptRow');
    if (emp.department) {
      deptRow.style.display = '';
      document.getElementById('workerDept').textContent = emp.department;
    } else {
      deptRow.style.display = 'none';
    }
    document.getElementById('workerBasic').textContent = fmt(emp.basicSalary);
    const avatarEl = document.getElementById('workerAvatar');
    if (emp.photo) {
      avatarEl.innerHTML = `<img src="${emp.photo}" alt="${esc(emp.name)}">`;
    } else {
      avatarEl.innerHTML = `<span>${initials(emp.name)}</span>`;
    }

    // Default breakdown month
    const now = new Date();
    const bm = document.getElementById('breakdown-month');
    if (bm && !bm.value) {
      bm.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    }

    this._startClock();
    this._refreshTodayStatus();
  },

  _startClock() {
    const updateClock = () => {
      const now = new Date();
      const dateEl = document.getElementById('clockDate');
      const timeEl = document.getElementById('clockTimeLive');
      if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
      if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    };
    updateClock();
    if (this._clockTimer) clearInterval(this._clockTimer);
    this._clockTimer = setInterval(updateClock, 1000);
  },

  _refreshTodayStatus() {
    const empId = appState.currentEmpId;
    if (!empId) return;
    const today = todayStr();
    const rec = getAttRecord(empId, today);
    const inT  = rec.inTime  || null;
    const outT = rec.outTime || null;

    document.getElementById('clockInDisplay').textContent   = inT  ? minsToTimeStr(timeToMins(inT))  : '—';
    document.getElementById('clockOutDisplay').textContent  = outT ? minsToTimeStr(timeToMins(outT)) : '—';
    document.getElementById('clockStatusDisplay').textContent = rec.isLate ? 'Present (Late)' : (inT ? 'Present' : '—');
    document.getElementById('clockOTDisplay').textContent   = rec.finalOtHours != null && outT ? `${formatOtHours(rec.finalOtHours)} hrs` : '—';

    const btnIn  = document.getElementById('btnClockIn');
    const btnOut = document.getElementById('btnClockOut');

    if (!inT) {
      // Not clocked in yet
      btnIn.style.display  = '';
      btnOut.style.display = 'none';
    } else if (!outT) {
      // Clocked in, not out
      btnIn.style.display  = 'none';
      btnOut.style.display = '';
    } else {
      // Both clocked, show locked message
      btnIn.style.display  = 'none';
      btnOut.style.display = 'none';
      const actionsEl = document.getElementById('clockActions');
      if (actionsEl) actionsEl.innerHTML = '<p class="clock-done-msg"><i class="fas fa-check-circle"></i> Attendance recorded for today.</p>';
    }
  },

  async clockIn() {
    const empId = appState.currentEmpId;
    if (!empId) return;
    const now   = new Date();
    const today = todayStr();
    // Only allow for today
    const inTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const { isLate, lateMinutes } = calcDayOT(inTime, null, appState.settings);
    showLoading();
    try {
      const data = { status: 'P', inTime, isLate, lateMinutes };
      await setAttRecord(empId, today, data);
      if (isLate) showToast(`Clocked in at ${minsToTimeStr(timeToMins(inTime))} — marked Late`, 'warning');
      else showToast(`Clocked in at ${minsToTimeStr(timeToMins(inTime))}`, 'success');
    } catch(err) { showToast('Error: '+err.message, 'error'); }
    hideLoading();
    this._refreshTodayStatus();
  },

  async clockOut() {
    const empId = appState.currentEmpId;
    if (!empId) return;
    const now   = new Date();
    const today = todayStr();
    const rec   = getAttRecord(empId, today);
    if (!rec.inTime) { showToast('You have not clocked in yet!','warning'); return; }
    const outTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const { isLate, lateMinutes, finalOtHours } = calcDayOT(rec.inTime, outTime, appState.settings);
    showLoading();
    try {
      const data = { outTime, finalOtHours };
      await setAttRecord(empId, today, data);
      const msg = finalOtHours > 0
        ? `Clocked out. OT: ${formatOtHours(finalOtHours)} hrs`
        : `Clocked out at ${minsToTimeStr(timeToMins(outTime))}`;
      showToast(msg, 'success');
    } catch(err) { showToast('Error: '+err.message, 'error'); }
    hideLoading();
    this._refreshTodayStatus();
  },

  async loadBreakdown() {
    const empId = appState.currentEmpId;
    const month = document.getElementById('breakdown-month').value;
    if (!empId || !month) { showToast('Select a month first!','warning'); return; }

    const key    = safeKey(empId);
    const days   = getDaysInMonth(month);
    const empAtt = appState.attendance[key] || {};

    let presentCount = 0, lateCount = 0, absentCount = 0, totalOT = 0;
    const rows = [];

    for (let d = 1; d <= days; d++) {
      const dateStr = `${month}-${String(d).padStart(2,'0')}`;
      const rec     = empAtt[dateStr] || { status: 'P' };
      const status  = rec.status || 'P';
      const isLate  = rec.isLate || false;
      const ot      = rec.finalOtHours || 0;
      const inT     = rec.inTime  ? minsToTimeStr(timeToMins(rec.inTime))  : '—';
      const outT    = rec.outTime ? minsToTimeStr(timeToMins(rec.outTime)) : '—';
      const dayDate = new Date(`${dateStr}T00:00:00`);
      const dayName = DAY_NAMES[dayDate.getDay()];

      if (status === 'A') absentCount++;
      else { presentCount++; if (isLate) lateCount++; }
      if (status !== 'A') totalOT += ot;

      let statusLabel = status === 'A' ? '<span class="badge badge-absent">Absent</span>'
                      : status === 'H' ? '<span class="badge badge-holiday">Holiday</span>'
                      : '<span class="badge badge-present">Present</span>';

      rows.push(`<tr>
        <td>${dateStr}</td>
        <td>${dayName.slice(0,3)}</td>
        <td>${inT}</td><td>${outT}</td>
        <td>${statusLabel}</td>
        <td>${isLate ? '<span class="badge badge-late">Yes</span>' : '<span class="text-muted">No</span>'}</td>
        <td>${status !== 'A' && ot > 0 ? formatOtHours(ot) : '—'}</td>
      </tr>`);
    }

    const tbody = document.getElementById('breakdown-tbody');
    tbody.innerHTML = rows.join('');

    // Summary stats
    document.getElementById('bstat-present').textContent = presentCount;
    document.getElementById('bstat-late').textContent    = lateCount;
    document.getElementById('bstat-absent').textContent  = absentCount;
    document.getElementById('bstat-ot').textContent      = formatOtHours(totalOT);

    // Salary from records
    const emp    = appState.employees.find(e => e.id === empId);
    const srec   = appState.salaryRecords.find(r => r.employeeId === empId && r.month === month);
    document.getElementById('bstat-salary').textContent = srec ? fmt(srec.totalSalary) : (emp ? `Basic: ${fmt(emp.basicSalary)}` : '—');

    document.getElementById('breakdownStats').style.display      = '';
    document.getElementById('breakdownTableWrap').style.display  = '';
    document.getElementById('breakdownEmpty').style.display      = rows.length ? 'none' : '';
  },

  printMonthlySheet() {
    const empId = appState.currentEmpId;
    const month = document.getElementById('breakdown-month').value;
    const table = document.getElementById('breakdownTableWrap');
    const stats = document.getElementById('breakdownStats');
    if (!month || !table || table.style.display === 'none') {
      showToast('Please load a monthly report first!','warning'); return;
    }
    const emp   = appState.employees.find(e => e.id === empId);
    const srec  = appState.salaryRecords.find(r => r.employeeId === empId && r.month === month);

    const{jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const pageW=doc.internal.pageSize.getWidth(), hc=[13,115,119];
    doc.setFillColor(...hc); doc.rect(0,0,pageW,28,'F');
    doc.setTextColor(255,255,255);
    doc.setFontSize(14); doc.setFont('helvetica','bold');
    doc.text(appState.settings.companyName||'TRACS APPAREL',pageW/2,10,{align:'center'});
    doc.setFontSize(10); doc.setFont('helvetica','normal');
    doc.text('MONTHLY ATTENDANCE REPORT — '+fmtMonth(month),pageW/2,18,{align:'center'});
    if(emp){
      doc.setFontSize(9);
      doc.text(`Employee: ${emp.name}  |  ID: ${emp.id}  |  Basic: BDT ${fmtPDF(emp.basicSalary)}`,pageW/2,25,{align:'center'});
    }

    const key=safeKey(empId||'');
    const days=getDaysInMonth(month);
    const empAtt=appState.attendance[key]||{};
    const tableRows=[];
    let pCount=0,lCount=0,aCount=0,otTotal=0;
    for(let d=1;d<=days;d++){
      const dateStr=`${month}-${String(d).padStart(2,'0')}`;
      const rec=empAtt[dateStr]||{status:'P'};
      const status=rec.status||'P';
      const isLate=rec.isLate||false;
      const ot=rec.finalOtHours||0;
      const inT=rec.inTime?minsToTimeStr(timeToMins(rec.inTime)):'—';
      const outT=rec.outTime?minsToTimeStr(timeToMins(rec.outTime)):'—';
      const dayDate=new Date(`${dateStr}T00:00:00`);
      if(status==='A') aCount++; else {pCount++;if(isLate)lCount++;}
      if(status!=='A') otTotal+=ot;
      tableRows.push([dateStr,DAY_NAMES[dayDate.getDay()].slice(0,3),inT,outT,status===`A`?`Absent`:status===`H`?`Holiday`:`Present`,isLate?`Yes`:`No`,status!==`A`&&ot>0?formatOtHours(ot):`—`]);
    }
    doc.autoTable({
      startY:32,
      head:[['Date','Day','In Time','Out Time','Status','Late?','OT Hrs']],
      body:tableRows,
      theme:'grid',
      headStyles:{fillColor:hc,textColor:255,fontStyle:'bold',fontSize:8},
      styles:{fontSize:8,cellPadding:2},
      columnStyles:{0:{cellWidth:22},1:{cellWidth:12},2:{cellWidth:20},3:{cellWidth:20},4:{cellWidth:18},5:{cellWidth:12,halign:'center'},6:{cellWidth:16,halign:'right'}},
    });
    const fy=doc.lastAutoTable.finalY+6;
    const summaryText=`Present: ${pCount}  |  Late Days: ${lCount}  |  Absent: ${aCount}  |  Total OT: ${formatOtHours(otTotal)} hrs`+(srec?`  |  Net Salary: BDT ${fmtPDF(srec.totalSalary)}`:'');
    doc.setFontSize(9); doc.setTextColor(13,115,119); doc.setFont('helvetica','bold');
    doc.text(summaryText,14,fy);
    doc.setFontSize(7); doc.setTextColor(120,120,120); doc.setFont('helvetica','normal');
    doc.text('Generated on '+new Date().toLocaleDateString(),pageW-14,fy,{align:'right'});
    doc.save('Monthly_Report_'+(emp?emp.name.replace(/\s+/g,'_'):'Employee')+'_'+month+'.pdf');
    showToast('Monthly report downloaded!','info');
  },
};

// ─── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Auth state change handles everything
  // Initial state: show loading until Firebase Auth resolves
});
