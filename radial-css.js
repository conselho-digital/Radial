// CSS do menu e dos avisos. Fica em JS para ser injetado dentro do Shadow DOM (isolado da página).
window.RADIAL_CSS = `
/* Menu radial: tema escuro com vidro (glassmorphism). Tudo com prefixo rdl- */

.rdl-backdrop {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  background: transparent;
  cursor: default;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

.rdl-menu {
  all: initial; /* isola de CSS da página (ex.: div { margin; padding }) */
  display: block;
  position: fixed;
  width: 380px;
  height: 380px;
  transform-origin: center;
  animation: rdl-in 160ms cubic-bezier(.2, .9, .3, 1.2) both;
}

.rdl-closing .rdl-menu { animation: rdl-out 120ms ease-in both; }

@keyframes rdl-in  { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
@keyframes rdl-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.85); } }

/* Disco desfocado atrás das fatias, com o buraco central recortado */
.rdl-disc {
  all: initial;
  display: block;
  position: absolute;
  left: 10px; top: 10px;
  width: 360px; height: 360px;
  border-radius: 50%;
  background: rgba(14, 16, 22, .35);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-mask: radial-gradient(circle, transparent 56px, #000 57px);
  mask: radial-gradient(circle, transparent 56px, #000 57px);
  box-shadow: 0 18px 50px rgba(0, 0, 0, .55);
}

.rdl-svg { all: initial; display: block; position: absolute; left: 0; top: 0; width: 380px; height: 380px; overflow: visible; }

.rdl-seg > path {
  fill: rgba(30, 33, 43, .78);
  stroke: rgba(255, 255, 255, .18);
  stroke-width: 1;
  transition: fill 90ms ease;
  cursor: pointer;
}
.rdl-seg:hover > path, .rdl-seg.rdl-armed > path { fill: rgba(59, 130, 246, .96); }

.rdl-label { pointer-events: none; }
.rdl-icon {
  fill: none;
  stroke: #e7e9ee;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.rdl-label text {
  fill: #e7e9ee;
  font: 500 11.5px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.rdl-seg:hover .rdl-label text, .rdl-seg.rdl-armed .rdl-label text { fill: #fff; font-weight: 700; }
.rdl-seg:hover .rdl-icon, .rdl-seg.rdl-armed .rdl-icon { stroke: #fff; }

.rdl-center circle {
  fill: #05060a;
  stroke: rgba(255, 255, 255, .22);
  stroke-width: 1;
}
.rdl-center text {
  fill: rgba(255, 255, 255, .5);
  font: 600 10px system-ui, sans-serif;
  letter-spacing: .04em;
  text-transform: uppercase;
  pointer-events: none;
}
.rdl-center-btn { cursor: pointer; }
.rdl-center-btn:hover circle { stroke: #3b82f6; }

/* Aviso rápido (toast) */
.rdl-toast {
  all: initial;
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 2147483647;
  padding: 10px 16px;
  border-radius: 12px;
  background: rgba(20, 22, 30, .88);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, .15);
  color: #fff;
  font: 500 13px system-ui, sans-serif;
  box-shadow: 0 8px 30px rgba(0, 0, 0, .4);
  transition: opacity 300ms;
}
.rdl-toast-error { border-color: rgba(248, 113, 113, .6); }
.rdl-toast-out { opacity: 0; }
`;
