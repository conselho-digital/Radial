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
  const CACHE_MS = 60 * 60 * 1000;           // atualiza sozinho se a lista tiver mais de 1 hora
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => !!(el && (el.offsetParent !== null || el.getClientRects().length));

  let settings = { emailTpl: false, emailTplHosts: 'isp.crm4.dynamics.com', removeQueue: false, removeQueueName: 'eMobility Support Queue' };
  const hostKey = () => location.hostname.toLowerCase().replace(/^www\./, '');
  const hostOk = () => {
    const h = hostKey();
    return String(settings.emailTplHosts || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0].replace(/^www\./, '')).filter(Boolean)
      .some((d) => h === d || h.endsWith('.' + d));
  };
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
    .busy .it{opacity:.5;pointer-events:none}`;
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
    items.forEach((it) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'it';
      const n = document.createElement('b'); n.textContent = it.name;
      b.appendChild(n);
      if (it.type) { const s = document.createElement('span'); s.textContent = it.type; b.appendChild(s); }
      b.onclick = () => apply(it);
      card.appendChild(b);
    });
    if (!items.length && !working && !lastErr) { const m = document.createElement('div'); m.className = 'msg'; m.textContent = tr('No recent templates found.'); card.appendChild(m); }
    if (status) { const m = document.createElement('div'); m.className = 'msg'; m.textContent = status; card.appendChild(m); }
    if (lastErr) {
      const m = document.createElement('div'); m.className = 'msg err'; m.textContent = tr('Could not read the templates: {step}', { step: lastErr.step || lastErr.message }) + ' ';
      const d = document.createElement('button'); d.type = 'button'; d.className = 'dbg'; d.textContent = tr('Copy debug info');
      d.onclick = copyDebug; m.appendChild(d); card.appendChild(m);
    }
    root.appendChild(card);
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
        items = list.slice(0, 8);
        await chrome.storage.local.set({ [STORE_KEY]: { items, t: Date.now() } });
      }
      status = '';
    } catch (e) { lastErr = e; status = ''; console.warn('Radial: templates', e); }
    working = false; render();
  }

  // "eMob - Case Handover RC NEW": troca "RC-XX" no corpo pelo código de 2 letras do título (".../AT-[...").
  const RC_TEMPLATE = /^eMob - Case Handover RC NEW$/i;
  function countryCode() {
    for (const h of document.querySelectorAll('[data-id="header_title"], h1[id^="formHeaderTitle"]')) {
      const m = /\/([A-Za-z]{2})-\[/.exec(h.getAttribute('title') || h.textContent || '');
      if (m && visible(h)) return m[1].toUpperCase();
    }
    return null;
  }
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
      await applyTemplate(it.name);
      if (RC_TEMPLATE.test(it.name)) await fillRC();
      if (TS_TEMPLATE.test(it.name)) await dropTroubleshooting();
      items = [it, ...items.filter((x) => x.name !== it.name)];
      await chrome.storage.local.set({ [STORE_KEY]: { items, t: Date.now() } });
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
    const want = norm(settings.removeQueueName).toLowerCase();
    if (!want) return;
    const tag = [...document.querySelectorAll('[data-id="to.fieldControl-LookupResultsDropdown_to_selected_tag"]')]
      .find((t) => visible(t) && norm(t.getAttribute('title') || t.textContent).toLowerCase() === want);
    if (!tag) return;
    const del = tag.parentElement && tag.parentElement.querySelector('[data-id="to.fieldControl-LookupResultsDropdown_to_selected_tag_delete"]');
    if (!del) return;
    st.done = true;
    realClick(del);
  }

  async function tick() {
    try { dropQueue(); } catch (_) { /* ignora */ }
    if (!enabled()) { if (host) { host.remove(); host = null; root = null; } return; }
    const s = isEmailDraft();
    if (!s) { if (host) { host.remove(); host = null; root = null; } return; }
    if (!host || !host.isConnected || host.previousElementSibling !== s) {
      if (host) host.remove();
      host = document.createElement('div');
      root = host.attachShadow({ mode: 'open' });
      s.insertAdjacentElement('afterend', host);
      render();
    }
    if (!loadedCache) {
      loadedCache = true;
      const c = (await chrome.storage.local.get(STORE_KEY))[STORE_KEY];
      if (c && Array.isArray(c.items)) { items = c.items; render(); }
      if (!c || Date.now() - c.t > CACHE_MS) setTimeout(() => refresh(false), 1500);
    }
  }

  async function init() {
    await I.ready;
    try {
      const r = await chrome.storage.sync.get('settings');
      settings = { ...settings, ...(r.settings || {}) };
      chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync' && ch.settings) settings = { ...settings, ...(ch.settings.newValue || {}) }; });
    } catch (_) { /* contexto invalidado */ }
    setInterval(() => { tick().catch(() => {}); }, 1000);
  }
  init();
})();
