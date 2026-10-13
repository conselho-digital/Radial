// Painel de opções: CRUD de bookmarklets em chrome.storage.sync (chaves bm_1 … bm_64).
const CTX_NAMES = { general: 'Geral', sheets: 'Planilhas', docs: 'Docs', teams: 'Teams' };
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

(async () => { resetForm(await render()); })();
