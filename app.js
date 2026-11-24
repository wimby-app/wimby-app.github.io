(function () {
  'use strict';

  const APP_VERSION = '2.1';
  const WHATS_NEW_ITEMS = [
    'איתור מהיר של תחנה וקווים לפי מספר תחנה או תחנות קרובות (📍 אופציונלי).',
    'אימות OpenBus מדויק יותר – בודק את שעות ההגעה המתוכננות לתחנה הספציפית שלך.',
    'מסך המתנה נקי ואינטואיטיבי יותר ללא עומס כפתורים.',
    'תיבה ברורה יותר למילוי אוטומטי של פרטים אישיים בטיוטת המייל (נשמר רק במכשיר).',
  ];

  // ---------- Constants ----------
  const STORAGE_KEYS = {
    LOGS: 'busWaitLogger_logs_v1',
    ACTIVE: 'busWaitLogger_active_v1',
    SETTINGS_V1: 'busWaitLogger_settings_v1',
    ROUTES: 'busWaitLogger_routes_v2',
    ACTIVE_ROUTE_ID: 'busWaitLogger_activeRouteId_v2',
    PROFILE: 'busWaitLogger_profile_v2',
    PREFS: 'busWaitLogger_prefs_v2',
    ONBOARDING_SEEN: 'busWaitLogger_onboarding_v1',
    LAST_SEEN_VERSION: 'busWaitLogger_lastSeenVersion_v1',
    HIDE_WHATS_NEW: 'busWaitLogger_hideWhatsNew_v1',
  };

  const MOT_EMAIL = 'pniotcrm@mot.gov.il';
  const MOT_FORM_URL = 'https://www.gov.il/he/service/public-transportation-application';
  const OPENBUS_API_BASE = 'https://open-bus-stride-api.hasadna.org.il';
  const DATABUS_WEB_URL = 'https://open-bus-map-search.hasadna.org.il/';

  const OPERATOR_DIRECTORY = {
    'סופרבוס': { operatorRefs: '16', formUrl: 'https://www.superbus.co.il/contact', phone: '*2289' },
    'אגד': { operatorRefs: '3', email: 'pniot@egged.co.il', formUrl: 'https://www.egged.co.il/contact-us', phone: '*2800' },
    'דן': { operatorRefs: '5,31,32', email: 'cs@dan.co.il', formUrl: 'https://www.dan.co.il/contact-us/', phone: '*3456' },
    'קווים': { email: 'pniyot@kavim-t.co.il', formUrl: 'https://www.kavim-t.co.il/contact', phone: '*2060' },
    'אקסטרה': { operatorRefs: '37,38', formUrl: 'https://extrapt.co.il/contact/', phone: '*6747' },
    'מטרופולין': { operatorRefs: '15', formUrl: 'https://www.metropoline.com/Pages/ContactUs.aspx', phone: '*5900' },
    'אלקטרה אפיקים': { operatorRefs: '25', formUrl: 'https://www.electra-afikim.co.il/contact/', phone: '*6686' },
    'תנופה': { formUrl: 'https://www.tnufa-t.com/contact/', phone: '*8797' },
    'נתיב אקספרס': { operatorRefs: '14', formUrl: 'https://www.nateevexpress.com/contact', phone: '*3553' },
    'בית שמש אקספרס': { operatorRefs: '35', formUrl: 'https://www.bsexpress.co.il/contact', phone: '*3343' },
    'רכבת ישראל': { formUrl: 'https://www.rail.co.il/pages/contactus.aspx', phone: '*5770' },
    'כפיר (רכבת קלה)': { operatorRefs: '21', formUrl: 'https://www.cfir.co.il/contact-us/', phone: '*2779' },
  };

  const HEBREW_DAYS = ["יום א'", "יום ב'", "יום ג'", "יום ד'", "יום ה'", "יום ו'", "שבת"];

  const ICON_PENCIL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
  const ICON_TRASH = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  // ---------- State ----------
  let logs = [];
  let routes = [];
  let activeRouteId = null;
  let activeSession = null; // { startIso, note, issueType, routeSnapshot }
  let profile = { fullName: '', idNumber: '', phone: '', address: '' };
  let prefs = { minDelayMinutes: 15 };

  let timerInterval = null;
  let pendingConfirmCallback = null;
  let toastTimeout = null;
  let lastDeletedEntry = null;
  let deferredInstallPrompt = null;

  // Complaint wizard state
  let complaintSelectedIds = new Set();
  const verifyingLogIds = new Set();
  let tourStep = 0;

  const TOUR_SLIDES = [
    {
      visual: '<img src="./icon.svg" alt="Wimby" width="68" height="68" style="border-radius:18px;box-shadow:var(--shadow-sm);" />',
      title: 'ברוך הבא ל-Wimby!',
      body: 'מתעדים המתנות חריגות בתחנה בקליק אחד. הכל נשמר 100% אצלך במכשיר – בלי הרשמה, בלי שרת ובלי מעקב.',
    },
    {
      visual: '<div class="tour-visual amber">⏱️</div>',
      title: 'קווים קבועים וסף איחור',
      body: 'שמור את הקווים הקבועים שלך (בוקר / ערב) להחלפה מהירה. כברירת מחדל רק המתנות מעל 15 דקות נשמרות – ואפשר לשנות את הסף בכל רגע בהגדרות.',
    },
    {
      visual: '<div class="tour-visual emerald">✉️</div>',
      title: 'אימות OpenBus והגשת תלונה',
      body: 'אמת כל תיעוד מול נתוני ה-GPS הפתוחים של OpenBus (דאטאבוס), והפק תלונה רשמית מוכנה לשליחה במייל, עם CSV מצורף, או בטופס gov.il.',
    },
    {
      visual: '<div class="tour-visual indigo">📱</div>',
      title: 'הצמד למסך הבית',
      body: 'לפתיחה מיידית בתחנה (גם בלי אינטרנט) ולשמירה בטוחה של ההיסטוריה ב-iPhone – הוסף את Wimby למסך הבית (שתף ← הוסף למסך הבית).',
    },
  ];

  // ---------- DOM Refs ----------
  const el = {
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    routesBar: document.getElementById('routesBar'),
    installBanner: document.getElementById('installBanner'),
    installAppBtn: document.getElementById('installAppBtn'),

    idleView: document.getElementById('idleView'),
    waitingView: document.getElementById('waitingView'),
    liveClock: document.getElementById('liveClock'),
    startWaitBtn: document.getElementById('startWaitBtn'),
    startBtnRouteHint: document.getElementById('startBtnRouteHint'),

    waitStartTimeText: document.getElementById('waitStartTimeText'),
    liveTimer: document.getElementById('liveTimer'),
    timerSubtext: document.getElementById('timerSubtext'),
    activeNoteInput: document.getElementById('activeNoteInput'),
    busArrivedBtn: document.getElementById('busArrivedBtn'),
    gaveUpBtn: document.getElementById('gaveUpBtn'),
    cancelWaitBtn: document.getElementById('cancelWaitBtn'),

    statTotal: document.getElementById('statTotal'),
    statAvg: document.getElementById('statAvg'),
    statMax: document.getElementById('statMax'),
    statGaveUp: document.getElementById('statGaveUp'),

    openComplaintBtn: document.getElementById('openComplaintBtn'),
    complaintCtaSub: document.getElementById('complaintCtaSub'),
    openManualBtn: document.getElementById('openManualBtn'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    copySummaryBtn: document.getElementById('copySummaryBtn'),
    logsList: document.getElementById('logsList'),
    clearAllWrapper: document.getElementById('clearAllWrapper'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    emptyState: document.getElementById('emptyState'),

    // Settings Modal
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    minDelayInput: document.getElementById('minDelayInput'),
    savedRoutesList: document.getElementById('savedRoutesList'),
    routeForm: document.getElementById('routeForm'),
    editingRouteId: document.getElementById('editingRouteId'),
    routeLineRef: document.getElementById('routeLineRef'),
    lookupStopBtn: document.getElementById('lookupStopBtn'),
    nearbyStopsBtn: document.getElementById('nearbyStopsBtn'),
    stopLookupStatus: document.getElementById('stopLookupStatus'),
    stopLinesFilter: document.getElementById('stopLinesFilter'),
    nearbyStopsList: document.getElementById('nearbyStopsList'),
    stopLinesList: document.getElementById('stopLinesList'),
    routeLine: document.getElementById('routeLine'),
    routeOperator: document.getElementById('routeOperator'),
    routeStopCode: document.getElementById('routeStopCode'),
    routeLabel: document.getElementById('routeLabel'),
    routeStopName: document.getElementById('routeStopName'),
    routeDirection: document.getElementById('routeDirection'),
    saveRouteBtn: document.getElementById('saveRouteBtn'),
    resetRouteFormBtn: document.getElementById('resetRouteFormBtn'),
    backupJsonBtn: document.getElementById('backupJsonBtn'),
    restoreJsonBtn: document.getElementById('restoreJsonBtn'),
    restoreJsonInput: document.getElementById('restoreJsonInput'),

    // Manual / Edit Modal
    manualModal: document.getElementById('manualModal'),
    manualModalTitle: document.getElementById('manualModalTitle'),
    closeManualBtn: document.getElementById('closeManualBtn'),
    cancelManualBtn: document.getElementById('cancelManualBtn'),
    manualForm: document.getElementById('manualForm'),
    editingLogId: document.getElementById('editingLogId'),
    manualDate: document.getElementById('manualDate'),
    manualRouteSelect: document.getElementById('manualRouteSelect'),
    manualStartTime: document.getElementById('manualStartTime'),
    manualEndTime: document.getElementById('manualEndTime'),
    manualIssueType: document.getElementById('manualIssueType'),
    manualNote: document.getElementById('manualNote'),
    manualErrorMsg: document.getElementById('manualErrorMsg'),
    manualSubmitBtn: document.getElementById('manualSubmitBtn'),

    // Complaint Modal
    complaintModal: document.getElementById('complaintModal'),
    closeComplaintBtn: document.getElementById('closeComplaintBtn'),
    complaintOperatorLabel: document.getElementById('complaintOperatorLabel'),
    complaintAgeWarning: document.getElementById('complaintAgeWarning'),
    selectedLogsCount: document.getElementById('selectedLogsCount'),
    toggleSelectUnreportedBtn: document.getElementById('toggleSelectUnreportedBtn'),
    complaintLogsChecklist: document.getElementById('complaintLogsChecklist'),
    profileFullName: document.getElementById('profileFullName'),
    profileIdNumber: document.getElementById('profileIdNumber'),
    profilePhone: document.getElementById('profilePhone'),
    profileAddress: document.getElementById('profileAddress'),
    clearProfileBtn: document.getElementById('clearProfileBtn'),
    complaintPreview: document.getElementById('complaintPreview'),
    complaintMissingProfileHint: document.getElementById('complaintMissingProfileHint'),
    sendEmailBtn: document.getElementById('sendEmailBtn'),
    sendEmailBtnText: document.getElementById('sendEmailBtnText'),
    shareWithCsvBtn: document.getElementById('shareWithCsvBtn'),
    copyAndOpenFormBtn: document.getElementById('copyAndOpenFormBtn'),
    copyAndOpenFormText: document.getElementById('copyAndOpenFormText'),
    downloadSelectedCsvBtn: document.getElementById('downloadSelectedCsvBtn'),
    markReportedBtn: document.getElementById('markReportedBtn'),

    // Confirm Modal
    confirmModal: document.getElementById('confirmModal'),
    confirmTitle: document.getElementById('confirmTitle'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmOkBtn: document.getElementById('confirmOkBtn'),
    confirmCancelBtn: document.getElementById('confirmCancelBtn'),

    // About Modal
    openAboutBtn: document.getElementById('openAboutBtn'),
    aboutModal: document.getElementById('aboutModal'),
    closeAboutBtn: document.getElementById('closeAboutBtn'),
    closeAboutOkBtn: document.getElementById('closeAboutOkBtn'),

    // Onboarding Tour Modal
    openTourBtn: document.getElementById('openTourBtn'),
    tourModal: document.getElementById('tourModal'),
    tourDots: document.getElementById('tourDots'),
    tourSlideContent: document.getElementById('tourSlideContent'),
    tourSkipBtn: document.getElementById('tourSkipBtn'),
    tourPrevBtn: document.getElementById('tourPrevBtn'),
    tourNextBtn: document.getElementById('tourNextBtn'),
    tourSetupRouteBtn: document.getElementById('tourSetupRouteBtn'),

    // What's New Modal
    whatsNewModal: document.getElementById('whatsNewModal'),
    whatsNewVersionSub: document.getElementById('whatsNewVersionSub'),
    whatsNewList: document.getElementById('whatsNewList'),
    hideWhatsNewCheckbox: document.getElementById('hideWhatsNewCheckbox'),
    closeWhatsNewBtn: document.getElementById('closeWhatsNewBtn'),
    closeWhatsNewOkBtn: document.getElementById('closeWhatsNewOkBtn'),

    // Toast
    toast: document.getElementById('toast'),
    toastText: document.getElementById('toastText'),
    toastUndoBtn: document.getElementById('toastUndoBtn'),
  };

  // ---------- Storage Helpers ----------
  function makeId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function loadStorage() {
    try {
      const savedLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
      if (savedLogs) {
        const parsed = JSON.parse(savedLogs);
        if (Array.isArray(parsed)) logs = parsed;
      }

      const savedActive = localStorage.getItem(STORAGE_KEYS.ACTIVE);
      if (savedActive) {
        const parsedActive = JSON.parse(savedActive);
        if (parsedActive && parsedActive.startIso) activeSession = parsedActive;
      }

      const savedRoutes = localStorage.getItem(STORAGE_KEYS.ROUTES);
      if (savedRoutes) {
        const parsedRoutes = JSON.parse(savedRoutes);
        if (Array.isArray(parsedRoutes)) routes = parsedRoutes;
      } else {
        // Migrate v1 single settings if present
        const legacy = localStorage.getItem(STORAGE_KEYS.SETTINGS_V1);
        if (legacy) {
          const s = JSON.parse(legacy);
          if (s && (s.line || s.operator || s.stopCode)) {
            routes = [{
              id: makeId('route'),
              line: (s.line || '').trim(),
              operator: (s.operator || '').trim(),
              stopCode: (s.stopCode || '').trim(),
              stopName: '',
              direction: '',
              label: '',
            }];
            saveRoutes();
          }
        }
      }

      const savedActiveRouteId = localStorage.getItem(STORAGE_KEYS.ACTIVE_ROUTE_ID);
      if (savedActiveRouteId && routes.some((r) => r.id === savedActiveRouteId)) {
        activeRouteId = savedActiveRouteId;
      } else if (routes.length > 0) {
        activeRouteId = routes[0].id;
      }

      const savedProfile = localStorage.getItem(STORAGE_KEYS.PROFILE);
      if (savedProfile) {
        const p = JSON.parse(savedProfile);
        profile = {
          fullName: p.fullName || '',
          idNumber: p.idNumber || '',
          phone: p.phone || '',
          address: p.address || '',
        };
      }

      const savedPrefs = localStorage.getItem(STORAGE_KEYS.PREFS);
      if (savedPrefs) {
        const pr = JSON.parse(savedPrefs);
        const minVal = Number(pr && pr.minDelayMinutes);
        if (!Number.isNaN(minVal) && minVal >= 0 && minVal <= 120) {
          prefs.minDelayMinutes = Math.round(minVal);
        }
      }
    } catch (err) {
      console.error('Error loading storage:', err);
    }
  }

  function saveLogs() {
    try {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
    } catch {
      showToast('שגיאה בשמירת התיעודים במכשיר');
    }
  }

  function saveActiveSession() {
    try {
      if (activeSession) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE, JSON.stringify(activeSession));
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE);
      }
    } catch (err) {
      console.error('Error saving active session:', err);
    }
  }

  function saveRoutes() {
    try {
      localStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(routes));
      if (activeRouteId) {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_ROUTE_ID, activeRouteId);
      } else {
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_ROUTE_ID);
      }
    } catch {
      showToast('שגיאה בשמירת הקווים');
    }
  }

  function saveProfile() {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
    } catch (err) {
      console.error('Error saving profile:', err);
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEYS.PREFS, JSON.stringify(prefs));
    } catch (err) {
      console.error('Error saving prefs:', err);
    }
  }

  function getActiveRoute() {
    return routes.find((r) => r.id === activeRouteId) || null;
  }

  function formatRouteShort(route) {
    if (!route) return 'ללא קו מוגדר';
    const parts = [];
    if (route.line) parts.push(`קו ${route.line}`);
    if (route.label) parts.push(route.label);
    else if (route.operator) parts.push(route.operator);
    if (route.stopCode && !route.label) parts.push(`תחנה ${route.stopCode}`);
    return parts.join(' • ') || 'קו שמור';
  }

  function formatRouteFull(entry) {
    const parts = [];
    if (entry.line) parts.push(`קו ${entry.line}`);
    if (entry.operator) parts.push(entry.operator);
    if (entry.stopCode) parts.push(`תחנה ${entry.stopCode}`);
    if (entry.stopName) parts.push(entry.stopName);
    if (entry.direction) parts.push(`כיוון ${entry.direction}`);
    return parts.join(' • ');
  }

  // ---------- Formatting Utilities ----------
  function pad2(num) {
    return String(num).padStart(2, '0');
  }

  function formatTimeHHMM(date) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  function formatTimeHHMMSS(date) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }

  function formatDateDDMMYYYY(date) {
    return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
  }

  function formatDateInput(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function getHebrewDay(date) {
    return HEBREW_DAYS[date.getDay()] || '';
  }

  function formatTimerDuration(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    return hrs > 0 ? `${pad2(hrs)}:${pad2(mins)}:${pad2(secs)}` : `${pad2(mins)}:${pad2(secs)}`;
  }

  function formatWaitMinutesLabel(waitMinutes) {
    if (waitMinutes < 1) return 'פחות מדקה';
    return `${Math.round(waitMinutes)} דק'`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeCsvField(val) {
    const str = String(val === null || val === undefined ? '' : val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fallback below
      }
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  // ---------- Toast ----------
  function hideToast() {
    el.toast.classList.remove('visible', 'interactive');
  }

  function showToast(message, options = {}) {
    const { showUndo = false, duration = 2800 } = options;
    el.toastText.textContent = message;

    if (showUndo) {
      el.toastUndoBtn.classList.remove('hidden');
      el.toast.classList.add('interactive');
    } else {
      el.toastUndoBtn.classList.add('hidden');
      el.toast.classList.remove('interactive');
      lastDeletedEntry = null;
    }

    el.toast.classList.add('visible');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      hideToast();
      if (showUndo) lastDeletedEntry = null;
    }, duration);
  }

  // ---------- Confirm Modal ----------
  function openConfirmModal(title, message, onConfirm, okLabel = 'אישור') {
    el.confirmTitle.textContent = title;
    el.confirmMessage.textContent = message;
    el.confirmOkBtn.textContent = okLabel;
    pendingConfirmCallback = onConfirm;
    el.confirmModal.classList.remove('hidden');
  }

  function closeConfirmModal() {
    el.confirmModal.classList.add('hidden');
    pendingConfirmCallback = null;
  }

  // ---------- Rendering ----------
  function renderRoutesBar() {
    const chips = routes.map((r) => {
      const isActive = r.id === activeRouteId;
      return `<button type="button" class="route-chip ${isActive ? 'active' : ''}" data-select-route="${escapeHtml(r.id)}">${escapeHtml(formatRouteShort(r))}</button>`;
    });

    chips.push(
      `<button type="button" class="route-chip add-route" data-add-route="1">+ ${routes.length === 0 ? 'הגדר קו ותחנה' : 'ניהול קווים'}</button>`
    );

    el.routesBar.innerHTML = chips.join('');

    const active = getActiveRoute();
    el.startBtnRouteHint.textContent = active
      ? `תיעוד עבור: ${formatRouteShort(active)}`
      : 'שומר שעת התחלה מדויקת אוטומטית';
  }

  function updateLiveClock() {
    const now = new Date();
    el.liveClock.textContent = `${formatDateDDMMYYYY(now)} • ${formatTimeHHMM(now)}`;
  }

  function updateActiveTimerDisplay() {
    if (!activeSession) return;
    const startDate = new Date(activeSession.startIso);
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 1000));
    const elapsedMin = elapsedSec / 60;

    el.liveTimer.textContent = formatTimerDuration(elapsedSec);
    el.liveTimer.classList.remove('warn', 'danger');

    const minDelay = prefs.minDelayMinutes;
    const dangerThreshold = Math.max(minDelay + 10, 20);

    if (elapsedMin >= dangerThreshold) {
      el.liveTimer.classList.add('danger');
      el.timerSubtext.textContent = `המתנה חריגה (מעל ${dangerThreshold} דקות) • יישמר בהיסטוריה`;
    } else if (minDelay > 0 && elapsedMin >= minDelay) {
      el.liveTimer.classList.add('warn');
      el.timerSubtext.textContent = `עבר את סף האיחור (${minDelay} דק') • יישמר בהיסטוריה`;
    } else if (minDelay > 0) {
      el.timerSubtext.textContent = `זמן המתנה נוכחי • סף תיעוד איחור: ${minDelay} דק'`;
    } else {
      el.timerSubtext.textContent = 'זמן המתנה נוכחי (דקות:שניות)';
    }
  }

  function renderActionState() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    if (activeSession) {
      el.idleView.classList.add('hidden');
      el.waitingView.classList.remove('hidden');

      const startDate = new Date(activeSession.startIso);
      el.waitStartTimeText.textContent = formatTimeHHMMSS(startDate);
      el.activeNoteInput.value = activeSession.note || '';
      updateActiveTimerDisplay();
      timerInterval = setInterval(updateActiveTimerDisplay, 1000);
    } else {
      el.waitingView.classList.add('hidden');
      el.idleView.classList.remove('hidden');
      updateLiveClock();
    }
  }

  function renderStats() {
    const total = logs.length;
    el.statTotal.textContent = String(total);

    if (total === 0) {
      el.statAvg.textContent = '-';
      el.statMax.textContent = '-';
      el.statGaveUp.textContent = '0';
      return;
    }

    let sumMin = 0;
    let maxMin = 0;
    let gaveUpCount = 0;
    logs.forEach((item) => {
      const m = typeof item.waitMinutes === 'number' ? item.waitMinutes : 0;
      sumMin += m;
      if (m > maxMin) maxMin = m;
      if (item.status === 'gave_up') gaveUpCount += 1;
    });

    el.statAvg.textContent = `${(sumMin / total).toFixed(1)} דק'`;
    el.statMax.textContent = `${Math.round(maxMin)} דק'`;
    el.statGaveUp.textContent = String(gaveUpCount);
  }

  function renderLogs() {
    const hasLogs = logs.length > 0;
    el.exportCsvBtn.disabled = !hasLogs;
    el.copySummaryBtn.disabled = !hasLogs;
    el.openComplaintBtn.disabled = !hasLogs;

    const unreportedCount = logs.filter((l) => !l.reportedAt).length;
    el.complaintCtaSub.textContent = hasLogs
      ? unreportedCount > 0
        ? `${unreportedCount} תיעודים שטרם דווחו • מייל מוכן או gov.il`
        : 'כל התיעודים סומנו כדווחים • ניתן להגיש שוב או לייצא'
      : 'מכין נוסח רשמי מוכן לשליחה מכל התיעודים';

    if (!hasLogs) {
      el.logsList.innerHTML = '';
      el.clearAllWrapper.classList.add('hidden');
      el.emptyState.classList.remove('hidden');
      renderStats();
      return;
    }

    el.emptyState.classList.add('hidden');
    el.clearAllWrapper.classList.remove('hidden');

    const sorted = [...logs].sort((a, b) => new Date(b.startIso) - new Date(a.startIso));

    el.logsList.innerHTML = sorted.map((entry) => {
      const s = new Date(entry.startIso);
      const e = new Date(entry.endIso);
      const waitMin = entry.waitMinutes || 0;

      let durClass = '';
      if (waitMin >= 20) durClass = 'danger';
      else if (waitMin >= 12) durClass = 'warn';

      const statusBadge = entry.status === 'arrived'
        ? '<span class="badge badge-emerald">הגיע</span>'
        : '<span class="badge badge-amber">ויתרתי / חלופה</span>';

      const issueBadge = entry.issueType
        ? `<span class="badge badge-rose">${escapeHtml(entry.issueType)}</span>`
        : '';

      const reportedBadge = entry.reportedAt
        ? '<span class="badge badge-indigo">דווח ✓</span>'
        : '';

      const routeLine = formatRouteFull(entry);
      const routeHtml = routeLine
        ? `<div class="log-route-tag">${escapeHtml(routeLine)}</div>`
        : '';

      const noteHtml = entry.note && entry.note.trim()
        ? `<p class="log-note">${escapeHtml(entry.note.trim())}</p>`
        : '';

      const isVerifying = verifyingLogIds.has(entry.id);
      let openBusHtml = '';
      if (entry.openBus) {
        const ob = entry.openBus;
        let boxClass = 'neutral';
        let summaryText = '';
        const scopeLabel = ob.stopLevel && entry.stopCode
          ? `לתחנה ${entry.stopCode} (${ob.windowLabel})`
          : `(${ob.windowLabel})`;

        if (ob.plannedCount === 0) {
          summaryText = `אימות OpenBus ${scopeLabel}: לא נמצאו נסיעות מתוכננות בלו"ז בטווח זה.`;
        } else if (ob.missingCount > 0) {
          boxClass = 'missing';
          const timesLabel = ob.stopLevel ? 'הגעות חסרות לתחנה' : 'יציאות חסרות';
          const timesStr = ob.missingTimes && ob.missingTimes.length ? ` (${timesLabel}: ${ob.missingTimes.join(', ')})` : '';
          summaryText = `אימות OpenBus ${scopeLabel}: מתוך ${ob.plannedCount} נסיעות מתוכננות, ${ob.missingCount} לא תועדו ב-GPS${timesStr}.`;
        } else {
          boxClass = 'ok';
          const plannedStr = ob.stopLevel && ob.plannedTimes && ob.plannedTimes.length
            ? ` (${ob.plannedTimes.join(', ')})`
            : '';
          summaryText = `אימות OpenBus ${scopeLabel}: כל ${ob.plannedCount} הנסיעות המתוכננות${plannedStr} תועדו ב-GPS (ייתכן איחור או עומס).`;
        }
        const staleHint = ob.isSameDay && ob.executedCount === 0 && ob.plannedCount > 0
          ? ' • שים לב: נתוני היום מתעדכנים לעיתים רק לאחר מספר שעות.'
          : '';
        openBusHtml = `
          <div class="openbus-box ${boxClass}">
            <div><strong>${escapeHtml(summaryText)}</strong>${escapeHtml(staleHint)}</div>
            <a class="openbus-link" href="${escapeHtml(ob.databusUrl || DATABUS_WEB_URL)}" target="_blank" rel="noopener noreferrer">פתח נתוני אמת בדאטאבוס ↗</a>
          </div>
        `;
      }

      const verifyBtnHtml = entry.line
        ? `<button type="button" class="mini-btn" style="color:var(--emerald);" data-verify-id="${escapeHtml(entry.id)}" ${isVerifying ? 'disabled' : ''}>${isVerifying ? '⏳ בודק...' : (entry.openBus ? '↻ אמת שוב' : '🔍 אמת מול OpenBus')}</button>`
        : '';

      return `
        <article class="log-card">
          <div class="log-top">
            <div class="log-meta">
              <div class="log-badges">
                <span class="log-date tabular">${formatDateDDMMYYYY(s)}</span>
                <span class="log-day">${getHebrewDay(s)}</span>
                ${statusBadge}
                ${issueBadge}
                ${reportedBadge}
              </div>
              <div class="log-times">
                <span>שעות:</span>
                <strong class="tabular ltr">${formatTimeHHMM(s)} → ${formatTimeHHMM(e)}</strong>
              </div>
              ${routeHtml}
            </div>
            <div class="log-right">
              <span class="duration-pill tabular ${durClass}">${formatWaitMinutesLabel(waitMin)}</span>
            </div>
          </div>
          ${noteHtml}
          ${openBusHtml}
          <div class="log-footer">
            <div class="log-mini-actions">
              <button type="button" class="mini-btn" style="color:var(--primary);" data-complain-id="${escapeHtml(entry.id)}">
                ✉ תלונה
              </button>
              ${verifyBtnHtml}
            </div>
            <div class="log-mini-actions">
              <button type="button" class="mini-icon-btn" data-edit-id="${escapeHtml(entry.id)}" aria-label="ערוך תיעוד" title="ערוך תיעוד">${ICON_PENCIL}</button>
              <button type="button" class="mini-icon-btn danger" data-delete-id="${escapeHtml(entry.id)}" aria-label="מחק תיעוד" title="מחק תיעוד">${ICON_TRASH}</button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    renderStats();
  }

  // ---------- Core Wait Actions ----------
  function startWaiting() {
    const active = getActiveRoute();
    activeSession = {
      startIso: new Date().toISOString(),
      note: '',
      issueType: '',
      routeSnapshot: active ? { ...active } : null,
    };
    saveActiveSession();
    renderActionState();
    showToast('המדידה התחילה – שעת ההגעה נשמרה');
  }

  function finishWaiting(status) {
    if (!activeSession) return;
    const startDate = new Date(activeSession.startIso);
    const endDate = new Date();
    const diffSeconds = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
    const waitMinutes = Number((diffSeconds / 60).toFixed(1));

    if (prefs.minDelayMinutes > 0 && waitMinutes < prefs.minDelayMinutes) {
      activeSession = null;
      saveActiveSession();
      renderActionState();
      showToast(
        `ההמתנה (${formatWaitMinutesLabel(waitMinutes)}) קצרה מסף האיחור (${prefs.minDelayMinutes} דק') ולכן לא נשמרה`,
        { duration: 4200 }
      );
      return;
    }

    const route = activeSession.routeSnapshot || getActiveRoute() || {};

    const newEntry = {
      id: makeId('log'),
      startIso: startDate.toISOString(),
      endIso: endDate.toISOString(),
      waitSeconds: diffSeconds,
      waitMinutes,
      status,
      issueType: activeSession.issueType || '',
      note: (el.activeNoteInput.value || '').trim(),
      line: route.line || '',
      operator: route.operator || '',
      stopCode: route.stopCode || '',
      stopName: route.stopName || '',
      direction: route.direction || '',
      lineRef: route.lineRef || null,
      reportedAt: null,
    };

    logs.unshift(newEntry);
    activeSession = null;
    saveLogs();
    saveActiveSession();
    renderActionState();
    renderLogs();
    showToast(status === 'arrived' ? 'התיעוד נשמר בהצלחה!' : 'תיעוד הוויתור נשמר בהצלחה');
  }

  function requestCancelWaiting() {
    if (!activeSession) return;
    openConfirmModal(
      'ביטול מדידה פעילה',
      'האם לבטל את המדידה הנוכחית בלי לשמור אותה בהיסטוריה?',
      () => {
        activeSession = null;
        saveActiveSession();
        renderActionState();
        showToast('המדידה בוטלה');
      },
      'בטל מדידה'
    );
  }

  function deleteSingleLogWithUndo(id) {
    const index = logs.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [removed] = logs.splice(index, 1);
    lastDeletedEntry = { entry: removed, index };
    saveLogs();
    renderLogs();
    showToast('הרשומה נמחקה', { showUndo: true, duration: 5000 });
  }

  function undoLastDelete() {
    if (!lastDeletedEntry) return;
    const { entry, index } = lastDeletedEntry;
    logs.splice(Math.min(index, logs.length), 0, entry);
    lastDeletedEntry = null;
    saveLogs();
    renderLogs();
    showToast('הרשומה שוחזרה');
  }

  function requestClearAllLogs() {
    if (logs.length === 0) return;
    openConfirmModal(
      'ניקוי כל ההיסטוריה',
      `האם למחוק לצמיתות את כל ${logs.length} הרשומות שנשמרו? פעולה זו אינה ניתנת לביטול.`,
      () => {
        logs = [];
        lastDeletedEntry = null;
        saveLogs();
        renderLogs();
        showToast('כל ההיסטוריה נמחקה');
      },
      'מחק הכל'
    );
  }

  // ---------- Settings / Routes Modal ----------
  function renderSavedRoutesList() {
    if (routes.length === 0) {
      el.savedRoutesList.innerHTML = '<p class="modal-sub" style="margin:0;">עדיין לא הוגדרו קווים. הוסף קו למטה כדי לחסוך הקלדה בכל תיעוד.</p>';
      return;
    }

    el.savedRoutesList.innerHTML = routes.map((r) => `
      <div class="saved-route-row">
        <div>
          <strong>${escapeHtml(formatRouteShort(r))}</strong>
          <div style="font-size:0.72rem;color:var(--text-muted);">${escapeHtml(formatRouteFull(r))}</div>
        </div>
        <div class="log-mini-actions">
          <button type="button" class="mini-icon-btn" data-edit-route="${escapeHtml(r.id)}" aria-label="ערוך קו" title="ערוך קו">${ICON_PENCIL}</button>
          <button type="button" class="mini-icon-btn danger" data-delete-route="${escapeHtml(r.id)}" aria-label="מחק קו" title="מחק קו">${ICON_TRASH}</button>
        </div>
      </div>
    `).join('');
  }

  function resetRouteForm() {
    el.editingRouteId.value = '';
    el.routeLineRef.value = '';
    el.routeForm.reset();
    el.saveRouteBtn.textContent = 'הוסף ושמור קו';
    el.resetRouteFormBtn.classList.add('hidden');
    clearStopLookupUI();
  }

  let lastFoundStopLines = [];

  function clearStopLookupUI() {
    lastFoundStopLines = [];
    el.stopLookupStatus.textContent = '';
    el.stopLookupStatus.classList.add('hidden');
    el.stopLinesFilter.value = '';
    el.stopLinesFilter.classList.add('hidden');
    el.nearbyStopsList.innerHTML = '';
    el.nearbyStopsList.classList.add('hidden');
    el.stopLinesList.innerHTML = '';
    el.stopLinesList.classList.add('hidden');
  }

  function renderStopLinesList(filterQuery = '') {
    const q = filterQuery.trim().toLowerCase();
    const filtered = q
      ? lastFoundStopLines.filter(
          (item) =>
            item.line.toLowerCase().includes(q) ||
            item.operator.toLowerCase().includes(q) ||
            item.direction.toLowerCase().includes(q)
        )
      : lastFoundStopLines;

    if (filtered.length === 0) {
      el.stopLinesList.innerHTML = '<div class="lookup-status" style="padding:6px 4px;">לא נמצא קו תואם ברשימה – אפשר להקליד ידנית למטה.</div>';
      return;
    }

    el.stopLinesList.innerHTML = filtered.map((item) => `
      <button
        type="button"
        class="lookup-item"
        data-pick-line="${escapeHtml(item.line)}"
        data-pick-operator="${escapeHtml(item.operator)}"
        data-pick-direction="${escapeHtml(item.direction)}"
        data-pick-lineref="${escapeHtml(String(item.lineRef || ''))}"
      >
        <span class="lookup-item-main">
          <strong>קו ${escapeHtml(item.line)} • ${escapeHtml(item.operator)}</strong>
          ${item.direction ? `<span class="lookup-item-sub">כיוון: ${escapeHtml(item.direction)}</span>` : ''}
        </span>
        <span class="badge badge-indigo">בחר</span>
      </button>
    `).join('');
  }

  function extractDirectionFromLongName(longName) {
    if (!longName) return '';
    const parts = String(longName).split('<->');
    const rawDest = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
    return rawDest.replace(/-\d+[א-תa-zA-Z]*$/, '').trim();
  }

  function getRecentWeekdayDateStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    while (d.getDay() === 5 || d.getDay() === 6) {
      d.setDate(d.getDate() - 1);
    }
    return formatDateInput(d);
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  async function lookupStopByCode(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) {
      showToast('נא להקליד מספר תחנה (למשל 1616)');
      return;
    }

    el.stopLookupStatus.textContent = '⏳ מאתר תחנה וקווים ב-OpenBus...';
    el.stopLookupStatus.classList.remove('hidden');
    el.stopLinesFilter.value = '';
    el.stopLinesFilter.classList.add('hidden');
    el.stopLinesList.innerHTML = '';
    el.stopLinesList.classList.add('hidden');
    el.lookupStopBtn.disabled = true;

    try {
      const refDate = getRecentWeekdayDateStr();

      // Step 1: Resolve exact indexed gtfs_stop_id for refDate (fast, ~200ms)
      const stopParams = new URLSearchParams({
        limit: '1',
        code,
        date_from: refDate,
        date_to: refDate,
      });
      const stopRes = await fetch(`${OPENBUS_API_BASE}/gtfs_stops/list?${stopParams.toString()}`);
      if (!stopRes.ok) throw new Error('OpenBus stop lookup error');
      const stopsData = await stopRes.json();

      if (!Array.isArray(stopsData) || stopsData.length === 0) {
        el.stopLookupStatus.textContent = `לא נמצאה תחנה מספר ${code}. בדוק את המספר או הזן ידנית למטה.`;
        return;
      }

      const stop = stopsData[0];
      const fullStopName = [stop.name, stop.city].filter(Boolean).join(', ');
      el.routeStopName.value = fullStopName;

      // Step 2: Query gtfs_ride_stops by indexed gtfs_stop_ids on a 3-hour afternoon peak window (fast & complete)
      const fetchLinesInWindow = async (fromIso, toIso) => {
        const ridesParams = new URLSearchParams({
          limit: '500',
          gtfs_stop_ids: String(stop.id),
          arrival_time_from: fromIso,
          arrival_time_to: toIso,
        });
        const ridesRes = await fetch(`${OPENBUS_API_BASE}/gtfs_ride_stops/list?${ridesParams.toString()}`);
        if (!ridesRes.ok) throw new Error('OpenBus rides lookup error');
        return ridesRes.json();
      };

      let ridesData = await fetchLinesInWindow(`${refDate}T13:00:00Z`, `${refDate}T16:30:00Z`);
      if (!Array.isArray(ridesData) || ridesData.length === 0) {
        // Fallback for morning/night-only stops
        ridesData = await fetchLinesInWindow(`${refDate}T04:00:00Z`, `${refDate}T22:00:00Z`);
      }

      const lineMap = new Map();
      (Array.isArray(ridesData) ? ridesData : []).forEach((row) => {
        const lineNum = String(row.gtfs_route__route_short_name || '').trim();
        const agency = String(row.gtfs_route__agency_name || '').trim();
        const lineRef = row.gtfs_route__line_ref || '';
        const direction = extractDirectionFromLongName(row.gtfs_route__route_long_name);
        if (!lineNum) return;
        const key = `${lineRef || lineNum}|${agency}|${direction}`;
        if (!lineMap.has(key)) {
          lineMap.set(key, { line: lineNum, operator: agency, direction, lineRef });
        }
      });

      lastFoundStopLines = [...lineMap.values()].sort((a, b) => {
        const na = parseInt(a.line, 10);
        const nb = parseInt(b.line, 10);
        if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
        return a.line.localeCompare(b.line, 'he');
      });

      if (lastFoundStopLines.length === 0) {
        el.stopLookupStatus.textContent = `נמצאה תחנה: ${fullStopName} (לא נמצאו קווים – ניתן להזין מספר קו ידנית למטה).`;
        return;
      }

      el.stopLookupStatus.textContent = `נמצאה תחנה: ${fullStopName} • נמצאו ${lastFoundStopLines.length} קווים (או הזן ידנית למטה):`;
      if (lastFoundStopLines.length > 5) {
        el.stopLinesFilter.classList.remove('hidden');
      }
      renderStopLinesList('');
      el.stopLinesList.classList.remove('hidden');
    } catch (err) {
      console.error('Stop lookup failed:', err);
      el.stopLookupStatus.textContent = 'לא ניתן להתחבר כרגע ל-OpenBus (בדוק חיבור אינטרנט או הזן ידנית).';
    } finally {
      el.lookupStopBtn.disabled = false;
    }
  }

  async function findNearbyStops() {
    if (!navigator.geolocation) {
      showToast('הדפדפן אינו תומך באיתור מיקום');
      return;
    }

    el.stopLookupStatus.textContent = '📍 מאתר מיקום ותחנות קרובות...';
    el.stopLookupStatus.classList.remove('hidden');
    el.nearbyStopsList.innerHTML = '';
    el.nearbyStopsList.classList.add('hidden');
    el.stopLinesList.classList.add('hidden');
    el.nearbyStopsBtn.disabled = true;

    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        });
      });

      const { latitude: lat, longitude: lon } = pos.coords;

      const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&accept-language=he`;
      const geoRes = await fetch(geoUrl);
      if (!geoRes.ok) throw new Error('Reverse geocode error');
      const geoData = await geoRes.json();
      const addr = geoData.address || {};
      const city = addr.city || addr.town || addr.village || addr.municipality || '';
      if (!city) throw new Error('City not detected');

      const refDate = getRecentWeekdayDateStr();
      const todayStr = formatDateInput(new Date());
      const stopsParams = new URLSearchParams({
        limit: '3000',
        city,
        date_from: refDate,
        date_to: todayStr,
      });
      const stopsRes = await fetch(`${OPENBUS_API_BASE}/gtfs_stops/list?${stopsParams.toString()}`);
      if (!stopsRes.ok) throw new Error('OpenBus city stops error');
      const stopsData = await stopsRes.json();

      const seen = new Map();
      (Array.isArray(stopsData) ? stopsData : []).forEach((s) => {
        if (!s.code || !s.lat || !s.lon || seen.has(s.code)) return;
        const dist = haversineMeters(lat, lon, s.lat, s.lon);
        seen.set(s.code, { ...s, dist });
      });

      const nearest = [...seen.values()].sort((a, b) => a.dist - b.dist).slice(0, 6);
      if (nearest.length === 0) {
        el.stopLookupStatus.textContent = `לא נמצאו תחנות קרובות ב-${city}. ניתן להקליד מספר תחנה ישירות.`;
        return;
      }

      el.stopLookupStatus.textContent = `תחנות קרובות אליך (${city}) – לחץ על תחנה להצגת הקווים:`;
      el.nearbyStopsList.innerHTML = nearest.map((s) => `
        <button
          type="button"
          class="lookup-item"
          data-pick-stop-code="${escapeHtml(String(s.code))}"
          data-pick-stop-name="${escapeHtml([s.name, s.city].filter(Boolean).join(', '))}"
        >
          <span class="lookup-item-main">
            <strong>${escapeHtml(s.name)}</strong>
            <span class="lookup-item-sub">מספר תחנה ${escapeHtml(String(s.code))} • ${escapeHtml(s.city || '')}</span>
          </span>
          <span class="badge badge-slate tabular">${Math.round(s.dist)} מ'</span>
        </button>
      `).join('');
      el.nearbyStopsList.classList.remove('hidden');
    } catch (err) {
      console.error('Nearby stops failed:', err);
      if (err && err.code === 1) {
        el.stopLookupStatus.textContent = 'הרשאת המיקום לא אושרה – אפשר פשוט להקליד מספר תחנה למעלה.';
      } else {
        el.stopLookupStatus.textContent = 'לא הצלחנו לאתר תחנות קרובות כרגע – אפשר להקליד מספר תחנה ישירות.';
      }
    } finally {
      el.nearbyStopsBtn.disabled = false;
    }
  }

  function openSettingsModal() {
    el.minDelayInput.value = String(prefs.minDelayMinutes);
    renderSavedRoutesList();
    resetRouteForm();
    el.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    el.settingsModal.classList.add('hidden');
  }

  function handleRouteSubmit(e) {
    e.preventDefault();
    const editId = el.editingRouteId.value;
    const data = {
      line: el.routeLine.value.trim(),
      operator: el.routeOperator.value.trim(),
      stopCode: el.routeStopCode.value.trim(),
      label: el.routeLabel.value.trim(),
      stopName: el.routeStopName.value.trim(),
      direction: el.routeDirection.value.trim(),
      lineRef: el.routeLineRef.value ? Number(el.routeLineRef.value) || null : null,
    };

    if (!data.line || !data.operator) return;

    if (editId) {
      const idx = routes.findIndex((r) => r.id === editId);
      if (idx !== -1) routes[idx] = { ...routes[idx], ...data };
      showToast('הקו עודכן');
    } else {
      const newRoute = { id: makeId('route'), ...data };
      routes.push(newRoute);
      activeRouteId = newRoute.id;
      showToast('הקו נשמר והופעל');
    }

    saveRoutes();
    renderRoutesBar();
    renderSavedRoutesList();
    resetRouteForm();
  }

  // ---------- Backup & Restore JSON ----------
  function exportBackupJson() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      prefs,
      routes,
      activeRouteId,
      logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bus_wait_backup_${formatDateInput(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('קובץ הגיבוי הורד בהצלחה');
  }

  function handleRestoreJsonFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (!Array.isArray(parsed.logs)) throw new Error('invalid');

        // Merge without duplicating existing IDs
        const existingIds = new Set(logs.map((l) => l.id));
        let addedCount = 0;
        parsed.logs.forEach((item) => {
          if (item && item.id && item.startIso && item.endIso && !existingIds.has(item.id)) {
            logs.push(item);
            addedCount += 1;
          }
        });

        if (Array.isArray(parsed.routes)) {
          const existingRouteIds = new Set(routes.map((r) => r.id));
          parsed.routes.forEach((r) => {
            if (r && r.id && !existingRouteIds.has(r.id)) routes.push(r);
          });
          if (!activeRouteId && routes.length > 0) activeRouteId = routes[0].id;
          saveRoutes();
          renderRoutesBar();
          renderSavedRoutesList();
        }

        saveLogs();
        renderLogs();
        showToast(`שוחזרו ${addedCount} תיעודים חדשים מהגיבוי`);
      } catch {
        showToast('קובץ הגיבוי אינו תקין');
      } finally {
        el.restoreJsonInput.value = '';
      }
    };
    reader.readAsText(file);
  }

  // ---------- Manual / Edit Entry Modal ----------
  function populateManualRouteSelect(selectedRouteIdOrEntry) {
    const options = ['<option value="">ללא קו מוגדר</option>'];
    routes.forEach((r) => {
      options.push(`<option value="${escapeHtml(r.id)}">${escapeHtml(formatRouteShort(r))}</option>`);
    });
    el.manualRouteSelect.innerHTML = options.join('');

    if (typeof selectedRouteIdOrEntry === 'string' && routes.some((r) => r.id === selectedRouteIdOrEntry)) {
      el.manualRouteSelect.value = selectedRouteIdOrEntry;
    } else if (selectedRouteIdOrEntry && typeof selectedRouteIdOrEntry === 'object') {
      const match = routes.find(
        (r) => r.line === selectedRouteIdOrEntry.line && r.stopCode === selectedRouteIdOrEntry.stopCode
      );
      if (match) el.manualRouteSelect.value = match.id;
    }
  }

  function openManualModal(editLogId = null) {
    el.manualErrorMsg.classList.add('hidden');
    el.editingLogId.value = editLogId || '';

    if (editLogId) {
      const entry = logs.find((l) => l.id === editLogId);
      if (!entry) return;
      const s = new Date(entry.startIso);
      const e = new Date(entry.endIso);
      el.manualModalTitle.textContent = 'עריכת תיעוד';
      el.manualSubmitBtn.textContent = 'שמור שינויים';
      el.manualDate.value = formatDateInput(s);
      el.manualStartTime.value = formatTimeHHMM(s);
      el.manualEndTime.value = formatTimeHHMM(e);
      el.manualIssueType.value = entry.issueType || '';
      el.manualNote.value = entry.note || '';
      el.manualForm.querySelector(`input[name="manualStatus"][value="${entry.status}"]`).checked = true;
      populateManualRouteSelect(entry);
    } else {
      const now = new Date();
      const startDefault = new Date(now.getTime() - 15 * 60 * 1000);
      el.manualModalTitle.textContent = 'הוספת תיעוד ידני';
      el.manualSubmitBtn.textContent = 'הוסף תיעוד';
      el.manualDate.value = formatDateInput(now);
      el.manualStartTime.value = formatTimeHHMM(startDefault);
      el.manualEndTime.value = formatTimeHHMM(now);
      el.manualIssueType.value = '';
      el.manualNote.value = '';
      el.manualForm.querySelector('input[name="manualStatus"][value="arrived"]').checked = true;
      populateManualRouteSelect(activeRouteId);
    }

    el.manualModal.classList.remove('hidden');
  }

  function closeManualModal() {
    el.manualModal.classList.add('hidden');
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    el.manualErrorMsg.classList.add('hidden');

    const dateVal = el.manualDate.value;
    const startVal = el.manualStartTime.value;
    const endVal = el.manualEndTime.value;
    const statusVal = el.manualForm.querySelector('input[name="manualStatus"]:checked').value;
    const issueVal = el.manualIssueType.value;
    const noteVal = el.manualNote.value.trim();
    const editId = el.editingLogId.value;

    if (!dateVal || !startVal || !endVal) {
      el.manualErrorMsg.textContent = 'נא למלא תאריך, שעת הגעה ושעת סיום.';
      el.manualErrorMsg.classList.remove('hidden');
      return;
    }

    const startDate = new Date(`${dateVal}T${startVal}:00`);
    let endDate = new Date(`${dateVal}T${endVal}:00`);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      el.manualErrorMsg.textContent = 'תאריך או שעה לא תקינים.';
      el.manualErrorMsg.classList.remove('hidden');
      return;
    }

    // Handle midnight crossing (e.g. 23:50 -> 00:15)
    if (endDate <= startDate) {
      endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
    }

    const diffSeconds = Math.round((endDate.getTime() - startDate.getTime()) / 1000);
    if (diffSeconds > 12 * 3600) {
      el.manualErrorMsg.textContent = 'משך ההמתנה עולה על 12 שעות – אנא בדוק את שעת ההגעה והסיום.';
      el.manualErrorMsg.classList.remove('hidden');
      return;
    }

    const waitMinutes = Number((diffSeconds / 60).toFixed(1));

    if (!editId && prefs.minDelayMinutes > 0 && waitMinutes < prefs.minDelayMinutes) {
      el.manualErrorMsg.textContent = `ההמתנה (${formatWaitMinutesLabel(waitMinutes)}) קצרה מסף האיחור שהוגדר (${prefs.minDelayMinutes} דק') ולכן לא נשמרה. ניתן לשנות את הסף בהגדרות.`;
      el.manualErrorMsg.classList.remove('hidden');
      return;
    }

    const chosenRoute = routes.find((r) => r.id === el.manualRouteSelect.value) || null;

    if (editId) {
      const idx = logs.findIndex((l) => l.id === editId);
      if (idx !== -1) {
        const prev = logs[idx];
        logs[idx] = {
          ...prev,
          startIso: startDate.toISOString(),
          endIso: endDate.toISOString(),
          waitSeconds: diffSeconds,
          waitMinutes,
          status: statusVal,
          issueType: issueVal,
          note: noteVal,
          line: chosenRoute ? chosenRoute.line : prev.line,
          operator: chosenRoute ? chosenRoute.operator : prev.operator,
          stopCode: chosenRoute ? chosenRoute.stopCode : prev.stopCode,
          stopName: chosenRoute ? chosenRoute.stopName : prev.stopName,
          direction: chosenRoute ? chosenRoute.direction : prev.direction,
          lineRef: chosenRoute ? (chosenRoute.lineRef || null) : (prev.lineRef || null),
        };
      }
      showToast('התיעוד עודכן בהצלחה');
    } else {
      logs.unshift({
        id: makeId('log'),
        startIso: startDate.toISOString(),
        endIso: endDate.toISOString(),
        waitSeconds: diffSeconds,
        waitMinutes,
        status: statusVal,
        issueType: issueVal,
        note: noteVal,
        line: chosenRoute ? chosenRoute.line : '',
        operator: chosenRoute ? chosenRoute.operator : '',
        stopCode: chosenRoute ? chosenRoute.stopCode : '',
        stopName: chosenRoute ? chosenRoute.stopName : '',
        direction: chosenRoute ? chosenRoute.direction : '',
        lineRef: chosenRoute ? (chosenRoute.lineRef || null) : null,
        reportedAt: null,
      });
      showToast('התיעוד הידני נוסף בהצלחה');
    }

    saveLogs();
    renderLogs();
    closeManualModal();
  }

  // ---------- CSV Builder ----------
  function buildCsvContent(entries) {
    const sorted = [...entries].sort((a, b) => new Date(b.startIso) - new Date(a.startIso));
    const headers = [
      'Date',
      'Day',
      'Start_Time',
      'End_Time',
      'Wait_Minutes',
      'Status',
      'Issue_Type',
      'Line',
      'Operator',
      'Station_Code',
      'Station_Name',
      'Direction',
      'Note',
      'Reported',
      'OpenBus_Verification',
      'Start_ISO',
      'End_ISO',
    ];

    const rows = sorted.map((entry) => {
      const s = new Date(entry.startIso);
      const e = new Date(entry.endIso);
      const obStr = entry.openBus
        ? `מתוכנן: ${entry.openBus.plannedCount}, בוצע: ${entry.openBus.executedCount}, חסר: ${entry.openBus.missingCount}`
        : '';
      return [
        formatDateDDMMYYYY(s),
        getHebrewDay(s),
        formatTimeHHMMSS(s),
        formatTimeHHMMSS(e),
        entry.waitMinutes,
        entry.status === 'arrived' ? 'האוטובוס הגיע' : 'ויתרתי / חלופה',
        entry.issueType || '',
        entry.line || '',
        entry.operator || '',
        entry.stopCode || '',
        entry.stopName || '',
        entry.direction || '',
        entry.note || '',
        entry.reportedAt ? 'כן' : 'לא',
        obStr,
        entry.startIso,
        entry.endIso,
      ].map(escapeCsvField).join(',');
    });

    return '\uFEFF' + [headers.map(escapeCsvField).join(','), ...rows].join('\r\n');
  }

  function downloadCsv(entries, filenameSuffix = '') {
    if (!entries.length) return;
    const csvContent = buildCsvContent(entries);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bus_wait_log${filenameSuffix}_${formatDateInput(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('קובץ ה-CSV הורד בהצלחה');
  }

  // ---------- Complaint Wizard ----------
  function getSelectedComplaintEntries() {
    return logs
      .filter((l) => complaintSelectedIds.has(l.id))
      .sort((a, b) => new Date(b.startIso) - new Date(a.startIso));
  }

  function getPrimaryOperatorForEntries(entries) {
    const ops = entries.map((e) => e.operator).filter(Boolean);
    if (ops.length > 0) return ops[0];
    const active = getActiveRoute();
    return (active && active.operator) || '';
  }

  function getComplaintTarget() {
    const checked = document.querySelector('input[name="complaintTarget"]:checked');
    return checked ? checked.value : 'mot';
  }

  function buildComplaintSubject(entries) {
    const lines = [...new Set(entries.map((e) => e.line).filter(Boolean))];
    const op = getPrimaryOperatorForEntries(entries);
    const linePart = lines.length > 0 ? `קו ${lines.join(', ')}` : 'תחבורה ציבורית';
    const opPart = op ? ` (${op})` : '';
    return `תלונה על אי-ביצוע נסיעות וזמני המתנה חריגים – ${linePart}${opPart}`;
  }

  function buildComplaintLetter(entries, target) {
    if (entries.length === 0) return 'נא לבחור לפחות תיעוד אחד מהרשימה למעלה.';

    const op = getPrimaryOperatorForEntries(entries);
    const lines = [...new Set(entries.map((e) => e.line).filter(Boolean))];
    const stops = [...new Set(entries.map((e) => [e.stopCode ? `מספר תחנה ${e.stopCode}` : '', e.stopName].filter(Boolean).join(' – ')).filter(Boolean))];
    const directions = [...new Set(entries.map((e) => e.direction).filter(Boolean))];

    const total = entries.length;
    const avg = (entries.reduce((acc, i) => acc + (i.waitMinutes || 0), 0) / total).toFixed(1);
    const max = Math.round(Math.max(...entries.map((i) => i.waitMinutes || 0)));
    const gaveUp = entries.filter((i) => i.status === 'gave_up').length;

    const greeting = target === 'mot'
      ? 'לכבוד: הרשות הארצית לתחבורה ציבורית – משרד התחבורה,'
      : `לכבוד: פניות הציבור – חברת ${op || 'התחבורה הציבורית'},`;

    const metaLines = [];
    if (lines.length) metaLines.push(`מספר קו: ${lines.join(', ')}`);
    if (op) metaLines.push(`חברה מפעילה: ${op}`);
    if (stops.length) metaLines.push(`תחנה: ${stops.join(' | ')}`);
    if (directions.length) metaLines.push(`כיוון נסיעה: ${directions.join(' | ')}`);

    const bullets = entries.map((entry) => {
      const s = new Date(entry.startIso);
      const e = new Date(entry.endIso);
      const statusText = entry.status === 'arrived' ? 'האוטובוס הגיע באיחור' : 'ויתרתי / נסעתי בחלופה';
      const issuePart = entry.issueType ? ` [${entry.issueType}]` : '';
      const routeExtra = lines.length > 1 && entry.line ? ` (קו ${entry.line}${entry.stopCode ? `, תחנה ${entry.stopCode}` : ''})` : '';
      const notePart = entry.note ? ` | הערה: ${entry.note}` : '';
      let line = `• ${formatDateDDMMYYYY(s)} (${getHebrewDay(s)}): המתנה בין ${formatTimeHHMM(s)} ל-${formatTimeHHMM(e)} – סה"כ ${Math.round(entry.waitMinutes)} דקות (${statusText})${issuePart}${routeExtra}${notePart}`;
      if (entry.openBus && entry.openBus.plannedCount > 0) {
        const ob = entry.openBus;
        const scope = ob.stopLevel && entry.stopCode
          ? `תחנה ${entry.stopCode}, טווח ${ob.windowLabel}`
          : `טווח ${ob.windowLabel}`;
        const timesLabel = ob.stopLevel ? 'שעות הגעה חסרות לתחנה' : 'שעות יציאה חסרות';
        const timesStr = ob.missingTimes && ob.missingTimes.length ? ` (${timesLabel}: ${ob.missingTimes.join(', ')})` : '';
        line += `\n  ↳ אימות מול נתוני משרד התחבורה הפתוחים (OpenBus/דאטאבוס, ${scope}): מתוך ${ob.plannedCount} נסיעות מתוכננות, ${ob.missingCount} לא תועדו כבוצעו ב-GPS${timesStr}.`;
      }
      return line;
    });

    const hasOpenBus = entries.some((e) => e.openBus && e.openBus.plannedCount > 0);
    const openBusFootnote = hasOpenBus
      ? `\nמקור אימות הנסיעות: מאגר נתוני האמת הפתוח של משרד התחבורה (דאטאבוס / OpenBus): ${DATABUS_WEB_URL}`
      : '';

    const personalBlock = [
      'פרטי הפונה:',
      `שם מלא: ${profile.fullName || '_______________'}`,
      `תעודת זהות: ${profile.idNumber || '_______________'}`,
      `טלפון נייד: ${profile.phone || '_______________'}`,
      `כתובת: ${profile.address || '_______________'}`,
    ].join('\n');

    return [
      greeting,
      '',
      'שלום רב,',
      `ברצוני להגיש תלונה מתועדת בנוגע לזמני המתנה חריגים ושיבושים בשירות${lines.length ? ` בקו ${lines.join(', ')}` : ''}${op ? ` של חברת ${op}` : ''}.`,
      '',
      ...metaLines,
      `סיכום התיעודים: ${total} מקרים | ממוצע המתנה: ${avg} דק' | המתנה מרבית: ${max} דק' | ויתורים/חלופה: ${gaveUp}`,
      '',
      'פירוט המקרים (תועד בזמן אמת בתחנה):',
      ...bullets,
      ...(openBusFootnote ? [openBusFootnote] : []),
      '',
      'אבקש לבדוק את ביצוע הנסיעות המתוכננות במועדים אלו, לנקוט צעדי אכיפה/תיקון בהתאם, ולעדכן אותי במספר הפנייה ובממצאי הבדיקה.',
      '',
      personalBlock,
    ].join('\n');
  }

  function canShareCsvFile() {
    if (!navigator.share || !navigator.canShare) return false;
    try {
      const testFile = new File(['test'], 'test.csv', { type: 'text/csv' });
      return navigator.canShare({ files: [testFile] });
    } catch {
      return false;
    }
  }

  function updateComplaintWizardUI() {
    const entries = getSelectedComplaintEntries();
    const target = getComplaintTarget();
    const op = getPrimaryOperatorForEntries(entries);
    const opInfo = OPERATOR_DIRECTORY[op] || null;

    el.selectedLogsCount.textContent = String(entries.length);
    el.complaintOperatorLabel.textContent = op ? `חברת ${op}` : 'החברה המפעילה';

    // Check 60-day MOT window
    const nowMs = Date.now();
    const oldestDays = entries.reduce((maxDays, entry) => {
      const age = Math.floor((nowMs - new Date(entry.startIso).getTime()) / (1000 * 60 * 60 * 24));
      return Math.max(maxDays, age);
    }, 0);

    if (entries.length > 0 && oldestDays > 60) {
      el.complaintAgeWarning.textContent = `שים לב: התיעוד הישן ביותר שנבחר הוא מלפני ${oldestDays} ימים. משרד התחבורה מטפל בתלונות עד 60 יום ממועד האירוע.`;
      el.complaintAgeWarning.classList.remove('hidden');
    } else if (entries.length > 0 && oldestDays >= 50) {
      el.complaintAgeWarning.textContent = `תזכורת: אחד התיעודים הוא מלפני ${oldestDays} ימים – כדאי להגיש בקרוב (מגבלת משרד התחבורה היא 60 יום).`;
      el.complaintAgeWarning.classList.remove('hidden');
    } else {
      el.complaintAgeWarning.classList.add('hidden');
    }

    el.complaintPreview.value = buildComplaintLetter(entries, target);

    const hasMissingProfile = !(profile.fullName && profile.idNumber && profile.phone && profile.address);
    el.complaintMissingProfileHint.classList.toggle('hidden', !hasMissingProfile || entries.length === 0);

    const hasSelection = entries.length > 0;
    const recipientEmail = target === 'mot' ? MOT_EMAIL : (opInfo && opInfo.email) || '';
    const formUrl = target === 'mot' ? MOT_FORM_URL : (opInfo && opInfo.formUrl) || MOT_FORM_URL;

    if (recipientEmail) {
      el.sendEmailBtn.classList.remove('hidden');
      el.sendEmailBtn.disabled = !hasSelection;
      el.sendEmailBtnText.textContent = `פתח טיוטת מייל מוכנה (${recipientEmail})`;
    } else {
      el.sendEmailBtn.classList.add('hidden');
    }

    if (canShareCsvFile() && hasSelection) {
      el.shareWithCsvBtn.classList.remove('hidden');
      el.shareWithCsvBtn.disabled = false;
    } else {
      el.shareWithCsvBtn.classList.add('hidden');
    }

    el.copyAndOpenFormBtn.disabled = !hasSelection;
    el.copyAndOpenFormText.textContent = target === 'mot'
      ? 'העתק נוסח ופתח טופס gov.il'
      : opInfo && opInfo.formUrl
        ? `העתק נוסח ופתח טופס תלונה של ${op}`
        : 'העתק נוסח ופתח טופס תלונה';
    el.copyAndOpenFormBtn.dataset.formUrl = formUrl;

    el.downloadSelectedCsvBtn.disabled = !hasSelection;
    el.markReportedBtn.disabled = !hasSelection;
  }

  function renderComplaintChecklist() {
    const sorted = [...logs].sort((a, b) => new Date(b.startIso) - new Date(a.startIso));
    el.complaintLogsChecklist.innerHTML = sorted.map((entry) => {
      const s = new Date(entry.startIso);
      const checked = complaintSelectedIds.has(entry.id) ? 'checked' : '';
      const lineTag = entry.line ? `קו ${entry.line} • ` : '';
      const reportedTag = entry.reportedAt ? ' (דווח)' : '';
      return `
        <label class="check-item">
          <input type="checkbox" value="${escapeHtml(entry.id)}" ${checked} />
          <span><strong>${formatDateDDMMYYYY(s)} ${formatTimeHHMM(s)}</strong> • ${escapeHtml(lineTag)}${Math.round(entry.waitMinutes)} דק'${reportedTag}</span>
        </label>
      `;
    }).join('');
  }

  function openComplaintModal(singleLogId = null) {
    if (logs.length === 0) return;

    complaintSelectedIds.clear();
    if (singleLogId) {
      complaintSelectedIds.add(singleLogId);
    } else {
      const unreported = logs.filter((l) => !l.reportedAt);
      const initial = unreported.length > 0 ? unreported : logs;
      initial.forEach((l) => complaintSelectedIds.add(l.id));
    }

    el.profileFullName.value = profile.fullName;
    el.profileIdNumber.value = profile.idNumber;
    el.profilePhone.value = profile.phone;
    el.profileAddress.value = profile.address;

    renderComplaintChecklist();
    updateComplaintWizardUI();
    el.complaintModal.classList.remove('hidden');
  }

  function closeComplaintModal() {
    el.complaintModal.classList.add('hidden');
  }

  // ---------- OpenBus (Stride API) Verification ----------
  async function verifyLogWithOpenBus(logId) {
    const entry = logs.find((l) => l.id === logId);
    if (!entry) return;
    if (!entry.line) {
      showToast('כדי לאמת מול OpenBus יש להגדיר מספר קו');
      return;
    }

    verifyingLogIds.add(logId);
    renderLogs();

    try {
      const startDate = new Date(entry.startIso);
      const endDate = new Date(entry.endIso);
      const isSameDay = formatDateInput(startDate) === formatDateInput(new Date());

      const lineFilterParams = new URLSearchParams({ limit: '100' });
      if (entry.lineRef) {
        lineFilterParams.set('gtfs_route__line_refs', String(entry.lineRef));
      } else {
        lineFilterParams.set('gtfs_route__route_short_name', entry.line.trim());
        const opInfo = OPERATOR_DIRECTORY[entry.operator];
        if (opInfo && opInfo.operatorRefs) {
          lineFilterParams.set('gtfs_route__operator_refs', opInfo.operatorRefs);
        } else if (entry.operator) {
          lineFilterParams.set('gtfs_route__agency_name', entry.operator.trim());
        }
      }

      // Path A: Exact stop-level scheduled arrival check when stopCode is available
      if (entry.stopCode && entry.stopCode.trim()) {
        const stopRideParams = new URLSearchParams(lineFilterParams);
        stopRideParams.set('gtfs_stop__code', entry.stopCode.trim());
        stopRideParams.set('arrival_time_from', startDate.toISOString());
        stopRideParams.set('arrival_time_to', endDate.toISOString());

        const stopRes = await fetch(`${OPENBUS_API_BASE}/gtfs_ride_stops/list?${stopRideParams.toString()}`);
        if (!stopRes.ok) throw new Error('OpenBus stop rides error');
        let stopRides = await stopRes.json();
        if (!Array.isArray(stopRides)) stopRides = [];

        if (stopRides.length > 0) {
          // Determine origin departure window for these exact scheduled stop arrivals
          const originTimes = stopRides
            .map((r) => new Date(r.gtfs_ride__start_time).getTime())
            .filter((t) => !Number.isNaN(t));
          const siriFrom = originTimes.length
            ? new Date(Math.min(...originTimes) - 10 * 60 * 1000)
            : new Date(startDate.getTime() - 45 * 60 * 1000);
          const siriTo = originTimes.length
            ? new Date(Math.max(...originTimes) + 10 * 60 * 1000)
            : endDate;

          const siriParams = new URLSearchParams(lineFilterParams);
          siriParams.set('scheduled_start_time_from', siriFrom.toISOString());
          siriParams.set('scheduled_start_time_to', siriTo.toISOString());

          const siriRes = await fetch(`${OPENBUS_API_BASE}/siri_rides/list?${siriParams.toString()}`);
          if (!siriRes.ok) throw new Error('OpenBus SIRI error');
          let siriRides = await siriRes.json();
          if (!Array.isArray(siriRides)) siriRides = [];

          const observedGtfsIds = new Set(
            siriRides.map((r) => r.gtfs_ride_id || r.route_gtfs_ride_id).filter(Boolean)
          );
          const observedKeys = new Set(
            siriRides.map((r) => `${r.siri_route__line_ref || r.gtfs_route__line_ref}|${r.scheduled_start_time}`)
          );

          const plannedTimes = [...new Set(
            stopRides.map((r) => formatTimeHHMM(new Date(r.arrival_time))).sort()
          )];

          const missingStopRides = stopRides.filter((r) => {
            const key = `${r.gtfs_route__line_ref}|${r.gtfs_ride__start_time}`;
            return !observedGtfsIds.has(r.gtfs_ride_id) && !observedKeys.has(key);
          });

          const missingTimes = [...new Set(
            missingStopRides.map((r) => formatTimeHHMM(new Date(r.arrival_time))).sort()
          )];

          const plannedCount = stopRides.length;
          const missingCount = missingStopRides.length;
          const executedCount = Math.max(0, plannedCount - missingCount);

          entry.openBus = {
            checkedAt: new Date().toISOString(),
            stopLevel: true,
            plannedCount,
            executedCount,
            missingCount,
            plannedTimes,
            missingTimes,
            isSameDay,
            windowLabel: `${formatTimeHHMM(startDate)}–${formatTimeHHMM(endDate)}`,
            databusUrl: DATABUS_WEB_URL,
          };

          saveLogs();
          showToast(
            missingCount > 0
              ? `אומת לתחנה ${entry.stopCode}: ${missingCount} מתוך ${plannedCount} הגעות לא תועדו ב-GPS`
              : `אומת לתחנה ${entry.stopCode}: כל ${plannedCount} ההגעות המתוכננות תועדו ב-GPS`
          );
          return;
        }
      }

      // Path B: Fallback to origin-departure window (45 min lookback) when stopCode is missing or no stop rides found
      const windowStart = new Date(startDate.getTime() - 45 * 60 * 1000);
      const windowEnd = endDate;

      const gtfsParams = new URLSearchParams(lineFilterParams);
      gtfsParams.set('start_time_from', windowStart.toISOString());
      gtfsParams.set('start_time_to', windowEnd.toISOString());

      const siriParams = new URLSearchParams(lineFilterParams);
      siriParams.set('scheduled_start_time_from', windowStart.toISOString());
      siriParams.set('scheduled_start_time_to', windowEnd.toISOString());

      const [gtfsRes, siriRes] = await Promise.all([
        fetch(`${OPENBUS_API_BASE}/gtfs_rides/list?${gtfsParams.toString()}`),
        fetch(`${OPENBUS_API_BASE}/siri_rides/list?${siriParams.toString()}`),
      ]);

      if (!gtfsRes.ok || !siriRes.ok) {
        throw new Error('OpenBus API error');
      }

      let gtfsRides = await gtfsRes.json();
      let siriRides = await siriRes.json();

      if (!Array.isArray(gtfsRides)) gtfsRides = [];
      if (!Array.isArray(siriRides)) siriRides = [];

      if (!entry.lineRef && entry.direction && entry.direction.trim().length >= 2) {
        const dirNeedle = entry.direction.trim();
        const filteredGtfs = gtfsRides.filter((r) =>
          String(r.gtfs_route__route_long_name || '').includes(dirNeedle)
        );
        if (filteredGtfs.length > 0) {
          const allowedLineRefs = new Set(filteredGtfs.map((r) => r.gtfs_route__line_ref));
          gtfsRides = filteredGtfs;
          siriRides = siriRides.filter((r) => allowedLineRefs.has(r.gtfs_route__line_ref || r.siri_route__line_ref));
        }
      }

      const observedGtfsIds = new Set(
        siriRides.map((r) => r.gtfs_ride_id || r.route_gtfs_ride_id).filter(Boolean)
      );
      const observedKeys = new Set(
        siriRides.map((r) => `${r.siri_route__line_ref || r.gtfs_route__line_ref}|${r.scheduled_start_time}`)
      );

      const missingRides = [];
      gtfsRides.forEach((ride) => {
        const key = `${ride.gtfs_route__line_ref}|${ride.start_time}`;
        const matched = observedGtfsIds.has(ride.id) || observedKeys.has(key);
        if (!matched) missingRides.push(ride);
      });

      const missingTimes = [...new Set(
        missingRides
          .map((r) => formatTimeHHMM(new Date(r.start_time)))
          .sort()
      )];

      const plannedCount = gtfsRides.length;
      const missingCount = missingRides.length;
      const executedCount = Math.max(0, plannedCount - missingCount);

      entry.openBus = {
        checkedAt: new Date().toISOString(),
        stopLevel: false,
        plannedCount,
        executedCount,
        missingCount,
        missingTimes,
        isSameDay,
        windowLabel: `${formatTimeHHMM(windowStart)}–${formatTimeHHMM(windowEnd)}`,
        databusUrl: DATABUS_WEB_URL,
      };

      saveLogs();
      showToast(
        plannedCount === 0
          ? 'לא נמצאו נסיעות מתוכננות ב-OpenBus לטווח זה'
          : missingCount > 0
            ? `אומת מול OpenBus: ${missingCount} נסיעות לא תועדו ב-GPS`
            : 'אומת מול OpenBus: כל הנסיעות המתוכננות תועדו'
      );
    } catch (err) {
      console.error('OpenBus verification failed:', err);
      showToast('לא ניתן להתחבר כרגע ל-OpenBus (בדוק חיבור אינטרנט)');
    } finally {
      verifyingLogIds.delete(logId);
      renderLogs();
    }
  }

  // ---------- Event Binding ----------
  function bindEvents() {
    // Route switcher bar
    el.routesBar.addEventListener('click', (e) => {
      const selectBtn = e.target.closest('[data-select-route]');
      if (selectBtn) {
        activeRouteId = selectBtn.dataset.selectRoute;
        saveRoutes();
        renderRoutesBar();
        return;
      }
      if (e.target.closest('[data-add-route]')) {
        openSettingsModal();
      }
    });

    // Main wait actions
    el.startWaitBtn.addEventListener('click', startWaiting);
    el.busArrivedBtn.addEventListener('click', () => finishWaiting('arrived'));
    el.gaveUpBtn.addEventListener('click', () => finishWaiting('gave_up'));
    el.cancelWaitBtn.addEventListener('click', requestCancelWaiting);

    el.activeNoteInput.addEventListener('input', () => {
      if (activeSession) {
        activeSession.note = el.activeNoteInput.value;
        saveActiveSession();
      }
    });

    // Refresh timer immediately when returning from background / screen lock
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        updateLiveClock();
        if (activeSession) updateActiveTimerDisplay();
      }
    });

    // Settings Modal
    el.openSettingsBtn.addEventListener('click', openSettingsModal);
    el.closeSettingsBtn.addEventListener('click', closeSettingsModal);
    el.settingsModal.addEventListener('click', (e) => {
      if (e.target === el.settingsModal) closeSettingsModal();
    });
    el.minDelayInput.addEventListener('change', () => {
      const raw = Number(el.minDelayInput.value);
      const clamped = Number.isNaN(raw) ? 15 : Math.max(0, Math.min(120, Math.round(raw)));
      prefs.minDelayMinutes = clamped;
      el.minDelayInput.value = String(clamped);
      savePrefs();
      if (activeSession) updateActiveTimerDisplay();
      showToast(clamped === 0 ? 'כל זמני ההמתנה יישמרו (ללא סף מינימום)' : `סף האיחור עודכן ל-${clamped} דקות`);
    });
    el.routeForm.addEventListener('submit', handleRouteSubmit);
    el.resetRouteFormBtn.addEventListener('click', resetRouteForm);
    el.lookupStopBtn.addEventListener('click', () => lookupStopByCode(el.routeStopCode.value));
    el.nearbyStopsBtn.addEventListener('click', findNearbyStops);
    el.stopLinesFilter.addEventListener('input', () => renderStopLinesList(el.stopLinesFilter.value));

    el.routeLine.addEventListener('input', () => {
      el.routeLineRef.value = '';
    });

    el.nearbyStopsList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick-stop-code]');
      if (!btn) return;
      el.routeStopCode.value = btn.dataset.pickStopCode || '';
      el.routeStopName.value = btn.dataset.pickStopName || '';
      el.nearbyStopsList.classList.add('hidden');
      lookupStopByCode(el.routeStopCode.value);
    });

    el.stopLinesList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick-line]');
      if (!btn) return;
      el.routeLine.value = btn.dataset.pickLine || '';
      el.routeOperator.value = btn.dataset.pickOperator || '';
      el.routeDirection.value = btn.dataset.pickDirection || '';
      el.routeLineRef.value = btn.dataset.pickLineref || '';
      el.stopLinesList.classList.add('hidden');
      el.stopLinesFilter.classList.add('hidden');
      el.stopLookupStatus.textContent = `נבחר קו ${el.routeLine.value} (${el.routeOperator.value}) – לחץ "${el.saveRouteBtn.textContent}" לסיום.`;
      showToast(`פרטי קו ${el.routeLine.value} מולאו אוטומטית`);
    });

    el.savedRoutesList.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit-route]');
      if (editBtn) {
        const r = routes.find((item) => item.id === editBtn.dataset.editRoute);
        if (!r) return;
        clearStopLookupUI();
        el.editingRouteId.value = r.id;
        el.routeLineRef.value = r.lineRef ? String(r.lineRef) : '';
        el.routeLine.value = r.line;
        el.routeOperator.value = r.operator;
        el.routeStopCode.value = r.stopCode;
        el.routeLabel.value = r.label || '';
        el.routeStopName.value = r.stopName || '';
        el.routeDirection.value = r.direction || '';
        el.saveRouteBtn.textContent = 'עדכן קו';
        el.resetRouteFormBtn.classList.remove('hidden');
        return;
      }
      const delBtn = e.target.closest('[data-delete-route]');
      if (delBtn) {
        const id = delBtn.dataset.deleteRoute;
        routes = routes.filter((r) => r.id !== id);
        if (activeRouteId === id) activeRouteId = routes[0] ? routes[0].id : null;
        saveRoutes();
        renderRoutesBar();
        renderSavedRoutesList();
        showToast('הקו הוסר');
      }
    });

    el.backupJsonBtn.addEventListener('click', exportBackupJson);
    el.restoreJsonBtn.addEventListener('click', () => el.restoreJsonInput.click());
    el.restoreJsonInput.addEventListener('change', handleRestoreJsonFile);

    // Manual / Edit Modal
    el.openManualBtn.addEventListener('click', () => openManualModal(null));
    el.closeManualBtn.addEventListener('click', closeManualModal);
    el.cancelManualBtn.addEventListener('click', closeManualModal);
    el.manualModal.addEventListener('click', (e) => {
      if (e.target === el.manualModal) closeManualModal();
    });
    el.manualForm.addEventListener('submit', handleManualSubmit);

    // Complaint Wizard Modal
    el.openComplaintBtn.addEventListener('click', () => openComplaintModal(null));
    el.closeComplaintBtn.addEventListener('click', closeComplaintModal);
    el.complaintModal.addEventListener('click', (e) => {
      if (e.target === el.complaintModal) closeComplaintModal();
    });

    document.querySelectorAll('input[name="complaintTarget"]').forEach((radio) => {
      radio.addEventListener('change', updateComplaintWizardUI);
    });

    el.complaintLogsChecklist.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      if (e.target.checked) complaintSelectedIds.add(e.target.value);
      else complaintSelectedIds.delete(e.target.value);
      updateComplaintWizardUI();
    });

    el.toggleSelectUnreportedBtn.addEventListener('click', () => {
      const unreported = logs.filter((l) => !l.reportedAt);
      if (unreported.length === 0) {
        showToast('כל התיעודים כבר סומנו כדווחים');
        return;
      }
      complaintSelectedIds = new Set(unreported.map((l) => l.id));
      renderComplaintChecklist();
      updateComplaintWizardUI();
    });

    [el.profileFullName, el.profileIdNumber, el.profilePhone, el.profileAddress].forEach((input) => {
      input.addEventListener('input', () => {
        profile = {
          fullName: el.profileFullName.value.trim(),
          idNumber: el.profileIdNumber.value.trim(),
          phone: el.profilePhone.value.trim(),
          address: el.profileAddress.value.trim(),
        };
        saveProfile();
        updateComplaintWizardUI();
      });
    });

    el.clearProfileBtn.addEventListener('click', () => {
      profile = { fullName: '', idNumber: '', phone: '', address: '' };
      el.profileFullName.value = '';
      el.profileIdNumber.value = '';
      el.profilePhone.value = '';
      el.profileAddress.value = '';
      saveProfile();
      updateComplaintWizardUI();
      showToast('הפרטים האישיים נמחקו מהמכשיר');
    });

    el.sendEmailBtn.addEventListener('click', () => {
      const entries = getSelectedComplaintEntries();
      if (!entries.length) return;
      const target = getComplaintTarget();
      const op = getPrimaryOperatorForEntries(entries);
      const to = target === 'mot' ? MOT_EMAIL : ((OPERATOR_DIRECTORY[op] && OPERATOR_DIRECTORY[op].email) || '');
      if (!to) return;

      const subject = buildComplaintSubject(entries);
      const body = el.complaintPreview.value;
      const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailtoUrl;
      showToast('פותח טיוטת מייל מוכנה לשליחה');
    });

    el.shareWithCsvBtn.addEventListener('click', async () => {
      const entries = getSelectedComplaintEntries();
      if (!entries.length) return;
      const target = getComplaintTarget();
      const op = getPrimaryOperatorForEntries(entries);
      const to = target === 'mot' ? MOT_EMAIL : ((OPERATOR_DIRECTORY[op] && OPERATOR_DIRECTORY[op].email) || MOT_EMAIL);
      const subject = buildComplaintSubject(entries);
      const body = el.complaintPreview.value;

      await copyText(to);
      const csvContent = buildCsvContent(entries);
      const csvFile = new File([csvContent], `bus_complaint_${formatDateInput(new Date())}.csv`, {
        type: 'text/csv',
      });

      try {
        showToast(`כתובת ${to} הועתקה ללוח – בחר באפליקציית המייל`);
        await navigator.share({
          title: subject,
          text: body,
          files: [csvFile],
        });
      } catch (err) {
        if (err && err.name !== 'AbortError') {
          showToast('השיתוף הישיר לא נתמך כאן – הורד CSV והשתמש במייל');
        }
      }
    });

    el.copyAndOpenFormBtn.addEventListener('click', async () => {
      const ok = await copyText(el.complaintPreview.value);
      const url = el.copyAndOpenFormBtn.dataset.formUrl || MOT_FORM_URL;
      window.open(url, '_blank', 'noopener,noreferrer');
      showToast(ok ? 'הנוסח הועתק ללוח – הדבק אותו בטופס שנפתח' : 'הטופס נפתח בלשונית חדשה');
    });

    el.downloadSelectedCsvBtn.addEventListener('click', () => {
      downloadCsv(getSelectedComplaintEntries(), '_complaint');
    });

    el.markReportedBtn.addEventListener('click', () => {
      const nowIso = new Date().toISOString();
      let count = 0;
      logs.forEach((l) => {
        if (complaintSelectedIds.has(l.id)) {
          l.reportedAt = nowIso;
          count += 1;
        }
      });
      saveLogs();
      renderLogs();
      closeComplaintModal();
      showToast(`${count} תיעודים סומנו כ"דווח ✓"`);
    });

    // History Actions
    el.exportCsvBtn.addEventListener('click', () => {
      const active = getActiveRoute();
      const suffix = active && active.line ? `_line_${active.line}` : '';
      downloadCsv(logs, suffix);
    });

    el.copySummaryBtn.addEventListener('click', async () => {
      if (!logs.length) return;
      const text = buildComplaintLetter(logs, 'mot');
      const ok = await copyText(text);
      showToast(ok ? 'הסיכום המלא הועתק ללוח' : 'לא ניתן היה להעתיק אוטומטית');
    });

    el.logsList.addEventListener('click', (e) => {
      const verifyBtn = e.target.closest('[data-verify-id]');
      if (verifyBtn) {
        verifyLogWithOpenBus(verifyBtn.dataset.verifyId);
        return;
      }
      const complainBtn = e.target.closest('[data-complain-id]');
      if (complainBtn) {
        openComplaintModal(complainBtn.dataset.complainId);
        return;
      }
      const editBtn = e.target.closest('[data-edit-id]');
      if (editBtn) {
        openManualModal(editBtn.dataset.editId);
        return;
      }
      const delBtn = e.target.closest('[data-delete-id]');
      if (delBtn) {
        deleteSingleLogWithUndo(delBtn.dataset.deleteId);
      }
    });

    el.clearAllBtn.addEventListener('click', requestClearAllLogs);
    el.toastUndoBtn.addEventListener('click', undoLastDelete);

    // Confirm Modal
    el.confirmOkBtn.addEventListener('click', () => {
      if (typeof pendingConfirmCallback === 'function') pendingConfirmCallback();
      closeConfirmModal();
    });
    el.confirmCancelBtn.addEventListener('click', closeConfirmModal);
    el.confirmModal.addEventListener('click', (e) => {
      if (e.target === el.confirmModal) closeConfirmModal();
    });

    // About & Privacy Modal
    const closeAbout = () => el.aboutModal.classList.add('hidden');
    el.openAboutBtn.addEventListener('click', () => el.aboutModal.classList.remove('hidden'));
    el.closeAboutBtn.addEventListener('click', closeAbout);
    el.closeAboutOkBtn.addEventListener('click', closeAbout);
    el.aboutModal.addEventListener('click', (e) => {
      if (e.target === el.aboutModal) closeAbout();
    });

    // Onboarding Tour Modal
    el.openTourBtn.addEventListener('click', () => openTourModal(0));
    el.tourSkipBtn.addEventListener('click', closeTourModal);
    el.tourModal.addEventListener('click', (e) => {
      if (e.target === el.tourModal) closeTourModal();
    });
    el.tourPrevBtn.addEventListener('click', () => {
      if (tourStep > 0) {
        tourStep -= 1;
        renderTourSlide();
      }
    });
    el.tourNextBtn.addEventListener('click', () => {
      if (tourStep < TOUR_SLIDES.length - 1) {
        tourStep += 1;
        renderTourSlide();
      } else {
        closeTourModal();
      }
    });
    el.tourSetupRouteBtn.addEventListener('click', () => {
      closeTourModal();
      openSettingsModal();
    });

    // What's New Modal
    el.closeWhatsNewBtn.addEventListener('click', closeWhatsNewModal);
    el.closeWhatsNewOkBtn.addEventListener('click', closeWhatsNewModal);
    el.whatsNewModal.addEventListener('click', (e) => {
      if (e.target === el.whatsNewModal) closeWhatsNewModal();
    });

    // PWA Install Prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      el.installBanner.classList.remove('hidden');
    });

    el.installAppBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      el.installBanner.classList.add('hidden');
    });
  }

  function renderTourSlide() {
    const slide = TOUR_SLIDES[tourStep] || TOUR_SLIDES[0];
    el.tourSlideContent.innerHTML = `
      ${slide.visual}
      <h3 id="tourTitle" class="tour-title">${escapeHtml(slide.title)}</h3>
      <p class="tour-body">${escapeHtml(slide.body)}</p>
    `;

    el.tourDots.querySelectorAll('.tour-dot').forEach((dot, idx) => {
      dot.classList.toggle('active', idx === tourStep);
    });

    const isFirst = tourStep === 0;
    const isLast = tourStep === TOUR_SLIDES.length - 1;
    el.tourPrevBtn.classList.toggle('hidden', isFirst);
    el.tourSetupRouteBtn.classList.toggle('hidden', !(isLast && routes.length === 0));
    el.tourNextBtn.textContent = isLast ? 'בוא נתחיל!' : 'הבא';
  }

  function openTourModal(startAt = 0) {
    tourStep = startAt;
    renderTourSlide();
    el.tourModal.classList.remove('hidden');
  }

  function closeTourModal() {
    el.tourModal.classList.add('hidden');
    try {
      localStorage.setItem(STORAGE_KEYS.ONBOARDING_SEEN, '1');
    } catch {
      // ignore storage errors
    }
  }

  function openWhatsNewModal() {
    el.whatsNewVersionSub.textContent = `גרסה ${APP_VERSION} – מה השתנה מהגרסה הקודמת:`;
    el.whatsNewList.innerHTML = WHATS_NEW_ITEMS.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    el.hideWhatsNewCheckbox.checked = false;
    el.whatsNewModal.classList.remove('hidden');
  }

  function closeWhatsNewModal() {
    el.whatsNewModal.classList.add('hidden');
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_SEEN_VERSION, APP_VERSION);
      if (el.hideWhatsNewCheckbox.checked) {
        localStorage.setItem(STORAGE_KEYS.HIDE_WHATS_NEW, '1');
      }
    } catch {
      // ignore storage errors
    }
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    }
  }

  // ---------- Init ----------
  function init() {
    loadStorage();
    bindEvents();
    renderRoutesBar();
    renderActionState();
    renderLogs();
    updateLiveClock();
    setInterval(updateLiveClock, 15000);
    registerServiceWorker();

    try {
      const seenTour = localStorage.getItem(STORAGE_KEYS.ONBOARDING_SEEN);
      const lastSeenVer = localStorage.getItem(STORAGE_KEYS.LAST_SEEN_VERSION);
      const hideWhatsNew = localStorage.getItem(STORAGE_KEYS.HIDE_WHATS_NEW) === '1';

      if (!seenTour && logs.length === 0 && !activeSession) {
        // Brand new user: show welcome tour and mark current version as seen
        localStorage.setItem(STORAGE_KEYS.LAST_SEEN_VERSION, APP_VERSION);
        openTourModal(0);
      } else if (!activeSession && !hideWhatsNew && lastSeenVer !== APP_VERSION) {
        // Returning user on a new release: show What's New once
        openWhatsNewModal();
      }
    } catch {
      // ignore
    }
  }

  init();
})();
