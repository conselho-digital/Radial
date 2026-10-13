// Service worker: escuta o atalho, avisa o content script e executa bookmarklets.

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

chrome.action.onClicked.addListener((tab) => openRadial(tab));

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
// 1) eval indireto; 2) se a CSP/Trusted Types bloquear o eval, tag <script> inline.
// Erros do próprio bookmarklet NÃO disparam nova tentativa (evita rodar duas vezes).
async function runBookmarklet(tabId, raw) {
  const code = normalizeBookmarklet(raw);
  if (!code) return { ok: false, error: 'Bookmarklet vazio.' };
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [code],
    func: async (src) => {
      const BLOCKED = /unsafe-eval|content security policy|trustedscript|trusted type/i;
      try {
        (0, eval)(src);
        return { ok: true };
      } catch (e) {
        if (!BLOCKED.test(String(e && e.message))) {
          return { ok: false, error: 'Erro no bookmarklet: ' + (e && e.message ? e.message : e) };
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
        return { ok: false, error: 'Bloqueado pela página: ' + (e && e.message ? e.message : e) };
      } finally {
        document.removeEventListener('securitypolicyviolation', onViolation);
      }
      return violated ? { ok: false, error: 'Bloqueado pela política de segurança (CSP) desta página.' } : { ok: true };
    }
  });
  return (res && res.result) || { ok: false, error: 'Sem resposta da página.' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Só aceita pedidos desta extensão, vindos do frame principal de uma aba.
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return;
  if (msg && msg.type === 'run-bookmarklet' && Number.isInteger(msg.index)) {
    // O código nunca trafega pelo content script: é lido aqui, do armazenamento.
    const key = 'bm_' + msg.index;
    chrome.storage.sync.get(key)
      .then((r) => (r[key] && r[key].code ? runBookmarklet(sender.tab.id, r[key].code) : { ok: false, error: 'Bookmarklet não encontrado.' }))
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true; // resposta assíncrona
  }
});
