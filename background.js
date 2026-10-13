// Service worker: escuta o atalho, avisa o content script e executa as opções JavaScript.
importScripts('store.js');

const OPEN_MSG = { type: 'open-radial' };

// Abre o menu na aba ativa. Se o content script ainda não existe na aba
// (aba aberta antes da instalação), injeta e tenta de novo.
async function openRadial(tab) {
  if (!tab || tab.id == null) {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  if (!tab || tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, OPEN_MSG);
  } catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['sites.js', 'radial-css.js', 'content.js'] });
      await chrome.tabs.sendMessage(tab.id, OPEN_MSG);
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
  await Promise.all(tabs.map((t) =>
    chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['sites.js', 'radial-css.js', 'content.js'] }).catch(() => {})));
}

chrome.runtime.onInstalled.addListener(() => {
  RADIAL_STORE.migrate();
  injectIntoOpenTabs();
});
chrome.runtime.onStartup.addListener(() => RADIAL_STORE.migrate());

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
// 3) se a CSP bloquear também, chrome.userScripts (não sofre CSP; exige ligar "Permitir scripts do usuário").
// Erros do próprio bookmarklet NÃO disparam nova tentativa (evita rodar duas vezes).
// Favoritos copiados da barra de endereço podem trazer %60, %22… no meio do código: se o código
// não compila e tem escapes %XX, tenta de novo com os escapes decodificados.
async function runBookmarklet(tabId, raw) {
  const code = normalizeBookmarklet(raw);
  if (!code) return { ok: false, error: 'Bookmarklet vazio.' };
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [code],
    func: async (src) => {
      const BLOCKED = /unsafe-eval|content security policy|trustedscript|trusted type/i;
      const unescape = (t) => t.replace(/(?:%[0-9a-f]{2})+/gi, (m) => { try { return decodeURIComponent(m); } catch (_) { return m; } });
      const fail = (e) => ({ ok: false, error: 'Erro no bookmarklet: ' + (e && e.message ? e.message : e) });
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
        return { ok: false, blocked: true, error: 'Bloqueado pela página: ' + (e && e.message ? e.message : e) };
      } finally {
        document.removeEventListener('securitypolicyviolation', onViolation);
      }
      return violated ? { ok: false, blocked: true, error: 'Bloqueado pela política de segurança (CSP) desta página.' } : { ok: true };
    }
  });
  const out = (res && res.result) || { ok: false, error: 'Sem resposta da página.' };
  if (out.blocked) return runWithUserScripts(tabId, code, out);
  return out;
}

// Último recurso para páginas com CSP estrito.
async function runWithUserScripts(tabId, code, blockedResult) {
  if (!chrome.userScripts || !chrome.userScripts.execute) {
    return { ok: false, error: blockedResult.error + ' Para contornar: em chrome://extensions > Radial > Detalhes, ligue "Permitir scripts do usuário" (Chrome 135+).' };
  }
  try {
    // Mesmo tratamento de %XX: o código roda dentro de try para não derrubar a página.
    await chrome.userScripts.execute({ target: { tabId }, world: 'MAIN', injectImmediately: true, js: [{ code }] });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: blockedResult.error + ' (' + (e && e.message ? e.message : e) + ') Ligue "Permitir scripts do usuário" nos detalhes da extensão.' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg) return;

  // Vindo do popup da extensão (sem aba): abre o radial na aba pedida.
  if (msg.type === 'open-radial-tab' && !sender.tab && Number.isInteger(msg.tabId)) {
    openRadial({ id: msg.tabId }).then(() => sendResponse({ ok: true }));
    return true;
  }

  // Vindo do content script (só o frame principal de uma aba): executa uma opção JavaScript.
  if (msg.type === 'run-option' && sender.tab && sender.frameId === 0 && typeof msg.id === 'string') {
    // O código nunca trafega pelo content script: é lido aqui, do armazenamento.
    RADIAL_STORE.get(msg.id)
      .then((o) => (o && o.type === 'js' && o.code ? runBookmarklet(sender.tab.id, o.code) : { ok: false, error: 'Opção não encontrada.' }))
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true; // resposta assíncrona
  }
});
