// Armazenamento das opções do radial (compartilhado por background, popup e página de opções).
// Cada opção fica em chrome.storage.local como opt_<id> (sem o limite de ~8 KB por item do sync):
//   { type: 'js' | 'keys', name, code?, keys?: [{key, code, keyCode, ctrl, shift, alt, meta}], ctx: [ids de anéis], t }
// Anéis: id de um site de sites.js, 'general' ou 'host:<domínio>' (qualquer site fora da lista).
(() => {
  const G = globalThis;
  const PREFIX = 'opt_';

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  async function list() {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all)
      .filter((k) => k.startsWith(PREFIX))
      .map((k) => ({ id: k.slice(PREFIX.length), ...all[k] }))
      .sort((a, b) => (a.t || 0) - (b.t || 0));
  }

  async function get(id) {
    const k = PREFIX + id;
    return (await chrome.storage.local.get(k))[k] || null;
  }

  async function save(opt) {
    const { id, ...data } = opt;
    const realId = id || newId();
    await chrome.storage.local.set({ [PREFIX + realId]: { ...data, t: data.t || Date.now() } });
    return realId;
  }

  const remove = (id) => chrome.storage.local.remove(PREFIX + id);

  // Ordem escolhida pelo usuário para um anel: lista de chaves ('b:<site>:<rótulo>' padrão, 'o:<id>' opção).
  // Itens fora da lista (novos) ficam no fim, na ordem original.
  const ORDER = 'order_';
  async function getOrder(ring) {
    const k = ORDER + ring;
    return (await chrome.storage.local.get(k))[k] || [];
  }
  const setOrder = (ring, keys) => chrome.storage.local.set({ [ORDER + ring]: keys });
  function applyOrder(items, order) {
    if (!order || !order.length) return items;
    const pos = new Map(order.map((k, i) => [k, i]));
    const rank = (it, i) => (pos.has(it.key) ? pos.get(it.key) : 1e6 + i);
    return items.map((it, i) => ({ it, r: rank(it, i) })).sort((a, b) => a.r - b.r).map((x) => x.it);
  }

  // Versões antigas guardavam bookmarklets em chrome.storage.sync (bm_<n>, limite ~8 KB cada).
  // Move tudo para o armazenamento local; idempotente.
  async function migrate() {
    try {
      const old = await chrome.storage.sync.get(null);
      const keys = Object.keys(old).filter((k) => /^bm_\d+$/.test(k));
      for (const k of keys) {
        const b = old[k];
        if (b && b.code) {
          await chrome.storage.local.set({
            [PREFIX + 'm' + k.slice(3)]: { type: 'js', name: b.name || 'Bookmarklet', code: b.code, ctx: b.ctx || ['general'], t: Number(k.slice(3)) }
          });
        }
        await chrome.storage.sync.remove(k);
      }
    } catch (_) { /* sem sync: nada a migrar */ }
  }

  G.RADIAL_STORE = { list, get, save, remove, migrate, getOrder, setOrder, applyOrder };
})();
