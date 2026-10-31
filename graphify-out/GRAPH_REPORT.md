# Graph Report - Radial  (2026-10-31)

## Corpus Check
- 19 files · ~59,402 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 2 file(s) not represented in the graph (top: (none) 1, .css 1)

## Summary
- 492 nodes · 1660 edges · 25 communities (17 shown, 8 thin omitted)
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 247 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f063168c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- templates.js
- I
- content.js
- make_xlsx_lib
- ma
- manifest.json
- Do
- fo
- jr
- ao
- options.js
- Radial
- popup.js
- background.js
- mount
- contacts.js
- no
- i18n.js
- hn

## God Nodes (most connected - your core abstractions)
1. `make_xlsx_lib()` - 244 edges
2. `I()` - 49 edges
3. `o()` - 47 edges
4. `E()` - 41 edges
5. `A()` - 38 edges
6. `c()` - 36 edges
7. `ho()` - 32 edges
8. `s()` - 30 edges
9. `T()` - 30 edges
10. `ao()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Adicionar/editar um site` --references--> `click()`  [INFERRED]
  README.md → sicharge.js

## Import Cycles
- None detected.

## Communities (25 total, 8 thin omitted)

### Community 0 - "templates.js"
Cohesion: 0.07
Nodes (72): addDeviceToAsset(), addRecipient(), addToQueue(), apply(), applyTemplate(), askButtons(), askCountry(), askDescription() (+64 more)

### Community 1 - "I"
Cohesion: 0.15
Nodes (72): A(), aa(), ae(), b(), Be(), br(), c(), ca() (+64 more)

### Community 2 - "content.js"
Cohesion: 0.10
Nodes (43): applyFakeLook(), build(), buildRing(), chooseMenu(), clickLike(), close(), copyText(), detectSite() (+35 more)

### Community 3 - "make_xlsx_lib"
Cohesion: 0.07
Nodes (34): make_xlsx_lib(), bi(), ci(), Cn(), cs(), dc(), et(), gc() (+26 more)

### Community 4 - "ma"
Cohesion: 0.12
Nodes (30): ba(), bs(), cc(), Ea(), el(), es(), fa(), fc() (+22 more)

### Community 5 - "manifest.json"
Cohesion: 0.08
Nodes (24): action, default_popup, default_title, background, service_worker, commands, open-radial, content_scripts (+16 more)

### Community 6 - "Do"
Cohesion: 0.19
Nodes (25): bn(), bt(), dl(), Dn(), Do(), Fi(), Fn(), gl() (+17 more)

### Community 7 - "fo"
Cohesion: 0.12
Nodes (25): bo(), ec(), Eo(), fl(), fo(), Fs(), gr(), ic() (+17 more)

### Community 8 - "jr"
Cohesion: 0.16
Nodes (23): Ai(), al(), as(), at(), cl(), di(), ds(), Ei() (+15 more)

### Community 9 - "ao"
Cohesion: 0.17
Nodes (20): ao(), ar(), Bl(), co(), Cr(), Dr(), En(), er() (+12 more)

### Community 10 - "options.js"
Cohesion: 0.20
Nodes (17): applyTheme(), cfg, CTX_NAMES, DEFAULTS, ICON, iconButton(), initTheme(), keyText() (+9 more)

### Community 11 - "Radial"
Cohesion: 0.13
Nodes (13): Adicionar/editar um site, Bookmarklets padrão, Idiomas, Instalar, Limitações, Opções do radial, Radial, Segurança (+5 more)

### Community 12 - "popup.js"
Cohesion: 0.30
Nodes (10): customRow(), fillBookmarklets(), iconButton(), openAdd(), renderList(), renderRing(), row(), showKind() (+2 more)

### Community 13 - "background.js"
Cohesion: 0.23
Nodes (10): cleanWords(), CONTENT_FILES, normalizeBookmarklet(), onStart(), OPEN_MSG, runBookmarklet(), runWithDebugger(), saveBookmarkletData() (+2 more)

### Community 14 - "mount"
Cohesion: 0.36
Nodes (10): comboText(), mount(), addCombo(), edit(), renderKeys(), renderShortcut(), reset(), setCtx() (+2 more)

### Community 15 - "contacts.js"
Cohesion: 0.46
Nodes (7): download(), downloadUrl(), find(), match(), namesFor(), parse(), refresh()

### Community 17 - "no"
Cohesion: 0.29
Nodes (7): no(), Pr(), ql(), qr(), rs(), Ul(), Zn()

## Knowledge Gaps
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `make_xlsx_lib()` connect `make_xlsx_lib` to `I`, `ma`, `Do`, `fo`, `jr`, `ao`, `no`, `hn`?**
  _High betweenness centrality (0.222) - this node is a cross-community bridge._
- **Are the 36 inferred relationships involving `make_xlsx_lib()` (e.g. with `aa()` and `bc()`) actually correct?**
  _`make_xlsx_lib()` has 36 INFERRED edges - model-reasoned connections that need verification._
- **Should `templates.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06937799043062201 - nodes in this community are weakly interconnected._
- **Why does `c()` connect `I` to `make_xlsx_lib`, `ma`, `Do`, `ao`, `background.js`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 23 inferred relationships involving `I()` (e.g. with `b()` and `bo()`) actually correct?**
  _`I()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Should `content.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10359408033826638 - nodes in this community are weakly interconnected._
- **Why does `I()` connect `I` to `make_xlsx_lib`, `ma`, `Do`, `fo`, `jr`, `ao`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._