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
  const customIn = async (...ids) => (await S.list()).filter((o) => (o.ctx || []).some((c) => ids.includes(c)));
  // Site fora da lista: um só anel (Geral + opções do domínio); site conhecido: o anel do site.
  const merged = !known;
  const generalDefaults = general.actions.filter((a) => !a.opt);
  const mainBuiltins = merged ? generalDefaults : builtins;
  const mainIds = [ringId, 'general'];
  const mainOrderKey = known ? site.id : ringId;
  const limitMsg = async () => (((await visibleBuiltins(mainBuiltins, known ? site.id : 'general', mainOrderKey)).length + (await customIn(...mainIds)).length) >= LIMIT
    ? t('Limit of {max} options in this ring (2 radials of 5). Remove one first.', { max: LIMIT }) : null);

  // ----- Listas: um cartão por anel (este site e Geral); grupos de 5 = um radial cada -----
  // Opções padrão que o usuário não escondeu neste anel.
  async function visibleBuiltins(list, siteId, orderKey) {
    const hidden = await S.getHidden(orderKey);
    return list.filter((a) => !hidden.includes('b:' + siteId + ':' + a.label));
  }

  // Anel com alça de arrastar: a ordem (padrão + suas) é salva por anel e vale também no radial.
  // Um só anel: padrões do site, suas opções e, por último, os padrões do Geral (se o site é conhecido).
  async function renderRing(box, ids, title, builtinList, builtinSite, orderKey, tailBuiltins = []) {
    const custom = await customIn(...ids);
    const hiddenKeys = await S.getHidden(orderKey);
    const mk = (list, sid) => list.map((a) => ({ a, key: 'b:' + sid + ':' + a.label }));
    const head = mk(builtinList, builtinSite), tail = mk(tailBuiltins, 'general');
    const hideBtn = (b) => iconButton(t('Hide {name} from this ring', { name: I.label(b.a.label) }), 'hide', '', async () => {
      await S.setHidden(orderKey, [...hiddenKeys, b.key]);
      renderList();
    });
    const builtinEntry = (b) => ({ key: b.key, li: () => { const li = row(I.label(b.a.label), t('Default'), '', true); li.append(hideBtn(b)); return li; }, name: I.label(b.a.label) });
    let entries = [
      ...head.filter((b) => !hiddenKeys.includes(b.key)).map(builtinEntry),
      ...custom.map((o) => ({ key: 'o:' + o.id, li: () => customRow(o, ids), name: o.name })),
      ...tail.filter((b) => !hiddenKeys.includes(b.key)).map(builtinEntry)
    ];
    entries = S.applyOrder(entries, await S.getOrder(orderKey));
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = '<div class="card-head"><h2></h2><p class="lead"></p></div>';
    card.querySelector('h2').textContent = title;
    card.querySelector('.lead').textContent = t('{n}/{max} options', { n: entries.length, max: LIMIT });
    const ul = document.createElement('ul');
    ul.className = 'list';

    const move = async (key, toIndex) => {
      const keys = entries.map((e) => e.key).filter((k) => k !== key);
      keys.splice(Math.max(0, Math.min(keys.length, toIndex)), 0, key);
      await S.setOrder(orderKey, keys);
      await renderList();
    };

    entries.forEach((en, i) => {
      if (i % PAGE === 0) {
        const h = document.createElement('li');
        h.className = 'group-head';
        h.textContent = i < LIMIT ? t('Radial {n}', { n: i / PAGE + 1 }) : t('Over the limit (not shown)');
        ul.appendChild(h);
      }
      const li = en.li();
      li.dataset.key = en.key;
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'grip';
      grip.title = grip.ariaLabel = t('Reorder {name} (drag, or use the arrow keys)', { name: en.name });
      grip.innerHTML = E.icon_('grip');
      // Só a alça inicia o arraste (o resto da linha não).
      grip.onmousedown = () => { li.draggable = true; };
      grip.onmouseup = () => { li.draggable = false; };
      grip.onkeydown = (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        move(en.key, i + (e.key === 'ArrowUp' ? -1 : 1)).then(() => {
          const g = $('rings').querySelector('[data-key="' + CSS.escape(en.key) + '"] .grip');
          if (g) g.focus();
        });
      };
      li.prepend(grip);
      li.ondragstart = (e) => { e.dataTransfer.setData('text/plain', en.key); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); };
      li.ondragend = () => { li.draggable = false; li.classList.remove('dragging'); ul.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after')); };
      li.ondragover = (e) => {
        e.preventDefault();
        const r = li.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        ul.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
        li.classList.add(before ? 'drop-before' : 'drop-after');
      };
      li.ondrop = (e) => {
        e.preventDefault();
        const dragged = e.dataTransfer.getData('text/plain');
        const r = li.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        if (!dragged || dragged === en.key) return;
        const keys = entries.map((x) => x.key).filter((k) => k !== dragged);
        let idx = keys.indexOf(en.key) + (before ? 0 : 1);
        keys.splice(idx, 0, dragged);
        S.setOrder(orderKey, keys).then(renderList);
      };
      ul.appendChild(li);
    });
    if (!entries.length) ul.appendChild(Object.assign(document.createElement('li'), { className: 'empty-state', textContent: t('No options in this ring yet.') }));
    card.appendChild(ul);
    // Padrões escondidos: ficam listados (sem contar no limite) para poder restaurar.
    const hiddenList = [...head, ...tail].filter((b) => hiddenKeys.includes(b.key));
    if (hiddenList.length) {
      const h = document.createElement('p');
      h.className = 'group-head';
      h.style.marginTop = '12px';
      h.textContent = t('Hidden default options');
      card.appendChild(h);
      const hu = document.createElement('ul');
      hu.className = 'list';
      hiddenList.forEach((b) => {
        const li = row(I.label(b.a.label), t('Hidden'), '', true);
        li.style.opacity = '.7';
        li.append(iconButton(t('Restore {name}', { name: I.label(b.a.label) }), 'undo', '', async () => {
          await S.setHidden(orderKey, hiddenKeys.filter((k) => k !== b.key));
          renderList();
        }));
        hu.appendChild(li);
      });
      card.appendChild(hu);
    }
    box.appendChild(card);
    return entries.length;
  }

  const showRadial = () => chrome.runtime.sendMessage({ type: 'open-radial-tab', tabId: tab.id, preview: true }).catch(() => {});

  async function renderList() {
    const box = $('rings');
    box.textContent = '';
    const n = await renderRing(box, mainIds, known ? t('{name} ring', { name: I.label(site.short) }) : t('General ring + this site'),
      mainBuiltins, known ? site.id : 'general', known ? site.id : ringId, known ? generalDefaults : []);
    $('addBtn').disabled = (await limitMsg()) !== null && n >= LIMIT;
    showRadial();
  }

  function customRow(o, ids) {
    const sub = o.type === 'keys' ? (o.keys || []).map(E.comboText).join(' › ')
      : o.type === 'js' ? t('Bookmarklet') + (o.shortcut ? ' · ' + E.comboText(o.shortcut) : '') : t('Ready-made action');
    const shown = o.type === 'action' && o.ref ? I.label(o.ref.label) : o.name;
    const li = row(shown, o.type === 'keys' ? t('Keys') : o.type === 'js' ? 'JS' : t('Action'), sub);
    if (o.type === 'keys') li.append(iconButton(t('Edit {name}', { name: o.name }), 'edit', '', () => { openAdd('keys'); editor.edit(o); }));
    li.append(iconButton(t('Remove {name} from the radial', { name: o.name }), 'trash', 'danger', async () => {
      const ctx = (o.ctx || []).filter((c) => !ids.includes(c));
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

  // ----- Tamanhos (no fim do popup): mexer aqui refaz o radial de pré-visualização na hora -----
  const sizeDefaults = { size: 380, contentScale: 1.5 };
  const cur = { ...sizeDefaults, ...((await chrome.storage.sync.get('settings')).settings || {}) };
  $('pSize').value = cur.size;
  $('pSizeOut').textContent = cur.size + ' px';
  $('pContent').value = Math.round(cur.contentScale * 100);
  $('pContentOut').textContent = Math.round(cur.contentScale * 100) + '%';
  let sizeTimer = null;
  const saveSizes = () => {
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(async () => {
      const latest = (await chrome.storage.sync.get('settings')).settings || {};
      await chrome.storage.sync.set({ settings: { ...latest, size: Number($('pSize').value) || 380, contentScale: (Number($('pContent').value) || 150) / 100 } });
      setTimeout(showRadial, 120); // dá tempo da página receber as configurações novas
    }, 120);
  };
  $('pSize').oninput = () => { $('pSizeOut').textContent = $('pSize').value + ' px'; saveSizes(); };
  $('pTpl').checked = !!cur.emailTpl;
  $('pTpl').onchange = async () => {
    const latest = (await chrome.storage.sync.get('settings')).settings || {};
    await chrome.storage.sync.set({ settings: { ...latest, emailTpl: $('pTpl').checked } });
  };
  $('pContent').oninput = () => { $('pContentOut').textContent = $('pContent').value + '%'; saveSizes(); };

  I.apply($('addCard'));
  fillActions();
  fillBookmarklets();
  renderList();

  // Mostra o radial no meio da página enquanto o popup está aberto; ele é refeito a cada mudança aqui
  // e some quando o popup fecha.
  const previewPort = chrome.runtime.connect({ name: 'popup-preview' });
  previewPort.postMessage({ tabId: tab.id });
})();
