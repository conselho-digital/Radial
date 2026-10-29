// configuration.sicharge.technology, página de logs do carregador (.../chargers/<id>/logs):
// 1) troca "Rows per page" de 5 para All ao abrir a página;
// 2) o botão Apply roda o bookmarklet 📥 (baixar logs) em vez do Apply normal, só quando o intervalo
//    entre "Date From" e "Date To" é maior que uma hora.
(() => {
  if (window.__radialSicLoaded) return;
  window.__radialSicLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  let on = true;
  const load = (r) => { on = !(r.settings && r.settings.sicLogs === false); };
  chrome.storage.sync.get('settings', load);
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync' && ch.settings) load({ settings: ch.settings.newValue }); });
  const isLogs = () => on && /\/chargers\/[^/]+\/logs\/?$/i.test(location.pathname);

  function click(el) {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const C = t.startsWith('pointer') ? PointerEvent : MouseEvent;
      el.dispatchEvent(new C(t, { bubbles: true, cancelable: true, view: window, button: 0 }));
    }
  }
  async function waitFor(fn, ms = 8000) {
    const t0 = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - t0 > ms) return null;
      await sleep(150);
    }
  }

  // ---------- Rows per page: 5 -> All ----------
  let rowsDoneFor = '';
  async function rowsAll() {
    const input = document.querySelector('input[aria-label="Rows per page:"]');
    if (!input) return;
    const key = location.pathname;
    if (rowsDoneFor === key) return;
    const shown = input.closest('.v-select__selections')?.querySelector('.v-select__selection');
    if (!shown) return;
    rowsDoneFor = key;
    if (norm(shown.textContent) !== '5') return;
    const slot = input.closest('.v-input__slot') || input.closest('.v-select__slot') || input;
    click(slot);
    const item = await waitFor(() => [...document.querySelectorAll('.menuable__content__active .v-list-item, .v-menu__content .v-list-item')]
      .find((e) => norm(e.textContent).toLowerCase() === 'all'), 3000);
    if (item) click(item);
    else document.body.click();
  }

  // ---------- Apply -> bookmarklet 📥 (baixar logs) ----------
  function dateValue(re) {
    const lab = [...document.querySelectorAll('label')].find((l) => re.test(norm(l.textContent)));
    const inp = lab && (lab.control || (lab.htmlFor && document.getElementById(lab.htmlFor)));
    return inp ? Date.parse(inp.value) : NaN;
  }
  const rangeMs = () => Math.abs(dateValue(/Date To/i) - dateValue(/Date From/i));

  // Só o clique do usuário (isTrusted) é desviado; os cliques que o próprio 📥 dá no Apply passam direto.
  document.addEventListener('click', async (e) => {
    if (!isLogs() || !e.isTrusted) return;
    const b = e.target.closest && e.target.closest('button');
    if (!b || norm(b.textContent) !== 'Apply' || !(rangeMs() > 3600000)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    let res = null;
    try { res = await chrome.runtime.sendMessage({ type: 'run-option', id: 'def_6' }); } catch (_) { /* extensão recarregada */ }
    if (!res || !res.ok) b.click();   // bookmarklet 📥 não encontrado: Apply normal
  }, true);

  setInterval(() => {
    if (!isLogs()) { rowsDoneFor = ''; return; }
    rowsAll();
  }, 700);
})();
