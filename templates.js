// Cartão "Email templates" no Dynamics: mostra os templates usados recentemente abaixo do cartão
// "Attachments" de um e-mail em rascunho, e aplica o escolhido com um clique.
// Sem acesso direto à lista, o script faz o caminho que você faz à mão (Insert Template > Select Record >
// Regarding > Select > Email templates), com as janelas escondidas, lê "Recently used" e fecha com Cancel.
(() => {
  if (window.__radialTplLoaded && window.__radialTplLoaded()) return;
  window.__radialTplLoaded = () => { try { return !!chrome.runtime.id; } catch (_) { return false; } };

  const I = window.RADIAL_I18N;
  const tr = (s, v) => I.t(s, v);
  const STORE_KEY = 'tpl_recent';
  const CACHE_MS = 2 * 60 * 60 * 1000;       // lê a lista do Dynamics de novo a cada 2 horas
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => !!(el && (el.offsetParent !== null || el.getClientRects().length));

  const OLD_QUEUES = 'Tier 2 | eMobility Tier2\nTier 3 | eMobility TS SiD\nSiFlex Team | eMobility TS SiFlex Team\nFlex Team | eMobility TS Flex Team\nTS Legacy Team | eMobility TS Legacy Siemens Team';
  const PREV_QUEUES = 'Tier 2 | eMobility Tier2\nTier 3 | eMobility TS SiD\nSiFlex | eMobility TS SiFlex Team\nFlex | eMobility TS Flex Team\nTS Legacy | eMobility TS Legacy Siemens Team';
  const PREV2_QUEUES = 'Tier 2 | eMobility Tier2\nTier 3 | eMobility TS SiD\nSiFlex | eMobility TS SiFlex Team | L\nFlex | eMobility TS Flex Team | L\nTS Legacy | eMobility TS Legacy Siemens Team';
  const PREV3_QUEUES = 'Tier 2 | eMobility Tier2 | NQ\nTier 3 | eMobility TS SiD\nSiFlex | eMobility TS SiFlex Team | L\nFlex | eMobility TS Flex Team | L\nTS Legacy | eMobility TS Legacy Siemens Team';
  const PREV4_QUEUES = 'Tier 2 | eMobility Tier2 | NQ\nTier 3 | eMobility TS SiD\nSiFlex | eMobility TS SiFlex | L\nFlex | eMobility TS Flex | L\nTS Legacy | eMobility TS Legacy Siemens';
  const DEFAULT_QUEUES = 'Tier 2 | eMobility Tier2 | Q=eMobility Inbound Queue\nTier 3 | eMobility TS SiD\nSiFlex | eMobility TS SiFlex | L\nFlex | eMobility TS Flex | L\nTS Legacy | eMobility TS Legacy Siemens';
  const HOST = 'isp.crm4.dynamics.com';
  const QUEUE_NAME = 'eMobility Support Queue';
  let settings = { emailTpl: true, removeQueue: true, rcBtn: false, ticketBtn: true, shareCopy: true, assignBtns: true, assignQueues: DEFAULT_QUEUES, emailTplKeep: 15, emailTplSee: 8 };
  const hostKey = () => location.hostname.toLowerCase().replace(/^www\./, '');
  const hostOk = () => hostKey() === HOST || hostKey().endsWith('.' + HOST);
  const enabled = () => !!settings.emailTpl && hostOk();

  // ---------- Esperas e buscas por texto ----------
  async function waitFor(fn, ms = 6000, step = 100) {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 > ms) return null;
      await sleep(step);
    }
  }
  const labelOf = (el) => norm(el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent);
  function findClickable(root, re) {
    return [...root.querySelectorAll('button, [role="button"], [role="menuitem"], [role="option"], a')]
      .find((el) => visible(el) && re.test(labelOf(el)));
  }
  const dialogs = () => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], .ms-Dialog, .fui-DialogSurface, .ms-Modal')].filter(visible);
  const dialogWith = (re) => dialogs().find((d) => re.test(norm(d.textContent)));

  // Enquanto lê, as janelas ficam invisíveis (não piscam na tela). Só dura alguns segundos.
  const HIDE_ID = 'radial-tpl-hide';
  function hideDialogs(on) {
    let st = document.getElementById(HIDE_ID);
    if (!on) { if (st) st.remove(); return; }
    if (st) return;
    st = document.createElement('style');
    st.id = HIDE_ID;
    st.textContent = '[role="dialog"],[role="alertdialog"],[role="listbox"],.ms-Dialog,.ms-Modal,.ms-Overlay,.fui-DialogSurface,.fui-DialogBody,.ms-Layer,.ms-Callout,.fui-Popover-surface{opacity:0!important;pointer-events:none!important;transition:none!important;animation:none!important}';
    document.head.appendChild(st);
  }

  // Clique com a sequência completa de eventos (o Dynamics ignora .click() puro em alguns botões).
  function realClick(el) {
    const o = { bubbles: true, cancelable: true, view: window, button: 0 };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((t) => {
      el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o));
    });
  }
  let lastDebug = '';
  const outline = (el) => el ? el.outerHTML.replace(/\s+(class|style|data-tabster)="[^"]*"/g, '').slice(0, 2500) : '(none)';

  class StepError extends Error { constructor(step) { super(step); this.step = step; } }

  // Abre "Email templates": Insert Template, e se aparecer "Select Record" escolhe Regarding > Select.
  const tplDialog = () => [...document.querySelectorAll('[data-id="EmailTemplateDialog"]')].find(visible);
  const selDialog = () => {
    const f = [...document.querySelectorAll('button[data-id="fieldname_id.fieldControl-option-set-select"]')].find(visible);
    for (let n = f; n && n !== document.body; n = n.parentElement) if (n.querySelector('button[data-id="select_id"]')) return n;
    return dialogWith(/Select Record/i);
  };
  async function openTemplatesDialog() {
    const insertBtn = () => [...document.querySelectorAll('button[data-id$="InsertConvertTemplateMenu"]')].find((b) => visible(b) && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
    const btn = await waitFor(insertBtn, 3000);
    if (!btn) throw new StepError('Insert Template button');
    realClick(btn);
    const first = await waitFor(() => tplDialog() || selDialog(), 6000);
    if (!first) throw new StepError('Select Record / Email templates window');

    const sel = tplDialog() ? null : selDialog();
    if (sel) {
      const fieldSel = 'button[data-id="fieldname_id.fieldControl-option-set-select"]';
      const field = await waitFor(() => [...document.querySelectorAll(fieldSel)].find(visible), 8000);
      if (!field) throw new StepError('Field Name dropdown');
      if (!/regarding/i.test(field.value || field.title || field.textContent)) {
        realClick(field);
        const opt = await waitFor(() => [...document.querySelectorAll('[role="option"]')].find((o) => visible(o) && /^regarding$/i.test(norm(o.textContent))), 3000);
        if (!opt) throw new StepError('Regarding option');
        realClick(opt);
        // confirma que o dropdown realmente ficou em "Regarding" antes de seguir
        const ok = await waitFor(() => { const f = [...document.querySelectorAll(fieldSel)].find(visible); return f && /regarding/i.test(f.value || f.title || f.textContent); }, 4000);
        if (!ok) throw new StepError('Regarding not selected');
      }
      const select = await waitFor(() => { const b = findClickable(selDialog() || document, /^select$/i); return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' ? b : null; }, 6000);
      if (!select) throw new StepError('Select button');
      realClick(select);
    }
    const dlg = await waitFor(() => { const d = tplDialog(); return d && d.querySelector('input[type="radio"]') ? d : null; }, 12000);
    if (!dlg) throw new StepError('Email templates window');
    return dlg;
  }

  // Linhas do template: radios "RecentItemSectionID_n" (usados recentemente) e "OtherSectionID…_n" (todos).
  function templateRows(dlg) {
    return [...dlg.querySelectorAll('input[type="radio"]')].map((radio) => {
      const box = radio.closest('.ms-ChoiceField') || radio.parentElement;
      const name = norm((box.querySelector('.titleText') || {}).textContent);
      const type = norm((box.querySelector('.sectionSubtext') || {}).textContent);
      const section = /RecentItemSectionID/.test(radio.id) ? 'recent' : 'all';
      return { section, name, type, radio, label: box.querySelector('label') };
    }).filter((r) => r.name);
  }
  const closeDialog = (dlg) => { const c = dlg.querySelector('button[data-id="cancel_id"]') || findClickable(dlg, /^cancel$/i); if (c) realClick(c); };

  let busy = false;
  async function withDialog(fn) {
    if (busy) return null;
    busy = true;
    hideDialogs(true);
    let dlg = null;
    try {
      dlg = await openTemplatesDialog();
      return await fn(dlg);
    } catch (e) {
      lastDebug = 'Step: ' + (e.step || e.message) + '\n\nDialogs:\n' + [tplDialog(), selDialog()].filter(Boolean).map((d) => outline(d).slice(0, 2500)).join('\n---\n');
      throw e;
    } finally {
      try { [tplDialog(), selDialog()].filter(Boolean).forEach(closeDialog); } catch (_) { /* ignora */ }
      await sleep(250);
      hideDialogs(false);
      busy = false;
    }
  }

  async function readRecent() {
    return withDialog(async (dlg) => {
      const items = templateRows(dlg).filter((r) => r.section === 'recent').map(({ name, type }) => ({ name, type }));
      return items;
    });
  }
  async function applyTemplate(name) {
    return withDialog(async (dlg) => {
      const row = templateRows(dlg).find((r) => r.name === name);
      if (!row) throw new StepError('template "' + name + '" in the list');
      realClick(row.label || row.radio);
      if (!(await waitFor(() => row.radio.checked, 3000))) throw new StepError('template not selected');
      const apply = await waitFor(() => { const b = findClickable(dlg, /^apply template$/i); return b && !b.disabled && b.getAttribute('aria-disabled') !== 'true' ? b : null; }, 4000);
      if (!apply) throw new StepError('Apply template button');
      realClick(apply);
      // o Dynamics pergunta se troca o assunto: confirma com OK (só aparece se houver assunto)
      const ok = await waitFor(() => [...document.querySelectorAll('button[data-id="confirmButton"]')].find(visible), 2500);
      if (ok) realClick(ok);
      await waitFor(() => !document.contains(dlg) || !visible(dlg), 6000);
      return true;
    });
  }

  // ---------- Cartão ----------
  const CSS = `
    :host{all:initial;display:block;margin-top:12px;font-family:"Segoe UI",system-ui,sans-serif}
    .card{border:1px solid #d1d1d1;border-radius:5px;padding:8px 10px 10px;background:transparent;color:inherit;font-size:13px}
    .head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
    .head b{font-size:14px;font-weight:600}
    .ref{border:0;background:none;cursor:pointer;font-size:15px;padding:2px 6px;border-radius:4px;color:inherit}
    .ref:hover{background:rgba(127,127,127,.2)}
    .it{display:block;width:100%;text-align:left;border:1px solid transparent;background:rgba(127,127,127,.08);border-radius:4px;padding:6px 8px;margin-top:4px;cursor:pointer;color:inherit;font:inherit}
    .it:hover{background:rgba(0,120,212,.16);border-color:#0078d4}
    .it b{display:block;font-weight:600;font-size:13px}
    .it span{display:block;font-size:11px;opacity:.7}
    .msg{font-size:12px;opacity:.75;margin-top:6px}
    .err{color:#c4314b;opacity:1}
    .dbg{border:0;background:none;color:#0078d4;cursor:pointer;font-size:12px;padding:0;text-decoration:underline}
    .list{overflow-y:auto;overscroll-behavior:contain;padding-right:2px}
    .busy .it{opacity:.5;pointer-events:none}`;
  // Histórico: guarda os últimos templates vistos em "Recently used" ou aplicados pelo cartão.
  // O cartão mostra em ordem alfabética: os primeiros ficam visíveis e o resto aparece rolando a lista.
  let hist = [];
  const maxShown = () => Math.min(30, Math.max(1, parseInt(settings.emailTplKeep, 10) || 15));
  const showCount = () => Math.min(30, Math.max(1, parseInt(settings.emailTplSee, 10) || 8));
  // Guarda os últimos N usados e mostra em ordem alfabética.
  const rank = () => [...hist].sort((a, b) => b.last - a.last).slice(0, maxShown())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  let readAt = 0;   // última vez que a lista foi lida do Dynamics
  const saveHist = () => chrome.storage.local.set({ [STORE_KEY]: { items: hist.slice(0, 80), t: Date.now(), r: readAt } });
  function seen(list) {
    const now = Date.now();
    list.forEach((it, i) => {
      let e = hist.find((h) => h.name === it.name);
      if (!e) hist.push((e = { name: it.name, type: it.type, count: 0, last: 0 }));
      e.type = it.type || e.type;
      e.last = Math.max(e.last, now - i * 1000);   // o 1º da lista do Dynamics é o mais recente
    });
  }
  function used(it) {
    let e = hist.find((h) => h.name === it.name);
    if (!e) hist.push((e = { name: it.name, type: it.type, count: 0, last: 0 }));
    e.count++; e.last = Date.now();
  }
  let host = null, root = null, items = [], status = '', lastErr = null, working = false;

  function render() {
    if (!root) return;
    root.innerHTML = '';
    const style = document.createElement('style'); style.textContent = CSS; root.appendChild(style);
    const card = document.createElement('div'); card.className = 'card' + (working ? ' busy' : '');
    const head = document.createElement('div'); head.className = 'head';
    const title = document.createElement('b'); title.textContent = tr('Email templates');
    const ref = document.createElement('button'); ref.className = 'ref'; ref.type = 'button'; ref.textContent = '↻'; ref.title = tr('Refresh');
    ref.onclick = () => refresh(true);
    head.append(title, ref); card.appendChild(head);
    const list = document.createElement('div'); list.className = 'list';
    items.forEach((it) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'it';
      const n = document.createElement('b'); n.textContent = it.name;
      b.appendChild(n);
      if (it.type) { const s = document.createElement('span'); s.textContent = it.type; b.appendChild(s); }
      b.onclick = () => apply(it);
      list.appendChild(b);
    });
    card.appendChild(list);
    if (!items.length && !working && !lastErr) { const m = document.createElement('div'); m.className = 'msg'; m.textContent = tr('No recent templates found.'); card.appendChild(m); }
    if (status) { const m = document.createElement('div'); m.className = 'msg'; m.textContent = status; card.appendChild(m); }
    if (lastErr) {
      const m = document.createElement('div'); m.className = 'msg err'; m.textContent = tr('Could not read the templates: {step}', { step: lastErr.step || lastErr.message }) + ' ';
      const d = document.createElement('button'); d.type = 'button'; d.className = 'dbg'; d.textContent = tr('Copy debug info');
      d.onclick = copyDebug; m.appendChild(d); card.appendChild(m);
    }
    root.appendChild(card);
    // mostra só os primeiros N itens; o resto aparece rolando
    const kids = list.children, n = showCount();
    if (kids.length > n) list.style.maxHeight = (kids[n - 1].getBoundingClientRect().bottom - list.getBoundingClientRect().top + 2) + 'px';
  }

  async function copyDebug() {
    const info = ['URL: ' + location.href, lastDebug || '(no snapshot)', 'Insert Template: ' + outline(document.querySelector('button[data-id$="InsertConvertTemplateMenu"]'))].join('\n\n');
    try { await navigator.clipboard.writeText(info); status = tr('Debug info copied.'); } catch (_) { status = '—'; }
    render();
  }

  async function refresh(force) {
    if (working || !enabled()) return;
    working = true; status = tr('Updating…'); lastErr = null; render();
    try {
      const list = await readRecent();
      if (list) {
        readAt = Date.now();
        seen(list);
        hist.sort((a, b) => b.last - a.last);
        hist = hist.slice(0, 80);
        items = rank();
        await saveHist();
      }
      status = '';
    } catch (e) { lastErr = e; status = ''; console.warn('Radial: templates', e); }
    working = false; render();
  }

  // "eMob - Case Handover RC NEW": troca "RC-XX" no corpo pelo código de 2 letras do título (".../AT-[...").
  const RC_TEMPLATE = /^eMob - Case Handover RC NEW$/i;
  // Título do ticket: "...-DC/SI-D/SA-[Y2/..." -> carregador "SI-D" e país "SA".
  const KNOWN_CHARGERS = ['SI-D', 'SI-UC', 'VC3', 'FLEX', 'RAPID', 'MOBILE', 'LEG'];
  function titleInfo() {
    for (const h of document.querySelectorAll('[data-id="header_title"], h1[id^="formHeaderTitle"]')) {
      const m = /\/([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\/([A-Za-z]{2})-\[/.exec(h.getAttribute('title') || h.textContent || '');
      if (m && visible(h)) {
        const raw = m[1].toUpperCase().replace(/^MOB$/, 'MOBILE');
        return { country: m[2].toUpperCase(), charger: KNOWN_CHARGERS.includes(raw) ? raw : 'OTHER', raw };
      }
    }
    return null;
  }
  const countryCode = () => (titleInfo() || {}).country || null;
  function editorDocs() {
    const docs = [document];
    document.querySelectorAll('iframe').forEach((f) => { try { if (f.contentDocument && f.contentDocument.body) docs.push(f.contentDocument); } catch (_) { /* outro domínio */ } });
    return docs;
  }
  // Seleciona só o "XX" de cada "RC-XX" e digita o código por cima (o editor do e-mail aceita digitação, não edição direta do DOM).
  function replaceXX(code) {
    let n = 0;
    for (const doc of editorDocs()) {
      const roots = doc === document ? [...doc.querySelectorAll('[contenteditable="true"]')] : [doc.body];
      for (const root of roots) {
        for (let guard = 0; guard < 20; guard++) {
          const w = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          let hit = null, idx = -1;
          for (let t = w.nextNode(); t; t = w.nextNode()) { idx = t.nodeValue.search(/RC-XX(?![A-Za-z])/); if (idx >= 0) { hit = t; break; } }
          if (!hit) break;
          if (doc === document && root.focus) root.focus({ preventScroll: true });
          const r = doc.createRange(); r.setStart(hit, idx + 3); r.setEnd(hit, idx + 5);
          const sel = (doc.defaultView || window).getSelection(); sel.removeAllRanges(); sel.addRange(r);
          if (!doc.execCommand('insertText', false, code)) break;
          n++;
        }
      }
    }
    return n;
  }
  async function fillRC() {
    const code = countryCode();
    if (!code) throw new StepError('country code in the title');
    let n = 0, t0 = Date.now();
    while (!n && Date.now() - t0 < 10000) {
      try { n = ((await chrome.runtime.sendMessage({ type: 'tpl-fix-rc', code })) || {}).n || 0; } catch (_) { /* ignora */ }
      if (!n) n = replaceXX(code);   // plano B: digita por cima (editores comuns)
      if (!n) await sleep(500);
    }
    if (!n) throw new StepError('"RC-XX" in the email body');
    return code;
  }

  // "eMob - first response NEW" e "eMob - First response missing info NEW": tira o item vazio "Troubleshooting:".
  const WIPE_TEMPLATE = /^eMob - (first response NEW|Missing Information Request NEW)$/i;   // sem "Original Message": apaga tudo
  const TS_TEMPLATE = /^eMob - (first response NEW|First response missing info NEW)$/i;
  async function dropTroubleshooting() {
    let n = 0, t0 = Date.now();
    while (!n && Date.now() - t0 < 8000) {
      try { n = ((await chrome.runtime.sendMessage({ type: 'tpl-drop-ts' })) || {}).n || 0; } catch (_) { /* ignora */ }
      if (!n) await sleep(500);
    }
    if (!n) throw new StepError('"Troubleshooting" item in the email body');
  }

  // Assunto do e-mail: apaga tudo que vier antes do "ID<número>" ("RE: ID0547734-…" vira "ID0547734-…").
  // Roda uma vez quando o rascunho abre e de novo depois de aplicar um template (o template pode reescrever o assunto).
  const SUBJECT = 'input[data-id="subject.fieldControl-text-box-text"]';
  function cleanSubject(inp) {
    const v = inp.value, m = /\bID\d+/.exec(v);
    if (!m) return null;                                   // ainda sem ID: pode estar carregando
    if (m.index > 0) { typeInto(inp, v.slice(m.index)); inp.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  }
  async function fixSubject() {
    const inp = await waitFor(() => qv(SUBJECT), 3000);
    if (!inp) return;
    await sleep(600);
    for (let n = 0; n < 2; n++) { cleanSubject(inp); await sleep(500); }
  }
  const subjectSeen = new WeakMap();
  function subjectTick() {
    if (!hostOk()) return;                 // não depende do cartão de templates
    const s = isEmailDraft();
    if (!s) return;
    let st = subjectSeen.get(s);
    if (!st) subjectSeen.set(s, (st = { t0: Date.now(), done: false }));
    if (st.done || Date.now() - st.t0 > 15000) return;
    const inp = qv(SUBJECT);
    if (inp && cleanSubject(inp)) st.done = true;
  }

  // Posição de rolagem da página (e de qualquer área rolável) antes de aplicar o template: o editor leva o cursor
  // para o fim do texto e a tela desce; depois de aplicar, volta para onde estava.
  function scrollSnap() {
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      if (el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 0 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) out.push([el, el.scrollTop, el.scrollLeft]);
    }
    const se = document.scrollingElement;
    if (se) out.push([se, se.scrollTop, se.scrollLeft]);
    return out;
  }
  const scrollBack = (snap) => snap.forEach(([el, t, l]) => { try { el.scrollTop = t; el.scrollLeft = l; } catch (_) { /* ignora */ } });

  async function apply(it) {
    if (working) return;
    working = true; status = tr('Applying…'); lastErr = null; render();
    const snap = scrollSnap();
    try {
      try { await chrome.runtime.sendMessage({ type: 'tpl-clear-top', wipeAll: WIPE_TEMPLATE.test(it.name) }); } catch (_) { /* segue sem limpar */ }
      await applyTemplate(it.name);
      await fixSubject();
      used(it); items = rank(); await saveHist();
      if (RC_TEMPLATE.test(it.name)) await fillRC();
      if (TS_TEMPLATE.test(it.name)) await dropTroubleshooting();
      status = '';
    } catch (e) { lastErr = e; status = ''; console.warn('Radial: templates', e); }
    working = false; render();
    scrollBack(snap);
    // o editor ainda pode rolar logo depois: volta de novo
    setTimeout(() => scrollBack(snap), 400);
    setTimeout(() => scrollBack(snap), 1200);
  }

  // ---------- Página de e-mail em rascunho ----------
  const attachmentsSection = () => document.querySelector('section[data-id="attachments"][aria-label="Attachments"], section[data-id="attachments"]');
  const isEmailDraft = () => {
    const s = attachmentsSection();
    if (!s || !/\|email/i.test((s.querySelector('[data-lp-id]') || {}).getAttribute?.('data-lp-id') || '')) return null;
    return document.querySelector('button[data-id$="InsertConvertTemplateMenu"]') ? s : null;
  };

  let loadedCache = false;
  // Remove o destinatário indicado (padrão: a fila "eMobility Support Queue") do campo "To" de um rascunho novo.
  // Roda uma vez por rascunho: se você adicionar de novo depois, ele não mexe.
  const queueSeen = new WeakMap();
  function dropQueue() {
    if (!settings.removeQueue || !hostOk()) return;
    const s = isEmailDraft();
    if (!s) return;
    let st = queueSeen.get(s);
    if (!st) queueSeen.set(s, (st = { t0: Date.now(), done: false }));
    if (st.done || Date.now() - st.t0 > 15000) return;
    const want = QUEUE_NAME.toLowerCase();
    if (!want) return;
    const tag = [...document.querySelectorAll('[data-id="to.fieldControl-LookupResultsDropdown_to_selected_tag"]')]
      .find((t) => visible(t) && norm(t.getAttribute('title') || t.textContent).toLowerCase() === want);
    if (!tag) return;
    const del = tag.parentElement && tag.parentElement.querySelector('[data-id="to.fieldControl-LookupResultsDropdown_to_selected_tag_delete"]');
    if (!del) return;
    st.done = true;
    realClick(del);
  }

  // ---------- Botão "Insert RC" ao lado de "To" ----------
  // Pega o país do título (".../FR-[..."), procura o contato na lista (planilha) e coloca o e-mail em "To".
  const TO_INPUT = 'input[data-id="to.fieldControl-LookupResultsDropdown_to_textInputBox_with_filter_new"]';
  const TO_TAG = '[data-id="to.fieldControl-LookupResultsDropdown_to_selected_tag"]';
  let rcHost = null, rcBusy = false, toastHost = null;

  function toast(lines, isErr, ms) {
    if (toastHost) toastHost.remove();
    toastHost = document.createElement('div');
    const r = toastHost.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `.t{position:fixed;top:72px;right:24px;z-index:2147483000;max-width:420px;background:#fff;color:#222;border:1px solid #d1d1d1;border-left:5px solid ${isErr ? '#c4314b' : '#0078d4'};border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.25);padding:12px 36px 12px 14px;font:13px/1.45 "Segoe UI",system-ui,sans-serif}
      .t b{display:block;font-weight:600}.t p{margin:6px 0 0;white-space:pre-wrap}.x{position:absolute;top:6px;right:8px;border:0;background:none;font-size:18px;cursor:pointer;color:#555}
      @media(prefers-color-scheme:dark){.t{background:#292929;color:#eee;border-color:#555}.x{color:#bbb}}`;
    const box = document.createElement('div'); box.className = 't'; box.setAttribute('role', 'alert');
    lines.forEach((l, i) => { const e = document.createElement(i === 0 ? 'b' : 'p'); e.textContent = l; box.appendChild(e); });
    const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.textContent = '×'; x.onclick = () => toastHost.remove();
    box.appendChild(x); r.append(st, box); document.body.appendChild(toastHost);
    const ttl = ms || (isErr ? 15000 : 0);
    if (ttl) { const mine = toastHost; setTimeout(() => { if (toastHost === mine) { mine.remove(); toastHost = null; } }, ttl); }
  }

  const nativeSet = (el, v) => Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
  const tagEls = () => [...document.querySelectorAll(TO_TAG)];
  const tagTexts = () => tagEls().map((t) => norm(t.getAttribute('title') || t.textContent).toLowerCase());
  // Já está no campo? O Dynamics troca o e-mail pelo nome do contato (às vezes com "(Away)"), então compara os dois.
  const hasRecipient = (c) => tagTexts().some((t) => t.includes(c.email.toLowerCase()) || (c.name && t.includes(norm(c.name).toLowerCase())));

  // Digita como uma pessoa: seleciona o que houver no campo e escreve por cima (gera os eventos normais de digitação).
  function typeInto(input, text) {
    input.focus();
    input.select();
    if (!document.execCommand('insertText', false, text)) {      // plano B se o navegador recusar
      nativeSet(input, text);
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    }
  }
  // Seleciona o texto que sobrou no campo e apaga.
  function wipeInput(input) {
    input.focus();
    input.select();
    if (!document.execCommand('delete')) { nativeSet(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); }
  }

  const KEYCODES = { Enter: 13, ArrowDown: 40 };
  function pressKey(el, k) {
    ['keydown', 'keypress', 'keyup'].forEach((t) => el.dispatchEvent(new KeyboardEvent(t, { key: k, code: k, keyCode: KEYCODES[k] || 0, which: KEYCODES[k] || 0, bubbles: true, cancelable: true })));
  }
  // A lista de resultados do Dynamics mostra o e-mail do contato em uma das linhas; "No records found" quando não há.
  const dropdownRow = (input, email) => [...document.querySelectorAll('li,div,span,p')].some((e) => e !== input && e.children.length === 0 && visible(e) && norm(e.textContent).toLowerCase().includes(email));
  const dropdownEmpty = () => [...document.querySelectorAll('li,div,span,p')].some((e) => e.children.length === 0 && visible(e) && /^no records found/i.test(norm(e.textContent)));

  // Escreve o e-mail, espera a lista de resultados aparecer, aperta Enter (escolhe a primeira opção) e limpa o campo.
  async function addRecipient(c) {
    const input = document.querySelector(TO_INPUT);
    if (!input) throw new StepError('To box');
    const email = c.email.toLowerCase();
    realClick(input);
    typeInto(input, c.email);
    const found = await waitFor(() => dropdownRow(input, email) || (dropdownEmpty() ? 'none' : false), 7000, 150);
    if (found === true) {
      await sleep(300);              // deixa a lista terminar de montar
      pressKey(input, 'Enter');
      await sleep(900);
    }
    wipeInput(input);
    await sleep(300);
    return found === true;
  }

  async function insertRC() {
    if (rcBusy) return;
    rcBusy = true;
    const btn = rcHost && rcHost.shadowRoot.querySelector('button');
    if (btn) btn.disabled = true;
    try {
      const info = titleInfo(), code = info && info.country;
      if (!code) return toast([tr('Insert RC'), tr('Could not find the country code in the email title.')], true);
      const res = await chrome.runtime.sendMessage({ type: 'rc-find', code, charger: info.charger });
      if (!res || !res.ok) return toast([tr('Insert RC'), (res && res.error) || tr('Could not read the list.')], true);
      if (!res.rows.length) return toast([tr('Insert RC'), tr('No contact for {code} ({charger}) in the list.', { code, charger: info.charger })], true);
      const done = [], failed = [];
      const empty = tagEls().length === 0;             // To vazio: não precisa conferir, só insere
      const seenMail = new Set();
      for (const c of res.rows) {
        if (seenMail.has(c.email.toLowerCase())) continue;
        seenMail.add(c.email.toLowerCase());
        if (!empty && hasRecipient(c)) continue;       // já está (pelo e-mail ou pelo nome): não faz nada
        (await addRecipient(c).catch(() => false) ? done : failed).push(c);
      }
      const notes = done.filter((c) => c.comment).map((c) => (c.name ? c.name + ' (' + c.email + '): ' : '') + c.comment);
      if (failed.length) toast([tr('Insert RC'), tr('Could not add: {list}', { list: failed.map((c) => c.email).join(', ') })].concat(notes), true);
      else if (notes.length) toast([tr('Comment'), ...notes]);
    } finally {
      rcBusy = false;
      if (btn) btn.disabled = false;
    }
  }

  function rcTick() {
    const on = settings.rcBtn && hostOk() && isEmailDraft();
    if (!on) { if (rcHost) { rcHost.remove(); rcHost = null; } return; }
    const label = document.querySelector('label[id$="-to-field-label"]');
    if (!label || !label.parentElement) return;
    if (rcHost && rcHost.isConnected && rcHost.previousElementSibling === label) return;
    if (rcHost) rcHost.remove();
    rcHost = document.createElement('div');
    const r = rcHost.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = ':host{display:block;margin-top:6px}button{font:400 14px "Segoe UI",system-ui,sans-serif;white-space:nowrap;min-width:104px;padding:6px 20px;border:1px solid #8a8886;border-radius:4px;background:#f0f0f0;color:#242424;cursor:pointer}button:hover{background:#e1e1e1}button:disabled{opacity:.6;cursor:default}';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = tr('Insert RC'); b.onclick = () => insertRC();
    r.append(st, b);
    label.insertAdjacentElement('afterend', rcHost);
  }


  // ---------- Botão "Ticket": monta o título do caso (ID, carregador, país, serial) ----------
  // Lê o país; sem país, abre o bookmarklet 📋 (pergunta o país e mostra os modelos com NULL).
  // Com país: visita a aba Product (família do produto, serial do asset e Device ID), volta para Main e
  // abre uma janela com o resto do título para você editar; Apply grava o título e o Charger ID.
  const CHARGERS = [
    { key: 'SI-D', color: '#b3dbff', area: 'DC', label: 'Sicharge D' }, { key: 'SI-UC', color: '#b3f0b3', area: 'DC', label: 'SiCharge UC' },
    { key: 'AC22', color: '#e8c4ff', area: 'AC', label: 'Sicharge AC22' }, { key: 'VC3', color: '#ffe3a6', area: 'AC', label: 'Versicharge' },
    { key: 'RC', color: '#ffd1dc', area: 'DC', label: 'RC' }, { key: 'FLEX', color: '#d6d8d8', area: 'DC', label: 'Flex' }, { key: 'RAPID', color: '#bee5eb', area: 'DC', label: 'Rapid' },
    { key: 'MOB', area: 'DC', label: 'Mobile', color: '#cce5ff' }, { key: 'LEG', color: '#e2e3e5', area: 'DC', label: 'Legacy' }, { key: 'other', color: '#ffccb3', area: 'DC', label: 'Other' }
  ];
  const SOFTWARE = [
    { key: 'Si-Charge', label: 'Sifinity Charge', color: '#d1ecf1' }, { key: 'Si-Control', label: 'Sifinity Control', color: '#e2e3e5' },
    { key: 'Si-Depot', label: 'Sifinity Depot', alias: 'depotfinity', color: '#fff3cd' }, { key: 'Si-Fleet', label: 'Sifinity Fleet', color: '#d4edda' },
    { key: 'Si-Go', label: 'Sifinity Go', color: '#f8d7da' }, { key: 'Si-Setup', label: 'Sifinity Setup', color: '#e0cffc' }
  ];
  const detectSoftware = (name) => { const n = fold(name); return SOFTWARE.find((x) => n.includes(fold(x.label)) || n.includes(fold(x.key)) || (x.alias && n.includes(x.alias))) || null; };
  function detectCharger(name) {
    const n = String(name || '').toLowerCase();
    const pick = (k) => CHARGERS.find((c) => c.key === k);
    if (/\buc\b/.test(n)) return pick('SI-UC');
    if (/ac\s*22/.test(n)) return pick('AC22');
    if (/versicharge|vc3/.test(n)) return pick('VC3');
    if (/si-?charge\s*d\b|si-d\b/.test(n)) return pick('SI-D');
    if (/\brc\b/.test(n)) return pick('RC');
    if (/flex/.test(n)) return pick('FLEX');
    if (/rapid/.test(n)) return pick('RAPID');
    if (/mobile/.test(n)) return pick('MOB');
    if (/legacy|\bleg\b/.test(n)) return pick('LEG');
    if (/unity/.test(n)) return pick('other');
    return null;   // família desconhecida: a janela pergunta
  }
  const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  // Regiões reais (sem códigos antigos como FX, que o Intl também chama de "France"); nome repetido: vale o primeiro.
  const OLD_REGIONS = new Set(['AC', 'AN', 'BU', 'CP', 'CS', 'DD', 'DG', 'EA', 'EU', 'EZ', 'FX', 'IC', 'NT', 'QO', 'SF', 'SU', 'TA', 'TP', 'UN', 'XA', 'XB', 'XK', 'YD', 'YU', 'ZR', 'ZZ', 'DY', 'HV', 'NH', 'RH', 'UK', 'VD']);
  function regionNames() {
    const out = [], seen = new Set();
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'region' });
      for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
        const c = String.fromCharCode(a, b);
        if (OLD_REGIONS.has(c)) continue;
        const n = dn.of(c);
        if (!n || n === c || seen.has(n)) continue;
        seen.add(n); out.push({ name: n, code: c });
      }
    } catch (_) { /* sem Intl.DisplayNames */ }
    return out;
  }
  let cmap = null;
  function countryToCode(name) {
    if (!cmap) {
      cmap = new Map();
      regionNames().forEach((r) => cmap.set(fold(r.name), r.code));
      Object.entries({ bosnia: 'BA', korea: 'KR', 'brunei darussalam': 'BN', 'russian federation': 'RU', 'viet nam': 'VN', 'syrian arab republic': 'SY',
        'republic of north macedonia': 'MK', malvinas: 'FK', turkiye: 'TR', 'cabo verde': 'CV', congo: 'CG', laos: 'LA', moldova: 'MD', micronesia: 'FM',
        palestine: 'PS', iran: 'IR', tanzania: 'TZ', venezuela: 'VE', bolivia: 'BO', taiwan: 'TW', macao: 'MO', "cote d'ivoire": 'CI', 'virgin islands': 'VI',
        'united kingdom': 'GB', 'united states': 'US', czechia: 'CZ', eswatini: 'SZ', 'timor-leste': 'TL', 'hong kong': 'HK' }).forEach(([k, v]) => cmap.set(k, v));
    }
    return cmap.get(fold(name)) || null;
  }
  const qv = (sel) => [...document.querySelectorAll(sel)].find(visible);
  const FAM_SEL = '[data-id="sie_productfamilyid.fieldControl-LookupResultsDropdown_sie_productfamilyid_selected_tag_text"]';
  const TITLE_SEL = 'input[data-id="title.fieldControl-text-box-text"]';
  const textOf = (e) => norm(e && (e.getAttribute('title') || e.innerText || e.textContent));
  const countryName = () => textOf(document.querySelector('[data-id="sie_countryofcharger.fieldControl-LookupResultsDropdown_sie_countryofcharger_selected_tag_text"]') || document.querySelector('[id*="sie_countryofcharger"][id*="selected_tag_text"]'));
  function ticketId() {
    const e = document.querySelector('[data-id="ticketnumber.fieldControl-text-box-text"]') || document.querySelector('[id*="ticketnumber"][id*="text-input-component"]');
    const v = norm(e && (e.value || e.textContent));
    if (v) return v;
    const t = document.querySelector(TITLE_SEL);
    const m = t && /^ID\s*(\d+)/i.exec(t.value);
    return m ? m[1] : '';
  }
  function assetSerial() {
    for (const c of document.querySelectorAll('[data-automationid="ListCell"]')) {
      const h = visible(c) && c.querySelector('span[class*="headerText"] .ms-TooltipHost');
      const n = h && [...h.childNodes].find((x) => x.nodeType === 3 && norm(x.nodeValue));
      if (n) return norm(n.nodeValue);
    }
    // Tabela (ag-grid): o código muda com a resolução, então procura a célula com ou sem visibilidade confirmada.
    const cells = [...document.querySelectorAll('[col-id="sie_serialnumber"]')];
    for (const c of cells.filter(visible).concat(cells)) {
      const l = c.querySelector('label');
      const h = c.querySelector('.ms-TooltipHost');
      const t = h && [...h.childNodes].find((x) => x.nodeType === 3 && norm(x.nodeValue));
      const v = norm((l && l.getAttribute('aria-label')) || (t && t.nodeValue) || c.textContent);
      if (v && !/^serial/i.test(v) && !emptyText(v)) return v;
    }
    return '';
  }
  // Campo vazio: o Dynamics põe "Select to enter data" no title, então só vale o value.
  const emptyText = (v) => !v || /^(select to enter data|---)$/i.test(v);
  const deviceId = () => { const i = qv('input[aria-label="Device ID"]'); const v = i ? norm(i.value) : ''; return emptyText(v) ? '' : v; };

  // Países para escolher quando o campo "Country of Charger" está vazio.
  const countryList = () => regionNames().sort((x, y) => x.name.localeCompare(y.name));
  // Escreve no campo de busca do Dynamics, espera a lista, Enter na primeira opção.
  // Primeira linha do resultado que contém o texto (a linha clicável, não só o trecho de texto).
  const firstRow = (input, text) => {
    const leaf = [...document.querySelectorAll('li,div,span,p')].find((e) => e !== input && e.children.length === 0 && visible(e) && norm(e.textContent).toLowerCase().includes(text));
    return leaf ? (leaf.closest('[role="option"],[role="treeitem"],li') || leaf) : null;
  };
  // Escreve e espera a lista. Sem done(): Enter na primeira opção (campos de país, Insert RC). Com done(): clica direto
  // na primeira linha que contém o texto (rápido e certo); se não escolheu, Enter; se ainda não, seta para baixo + Enter.
  async function pickLookup(input, text, typed, done) {
    realClick(input);
    typeInto(input, typed || text);
    const want = text.toLowerCase();
    const found = await waitFor(() => dropdownRow(input, want), 7000, 100);
    if (!found) { wipeInput(input); await sleep(300); return false; }
    if (!done) { await sleep(300); pressKey(input, 'Enter'); await sleep(900); return true; }
    await sleep(120);
    const row = firstRow(input, want);
    if (row) realClick(row);
    if (await waitFor(done, 1200, 40)) return true;
    pressKey(input, 'Enter');
    if (await waitFor(done, 1000, 40)) return true;
    pressKey(input, 'ArrowDown'); await sleep(200); pressKey(input, 'Enter');
    await waitFor(done, 1200, 40);
    return true;
  }
  const COUNTRY_INPUT = 'input[data-id*="sie_countryofcharger"][data-id*="textInputBox"], [data-id*="sie_countryofcharger"] input[type="text"], [id*="sie_countryofcharger"] input[type="text"]';

  // Depois de gravar o título: abre a etapa do processo (New Enquiry), garante o Status Reason "New Enquiry",
  // lê "Warranty Confirmed?" e copia o valor para "Warranty claimed by Customer" na aba Main.
  const STAGE = '[data-id^="MscrmControls.Containers.ProcessBreadCrumb-stageNameContainer"]';
  const WARR_FLY = 'button[data-id="header_process_sie_warrantycode.fieldControl-option-set-select"]';
  const STATUS_FLY = 'button[data-id="header_process_statuscode.fieldControl-option-set-select"]';
  const WARR_MAIN = 'button[data-id="sie_warrantyclaimedbycustomercode.fieldControl-option-set-select"]';
  const ddValue = (b) => norm(b.getAttribute('value') || b.getAttribute('title') || b.textContent);
  async function chooseOption(btn, text) {
    realClick(btn);
    const want = text.toLowerCase();
    const opt = await waitFor(() => [...document.querySelectorAll('[role="option"]')].find((o) => visible(o) && norm(o.textContent).toLowerCase() === want), 4000);
    if (!opt) throw new Error(tr('Option "{name}" not found.', { name: text }));
    realClick(opt);
    await sleep(500);
  }
  // Fecha o quadro da etapa e confere que fechou: Escape, depois clique fora, depois clique na etapa.
  async function closeStage(stage) {
    const open = () => qv(WARR_FLY) || qv(STATUS_FLY);
    const attempts = [
      () => { for (const t of [document.activeElement, document.body, document]) t && t.dispatchEvent && t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true })); },
      () => realClick(document.body),
      () => realClick(stage),
    ];
    for (const go of attempts) {
      if (!open()) return;
      go();
      if (!(await waitFor(() => !open(), 700, 50))) continue;
      return;
    }
  }
  async function syncStage() {
    const stage = qv(STAGE);
    if (!stage) throw new Error(tr('Process stage not found.'));
    realClick(stage);
    const warr = await waitFor(() => qv(WARR_FLY), 5000);
    if (!warr) throw new Error(tr('Warranty Confirmed? not found.'));
    const warrantyValue = ddValue(warr);
    const status = qv(STATUS_FLY);
    if (status && ddValue(status).toLowerCase() !== 'new enquiry') await chooseOption(status, 'New Enquiry');
    await closeStage(stage);
    const main = await waitFor(() => qv(WARR_MAIN), 4000);
    if (!main) throw new Error(tr('Warranty claimed by Customer not found.'));
    if (warrantyValue && ddValue(main).toLowerCase() !== warrantyValue.toLowerCase()) await chooseOption(main, warrantyValue);
  }

  // Antes de qualquer mudança: Save do caso. Espera o "- Unsaved" virar "- Saved"; se não virar, o Update title para.
  const unsavedNow = () => [...document.querySelectorAll('span,div')].some((e) => e.children.length === 0 && visible(e) && /^-?\s*Unsaved$/i.test(norm(e.textContent)));
  // Se o caso tem o campo "First Response Sent", a Priority tem que ser High (antes do primeiro Save).
  async function priorityHigh() {
    const has = qv('label[id$="firstresponsesent-field-label"]') || [...document.querySelectorAll('label')].find((l) => visible(l) && norm(l.textContent) === 'First Response Sent');
    if (!has) return '';
    const dd = qv('button[data-id="prioritycode.fieldControl-option-set-select"]');
    if (!dd) return '';
    if (ddValue(dd).toLowerCase() !== 'high') await chooseOption(dd, 'High');
    return 'High';
  }

  async function saveCaseFirst() {
    const b = qv('button[data-id="incident|NoRelationship|Form|Mscrm.Form.incident.Save"]');
    if (!b) return true;
    const was = unsavedNow();
    realClick(b);
    let ok = true;
    if (was) ok = !!(await waitFor(() => !unsavedNow(), 6000, 100));
    await sleep(300);
    return ok;                              // false = continua "Unsaved" (falta campo obrigatório, por exemplo)
  }

  // Duplo clique (abre o registro do asset).
  function dblClick(el) {
    const o = { bubbles: true, cancelable: true, composed: true, view: window, button: 0 };
    for (const n of [1, 2]) {
      ['mousedown', 'mouseup', 'click'].forEach((t) => el.dispatchEvent(new MouseEvent(t, { ...o, detail: n })));
    }
    el.dispatchEvent(new MouseEvent('dblclick', { ...o, detail: 2 }));
  }
  const serialCellEl = () => qv('[col-id="sie_serialnumber"]') || qv('[data-automationid="ListCell"] span[class*="headerText"]') || qv('[data-automationid="ListCell"]');

  // Botão Add do pedido de Device ID: abre a aba Product, duplo clique no serial do asset, escreve o Device ID, Save & Close, volta a Main.
  async function addDeviceToAsset(id) {
    const tabP = qv('li[data-id="tablist-tabProduct"]'), tabM = qv('li[data-id="tablist-tabMain"]');
    if (!tabP || !tabM) throw new Error(tr('Product and Main tabs not found.'));
    realClick(tabP);
    // abre o asset clicando no Main Asset (link); se não abrir, clique nativo e, por último, duplo clique no serial da tabela
    const DEVICE = ASSET_DEVICE;
    const tag = await waitFor(() => qv(MA_TAG), 7000);
    let inp = null;
    if (tag) {
      realClick(tag);
      inp = await waitFor(() => qv(DEVICE), 4000);
      if (!inp) { tag.click(); inp = await waitFor(() => qv(DEVICE), 3000); }
    }
    if (!inp) {
      const cell = await waitFor(serialCellEl, 3000);
      if (!cell && !tag) throw new Error(tr('Main Asset not found.'));
      if (cell) dblClick(cell);
      inp = await waitFor(() => qv(DEVICE), 12000);
    }
    if (!inp) throw new Error(tr('Asset Device ID field not found.'));
    typeInto(inp, id); inp.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);
    const sc = await waitFor(() => qv('button[data-id="msdyn_customerasset|NoRelationship|Form|Mscrm.Form.msdyn_customerasset.SaveAndClose"]'), 6000);
    if (!sc) throw new Error(tr('Save & Close button not found.'));
    realClick(sc);
    await waitFor(() => !qv('input[data-id="msdyn_deviceid.fieldControl-text-box-text"]'), 10000, 100);
    await sleep(500);
    await goMain();
  }

  let ticketHost = null, ticketBusy = false, ticketDlg = null, ticketRun = 0;

  // Passa pela aba Product (família, serial do asset, Device ID), volta a Main e lê o título atual.
  // Título com "ID<número>" diferente do ticket atual = reaberto de outro ticket. Texto: o que vem antes desse ID
  // ("Reopened_0506147:  Reopened_0506144:  Reopened_0506113:"), sem os dois-pontos finais; sem prefixo: "Reopened_<número>".
  function reopenedText(title) {
    const cur = String(ticketId()).replace(/\D/g, '').replace(/^0+/, '');
    const m = /\bID\s*(\d+)(?=[-\s/])/i.exec(title);
    if (!m || !cur) return '';
    if (m[1].replace(/^0+/, '') === cur) return '';
    const pre = title.slice(0, m.index).replace(/[:\s]+$/, '').trim();
    return pre || 'Reopened_' + m[1];
  }
  // Volta para a aba Main buscando o botão de novo (depois de abrir/fechar o asset a barra de abas é recriada: o botão guardado fica velho).
  async function goMain() {
    for (let n = 0; n < 3; n++) {
      const m = qv('li[data-id="tablist-tabMain"]');
      if (m) { realClick(m); if (n) m.click(); }
      if (await waitFor(() => qv(TITLE_SEL), 2500)) return true;
    }
    return false;
  }
  // Abre o Main Asset (clique no link, na aba Product), lê Serial Number e Device ID do registro e fecha com Save & Close
  // (sem mudar nada). Devolve {} se o registro não abrir: aí vale o serial da tabela de Assets.
  const MA_TAG = '[data-id="sie_mainassetid.fieldControl-LookupResultsDropdown_sie_mainassetid_selected_tag"]';
  const ASSET_DEVICE = 'input[data-id="msdyn_deviceid.fieldControl-text-box-text"]';
  const ASSET_SERIAL = 'input[data-id="sie_serialnumber.fieldControl-text-box-text"]';
  async function readAsset() {
    const tag = await waitFor(() => qv(MA_TAG), 2500);
    if (!tag) return {};
    realClick(tag);
    let ser = await waitFor(() => qv(ASSET_SERIAL), 5000);
    if (!ser) { tag.click(); ser = await waitFor(() => qv(ASSET_SERIAL), 4000); }
    if (!ser) return {};
    // Device ID: o campo carrega um pouco depois do serial; espera ele aparecer e, se vier vazio, dá um instante para o valor chegar
    const dev = await waitFor(() => qv(ASSET_DEVICE), 3000);
    if (dev) await waitFor(() => norm(dev.value) && !/^(select to enter data|---)$/i.test(norm(dev.value)), 1500, 50);
    const out = { opened: true, serial: norm(ser.value), dev: dev ? norm(dev.value) : '' };
    if (/^(select to enter data|---)$/i.test(out.serial)) out.serial = '';
    if (/^(select to enter data|---)$/i.test(out.dev)) out.dev = '';
    const sc = await waitFor(() => qv('button[data-id="msdyn_customerasset|NoRelationship|Form|Mscrm.Form.msdyn_customerasset.SaveAndClose"]'), 4000);
    if (sc) { realClick(sc); await waitFor(() => !qv(ASSET_SERIAL), 8000, 80); await sleep(250); }
    return out;
  }

  // Tabela de Assets carregada e vazia ("No data available", "0 - 0 of 0", "Rows: 0").
  const assetsEmpty = () => [...document.querySelectorAll('div,span,p,label')].some((e) => e.children.length === 0 && visible(e) && /^(no data available|0\s*-\s*0\s*of\s*0|rows:\s*0)$/i.test(norm(e.textContent)));
  async function collectProduct(d) {
    const ui = d.ui;
    ui.step(tr('Checking Product page')); ui.item('prod', tr('Product page'), 'run');
    const tabP = qv('li[data-id="tablist-tabProduct"]'), tabM = qv('li[data-id="tablist-tabMain"]');
    if (!tabP || !tabM) throw new Error(tr('Product and Main tabs not found.'));
    realClick(tabP);
    const fam = await waitFor(() => { const e = qv(FAM_SEL); return e && textOf(e); }, 7000);
    d.fam = fam || '';
    ui.step(tr('Checking Product Family'));
    ui.item('prod', tr('Product page'), fam ? 'ok' : 'bad', fam || tr('Product Family not found'));
    // Família "Sifinity" (software): o tipo vem do campo Product (Sifinity Control, DepotFinity, Sifinity Go…).
    const readProd = () => { const u = lookupList('productid'); const e = u && u.querySelector('[data-id$="_selected_tag_text"]'); return e ? textOf(e) : ''; };
    d.swFamily = /sifinity|depotfinity|software/i.test(d.fam);
    const needProd = d.swFamily || !detectCharger(d.fam) && !detectSoftware(d.fam);
    const prodTag = needProd ? (await waitFor(readProd, 1500)) || '' : readProd();   // só espera quando o Product decide o tipo
    const prodSw = detectSoftware(prodTag);
    d.sw = detectSoftware(d.fam) || ((d.swFamily || !detectCharger(d.fam)) && prodSw) || null;
    d.charger = d.sw || d.swFamily ? null : detectCharger(d.fam);
    d.product = prodTag || '';
    ui.family();
    // Serial: volta assim que achar; se a tabela de assets já carregou vazia, não espera mais
    const waitSerial = async (max) => {
      const t0 = Date.now();
      for (;;) {
        const v = assetSerial();
        if (v) return v;
        if (assetsEmpty() || Date.now() - t0 > max) return '';
        await sleep(100);
      }
    };
    if (d.sw || d.swFamily) {
      ui.step(tr('Checking serial number'));
      d.serial = await waitSerial(1200);
    } else {
      // Serial e Device ID vêm do registro do Main Asset; se ele não abrir, serial da tabela de Assets e Device ID da aba Product
      ui.step(tr('Checking Main Asset')); ui.item('asset', tr('Main Asset'), 'run');
      const a = await readAsset();
      ui.step(tr('Checking serial number and Charger ID'));
      if (a.opened) { d.serial = a.serial; d.dev = a.dev; }
      else {
        d.serial = await waitSerial(2500);
        if (!d.charger || d.charger.key === 'SI-D') d.dev = (await waitFor(deviceId, 2000)) || '';
      }
    }
    if (!d.sw && !d.swFamily) ui.item('asset', tr('Main Asset'), d.serial ? 'ok' : 'skip', d.serial ? tr('Serial {n}', { n: d.serial }) : tr('No serial found'));
    d.serialFound = !!d.serial;           // sem serial não há asset: não pergunta o Device ID
    await goMain();
    const input = await waitFor(() => qv(TITLE_SEL), 3000);
    if (!input) throw new Error(tr('Could not go back to the Main tab.'));
    const i = input.value.lastIndexOf(']');
    ui.step(tr('Checking Title'));
    d.rest = i >= 0 ? input.value.slice(i + 1).trim() : norm(input.value);
    d.reopened = reopenedText(input.value);
  }

  // ---------- Update title: assistente com 3 janelas ----------
  // Barra da etapa no topo; no meio, à esquerda a lista de checks (o que não vai para o título) e à direita a janela do título
  // (caixa com barra de progresso atrás, perguntas e botões). As duas janelas arrastam pela barra de cima; o × para o processo.
  const CANCEL = { cancel: true };
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const TITLE_PCT = [12, 30, 48, 66, 100];     // % da barra depois de cada parte: ID, família, país, serial, título

  function openWizard(d) {
    if (ticketDlg) ticketDlg.remove();
    ticketDlg = document.createElement('div');
    const r = ticketDlg.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `*{box-sizing:border-box}
      .bar{position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:2147483000;min-width:340px;max-width:92vw;background:#005f6b;color:#fff;border-radius:20px;padding:8px 20px 9px 14px;display:flex;align-items:center;gap:10px;font:600 13px 'Segoe UI',Roboto,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);overflow:hidden;user-select:none}
      .bar::after{content:'';position:absolute;left:-40%;bottom:0;height:2px;width:40%;background:rgba(255,255,255,.75);animation:slide 1.3s ease-in-out infinite}
      .bar.wait::after{display:none}
      .spin{width:14px;height:14px;flex:none;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite}
      .bar.wait .spin{border:0;background:#ffd54f;animation:pulse 1s ease-in-out infinite}
      .stx{display:inline-block;animation:sw .25s ease-out}
      .win{position:fixed;z-index:2147482999;background:#f4f7f9;border-radius:8px;box-shadow:5px 5px 25px rgba(0,0,0,.4);font:13px 'Segoe UI',Roboto,sans-serif;color:#333;animation:win .25s ease-out}
      .hd{background:#005f6b;color:#fff;padding:9px 12px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:13px;letter-spacing:.5px;cursor:move;user-select:none;touch-action:none}
      .x{cursor:pointer;font-size:24px;line-height:1;font-weight:normal;color:rgba(255,255,255,.7);background:none;border:0;padding:0 2px}.x:hover{color:#fff}
      .sub{font-size:11px;font-weight:600;color:#555;padding:8px 14px 0;text-transform:uppercase;letter-spacing:.4px}
      .cl{list-style:none;margin:0;padding:4px 14px 12px;min-height:90px}
      .cl li{display:flex;align-items:flex-start;gap:9px;padding:7px 0;border-bottom:1px dashed #cfd8dc;font-size:13px;animation:in .28s ease-out}
      .cl li:last-child{border-bottom:0}
      .cb{width:18px;height:18px;flex:none;margin-top:1px;border:2px solid #005f6b;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font:bold 12px/1 sans-serif;transition:background .15s,border-color .15s}
      li.run .cb{border-radius:50%;border-top-color:transparent;animation:sp .7s linear infinite}
      li.ok .cb{background:#2e7d32;border-color:#2e7d32;animation:pop .32s ease-out}
      li.skip .cb{background:#e0e0e0;border-color:#9e9e9e;color:#777}li.skip{color:#777}
      li.bad .cb{background:#c4314b;border-color:#c4314b;animation:pop .32s ease-out}
      .lt b{font-weight:600}.lt small{display:block;color:#555;font-size:11px;margin-top:1px;word-break:break-word}
      .body{padding:14px}
      .tbox{position:relative;border:1px solid #005f6b;border-radius:5px;background:#fff;overflow:hidden;min-height:38px}
      .tfill{position:absolute;left:0;top:0;bottom:0;width:0;background:#7cc4cc;opacity:.55;transition:width .4s ease,background .3s}
      .ttx{position:relative;font:14px Consolas,monospace;padding:9px 10px;line-height:20px;min-height:36px;word-break:break-all}
      .q{margin-top:14px}.q:empty{display:none}
      .lbl{font-size:13px;font-weight:bold;color:#005f6b;letter-spacing:.5px;text-transform:uppercase;margin:0 0 6px}
      input{width:100%;padding:6px 12px;border:1px solid #005f6b;border-radius:5px;background:#fff;font:bold 14px 'Segoe UI',Roboto,sans-serif;height:34px;color:#333}
      .note{font-size:11px;font-weight:600;color:#555;margin:0 0 6px}
      .list{border:1px solid #005f6b;border-radius:5px;background:#fff;max-height:240px;overflow-y:auto;margin-top:6px}
      .it{padding:8px 12px;cursor:pointer;font-size:14px;font-weight:bold;color:#333;background:#fff;border:0;width:100%;text-align:left;display:block;font-family:inherit}.it:hover{background:#005f6b;color:#fff}
      .it.sw{color:#005f6b;border-top:1px solid #cfd8dc}
      .act{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap}.act.l{justify-content:flex-start;margin:0 0 10px}
      .btn{background:#005f6b;color:#fff;border:none;border-radius:4px;padding:6px 18px;font:bold 13px 'Segoe UI',Roboto,sans-serif;cursor:pointer}.btn:hover{background:#004852}
      .btn.g{background:#fff;color:#005f6b;border:1px solid #005f6b}.btn.g:hover{background:#e6f7f8}
      @keyframes sp{to{transform:rotate(360deg)}}@keyframes slide{to{left:100%}}
      @keyframes pulse{50%{opacity:.35;transform:scale(.8)}}
      @keyframes sw{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
      @keyframes in{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
      @keyframes pop{0%{transform:scale(.5)}60%{transform:scale(1.25)}100%{transform:scale(1)}}
      @keyframes win{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
      @media(prefers-reduced-motion:reduce){*,*::after{animation:none!important;transition:none!important}}`;
    // barra da etapa
    const bar = mk('div', 'bar'); bar.setAttribute('role', 'status');
    const stx = mk('span', 'stx', tr('Starting…'));
    bar.append(mk('span', 'spin'), stx);
    // janela da esquerda: lista de checks
    const wl = mk('div', 'win');
    const hl = mk('div', 'hd'); hl.append(mk('span', null, tr('Checks')));
    const xl = mk('button', 'x', '×'); xl.type = 'button'; xl.setAttribute('aria-label', 'Close'); hl.appendChild(xl);
    const cl = mk('ul', 'cl');
    wl.append(hl, mk('div', 'sub', tr('Not in the title')), cl);
    // janela da direita: título
    const wr = mk('div', 'win');
    const hr = mk('div', 'hd'); hr.append(mk('span', null, 'Ticket Generator'));
    const xr = mk('button', 'x', '×'); xr.type = 'button'; xr.setAttribute('aria-label', 'Close'); hr.appendChild(xr);
    const body = mk('div', 'body');
    const tbox = mk('div', 'tbox'), fill = mk('div', 'tfill'), ttx = mk('div', 'ttx');
    tbox.append(fill, ttx);
    const q = mk('div', 'q');
    body.append(tbox, q);
    wr.append(hr, body);
    // posição inicial: no meio da tela, lado a lado
    const W = window.innerWidth, lw = Math.min(270, Math.round(W * 0.4)), rw = Math.min(500, W - lw - 40);
    const x0 = Math.max(8, Math.round((W - (lw + 16 + rw)) / 2)), y0 = Math.max(56, Math.round(window.innerHeight * 0.18));
    Object.assign(wl.style, { left: x0 + 'px', top: y0 + 'px', width: lw + 'px' });
    Object.assign(wr.style, { left: (x0 + lw + 16) + 'px', top: y0 + 'px', width: rw + 'px' });
    const drag = (win, hd) => hd.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.x')) return;
      const b = win.getBoundingClientRect(), dx = e.clientX - b.left, dy = e.clientY - b.top;
      hd.setPointerCapture(e.pointerId);
      const mv = (ev) => {
        win.style.left = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 80) + 'px';
        win.style.top = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40) + 'px';
      };
      const up = () => { hd.removeEventListener('pointermove', mv); hd.removeEventListener('pointerup', up); };
      hd.addEventListener('pointermove', mv); hd.addEventListener('pointerup', up);
    });
    drag(wl, hl); drag(wr, hr);
    for (const w of [wl, wr]) {
      w.addEventListener('keydown', (e) => e.stopPropagation());
      w.addEventListener('pointerdown', () => { wl.style.zIndex = wr.style.zIndex = 2147482999; w.style.zIndex = 2147483000; });
    }

    let pending = null;
    const alive = () => { if (d.closed) throw CANCEL; };
    const close = () => {
      d.closed = true;
      if (pending) { const p = pending; pending = null; p.reject(CANCEL); }
      if (ticketDlg) ticketDlg.remove();
      ticketDlg = null;
    };
    xl.onclick = xr.onclick = close;

    // texto do título, escrito aos poucos; a barra de progresso cresce junto
    const T = { parts: [], typed: 0, shown: '', pct: 0, chain: Promise.resolve() };
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setPct = (p) => { if (p > T.pct) { T.pct = p; fill.style.width = p + '%'; } };
    const typeText = async (s) => {
      for (const ch of s) {
        if (d.closed) return;
        T.shown += ch; ttx.textContent = T.shown; ttx.title = T.shown;
        if (!reduced) await sleep(s.length > 20 ? 6 : 16);
      }
    };
    const flush = () => {
      T.chain = T.chain.then(async () => {
        while (!d.closed && T.parts[T.typed] != null) {
          const s = T.parts[T.typed]; T.typed++;
          await typeText(s);
          setPct(TITLE_PCT[T.typed - 1]);
        }
      });
    };
    const items = {};
    const ui = {
      close, setPct,
      step(msg, wait) {
        alive();
        bar.classList.toggle('wait', !!wait);
        if (stx.textContent !== msg) {
          stx.textContent = msg; stx.style.animation = 'none'; void stx.offsetWidth; stx.style.animation = '';
        }
      },
      item(key, label, state, detail) {
        alive();
        let li = items[key];
        if (!li) {
          li = items[key] = mk('li');
          const lt = mk('span', 'lt'); lt.append(mk('b', null, label), mk('small'));
          li.append(mk('span', 'cb'), lt);
          cl.appendChild(li);
        }
        li.className = state;
        li.firstChild.textContent = { ok: '✓', bad: '!', skip: '–' }[state] || '';
        const sm = li.querySelector('small'); sm.textContent = detail || ''; sm.style.display = detail ? 'block' : 'none';
      },
      setPart(i, text) { if (i < T.typed || T.parts[i] != null) return; T.parts[i] = text; flush(); },
      idle() { return T.chain; },
      family() {                                         // parte 2 do título (área/família ou software) assim que o tipo é conhecido
        const c = d.sw || d.charger;
        if (!c) return;
        if (c.color) fill.style.background = c.color;
        ui.setPart(1, d.sw ? '-' + d.sw.key : '-' + c.area + '/' + c.key);
      },
      // Mostra uma pergunta na janela da direita e espera a resposta. render(q, done) monta o conteúdo; done(valor) responde.
      async ask(barMsg, render) {
        await T.chain;                                    // espera terminar de escrever o título
        alive();
        ui.step(barMsg, true);
        return new Promise((resolve, reject) => {
          pending = { reject };
          q.textContent = '';
          render(q, (v) => { pending = null; q.textContent = ''; resolve(v); });
        });
      },
    };
    r.append(st, bar, wl, wr);
    document.body.appendChild(ticketDlg);
    return ui;
  }

  // ----- perguntas (cada uma devolve a resposta; o × da janela cancela) -----
  const focusSoon = (el) => setTimeout(() => { try { el.focus(); } catch (_) { /* janela fechada */ } }, 30);
  async function askCountry(ui) {
    const c = await ui.ask(tr('Waiting for the country'), (q, done) => {
      q.append(mk('div', 'lbl', tr('Country not found. Pick the country:')));
      const inp = mk('input'); inp.spellcheck = false; inp.placeholder = tr('Type the country name');
      const list = mk('div', 'list');
      const items = countryList().map((c) => { const b = mk('button', 'it', c.name); b.type = 'button'; b.onclick = () => done(c); list.appendChild(b); return { c, b }; });
      inp.addEventListener('input', () => { const s = fold(inp.value); items.forEach(({ c, b }) => { b.style.display = !s || fold(c.name).includes(s) ? 'block' : 'none'; }); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const f = items.find((x) => x.b.style.display !== 'none'); if (f) done(f.c); } });
      q.append(inp, list); focusSoon(inp);
    });
    return c;
  }
  async function askType(d, ui) {
    const software = !!d.swFamily;
    const pick = await ui.ask(tr('Waiting for the charger type'), (q, done) => {
      const draw = (sw) => {
        q.textContent = '';
        q.append(mk('div', 'lbl', sw ? tr('Pick the software:') : tr('Product family not recognized{name}. Pick the charger:', { name: d.fam ? ' (' + d.fam + ')' : '' })));
        const list = mk('div', 'list');
        (sw ? SOFTWARE : CHARGERS).forEach((c) => {
          const b = mk('button', 'it', c.label); b.type = 'button';
          b.onclick = () => done({ sw: sw ? c : null, charger: sw ? null : c });
          list.appendChild(b);
        });
        const toggle = mk('button', 'it sw', sw ? tr('Back to chargers') : 'Software'); toggle.type = 'button';
        toggle.onclick = () => draw(!sw);
        list.appendChild(toggle); q.appendChild(list);
      };
      draw(software);
    });
    d.sw = pick.sw; d.charger = pick.charger;
    if (d.charger && d.charger.key === 'SI-D' && !d.dev) d.dev = deviceId();
  }
  // Serial não achado: NULL ou MULTI (ou digitar; o OK só aparece com algo digitado).
  async function askSerial(ui) {
    return ui.ask(tr('Waiting for the serial number'), (q, done) => {
      q.append(mk('div', 'lbl', tr('Serial number not found')));
      const row = mk('div', 'act l');
      ['NULL', 'MULTI'].forEach((v) => { const b = mk('button', 'btn', v); b.type = 'button'; b.onclick = () => done(v); row.appendChild(b); });
      const inp = mk('input'); inp.spellcheck = false; inp.placeholder = tr('or type the serial number');
      const ok = mk('button', 'btn', tr('OK')); ok.type = 'button'; ok.style.display = 'none';
      const go = () => { const v = norm(inp.value); if (v) done(v); };
      inp.addEventListener('input', () => { ok.style.display = norm(inp.value) ? '' : 'none'; });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      ok.onclick = go;
      const act = mk('div', 'act'); act.appendChild(ok);
      q.append(row, inp, act);
    });
  }
  // Charger ID (SI-D) não achado: Skip, Add ou OK; Add e OK só aparecem com algo digitado.
  async function askDevice(ui) {
    return ui.ask(tr('Waiting for the Charger ID'), (q, done) => {
      const head = mk('div', 'lbl', '"SiCharge D" - ' + tr('Charger ID not found')); head.style.textTransform = 'none';
      q.append(head, mk('div', 'note', tr('Type the Charger ID')));
      const inp = mk('input'); inp.spellcheck = false;
      const addB = mk('button', 'btn g', tr('Add')); addB.type = 'button'; addB.title = tr('Write this Device ID on the asset (Product tab) and save it');
      const skip = mk('button', 'btn g', tr('Skip')); skip.type = 'button';
      const ok = mk('button', 'btn', tr('OK')); ok.type = 'button';
      addB.style.display = ok.style.display = 'none';
      const go = () => { const v = norm(inp.value); if (v) done({ dev: v, add: false }); };
      inp.addEventListener('input', () => { addB.style.display = ok.style.display = norm(inp.value) ? '' : 'none'; });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      skip.onclick = () => done({ dev: '', add: false });
      ok.onclick = go;
      addB.onclick = () => { const v = norm(inp.value); if (v) done({ dev: v, add: true }); };
      const act = mk('div', 'act'); act.append(skip, addB, ok);
      q.append(inp, act); focusSoon(inp);
    });
  }
  async function askTitle(d, ui) {
    return ui.ask(tr('Waiting for the title'), (q, done) => {
      q.append(mk('div', 'note', tr('Ticket Title')));
      const rest = mk('input'); rest.spellcheck = false; rest.value = d.rest;
      const ok = mk('button', 'btn', tr('OK')); ok.type = 'button';
      const go = () => done(norm(rest.value));
      ok.onclick = go;
      rest.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      const act = mk('div', 'act'); act.appendChild(ok);
      q.append(rest, act); focusSoon(rest); setTimeout(() => { try { rest.select(); } catch (_) { /* fechada */ } }, 40);
    });
  }
  // Pergunta de botões (Yes / No).
  async function askButtons(ui, barMsg, label, buttons) {
    return ui.ask(barMsg, (q, done) => {
      q.append(mk('div', 'lbl', label));
      const act = mk('div', 'act l');
      buttons.forEach(([text, val, ghost], i) => { const b = mk('button', ghost ? 'btn g' : 'btn', text); b.type = 'button'; b.onclick = () => done(val); act.appendChild(b); if (!i) focusSoon(b); });
      q.appendChild(act);
    });
  }

  async function startTicket(btn) {
    if (ticketBusy) return;
    ticketBusy = true; btn.disabled = true;
    const d = { id: '', cc: '', fam: '', charger: null, sw: null, serial: '', dev: '', rest: '', run: ++ticketRun };
    const ui = openWizard(d);
    d.ui = ui;
    try { await ticketFlow(d, ui); }
    catch (e) {
      if (e !== CANCEL) { console.warn('Radial: ticket', e); toast([tr('Ticket'), String(e && e.message || e)], true); }
    } finally { ui.close(); ticketBusy = false; btn.disabled = false; }
  }

  async function ticketFlow(d, ui) {
    const msg = (e) => String(e && e.message || e);
    // 1. Priority
    ui.step(tr('Checking Priority')); ui.item('prio', tr('Priority'), 'run');
    try {
      const p = await priorityHigh();
      ui.item('prio', tr('Priority'), p ? 'ok' : 'skip', p ? p : tr('Not needed'));
    } catch (e) { ui.item('prio', tr('Priority'), 'bad', msg(e)); }
    // 2. Save
    ui.step(tr('Saving the case')); ui.item('save', tr('Save'), 'run');
    if (!(await saveCaseFirst())) {
      ui.item('save', tr('Save'), 'bad', tr('Still Unsaved'));
      toast([tr('Update title'), tr('The case did not save (still Unsaved). Fill in the required fields and try again.')], true, 8000);
      return;
    }
    ui.item('save', tr('Save'), 'ok');
    d.id = ticketId();
    ui.setPart(0, 'ID' + d.id);
    // 3. Country
    ui.step(tr('Checking Country'));
    d.cc = countryToCode(countryName());
    if (!d.cc) {
      const c = await askCountry(ui);
      ui.step(tr('Writing Country of Charger'));
      const f = document.querySelector(COUNTRY_INPUT);
      if (!f) throw new Error(tr('Country of Charger field not found.'));
      if (!(await pickLookup(f, c.name))) throw new Error(tr('Could not select "{name}" in Country of Charger.', { name: c.name }));
      d.cc = c.code;
    }
    ui.setPart(2, '/' + d.cc);
    // 4. Product page, family, asset, serial
    await collectProduct(d);
    if (!d.sw && !d.charger) await askType(d, ui);
    ui.family();
    if (!d.serial) {
      d.serial = await askSerial(ui);
    }
    ui.setPart(3, '-[' + (norm(d.serial) || 'NULL') + ']');
    // 5. Charger ID (só SiCharge D)
    let addDev = false;
    if (d.charger && d.charger.key === 'SI-D') {
      ui.setPct(78);
      if (d.dev) ui.item('dev', tr('Charger ID'), 'ok', d.dev);
      else if (!d.serialFound) ui.item('dev', tr('Charger ID'), 'skip', tr('No asset'));
      else {
        ui.item('dev', tr('Charger ID'), 'run', tr('Not found'));
        const a = await askDevice(ui);
        d.dev = a.dev; addDev = a.add;
        if (addDev) {
          ui.step(tr('Saving the Charger ID on the asset…'));
          try { await addDeviceToAsset(d.dev); } catch (e) { toast([tr('Device ID'), msg(e)], true, 8000); }
        }
        ui.item('dev', tr('Charger ID'), d.dev ? 'ok' : 'skip', d.dev ? d.dev + (addDev ? ' · ' + tr('added to the asset') : '') : tr('Skipped'));
      }
    }
    // 6. Título
    const rest = await askTitle(d, ui);
    ui.setPart(4, rest ? ' ' + rest : '');
    await ui.idle();
    ui.setPct(100);
    // 7. Gravar no formulário
    ui.step(tr('Writing the title'));
    const t = document.querySelector(TITLE_SEL);
    if (!t) throw new Error(tr('Case Title field not found.'));
    const prefix = d.sw ? `ID${d.id}-${d.sw.key}/${d.cc}-[${norm(d.serial) || 'NULL'}]` : `ID${d.id}-${d.charger.area}/${d.charger.key}/${d.cc}-[${norm(d.serial) || 'NULL'}]`;
    typeInto(t, (prefix + ' ' + rest).trim()); t.dispatchEvent(new Event('change', { bubbles: true }));
    const devId = d.charger && d.charger.key === 'SI-D' ? d.dev : '';
    if (devId) {
      const c = document.querySelector('input[data-id="sie_chargerid.fieldControl-text-box-text"]');
      if (c) { typeInto(c, devId); c.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    if (d.reopened) ui.item('reopen', tr('Reopened'), 'ok', d.reopened);
    if (devId || d.reopened) {
      ui.step(tr('Adding links to Internal Description')); ui.item('links', tr('Internal Description'), 'run');
      try {
        const r = await chrome.runtime.sendMessage({ type: 'desc-links', id: devId, reopened: d.reopened || '' });
        if (!r || !r.ok) ui.item('links', tr('Internal Description'), 'bad', (r && r.error) || tr('Failed to run.'));
        else ui.item('links', tr('Internal Description'), 'ok');
      } catch (e) { ui.item('links', tr('Internal Description'), 'bad', msg(e)); }
    }
    ui.step(tr('Syncing Warranty and Stage')); ui.item('stage', tr('Warranty / Stage'), 'run');
    try { await syncStage(); ui.item('stage', tr('Warranty / Stage'), 'ok'); }
    catch (e) { ui.item('stage', tr('Warranty / Stage'), 'bad', msg(e)); }
    ui.step(tr('Saving the case')); ui.item('save2', tr('Save'), 'run');
    const saved = await saveCaseFirst();
    ui.item('save2', tr('Save'), saved ? 'ok' : 'bad', saved ? '' : tr('Still Unsaved'));
    // 8. Conferência
    await askButtons(ui, tr('Waiting for you'), tr('Damex, checked?'), [[tr('Yes'), true]]);
    const first = await askButtons(ui, tr('Waiting for you'), tr('Send first, response?'), [[tr('Yes'), true], [tr('No'), false, true]]);
    ui.step(tr('Saving the case'));
    await saveCaseFirst();
    if (first) toast([tr('Create email'), tr('Coming soon: the Create email button is not set up yet.')], false, 5000);
    ui.step(tr('Done'));
    await sleep(900);
  }

  // ---------- Botão × na aba Product: limpa Product e Main Asset (Technology e Product Family são só leitura) ----------
  let clearHost = null, clearBusy = false;
  const PRODUCT_LISTS = ['productid', 'sie_productfamilyid', 'sie_technologyid', 'sie_mainassetid'];
  const lookupList = (id) => qv(`ul[data-id="${id}.fieldControl-LookupResultsDropdown_${id}_SelectedRecordList"]`);
  async function clearProduct(btn) {
    if (clearBusy) return;
    clearBusy = true; btn.disabled = true;
    try {
      // Ordem: Main Asset, Product, Product Family, Technology (os dois últimos podem ser só leitura).
      // Clica no × de cada um e espera 400 ms antes do próximo.
      for (const id of ['sie_mainassetid', 'productid', 'sie_productfamilyid', 'sie_technologyid']) {
        const ul = lookupList(id);
        const dels = ul ? [...ul.querySelectorAll(`button[data-id="${id}.fieldControl-LookupResultsDropdown_${id}_selected_tag_delete"]`)] : [];
        for (const d of dels) {
          realClick(d);
          await sleep(400);
        }
      }
      await sleep(400);
      const names = { sie_productfamilyid: 'Product Family', sie_technologyid: 'Technology' };
      const left = ['sie_productfamilyid', 'sie_technologyid'].filter((id) => lookupList(id) && lookupList(id).querySelector('[data-id$="_selected_tag"]')).map((id) => names[id]);
      if (left.length) toast([tr('Clear product fields'), tr('{names} are read-only and were not cleared.', { names: left.join(' + ') })], false, 5000);
    } catch (e) {
      toast([tr('Clear product fields'), String(e && e.message || e)], true, 5000);
    } finally { clearBusy = false; btn.disabled = false; }
  }
  function clearTick() {
    const h2 = settings.ticketBtn !== false && hostOk() && qv('h2[data-id="form-sectionHeader-sectionProductInformation"]');
    const sec = h2 && (h2.closest('section') || h2.parentElement);
    if (!h2) { if (clearHost) { clearHost.remove(); clearHost = null; } return; }
    if (clearHost && clearHost.isConnected && clearHost.previousElementSibling === h2) return;
    if (clearHost) clearHost.remove();
    if (getComputedStyle(sec).position === 'static') sec.style.position = 'relative';
    clearHost = document.createElement('div');
    const r = clearHost.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = ':host{position:absolute;top:8px;right:12px;z-index:5}button{box-sizing:border-box;width:22px;height:22px;padding:0;font:400 16px/18px "Segoe UI",system-ui,sans-serif;border:1px solid #d1d1d1;border-radius:4px;background:#fff;color:#242424;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.12)}button:hover{background:#f5f5f5;border-color:#c7c7c7}button:active{background:#e0e0e0}button:disabled{opacity:.6;cursor:default}';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '×';
    b.title = b.ariaLabel = tr('Clear product fields'); b.onclick = () => clearProduct(b);
    r.append(st, b);
    h2.insertAdjacentElement('afterend', clearHost);
  }

  // ---------- Botão ao lado de "On behalf of Contact": troca Requester e On behalf (só aparece com contato no On behalf) ----------
  let swapHost = null, swapBusy = false, peekAt = 0, peekHas = false;
  const OB_TAG = '[data-id^="sie_referencingcontactid."][data-id$="selected_tag_text"], [id*="sie_referencingcontactid.fieldControl-LookupResultsDropdown"][id*="selected_tag_text"]';
  async function swapContacts(btn) {
    if (swapBusy) return;
    swapBusy = true; btn.disabled = true;
    try {
      const r = await chrome.runtime.sendMessage({ type: 'contact-swap' });
      if (!r || r.state !== 'done') toast([tr('Swap'), (r && r.message) || tr('Failed to run.')], true);
    } catch (e) { toast([tr('Swap'), String(e && e.message || e)], true); }
    finally { swapBusy = false; btn.disabled = false; peekAt = 0; }
  }
  async function swapTick() {
    const lab = settings.ticketBtn !== false && hostOk() && qv('div[title^="On behalf of Contact"] > label');
    let has = !!(lab && qv(OB_TAG));
    if (lab && !has && Date.now() - peekAt > 4000) {   // plano B: pergunta ao formulário
      peekAt = Date.now();
      try { const r = await chrome.runtime.sendMessage({ type: 'contact-peek' }); peekHas = !!(r && r.state === 'has'); } catch (_) { peekHas = false; }
    }
    if (lab && !has) has = peekHas;
    if (!lab || !has) { if (swapHost) { swapHost.remove(); swapHost = null; } if (!lab) peekHas = false; return; }
    const wrap = lab.parentElement;
    if (swapHost && swapHost.isConnected && swapHost.parentElement === wrap) return;
    if (swapHost) swapHost.remove();
    swapHost = document.createElement('div');
    const r = swapHost.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = ':host{display:inline-block;margin-left:10px;vertical-align:middle}button{box-sizing:border-box;font:400 13px/18px "Segoe UI",system-ui,sans-serif;white-space:nowrap;padding:3px 10px;border:1px solid #d13438;border-radius:4px;background:#d13438;color:#fff;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.18);transition:background .1s,border-color .1s}button:hover{background:#b92d31;border-color:#b92d31}button:active{background:#a4262c;border-color:#a4262c}button:focus-visible{outline:2px solid #000;outline-offset:1px}button:disabled{opacity:.6;cursor:default}';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = tr('Swap'); b.onclick = () => swapContacts(b);
    r.append(st, b);
    wrap.appendChild(swapHost);
  }

  // ---------- Botão Share: o lado esquerdo copia o link do caso (título + link); a setinha abre o menu ----------
  function caseLink() {
    const u = location.href;
    if (!/[?&]etn=incident&id=/i.test(u)) return '';
    if (/[?&]pagetype=/i.test(u)) return u;
    return u.replace(/&etn=incident&id=/i, '&pagetype=entityrecord&etn=incident&id=');
  }
  // Título: o que está na caixa Case Title (o texto de verdade); só se ela não existir (outra aba) usa o do cabeçalho.
  function caseTitleText() {
    const i = document.querySelector(TITLE_SEL);
    const v = i && norm(i.value);
    if (v) return v;
    const h = qv('[data-id="header_title"]');
    return h ? norm(h.getAttribute('title') || h.textContent) : '';
  }
  // First Response Sent diferente de "Yes" (e o campo existe): o link leva uma linha antes, conforme o carregador.
  function slaPrefix(title) {
    const word = /\/SI-UC\//i.test(title) ? 'Sicharge UC SLA⭐' : /\/SI-D\//i.test(title) ? 'Sicharge-D SLA  ✨' : '';
    if (!word) return '';                      // só SI-D e SI-UC verificam o First Response Sent
    const f = qv('input[aria-label="First Response Sent"]');
    return !f || norm(f.value).toLowerCase() === 'yes' ? '' : word;
  }
  async function copyRich(title, url, prefix) {
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const link = `<a href="${esc(url)}">${esc(title || url)}</a>`;
    const html = prefix ? `${esc(prefix).replace(/ {2}/g, '&nbsp; ')}<br>${link}` : link;
    const body = title ? `${title} - ${url}` : url;
    const text = prefix ? `${prefix}\n${body}` : body;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return true;
    } catch (_) {
      const box = document.createElement('div');
      box.contentEditable = 'true'; box.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre';
      box.innerHTML = html; document.body.appendChild(box);
      const range = document.createRange(); range.selectNodeContents(box);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { /* ignora */ }
      sel.removeAllRanges(); box.remove();
      return ok;
    }
  }
  document.addEventListener('click', async (e) => {
    if (settings.shareCopy === false || !hostOk() || !e.isTrusted) return;
    const b = e.target.closest && e.target.closest('button[id^="collaborationShareButton"]');
    if (!b) return;
    const arrow = b.querySelector('.fui-MenuButton__menuIcon');
    const r = arrow && arrow.getBoundingClientRect();
    if (r && e.clientX >= r.left - 6) return;          // setinha: abre o menu normalmente
    const url = caseLink();
    if (!url) return;                                  // não é um caso: comportamento normal
    e.preventDefault(); e.stopImmediatePropagation();
    const title = caseTitleText();
    const ok = await copyRich(title, url, slaPrefix(title));
    toast([ok ? tr('Ticket link copied') : tr('Could not copy the link.')], !ok, 2500);
  }, true);

  // ---------- Janela "Assign to Team or User": botões de filas ao lado ----------
  // Cada botão: põe "Assign To" em "User or team", escreve "*<fila>" na caixa, Enter na primeira opção e clica em Assign.
  const QUEUE_COLORS = ['#0f6cbd', '#8764b8', '#038387', '#ca5010', '#498205', '#c239b3', '#5c2e91', '#0b6a0b'];
  const ASSIGN_DD = 'button[data-id="rdoMe_id.fieldControl-option-set-select"]';
  const ASSIGN_INPUT = 'input[data-id="systemuserview_id.fieldControl-LookupResultsDropdown_systemuserview_id_textInputBox_with_filter_new"]';
  // Linha: "Botão | Conteúdo" + marcas opcionais depois: L = lado esquerdo da janela; NQ = não faz o Add to Queue;
  // Q=<fila> = no Add to Queue escreve essa fila (o Assign continua com o Conteúdo)
  const parseQueues = () => String(settings.assignQueues == null || [OLD_QUEUES, PREV_QUEUES, PREV2_QUEUES, PREV3_QUEUES, PREV4_QUEUES].includes(settings.assignQueues) ? DEFAULT_QUEUES : settings.assignQueues).split('\n')
    .map((l) => { const p = l.split('|').map(norm); const fl = p.slice(2).map((x) => x.toUpperCase()); return p.length < 2 ? null : { label: p[0], text: p[1].replace(/^\*+/, '').trim(), left: fl.includes('L') || fl.includes('LEFT'), noQueue: fl.includes('NQ'), queue: ((p.slice(2).find((x) => /^q\s*=/i.test(x)) || '').replace(/^q\s*=\s*/i, '').replace(/^\*+/, '').trim()) }; })
    .filter((q) => q && q.label && q.text);
  const TR_COUNTRIES = new Set(['AE', 'SA', 'QA', 'KW', 'TH', 'SG', 'NZ', 'AU']);
  const titleCountry = () => { const m = /\/([A-Za-z]{2})-\[/.exec(caseTitleText()); return m ? m[1].toUpperCase() : ''; };
  let assignHost = null, assignBusy = false, assignKey = '';
  const assignDialog = () => qv('[data-id="AssignQueue"]');

  // Depois do Assign: botão "Add to Queue" da barra, escreve "*<fila>" no campo Queue (apagando a fila que já estava), Enter e Add.
  const QUEUE_DLG = '[data-lp-id="dialogView|AddToQueue"], [data-id="AddToQueue"]';
  const QUEUE_INPUT = 'input[data-id^="businessqueues_id.fieldControl-LookupResultsDropdown"][data-id$="textInputBox_with_filter_new"]';
  async function addToQueue(text) {
    if (!(await waitFor(() => !assignDialog(), 10000, 100))) throw new Error(tr('Assign window did not close.'));
    await sleep(400);
    const btn = await waitFor(() => qv('button[data-id="incident|NoRelationship|Form|Mscrm.Form.incident.AddToQueue"]'), 4000);
    if (!btn) throw new Error(tr('Add to Queue button not found.'));
    realClick(btn);
    // a janela pode ser recriada pelo Dynamics: sempre busca de novo, nunca guarda o elemento
    const getDlg = () => qv(QUEUE_DLG) || [...document.querySelectorAll('[role="dialog"]')].find((d) => visible(d) && d.querySelector(`[data-id^="businessqueues_id"]`));
    if (!(await waitFor(getDlg, 6000))) throw new Error(tr('Add to Queue window not found.'));
    // a fila atual já vem escolhida: Tab e Delete apagam (o mesmo que você faz à mão).
    const TAG = '[data-id="businessqueues_id.fieldControl-LookupResultsDropdown_businessqueues_id_selected_tag"]';
    const count = () => { const d = getDlg(); return d ? d.querySelectorAll(TAG).length : 0; };
    const inputOf = () => { const d = getDlg(); const i = (d && d.querySelector(QUEUE_INPUT)) || qv(QUEUE_INPUT); return i && visible(i) ? i : null; };
    await waitFor(() => count() || inputOf(), 4000, 50);   // o conteúdo da janela carrega depois da janela: espera a fila ou a caixa vazia
    const trace = [];
    const desc = (e) => !e ? 'none' : (e.tagName || '?') + (e.getAttribute && (e.getAttribute('data-id') || e.getAttribute('aria-label')) ? '[' + String(e.getAttribute('data-id') || e.getAttribute('aria-label')).slice(-34) + ']' : '');
    let keyErr = '';
    const real = async (keys) => { try { const r = await chrome.runtime.sendMessage({ type: 'press-keys', keys }); if (!r || !r.ok) keyErr = (r && r.error) || 'no response'; } catch (e) { keyErr = String(e && e.message || e); } };
    const clearQueueIfAny = async () => {
      if (count()) {
        // 1) rodando no mundo da página (o mesmo teste que removeu na hora no seu console): clique nativo, eventos, Delete, Backspace
        try { const r = await chrome.runtime.sendMessage({ type: 'queue-clear' }); trace.push('page:' + ((r && (r.method || r.error)) || 'none')); } catch (e) { trace.push('page-err:' + String(e && e.message || e)); }
        await waitFor(() => !count(), 800, 40);
      }
      if (count()) {
        // 2) plano B: foco no começo da janela, Tab (cai na etiqueta da fila), Delete. Teclas de verdade do navegador.
        const d = getDlg();
        (d.querySelector('[data-id="dialogCloseIconButton"]') || d).focus();
        await real(['Tab']);
        trace.push('tab->' + desc(document.activeElement));
        if (!document.activeElement || !document.activeElement.matches || !document.activeElement.matches(TAG)) {
          const t = getDlg() && getDlg().querySelector(TAG); if (t) t.focus();
          trace.push('focus->' + desc(document.activeElement));
        }
        await real(['Delete']);
        await waitFor(() => !count(), 1500, 40);
        trace.push('left=' + count());
        if (keyErr) trace.push('keys:' + keyErr);
      }
    };
    await waitFor(() => count(), 1500, 50);        // a janela preenche a fila atual um instante depois de abrir: espera ela aparecer
    await clearQueueIfAny();
    if (trace.length) console.log('Radial: add to queue', trace.join(' | '));
    let input = await waitFor(inputOf, 5000);
    await sleep(350);
    if (count()) { await clearQueueIfAny(); input = await waitFor(inputOf, 5000); }   // a fila voltou depois de tirada (preenchimento tardio): tira de novo
    if (!input) throw new Error(tr('Queue box not found.') + (count() ? ' (' + tr('current queue could not be removed') + ')' : '') + (trace.length ? ' [' + trace.join(' | ') + ']' : ''));
    const okBtn = () => { const d = getDlg(); const b = d && d.querySelector('button[data-id="ok_id"]'); return b && !b.disabled ? b : null; };
    const ok = await pickLookup(input, text, '*' + text, () => !!okBtn());
    if (!ok) throw new Error(tr('No record found for "{name}".', { name: text }));
    const add = await waitFor(okBtn, 5000);
    if (!add) throw new Error(tr('Add button stayed disabled.'));
    realClick(add);
  }

  async function runAssign(text, noQueue, queueText) {
    if (assignBusy) return;
    assignBusy = true;
    try {
      const dlg = assignDialog();
      if (!dlg) throw new Error(tr('Assign window not found.'));
      const dd = dlg.querySelector(ASSIGN_DD);
      if (dd && ddValue(dd).toLowerCase() !== 'user or team') await chooseOption(dd, 'User or team');
      const input = await waitFor(() => { const i = dlg.querySelector(ASSIGN_INPUT); return i && visible(i) ? i : null; }, 5000);
      if (!input) throw new Error(tr('User or team box not found.'));
      const ok = await pickLookup(input, text, '*' + text, () => { const b = dlg.querySelector('button[data-id="ok_id"]'); return b && !b.disabled; });
      if (!ok) throw new Error(tr('No record found for "{name}".', { name: text }));
      const go = await waitFor(() => { const b = dlg.querySelector('button[data-id="ok_id"]'); return b && !b.disabled ? b : null; }, 5000);
      if (!go) throw new Error(tr('Assign button stayed disabled.'));
      realClick(go);
      if (!noQueue) await addToQueue(queueText || text);
    } catch (e) {
      toast([tr('Assign'), String(e && e.message || e)], true, 20000);
    } finally { assignBusy = false; }
  }

  function makeQueueHost(list, left) {
    const host = document.createElement('div');
    const sr = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = ':host{position:fixed;z-index:2147483000}.col{display:flex;flex-direction:column;gap:8px}.row{display:flex;align-items:center;gap:8px}.row.l{flex-direction:row-reverse}.row button{width:130px;flex:none;font:600 13px/18px "Segoe UI",system-ui,sans-serif;white-space:nowrap;text-align:center;padding:6px 14px;border:0;border-radius:4px;color:#fff;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3)}.row button:hover{filter:brightness(.88)}.row button:active{filter:brightness(.78)}.t{font:400 12px/18px "Segoe UI",system-ui,sans-serif;white-space:nowrap;background:#fff;color:#242424;padding:6px 10px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.25);cursor:pointer}';
    const col = document.createElement('div'); col.className = 'col';
    list.forEach((q) => {
      const row = document.createElement('div'); row.className = left ? 'row l' : 'row';
      const b = document.createElement('button'); b.type = 'button'; b.title = '*' + q.text; b.style.background = q.color; b.textContent = q.label;
      b.onclick = () => runAssign(q.text, q.noQueue, q.queue);
      const t = document.createElement('span'); t.className = 't'; t.textContent = q.text; t.title = '*' + q.text;
      t.onclick = () => runAssign(q.text, q.noQueue, q.queue);
      row.append(b, t);
      col.appendChild(row);
    });
    sr.append(st, col);
    document.body.appendChild(host);
    return host;
  }

  let assignHostL = null;
  function assignTick() {
    const dlg = settings.assignBtns !== false && hostOk() && assignDialog();
    if (!dlg) {
      for (const h of [assignHost, assignHostL]) if (h) h.remove();
      assignHost = assignHostL = null; assignKey = '';
      return;
    }
    const box = dlg.querySelector('[id^="dialogContentContainer"]') || dlg;
    const r = box.getBoundingClientRect();
    const cc = titleCountry();
    const all = parseQueues().map((q, i) => ({ ...q, color: QUEUE_COLORS[i % QUEUE_COLORS.length] }));
    // EAU, Arábia Saudita, Catar, Kuwait, Tailândia, Singapura, Nova Zelândia e Austrália são atendidos pelo RC-TR
    const rc = TR_COUNTRIES.has(cc) ? 'TR' : cc;
    if (rc) all.push({ label: 'RC-' + rc, text: 'eMobility RC-' + rc, color: '#d13438', left: false });
    const right = all.filter((q) => !q.left), left = all.filter((q) => q.left);
    const key = JSON.stringify(all);
    if (key !== assignKey || (right.length && !(assignHost && assignHost.isConnected)) || (left.length && !(assignHostL && assignHostL.isConnected))) {
      for (const h of [assignHost, assignHostL]) if (h) h.remove();
      assignKey = key;
      assignHost = right.length ? makeQueueHost(right, false) : null;
      assignHostL = left.length ? makeQueueHost(left, true) : null;
    }
    if (assignHost) { assignHost.style.left = Math.round(r.right + 12) + 'px'; assignHost.style.top = Math.round(r.top) + 'px'; }
    if (assignHostL) { assignHostL.style.right = Math.round(window.innerWidth - r.left + 12) + 'px'; assignHostL.style.top = Math.round(r.top) + 'px'; }
  }

  function ticketTick() {
    const lab = settings.ticketBtn !== false && hostOk() && qv('div[title^="Case Title"] > label');
    const on = lab && qv('li[data-id="tablist-tabProduct"]');
    if (!on) { if (ticketHost) { ticketHost.remove(); ticketHost = null; } return; }
    const wrap = lab.parentElement;
    if (ticketHost && ticketHost.isConnected && ticketHost.parentElement === wrap) return;
    if (ticketHost) ticketHost.remove();
    ticketHost = document.createElement('div');
    const r = ticketHost.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = ':host{display:inline-block;margin-left:10px;vertical-align:middle}button{box-sizing:border-box;font:400 13px/18px "Segoe UI",system-ui,sans-serif;white-space:nowrap;padding:3px 10px;border:1px solid #d1d1d1;border-radius:4px;background:#fff;color:#242424;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.12);transition:background .1s,border-color .1s}button:hover{background:#f5f5f5;border-color:#c7c7c7}button:active{background:#e0e0e0;border-color:#b3b3b3}button:focus-visible{outline:2px solid #000;outline-offset:1px}button:disabled{opacity:.6;cursor:default}';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = tr('Update title'); b.onclick = () => startTicket(b);
    r.append(st, b);
    wrap.appendChild(ticketHost);
  }

  async function tick() {
    try { dropQueue(); } catch (_) { /* ignora */ }
    try { subjectTick(); } catch (_) { /* ignora */ }
    try { rcTick(); } catch (_) { /* ignora */ }
    try { ticketTick(); } catch (_) { /* ignora */ }
    try { clearTick(); } catch (_) { /* ignora */ }
    swapTick().catch(() => {});
    try { assignTick(); } catch (_) { /* ignora */ }
    if (!enabled()) { if (host) { host.remove(); host = null; root = null; } return; }
    const s = isEmailDraft();
    if (!s) { if (host) { host.remove(); host = null; root = null; } return; }
    if (!host || !host.isConnected || host.previousElementSibling !== s) {
      if (host) host.remove();
      host = document.createElement('div');
      root = host.attachShadow({ mode: 'open' });
      s.insertAdjacentElement('afterend', host);
      loadedCache = false;   // rascunho novo: confere de novo se a lista está velha
      render();
    }
    if (loadedCache && !working && readAt && Date.now() - readAt > CACHE_MS) refresh(false);
    if (!loadedCache) {
      loadedCache = true;
      const c = (await chrome.storage.local.get(STORE_KEY))[STORE_KEY];
      if (c && Array.isArray(c.items)) { hist = c.items.map((x) => ({ name: x.name, type: x.type || '', count: x.count || 0, last: x.last || 0 })); items = rank(); render(); }
      readAt = (c && (c.r || c.t)) || 0;
      if (!readAt || Date.now() - readAt > CACHE_MS) setTimeout(() => refresh(false), 1500);
    }
  }

  async function init() {
    await I.ready;
    try {
      const r = await chrome.storage.sync.get('settings');
      settings = { ...settings, ...(r.settings || {}) };
      chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync' && ch.settings) { settings = { ...settings, ...(ch.settings.newValue || {}) }; items = rank(); render(); } });
    } catch (_) { /* contexto invalidado */ }
    setInterval(() => { tick().catch(() => {}); }, 1000);
  }
  init();
})();
