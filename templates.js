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

  const HOST = 'isp.crm4.dynamics.com';
  const QUEUE_NAME = 'eMobility Support Queue';
  let settings = { emailTpl: true, removeQueue: true, rcBtn: false, ticketBtn: true, emailTplKeep: 15, emailTplSee: 8 };
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

  async function apply(it) {
    if (working) return;
    working = true; status = tr('Applying…'); lastErr = null; render();
    try {
      try { await chrome.runtime.sendMessage({ type: 'tpl-clear-top', wipeAll: WIPE_TEMPLATE.test(it.name) }); } catch (_) { /* segue sem limpar */ }
      await applyTemplate(it.name);
      used(it); items = rank(); await saveHist();
      if (RC_TEMPLATE.test(it.name)) await fillRC();
      if (TS_TEMPLATE.test(it.name)) await dropTroubleshooting();
      status = '';
    } catch (e) { lastErr = e; status = ''; console.warn('Radial: templates', e); }
    working = false; render();
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

  const KEYCODES = { Enter: 13 };
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
  async function pickLookup(input, text) {
    realClick(input);
    typeInto(input, text);
    const found = await waitFor(() => dropdownRow(input, text.toLowerCase()), 7000, 150);
    if (found) { await sleep(300); pressKey(input, 'Enter'); await sleep(900); } else { wipeInput(input); await sleep(300); }
    return !!found;
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
  async function syncStage() {
    const stage = qv(STAGE);
    if (!stage) throw new Error(tr('Process stage not found.'));
    realClick(stage);
    const warr = await waitFor(() => qv(WARR_FLY), 5000);
    if (!warr) throw new Error(tr('Warranty Confirmed? not found.'));
    const warrantyValue = ddValue(warr);
    const status = qv(STATUS_FLY);
    if (status && ddValue(status).toLowerCase() !== 'new enquiry') await chooseOption(status, 'New Enquiry');
    if (qv(WARR_FLY)) { realClick(stage); await sleep(500); }       // fecha a etapa
    const main = await waitFor(() => qv(WARR_MAIN), 4000);
    if (!main) throw new Error(tr('Warranty claimed by Customer not found.'));
    if (warrantyValue && ddValue(main).toLowerCase() !== warrantyValue.toLowerCase()) await chooseOption(main, warrantyValue);
  }

  let ticketHost = null, ticketBusy = false, ticketDlg = null, ticketRun = 0;

  // Passa pela aba Product (família, serial do asset, Device ID), volta a Main e lê o título atual.
  async function collectProduct(d) {
    const tabP = qv('li[data-id="tablist-tabProduct"]'), tabM = qv('li[data-id="tablist-tabMain"]');
    if (!tabP || !tabM) throw new Error(tr('Product and Main tabs not found.'));
    realClick(tabP);
    const fam = await waitFor(() => { const e = qv(FAM_SEL); return e && textOf(e); }, 7000);
    d.fam = fam || '';
    // Família "Sifinity" (software): o tipo vem do campo Product (Sifinity Control, DepotFinity, Sifinity Go…).
    const prodTag = await waitFor(() => { const u = lookupList('productid'); const e = u && u.querySelector('[data-id$="_selected_tag_text"]'); return e && textOf(e); }, 3000);
    const prodSw = detectSoftware(prodTag);
    d.swFamily = /sifinity|depotfinity|software/i.test(d.fam);
    d.sw = detectSoftware(d.fam) || ((d.swFamily || !detectCharger(d.fam)) && prodSw) || null;
    d.charger = d.sw || d.swFamily ? null : detectCharger(d.fam);
    d.product = prodTag || '';
    if (d.sw || d.swFamily) d.serial = (await waitFor(assetSerial, 2500)) || '';   // software: o asset costuma não existir
    if (!d.sw && !d.swFamily) {
      d.serial = (await waitFor(assetSerial, 7000)) || '';
      if (!d.charger || d.charger.key === 'SI-D') d.dev = (await waitFor(deviceId, 4000)) || '';
    }
    realClick(tabM);
    const input = await waitFor(() => qv(TITLE_SEL), 6000);
    if (!input) throw new Error(tr('Case Title field not found.'));
    const i = input.value.lastIndexOf(']');
    d.rest = i >= 0 ? input.value.slice(i + 1).trim() : norm(input.value);
  }

  async function startTicket(btn) {
    if (ticketBusy) return;
    ticketBusy = true; btn.disabled = true;
    const run = ++ticketRun;
    try {
      const name = countryName();
      const d = { id: ticketId(), cc: countryToCode(name), fam: '', charger: null, sw: null, serial: '', dev: '', rest: '', run };
      if (d.cc) { await collectProduct(d); if (run === ticketRun) openTicketDialog(d); }
      else openTicketDialog(d);   // sem país: a janela pergunta, grava no campo e então lê o produto
    } catch (e) {
      console.warn('Radial: ticket', e);
      toast([tr('Ticket'), String(e && e.message || e)], true);
    } finally { ticketBusy = false; btn.disabled = false; }
  }

  function openTicketDialog(d) {
    if (ticketDlg) ticketDlg.remove();
    ticketDlg = document.createElement('div');
    const r = ticketDlg.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = `.bg{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',Roboto,sans-serif;color:#333}
      .box{width:min(580px,92vw);background:#f4f7f9;border-radius:8px;box-shadow:5px 5px 25px rgba(0,0,0,.4)}
      .top{background:#005f6b;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:15px;letter-spacing:.5px;border-radius:8px 8px 0 0;user-select:none}
      .x{cursor:pointer;font-size:26px;line-height:1;font-weight:normal;color:rgba(255,255,255,.7);background:none;border:0;padding:0}.x:hover{color:#fff}
      .body{padding:18px}.lbl{font-size:13px;font-weight:bold;color:#005f6b;letter-spacing:.5px;text-transform:uppercase;margin:0 0 6px}
      input{width:100%;padding:6px 12px;border:1px solid #005f6b;border-radius:5px;background:#fff;font:bold 14px 'Segoe UI',Roboto,sans-serif;height:34px;box-sizing:border-box;color:#333}
      .pre{font:14px Consolas,monospace;padding:6px 10px;border:1px solid #ccc;border-radius:4px;min-height:30px;box-sizing:border-box;word-break:break-all;display:flex;align-items:center}
      .note{font-size:11px;font-weight:600;color:#555;margin:0 0 6px}.note.gap{margin-top:14px}
      .list{border:1px solid #005f6b;border-radius:5px;background:#fff;max-height:300px;overflow-y:auto}
      .it{padding:8px 12px;cursor:pointer;font-size:14px;font-weight:bold;color:#333;background:#fff;border:0;width:100%;text-align:left;display:block;font-family:inherit}.it:hover{background:#005f6b;color:#fff}
      .it.sw{color:#005f6b;border-top:1px solid #cfd8dc}
      .act{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      .btn{background:#005f6b;color:#fff;border:none;border-radius:4px;padding:6px 18px;font:bold 13px 'Segoe UI',Roboto,sans-serif;cursor:pointer}.btn:hover{background:#004852}
      .btn.g{background:#fff;color:#005f6b;border:1px solid #005f6b}.btn.g:hover{background:#e6f7f8}`;
    const bg = document.createElement('div'); bg.className = 'bg';
    const box = document.createElement('div'); box.className = 'box'; box.setAttribute('role', 'dialog');
    box.innerHTML = '<div class="top"><span>Ticket Generator</span><button class="x" type="button" aria-label="Close">&times;</button></div><div class="body"></div>';
    const body = box.querySelector('.body');
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const close = () => { d.closed = true; if (ticketDlg) ticketDlg.remove(); ticketDlg = null; };
    box.querySelector('.x').onclick = close;
    const sn = () => norm(d.serial) || 'NULL';
    const prefix = () => d.sw ? `ID${d.id}-${d.sw.key}/${d.cc}-[${sn()}]` : `ID${d.id}-${d.charger.area}/${d.charger.key}/${d.cc}-[${sn()}]`;
    const busy = (msg) => { body.textContent = ''; body.append(mk('div', 'lbl', msg)); };

    // Uma pergunta por vez: país, tipo (carregador ou software), serial; sem faltas, a tela final.
    function step() {
      if (d.closed) return;
      body.textContent = '';
      if (!d.cc) return askCountry();
      if (!d.sw && !d.charger) return askType(!!d.swFamily);
      if (!d.serial && !d.serialAsked) return askSerial();
      if (d.charger && d.charger.key === 'SI-D' && !d.dev && !d.devAsked) return askDevice();
      return finalStep();
    }
    function askCountry() {
      body.append(mk('div', 'lbl', tr('Country not found. Pick the country:')));
      const inp = mk('input'); inp.spellcheck = false; inp.placeholder = tr('Type the country name');
      const list = mk('div', 'list'); list.style.marginTop = '6px';
      const all = countryList();
      const items = all.map((c) => { const b = mk('button', 'it', c.name); b.type = 'button'; b.onclick = () => choose(c); list.appendChild(b); return { c, b }; });
      const filter = () => { const q = fold(inp.value); items.forEach(({ c, b }) => { b.style.display = !q || fold(c.name).includes(q) ? 'block' : 'none'; }); };
      async function choose(c) {
        busy(tr('Reading the ticket…'));
        try {
          const f = document.querySelector(COUNTRY_INPUT);
          if (!f) throw new Error(tr('Country of Charger field not found.'));
          const ok = await pickLookup(f, c.name);
          if (!ok) throw new Error(tr('Could not select "{name}" in Country of Charger.', { name: c.name }));
          d.cc = c.code;
          await collectProduct(d);
          step();
        } catch (e) { toast([tr('Ticket'), String(e && e.message || e)], true); close(); }
      }
      inp.addEventListener('input', filter);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const f = items.find((x) => x.b.style.display !== 'none'); if (f) choose(f.c); } });
      body.append(inp, list);
      setTimeout(() => inp.focus(), 30);
    }
    function askType(software) {
      body.append(mk('div', 'lbl', software ? tr('Pick the software:') : tr('Product family not recognized{name}. Pick the charger:', { name: d.fam ? ' (' + d.fam + ')' : '' })));
      const list = mk('div', 'list');
      (software ? SOFTWARE : CHARGERS).forEach((c) => {
        const b = mk('button', 'it', c.label); b.type = 'button';
        b.onclick = () => { if (software) d.sw = c; else { d.charger = c; if (c.key === 'SI-D' && !d.dev) d.dev = deviceId(); } step(); };
        list.appendChild(b);
      });
      const sw = mk('button', 'it sw', software ? tr('Back to chargers') : 'Software'); sw.type = 'button';
      sw.onclick = () => { body.textContent = ''; askType(!software); };
      list.appendChild(sw);
      body.appendChild(list);
    }
    function askSerial() {
      body.append(mk('div', 'lbl', tr('Serial number not found')));
      const inp = mk('input'); inp.spellcheck = false; inp.value = 'NULL';
      body.appendChild(inp);
      const act = mk('div', 'act');
      const ok = mk('button', 'btn', tr('OK')); ok.type = 'button';
      const go = () => { const v = norm(inp.value); d.serial = /^null$/i.test(v) ? '' : v; d.serialAsked = true; step(); };
      ok.onclick = go;
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      act.append(ok); body.appendChild(act);
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    }
    function askDevice() {
      body.append(mk('div', 'lbl', tr('Device ID not found')));
      const inp = mk('input'); inp.spellcheck = false; inp.placeholder = tr('Type the Device ID');
      body.appendChild(inp);
      const act = mk('div', 'act');
      const skip = mk('button', 'btn g', tr('Skip')); skip.type = 'button';
      const ok = mk('button', 'btn', tr('OK')); ok.type = 'button';
      const go = () => { d.dev = norm(inp.value); d.devAsked = true; step(); };
      skip.onclick = () => { d.dev = ''; d.devAsked = true; step(); };
      ok.onclick = go;
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      act.append(skip, ok); body.appendChild(act);
      setTimeout(() => inp.focus(), 30);
    }
    function finalStep() {
      body.textContent = '';
      const pre = mk('div', 'pre', prefix()); pre.style.background = (d.sw || d.charger).color || '#fff';
      body.appendChild(pre);
      body.appendChild(mk('div', 'note gap', tr('Ticket Title')));
      const rest = mk('input'); rest.spellcheck = false; rest.value = d.rest; body.appendChild(rest);
      const act = mk('div', 'act');
      const cn = mk('button', 'btn g', tr('Cancel')); cn.type = 'button'; cn.onclick = close;
      const ap = mk('button', 'btn', tr('Apply')); ap.type = 'button';
      const apply = () => {
        const t = document.querySelector(TITLE_SEL);
        if (!t) { toast([tr('Ticket'), tr('Case Title field not found.')], true); return; }
        typeInto(t, (prefix() + ' ' + norm(rest.value)).trim()); t.dispatchEvent(new Event('change', { bubbles: true }));
        if (d.charger && d.charger.key === 'SI-D' && d.dev) {
          const c = document.querySelector('input[data-id="sie_chargerid.fieldControl-text-box-text"]');
          if (c) { typeInto(c, d.dev); c.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        close();
        syncStage().catch((e) => toast([tr('Update title'), String(e && e.message || e)], true));
      };
      ap.onclick = apply;
      rest.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
      act.append(cn, ap); body.appendChild(act);
      setTimeout(() => rest.focus(), 30);
    }
    bg.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    bg.appendChild(box); r.append(st, bg); document.body.appendChild(ticketDlg);
    step();
  }

  // ---------- Botão × na aba Product: limpa Product e Main Asset (Technology e Product Family são só leitura) ----------
  let clearHost = null, clearBusy = false;
  const PRODUCT_LISTS = ['productid', 'sie_productfamilyid', 'sie_technologyid', 'sie_mainassetid'];
  const lookupList = (id) => qv(`ul[data-id="${id}.fieldControl-LookupResultsDropdown_${id}_SelectedRecordList"]`);
  async function clearProduct(btn) {
    if (clearBusy) return;
    clearBusy = true; btn.disabled = true;
    try {
      // Ordem: Main Asset, Product, Product Family, Technology (os dois últimos podem ser só leitura)
      for (const id of ['sie_mainassetid', 'productid', 'sie_productfamilyid', 'sie_technologyid']) {
        const ul = lookupList(id);
        const dels = ul ? [...ul.querySelectorAll(`button[data-id="${id}.fieldControl-LookupResultsDropdown_${id}_selected_tag_delete"]`)] : [];
        for (const d of dels) { realClick(d); await sleep(700); }
      }
      await sleep(800);
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
    st.textContent = ':host{display:inline-block;margin-left:10px;vertical-align:middle}button{box-sizing:border-box;font:400 13px/18px "Segoe UI",system-ui,sans-serif;white-space:nowrap;padding:3px 10px;border:1px solid #d1d1d1;border-radius:4px;background:#fff;color:#242424;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.12);transition:background .1s,border-color .1s}button:hover{background:#f5f5f5;border-color:#c7c7c7}button:active{background:#e0e0e0;border-color:#b3b3b3}button:focus-visible{outline:2px solid #000;outline-offset:1px}button:disabled{opacity:.6;cursor:default}';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = tr('Swap'); b.onclick = () => swapContacts(b);
    r.append(st, b);
    wrap.appendChild(swapHost);
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
    try { rcTick(); } catch (_) { /* ignora */ }
    try { ticketTick(); } catch (_) { /* ignora */ }
    try { clearTick(); } catch (_) { /* ignora */ }
    swapTick().catch(() => {});
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
