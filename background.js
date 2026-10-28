// Service worker: escuta o atalho, avisa o content script e executa as opções JavaScript.
importScripts('store.js', 'i18n-labels.js', 'i18n-ui.js', 'i18n.js');
const t = (s, v) => RADIAL_I18N.t(s, v);

const OPEN_MSG = { type: 'open-radial' };
const CONTENT_FILES = ['sites.js', 'store.js', 'i18n-labels.js', 'i18n-ui.js', 'i18n.js', 'radial-css.js', 'content.js'];

// Abre o menu na aba ativa. Se o content script ainda não existe na aba
// (aba aberta antes da instalação), injeta e tenta de novo.
async function openRadial(tab, extra = {}) {
  if (!tab || tab.id == null) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (!tab || tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { ...OPEN_MSG, ...extra });
  } catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES });
      await chrome.tabs.sendMessage(tab.id, { ...OPEN_MSG, ...extra });
    } catch (e) {
      // Páginas internas (chrome://, Web Store) não aceitam injeção.
      console.warn('Radial: não foi possível abrir nesta página.', e);
    }
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open-radial') openRadial(tab);
});

// Abas já abertas não recebem o content script de uma extensão recém-instalada/atualizada:
// injeta nelas para o menu aparecer sem precisar recarregar a página.
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.all(tabs.map((tab) =>
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES }).catch(() => {})));
}

// Bookmarklets que já vêm com a extensão: defaults/index.json (bookmarklets, remove, presets); cada código fica
// em defaults/<file>, guardado exatamente como foi enviado. Cada um é criado uma vez (por id); se o usuário
// apagar ou editar, não é recriado nem sobrescrito. Entram na lista de bookmarklets salvos, fora do radial.
async function seedDefaults() {
  try {
    const cfg = await (await fetch(chrome.runtime.getURL('defaults/index.json'))).json();
    const { defaults_seeded: seeded = [] } = await chrome.storage.local.get('defaults_seeded');
    const done = new Set(seeded);
    // Bookmarklets padrão que foram retirados da extensão: apagados uma vez.
    for (const id of cfg.remove || []) {
      if (done.has('removed:' + id)) continue;
      await chrome.storage.local.remove('opt_def_' + id);
      done.add('removed:' + id);
    }
    const { defaults_rev: revs = {} } = await chrome.storage.local.get('defaults_rev');
    for (const d of cfg.bookmarklets || []) {
      // Nova revisão do código de um padrão já criado: troca o código (mantém anéis e atalho do usuário).
      if (done.has(d.id) && d.rev && (revs[d.id] || 1) < d.rev) {
        const k = 'opt_def_' + d.id;
        const cur = (await chrome.storage.local.get(k))[k];
        if (cur) await chrome.storage.local.set({ [k]: { ...cur, code: await (await fetch(chrome.runtime.getURL('defaults/' + d.file))).text() } });
        revs[d.id] = d.rev;
        continue;
      }
      if (done.has(d.id)) continue;
      if (d.rev) revs[d.id] = d.rev;
      const code = await (await fetch(chrome.runtime.getURL('defaults/' + d.file))).text();
      await chrome.storage.local.set({ ['opt_def_' + d.id]: { type: 'js', name: d.name, code, ctx: d.ctx || [], ...(d.shortcut ? { shortcut: d.shortcut } : {}), t: d.order || Date.now() } });
      done.add(d.id);
    }
    // Predefinições por site (uma vez): quais bookmarklets entram no radial do domínio, a ordem e
    // quais opções padrão ficam escondidas. Depois disso, o que o usuário mudar é respeitado.
    for (const p of cfg.presets || []) {
      const key = 'preset:' + p.id;
      if (done.has(key)) continue;
      const ring = 'host:' + p.host;
      // Ações prontas do registro (sites.js) que a predefinição cria neste anel.
      for (const act of p.actions || []) {
        const k = 'opt_def_' + act.id;
        if (!(await chrome.storage.local.get(k))[k]) await chrome.storage.local.set({ [k]: { type: 'action', name: act.ref.label, ref: act.ref, ctx: [ring], t: Date.now() } });
      }
      for (const id of p.add || []) {
        const k = 'opt_def_' + id;
        const o = (await chrome.storage.local.get(k))[k];
        if (o && !(o.ctx || []).includes(ring)) await chrome.storage.local.set({ [k]: { ...o, ctx: [...(o.ctx || []), ring] } });
      }
      if (p.order) await RADIAL_STORE.setOrder(ring, p.order);
      if (p.hide) await RADIAL_STORE.setHidden(ring, [...new Set([...(await RADIAL_STORE.getHidden(ring)), ...p.hide])]);
      done.add(key);
    }
    await chrome.storage.local.set({ defaults_seeded: [...done], defaults_rev: revs });
  } catch (e) { console.warn('Radial: não foi possível criar os bookmarklets padrão.', e); }
}

async function onStart() {
  await RADIAL_STORE.migrate();
  await seedDefaults();
}

chrome.runtime.onInstalled.addListener(() => {
  onStart();
  injectIntoOpenTabs();
});
chrome.runtime.onStartup.addListener(onStart);

// Remove "javascript:" do começo e decodifica %XX (formato de favorito colado da barra de endereço).
// Só decodifica quando não há espaços: código escrito à mão pode conter "%" de verdade.
function normalizeBookmarklet(raw) {
  let code = String(raw || '').trim();
  if (/^javascript:/i.test(code)) {
    code = code.replace(/^javascript:/i, '');
    if (!/\s/.test(code)) {
      try { code = decodeURIComponent(code); } catch (_) { /* já estava em texto puro */ }
    }
  }
  return code;
}

// Roda o código no mundo MAIN da página (acesso às variáveis da própria página).
// 1) eval indireto; 2) se a CSP/Trusted Types bloquear o eval, tag <script> inline;
// 3) se a CSP bloquear também, avalia pelo depurador do Chrome (chrome.debugger), que ignora a CSP da página.
// Erros do próprio bookmarklet NÃO disparam nova tentativa (evita rodar duas vezes).
// Favoritos copiados da barra de endereço podem trazer %60, %22… no meio do código: se o código
// não compila e tem escapes %XX, tenta de novo com os escapes decodificados.
async function runBookmarklet(tabId, raw) {
  const code = normalizeBookmarklet(raw);
  if (!code) return { ok: false, error: t('Empty bookmarklet.') };
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [code],
    func: async (src) => {
      const BLOCKED = /unsafe-eval|content security policy|trustedscript|trusted type/i;
      const unescape = (t) => t.replace(/(?:%[0-9a-f]{2})+/gi, (m) => { try { return decodeURIComponent(m); } catch (_) { return m; } });
      const fail = (e) => ({ ok: false, err: String(e && e.message ? e.message : e) });
      try {
        (0, eval)(src);
        return { ok: true };
      } catch (e) {
        if (e instanceof SyntaxError && /%[0-9a-f]{2}/i.test(src)) {
          try { (0, eval)(unescape(src)); return { ok: true }; } catch (e2) { if (!BLOCKED.test(String(e2 && e2.message))) return fail(e2); }
        } else if (!BLOCKED.test(String(e && e.message))) {
          return fail(e);
        }
      }
      // eval bloqueado: tenta <script> inline e observa violações de CSP.
      let violated = false;
      const onViolation = () => { violated = true; };
      document.addEventListener('securitypolicyviolation', onViolation);
      try {
        const s = document.createElement('script');
        s.textContent = src;
        (document.head || document.documentElement).appendChild(s);
        s.remove();
        await new Promise((r) => setTimeout(r, 60));
      } catch (e) {
        return { ok: false, blocked: true, err: String(e && e.message ? e.message : e) };
      } finally {
        document.removeEventListener('securitypolicyviolation', onViolation);
      }
      return violated ? { ok: false, blocked: true, csp: true } : { ok: true };
    }
  });
  const out = (res && res.result) || { ok: false, error: t('No response from the page.') };
  if (out.blocked) return runWithDebugger(tabId, code, out);
  if (out.err) return { ok: false, error: t('Bookmarklet error: {msg}', { msg: out.err }) };
  return out;
}

// Último recurso para páginas com CSP estrito (eval e <script> inline bloqueados): o depurador do Chrome
// avalia o código fora das regras da página. O Chrome mostra o aviso "depurando este navegador" só
// enquanto está anexado; soltamos logo após rodar (o código continua ativo na página).
async function runWithDebugger(tabId, code, blockedResult) {
  const target = { tabId };
  const unescape = (t) => t.replace(/(?:%[0-9a-f]{2})+/gi, (m) => { try { return decodeURIComponent(m); } catch (_) { return m; } });
  try {
    await chrome.debugger.attach(target, '1.3');
  } catch (e) {
    const why = blockedResult.csp ? t('Blocked by this page security policy (CSP).') : t('Blocked by the page: {msg}', { msg: blockedResult.err });
    return { ok: false, error: why + ' (' + (e && e.message ? e.message : e) + ')' };
  }
  try {
    const evaluate = (expression) => chrome.debugger.sendCommand(target, 'Runtime.evaluate',
      { expression, userGesture: true, allowUnsafeEvalBlockedByCSP: true, replMode: false });
    let r = await evaluate(code);
    const syntax = (x) => x.exceptionDetails && x.exceptionDetails.exception && x.exceptionDetails.exception.className === 'SyntaxError';
    if (syntax(r) && /%[0-9a-f]{2}/i.test(code)) r = await evaluate(unescape(code));
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      return { ok: false, error: t('Bookmarklet error: {msg}', { msg: (d.exception && (d.exception.description || d.exception.value)) || d.text }) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  } finally {
    chrome.debugger.detach(target).catch(() => {});
  }
}

// Bookmarklets com dados no código: entre /*RADIAL-DATA-START*/ e /*RADIAL-DATA-END*/ fica uma lista JSON
// (ex.: palavras e cores do 🖌️). O pedido vem da página (pode ser forjado), então a lista é revalidada e
// regravada com JSON.stringify: só texto simples e cores, nunca código.
const DATA_BLOCK = /\/\*RADIAL-DATA-START\*\/[\s\S]*?\/\*RADIAL-DATA-END\*\//;
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:hsl|rgb)a?\([\d\s.,%\/]+\))$/i;
function cleanWords(data) {
  if (!Array.isArray(data) || data.length > 100) return null;
  const out = [];
  for (const w of data) {
    if (!w || typeof w.termtxt !== 'string' || w.termtxt.length > 200 || /\/\*|\*\//.test(w.termtxt)) return null;
    if (typeof w.colortxt !== 'string' || !COLOR_RE.test(w.colortxt)) return null;
    out.push({ termtxt: w.termtxt, colortxt: w.colortxt, enabledtxt: w.enabledtxt !== false, hiddentxt: w.hiddentxt === true });
  }
  return out;
}
async function saveBookmarkletData(detail) {
  const m = JSON.parse(detail);
  if (!m || typeof m.id !== 'string' || !/^[\w-]+$/.test(m.id)) return;
  const data = cleanWords(m.data);
  if (!data) return;
  const k = 'opt_' + m.id;
  const o = (await chrome.storage.local.get(k))[k];
  if (!o || o.type !== 'js' || !DATA_BLOCK.test(o.code)) return;
  const next = o.code.replace(DATA_BLOCK, () => '/*RADIAL-DATA-START*/' + JSON.stringify(data) + '/*RADIAL-DATA-END*/');
  if (next !== o.code) await chrome.storage.local.set({ [k]: { ...o, code: next } });
}

// O popup mantém uma conexão aberta enquanto existe; quando ela cai (popup fechado), o radial de
// pré-visualização some da página.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup-preview' || port.sender.id !== chrome.runtime.id) return;
  let tabId = null;
  port.onMessage.addListener((m) => { if (m && Number.isInteger(m.tabId)) tabId = m.tabId; });
  port.onDisconnect.addListener(() => {
    if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'close-radial', preview: true }).catch(() => {});
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg) return;

  // Vindo do popup da extensão (sem aba): abre o radial na aba pedida.
  const fromPopup = !!sender.url && sender.url.startsWith(chrome.runtime.getURL('popup.html'));
  if (msg.type === 'open-radial-tab' && fromPopup && Number.isInteger(msg.tabId)) {
    openRadial({ id: msg.tabId }, { preview: !!msg.preview }).then(() => sendResponse({ ok: true }));
    return true;
  }
  // O popup fechou: tira o radial de pré-visualização da página.
  if (msg.type === 'close-radial-tab' && fromPopup && Number.isInteger(msg.tabId)) {
    chrome.tabs.sendMessage(msg.tabId, { type: 'close-radial', preview: true }).catch(() => {});
    return;
  }

  if (msg.type === 'bookmarklet-data' && sender.tab && sender.frameId === 0 && typeof msg.detail === 'string' && msg.detail.length < 200000) {
    saveBookmarkletData(msg.detail).catch(() => {});
    return;
  }

  // Cartão de templates: troca "RC-XX" pelo código do país no editor do e-mail (CKEditor 5). O editor só
  // aceita mudanças pelo modelo dele, que fica acessível no mundo da página (element.ckeditorInstance).
  if (msg.type === 'tpl-fix-rc' && sender.tab && sender.frameId === 0 && typeof msg.code === 'string' && /^[A-Z]{2}$/.test(msg.code)) {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      args: [msg.code],
      func: (code) => {
        let total = 0;
        document.querySelectorAll('.ck-editor__editable').forEach((el) => {
          const ed = el.ckeditorInstance;
          if (!ed || !ed.model) return;
          ed.model.change((w) => {
            const hits = [];
            for (const item of w.createRangeIn(ed.model.document.getRoot()).getItems()) {
              if (!item.is('$textProxy')) continue;
              const re = /RC-XX(?![A-Za-z])/g; let m;
              while ((m = re.exec(item.data))) hits.push({ item, at: m.index + 3 });
            }
            hits.reverse().forEach(({ item, at }) => {
              const start = w.createPositionAt(item.parent, item.startOffset + at);
              const attrs = Object.fromEntries(item.getAttributes());
              w.remove(w.createRange(start, w.createPositionAt(item.parent, item.startOffset + at + 2)));
              w.insertText(code, attrs, start);
              total++;
            });
          });
        });
        return total;
      },
    }).then((r) => sendResponse({ n: (r && r[0] && r[0].result) || 0 })).catch(() => sendResponse({ n: 0 }));
    return true;
  }

  // Vindo do content script (só o frame principal de uma aba): executa uma opção JavaScript.
  if (msg.type === 'run-option' && sender.tab && sender.frameId === 0 && typeof msg.id === 'string') {
    // O código nunca trafega pelo content script: é lido aqui, do armazenamento.
    RADIAL_STORE.get(msg.id)
      .then((o) => (o && o.type === 'js' && o.code ? runBookmarklet(sender.tab.id, o.code) : { ok: false, error: t('Option not found.') }))
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true; // resposta assíncrona
  }
});
