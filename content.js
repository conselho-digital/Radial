// Content script: monta o menu radial no cursor e executa as ações.
(() => {
  if (window.__radialLoaded) return; // evita carregar duas vezes (injeção sob demanda)
  window.__radialLoaded = true;

  const SIZE = 380;          // diâmetro do menu (px)
  const R_OUT = 180;         // raio externo
  const R_IN = 60;           // raio do buraco central
  const MAX_ITEMS = 10;      // máximo de fatias por anel
  const IS_MAC = /Mac/i.test(navigator.platform);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- Posição do cursor ----------
  // O atalho de teclado não traz coordenadas, então guardamos a última posição.
  const mouse = { x: null, y: null };
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; },
    { capture: true, passive: true });

  // ---------- Ícones (24x24, traço) ----------
  const ICONS = {
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
    top: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    paste: '<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>',
    sigma: '<path d="M18 5H6l6 7-6 7h12"/>',
    rowPlus: '<rect x="3" y="4" width="18" height="6" rx="1"/><path d="M12 14v6M9 17h6"/>',
    colPlus: '<rect x="4" y="3" width="6" height="18" rx="1"/><path d="M17 9v6M14 12h6"/>',
    dollar: '<path d="M12 2v20"/><path d="M17 6.5C16 5 14.3 4.5 12 4.5c-3 0-5 1.3-5 3.5s2 3 5 3.5 5 1.3 5 3.5-2 3.5-5 3.5c-2.5 0-4.3-.6-5.5-2"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
    comment: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/>',
    bold: '<path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z"/>',
    italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
    micOff: '<path d="M3 3l18 18"/><path d="M9 9v2a3 3 0 0 0 5 2.2M15 9.3V6a3 3 0 0 0-5.9-.8"/><path d="M5 11a7 7 0 0 0 11.5 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/>',
    leave: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>'
  };

  // ---------- Contexto do site ----------
  const CONTEXT_NAMES = { general: 'Geral', sheets: 'Planilhas', docs: 'Docs', teams: 'Teams' };

  function detectContext() {
    const url = window.location.href;
    if (/^https:\/\/docs\.google\.com\/spreadsheets\//.test(url)) return 'sheets';
    if (/^https:\/\/docs\.google\.com\/document\//.test(url)) return 'docs';
    if (/^https:\/\/([\w-]+\.)*(teams\.microsoft\.com|teams\.live\.com|teams\.cloud\.microsoft)\//.test(url)) return 'teams';
    return 'general';
  }

  // ---------- Utilidades ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function toast(text, isError) {
    const el = document.createElement('div');
    el.className = 'rdl-toast' + (isError ? ' rdl-toast-error' : '');
    el.textContent = text;
    document.documentElement.appendChild(el);
    setTimeout(() => el.classList.add('rdl-toast-out'), 2200);
    setTimeout(() => el.remove(), 2600);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  // Alvo de teclado: Docs/Sheets recebem teclas num iframe invisível.
  function keyTarget() {
    const f = document.querySelector('iframe.docs-texteventtarget-iframe');
    const d = f && f.contentDocument;
    if (d) return d.activeElement || d.body;
    return document.activeElement || document.body;
  }

  // Dispara um atalho: pressKeys('b', { ctrl: true }). Ctrl vira Cmd no Mac.
  function pressKeys(key, mods = {}) {
    const t = keyTarget();
    if (t.focus) t.focus();
    const upper = key.length === 1 ? key.toUpperCase() : key;
    const keyCode = key.length === 1 ? upper.charCodeAt(0) : ({ Enter: 13, Escape: 27 }[key] || 0);
    const init = {
      key, code: /^[a-z]$/i.test(key) ? 'Key' + upper : (/^\d$/.test(key) ? 'Digit' + key : key),
      keyCode, which: keyCode,
      ctrlKey: !!mods.ctrl && !IS_MAC, metaKey: !!mods.ctrl && IS_MAC,
      shiftKey: !!mods.shift, altKey: !!mods.alt,
      bubbles: true, cancelable: true, composed: true
    };
    ['keydown', 'keyup'].forEach((type) => t.dispatchEvent(new KeyboardEvent(type, init)));
  }

  function clickLike(el) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, button: 0,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach((t) => el.dispatchEvent(new MouseEvent(t, o)));
  }

  // Clica no primeiro seletor que existir. Retorna true se achou.
  function clickSel(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) { clickLike(el); return true; }
    }
    return false;
  }

  // Procura item de menu visível pelo texto (pt/en), com limite de palavra.
  function findMenuItem(labels) {
    const res = labels.map((l) => new RegExp('(^|\\s)' + l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|\\s)', 'i'));
    const items = document.querySelectorAll('.goog-menuitem:not(.goog-menuitem-disabled), [role="menuitem"]');
    return [...items].find((el) => el.offsetParent !== null &&
      res.some((re) => re.test((el.textContent || '').trim())));
  }

  // Abre um menu do Docs/Sheets (ex.: #docs-insert-menu) e escolhe um item,
  // entrando em submenus se preciso.
  async function chooseMenu(menuId, targets, submenus = []) {
    const menu = document.getElementById(menuId);
    if (!menu) return toast('Menu não encontrado.', true);
    clickLike(menu);
    await sleep(220);
    let item = findMenuItem(targets);
    for (const sub of submenus) {
      if (item) break;
      const s = findMenuItem([sub]);
      if (s) { clickLike(s); await sleep(260); item = findMenuItem(targets); }
    }
    if (item) clickLike(item);
    else toast('Item de menu não encontrado.', true);
  }

  function toggleDarkMode() {
    const id = 'rdl-dark-style';
    const old = document.getElementById(id);
    if (old) { old.remove(); return; }
    const st = document.createElement('style');
    st.id = id;
    st.textContent = 'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}' +
      'img,video,picture,canvas,svg image,iframe,.rdl-backdrop,.rdl-toast{filter:invert(1) hue-rotate(180deg)!important}';
    document.documentElement.appendChild(st);
  }

  // ---------- Ações nativas por contexto ----------
  const general = [
    { id: 'reload', label: 'Recarregar', icon: 'refresh', run: () => location.reload() },
    { id: 'copy-url', label: 'Copiar URL', icon: 'link', run: async () => { await copyText(location.href); toast('URL copiada'); } },
    { id: 'top', label: 'Topo', icon: 'top', run: () => window.scrollTo({ top: 0, behavior: 'smooth' }) },
    { id: 'dark', label: 'Modo escuro', icon: 'moon', run: toggleDarkMode }
  ];

  const NATIVE = {
    general,
    sheets: [
      { id: 's-copy', label: 'Copiar valor', icon: 'copy', run: () => pressKeys('c', { ctrl: true }) },
      { id: 's-paste', label: 'Colar valor', icon: 'paste', run: () => pressKeys('v', { ctrl: true, shift: true }) },
      { id: 's-sum', label: 'AutoSoma', icon: 'sigma', run: () => chooseMenu('docs-insert-menu', ['sum', 'soma'], ['function', 'função', 'funcao']) },
      { id: 's-row', label: 'Inserir linha', icon: 'rowPlus', run: () => chooseMenu('docs-insert-menu', ['row above', 'linha acima', 'rows above', 'linhas acima'], ['rows', 'linhas']) },
      { id: 's-col', label: 'Inserir coluna', icon: 'colPlus', run: () => chooseMenu('docs-insert-menu', ['column left', 'coluna à esquerda', 'coluna a esquerda', 'columns left'], ['columns', 'colunas']) },
      { id: 's-money', label: 'Moeda', icon: 'dollar', run: () => pressKeys('4', { ctrl: true, shift: true }) }
    ],
    docs: [
      { id: 'd-table', label: 'Inserir tabela', icon: 'table', run: () => chooseMenu('docs-insert-menu', ['table', 'tabela']) },
      { id: 'd-comment', label: 'Comentário', icon: 'comment', run: () => pressKeys('m', { ctrl: true, alt: true }) },
      { id: 'd-bold', label: 'Negrito', icon: 'bold', run: () => pressKeys('b', { ctrl: true }) },
      { id: 'd-italic', label: 'Itálico', icon: 'italic', run: () => pressKeys('i', { ctrl: true }) }
    ],
    teams: [
      { id: 't-mic', label: 'Mudo', icon: 'micOff', run: () => {
        if (!clickSel(['#microphone-button', '[data-tid="toggle-mute"]', 'button[aria-label*="mic" i]', 'button[aria-label*="mute" i]']))
          pressKeys('m', { ctrl: true, shift: true });
      } },
      { id: 't-cam', label: 'Câmera', icon: 'video', run: () => {
        if (!clickSel(['#video-button', '[data-tid="toggle-video"]', 'button[aria-label*="camera" i]', 'button[aria-label*="câmera" i]']))
          pressKeys('o', { ctrl: true, shift: true });
      } },
      { id: 't-leave', label: 'Sair', icon: 'leave', run: () => {
        if (!clickSel(['#hangup-button', '[data-tid="hangup-main-btn"]', 'button[aria-label*="leave" i]', 'button[aria-label*="sair" i]']))
          pressKeys('h', { ctrl: true, shift: true });
      } }
    ]
  };

  // ---------- Bookmarklets ----------
  // Guardados em chrome.storage.sync como bm_<1..64> = { name, code, ctx: [...] }
  async function loadBookmarklets(ctx) {
    try {
      const all = await chrome.storage.sync.get(null);
      return Object.keys(all)
        .filter((k) => /^bm_\d+$/.test(k))
        .map((k) => ({ index: Number(k.slice(3)), ...all[k] }))
        .filter((b) => b.code && Array.isArray(b.ctx) && b.ctx.includes(ctx))
        .sort((a, b) => a.index - b.index)
        .map((b) => ({
          id: 'bm-' + b.index, label: b.name || ('Bookmarklet ' + b.index), icon: 'code',
          run: async () => {
            const res = await chrome.runtime.sendMessage({ type: 'run-bookmarklet', code: b.code });
            if (!res || !res.ok) toast((res && res.error) || 'Falha ao executar.', true);
          }
        }));
    } catch (_) {
      return [];
    }
  }

  // ---------- Renderização do anel ----------
  let root = null;

  function el(name, attrs = {}, html) {
    const e = document.createElementNS(SVG_NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }

  // Caminho de uma fatia anular entre os ângulos a0 e a1 (radianos).
  function wedgePath(cx, cy, r0, r1, a0, a1) {
    const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${x0} ${y0}A${r1} ${r1} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${large} 0 ${x3} ${y3}Z`;
  }

  // Quebra o rótulo em até 2 linhas.
  function wrapLabel(text) {
    const t = text.length > 20 ? text.slice(0, 19) + '…' : text;
    const words = t.split(' ');
    if (words.length === 1 || t.length <= 9) return [t];
    let best = 1, diff = Infinity;
    for (let i = 1; i < words.length; i++) {
      const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
      if (d < diff) { diff = d; best = i; }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }

  function close() {
    if (!root) return;
    const r = root;
    root = null;
    document.removeEventListener('keydown', onKey, true);
    r.classList.add('rdl-closing');
    setTimeout(() => r.remove(), 120);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }

  function buildRing(items, centerLabel, canSwap, onSwap) {
    const c = SIZE / 2;
    const n = items.length;
    const svg = el('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, width: SIZE, height: SIZE, class: 'rdl-svg' });

    items.forEach((item, i) => {
      const theta = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const half = Math.PI / n;
      const g = el('g', { class: 'rdl-seg', 'data-id': item.id });
      g.appendChild(el('path', { d: wedgePath(c, c, R_IN, R_OUT, theta - half, theta + half) }));

      const mid = (R_IN + R_OUT) / 2 + 4;
      const lx = c + mid * Math.cos(theta), ly = c + mid * Math.sin(theta);
      const lines = wrapLabel(item.label);
      const lg = el('g', { transform: `translate(${lx} ${ly})`, class: 'rdl-label' });
      lg.appendChild(el('g', { class: 'rdl-icon', transform: 'translate(-9 -26) scale(.75)' }, ICONS[item.icon] || ICONS.code));
      const text = el('text', { 'text-anchor': 'middle' });
      lines.forEach((ln, k) => {
        const ts = el('tspan', { x: 0, y: 6 + k * 13 });
        ts.textContent = ln;
        text.appendChild(ts);
      });
      lg.appendChild(text);
      g.appendChild(lg);

      g.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
        try {
          const r = item.run();
          if (r && r.catch) r.catch((err) => toast(String(err && err.message || err), true));
        } catch (err) { toast(String(err && err.message || err), true); }
      });
      svg.appendChild(g);
    });

    // Centro: mostra o anel atual e alterna Contexto <-> Geral.
    const center = el('g', { class: 'rdl-center' + (canSwap ? ' rdl-center-btn' : '') });
    center.appendChild(el('circle', { cx: c, cy: c, r: R_IN - 4 }));
    const ct = el('text', { x: c, y: c + 4, 'text-anchor': 'middle' });
    ct.textContent = centerLabel;
    center.appendChild(ct);
    if (canSwap) center.addEventListener('click', (e) => { e.stopPropagation(); onSwap(); });
    svg.appendChild(center);
    return svg;
  }

  async function open() {
    if (root) { close(); return; }
    const ctx = detectContext();

    // Carrega bookmarklets do contexto e do anel "Geral".
    const [bmCtx, bmGeneral] = await Promise.all([
      loadBookmarklets(ctx),
      ctx === 'general' ? Promise.resolve([]) : loadBookmarklets('general')
    ]);
    const rings = { [ctx]: [...NATIVE[ctx], ...bmCtx].slice(0, MAX_ITEMS) };
    if (ctx !== 'general') rings.general = [...NATIVE.general, ...bmGeneral].slice(0, MAX_ITEMS);
    let current = ctx;

    // Posição: cursor (ou centro da tela), mantida dentro da janela.
    const half = SIZE / 2 + 8;
    let x = mouse.x == null ? innerWidth / 2 : mouse.x;
    let y = mouse.y == null ? innerHeight / 2 : mouse.y;
    x = Math.min(Math.max(x, half), Math.max(half, innerWidth - half));
    y = Math.min(Math.max(y, half), Math.max(half, innerHeight - half));

    root = document.createElement('div');
    root.className = 'rdl-backdrop';
    const menu = document.createElement('div');
    menu.className = 'rdl-menu';
    menu.style.left = x - SIZE / 2 + 'px';
    menu.style.top = y - SIZE / 2 + 'px';
    root.appendChild(menu);

    const render = () => {
      menu.querySelector('svg')?.remove();
      menu.appendChild(buildRing(rings[current], CONTEXT_NAMES[current], ctx !== 'general',
        () => { current = current === ctx ? 'general' : ctx; render(); }));
    };
    const disc = document.createElement('div');
    disc.className = 'rdl-disc';
    menu.appendChild(disc);
    render();

    // Não rouba o foco do editor e fecha ao clicar fora.
    root.addEventListener('mousedown', (e) => e.preventDefault());
    root.addEventListener('mouseup', (e) => { if (e.target === root) close(); });
    root.addEventListener('contextmenu', (e) => { e.preventDefault(); close(); });
    document.addEventListener('keydown', onKey, true);
    document.documentElement.appendChild(root);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'open-radial') open();
  });
})();
