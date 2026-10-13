// Editor de opção do radial, compartilhado pelo popup (um site fixo) e pela página de opções (vários anéis).
// Uma opção é um atalho de teclado gravado ("pressiona as teclas por mim") ou um bookmarklet (JavaScript).
(() => {
  const G = globalThis;
  const t = (s, v) => G.RADIAL_I18N.t(s, v);
  const SVG = {
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'
  };
  const icon = (p) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;

  const KEY_NAMES = { Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc',
    Backquote: '`', Minus: '-', Equal: '=', Slash: '/', Period: '.', Comma: ',', Semicolon: ';', Quote: "'",
    BracketLeft: '[', BracketRight: ']', Backslash: '\\' };

  function comboText(c) {
    const name = KEY_NAMES[c.code] || String(c.code || c.key || '?').replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
    return [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', c.meta && 'Cmd', name].filter(Boolean).join(' + ');
  }

  // Domínio sem "www." — mesma regra usada pelo content script.
  const hostKey = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

  // Tecla digitada à mão ("S", "F5", "Enter") -> { key, code, keyCode }. Serve quando o navegador não deixa gravar.
  const NAMED = { enter: [13, 'Enter'], tab: [9, 'Tab'], space: [32, 'Space'], escape: [27, 'Escape'], esc: [27, 'Escape'],
    backspace: [8, 'Backspace'], delete: [46, 'Delete'], del: [46, 'Delete'], insert: [45, 'Insert'], home: [36, 'Home'], end: [35, 'End'],
    pageup: [33, 'PageUp'], pagedown: [34, 'PageDown'], arrowup: [38, 'ArrowUp'], up: [38, 'ArrowUp'], arrowdown: [40, 'ArrowDown'],
    down: [40, 'ArrowDown'], arrowleft: [37, 'ArrowLeft'], left: [37, 'ArrowLeft'], arrowright: [39, 'ArrowRight'], right: [39, 'ArrowRight'] };
  const PUNCT = { '/': [191, 'Slash'], '.': [190, 'Period'], ',': [188, 'Comma'], ';': [186, 'Semicolon'], "'": [222, 'Quote'],
    '[': [219, 'BracketLeft'], ']': [221, 'BracketRight'], '\\': [220, 'Backslash'], '-': [189, 'Minus'], '=': [187, 'Equal'], '`': [192, 'Backquote'] };
  function parseKey(txt, mods) {
    const s = String(txt || '').trim();
    let kc, code, key = s;
    let m;
    if (/^[a-z]$/i.test(s)) { kc = s.toUpperCase().charCodeAt(0); code = 'Key' + s.toUpperCase(); key = mods.shift ? s.toUpperCase() : s.toLowerCase(); }
    else if (/^\d$/.test(s)) { kc = s.charCodeAt(0); code = 'Digit' + s; }
    else if ((m = /^f([1-9]|1[0-2])$/i.exec(s))) { kc = 111 + Number(m[1]); code = 'F' + m[1]; key = 'F' + m[1]; }
    else if (NAMED[s.toLowerCase()]) { [kc, code] = NAMED[s.toLowerCase()]; key = code === 'Space' ? ' ' : code; }
    else if (PUNCT[s]) { [kc, code] = PUNCT[s]; }
    else return null;
    return { key, code, keyCode: kc, ctrl: !!mods.ctrl, shift: !!mods.shift, alt: !!mods.alt, meta: !!mods.meta };
  }

  // opts: { fixed?: { id, name }, siteList?: [{id, name}], bookmarklet?, keysOnly?, noJs?, canAdd?(), onChange(), toast(text, isErr) }
  function mount(root, opts) {
    const fixed = opts.fixed || null;
    const bm = !!opts.bookmarklet; // modo bookmarklet: só JavaScript, com atalho e anéis opcionais
    const manualHtml = (n) => `
        <div class="manual" data-manual="${n}">
          <span class="help" style="margin:0">${t('Or type it:')}</span>
          <label class="mod"><input type="checkbox" data-mod="ctrl"><span>Ctrl</span></label>
          <label class="mod"><input type="checkbox" data-mod="alt"><span>Alt</span></label>
          <label class="mod"><input type="checkbox" data-mod="shift"><span>Shift</span></label>
          <label class="mod"><input type="checkbox" data-mod="meta"><span>Cmd</span></label>
          <input type="text" data-mkey maxlength="12" placeholder="${t('Key, e.g. S, F5, Enter')}" aria-label="${t('Key, e.g. S, F5, Enter')}" autocomplete="off">
          <button class="btn" type="button" data-madd>${t('Add')}</button>
        </div>`;
    root.innerHTML = `
      <div class="seg full" role="radiogroup" aria-label="${t('Option type')}">
        <label><input type="radio" name="otype" value="keys" checked><span class="pill">${icon(SVG.keyboard)}<span>${t('Keyboard shortcut')}</span></span></label>
        <label><input type="radio" name="otype" value="js"><span class="pill">${icon(SVG.code)}<span>JavaScript</span></span></label>
      </div>
      <div class="field">
        <label class="lbl" for="ed-name">${bm ? t('Bookmarklet name') : t('Option name')}</label>
        <input type="text" id="ed-name" maxlength="40" placeholder="${t('E.g.: Paste without formatting')}" autocomplete="off">
      </div>
      <div class="field" data-panel="keys">
        <span class="lbl">${t('Keys the radial will press')}</span>
        <div class="keys" data-keys></div>
        <div class="row" style="margin-top:10px">
          <button class="btn" type="button" data-rec>${icon(SVG.record)}<span data-rec-txt>${t('Record shortcut')}</span></button>
          <button class="btn ghost" type="button" data-clear>${t('Clear')}</button>
        </div>
        ${manualHtml(1)}
        <p class="help">${t('Click record and press the shortcut on your keyboard. Record more than one to press them in sequence. Browser-reserved shortcuts (Ctrl+T, Ctrl+W…) cannot be recorded.')}</p>
      </div>
      <div class="field hidden" data-panel="js">
        <label class="lbl" for="ed-code">${bm ? t('Content (code)') : t('JavaScript code')}</label>
        <textarea id="ed-code" spellcheck="false" placeholder="javascript:(function(){ alert('hi'); })();"></textarea>
        <p class="help">${t('No size limit. Accepts the bookmark format javascript:… Pages with a strict CSP may block execution.')}</p>
      </div>
      <div class="field hidden" data-panel="shortcut">
        <span class="lbl">${t('Keyboard shortcut (optional)')}</span>
        <div class="keys" data-sc></div>
        <div class="row" style="margin-top:10px">
          <button class="btn" type="button" data-rec2>${icon(SVG.record)}<span data-rec2-txt>${t('Record shortcut')}</span></button>
          <button class="btn ghost" type="button" data-clear2>${t('Clear')}</button>
        </div>
        ${manualHtml(2)}
        <p class="help">${t('Runs the bookmarklet on any page without opening the radial. Use Ctrl, Alt or Cmd so it does not interfere with typing.')}</p>
      </div>
      <label class="check hidden" data-inradial-row><input type="checkbox" data-inradial><span>${t('Also show in the radial')}</span></label>
      <div class="field" data-ctx></div>
      <div class="actions">
        <button class="btn primary" type="button" data-save>${t('Save')}</button>
        <button class="btn hidden" type="button" data-cancel>${t('Cancel editing')}</button>
      </div>`;
    const $ = (sel) => root.querySelector(sel);
    const nameEl = $('#ed-name'), codeEl = $('#ed-code');
    const keysBox = $('[data-keys]'), recBtn = $('[data-rec]'), recTxt = $('[data-rec-txt]');
    const scBox = $('[data-sc]'), rec2Btn = $('[data-rec2]'), rec2Txt = $('[data-rec2-txt]');
    const saveLabel = bm ? t('Save bookmarklet') : t('Save');

    let editing = null;      // opção em edição (ou null)
    let keys = [];           // atalhos gravados (sequência)
    let recording = null;    // 'keys' | 'shortcut' | null
    let shortcut = null;     // atalho que roda o bookmarklet em qualquer página
    let extraCtx = [];       // anéis da opção que não aparecem no formulário (preservados ao editar)

    const type = () => root.querySelector('input[name="otype"]:checked').value;
    const setType = (v) => {
      root.querySelectorAll('input[name="otype"]').forEach((r) => { r.checked = r.value === v; });
      $('[data-panel="keys"]').classList.toggle('hidden', v !== 'keys');
      $('[data-panel="js"]').classList.toggle('hidden', v !== 'js');
    };
    root.querySelectorAll('input[name="otype"]').forEach((r) => { r.onchange = () => setType(r.value); });

    // ----- Gravação de atalhos -----
    function renderKeys() {
      keysBox.textContent = '';
      if (!keys.length) {
        const k = document.createElement('kbd');
        k.className = 'empty';
        k.textContent = t('No shortcut recorded');
        keysBox.appendChild(k);
      }
      keys.forEach((c, i) => {
        if (i) keysBox.insertAdjacentHTML('beforeend', '<span class="arrow" aria-hidden="true">›</span>');
        const wrap = document.createElement('span');
        wrap.className = 'step';
        const k = document.createElement('kbd');
        k.textContent = comboText(c);
        const x = document.createElement('button');
        x.type = 'button';
        x.textContent = '×';
        x.title = x.ariaLabel = t('Remove {name}', { name: comboText(c) });
        x.onclick = () => { keys.splice(i, 1); renderKeys(); };
        wrap.append(k, x);
        keysBox.appendChild(wrap);
      });
      recTxt.textContent = keys.length ? t('Record another') : t('Record shortcut');
    }
    function renderShortcut() {
      scBox.textContent = '';
      const k = document.createElement('kbd');
      k.className = shortcut ? '' : 'empty';
      k.textContent = shortcut ? comboText(shortcut) : t('No shortcut');
      scBox.appendChild(k);
      rec2Txt.textContent = shortcut ? t('Record another') : t('Record shortcut');
    }
    function stopRec() {
      recording = null;
      recBtn.classList.remove('recording');
      rec2Btn.classList.remove('recording');
      recTxt.textContent = keys.length ? t('Record another') : t('Record shortcut');
      rec2Txt.textContent = shortcut ? t('Record another') : t('Record shortcut');
    }
    const startRec = (kind, btn, txt) => {
      if (recording) { stopRec(); return; }
      recording = kind;
      btn.classList.add('recording');
      txt.textContent = t('Press the shortcut… (Esc cancels)');
    };
    recBtn.onclick = () => startRec('keys', recBtn, recTxt);
    rec2Btn.onclick = () => startRec('shortcut', rec2Btn, rec2Txt);
    recBtn.onblur = rec2Btn.onblur = stopRec;
    $('[data-clear]').onclick = () => { keys = []; stopRec(); renderKeys(); };
    $('[data-clear2]').onclick = () => { shortcut = null; stopRec(); renderShortcut(); };

    function addCombo(kind, combo) {
      if (kind === 'shortcut') { shortcut = combo; renderShortcut(); return; }
      if (keys.length >= 10) return opts.toast(t('At most 10 shortcuts in sequence.'), true);
      keys.push(combo);
      renderKeys();
    }
    document.addEventListener('keydown', (e) => {
      if (!recording) return;
      e.preventDefault(); e.stopPropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return; // espera a tecla principal
      const bare = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
      const kind = recording;
      stopRec();
      if (e.key === 'Escape' && bare) return;
      addCombo(kind, { key: e.key, code: e.code, keyCode: e.keyCode, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey });
    }, true);

    // Entrada manual: modificadores + tecla digitada (plano B quando o navegador não deixa gravar).
    root.querySelectorAll('[data-manual]').forEach((box) => {
      const kind = box.dataset.manual === '2' ? 'shortcut' : 'keys';
      const add = () => {
        const mods = {};
        box.querySelectorAll('[data-mod]').forEach((c) => { mods[c.dataset.mod] = c.checked; });
        const combo = parseKey(box.querySelector('[data-mkey]').value, mods);
        if (!combo) return opts.toast(t('Unknown key. Use a letter, a digit, F1–F12 or a name like Enter, Tab, Space.'), true);
        addCombo(kind, combo);
        box.querySelector('[data-mkey]').value = '';
      };
      box.querySelector('[data-madd]').onclick = add;
      box.querySelector('[data-mkey]').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
    });

    // ----- Anéis -----
    const ctxBox = $('[data-ctx]');
    let extraGeneral = null;
    if (fixed) {
      ctxBox.innerHTML = `<label class="check"><input type="checkbox" data-general><span>${t('Also show in the General ring (all sites)')}</span></label>`;
      extraGeneral = ctxBox.querySelector('[data-general]');
    } else {
      ctxBox.innerHTML = `
        <span class="lbl">${t('Show in rings')} <span class="count" data-count></span></span>
        <input type="text" data-filter placeholder="${t('Filter sites…')}" aria-label="${t('Filter sites…')}" autocomplete="off" style="margin-bottom:10px">
        <div class="chips" data-chips role="group"></div>
        <div class="addhost"><input type="text" data-host placeholder="${t('Other site, e.g.: mysite.com')}" aria-label="${t('Other site, e.g.: mysite.com')}" autocomplete="off" inputmode="url"><button class="btn" type="button" data-addhost>${t('Add site')}</button></div>
        <p class="help">${t('Sites outside the list get their own ring. Each ring shows up to 10 buttons, in 2 radials of 5.')}</p>`;
      const chips = ctxBox.querySelector('[data-chips]');
      const updateCount = () => {
        const n = chips.querySelectorAll('input:checked').length;
        ctxBox.querySelector('[data-count]').textContent = n ? '· ' + t('{n} selected', { n }) : '';
      };
      const addChip = (id, name, checked) => {
        if (chips.querySelector(`input[value="${CSS.escape(id)}"]`)) return;
        const label = document.createElement('label');
        label.className = 'chip';
        const c = document.createElement('input');
        c.type = 'checkbox'; c.value = id; c.checked = !!checked; c.onchange = updateCount;
        const pill = document.createElement('span');
        pill.className = 'pill'; pill.textContent = name;
        label.append(c, pill);
        chips.appendChild(label);
      };
      opts.siteList.forEach((s) => addChip(s.id, s.name));
      ctxBox.querySelector('[data-filter]').oninput = (e) => {
        const q = e.target.value.trim().toLowerCase();
        chips.querySelectorAll('.chip').forEach((l) => { l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none'; });
      };
      ctxBox.querySelector('[data-addhost]').onclick = () => {
        const inp = ctxBox.querySelector('[data-host]');
        let h = inp.value.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0];
        h = hostKey(h);
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/.test(h)) return opts.toast(t('Enter a valid domain.'), true);
        addChip('host:' + h, h, true);
        chips.querySelector(`input[value="${CSS.escape('host:' + h)}"]`).checked = true;
        inp.value = '';
        updateCount();
      };
      ctxBox.addChip = addChip;
      ctxBox.updateCount = updateCount;
      ctxBox.chips = chips;
    }

    const inRadial = $('[data-inradial]');
    const syncRadial = () => { ctxBox.classList.toggle('hidden', bm && !inRadial.checked); };
    inRadial.onchange = () => {
      syncRadial();
      // Marcou "no radial" sem escolher anel: começa pelo Geral.
      if (bm && !fixed && inRadial.checked && !ctxBox.chips.querySelector('input:checked')) setCtx(['general']);
    };
    function getCtx() {
      if (bm && !inRadial.checked) return [];
      if (fixed) return [fixed.id, ...(extraGeneral.checked ? ['general'] : []), ...extraCtx];
      return [...ctxBox.chips.querySelectorAll('input:checked')].map((c) => c.value).concat(extraCtx);
    }
    function setCtx(list) {
      if (bm) { inRadial.checked = list.length > 0; syncRadial(); }
      if (fixed) {
        extraGeneral.checked = list.includes('general');
        extraCtx = list.filter((c) => c !== fixed.id && c !== 'general');
        return;
      }
      list.filter((c) => c.startsWith('host:')).forEach((c) => ctxBox.addChip(c, c.slice(5), true));
      const known = new Set([...ctxBox.chips.querySelectorAll('input')].map((i) => i.value));
      ctxBox.chips.querySelectorAll('input').forEach((c) => { c.checked = list.includes(c.value); });
      extraCtx = list.filter((c) => !known.has(c));
      ctxBox.updateCount();
    }

    // ----- Formulário -----
    function reset(defaultCtx) {
      editing = null;
      keys = [];
      shortcut = null;
      stopRec();
      renderKeys();
      renderShortcut();
      setType(bm ? 'js' : 'keys');
      nameEl.value = '';
      codeEl.value = '';
      setCtx(defaultCtx || (fixed ? [fixed.id] : bm ? [] : ['general']));
      $('[data-save]').textContent = saveLabel;
      $('[data-cancel]').classList.add('hidden');
    }
    function edit(o) {
      editing = o;
      keys = (o.keys || []).map((k) => ({ ...k }));
      shortcut = o.shortcut ? { ...o.shortcut } : null;
      stopRec();
      renderKeys();
      renderShortcut();
      setType(o.type === 'js' ? 'js' : 'keys');
      nameEl.value = o.name || '';
      codeEl.value = o.code || '';
      setCtx(o.ctx || []);
      $('[data-save]').textContent = t('Save changes');
      $('[data-cancel]').classList.remove('hidden');
      nameEl.focus();
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('[data-cancel]').onclick = () => reset();

    $('[data-save]').onclick = async () => {
      const name = nameEl.value.trim();
      const kind = type();
      const ctx = getCtx();
      const code = codeEl.value.trim();
      if (!name) return opts.toast(t('Give it a name.'), true);
      if (kind === 'keys' && !keys.length) return opts.toast(t('Record at least one shortcut.'), true);
      if (kind === 'js' && !code) return opts.toast(t('The code is empty.'), true);
      // Bookmarklet: só nome e conteúdo são obrigatórios (atalho e radial são opcionais).
      if (!bm && !ctx.length) return opts.toast(t('Choose at least one ring.'), true);
      if (!editing && ctx.length && opts.canAdd) { const msg = await opts.canAdd(); if (msg) return opts.toast(msg, true); }
      // Fora do modo bookmarklet, preserva o atalho que a opção já tinha.
      const sc = bm ? shortcut : (editing && editing.shortcut) || null;
      const data = kind === 'keys' ? { type: 'keys', name, keys, ctx } : { type: 'js', name, code, ctx, ...(sc ? { shortcut: sc } : {}) };
      try {
        await G.RADIAL_STORE.save({ id: editing && editing.id, t: editing && editing.t, ...data });
      } catch (e) {
        return opts.toast(t('Could not save: {msg}', { msg: e.message }), true);
      }
      reset(fixed || bm ? undefined : ctx);
      opts.toast(t('Saved.'));
      opts.onChange();
    };

    if (opts.keysOnly) {
      root.querySelector('.seg').classList.add('hidden');
      $('[data-panel="js"]').classList.add('hidden');
    }
    if (bm) {
      root.querySelector('.seg').classList.add('hidden');
      $('[data-panel="keys"]').classList.add('hidden');
      $('[data-panel="shortcut"]').classList.remove('hidden');
      $('[data-inradial-row]').classList.remove('hidden');
    }
    if (opts.noJs) root.querySelector('input[value="js"]').closest('label').classList.add('hidden');
    renderShortcut();
    reset();
    return { edit, reset };
  }

  G.RADIAL_EDITOR = { mount, comboText, hostKey, icon_: (name) => icon(SVG[name] || name) };
})();
