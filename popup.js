// Popup da extensão: lista as opções do radial do site atual (e do anel Geral) e permite adicionar novas
// (ação pronta, atalho de teclado gravado ou bookmarklet criado na página de configurações).
const $ = (id) => document.getElementById(id);
const E = window.RADIAL_EDITOR;
const S = window.RADIAL_STORE;
const I = window.RADIAL_I18N;
const t = (s, v) => I.t(s, v);

let toastTimer;
function toast(text, isError) {
  const el = $('toast');
  el.textContent = text;
  el.className = 'show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2000);
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
    Object.assign(document.createElement('b'), { textContent: name || '—' }),
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
  await I.ready;
  I.apply();
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
  const general = window.RADIAL_SITES.find((s) => s.id === 'general');
  const host = E.hostKey(url.hostname);
  const known = site.id !== 'general';
  const ringId = known ? site.id : 'host:' + host;
  $('siteName').textContent = known ? I.label(site.name) : host;
  $('siteSub').textContent = known ? host : t('Site not in the list · own ring');

  const PAGE = 5, LIMIT = 10;
  const builtins = known ? site.actions : [];
  const customIn = async (id) => (await S.list()).filter((o) => (o.ctx || []).includes(id));
  const limitMsg = async () => ((builtins.length + (await customIn(ringId)).length) >= LIMIT
    ? t('Limit of {max} options in this ring (2 radials of 5). Remove one first.', { max: LIMIT }) : null);

  // ----- Listas: um cartão por anel (este site e Geral); grupos de 5 = um radial cada -----
  async function renderRing(box, id, title, builtinList) {
    const custom = await customIn(id);
    const entries = [
      ...builtinList.map((a) => ({ li: () => row(I.label(a.label), t('Default'), '', true) })),
      ...custom.map((o) => ({ li: () => customRow(o, id) }))
    ];
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = '<div class="card-head"><h2></h2><p class="lead"></p></div>';
    card.querySelector('h2').textContent = title;
    card.querySelector('.lead').textContent = t('{n}/{max} options', { n: entries.length, max: LIMIT });
    const ul = document.createElement('ul');
    ul.className = 'list';
    entries.forEach((en, i) => {
      if (i % PAGE === 0) {
        const h = document.createElement('li');
        h.className = 'group-head';
        h.textContent = i < LIMIT ? t('Radial {n}', { n: i / PAGE + 1 }) : t('Over the limit (not shown)');
        ul.appendChild(h);
      }
      ul.appendChild(en.li());
    });
    if (!entries.length) ul.appendChild(Object.assign(document.createElement('li'), { className: 'empty-state', textContent: t('No options in this ring yet.') }));
    card.appendChild(ul);
    box.appendChild(card);
    return entries.length;
  }

  async function renderList() {
    const box = $('rings');
    box.textContent = '';
    const n = await renderRing(box, ringId, known ? t('{name} ring', { name: I.label(site.short) }) : t('This site ring'), builtins);
    await renderRing(box, 'general', t('General ring (all sites)'), general.actions);
    $('addBtn').disabled = n >= LIMIT;
  }

  function customRow(o, id) {
    const sub = o.type === 'keys' ? (o.keys || []).map(E.comboText).join(' › ')
      : o.type === 'js' ? t('Bookmarklet') + (o.shortcut ? ' · ' + E.comboText(o.shortcut) : '') : t('Ready-made action');
    const shown = o.type === 'action' && o.ref ? I.label(o.ref.label) : o.name;
    const li = row(shown, o.type === 'keys' ? t('Keys') : o.type === 'js' ? 'JS' : t('Action'), sub);
    if (o.type === 'keys') li.append(iconButton(t('Edit {name}', { name: o.name }), 'edit', '', () => { openAdd('keys'); editor.edit(o); }));
    li.append(iconButton(t('Remove {name} from the radial', { name: o.name }), 'trash', 'danger', async () => {
      const ctx = (o.ctx || []).filter((c) => c !== id);
      if (!ctx.length && o.type !== 'js') await S.remove(o.id); // bookmarklets continuam salvos nas configurações
      else await S.save({ ...o, ctx });
      toast(t('Removed from the radial.'));
      renderList();
      fillBookmarklets();
    }));
    return li;
  }

  // ----- Ações prontas: campo com busca (datalist) -----
  const actionMap = new Map(); // texto exibido -> { site, label (pt), i }
  function fillActions() {
    const dl = $('actionList');
    dl.textContent = '';
    const order = [...window.RADIAL_SITES].sort((a, b) => (b.id === 'general') - (a.id === 'general'));
    order.filter((s) => s.id !== site.id).forEach((s) => {
      s.actions.forEach((a) => {
        const text = I.label(a.label) + ' · ' + I.label(s.name);
        actionMap.set(text, { site: s.id, label: a.label });
        dl.appendChild(Object.assign(document.createElement('option'), { value: text }));
      });
    });
  }
  $('saveAction').onclick = async () => {
    const typed = $('actionInput').value.trim().toLowerCase();
    let hit = actionMap.get($('actionInput').value.trim());
    if (!hit && typed) {
      const found = [...actionMap.keys()].filter((k) => k.toLowerCase().includes(typed));
      if (found.length === 1) hit = actionMap.get(found[0]);
    }
    if (!hit) return toast(t('Pick an action from the list.'), true);
    const lim = await limitMsg();
    if (lim) return toast(lim, true);
    const dup = (await S.list()).some((o) => o.type === 'action' && o.ref && o.ref.site === hit.site && o.ref.label === hit.label && (o.ctx || []).includes(ringId));
    if (dup) return toast(t('This action is already in the ring.'), true);
    await S.save({ type: 'action', name: hit.label, ref: hit, ctx: [ringId] });
    $('actionInput').value = '';
    toast(t('Added.'));
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
    toast(t('Added to the radial.'));
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

  I.apply($('addCard'));
  fillActions();
  fillBookmarklets();
  renderList();

  $('openNow').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'open-radial-tab', tabId: tab.id });
    window.close();
  };
})();
