// dashboard/script.js — Windows-style WhatsApp Bot Dashboard

const socket = io();

// ─── State ────────────────────────────────────────────────────────────────────
let allGroups = [];
let selectedGroupId = null;
let currentGroupSettings = {};
let qrTimerInterval = null;
let botConnected = false;
let zCounter = 200;

// ─── Clock ────────────────────────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
  document.getElementById('clock').innerHTML = `${time}<br><small>${date}</small>`;
}
setInterval(updateClock, 1000);
updateClock();

// ─── Socket Events ────────────────────────────────────────────────────────────
socket.on('connect', () => {
  console.log('Connected to server');
  fetchStatus();
  loadGroups();
});

socket.on('status', (data) => {
  updateStatus(data.status, data.message);
});

socket.on('qr', (data) => {
  showQR(data.qr);
});

socket.on('groups', (data) => {
  allGroups = data.groups || [];
  renderGroups(allGroups);
  updateGroupCount();
});

socket.on('stats', (data) => {
  updateStats(data);
});

// ─── Status Updates ───────────────────────────────────────────────────────────
function updateStatus(status, message) {
  botConnected = status === 'connected';
  const indicator = document.getElementById('connection-indicator');
  const statusBar = document.getElementById('qr-status-bar');
  const statusText = document.getElementById('qr-status-text');
  const fsStatus = document.getElementById('fs-status');

  indicator.className = `indicator ${status}`;
  statusBar.className = `status-bar ${status}`;
  statusText.textContent = message || status;

  if (fsStatus) {
    fsStatus.className = `badge ${status}`;
    fsStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }

  if (status === 'connected') {
    showConnected();
    loadGroups();
  } else if (status === 'qr') {
    // QR shown separately
  } else if (status === 'loggedout') {
    showQRLoading();
    showToast('Bot logged out. Refresh to re-login.', 'warning');
  }
}

function showQR(dataUrl) {
  document.getElementById('qr-loading').classList.add('hidden');
  document.getElementById('qr-connected').classList.add('hidden');
  document.getElementById('qr-display').classList.remove('hidden');
  document.getElementById('qr-image').src = dataUrl;

  // Timer
  clearInterval(qrTimerInterval);
  let seconds = 60;
  document.getElementById('qr-timer').textContent = seconds;
  qrTimerInterval = setInterval(() => {
    seconds--;
    const el = document.getElementById('qr-timer');
    if (el) el.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(qrTimerInterval);
      showQRLoading();
    }
  }, 1000);
}

function showConnected() {
  clearInterval(qrTimerInterval);
  document.getElementById('qr-loading').classList.add('hidden');
  document.getElementById('qr-display').classList.add('hidden');
  document.getElementById('qr-connected').classList.remove('hidden');
}

function showQRLoading() {
  document.getElementById('qr-display').classList.add('hidden');
  document.getElementById('qr-connected').classList.add('hidden');
  document.getElementById('qr-loading').classList.remove('hidden');
}

// ─── Fetch Status ─────────────────────────────────────────────────────────────
async function fetchStatus() {
  try {
    const resp = await fetch('/api/status');
    const data = await resp.json();
    updateStatus(data.status, data.status === 'connected' ? 'Bot Connected ✓' : 'Waiting for connection...');
    if (data.stats) updateStats(data.stats);
  } catch (e) {
    console.log('Server not yet ready');
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStats(stats) {
  const el = (id) => document.getElementById(id);
  if (el('stat-messages')) el('stat-messages').textContent = formatNum(stats.messagesHandled || 0);
  if (el('stat-commands')) el('stat-commands').textContent = formatNum(stats.commandsRun || 0);
  if (el('stat-uptime')) el('stat-uptime').textContent = formatUptime(stats.uptime || 0);
}

function updateGroupCount() {
  const el = document.getElementById('stat-groups');
  if (el) el.textContent = allGroups.length;
  const fsG = document.getElementById('fs-groups');
  if (fsG) fsG.textContent = allGroups.length;
}

function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function formatUptime(seconds) {
  if (seconds < 60) return seconds + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
}

// ─── Groups ───────────────────────────────────────────────────────────────────
async function loadGroups() {
  try {
    const resp = await fetch('/api/groups');
    const data = await resp.json();
    allGroups = data.groups || [];
    renderGroups(allGroups);
    updateGroupCount();
    populateSendSelect();
  } catch (e) {}
}

function renderGroups(groups) {
  const list = document.getElementById('groups-list');
  if (!list) return;

  if (!groups.length) {
    list.innerHTML = '<div class="empty-state">No groups found.<br>Connect bot and join groups.</div>';
    return;
  }

  list.innerHTML = groups.map(g => `
    <div class="group-item ${selectedGroupId === g.id ? 'active' : ''}" onclick="selectGroup('${escapeId(g.id)}')">
      <div class="group-item-avatar">👥</div>
      <div class="group-item-info">
        <div class="group-item-name">${escapeHtml(g.name)}</div>
        <div class="group-item-members">${g.participants} members</div>
      </div>
    </div>
  `).join('');
}

function filterGroups(query) {
  const filtered = allGroups.filter(g =>
    g.name.toLowerCase().includes(query.toLowerCase())
  );
  renderGroups(filtered);
}

async function selectGroup(groupId) {
  selectedGroupId = groupId;

  // Highlight active
  document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList?.add('active');

  // Show settings panel
  document.getElementById('no-group-selected').classList.add('hidden');
  document.getElementById('group-settings-panel').classList.remove('hidden');

  // Load settings
  const group = allGroups.find(g => g.id === groupId);
  if (group) {
    document.getElementById('settings-group-name').textContent = group.name;
    document.getElementById('settings-group-members').textContent = `${group.participants} members`;
  }

  try {
    const resp = await fetch(`/api/group/${encodeURIComponent(groupId)}/settings`);
    currentGroupSettings = await resp.json();
    renderGroupSettings(currentGroupSettings);
  } catch (e) {
    showToast('Failed to load group settings', 'error');
  }
}

function renderGroupSettings(s) {
  const setCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };

  setCheck('s-antiNSFW', s.antiNSFW);
  setCheck('s-antiLink', s.antiLink);
  setCheck('s-antiSpam', s.antiSpam);
  setCheck('s-antiBot', s.antiBot);
  setCheck('s-antiDelete', s.antiDelete);
  setCheck('s-antiFlood', s.antiFlood);
  setCheck('s-badWordFilter', s.badWordFilter);
  setCheck('s-autoKick', s.autoKick);
  setCheck('s-autoWarn', s.autoWarn);
  setCheck('s-welcome', s.welcome);
  setCheck('s-goodbye', s.goodbye);
  setCheck('s-xpSystem', s.xpSystem);
  setCheck('s-economy', s.economy);
  setCheck('s-autoReact', s.autoReact);
  setCheck('s-muted', s.muted);
  setCheck('s-autoTyping', s.autoTyping);
  setCheck('s-autoReply', s.autoReply);

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  setVal('s-welcomeMsg', s.welcomeMsg);
  setVal('s-goodbyeMsg', s.goodbyeMsg);
  setVal('s-prefix', s.prefix || '!');
  setVal('s-maxWarns', s.maxWarns || 3);

  // Bad words
  renderBadWords(s.badWords || []);

  // Auto replies
  renderAutoReplies(s.autoReplyTriggers || {});
}

async function saveSetting(key, value) {
  if (!selectedGroupId) return;
  currentGroupSettings[key] = value;

  try {
    await fetch(`/api/group/${encodeURIComponent(selectedGroupId)}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value })
    });
    const ind = document.getElementById('save-indicator');
    if (ind) {
      ind.textContent = '✓ Saved';
      setTimeout(() => { if (ind) ind.textContent = ''; }, 2000);
    }
  } catch (e) {
    showToast('Failed to save setting', 'error');
  }
}

// ─── Bad Words ────────────────────────────────────────────────────────────────
function renderBadWords(words) {
  const container = document.getElementById('bad-words-tags');
  if (!container) return;
  container.innerHTML = words.map(w => `
    <span class="tag">
      ${escapeHtml(w)}
      <span class="tag-remove" onclick="removeBadWord('${escapeHtml(w)}')">×</span>
    </span>
  `).join('');
}

function addBadWord() {
  const input = document.getElementById('new-bad-word');
  const word = input.value.trim().toLowerCase();
  if (!word || !selectedGroupId) return;

  const words = currentGroupSettings.badWords || [];
  if (!words.includes(word)) {
    words.push(word);
    currentGroupSettings.badWords = words;
    saveSetting('badWords', words);
    renderBadWords(words);
  }
  input.value = '';
}

function removeBadWord(word) {
  if (!currentGroupSettings.badWords) return;
  currentGroupSettings.badWords = currentGroupSettings.badWords.filter(w => w !== word);
  saveSetting('badWords', currentGroupSettings.badWords);
  renderBadWords(currentGroupSettings.badWords);
}

// ─── Auto Replies ─────────────────────────────────────────────────────────────
function renderAutoReplies(triggers) {
  const container = document.getElementById('auto-replies-list');
  if (!container) return;

  const entries = Object.entries(triggers);
  if (!entries.length) {
    container.innerHTML = '<div style="font-size:12px;color:#888;padding:4px 0;">No auto replies set.</div>';
    return;
  }
  container.innerHTML = entries.map(([k, v]) => `
    <div class="auto-reply-item">
      <span><strong>${escapeHtml(k)}</strong> → ${escapeHtml(v)}</span>
      <span class="reply-remove" onclick="removeAutoReply('${escapeHtml(k)}')">×</span>
    </div>
  `).join('');
}

function addAutoReply() {
  const keyword = document.getElementById('reply-keyword').value.trim().toLowerCase();
  const reply = document.getElementById('reply-text').value.trim();
  if (!keyword || !reply || !selectedGroupId) return;

  if (!currentGroupSettings.autoReplyTriggers) currentGroupSettings.autoReplyTriggers = {};
  currentGroupSettings.autoReplyTriggers[keyword] = reply;
  saveSetting('autoReplyTriggers', currentGroupSettings.autoReplyTriggers);
  renderAutoReplies(currentGroupSettings.autoReplyTriggers);

  document.getElementById('reply-keyword').value = '';
  document.getElementById('reply-text').value = '';
}

function removeAutoReply(keyword) {
  if (!currentGroupSettings.autoReplyTriggers) return;
  delete currentGroupSettings.autoReplyTriggers[keyword];
  saveSetting('autoReplyTriggers', currentGroupSettings.autoReplyTriggers);
  renderAutoReplies(currentGroupSettings.autoReplyTriggers);
}

// ─── Send Message ─────────────────────────────────────────────────────────────
function populateSendSelect() {
  const select = document.getElementById('send-group-select');
  if (!select) return;
  select.innerHTML = '<option value="">Select group...</option>' +
    allGroups.map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join('');
}

async function sendMessage() {
  const groupSelect = document.getElementById('send-group-select');
  const msgInput = document.getElementById('terminal-msg');
  const output = document.getElementById('terminal-output');

  const jid = groupSelect?.value;
  const text = msgInput?.value?.trim();

  if (!jid) { showToast('Select a group first!', 'error'); return; }
  if (!text) { showToast('Enter a message!', 'error'); return; }
  if (!botConnected) { showToast('Bot not connected!', 'error'); return; }

  const group = allGroups.find(g => g.id === jid);
  appendTerminal(output, `> Sending to ${group?.name || jid}...`, 'terminal-msg');

  try {
    const resp = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid, text })
    });
    const data = await resp.json();
    if (data.success) {
      appendTerminal(output, `✓ Message sent: "${text}"`, 'terminal-success');
      msgInput.value = '';
    } else {
      appendTerminal(output, `✗ Failed: ${data.error}`, 'terminal-error');
    }
  } catch (e) {
    appendTerminal(output, `✗ Error: ${e.message}`, 'terminal-error');
  }
}

function appendTerminal(output, text, cls = '') {
  if (!output) return;
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  output.appendChild(span);
  output.appendChild(document.createElement('br'));
  output.scrollTop = output.scrollHeight;
}

// ─── Group Message (from settings) ───────────────────────────────────────────
async function sendGroupMessage() {
  if (!selectedGroupId) return showToast('No group selected!', 'error');
  const text = prompt('Enter message to send to this group:');
  if (!text) return;

  try {
    const resp = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid: selectedGroupId, text })
    });
    const data = await resp.json();
    showToast(data.success ? '✓ Message sent!' : `✗ ${data.error}`, data.success ? 'success' : 'error');
  } catch (e) {
    showToast('Failed to send message', 'error');
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout() {
  if (!confirm('Are you sure you want to logout the bot?')) return;
  try {
    await fetch('/api/logout', { method: 'POST' });
    showToast('Bot logged out. Refresh to scan QR again.', 'warning');
    setTimeout(() => location.reload(), 2000);
  } catch (e) {}
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`tab-${name}`)?.classList.add('active');
  event?.target?.classList?.add('active');
}

function switchSettingsTab(name) {
  document.querySelectorAll('.stab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.settings-nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`stab-${name}`)?.classList.add('active');
  event?.target?.classList?.add('active');
}

// ─── Window Management ────────────────────────────────────────────────────────
function openWindow(id) {
  const win = document.getElementById(id);
  if (!win) return;
  win.classList.remove('hidden');
  win.style.zIndex = ++zCounter;
}

function closeWindow(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function minimizeWindow(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function maximizeWindow(id) {
  const win = document.getElementById(id);
  if (!win) return;
  if (win.dataset.maximized === '1') {
    win.style.left = win.dataset.origLeft || '80px';
    win.style.top = win.dataset.origTop || '60px';
    win.style.width = win.dataset.origW || '500px';
    win.style.height = win.dataset.origH || '400px';
    win.dataset.maximized = '0';
  } else {
    win.dataset.origLeft = win.style.left;
    win.dataset.origTop = win.style.top;
    win.dataset.origW = win.style.width;
    win.dataset.origH = win.style.height;
    win.style.left = '0';
    win.style.top = '0';
    win.style.width = '100vw';
    win.style.height = 'calc(100vh - 44px)';
    win.dataset.maximized = '1';
  }
}

function focusWindow(id) {
  const wins = document.querySelectorAll('.win-window');
  wins.forEach(w => { if (!w.classList.contains('hidden')) w.style.zIndex = 100; });
  const win = document.getElementById(`${id}-window`);
  if (win) { win.classList.remove('hidden'); win.style.zIndex = ++zCounter; }
}

// ─── Drag ─────────────────────────────────────────────────────────────────────
let dragWin = null, dragOffX = 0, dragOffY = 0;

function dragStart(e, id) {
  if (e.target.tagName === 'BUTTON') return;
  dragWin = document.getElementById(id);
  dragWin.style.zIndex = ++zCounter;
  dragOffX = e.clientX - dragWin.offsetLeft;
  dragOffY = e.clientY - dragWin.offsetTop;
  document.addEventListener('mousemove', dragMove);
  document.addEventListener('mouseup', dragEnd);
}

function dragMove(e) {
  if (!dragWin) return;
  let x = e.clientX - dragOffX;
  let y = e.clientY - dragOffY;
  x = Math.max(0, Math.min(x, window.innerWidth - 100));
  y = Math.max(0, Math.min(y, window.innerHeight - 44 - 40));
  dragWin.style.left = x + 'px';
  dragWin.style.top = y + 'px';
}

function dragEnd() {
  dragWin = null;
  document.removeEventListener('mousemove', dragMove);
  document.removeEventListener('mouseup', dragEnd);
}

// ─── Start Menu ───────────────────────────────────────────────────────────────
let startMenuOpen = false;

function toggleStartMenu() {
  const menu = document.getElementById('start-menu');
  startMenuOpen = !startMenuOpen;
  menu.classList.toggle('hidden', !startMenuOpen);
}

document.addEventListener('click', (e) => {
  if (startMenuOpen && !e.target.closest('#start-menu') && !e.target.closest('#start-btn')) {
    document.getElementById('start-menu').classList.add('hidden');
    startMenuOpen = false;
  }
});

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  const colors = { success: '#00c851', error: '#ff4444', warning: '#ffbb33', info: '#0078D4' };
  toast.textContent = msg;
  toast.style.borderLeftColor = colors[type] || colors.info;
  toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeId(str) {
  return String(str).replace(/'/g, "\\'");
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Open QR window by default
  openWindow('qr-window');

  // Double-click to open (already on icons) — fallback
  document.querySelectorAll('.desktop-icon').forEach(icon => {
    icon.addEventListener('dblclick', () => {});
  });

  // Keyboard shortcut: Enter to send message
  document.getElementById('terminal-msg')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) sendMessage();
  });

  // Window focus on click
  document.querySelectorAll('.win-window').forEach(win => {
    win.addEventListener('mousedown', () => {
      win.style.zIndex = ++zCounter;
    });
  });

  // Periodic stats refresh
  setInterval(fetchStatus, 10000);
});
