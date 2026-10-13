// Idiomas da interface: inglês (padrão), português, francês, italiano, alemão, árabe e bengali.
// A chave de tradução é o próprio texto em inglês (tabela RADIAL_UI, em i18n-ui.js).
// Rótulos das ações prontas (sites.js, escritos em português) vêm de RADIAL_LABELS (i18n-labels.js).
(() => {
  const G = globalThis;
  const LANGS = [['en', 'English'], ['pt', 'Português'], ['fr', 'Français'], ['it', 'Italiano'], ['de', 'Deutsch'], ['ar', 'العربية'], ['bn', 'বাংলা']];
  const UI_COL = { pt: 0, fr: 1, it: 2, de: 3, ar: 4, bn: 5 };   // RADIAL_UI: inglês -> [pt, fr, it, de, ar, bn]
  const LAB_COL = { en: 0, fr: 1, it: 2, de: 3, ar: 4, bn: 5 };  // RADIAL_LABELS: português -> [en, fr, it, de, ar, bn]
  let lang = 'en';

  const fmt = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s);

  function t(s, v) {
    const row = G.RADIAL_UI && G.RADIAL_UI[s];
    return fmt((lang !== 'en' && row && row[UI_COL[lang]]) || s, v);
  }

  // Rótulo de ação pronta ou nome de site (a fonte está em português).
  function label(pt) {
    if (lang === 'pt') return pt;
    const row = G.RADIAL_LABELS && G.RADIAL_LABELS[pt];
    return (row && (row[LAB_COL[lang]] || row[0])) || pt;
  }

  const ATTRS = ['placeholder', 'title', 'aria-label'];
  function apply(root = document) {
    const doc = root.ownerDocument || root;
    doc.documentElement.lang = lang;
    doc.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    if (lang === 'en') return;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      const raw = n.nodeValue, txt = raw.trim();
      if (!txt || !G.RADIAL_UI[txt]) return;
      n.nodeValue = raw.replace(txt, t(txt));
    });
    (root.querySelectorAll ? root.querySelectorAll('*') : []).forEach((e) => {
      ATTRS.forEach((a) => { const v = e.getAttribute(a); if (v && G.RADIAL_UI[v]) e.setAttribute(a, t(v)); });
    });
    if (doc.title && G.RADIAL_UI[doc.title]) doc.title = t(doc.title);
  }

  const ready = (async () => {
    try {
      const r = await chrome.storage.sync.get('lang');
      if (r.lang && LANGS.some(([c]) => c === r.lang)) lang = r.lang;
    } catch (_) { /* sem storage: inglês */ }
  })();
  try { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'sync' && ch.lang) lang = ch.lang.newValue || 'en'; }); } catch (_) { /* idem */ }

  G.RADIAL_I18N = {
    t, label, apply, ready, LANGS,
    get lang() { return lang; },
    setLang: (c) => chrome.storage.sync.set({ lang: c })
  };
})();
