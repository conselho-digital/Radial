// Aplica o tema salvo antes de a página desenhar (evita "piscar" claro→escuro).
// Fica em arquivo separado porque páginas de extensão não aceitam script inline.
try {
  const t = localStorage.getItem('radial-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (_) { /* sem localStorage: segue o tema do sistema */ }
