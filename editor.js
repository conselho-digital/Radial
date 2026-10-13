// Editor de opção do radial, compartilhado pelo popup (um site fixo) e pela página de opções (vários anéis).
// Uma opção é um atalho de teclado gravado ("pressiona as teclas por mim") ou um código JavaScript.
(() => {
  const G = globalThis;
  const SVG = {
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    record: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'
  };
  const icon = (p) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;

  const KEY_NAMES = { Space: 'Espaço', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc',
    Backquote: '`', Minus: '-', Equal: '=', Slash: '/', Period: '.', Comma: ',', Semicolon: ';', Quote: "'",
    BracketLeft: '[', BracketRight: ']', Backslash: '\\' };

  function comboText(c) {
    const name = KEY_NAMES[c.code] || String(c.code || c.key || '?').replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
    return [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', c.meta && 'Cmd', name].filter(Boolean).join(' + ');
  }

  // Domínio sem "www." — mesma regra usada pelo content script.
  const hostKey = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

  // opts: { fixed?: { id, name }, siteList?: [{id, name}], onChange(), toast(text, isErr) }
  function mount(root, opts) {
    const fixed = opts.fixed || null;
    root.innerHTML = `
      <div class="seg full" role="radiogroup" aria-label="Tipo de opção">
        <label><input type="radio" name="otype" value="keys" checked><span class="pill">${icon(SVG.keyboard)}<span>Atalho de teclado</span></span></label>
        <label><input type="radio" name="otype" value="js"><span class="pill">${icon(SVG.code)}<span>JavaScript</span></span></label>
      </div>
      <div class="field">
        <label class="lbl" for="ed-name">Nome da opção</label>
        <input type="text" id="ed-name" maxlength="40" placeholder="Ex.: Colar sem formatação" autocomplete="off">
      </div>
      <div class="field" data-panel="keys">
        <span class="lbl">Teclas que o radial vai pressionar</span>
        <div class="keys" data-keys></div>
        <div class="row" style="margin-top:10px">
          <button class="btn" type="button" data-rec>${icon(SVG.record)}<span data-rec-txt>Gravar atalho</span></button>
          <button class="btn ghost" type="button" data-clear>Limpar</button>
        </div>
        <p class="help">Clique em gravar e faça o atalho no teclado. Grave mais de um para pressionar em sequência. Atalhos reservados do Chrome (Ctrl+T, Ctrl+W…) não podem ser gravados.</p>
      </div>
      <div class="field hidden" data-panel="js">
        <label class="lbl" for="ed-code">Código JavaScript</label>
        <textarea id="ed-code" spellcheck="false" placeholder="javascript:(function(){ alert('olá'); })();"></textarea>
        <p class="help">Sem limite de tamanho. Aceita o formato <code>javascript:…</code> de favoritos. Páginas com CSP estrito podem bloquear a execução.</p>
      </div>
      <div class="field hidden" data-panel="shortcut">
        <span class="lbl">Atalho do teclado</span>
        <div class="keys" data-sc></div>
        <div class="row" style="margin-top:10px">
          <button class="btn" type="button" data-rec2>${icon(SVG.record)}<span data-rec2-txt>Gravar atalho</span></button>
          <button class="btn ghost" type="button" data-clear2>Limpar</button>
        </div>
        <p class="help">Roda o bookmarklet em qualquer página, sem abrir o radial. Use Ctrl, Alt ou Cmd para não atrapalhar a digitação.</p>
      </div>
      <label class="check hidden" data-inradial-row><input type="checkbox" data-inradial><span>Mostrar também no radial</span></label>
      <div class="field" data-ctx></div>
      <div class="actions">
        <button class="btn primary" type="button" data-save>Salvar</button>
        <button class="btn hidden" type="button" data-cancel>Cancelar edição</button>
      </div>`;
    const $ = (sel) => root.querySelector(sel);
    const nameEl = $('#ed-name'), codeEl = $('#ed-code');
    const keysBox = $('[data-keys]'), recBtn = $('[data-rec]'), recTxt = $('[data-rec-txt]');
    const scBox = $('[data-sc]'), rec2Btn = $('[data-rec2]'), rec2Txt = $('[data-rec2-txt]');
    const bm = !!opts.bookmarklet; // modo bookmarklet: só JavaScript, com atalho e anéis opcionais

    let editing = null;      // opção em edição (ou null)
    let keys = [];           // atalhos gravados
    let recording = null;    // 'keys' | 'shortcut' | null
    let shortcut = null;     // atalho que roda a opção em qualquer página (bookmarklet)
    let extraCtx = [];       // anéis da opção que não aparecem no formulário (preservados ao editar)
    let hostChips = new Set();

    const type = () => root.querySelector('input[name="otype"]:checked').value;
    const setType = (t) => {
      root.querySelectorAll('input[name="otype"]').forEach((r) => { r.checked = r.value === t; });
      $('[data-panel="keys"]').classList.toggle('hidden', t !== 'keys');
      $('[data-panel="js"]').classList.toggle('hidden', t !== 'js');
    };
    root.querySelectorAll('input[name="otype"]').forEach((r) => { r.onchange = () => setType(r.value); });

    // ----- Gravação de atalhos -----
    function renderKeys() {
      keysBox.textContent = '';
      if (!keys.length) {
        const k = document.createElement('kbd');
        k.className = 'empty';
        k.textContent = 'Nenhum atalho gravado';
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
        x.title = x.ariaLabel = 'Remover ' + comboText(c);
        x.onclick = () => { keys.splice(i, 1); renderKeys(); };
        wrap.append(k, x);
        keysBox.appendChild(wrap);
      });
      recTxt.textContent = keys.length ? 'Gravar outro' : 'Gravar atalho';
    }
    function renderShortcut() {
      scBox.textContent = '';
      const k = document.createElement('kbd');
      k.className = shortcut ? '' : 'empty';
      k.textContent = shortcut ? comboText(shortcut) : 'Nenhum atalho';
      scBox.appendChild(k);
      rec2Txt.textContent = shortcut ? 'Gravar outro' : 'Gravar atalho';
    }
    function stopRec() {
      recording = null;
      recBtn.classList.remove('recording');
      rec2Btn.classList.remove('recording');
      recTxt.textContent = keys.length ? 'Gravar outro' : 'Gravar atalho';
      rec2Txt.textContent = shortcut ? 'Gravar outro' : 'Gravar atalho';
    }
    const startRec = (kind, btn, txt) => {
      if (recording) { stopRec(); return; }
      recording = kind;
      btn.classList.add('recording');
      txt.textContent = 'Faça o atalho… (Esc cancela)';
    };
    recBtn.onclick = () => startRec('keys', recBtn, recTxt);
    rec2Btn.onclick = () => startRec('shortcut', rec2Btn, rec2Txt);
    recBtn.onblur = rec2Btn.onblur = stopRec;
    $('[data-clear]').onclick = () => { keys = []; stopRec(); renderKeys(); };
    $('[data-clear2]').onclick = () => { shortcut = null; stopRec(); renderShortcut(); };
    document.addEventListener('keydown', (e) => {
      if (!recording) return;
      e.preventDefault(); e.stopPropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return; // espera a tecla principal
      const bare = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
      const kind = recording;
      stopRec();
      if (e.key === 'Escape' && bare) return;
      const combo = { key: e.key, code: e.code, keyCode: e.keyCode, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey };
      if (kind === 'shortcut') { shortcut = combo; renderShortcut(); return; }
      if (keys.length >= 10) return opts.toast('No máximo 10 atalhos em sequência.', true);
      keys.push(combo);
      renderKeys();
    }, true);

    // ----- Anéis -----
    const ctxBox = $('[data-ctx]');
    let extraGeneral = null;
    if (fixed) {
      ctxBox.innerHTML = `<label class="check"><input type="checkbox" data-general><span>Mostrar também no anel Geral (todos os sites)</span></label>`;
      extraGeneral = ctxBox.querySelector('[data-general]');
    } else {
      ctxBox.innerHTML = `
        <span class="lbl">Mostrar nos anéis <span class="count" data-count></span></span>
        <input type="text" data-filter placeholder="Filtrar sites…" aria-label="Filtrar sites" autocomplete="off" style="margin-bottom:10px">
        <div class="chips" data-chips role="group"></div>
        <div class="addhost"><input type="text" data-host placeholder="Outro site, ex.: meusite.com.br" aria-label="Outro site" autocomplete="off" inputmode="url"><button class="btn" type="button" data-addhost>Adicionar site</button></div>
        <p class="help">Sites fora da lista ganham um anel próprio. Cada anel mostra até 12 botões.</p>`;
      const chips = ctxBox.querySelector('[data-chips]');
      const updateCount = () => {
        const n = chips.querySelectorAll('input:checked').length;
        ctxBox.querySelector('[data-count]').textContent = n ? '· ' + n + ' selecionado' + (n > 1 ? 's' : '') : '';
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
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/.test(h)) return opts.toast('Digite um domínio válido.', true);
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
      if (bm && !fixed && inRadial.checked && !ctxBox.chips.querySelector('input:checked')) { setCtx(['general']); }
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
      $('[data-save]').textContent = bm ? 'Salvar bookmarklet' : 'Salvar';
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
      $('[data-save]').textContent = 'Salvar alterações';
      $('[data-cancel]').classList.remove('hidden');
      nameEl.focus();
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('[data-cancel]').onclick = () => reset();

    $('[data-save]').onclick = async () => {
      const name = nameEl.value.trim();
      const t = type();
      const ctx = getCtx();
      if (!name) return opts.toast('Dê um nome à opção.', true);
      if (t === 'keys' && !keys.length) return opts.toast('Grave ao menos um atalho.', true);
      if (t === 'js' && !codeEl.value.trim()) return opts.toast('O código está vazio.', true);
      if (bm && !ctx.length && !shortcut) return opts.toast('Grave um atalho ou marque "Mostrar também no radial".', true);
      if (!bm && !ctx.length) return opts.toast('Escolha ao menos um anel.', true);
      const code = codeEl.value.trim();
      // Fora do modo bookmarklet, preserva o atalho que a opção já tinha.
      const sc = bm ? shortcut : (editing && editing.shortcut) || null;
      const data = t === 'keys' ? { type: 'keys', name, keys, ctx } : { type: 'js', name, code, ctx, ...(sc ? { shortcut: sc } : {}) };
      try {
        await G.RADIAL_STORE.save({ id: editing && editing.id, t: editing && editing.t, ...data });
      } catch (e) {
        return opts.toast('Não foi possível salvar: ' + e.message, true);
      }
      reset(fixed || bm ? undefined : ctx);
      opts.toast('Salvo.');
      opts.onChange();
    };

    if (bm) {
      root.querySelector('.seg').classList.add('hidden');
      $('[data-panel="keys"]').classList.add('hidden');
      $('[data-panel="shortcut"]').classList.remove('hidden');
      $('[data-inradial-row]').classList.remove('hidden');
      root.querySelector('label[for="ed-name"]').textContent = 'Nome do bookmarklet';
      root.querySelector('label[for="ed-code"]').textContent = 'Conteúdo (código)';
    }
    if (opts.keysOnly) {
      root.querySelector('.seg').classList.add('hidden');
      $('[data-panel="js"]').classList.add('hidden');
    }
    if (opts.noJs) root.querySelector('input[value="js"]').closest('label').classList.add('hidden');
    renderShortcut();
    reset();
    return { edit, reset };
  }

  const ICON_PATHS = { ...SVG,
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>' };
  G.RADIAL_EDITOR = { mount, comboText, hostKey, icon_: (name) => icon(ICON_PATHS[name] || name) };
})();
