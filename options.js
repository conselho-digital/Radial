// Painel de opções: CRUD de bookmarklets em chrome.storage.sync (chaves bm_1 … bm_64).
// Sites vêm de sites.js (window.RADIAL_SITES): id + nome.
const CTX_NAMES = Object.fromEntries(window.RADIAL_SITES.map((s) => [s.id, s.name]));
const $ = (id) => document.getElementById(id);

function setMsg(text, kind) {
  const m = $('msg');
  m.textContent = text || '';
  m.className = kind || '';
}

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
  return 64;
}

// Monta os checkboxes de contexto (um por site).
function buildCtx() {
  const box = $('ctx');
  window.RADIAL_SITES.forEach((s) => {
    const l = document.createElement('label');
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.value = s.id;
    l.append(c, ' ' + s.name);
    box.appendChild(l);
  });
  $('ctxFilter').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    box.querySelectorAll('label').forEach((l) => { l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  };
}

function resetForm(items) {
  $('formTitle').textContent = 'Novo bookmarklet';
  $('index').value = nextFreeIndex(items);
  $('name').value = '';
  $('code').value = '';
  document.querySelectorAll('#ctx input').forEach((c) => { c.checked = c.value === 'general'; });
}

function fillForm(b) {
  $('formTitle').textContent = 'Editando #' + b.index;
  $('index').value = b.index;
  $('name').value = b.name || '';
  $('code').value = b.code || '';
  document.querySelectorAll('#ctx input').forEach((c) => { c.checked = (b.ctx || []).includes(c.value); });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function render() {
  const items = await loadAll();
  const ul = $('list');
  ul.textContent = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nenhum bookmarklet salvo ainda.';
    ul.appendChild(li);
  }
  items.forEach((b) => {
    const li = document.createElement('li');
    const idx = Object.assign(document.createElement('span'), { className: 'idx', textContent: b.index });
    const info = document.createElement('div');
    info.className = 'info';
    const name = Object.assign(document.createElement('b'), { textContent: b.name || '(sem nome)' });
    const small = Object.assign(document.createElement('small'),
      { textContent: (b.ctx || []).map((c) => CTX_NAMES[c] || c).join(' · ') || 'Sem anel' });
    info.append(name, small);
    const edit = Object.assign(document.createElement('button'), { textContent: 'Editar' });
    edit.onclick = () => fillForm(b);
    const del = Object.assign(document.createElement('button'), { textContent: 'Excluir', className: 'danger' });
    del.onclick = async () => {
      await chrome.storage.sync.remove('bm_' + b.index);
      setMsg('Excluído.', 'ok');
      await render();
    };
    li.append(idx, info, edit, del);
    ul.appendChild(li);
  });
  return items;
}

$('save').onclick = async () => {
  const index = Number($('index').value);
  const name = $('name').value.trim();
  const code = $('code').value.trim();
  const ctx = [...document.querySelectorAll('#ctx input:checked')].map((c) => c.value);
  if (!Number.isInteger(index) || index < 1 || index > 64) return setMsg('Índice deve ser de 1 a 64.', 'err');
  if (!name) return setMsg('Dê um nome ao bookmarklet.', 'err');
  if (!code) return setMsg('O código está vazio.', 'err');
  if (!ctx.length) return setMsg('Escolha ao menos um anel.', 'err');
  try {
    await chrome.storage.sync.set({ ['bm_' + index]: { name, code, ctx } });
  } catch (e) {
    // Limite do sync: ~8 KB por item.
    return setMsg('Não foi possível salvar (código grande demais?): ' + e.message, 'err');
  }
  const items = await render();
  resetForm(items);
  setMsg('Salvo no índice ' + index + '.', 'ok');
};

$('reset').onclick = async () => { resetForm(await loadAll()); setMsg(''); };

buildCtx();
(async () => { resetForm(await render()); })();

// ---------- Gatilho do menu (mouse e tecla) ----------
const DEFAULTS = { mouse: 'none', holdMs: 350, key: null };
let cfg = { ...DEFAULTS };
let recording = false;

function keyText(k) {
  if (!k || !k.code) return 'nenhuma';
  const name = k.code.replace(/^Key/, '').replace(/^Digit/, '');
  return [k.ctrl && 'Ctrl', k.alt && 'Alt', k.shift && 'Shift', k.meta && 'Cmd', name].filter(Boolean).join('+');
}

async function saveCfg() {
  await chrome.storage.sync.set({ settings: cfg });
  $('msg2').textContent = ' Salvo.';
  setTimeout(() => { $('msg2').textContent = ''; }, 1500);
}

function showCfg() {
  $('mouseTrig').value = cfg.mouse;
  $('holdMs').value = cfg.holdMs;
  $('holdBox').style.display = cfg.mouse === 'right-hold' ? '' : 'none';
  $('keyShow').textContent = keyText(cfg.key);
}

$('mouseTrig').onchange = () => { cfg.mouse = $('mouseTrig').value; showCfg(); saveCfg(); };
$('holdMs').onchange = () => {
  cfg.holdMs = Math.min(1500, Math.max(150, Number($('holdMs').value) || 350));
  showCfg(); saveCfg();
};
$('clearKey').onclick = () => { cfg.key = null; showCfg(); saveCfg(); };
$('chromeKeys').onclick = () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
$('recKey').onclick = () => {
  recording = true;
  $('recKey').textContent = 'Pressione a tecla… (Esc cancela)';
};

window.addEventListener('keydown', (e) => {
  if (!recording) return;
  e.preventDefault();
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return; // espera a tecla principal
  recording = false;
  $('recKey').textContent = 'Gravar tecla';
  if (e.key === 'Escape') return;
  cfg.key = { code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
  showCfg(); saveCfg();
}, true);

chrome.storage.sync.get('settings').then((r) => { cfg = { ...DEFAULTS, ...(r.settings || {}) }; showCfg(); });
