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
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['sites.js', 'content.js'] });
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

// Remove "javascript:" e decodifica %XX (formato de favorito) quando necessário.
function normalizeBookmarklet(raw) {
  let code = String(raw || '').trim();
  if (/^javascript:/i.test(code)) {
    code = code.replace(/^javascript:/i, '');
    try { code = decodeURIComponent(code); } catch (_) { /* já estava em texto puro */ }
  }
  return code;
}

// Roda o código no mundo MAIN da página (acesso às variáveis da própria página).
async function runBookmarklet(tabId, raw) {
  const code = normalizeBookmarklet(raw);
  if (!code) return { ok: false, error: 'Bookmarklet vazio.' };
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [code],
    func: (src) => {
      // 1) tag <script> (funciona em páginas sem CSP estrito)
      try {
        window.__radialRan = false;
        const s = document.createElement('script');
        s.textContent = 'window.__radialRan=true;\n' + src;
        (document.head || document.documentElement).appendChild(s);
        s.remove();
        if (window.__radialRan) { delete window.__radialRan; return { ok: true }; }
      } catch (_) { /* tenta o fallback */ }
      // 2) eval indireto
      try {
        (0, eval)(src);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'Bloqueado pela página (CSP) ou erro: ' + (e && e.message ? e.message : e) };
      }
    }
  });
  return (res && res.result) || { ok: false, error: 'Sem resposta da página.' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'run-bookmarklet' && sender.tab) {
    runBookmarklet(sender.tab.id, msg.code)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true; // resposta assíncrona
  }
});
