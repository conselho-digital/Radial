// Content script: monta o menu radial no cursor e executa as ações.
// Os sites e suas ferramentas ficam em sites.js (dados); aqui está o motor.
(() => {
  // Evita carregar duas vezes (injeção sob demanda). Se a extensão foi recarregada, o script
  // antigo fica inválido e o novo deve assumir.
  if (window.__radialLoaded && window.__radialLoaded()) return;
  window.__radialLoaded = () => { try { return !!chrome.runtime.id; } catch (_) { return false; } };

  const I = window.RADIAL_I18N;
  const tr = (s, v) => I.t(s, v);
  const SIZE = 380;          // diâmetro do menu (px)
  const R_OUT = 180;         // raio externo
  const R_IN = 60;           // raio do buraco central
  const MAX_ITEMS = 10;      // máximo de fatias por anel (2 radiais de 5)
  const PAGE = 5;            // fatias por radial; o centro passa para o próximo grupo
  const IS_MAC = /Mac/i.test(navigator.platform);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- Posição do cursor ----------
  // O atalho de teclado não traz coordenadas, então guardamos a última posição.
  const mouse = { x: null, y: null };
  let hold = null; // temporizador do gatilho "segurar botão direito"
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    // Segurar o botão direito: mover o mouse antes do tempo cancela o gatilho.
    if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 10) { clearTimeout(hold.timer); hold = null; }
  }, { capture: true, passive: true });

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
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>',
    replyAll: '<path d="m7 17-5-5 5-5M12 17l-5-5 5-5"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
    today: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/><circle cx="12" cy="15.5" r="1.8"/>',
    hand: '<path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V3.5a1.5 1.5 0 0 1 3 0V10M14 10V5a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7c-3 0-4-1.5-6-5l-1-2a1.5 1.5 0 0 1 2.5-1.5L8 14"/>',
    screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-9 9"/>',
    bottom: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    play: '<path d="m7 4 13 8-13 8z"/>',
    playPause: '<path d="M4 5l8 7-8 7z"/><path d="M16 5v14M20 5v14"/>',
    fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    volumeOff: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/>',
    fwd: '<path d="m13 6 6 6-6 6M5 6l6 6-6 6"/>',
    back: '<path d="m11 6-6 6 6 6M19 6l-6 6 6 6"/>',
    next: '<path d="m6 5 9 7-9 7zM18 5v14"/>',
    prev: '<path d="m18 5-9 7 9 7zM6 5v14"/>',
    shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l3 12h11l2-8H6"/>',
    package: '<path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    square: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    pen: '<path d="m3 21 3.5-1 12-12a2.1 2.1 0 0 0-3-3l-12 12zM14 6l3 3"/>',
    eraser: '<path d="m7 21-4-4a2 2 0 0 1 0-3L14 3a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3L11 21zM8 11l6 6"/>',
    record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    highlight: '<path d="m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    save: '<path d="M5 3h12l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v6h8V3M7 21v-8h10v8"/>',
    filter: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
    sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    thumb: '<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 4h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 1H7"/>',
    terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
    rocket: '<path d="M12 15l-3-3a22 22 0 0 1 8-9 2 2 0 0 1 4 4 22 22 0 0 1-9 8zM9 12H4s.5-3 2-4c1.5-1 5 0 5 0M12 15v5s3-.5 4-2c1-1.5 0-5 0-5"/>',
    newChat: '<path d="M21 12a8 8 0 0 1-12 7L3 21l2-5a8 8 0 1 1 16-4z"/><path d="M12 9v6M9 12h6"/>',
    paperclip: '<path d="m21 11-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
    stats: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    translate: '<path d="M4 5h9M8 3v2M6 5c0 4 3 7 7 8M12 5c0 4-3 7-7 8M13 21l4-9 4 9M14.5 18h5"/>',
    swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
    sticky: '<path d="M4 4h16v10l-6 6H4zM14 20v-6h6"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6M11 8v6"/>',
    frame: '<path d="M6 2v20M18 2v20M2 6h20M2 18h20"/>',
    component: '<path d="m12 3 3 3-3 3-3-3zM12 15l3 3-3 3-3-3zM3 12l3-3 3 3-3 3zM15 12l3-3 3 3-3 3z"/>',
    subtitles: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 12h3M7 15h6M14 12h3"/>',
    sparkle: '<path d="m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
    slideNew: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 8v5M9.5 10.5h5M8 21h8"/>',
    move: '<path d="M5 9 2 12l3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
    columns: '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>',
    pr: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-2M15 3l-3 3 3 3"/>',
    issue: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5"/>'
  };

  // ---------- Contexto do site ----------
  // sites.js (carregado antes) expõe RADIAL_DETECT e RADIAL_SITES.
  function detectSite() {
    return window.RADIAL_DETECT(window.location);
  }

  // ---------- Utilidades ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // Toda a interface vive num Shadow DOM: o CSS da página não a altera e ela não vira alvo de clickjacking.
  function makeHost(passive) {
    const host = document.createElement('div');
    host.className = 'rdl-host';
    host.style.cssText = passive
      ? 'all:initial;position:fixed;width:0;height:0;z-index:2147483647;pointer-events:none;'
      : 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = window.RADIAL_CSS;
    shadow.appendChild(style);
    return { host, shadow };
  }

  function toast(text, isError) {
    const { host, shadow } = makeHost(true);
    const el = document.createElement('div');
    el.className = 'rdl-toast' + (isError ? ' rdl-toast-error' : '');
    el.textContent = text;
    shadow.appendChild(el);
    document.documentElement.appendChild(host);
    setTimeout(() => el.classList.add('rdl-toast-out'), 2200);
    setTimeout(() => host.remove(), 2600);
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

  const visible = (el) => !!(el && (el.offsetParent !== null || el.getClientRects().length));

  // Alvo de teclado: Docs/Sheets/Slides recebem teclas num iframe invisível.
  function keyTarget(to) {
    if (to === 'docs') {
      const f = document.querySelector('iframe.docs-texteventtarget-iframe');
      const d = f && f.contentDocument;
      if (d) return d.activeElement || d.body;
    }
    return document.activeElement || document.body;
  }

  // keyCode/code das teclas que não são letra ou dígito.
  const KEYS = {
    Enter: [13, 'Enter'], Escape: [27, 'Escape'], Delete: [46, 'Delete'], Backspace: [8, 'Backspace'],
    Tab: [9, 'Tab'], ' ': [32, 'Space'], ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'],
    ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'], F2: [113, 'F2'], F5: [116, 'F5'],
    '/': [191, 'Slash'], '.': [190, 'Period'], '+': [187, 'Equal'], '=': [187, 'Equal']
  };

  // Dispara keydown/keypress/keyup no alvo de teclado.
  function fireKey(init, to) {
    const t = keyTarget(to);
    if (t.focus) t.focus();
    ['keydown', 'keypress', 'keyup'].forEach((type) => {
      if (type === 'keypress' && init.key.length !== 1) return;
      t.dispatchEvent(new KeyboardEvent(type, init));
    });
    return true;
  }

  // Dispara um atalho. Ctrl vira Cmd no Mac.
  function pressKeys(key, mods = {}, to) {
    let keyCode, code;
    if (KEYS[key]) [keyCode, code] = KEYS[key];
    else if (/^[a-z]$/i.test(key)) { keyCode = key.toUpperCase().charCodeAt(0); code = 'Key' + key.toUpperCase(); }
    else if (/^\d$/.test(key)) { keyCode = key.charCodeAt(0); code = 'Digit' + key; }
    else { keyCode = 0; code = key; }
    const SHIFTED = { 0: ')', 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(' };
    const shown = mods.s && key.length === 1 ? (/^[a-z]$/.test(key) ? key.toUpperCase() : (SHIFTED[key] || key)) : key;
    return fireKey({
      key: shown, code, keyCode, which: keyCode,
      ctrlKey: !!mods.c && !IS_MAC, metaKey: !!mods.c && IS_MAC,
      shiftKey: !!mods.s, altKey: !!mods.a,
      bubbles: true, cancelable: true, composed: true
    }, to);
  }

  // Atalhos gravados pelo usuário: repete exatamente as teclas e modificadores gravados, em sequência.
  async function runKeys(combos) {
    const to = location.hostname === 'docs.google.com' ? 'docs' : undefined;
    for (const c of combos) {
      fireKey({
        key: String(c.key), code: String(c.code), keyCode: c.keyCode | 0, which: c.keyCode | 0,
        ctrlKey: !!c.ctrl, shiftKey: !!c.shift, altKey: !!c.alt, metaKey: !!c.meta,
        bubbles: true, cancelable: true, composed: true
      }, to);
      await sleep(80);
    }
    return true;
  }

  function mouseSeq(el, types) {
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, button: 0,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    types.forEach((t) => el.dispatchEvent(new MouseEvent(t, o)));
  }

  function clickLike(el) {
    if (el instanceof HTMLInputElement && el.type === 'file') { el.click(); return; } // abre o seletor de arquivo
    mouseSeq(el, ['mouseover', 'mousedown', 'mouseup', 'click']);
  }

  // ---------- Busca de elementos ----------
  const INTERACTIVE = 'button,a,[role="button"],[role="menuitem"],[role="tab"],[role="option"],[role="link"],' +
    '[aria-label],[title],[data-tooltip],input[type="button"],input[type="submit"],.goog-menuitem';
  const GENERIC = 'div,span,li,p,label';

  function labelsOf(el) {
    return [el.getAttribute('aria-label'), el.getAttribute('title'), el.getAttribute('data-tooltip'),
      (el.textContent || '').length <= 60 ? el.textContent : ''].map(norm).filter(Boolean);
  }

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // "exato" | "começa com" | "contém", sempre por palavra inteira ("star" não casa com "Starred").
  function labelMatches(label, want, mode) {
    if (mode === 'eq') return label === want;
    if (label.length > want.length + 30) return false; // texto longo demais não é um botão
    const re = new RegExp((mode === 'start' ? '^' : '(?:^|[^\\p{L}\\p{N}])') + escRe(want) + '(?![\\p{L}\\p{N}])', 'u');
    return re.test(label);
  }

  // Acha elementos pelo texto (pt/en): exato > começa com > contém.
  function findAllByText(labels) {
    const want = labels.map(norm);
    const pool = [...document.querySelectorAll(INTERACTIVE)].filter(visible);
    for (const mode of ['eq', 'start', 'has']) {
      for (const w of want) {
        const hits = pool.filter((el) => labelsOf(el).some((l) => labelMatches(l, w, mode)));
        if (hits.length) return hits;
      }
    }
    // último recurso: elementos genéricos com texto exato (menus desenhados em <div>)
    const generic = [...document.querySelectorAll(GENERIC)].filter((el) => visible(el) && el.children.length <= 1);
    for (const w of want) {
      const hits = generic.filter((el) => norm(el.textContent) === w);
      if (hits.length) return hits;
    }
    return [];
  }

  // Seletores CSS: prefere elementos visíveis (o seletor de arquivo é escondido de propósito).
  function findAllBySel(selectors) {
    for (const s of selectors) {
      let list = [];
      try { list = [...document.querySelectorAll(s)]; } catch (_) { /* seletor inválido */ }
      const vis = list.filter(visible);
      if (vis.length) return vis;
      if (list.length && /type=["']?file/.test(s)) return list;
    }
    return [];
  }

  // Menus do Docs/Sheets/Slides (.goog-menuitem), com limite de palavra. O texto do item pode vir colado a
  // setas de submenu ("Columns▸") ou a atalhos ("Sheet⇧F11"), então o limite é "letra/dígito", não espaço.
  function findMenuItem(labels) {
    const res = labels.map((l) => new RegExp('(?:^|[^\\p{L}\\p{N}])' + escRe(l) + '(?![\\p{L}\\p{N}])', 'iu'));
    const ownText = (n) => [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join(' ').trim();
    // Cada pedaço de texto do item é testado em separado: ícones por ligadura ("arrow_right") ficam em
    // outros elementos e não atrapalham; o texto inteiro do item é o plano B.
    const hit = (el) => [el, ...el.querySelectorAll('*')].some((n) => { const t = ownText(n); return t && res.some((re) => re.test(t)); }) ||
      res.some((re) => re.test((el.textContent || '').trim()));
    const items = document.querySelectorAll('.goog-menuitem:not(.goog-menuitem-disabled), [role="menuitem"]');
    return [...items].find((el) => visible(el) && hit(el));
  }

  async function chooseMenu(menuId, targets, submenus = []) {
    const menu = document.getElementById(menuId);
    if (!menu) return false;
    clickLike(menu);
    await sleep(220);
    let item = findMenuItem(targets);
    for (const sub of submenus) {
      if (item) break;
      const s = findMenuItem([sub]);
      if (s) { clickLike(s); await sleep(260); item = findMenuItem(targets); }
    }
    if (!item) return false;
    clickLike(item);
    return true;
  }

  // ---------- Mídia ----------
  function mainMedia() {
    const list = [...document.querySelectorAll('video,audio')];
    const area = (m) => m.clientWidth * m.clientHeight;
    return list.sort((a, b) => area(b) - area(a))[0] || null;
  }

  async function doMedia(step) {
    const m = mainMedia();
    if (!m) return false;
    if (step.media === 'play') { if (m.paused) await m.play(); else m.pause(); return true; }
    if (step.media === 'mute') { m.muted = !m.muted; return true; }
    if (step.media === 'seek') { m.currentTime = Math.max(0, m.currentTime + step.n); return true; }
    if (step.media === 'full') {
      if (document.fullscreenElement) { await document.exitFullscreen(); return true; }
      const box = m.closest('.html5-video-player,[data-uia="player"],[data-a-target="player-overlay-click-handler"],.video-player') || m.parentElement || m;
      await box.requestFullscreen();
      return true;
    }
    return false;
  }

  // Rola até o topo/fim. Apps como o Dynamics rolam dentro de um contêiner, não na janela: sobe a partir do
  // elemento sob o cursor até achar um que role; se não houver, rola a janela.
  function scrollEdge(toBottom) {
    const canScroll = (el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY);
    // Ponto onde o radial abriu (o menu cobre a tela: ignora o próprio menu ao procurar o elemento).
    const px = openedAt.x ?? mouse.x, py = openedAt.y ?? mouse.y;
    let el = px == null ? null : document.elementsFromPoint(px, py).find((e) => !e.classList.contains('rdl-host')) || null;
    while (el && el !== document.body && el !== document.documentElement && !canScroll(el)) el = el.parentElement;
    const doc = document.scrollingElement || document.documentElement;
    const target = el && el !== document.body && el !== document.documentElement ? el : doc;
    target.scrollTo({ top: toBottom ? target.scrollHeight : 0, behavior: 'smooth' });
  }

  function toggleDarkMode() {
    const id = 'rdl-dark-style';
    const old = document.getElementById(id);
    if (old) { old.remove(); return; }
    const st = document.createElement('style');
    st.id = id;
    st.textContent = 'html{filter:invert(1) hue-rotate(180deg)!important;background:#fff}' +
      'img,video,picture,canvas,svg image,iframe,.rdl-host{filter:invert(1) hue-rotate(180deg)!important}';
    document.documentElement.appendChild(st);
  }

  // ---------- Tokens de URL ----------
  const RESERVED = new Set(['settings', 'orgs', 'marketplace', 'explore', 'notifications', 'pulls', 'issues', 'topics',
    'trending', 'sponsors', 'apps', 'features', 'login', 'new', 'codespaces', 'organizations', 'users', 'about',
    'pricing', 'security', 'enterprise', 'dashboard', 'account', 'teams', 'integrations', 'docs', 'templates', 'help',
    'stars', 'search', 'collections', 'events', 'copilot', 'blog', 'projects', 'groups', 'changelog', 'guides', 'kb',
    'abuse', 'admin', 'sessions', 'logout', 'signup', 'customers', 'solutions', 'resources']);

  function tokenValues() {
    const seg = location.pathname.split('/').filter(Boolean);
    const ok = seg.length >= 2 && !RESERVED.has(seg[0].toLowerCase());
    const login = document.querySelector('meta[name="user-login"]');
    let proj = null;
    if (location.pathname.includes('/-/')) proj = location.pathname.split('/-/')[0];
    else if (ok) proj = '/' + seg[0] + '/' + seg[1];
    return { owner: ok ? seg[0] : null, repo: ok ? seg[1] : null, login: login && login.content || null, proj };
  }

  // Troca {owner} {repo} {login} {proj}; devolve null se faltar algum.
  function expand(tpl) {
    const t = tokenValues();
    let missing = false;
    const out = tpl.replace(/\{(owner|repo|login|proj)\}/g, (_, k) => { if (!t[k]) missing = true; return t[k] || ''; });
    return missing ? null : out;
  }

  // ---------- Interpretador de passos ----------
  const DEFAULT_SEARCH = ['input[type="search"]', 'input[name="q"]', '[role="searchbox"]', 'input[aria-label*="earch" i]',
    'input[placeholder*="earch" i]', 'input[aria-label*="esquis" i]', 'input[placeholder*="esquis" i]'];

  async function runStep(step) {
    if (!step) return false;

    if (step.seq) {
      for (const s of step.seq) {
        if (!(await runStep(s))) return false;
        if (!s.wait) await sleep(120);
      }
      return true;
    }
    if (step.any) {
      for (const s of step.any) if (await runStep(s)) return true;
      return false;
    }
    if (step.wait) { await sleep(step.wait); return true; }

    if (step.url) {
      let u = expand(step.url);
      if (!u && step.fb) u = expand(step.fb);
      if (!u) return false;
      window.location.assign(u.startsWith('/') ? location.origin + u : u);
      return true;
    }
    if (step.k !== undefined) return pressKeys(step.k, step, step.to);

    if (step.click) {
      let hits = step.click.length ? findAllBySel(step.click) : [];
      if (!hits.length && step.text && step.text.length) hits = findAllByText(step.text);
      const el = step.last ? hits[hits.length - 1] : hits[0];
      if (!el) return false;
      clickLike(el);
      return true;
    }
    if (step.focus) {
      const el = findAllBySel(step.focus).find(visible);
      if (!el) return false;
      el.focus();
      return true;
    }
    if (step.search) {
      const el = findAllBySel([...(step.sel || []), ...DEFAULT_SEARCH]).find(visible);
      if (el) { el.focus(); return true; }
      return pressKeys('/'); // muitos sites abrem a busca com "/"
    }
    if (step.media) return doMedia(step);
    if (step.menu) return chooseMenu(step.menu, step.t, step.sub);
    if (step.pick) {
      const item = findMenuItem(step.pick);
      if (!item) return false;
      clickLike(item);
      return true;
    }
    if (step.type) { return document.execCommand('insertText', false, step.type); }
    if (step.ctx) {
      const el = findAllBySel(step.ctx).find(visible);
      if (!el) return false;
      mouseSeq(el, ['contextmenu']);
      return true;
    }
    if (step.copy) {
      const text = expand(step.copy);
      if (!text) return false;
      await copyText(text);
      toast(tr('Copied'));
      return true;
    }
    if (step.fn === 'reload') { location.reload(); return true; }
    if (step.fn === 'copyUrl') { await copyText(location.href); toast(tr('URL copied')); return true; }
    if (step.fn === 'top') { scrollEdge(false); return true; }
    if (step.fn === 'bottom') { scrollEdge(true); return true; }
    if (step.fn === 'dark') { toggleDarkMode(); return true; }
    return false;
  }

  // ---------- Opções do usuário ----------
  // Guardadas em chrome.storage.local como opt_<id> (veja store.js). Aqui só ficam os metadados:
  // o código JavaScript é lido pelo background na hora de executar.
  const hostKey = () => location.hostname.toLowerCase().replace(/^www\./, '');

  let orders = {};  // ordem escolhida pelo usuário, por anel (veja store.js)
  let hides = {};   // opções padrão escondidas pelo usuário, por anel

  async function loadOptions() {
    try {
      const all = await chrome.storage.local.get(null);
      orders = {};
      hides = {};
      Object.keys(all).filter((k) => k.startsWith('hide_')).forEach((k) => { hides[k.slice(5)] = all[k]; });
      Object.keys(all).filter((k) => k.startsWith('order_')).forEach((k) => { orders[k.slice(6)] = all[k]; });
      return Object.keys(all)
        .filter((k) => k.startsWith('opt_') && Array.isArray(all[k].ctx))
        .map((k) => ({ id: k.slice(4), type: all[k].type, name: all[k].name, ctx: all[k].ctx, keys: all[k].keys, ref: all[k].ref, hasCode: !!all[k].code, t: all[k].t || 0 }))
        .filter((o) => (o.type === 'keys' && Array.isArray(o.keys) && o.keys.length) || (o.type === 'js' && o.hasCode) ||
          (o.type === 'action' && o.ref && findAction(o.ref)))
        .sort((a, b) => a.t - b.t);
    } catch (_) {
      return [];
    }
  }

  // Ação pronta do registro (sites.js), guardada como { site, label }.
  function findAction(ref) {
    const site = window.RADIAL_SITES.find((s) => s.id === ref.site);
    return site && site.actions.find((a) => a.label === ref.label);
  }

  function optionItem(o) {
    const act = o.type === 'action' ? findAction(o.ref) : null;
    return {
      key: 'o:' + o.id, id: 'opt-' + o.id, label: (act ? I.label(act.label) : o.name) || tr('Option'), icon: act ? act.icon : o.type === 'keys' ? 'keyboard' : 'code',
      run: async () => {
        if (act) { if (!(await runStep(act.do))) toast(tr('Could not find "{name}" on this page.', { name: I.label(act.label) }), true); return; }
        if (o.type === 'keys') { await runKeys(o.keys); return; }
        const res = await chrome.runtime.sendMessage({ type: 'run-option', id: o.id });
        if (!res || !res.ok) toast((res && res.error) || tr('Failed to run.'), true);
      }
    };
  }

  // Transforma as ações do registro em itens do anel.
  function siteItems(site) {
    return site.actions.filter((a) => !a.opt).map((a, i) => ({
      key: 'b:' + site.id + ':' + a.label, id: site.id + '-' + i, label: I.label(a.label), icon: a.icon,
      run: async () => {
        const ok = await runStep(a.do);
        if (!ok) toast(tr('Could not find "{name}" on this page.', { name: I.label(a.label) }), true);
      }
    }));
  }

  // ---------- Renderização do anel ----------
  let root = null;      // fundo do menu (dentro do Shadow DOM)
  let rootHost = null;  // elemento hospedeiro na página
  let opening = false;  // trava síncrona: evita abrir dois menus ao mesmo tempo
  const segRun = new WeakMap(); // fatia -> ação (assim o clique não depende de eventos falsificáveis)
  let openedBtn = null;     // botão do mouse que abriu o menu e ainda está pressionado: soltar escolhe a fatia
  let previewOpen = false;  // aberto pelo popup da extensão (pré-visualização)
  let openedAt = { x: null, y: null }; // onde o menu abriu
  let centerSwap = null;    // passa para o próximo grupo (soltar o botão sobre o centro faz o mesmo)
  let armed = null;         // última fatia sob o mouse (só com "manter última opção" ligado)

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
  // Quebra o rótulo em linhas de até maxChars letras (palavra maior que isso fica inteira).
  function wrapLabel(text, maxChars) {
    const t = text.length > 40 ? text.slice(0, 39) + '…' : text;
    const lines = [];
    let cur = '';
    t.split(' ').forEach((w) => {
      if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  // Tamanho do conteúdo (ícone + texto) de uma fatia: usa o fator escolhido (padrão 2×) e só encolhe
  // se o texto não couber na fatia.
  function fitContent(label, n) {
    const scale = Math.min(3, Math.max(1, Number(settings.contentScale) || 1.5));
    const mid = (R_IN + R_OUT) / 2 + 4;
    const chord = n > 1 ? 2 * mid * Math.sin(Math.PI / n) * 0.9 : 2 * R_OUT * 0.8;
    const availH = (R_OUT - R_IN) - 12;
    let fs = 11.5 * scale, s = scale;
    for (let i = 0; i < 24; i++) {
      const maxChars = Math.max(4, Math.floor(chord / (fs * 0.56)));
      const lines = wrapLabel(label, maxChars);
      const iconPx = 24 * 0.75 * s, lineH = fs * 1.15, gap = 4 * s;
      const w = Math.max(...lines.map((l) => l.length)) * fs * 0.56;
      const h = iconPx + gap + lines.length * lineH;
      if ((w <= chord && h <= availH && lines.length <= 3) || fs <= 11.5) return { fs, s, lines, iconPx, lineH, gap, h };
      fs = Math.max(11.5, fs * 0.93);
      s = Math.max(1, s * 0.93);
    }
    return { fs: 11.5, s: 1, lines: wrapLabel(label, 12), iconPx: 18, lineH: 13, gap: 4, h: 18 + 4 + 13 };
  }

  function close() {
    if (!root) return;
    const r = root, h = rootHost;
    root = null;
    rootHost = null;
    openedBtn = null;
    previewOpen = false;
    armed = null;
    document.removeEventListener('keydown', onKey, true);
    r.classList.add('rdl-closing');
    setTimeout(() => h.remove(), 120);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }

  function buildRing(items, centerLabel, canSwap, onSwap) {
    const c = SIZE / 2;
    const n = items.length;
    armed = null;
    const svg = el('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, width: SIZE, height: SIZE, class: 'rdl-svg' });

    items.forEach((item, i) => {
      const theta = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const half = Math.PI / n;
      const g = el('g', { class: 'rdl-seg', 'data-id': item.id });
      g.appendChild(el('path', { d: wedgePath(c, c, R_IN, R_OUT, theta - half, theta + half) }));

      const mid = (R_IN + R_OUT) / 2 + 4;
      const lx = c + mid * Math.cos(theta), ly = c + mid * Math.sin(theta);
      const fit = fitContent(item.label, n);
      const top = -fit.h / 2;
      const lg = el('g', { transform: `translate(${lx} ${ly})`, class: 'rdl-label' });
      lg.appendChild(el('g', { class: 'rdl-icon', transform: `translate(${-fit.iconPx / 2} ${top}) scale(${0.75 * fit.s})`, style: `stroke-width:${(2 / (0.75 * fit.s)).toFixed(2)}px` }, ICONS[item.icon] || ICONS.code));
      const text = el('text', { 'text-anchor': 'middle', style: `font-size:${fit.fs}px` });
      fit.lines.forEach((ln, k) => {
        const ts = el('tspan', { x: 0, y: top + fit.iconPx + fit.gap + fit.fs * 0.85 + k * fit.lineH });
        ts.textContent = ln;
        text.appendChild(ts);
      });
      lg.appendChild(text);
      g.appendChild(lg);

      const activate = () => {
        close();
        try {
          const r = item.run();
          if (r && r.catch) r.catch((err) => toast(String(err && err.message || err), true));
        } catch (err) { toast(String(err && err.message || err), true); }
      };
      segRun.set(g, activate);
      g.addEventListener('mouseenter', () => {
        if (!settings.sticky) return;
        if (armed) armed.classList.remove('rdl-armed');
        armed = g;
        g.classList.add('rdl-armed');
      });
      g.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!e.isTrusted) return; // ignora cliques fabricados pela página
        activate();
      });
      svg.appendChild(g);
    });

    // Centro: mostra o anel atual e alterna Site <-> Geral.
    const center = el('g', { class: 'rdl-center' + (canSwap ? ' rdl-center-btn' : '') });
    center.appendChild(el('circle', { cx: c, cy: c, r: R_IN - 4 }));
    const lines = [].concat(centerLabel);
    lines.forEach((ln, i) => {
      const ct = el('text', { x: c, y: c + 4 + (i - (lines.length - 1) / 2) * 13, 'text-anchor': 'middle' });
      ct.textContent = ln;
      center.appendChild(ct);
    });
    centerSwap = canSwap ? onSwap : null;
    // Voltar ao centro desarma a opção (soltar ali não ativa nada).
    center.addEventListener('mouseenter', () => { if (armed) { armed.classList.remove('rdl-armed'); armed = null; } });
    if (canSwap) center.addEventListener('click', (e) => { e.stopPropagation(); if (e.isTrusted) onSwap(); });
    svg.appendChild(center);
    return svg;
  }

  async function open(opts = {}) {
    if (root) { close(); return; }
    if (opening) return;
    opening = true;
    try { await build(opts); } finally { opening = false; }
  }

  async function build(opts) {
    await I.ready;
    const site = detectSite();
    const general = window.RADIAL_SITES.find((s) => s.id === 'general');

    // Anéis: o do site (ou do domínio, se o site não está em sites.js) e o "Geral".
    const saved = await loadOptions();
    const hostRing = 'host:' + hostKey();
    const pick = (...ids) => saved.filter((o) => o.ctx.some((c) => ids.includes(c))).map(optionItem);
    const rings = {};
    const names = {};
    const visibleOf = (key, items) => items.filter((it) => !(hides[key] || []).includes(it.key));
    // Um só anel, em grupos de 5 (máximo 10): padrões do site, suas opções e, por último, os padrões do
    // Geral. Site fora da lista: os padrões do Geral fazem o papel de padrões do site.
    const ringKey = site.id === 'general' ? hostRing : site.id;
    const own = site.id === 'general' ? siteItems(general) : siteItems(site);
    const tail = site.id === 'general' ? [] : siteItems(general);
    rings.main = RADIAL_STORE.applyOrder(visibleOf(ringKey, [...own, ...pick(ringKey, hostRing, 'general'), ...tail]), orders[ringKey]);
    names.main = site.id === 'general' ? I.label(general.short) : I.label(site.short);
    // Cada anel tem até 10 opções, em grupos (radiais) de 5. O centro passa de um grupo ao próximo.
    const pages = [];
    Object.keys(rings).forEach((k) => {
      const items = rings[k].slice(0, MAX_ITEMS);
      const n = Math.ceil(items.length / PAGE);
      for (let i = 0; i < n; i++) pages.push({ items: items.slice(i * PAGE, (i + 1) * PAGE), label: n > 1 ? [names[k], (i + 1) + '/' + n] : names[k] });
    });
    let current = 0;

    // Posição: cursor (ou centro da tela), mantida dentro da janela.
    const k = Math.min(1.6, Math.max(0.7, (settings.size || SIZE) / SIZE)); // fator de escala do tamanho escolhido
    const half = (SIZE * k) / 2 + 8;
    let x = opts.x ?? (mouse.x == null ? innerWidth / 2 : mouse.x);
    let y = opts.y ?? (mouse.y == null ? innerHeight / 2 : mouse.y);
    x = Math.min(Math.max(x, half), Math.max(half, innerWidth - half));
    y = Math.min(Math.max(y, half), Math.max(half, innerHeight - half));

    const { host, shadow } = makeHost(false);
    rootHost = host;
    root = document.createElement('div');
    root.className = 'rdl-backdrop';
    shadow.appendChild(root);
    openedBtn = opts.viaBtn != null && btnDown === opts.viaBtn ? opts.viaBtn : null;
    // O menu fica dentro de uma caixa escalada: a geometria interna continua em 380px.
    const box = document.createElement('div');
    box.style.cssText = `all:initial;position:fixed;width:${SIZE}px;height:${SIZE}px;left:${x - SIZE / 2}px;top:${y - SIZE / 2}px;transform:scale(${k});transform-origin:center`;
    const menu = document.createElement('div');
    menu.className = 'rdl-menu';
    openedAt = { x, y };
    previewOpen = !!opts.preview;
    menu.style.left = '0px';
    menu.style.top = '0px';
    box.appendChild(menu);
    root.appendChild(box);

    const render = () => {
      menu.querySelector('svg')?.remove();
      menu.appendChild(buildRing(pages[current].items, pages[current].label, pages.length > 1,
        () => { current = (current + 1) % pages.length; render(); }));
    };
    const disc = document.createElement('div');
    disc.className = 'rdl-disc';
    menu.appendChild(disc);
    render();

    // Não rouba o foco do editor e fecha ao clicar fora.
    root.addEventListener('mousedown', (e) => e.preventDefault());
    root.addEventListener('mouseup', (e) => { if (e.button === 0 && e.target === root) close(); });
    root.addEventListener('contextmenu', (e) => e.preventDefault()); // o botão direito não cancela: só o botão de cancelar escolhido
    document.addEventListener('keydown', onKey, true);
    document.documentElement.appendChild(host);
  }


  // ---------- Status automático (Dynamics): Disponível por fora, Não perturbe por dentro ----------
  // Nos sites configurados, o botão de presença nunca fica realmente em "Available": a extensão muda o
  // status de verdade para "Do not disturb" (sem ligações) e mantém a aparência de "Available" na tela.
  // Escolher "Available" no menu faz o mesmo; escolher qualquer outro status desliga o disfarce.
  const AVAIL_RE = /^(available|dispon[ií]vel|disponible|disponibile|verf[uü]gbar|متاح|উপলব্ধ)$/i;
  const DND_RE = /^(do not disturb|n[aã]o perturbe|n[aã]o incomodar|ne pas d[ée]ranger|non disturbare|nicht st[oö]ren|no molestar|عدم الإزعاج|বিরক্ত করবেন না)$/i;
  const REAL_FLAG = 'radial_real_available'; // o usuário pediu o Available de verdade (Shift): a extensão não desfaz
  const FAKE_CHECK = '<circle cx="8" cy="8" r="8" fill="#13A10E"></circle><path d="M10.666 5.13379C10.8027 5.13379 10.9297 5.15983 11.0469 5.21191C11.1673 5.26074 11.2715 5.3291 11.3594 5.41699C11.4473 5.50488 11.5156 5.60905 11.5645 5.72949C11.6165 5.84668 11.6426 5.97363 11.6426 6.11035C11.6426 6.24056 11.6182 6.36589 11.5693 6.48633C11.5205 6.60677 11.4505 6.71257 11.3594 6.80371L7.48242 10.6855C7.39128 10.7767 7.28548 10.8483 7.16504 10.9004C7.0446 10.9492 6.91927 10.9736 6.78906 10.9736C6.65885 10.9736 6.53353 10.9492 6.41309 10.9004C6.29264 10.8483 6.18685 10.7767 6.0957 10.6855L4.32812 8.91797C4.23698 8.82682 4.16536 8.72103 4.11328 8.60059C4.06445 8.48014 4.04004 8.35482 4.04004 8.22461C4.04004 8.08789 4.06608 7.96094 4.11816 7.84375C4.17025 7.72331 4.24023 7.61914 4.32812 7.53125C4.41602 7.44336 4.51855 7.375 4.63574 7.32617C4.75618 7.27409 4.88477 7.24805 5.02148 7.24805C5.15169 7.24805 5.27702 7.27246 5.39746 7.32129C5.5179 7.37012 5.6237 7.4401 5.71484 7.53125L6.78906 8.60547L9.97266 5.41699C10.0638 5.32585 10.1696 5.25586 10.29 5.20703C10.4105 5.1582 10.5358 5.13379 10.666 5.13379Z" fill="white"></path>';
  let dndTimer = null, dndBusy = false, dndLastFail = 0, dndAvailLabel = 'Available';
  let dndReported = null;
  // Sinal discreto de que o Não perturbe disfarçado entrou: o título "ISP - Customer Service" do topo
  // fica em negrito por 1 segundo e volta ao normal.
  function flashBreadcrumb(tries = 0) {
    const el = document.querySelector('span[data-id="appBreadCrumbText"]');
    if (!el) { if (tries < 40) setTimeout(() => flashBreadcrumb(tries + 1), 250); return; } // a página ainda está montando
    const prev = el.style.getPropertyValue('font-weight'), prevPri = el.style.getPropertyPriority('font-weight');
    el.style.setProperty('font-weight', '700', 'important');
    setTimeout(() => { if (prev) el.style.setProperty('font-weight', prev, prevPri); else el.style.removeProperty('font-weight'); }, 1000);
  }
  function reportDnd(on) {
    if (dndReported === on) return;
    dndReported = on;
    if (on) flashBreadcrumb();
  }
  const realAvailable = () => { try { return localStorage.getItem(REAL_FLAG) === '1'; } catch (_) { return false; } };
  const setRealAvailable = (v) => { try { v ? localStorage.setItem(REAL_FLAG, '1') : localStorage.removeItem(REAL_FLAG); } catch (_) { /* sem localStorage */ } };

  const autoDndHostMatch = () => {
    const h = hostKey();
    return String(settings.autoDndHosts || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0].replace(/^www\./, '')).filter(Boolean)
      .some((d) => h === d || h.endsWith('.' + d));
  };
  const presenceBtn = () => document.querySelector('button[data-id*="PresenceControlButton"]');
  const btnLabel = (b) => (b.getAttribute('title') || b.getAttribute('aria-label') || '').trim();
  const itemLabel = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim();
  const findDndItem = () => {
    const items = [...document.querySelectorAll('button[data-id^="presencestatus-"], [role="menuitem"], [role="option"]')];
    return items.find((el) => DND_RE.test(itemLabel(el))) || items.find((el) => /donotdisturb|do-not-disturb|dnd/i.test(el.getAttribute('data-id') || ''));
  };
  const isAvailItem = (el) => /available/i.test(el.getAttribute('data-id') || '') || AVAIL_RE.test(itemLabel(el));

  async function switchToDnd() {
    if (dndBusy) return;
    dndBusy = true;
    try {
      const b = presenceBtn();
      if (!b) return;
      let item = findDndItem();
      let opened = false;
      if (!item) {
        b.click(); opened = true;
        for (let i = 0; i < 25 && !item; i++) { await sleep(100); item = findDndItem(); }
      }
      if (item) { item.click(); await sleep(250); }
      else { dndLastFail = Date.now(); if (opened) b.click(); } // não achou o item: fecha o menu e tenta de novo mais tarde
    } finally { dndBusy = false; }
  }

  function applyFakeLook(b) {
    const svg = b.querySelector('svg');
    if (!svg) return;
    const src = svg.getAttribute('source') || '';
    if (b.dataset.radialFake === '1' && btnLabel(b) === dndAvailLabel && /Available/.test(src)) return; // já disfarçado
    try {
      b.setAttribute('title', dndAvailLabel); b.setAttribute('aria-label', dndAvailLabel);
      svg.setAttribute('source', src.replace(/msdyn_cec_[A-Za-z]+\.svg/, 'msdyn_cec_Available.svg'));
      svg.innerHTML = FAKE_CHECK;
      b.dataset.radialFake = '1';
    } catch (_) { /* a página trocou o elemento: refaz no próximo ciclo */ }
  }

  function dndTick() {
    if (dndBusy) return;
    const b = presenceBtn();
    if (!b) { reportDnd(false); return; }
    const label = btnLabel(b);
    if (AVAIL_RE.test(label) && realAvailable()) { delete b.dataset.radialFake; dndAvailLabel = label; reportDnd(false); return; } // Available de verdade (Shift)
    const faked = b.dataset.radialFake === '1' && AVAIL_RE.test(label) && /Available/.test((b.querySelector('svg') || {getAttribute: () => ''}).getAttribute('source') || '');
    if (faked) { reportDnd(true); return; }
    if (DND_RE.test(label)) { applyFakeLook(b); reportDnd(true); return; }   // Não perturbe de verdade: mostra Available
    if (AVAIL_RE.test(label)) {
      dndAvailLabel = label;
      if (realAvailable()) { reportDnd(false); return; }     // pedido com Shift: Available de verdade
      if (Date.now() - dndLastFail > 8000) switchToDnd();   // Disponível de verdade -> Não perturbe + disfarce
      return;
    }
    reportDnd(false);                                       // outro status: aparece como é
  }

  // Clique de verdade no menu de presença: "Available" vira Não perturbe + disfarce, a não ser que Shift
  // esteja apertado (aí é o Available de verdade). Qualquer outro status desfaz o pedido de Available real.
  function dndClick(e) {
    if (!e.isTrusted) return;
    const it = e.target.closest && e.target.closest('button[data-id^="presencestatus-"]');
    if (!it) return;
    if (isAvailItem(it)) {
      if (e.shiftKey) { setRealAvailable(true); return; }   // deixa o clique seguir: Available real
      setRealAvailable(false);
      e.preventDefault(); e.stopImmediatePropagation();
      const dnd = findDndItem();
      if (dnd) dnd.click();
    } else setRealAvailable(false);
  }

  function refreshAutoDnd() {
    const on = !!settings.autoDnd && autoDndHostMatch();
    if (on && !dndTimer) {
      dndTimer = setInterval(dndTick, 150);
      document.addEventListener('click', dndClick, true);
    } else if (!on && dndTimer) {
      clearInterval(dndTimer); dndTimer = null;
      reportDnd(false);
      document.removeEventListener('click', dndClick, true);
    }
  }

  // ---------- Gatilhos configuráveis (página de opções) ----------
  // settings = { mouse: 'none'|'right-hold'|'middle'|'back'|'forward', holdMs, key: {code,ctrl,shift,alt,meta}|null,
  //              size: px, sticky: bool (soltar ativa a última fatia), cancel: 'none'|'right'|'middle'|'back'|'forward' }
  const DEFAULTS = { mouse: 'right-hold', holdMs: 150, key: null, size: 380, sticky: true, cancel: 'left', contentScale: 1.5, autoDnd: false, autoDndHosts: 'isp.crm4.dynamics.com' };
  let settings = { ...DEFAULTS };
  const applySettings = (s) => { settings = { ...DEFAULTS, ...(s || {}) }; refreshAutoDnd(); };
  try {
    chrome.storage.sync.get('settings').then((r) => applySettings(r.settings));
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync' && ch.settings) applySettings(ch.settings.newValue); });
  } catch (_) { /* contexto da extensão invalidado */ }

  const BTN = { middle: 1, back: 3, forward: 4 }; // número do botão do mouse
  const CANCEL_BTN = { left: 0, right: 2, middle: 1, back: 3, forward: 4 };
  const isEditable = (t) => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  let pressed = false;      // botão direito está pressionado
  let suppressCtx = false;  // engole o menu nativo que viria ao soltar
  let btnDown = null;       // botão de abertura atualmente pressionado
  let noClickUntil = 0;     // engole o clique que vem depois de cancelar com o botão esquerdo
  const cancelBtn = () => (settings.cancel === 'none' ? null : CANCEL_BTN[settings.cancel] ?? null);
  // Botões que a extensão "possui" agora: o de abrir e, com o menu aberto, o de cancelar.
  const ours = (b) => BTN[settings.mouse] === b || (!!root && cancelBtn() === b);

  window.addEventListener('mousedown', (e) => {
    if (!e.isTrusted) return; // só ações reais do usuário abrem o menu
    // Botão de cancelar: fecha o menu sem ativar nada.
    if (root && cancelBtn() === e.button && !(settings.mouse === 'right-hold' && e.button === 2)) {
      e.preventDefault(); e.stopPropagation();
      if (e.button === 2) suppressCtx = true;
      if (e.button === 0) noClickUntil = Date.now() + 400;
      close();
      return;
    }
    const m = settings.mouse;
    // Menu já aberto: apertar de novo o botão do gatilho é "escolher". Soltar sobre uma fatia a ativa
    // (ou a última, com "manter última opção"); sobre o centro passa ao próximo grupo.
    const trig = m === 'right-hold' ? 2 : BTN[m];
    if (root && trig === e.button) {
      e.preventDefault(); e.stopPropagation();
      btnDown = e.button;
      openedBtn = e.button;
      if (e.button === 2) { pressed = true; suppressCtx = true; }
      return;
    }
    if (m === 'right-hold') {
      if (e.button !== 2 || root || isEditable(e.target)) return;
      pressed = true;
      btnDown = 2;
      const x = e.clientX, y = e.clientY;
      hold = { x, y, timer: setTimeout(() => { hold = null; suppressCtx = true; open({ x, y, viaBtn: 2 }); }, settings.holdMs) };
    } else if (BTN[m] === e.button) {
      e.preventDefault(); e.stopPropagation();
      btnDown = e.button;
      open({ x: e.clientX, y: e.clientY, viaBtn: e.button });
    }
  }, true);

  window.addEventListener('mouseup', (e) => {
    if (!e.isTrusted) return;
    const wasOpener = btnDown === e.button;
    if (wasOpener) btnDown = null;
    if (e.button === 2) {
      pressed = false;
      if (hold) { clearTimeout(hold.timer); hold = null; }
      setTimeout(() => { suppressCtx = false; }, 300);
    }
    // Soltar o botão que abriu: escolhe a fatia sob o mouse (ou a última, no modo "manter última opção").
    if (wasOpener && openedBtn === e.button && root) {
      const t = e.composedPath ? e.composedPath()[0] : e.target; // dentro do Shadow DOM o alvo é o hospedeiro
      const seg = t && t.closest && t.closest('.rdl-seg');
      const onCenter = !seg && t && t.closest && t.closest('.rdl-center');
      const run = (seg && segRun.get(seg)) || (onCenter && centerSwap) || (settings.sticky && armed && segRun.get(armed));
      if (run) { e.preventDefault(); e.stopPropagation(); run(); }
    }
    if (ours(e.button) && e.button !== 2) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Botão do meio/laterais: impede abrir link em nova aba ou voltar/avançar.
  window.addEventListener('auxclick', (e) => {
    if (ours(e.button) || BTN[settings.mouse] === e.button) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  window.addEventListener('click', (e) => {
    if (Date.now() < noClickUntil) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  window.addEventListener('contextmenu', (e) => {
    if (suppressCtx || (settings.mouse === 'right-hold' && pressed)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // Janela perdeu o foco com o botão pressionado: zera o estado do "segurar".
  window.addEventListener('blur', () => { pressed = false; btnDown = null; if (hold) { clearTimeout(hold.timer); hold = null; } });

  // Bookmarklets com atalho de teclado: rodam em qualquer página, sem abrir o menu.
  // Só os metadados ficam aqui; o código é lido pelo background na hora de executar.
  let shortcuts = [];
  const loadShortcuts = async () => {
    try {
      const all = await chrome.storage.local.get(null);
      shortcuts = Object.keys(all)
        .filter((k) => k.startsWith('opt_') && all[k].type === 'js' && all[k].code && all[k].shortcut && all[k].shortcut.code)
        .map((k) => ({ id: k.slice(4), sc: all[k].shortcut }));
    } catch (_) { /* contexto da extensão invalidado */ }
  };
  loadShortcuts();
  try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local') loadShortcuts(); }); } catch (_) { /* idem */ }

  window.addEventListener('keydown', (e) => {
    if (!e.isTrusted || e.repeat || !shortcuts.length) return;
    const hit = shortcuts.find(({ sc }) => sc.code === e.code && !!sc.ctrl === e.ctrlKey && !!sc.shift === e.shiftKey && !!sc.alt === e.altKey && !!sc.meta === e.metaKey);
    if (!hit) return;
    if (isEditable(e.target) && !(hit.sc.ctrl || hit.sc.alt || hit.sc.meta)) return; // não atrapalha a digitação
    e.preventDefault(); e.stopPropagation();
    chrome.runtime.sendMessage({ type: 'run-option', id: hit.id })
      .then((res) => { if (!res || !res.ok) toast((res && res.error) || tr('Failed to run.'), true); })
      .catch(() => {});
  }, true);

  window.addEventListener('keydown', (e) => {
    const k = settings.key;
    if (!e.isTrusted || !k || !k.code || e.repeat || e.code !== k.code) return;
    if (e.ctrlKey !== !!k.ctrl || e.shiftKey !== !!k.shift || e.altKey !== !!k.alt || e.metaKey !== !!k.meta) return;
    if (isEditable(e.target) && !(k.ctrl || k.alt || k.meta)) return; // não atrapalha a digitação
    e.preventDefault(); e.stopPropagation();
    open();
  }, true);

  // Bookmarklets que guardam dados no próprio código (ex.: 🖌️ palavras e cores): o bookmarklet avisa por
  // evento e o background regrava o bloco de dados do código salvo (veja saveBookmarkletData).
  window.addEventListener('radial-bookmarklet-data', (e) => {
    const detail = typeof e.detail === 'string' ? e.detail : '';
    if (!detail || detail.length > 200000) return;
    try { chrome.runtime.sendMessage({ type: 'bookmarklet-data', detail }).catch(() => {}); } catch (_) { /* contexto invalidado */ }
  });

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id !== chrome.runtime.id) return;
    if (!msg) return;
    // Pré-visualização pedida pelo popup: abre (ou refaz) o radial no meio da tela.
    if (msg.type === 'open-radial' && msg.preview) {
      if (root) close();
      open({ x: innerWidth / 2, y: innerHeight / 2, preview: true });
    } else if (msg.type === 'open-radial') open();
    else if (msg.type === 'close-radial' && root && previewOpen) close();
  });
})();
