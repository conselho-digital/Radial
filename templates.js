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
        const raw = m[1].toUpperCase();
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
      try { await chrome.runtime.sendMessage({ type: 'tpl-clear-top' }); } catch (_) { /* segue sem limpar */ }
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

  function toast(lines, isErr) {
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
    if (isErr) { const mine = toastHost; setTimeout(() => { if (toastHost === mine) { mine.remove(); toastHost = null; } }, 15000); }
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
    { key: 'SI-D', area: 'DC', label: 'Sicharge D' }, { key: 'SI-UC', area: 'DC', label: 'SiCharge UC' },
    { key: 'AC22', area: 'AC', label: 'Sicharge AC22' }, { key: 'VC3', area: 'AC', label: 'Versicharge' },
    { key: 'RC', area: 'DC', label: 'RC' }, { key: 'FLEX', area: 'DC', label: 'Flex' }, { key: 'RAPID', area: 'DC', label: 'Rapid' },
    { key: 'MOBILE', area: 'DC', label: 'Mobile' }, { key: 'LEG', area: 'DC', label: 'Legacy' }, { key: 'other', area: 'DC', label: 'Other' }
  ];
  function detectCharger(name) {
    const n = String(name || '').toLowerCase();
    const pick = (k) => CHARGERS.find((c) => c.key === k);
    if (/\buc\b/.test(n)) return pick('SI-UC');
    if (/ac\s*22/.test(n)) return pick('AC22');
    if (/versicharge|vc3/.test(n)) return pick('VC3');
    if (/si-?charge\s*d\b|si-d\b/.test(n)) return pick('SI-D');
    if (/flex/.test(n)) return pick('FLEX');
    if (/rapid/.test(n)) return pick('RAPID');
    if (/mobile/.test(n)) return pick('MOBILE');
    if (/legacy|\bleg\b/.test(n)) return pick('LEG');
    if (/\brc\b/.test(n)) return pick('RC');
    return pick('other');
  }
  const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  let cmap = null;
  function countryToCode(name) {
    if (!cmap) {
      cmap = new Map();
      try {
        const dn = new Intl.DisplayNames(['en'], { type: 'region' });
        for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) { const c = String.fromCharCode(a, b), n = dn.of(c); if (n && n !== c) cmap.set(fold(n), c); }
      } catch (_) { /* sem Intl.DisplayNames */ }
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
    return '';
  }
  const deviceId = () => { const i = qv('input[aria-label="Device ID"]'); return i ? norm(i.value || i.getAttribute('title')) : ''; };

  let ticketHost = null, ticketBusy = false, ticketDlg = null;
  async function startTicket(btn) {
    if (ticketBusy) return;
    ticketBusy = true; btn.disabled = true;
    try {
      const cc = countryToCode(countryName());
      if (!cc) {
        const r = await chrome.runtime.sendMessage({ type: 'run-option', id: 'def_1' });
        if (!r || !r.ok) toast([tr('Ticket'), (r && r.error) || tr('Could not open the ticket generator.')], true);
        return;
      }
      const id = ticketId();
      const tabP = qv('li[data-id="tablist-tabProduct"]'), tabM = qv('li[data-id="tablist-tabMain"]');
      if (!tabP || !tabM) { toast([tr('Ticket'), tr('Product and Main tabs not found.')], true); return; }
      realClick(tabP);
      const fam = await waitFor(() => { const e = qv(FAM_SEL); return e && textOf(e); }, 7000);
      const serial = await waitFor(assetSerial, 3500) || '';
      const ch = detectCharger(fam);
      const dev = ch.key === 'SI-D' ? (await waitFor(deviceId, 4000)) || '' : '';
      realClick(tabM);
      const input = await waitFor(() => qv(TITLE_SEL), 6000);
      if (!input) { toast([tr('Ticket'), tr('Case Title field not found.')], true); return; }
      openTicketDialog({ id, cc, charger: ch, serial, dev, fam: fam || '', rest: (() => { const i = input.value.lastIndexOf(']'); return i >= 0 ? input.value.slice(i + 1).trim() : ''; })() });
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
    st.textContent = `.bg{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:14px/1.45 "Segoe UI",system-ui,sans-serif}
      .box{width:min(640px,92vw);background:#fff;color:#242424;border-radius:8px;box-shadow:0 12px 48px rgba(0,0,0,.35);padding:18px 20px}
      h2{margin:0 0 12px;font-size:16px}label{display:block;font-size:12px;font-weight:600;margin:10px 0 4px;color:#555}
      .row{display:flex;gap:10px}.row>div{flex:1}input,select{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #8a8886;border-radius:4px;font:inherit;background:#fff;color:#242424}
      .pre{font:13px Consolas,monospace;background:#f3f2f1;border-radius:4px;padding:6px 8px;word-break:break-all}.note{font-size:12px;color:#555;margin-top:8px}
      .act{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}button{font:inherit;padding:6px 20px;border-radius:4px;border:1px solid #8a8886;background:#f0f0f0;color:#242424;cursor:pointer}
      button.p{background:#0f6cbd;border-color:#0f6cbd;color:#fff}
      @media(prefers-color-scheme:dark){.box{background:#292929;color:#eee}input,select{background:#1f1f1f;color:#eee;border-color:#666}.pre{background:#1f1f1f}label,.note{color:#bbb}button{background:#3a3a3a;color:#eee;border-color:#666}button.p{background:#0f6cbd}}`;
    const bg = document.createElement('div'); bg.className = 'bg';
    const box = document.createElement('div'); box.className = 'box'; box.setAttribute('role', 'dialog');
    box.innerHTML = '<h2></h2><div class="row"><div><label data-k="ch"></label><select id="ch"></select></div><div><label data-k="sn"></label><input id="sn" spellcheck="false"></div></div><label data-k="pre"></label><div class="pre" id="pre"></div><label data-k="rest"></label><input id="rest" spellcheck="false"><div class="note" id="note"></div><div class="act"><button type="button" id="cn"></button><button type="button" class="p" id="ap"></button></div>';
    const $ = (q) => box.querySelector(q);
    $('h2').textContent = tr('Ticket title');
    $('[data-k=ch]').textContent = tr('Charger'); $('[data-k=sn]').textContent = tr('Serial number');
    $('[data-k=pre]').textContent = tr('Title start'); $('[data-k=rest]').textContent = tr('Text after the serial number');
    CHARGERS.forEach((c) => { const o = document.createElement('option'); o.value = c.key; o.textContent = c.label; $('#ch').appendChild(o); });
    $('#ch').value = d.charger.key; $('#sn').value = d.serial; $('#rest').value = d.rest;
    $('#cn').textContent = tr('Cancel'); $('#ap').textContent = tr('Apply');
    const cur = () => CHARGERS.find((c) => c.key === $('#ch').value) || d.charger;
    const prefix = () => `ID${d.id}-${cur().area}/${cur().key}/${d.cc}-[${norm($('#sn').value) || 'NULL'}]`;
    const note = () => {
      const bits = [];
      if (d.fam) bits.push(tr('Product family: {name}', { name: d.fam }));
      if (cur().key === 'SI-D') bits.push(d.dev ? tr('Device ID {id} will go into Charger ID.', { id: d.dev }) : tr('Device ID not found.'));
      $('#note').textContent = bits.join(' · ');
      $('#pre').textContent = prefix();
    };
    $('#ch').onchange = note; $('#sn').oninput = note; note();
    const close = () => { ticketDlg.remove(); ticketDlg = null; };
    const apply = () => {
      const t = document.querySelector(TITLE_SEL);
      if (!t) { toast([tr('Ticket'), tr('Case Title field not found.')], true); return; }
      const full = (prefix() + ' ' + norm($('#rest').value)).trim();
      typeInto(t, full); t.dispatchEvent(new Event('change', { bubbles: true }));
      if (cur().key === 'SI-D' && d.dev) {
        const c = document.querySelector('input[data-id="sie_chargerid.fieldControl-text-box-text"]');
        if (c) { typeInto(c, d.dev); c.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      close();
    };
    $('#ap').onclick = apply; $('#cn').onclick = close;
    bg.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); else if (e.key === 'Enter' && e.target.id !== 'ch') { e.preventDefault(); apply(); } });
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    bg.appendChild(box); r.append(st, bg); document.body.appendChild(ticketDlg);
    setTimeout(() => $('#rest').focus(), 50);
  }

  function ticketTick() {
    const h1 = settings.ticketBtn !== false && hostOk() && qv('[data-id="header_title"]');
    const on = h1 && qv('li[data-id="tablist-tabProduct"]');
    if (!on) { if (ticketHost) { ticketHost.remove(); ticketHost = null; } return; }
    if (ticketHost && ticketHost.isConnected && ticketHost.previousElementSibling === h1) return;
    if (ticketHost) ticketHost.remove();
    ticketHost = document.createElement('div');
    const r = ticketHost.attachShadow({ mode: 'open' });
    const st = document.createElement('style');
    st.textContent = ':host{display:inline-block;margin-left:12px;vertical-align:middle}button{font:400 13px "Segoe UI",system-ui,sans-serif;white-space:nowrap;padding:4px 14px;border:1px solid #8a8886;border-radius:4px;background:#f0f0f0;color:#242424;cursor:pointer}button:hover{background:#e1e1e1}button:disabled{opacity:.6;cursor:default}';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = tr('Ticket'); b.onclick = () => startTicket(b);
    r.append(st, b);
    h1.insertAdjacentElement('afterend', ticketHost);
  }

  async function tick() {
    try { dropQueue(); } catch (_) { /* ignora */ }
    try { rcTick(); } catch (_) { /* ignora */ }
    try { ticketTick(); } catch (_) { /* ignora */ }
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
