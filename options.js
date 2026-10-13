// Página de configurações: tema, gatilhos do menu e bookmarklets (chrome.storage.sync).
// Sites vêm de sites.js (window.RADIAL_SITES): id + nome.
const CTX_NAMES = Object.fromEntries(window.RADIAL_SITES.map((s) => [s.id, s.name]));
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

// ---------- Bookmarklets ----------
let editingIndex = null;
let editingExtraCtx = []; // contextos de sites que não existem mais: preservados ao editar

async function loadAll() {
  const all = await chrome.storage.sync.get(null);
  return Object.keys(all)
    .filter((k) => /^bm_\d+$/.test(k))
    .map((k) => ({ index: Number(k.slice(3)), ...all[k] }))
    .sort((a, b) => a.index - b.index);
}

function nextFreeIndex(items) {
  const used = new Set(items.map((b) => b.index));
  for (let i = 1; i <= 64; i++) if (!used.has(i)) return i;
  return '';
}

function updateCount() {
  const n = document.querySelectorAll('#ctx input:checked').length;
  $('ctxCount').textContent = n ? '· ' + n + ' selecionado' + (n > 1 ? 's' : '') : '';
}

// Monta os chips de contexto (um por site).
function buildCtx() {
  const box = $('ctx');
  window.RADIAL_SITES.forEach((s) => {
    const label = document.createElement('label');
    label.className = 'chip';
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.value = s.id;
    c.onchange = updateCount;
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.textContent = s.name;
    label.append(c, pill);
    box.appendChild(label);
  });
  $('ctxFilter').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    box.querySelectorAll('.chip').forEach((l) => { l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  };
}

function setCtx(list) {
  document.querySelectorAll('#ctx input').forEach((c) => { c.checked = list.includes(c.value); });
  updateCount();
}

function resetForm(items) {
  editingIndex = null;
  editingExtraCtx = [];
  $('formTitle').textContent = 'Novo bookmarklet';
  $('save').textContent = 'Salvar bookmarklet';
  $('index').value = nextFreeIndex(items);
  $('name').value = '';
  $('code').value = '';
  setCtx(['general']);
}

function fillForm(b) {
  editingIndex = b.index;
  editingExtraCtx = (b.ctx || []).filter((c) => !(c in CTX_NAMES));
  $('formTitle').textContent = 'Editando #' + b.index;
  $('save').textContent = 'Salvar alterações';
  $('index').value = b.index;
  $('name').value = b.name || '';
  $('code').value = b.code || '';
  setCtx(b.ctx || []);
  $('name').focus();
  $('formTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function iconButton(label, path, cls, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn icon ' + cls;
  b.title = label;
  b.setAttribute('aria-label', label);
  b.append(svgIcon(path));
  b.onclick = onclick;
  return b;
}

async function render() {
  const items = await loadAll();
  const ul = $('list');
  ul.textContent = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.append(svgIcon(ICON.code));
    const p = document.createElement('p');
    p.textContent = 'Nenhum bookmarklet salvo ainda. Cadastre o primeiro acima.';
    li.append(p);
    ul.appendChild(li);
  }
  items.forEach((b) => {
    const li = document.createElement('li');
    li.className = 'item';
    const idx = Object.assign(document.createElement('span'), { className: 'idx', textContent: '#' + b.index });
    const info = document.createElement('div');
    info.className = 'info';
    const name = Object.assign(document.createElement('b'), { textContent: b.name || '(sem nome)' });
    const tags = document.createElement('div');
    tags.className = 'tags';
    const ctxs = [...(b.ctx || [])];
    if (!ctxs.length) ctxs.push('');
    ctxs.forEach((c) => {
      tags.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: CTX_NAMES[c] || c || 'Sem anel' }));
    });
    info.append(name, tags);
    const edit = iconButton('Editar ' + (b.name || '#' + b.index), ICON.edit, '', () => fillForm(b));
    const del = iconButton('Excluir ' + (b.name || '#' + b.index), ICON.trash, 'danger', async () => {
      if (!confirm('Excluir "' + (b.name || '#' + b.index) + '"?')) return;
      await chrome.storage.sync.remove('bm_' + b.index);
      toast('Bookmarklet excluído.');
      const rest = await render();
      if (editingIndex === b.index) resetForm(rest);
    });
    li.append(idx, info, edit, del);
    ul.appendChild(li);
  });
  return items;
}

$('save').onclick = async () => {
  const index = Number($('index').value);
  const name = $('name').value.trim();
  const code = $('code').value.trim();
  const ctx = [...document.querySelectorAll('#ctx input:checked')].map((c) => c.value).concat(editingExtraCtx);
  if (!Number.isInteger(index) || index < 1 || index > 64) return toast('O índice deve ser de 1 a 64.', true);
  if (!name) return toast('Dê um nome ao bookmarklet.', true);
  if (!code) return toast('O código está vazio.', true);
  if (!ctx.length) return toast('Escolha ao menos um anel.', true);
  const existing = await loadAll();
  if (index !== editingIndex && existing.some((b) => b.index === index) &&
      !confirm('Já existe um bookmarklet no índice ' + index + '. Substituir?')) return;
  try {
    await chrome.storage.sync.set({ ['bm_' + index]: { name, code, ctx } });
    // Mudou o índice de um bookmarklet em edição: remove o antigo (é uma mudança, não uma cópia).
    if (editingIndex !== null && editingIndex !== index) await chrome.storage.sync.remove('bm_' + editingIndex);
  } catch (e) {
    // Limite do sync: ~8 KB por item.
    return toast('Não foi possível salvar (código grande demais?): ' + e.message, true);
  }
  const items = await render();
  resetForm(items);
  toast('Salvo no índice ' + index + '.');
};

$('reset').onclick = async () => { resetForm(await loadAll()); };

// ---------- Gatilho do menu (mouse e tecla) ----------
const DEFAULTS = { mouse: 'none', holdMs: 350, key: null };
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
    toast('Salvo.');
  } catch (e) {
    toast('Não foi possível salvar: ' + e.message, true);
  }
}

function showCfg() {
  document.querySelectorAll('input[name="mouseTrig"]').forEach((r) => { r.checked = r.value === cfg.mouse; });
  $('holdMs').value = cfg.holdMs;
  $('holdOut').textContent = cfg.holdMs + ' ms';
  $('holdBox').style.display = cfg.mouse === 'right-hold' ? '' : 'none';
  const t = keyText(cfg.key);
  $('keyShow').textContent = t || 'Nenhuma';
  $('keyShow').className = t ? '' : 'empty';
}

function stopRecording() {
  recording = false;
  $('recKey').classList.remove('recording');
  $('recTxt').textContent = 'Gravar tecla';
}

document.querySelectorAll('input[name="mouseTrig"]').forEach((r) => {
  r.onchange = () => { if (r.checked) { cfg.mouse = r.value; showCfg(); saveCfg(); } };
});
$('holdMs').oninput = () => { $('holdOut').textContent = $('holdMs').value + ' ms'; };
$('holdMs').onchange = () => { cfg.holdMs = Number($('holdMs').value) || 350; showCfg(); saveCfg(); };
$('clearKey').onclick = () => { cfg.key = null; stopRecording(); showCfg(); saveCfg(); };
$('chromeKeys').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
$('recKey').onclick = () => {
  if (recording) { stopRecording(); return; }
  recording = true;
  $('recKey').classList.add('recording');
  $('recTxt').textContent = 'Pressione a tecla… (Esc cancela)';
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
initTheme();
buildCtx();
(async () => {
  const r = await chrome.storage.sync.get('settings');
  cfg = { ...DEFAULTS, ...(r.settings || {}) };
  showCfg();
  resetForm(await render());
})();
