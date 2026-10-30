// Página de configurações: tema, gatilhos do menu (chrome.storage.sync) e opções do radial (chrome.storage.local).
// Sites vêm de sites.js (window.RADIAL_SITES): id + nome.
const I = window.RADIAL_I18N;
const t = (s, v) => I.t(s, v);
const CTX_NAMES = Object.fromEntries(window.RADIAL_SITES.map((s) => [s.id, I.label(s.name)]));
const $ = (id) => document.getElementById(id);
const ICON = {
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'
};

function svgIcon(path) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ico');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = path; // constante interna
  return s;
}

// ---------- Aviso rápido ----------
let toastTimer;
function toast(text, isError) {
  const t = $('toast');
  t.textContent = text;
  t.className = 'show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 2200);
}

// ---------- Tema (Auto / Claro / Escuro) ----------
function applyTheme(v) {
  if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v;
  else delete document.documentElement.dataset.theme;
}
function initTheme() {
  let saved = 'auto';
  try { saved = localStorage.getItem('radial-theme') || 'auto'; } catch (_) { /* sem localStorage */ }
  document.querySelectorAll('input[name="theme"]').forEach((r) => {
    r.checked = r.value === saved;
    r.onchange = () => {
      applyTheme(r.value);
      try { localStorage.setItem('radial-theme', r.value); } catch (_) { /* ignora */ }
    };
  });
}

// ---------- Opções do radial ----------
const E = window.RADIAL_EDITOR;
let bmEditor = null;

function iconButton(label, name, cls, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn icon ' + cls;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = E.icon_(name);
  b.onclick = onclick;
  return b;
}

const ringName = (c) => CTX_NAMES[c] || (c.startsWith('host:') ? c.slice(5) : c);

async function render() {
  const items = await window.RADIAL_STORE.list();
  const ul = $('list');
  ul.textContent = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.append(svgIcon(ICON.code));
    const p = document.createElement('p');
    p.textContent = t('No options saved yet. Add the first one above.');
    li.append(p);
    ul.appendChild(li);
  }
  items.forEach((o) => {
    const li = document.createElement('li');
    li.className = 'item';
    const info = document.createElement('div');
    info.className = 'info';
    const head = document.createElement('div');
    head.className = 'item-head';
    head.append(
      Object.assign(document.createElement('b'), { textContent: (o.type === 'action' && o.ref ? I.label(o.ref.label) : o.name) || '—' }),
      Object.assign(document.createElement('span'), { className: 'badge', textContent: o.type === 'js' ? 'JavaScript' : o.type === 'keys' ? t('Keys') : t('Action') }));
    const sub = document.createElement('div');
    sub.className = 'help';
    sub.style.marginTop = '2px';
    sub.textContent = o.type === 'js'
      ? t('{n} characters of code', { n: (o.code || '').length }) + (o.shortcut ? ' · ' + t('shortcut') + ' ' + E.comboText(o.shortcut) : '')
      : o.type === 'keys' ? (o.keys || []).map(E.comboText).join(' › ') : t('Ready-made action');
    const tags = document.createElement('div');
    tags.className = 'tags';
    (o.ctx || []).forEach((c) => tags.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: ringName(c) })));
    info.append(head, sub, tags);
    const del = iconButton(t('Delete {name}', { name: o.name }), 'trash', 'danger', async () => {
      if (!confirm(t('Delete "{name}"?', { name: o.name || '—' }))) return;
      await window.RADIAL_STORE.remove(o.id);
      toast(t('Option deleted.'));
      render();
    });
    if (o.type === 'js') li.append(info, iconButton(t('Edit {name}', { name: o.name }), 'edit', '', () => bmEditor.edit(o)), del);
    else li.append(info, del); // atalhos e ações prontas são editados pelo ícone da extensão, no próprio site
    ul.appendChild(li);
  });
}

// ---------- Gatilho do menu (mouse e tecla) ----------
const DEFAULTS = { mouse: 'right-hold', holdMs: 150, key: null, size: 380, sticky: true, cancel: 'left', contentScale: 1.5, autoDnd: false, autoDndHosts: 'isp.crm4.dynamics.com', emailTpl: true, removeQueue: true, rcBtn: false, sicLogs: true, ticketBtn: true, assignBtns: true, assignQueues: 'Tier 2 | eMobility Tier2\nTier 3 | eMobility TS SiD\nSiFlex Team | eMobility TS SiFlex Team\nFlex Team | eMobility TS Flex Team\nTS Legacy Team | eMobility TS Legacy Siemens Team', shareCopy: true, emailTplKeep: 15, emailTplSee: 8 };
let cfg = { ...DEFAULTS };
let recording = false;

function keyText(k) {
  if (!k || !k.code) return '';
  const name = k.code.replace(/^Key/, '').replace(/^Digit/, '');
  return [k.ctrl && 'Ctrl', k.alt && 'Alt', k.shift && 'Shift', k.meta && 'Cmd', name].filter(Boolean).join(' + ');
}

async function saveCfg() {
  try {
    await chrome.storage.sync.set({ settings: cfg });
    toast(t('Saved.'));
  } catch (e) {
    toast(t('Could not save: {msg}', { msg: e.message }), true);
  }
}

function showCfg() {
  document.querySelectorAll('input[name="mouseTrig"]').forEach((r) => { r.checked = r.value === cfg.mouse; });
  $('holdMs').value = cfg.holdMs;
  $('holdOut').textContent = cfg.holdMs + ' ms';
  $('holdBox').style.display = cfg.mouse === 'right-hold' ? '' : 'none';
  $('size').value = cfg.size;
  $('sizeOut').textContent = cfg.size + ' px';
  $('contentScale').value = Math.round((cfg.contentScale || 1.5) * 100);
  $('contentOut').textContent = Math.round((cfg.contentScale || 1.5) * 100) + '%';
  $('sticky').checked = !!cfg.sticky;
  $('autoDnd').checked = !!cfg.autoDnd;
  $('emailTpl').checked = !!cfg.emailTpl;
  $('rcBtn').checked = !!cfg.rcBtn;
  $('sicLogs').checked = cfg.sicLogs !== false;
  $('ticketBtn').checked = cfg.ticketBtn !== false;
  $('assignBtns').checked = cfg.assignBtns !== false;
  if (document.activeElement !== $('assignQueues')) $('assignQueues').value = cfg.assignQueues == null ? DEFAULTS.assignQueues : cfg.assignQueues;
  $('shareCopy').checked = cfg.shareCopy !== false;
  if (document.activeElement !== $('emailTplKeep')) $('emailTplKeep').value = cfg.emailTplKeep || 15;
  if (document.activeElement !== $('emailTplSee')) $('emailTplSee').value = cfg.emailTplSee || 8;
  $('removeQueue').checked = !!cfg.removeQueue;
  if (document.activeElement !== $('autoDndHosts')) $('autoDndHosts').value = String(cfg.autoDndHosts || '').split(/[\s,;]+/).filter(Boolean).join('\n');
  const trig = { middle: 'middle', back: 'back', forward: 'forward', 'right-hold': 'right' }[cfg.mouse];
  if (trig && cfg.cancel === trig) cfg.cancel = 'none';
  document.querySelectorAll('input[name="cancelBtn"]').forEach((r) => {
    r.checked = r.value === cfg.cancel;
    r.disabled = r.value !== 'none' && r.value === trig; // o botão do gatilho não pode cancelar
  });
  const txt = keyText(cfg.key);
  $('keyShow').textContent = txt || t('None');
  $('keyShow').className = txt ? '' : 'empty';
}

function stopRecording() {
  recording = false;
  $('recKey').classList.remove('recording');
  $('recTxt').textContent = t('Record key');
}

document.querySelectorAll('input[name="mouseTrig"]').forEach((r) => {
  r.onchange = () => {
    if (!r.checked) return;
    cfg.mouse = r.value;
    const trig = { middle: 'middle', back: 'back', forward: 'forward', 'right-hold': 'right' }[cfg.mouse];
    if (trig && cfg.cancel === trig) cfg.cancel = 'none'; // o gatilho não pode ser também o cancelar
    showCfg(); saveCfg();
  };
});
$('size').oninput = () => { $('sizeOut').textContent = $('size').value + ' px'; };
$('size').onchange = () => { cfg.size = Number($('size').value) || 380; showCfg(); saveCfg(); };
$('contentScale').oninput = () => { $('contentOut').textContent = $('contentScale').value + '%'; };
$('contentScale').onchange = () => { cfg.contentScale = (Number($('contentScale').value) || 150) / 100; showCfg(); saveCfg(); };
// Auto Stats: ligar pede uma senha; desligar não pede nada.
const AUTO_PW = '451370';
$('autoDnd').onchange = () => {
  if (!$('autoDnd').checked) { cfg.autoDnd = false; $('autoPw').hidden = true; saveCfg(); return; }
  $('autoDnd').checked = false;
  $('autoPw').hidden = false; $('autoPwMsg').textContent = ''; $('autoPwInput').value = '';
  $('autoPwInput').focus();
};
function tryAutoPw() {
  if ($('autoPwInput').value === AUTO_PW) {
    cfg.autoDnd = true; $('autoDnd').checked = true; $('autoPw').hidden = true; saveCfg();
  } else {
    $('autoPwMsg').style.color = '#c4314b'; $('autoPwMsg').textContent = t('Wrong password.');
    $('autoPwInput').select();
  }
}
$('autoPwOk').onclick = tryAutoPw;
$('autoPwInput').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); tryAutoPw(); } };
$('removeQueue').onchange = () => { cfg.removeQueue = $('removeQueue').checked; saveCfg(); };
$('emailTplSee').onchange = () => { cfg.emailTplSee = Math.min(30, Math.max(1, parseInt($('emailTplSee').value, 10) || 8)); showCfg(); saveCfg(); };
$('emailTplKeep').onchange = () => { cfg.emailTplKeep = Math.min(30, Math.max(1, parseInt($('emailTplKeep').value, 10) || 15)); showCfg(); saveCfg(); };
$('shareCopy').onchange = () => { cfg.shareCopy = $('shareCopy').checked; saveCfg(); };
$('assignBtns').onchange = () => { cfg.assignBtns = $('assignBtns').checked; saveCfg(); };
$('assignQueues').onchange = () => { cfg.assignQueues = $('assignQueues').value; saveCfg(); };
$('ticketBtn').onchange = () => { cfg.ticketBtn = $('ticketBtn').checked; saveCfg(); };
$('sicLogs').onchange = () => { cfg.sicLogs = $('sicLogs').checked; saveCfg(); };
$('rcBtn').onchange = () => { cfg.rcBtn = $('rcBtn').checked; saveCfg(); };
$('rcUrl').onchange = async () => {
  await chrome.storage.local.set({ rc_url: $('rcUrl').value.trim() });
  toast(t('Saved.'));
};
$('rcValidate').onclick = async () => {
  const st = $('rcStatus'), btn = $('rcValidate');
  st.style.color = ''; st.textContent = t('Checking…'); btn.disabled = true;
  await chrome.storage.local.set({ rc_url: $('rcUrl').value.trim() });
  try {
    const r = await chrome.runtime.sendMessage({ type: 'rc-validate' });
    if (r && r.ok) st.textContent = t('OK: {n} contacts, {c} countries.', { n: r.contacts, c: r.countries });
    else { st.style.color = '#c4314b'; st.textContent = (r && r.error) || t('Could not read the list.'); }
  } catch (e) { st.style.color = '#c4314b'; st.textContent = String(e && e.message || e); }
  btn.disabled = false;
};
chrome.storage.local.get(['rc_url', 'rc_contacts']).then((r) => {
  if (r.rc_url) $('rcUrl').value = r.rc_url;
  if (r.rc_contacts && r.rc_contacts.rows) $('rcStatus').textContent = t('Saved list: {n} contacts.', { n: r.rc_contacts.rows.length });
});
$('emailTpl').onchange = () => { cfg.emailTpl = $('emailTpl').checked; saveCfg(); };
$('autoDndHosts').onchange = () => { cfg.autoDndHosts = $('autoDndHosts').value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).join(' '); showCfg(); saveCfg(); };
$('sticky').onchange = () => { cfg.sticky = $('sticky').checked; saveCfg(); };
document.querySelectorAll('input[name="cancelBtn"]').forEach((r) => {
  r.onchange = () => { if (r.checked) { cfg.cancel = r.value; showCfg(); saveCfg(); } };
});
$('holdMs').oninput = () => { $('holdOut').textContent = $('holdMs').value + ' ms'; };
$('holdMs').onchange = () => { cfg.holdMs = Number($('holdMs').value) || 150; showCfg(); saveCfg(); };
$('clearKey').onclick = () => { cfg.key = null; stopRecording(); showCfg(); saveCfg(); };
$('chromeKeys').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
$('recKey').onclick = () => {
  if (recording) { stopRecording(); return; }
  recording = true;
  $('recKey').classList.add('recording');
  $('recTxt').textContent = t('Press the key… (Esc cancels)');
};
$('recKey').onblur = stopRecording;

window.addEventListener('keydown', (e) => {
  if (!recording) return;
  e.preventDefault();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return; // espera a tecla principal
  stopRecording();
  if (e.key === 'Escape') return;
  cfg.key = { code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
  showCfg(); saveCfg();
}, true);

// ---------- Início ----------
(async () => {
  await I.ready;
  I.apply();
  const sel = $('lang');
  I.LANGS.forEach(([c, n]) => sel.appendChild(Object.assign(document.createElement('option'), { value: c, textContent: n, selected: c === I.lang })));
  sel.onchange = async () => { await I.setLang(sel.value); location.reload(); };
  initTheme();
  await window.RADIAL_STORE.migrate();
  bmEditor = E.mount($('bmEditor'), { bookmarklet: true, siteList: window.RADIAL_SITES.map((s) => ({ id: s.id, name: I.label(s.name) })), toast, onChange: render });
  const r = await chrome.storage.sync.get('settings');
  cfg = { ...DEFAULTS, ...(r.settings || {}) };
  showCfg();
  render();
})();
