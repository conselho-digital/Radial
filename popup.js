// Popup da extensão: lista as opções do radial do site atual e permite adicionar novas
// (ação pronta, atalho de teclado gravado ou bookmarklet criado na página de configurações).
const $ = (id) => document.getElementById(id);
const E = window.RADIAL_EDITOR;
const S = window.RADIAL_STORE;

let toastTimer;
function toast(text, isError) {
  const t = $('toast');
  t.textContent = text;
  t.className = 'show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 2000);
}

// Aba do site: a ativa; se o popup foi aberto como aba (teste), a última aba de site comum.
async function currentTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active || !(active.url || '').startsWith(chrome.runtime.getURL(''))) return active;
  const tabs = await chrome.tabs.query({ currentWindow: true, url: ['http://*/*', 'https://*/*'] });
  return tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}

function iconButton(label, path, cls, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn icon ' + cls;
  b.title = b.ariaLabel = label;
  b.innerHTML = E.icon_(path);
  b.onclick = onclick;
  return b;
}

function row(name, badgeText, sub, muted) {
  const li = document.createElement('li');
  li.className = 'item';
  const info = document.createElement('div');
  info.className = 'info';
  const head = document.createElement('div');
  head.className = 'item-head';
  head.append(
    Object.assign(document.createElement('b'), { textContent: name || '(sem nome)' }),
    Object.assign(document.createElement('span'), { className: 'badge' + (muted ? ' muted' : ''), textContent: badgeText }));
  info.append(head);
  if (sub) {
    const d = document.createElement('div');
    d.className = 'help';
    d.style.marginTop = '2px';
    d.textContent = sub;
    info.append(d);
  }
  li.append(info);
  return li;
}

(async () => {
  $('openOpts').onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };
  await S.migrate();

  const tab = await currentTab();
  let url = null;
  try { url = tab && new URL(tab.url); } catch (_) { /* url inválida */ }
  if (!url || !/^https?:$/.test(url.protocol)) {
    $('unsupported').classList.remove('hidden');
    $('main').classList.add('hidden');
    return;
  }

  const site = window.RADIAL_DETECT(url);
  const host = E.hostKey(url.hostname);
  const known = site.id !== 'general';
  const ringId = known ? site.id : 'host:' + host;
  $('siteName').textContent = known ? site.name : host;
  $('siteSub').textContent = known ? host : 'Site fora da lista · anel próprio';

  const builtins = known ? site.actions : [];

  // ----- Lista (grupos de 5: cada grupo é um radial; limite de 10 por anel) -----
  const PAGE = 5, LIMIT = 10;
  const customIn = async () => (await S.list()).filter((o) => (o.ctx || []).includes(ringId));
  const ringTotal = async () => builtins.length + (await customIn()).length;
  const limitMsg = async () => ((await ringTotal()) >= LIMIT ? 'Limite de ' + LIMIT + ' opções neste anel (2 radiais de 5). Remova uma antes.' : null);

  async function renderList() {
    const custom = await customIn();
    const ul = $('list');
    ul.textContent = '';
    const entries = [
      ...builtins.map((a) => ({ li: () => row(a.label, 'Padrão', '', true) })),
      ...custom.map((o) => ({ li: () => customRow(o) }))
    ];
    $('savedLead').textContent = (known ? 'Anel de ' + site.short + '. ' : 'Anel só deste site. ') + entries.length + '/' + LIMIT + ' opções.';
    entries.forEach((en, i) => {
      if (i % PAGE === 0) {
        const h = document.createElement('li');
        h.className = 'group-head';
        h.textContent = i < LIMIT ? 'Radial ' + (i / PAGE + 1) : 'Fora do limite (não aparecem)';
        ul.appendChild(h);
      }
      ul.appendChild(en.li());
    });
    if (!entries.length) ul.appendChild(Object.assign(document.createElement('li'), { className: 'empty-state', textContent: 'Nenhuma opção neste anel ainda.' }));
    $('addBtn').disabled = entries.length >= LIMIT;
  }

  function customRow(o) {
    const sub = o.type === 'keys' ? (o.keys || []).map(E.comboText).join(' › ')
      : o.type === 'js' ? 'Bookmarklet' + (o.shortcut ? ' · ' + E.comboText(o.shortcut) : '') : 'Ação pronta';
    const li = row(o.name, o.type === 'keys' ? 'Teclas' : o.type === 'js' ? 'JS' : 'Ação', sub);
    if (o.type === 'keys') li.append(iconButton('Editar ' + o.name, 'edit', '', () => { openAdd('keys'); editor.edit(o); }));
    li.append(iconButton('Remover ' + o.name + ' do radial', 'trash', 'danger', async () => {
      const ctx = (o.ctx || []).filter((c) => c !== ringId);
      if (!ctx.length && o.type !== 'js') await S.remove(o.id); // bookmarklets continuam salvos nas configurações
      else await S.save({ ...o, ctx });
      toast('Removida do radial.');
      renderList();
      fillBookmarklets();
    }));
    return li;
  }

  // ----- Ações prontas (todas as do registro, menos as que o anel já tem) -----
  function fillActions() {
    const sel = $('actionSel');
    sel.textContent = '';
    const order = [...window.RADIAL_SITES].sort((a, b) => (b.id === 'general') - (a.id === 'general'));
    order.filter((s) => s.id !== site.id).forEach((s) => {
      const g = document.createElement('optgroup');
      g.label = s.name;
      s.actions.forEach((a, i) => g.appendChild(Object.assign(document.createElement('option'), { value: s.id + '|' + i, textContent: a.label })));
      sel.appendChild(g);
    });
  }
  $('saveAction').onclick = async () => {
    const lim = await limitMsg();
    if (lim) return toast(lim, true);
    const [sid, i] = $('actionSel').value.split('|');
    const a = window.RADIAL_SITES.find((s) => s.id === sid).actions[Number(i)];
    const dup = (await S.list()).some((o) => o.type === 'action' && o.ref && o.ref.site === sid && o.ref.label === a.label && (o.ctx || []).includes(ringId));
    if (dup) return toast('Esta ação já está no anel.', true);
    await S.save({ type: 'action', name: a.label, ref: { site: sid, label: a.label }, ctx: [ringId] });
    toast('Adicionada.');
    renderList();
  };

  // ----- Bookmarklets salvos -----
  async function fillBookmarklets() {
    const free = (await S.list()).filter((o) => o.type === 'js' && !(o.ctx || []).includes(ringId));
    const sel = $('bmSel');
    sel.textContent = '';
    free.forEach((o) => sel.appendChild(Object.assign(document.createElement('option'), { value: o.id, textContent: o.name + (o.shortcut ? ' (' + E.comboText(o.shortcut) + ')' : '') })));
    $('bmEmpty').classList.toggle('hidden', free.length > 0);
    sel.classList.toggle('hidden', !free.length);
    $('saveBm').classList.toggle('hidden', !free.length);
  }
  $('saveBm').onclick = async () => {
    const lim = await limitMsg();
    if (lim) return toast(lim, true);
    const o = await S.get($('bmSel').value);
    if (!o) return;
    await S.save({ id: $('bmSel').value, ...o, ctx: [...(o.ctx || []), ringId] });
    toast('Adicionado ao radial.');
    renderList();
    fillBookmarklets();
  };
  $('openOpts2').onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };

  // ----- Atalho de teclado (editor compartilhado, só teclas) -----
  const editor = E.mount($('editor'), {
    fixed: { id: ringId, name: $('siteName').textContent }, keysOnly: true, toast, canAdd: limitMsg,
    onChange: () => { renderList(); }
  });

  // ----- Painel "Nova opção" -----
  function showKind() {
    const k = $('kind').value;
    $('pAction').classList.toggle('hidden', k !== 'action');
    $('pKeys').classList.toggle('hidden', k !== 'keys');
    $('pBm').classList.toggle('hidden', k !== 'bm');
  }
  function openAdd(kind) {
    $('addCard').classList.remove('hidden');
    if (kind) $('kind').value = kind;
    showKind();
    $('addCard').scrollIntoView({ block: 'nearest' });
  }
  $('kind').onchange = showKind;
  $('addBtn').onclick = () => (($('addCard').classList.contains('hidden')) ? openAdd() : $('addCard').classList.add('hidden'));

  fillActions();
  fillBookmarklets();
  renderList();

  $('openNow').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'open-radial-tab', tabId: tab.id });
    window.close();
  };
})();
