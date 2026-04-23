'use strict';

// ── Config & State ───────────────────────────────────────────────────────────
const CFG = window.APP_CONFIG || {};
const state = {
  token: localStorage.getItem('access_token'),
  alerts: [],
  customers: [],
};

// ── PKCE ─────────────────────────────────────────────────────────────────────
function randomBase64url(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
async function sha256url(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function login() {
  const verifier = randomBase64url(64);
  const challenge = await sha256url(verifier);
  sessionStorage.setItem('pkce_verifier', verifier);
  const url = new URL(CFG.AUTH_ENDPOINT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CFG.OIDC_CLIENT_ID);
  url.searchParams.set('redirect_uri', location.origin + '/callback');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  location.href = url.toString();
}

async function handleCallback() {
  const code = new URLSearchParams(location.search).get('code');
  if (!code) { navigate('login'); return; }
  const verifier = sessionStorage.getItem('pkce_verifier');
  sessionStorage.removeItem('pkce_verifier');
  try {
    const resp = await fetch(CFG.TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: CFG.OIDC_CLIENT_ID,
        redirect_uri: location.origin + '/callback',
        code,
        code_verifier: verifier,
      }),
    });
    const data = await resp.json();
    if (!data.access_token) throw new Error();
    state.token = data.access_token;
    localStorage.setItem('access_token', data.access_token);
    history.replaceState({}, '', '/');
    navigate('home');
  } catch {
    navigate('login');
  }
}

function logout() {
  localStorage.removeItem('access_token');
  state.token = null;
  renderLogin();
}

// ── API ──────────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const resp = await fetch('/api' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + state.token,
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (resp.status === 401) { logout(); return null; }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || 'API 오류');
  }
  return resp.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function timeAgo(d) {
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + '분 전';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '시간 전';
  return Math.floor(h / 24) + '일 전';
}
function sevClass(s) { return {critical:'badge-red',warning:'badge-yellow',ok:'badge-green'}[s]||'badge-gray'; }
function sevLabel(s) { return {critical:'긴급',warning:'경고',ok:'정상'}[s]||s; }

function toast(msg, ms = 2500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const I = {
  bell:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  users:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  cpu:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="6" height="6"/><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v2M17 2v2M7 20v2M17 20v2M2 7h2M2 17h2M20 7h2M20 17h2"/></svg>`,
  list:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  back:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  phone:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  mail:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  slack:  `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zm2.521-10.123a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.331a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`,
};

// ── UI Pieces ─────────────────────────────────────────────────────────────────
function bottomNav(active) {
  const tabs = [
    { id: 'home',      icon: I.bell,  label: '알람' },
    { id: 'customers', icon: I.users, label: '고객사' },
    { id: 'ai',        icon: I.cpu,   label: 'AI' },
    { id: 'log',       icon: I.list,  label: '로그' },
  ];
  return `<nav class="bottom-nav">${tabs.map(t =>
    `<button class="nav-btn${active===t.id?' active':''}" onclick="navigate('${t.id}')">${t.icon}${t.label}</button>`
  ).join('')}</nav>`;
}

function header(title, back = false) {
  return `<header class="header">
    ${back ? `<button class="icon-btn" onclick="history.back()">${I.back}</button>` : ''}
    <span class="header-title">${esc(title)}</span>
    <button class="icon-btn" title="로그아웃" onclick="logout()">${I.logout}</button>
  </header>`;
}

function spinner() {
  return `<div class="loading"><div class="spinner"></div></div>`;
}

// ── Views ─────────────────────────────────────────────────────────────────────
function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-wrap">
      <div class="login-logo">🔔</div>
      <div>
        <div class="login-title">MSP 온콜</div>
        <div class="login-sub" style="margin-top:6px">야간/주말 인프라 대응 플랫폼</div>
      </div>
      <button class="btn btn-primary" style="max-width:280px" onclick="login()">Authentik으로 로그인</button>
    </div>`;
}

async function renderHome() {
  const alerts = await api('/alerts?status=open');
  if (!alerts) return;
  state.alerts = alerts;

  const criticals = alerts.filter(a => a.severity === 'critical').length;
  const items = alerts.length
    ? alerts.map(a => `
        <div class="alert-item ${esc(a.severity)}" onclick="navigate('customer-detail',{id:${a.customer_id||0}})">
          <div class="alert-info">
            <div class="alert-title">${esc(a.title)}</div>
            <div class="alert-meta">${esc(a.customer_name||'고객사 미지정')} · ${timeAgo(a.received_at)}</div>
          </div>
          <div class="alert-actions">
            <span class="badge ${sevClass(a.severity)}">${sevLabel(a.severity)}</span>
            <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();ackAlert(${a.id})">ACK</button>
          </div>
        </div>`).join('')
    : `<div class="empty">✅<span>열린 알람 없음</span></div>`;

  document.getElementById('app').innerHTML = header('MSP 온콜') + `
    <div class="content">
      <div class="section-head">열린 알람 ${alerts.length}개${criticals?` · <span class="badge badge-red">${criticals}긴급</span>`:''}
      </div>
      ${items}
    </div>
    ${bottomNav('home')}`;
}

async function renderCustomers() {
  const customers = await api('/customers');
  if (!customers) return;
  state.customers = customers;

  document.getElementById('app').innerHTML = header('고객사') + `
    <div class="content">
      <input type="search" placeholder="고객사 검색..." style="margin-bottom:16px"
             oninput="filterCustomers(this.value)">
      <div id="cust-list">${customerListHtml(customers)}</div>
    </div>
    ${bottomNav('customers')}`;
}

function customerListHtml(list) {
  if (!list.length) return `<div class="empty">검색 결과 없음</div>`;
  return list.map(c => `
    <div class="customer-item" onclick="navigate('customer-detail',{id:${c.id}})">
      <div class="customer-body">
        <div class="customer-name">${esc(c.name)}</div>
        <div class="customer-meta">${esc(c.slug)} · <span class="tier-tag tier-${esc(c.tier)}">${esc(c.tier)}</span></div>
      </div>
      <div class="customer-badges">
        ${+c.critical_count>0?`<span class="badge badge-red">${c.critical_count}</span>`:''}
        ${+c.warning_count>0?`<span class="badge badge-yellow">${c.warning_count}</span>`:''}
      </div>
    </div>`).join('');
}

window.filterCustomers = function(q) {
  const qLow = q.toLowerCase();
  const filtered = state.customers.filter(c =>
    c.name.toLowerCase().includes(qLow) || c.slug.toLowerCase().includes(qLow)
  );
  document.getElementById('cust-list').innerHTML = customerListHtml(filtered);
};

async function renderCustomerDetail(id) {
  if (!id) { navigate('customers'); return; }
  const data = await api('/customers/' + id);
  if (!data) return;

  const contacts = data.contacts.length
    ? data.contacts.map(c => `
        <div class="contact-card">
          <div class="contact-avatar">${esc(c.name[0])}</div>
          <div class="contact-info">
            <div class="contact-name">${esc(c.name)}${c.is_primary?' ⭐':''}</div>
            <div class="contact-role">${esc(c.role||'')}${c.email?` · ${esc(c.email)}`:''}</div>
          </div>
          ${c.phone?`<a href="tel:${esc(c.phone)}" class="tel-link">${I.phone}전화</a>`:''}
        </div>`).join('')
    : `<div class="empty" style="padding:16px">담당자 정보 없음</div>`;

  const timeline = data.history.length
    ? data.history.map(a => `
        <div class="tl-item ${esc(a.severity)}">
          <div class="tl-title">${esc(a.title)}</div>
          <div class="tl-meta">
            <span class="badge ${sevClass(a.severity)}">${sevLabel(a.severity)}</span>
            ${esc(a.source)} · ${timeAgo(a.received_at)}
            <span class="badge ${a.status==='resolved'?'badge-green':'badge-gray'}">${esc(a.status)}</span>
          </div>
        </div>`).join('')
    : `<div style="font-size:13px;color:var(--muted)">최근 30일 이력 없음</div>`;

  const openAlerts = data.history.filter(a => a.status === 'open');

  document.getElementById('app').innerHTML = header(data.name, true) + `
    <div class="content">
      <div class="section-head">기본 정보</div>
      <div class="card">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span class="badge badge-blue">${esc(data.slug)}</span>
          <span class="tier-tag tier-${esc(data.tier)}">${esc(data.tier)}</span>
          ${data.aws_account_id?`<span class="badge badge-gray">AWS ${esc(data.aws_account_id)}</span>`:''}
        </div>
        ${openAlerts.length?`
        <div style="margin-top:12px">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">열린 알람 ${openAlerts.length}개</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${openAlerts.slice(0,3).map(a=>`
              <button class="btn btn-outline btn-sm" onclick="navigate('ai',{alertId:${a.id}})">${I.cpu} AI분석</button>
            `).join('')}
          </div>
        </div>`:''}
      </div>

      <div class="section-head">담당자 연락처</div>
      ${contacts}

      <div style="display:flex;gap:8px;margin-top:4px">
        <button class="btn btn-outline" style="flex:1" onclick="navigate('email',{customerId:${id}})">${I.mail} 메일</button>
        <button class="btn btn-outline" style="flex:1" onclick="navigate('slack',{customerId:${id}})">${I.slack} 슬랙</button>
      </div>

      <div class="section-head">최근 30일 알람</div>
      <div class="timeline">${timeline}</div>
    </div>
    ${bottomNav('customers')}`;
}

async function renderAI(alertId) {
  const alerts = await api('/alerts?status=open');
  if (!alerts) return;

  const options = alerts.map(a =>
    `<option value="${a.id}"${a.id==alertId?' selected':''}>${esc(a.title)} (${esc(a.customer_name||'-')})</option>`
  ).join('');

  document.getElementById('app').innerHTML = header('AI 분석') + `
    <div class="content">
      <div class="form-group">
        <label>알람 선택</label>
        <select id="ai-sel"><option value="">-- 알람을 선택하세요 --</option>${options}</select>
      </div>
      <button class="btn btn-primary" id="ai-btn" onclick="runAnalysis()">AI 분석 시작</button>
      <div id="ai-out"></div>
    </div>
    ${bottomNav('ai')}`;
}

window.runAnalysis = async function() {
  const alertId = document.getElementById('ai-sel').value;
  if (!alertId) { toast('알람을 선택해 주세요'); return; }
  const btn = document.getElementById('ai-btn');
  const out  = document.getElementById('ai-out');
  btn.disabled = true; btn.textContent = '분석 중...';
  out.innerHTML = `<div class="loading"><div class="spinner"></div>Claude가 분석 중입니다...</div>`;
  try {
    const data = await api('/ai/analyze', { method: 'POST', body: { alertId: +alertId } });
    if (!data) return;
    out.innerHTML = `
      <div class="section-head" style="margin-top:16px">분석 결과</div>
      <div class="ai-result">${esc(data.analysis)}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-outline" style="flex:1" onclick="navigate('email',{alertId:${alertId}})">${I.mail} 메일 초안</button>
        <button class="btn btn-outline" style="flex:1" onclick="navigate('slack',{alertId:${alertId}})">${I.slack} 슬랙 공유</button>
      </div>`;
  } catch(e) {
    out.innerHTML = `<div class="empty">오류: ${esc(e.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'AI 분석 시작';
  }
};

async function renderEmail(params) {
  const alerts = await api('/alerts?status=open');
  if (!alerts) return;

  const alertId   = params && params.alertId;
  const custId    = params && params.customerId;
  const filtered  = custId ? alerts.filter(a => a.customer_id == custId) : alerts;
  const list      = filtered.length ? filtered : alerts;

  const options = list.map(a =>
    `<option value="${a.id}"${a.id==alertId?' selected':''}>${esc(a.title)} (${esc(a.customer_name||'-')})</option>`
  ).join('');

  document.getElementById('app').innerHTML = header('메일 발송', true) + `
    <div class="content">
      <div class="form-group">
        <label>알람 선택</label>
        <select id="m-alert"><option value="">-- 알람을 선택하세요 --</option>${options}</select>
      </div>
      <div class="form-group">
        <label>현재 상황 설명</label>
        <textarea id="m-sit" placeholder="예: RDS CPU 90% 초과, 쿼리 지연 발생 중. 현재 원인 분석 중."></textarea>
      </div>
      <div class="form-group">
        <label>수신자 (쉼표로 구분)</label>
        <input type="text" id="m-to" placeholder="manager@company.com, cto@company.com">
      </div>
      <button class="btn btn-primary" id="m-btn" onclick="sendEmail()">${I.mail} AI 초안 생성 후 발송</button>
      <div id="m-out"></div>
    </div>
    ${bottomNav('home')}`;
}

window.sendEmail = async function() {
  const alertId    = document.getElementById('m-alert').value;
  const situation  = document.getElementById('m-sit').value.trim();
  const recipStr   = document.getElementById('m-to').value.trim();
  if (!alertId || !situation || !recipStr) { toast('모든 항목을 입력해 주세요'); return; }
  const recipients = recipStr.split(',').map(s=>s.trim()).filter(Boolean);
  const btn = document.getElementById('m-btn');
  const out  = document.getElementById('m-out');
  btn.disabled = true; btn.textContent = '처리 중...';
  try {
    const data = await api('/ai/send-email', { method: 'POST', body: { alertId: +alertId, situation, recipients } });
    if (!data) return;
    out.innerHTML = `
      <div class="divider"></div>
      <div class="section-head">발송 완료</div>
      <div class="card">
        <div style="font-size:12px;color:var(--muted)">제목</div>
        <div style="font-weight:600;margin-top:4px">${esc(data.subject)}</div>
        <div class="divider"></div>
        <div style="font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(data.body)}</div>
      </div>`;
    toast('메일이 발송되었습니다 ✅');
  } catch(e) {
    toast('오류: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = I.mail + ' AI 초안 생성 후 발송';
  }
};

async function renderSlack(params) {
  const alerts = await api('/alerts?status=open');
  if (!alerts) return;

  const alertId  = params && params.alertId;
  const custId   = params && params.customerId;
  const filtered = custId ? alerts.filter(a => a.customer_id == custId) : alerts;
  const list     = filtered.length ? filtered : alerts;

  const options = list.map(a =>
    `<option value="${a.id}"${a.id==alertId?' selected':''}>${esc(a.title)} (${esc(a.customer_name||'-')})</option>`
  ).join('');

  document.getElementById('app').innerHTML = header('슬랙 공유', true) + `
    <div class="content">
      <div class="form-group">
        <label>관련 알람</label>
        <select id="s-alert"><option value="">-- 알람을 선택하세요 --</option>${options}</select>
      </div>
      <div class="form-group">
        <label>메시지</label>
        <textarea id="s-msg" rows="5" placeholder="예: [대응 중] 고객사 A RDS 이슈 확인 중입니다. 예상 복구 30분"></textarea>
      </div>
      <button class="btn btn-primary" id="s-btn" onclick="sendSlack()">${I.slack} 슬랙에 공유</button>
    </div>
    ${bottomNav('home')}`;
}

window.sendSlack = async function() {
  const alertId = document.getElementById('s-alert').value;
  const message = document.getElementById('s-msg').value.trim();
  if (!alertId || !message) { toast('알람과 메시지를 입력해 주세요'); return; }
  const btn = document.getElementById('s-btn');
  btn.disabled = true; btn.textContent = '발송 중...';
  try {
    await api('/ai/slack', { method: 'POST', body: { alertId: +alertId, message } });
    toast('슬랙에 공유되었습니다 ✅');
    setTimeout(() => navigate('home'), 1500);
  } catch(e) {
    toast('오류: ' + e.message);
    btn.disabled = false; btn.innerHTML = I.slack + ' 슬랙에 공유';
  }
};

async function renderLog() {
  const logs = await api('/actions?limit=100');
  if (!logs) return;

  const labels = {
    view_customer: '고객사 조회',
    ack_alert:     '알람 ACK',
    resolve_alert: '알람 해결',
    ai_analyze:    'AI 분석',
    send_email:    '메일 발송',
    slack_share:   '슬랙 공유',
  };

  const items = logs.length
    ? logs.map(l => `
        <div class="log-item">
          <div class="log-action">${esc(labels[l.action]||l.action)}</div>
          <div class="log-meta">${esc(l.user_email)}${l.customer_name?` · ${esc(l.customer_name)}`:''} · ${timeAgo(l.created_at)}</div>
        </div>`).join('')
    : `<div class="empty">기록 없음</div>`;

  document.getElementById('app').innerHTML = header('감사 로그') + `
    <div class="content">${items}</div>
    ${bottomNav('log')}`;
}

// ── ACK ──────────────────────────────────────────────────────────────────────
window.ackAlert = async function(id) {
  try {
    await api('/alerts/' + id + '/ack', { method: 'POST' });
    toast('ACK 처리되었습니다 ✅');
    await renderHome();
  } catch(e) {
    toast('오류: ' + e.message);
  }
};

// ── Router ────────────────────────────────────────────────────────────────────
window.navigate = async function(view, params = {}) {
  if (!state.token && view !== 'login' && view !== 'callback') {
    renderLogin(); return;
  }
  const app = document.getElementById('app');
  if (view !== 'login' && view !== 'callback') {
    app.innerHTML = spinner();
  }
  try {
    switch (view) {
      case 'login':           renderLogin();                            break;
      case 'callback':        await handleCallback();                   break;
      case 'home':            await renderHome();                       break;
      case 'customers':       await renderCustomers();                  break;
      case 'customer-detail': await renderCustomerDetail(params.id);   break;
      case 'ai':              await renderAI(params.alertId);           break;
      case 'email':           await renderEmail(params);                break;
      case 'slack':           await renderSlack(params);                break;
      case 'log':             await renderLog();                        break;
    }
  } catch(e) {
    app.innerHTML = `
      <div class="empty">오류가 발생했습니다.<br><small>${esc(e.message)}</small><br><br>
        <button class="btn btn-outline" onclick="navigate('home')">홈으로 돌아가기</button>
      </div>`;
  }
};

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
  if (location.pathname === '/callback') {
    navigate('callback');
  } else if (state.token) {
    navigate('home');
  } else {
    renderLogin();
  }
});
