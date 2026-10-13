// Popup da extensão: opções do radial para o site da aba atual.
const $ = (id) => document.getElementById(id);
const E = window.RADIAL_EDITOR;

let toastTimer;
function toast(text, isError) {
  const t = $('toast');
  t.textContent = text;
  t.className = 'show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 2000);
}

// Aba do site: a ativa; se o popup foi aberto como aba (teste), a última aba de site comum.
async function currentTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!active || !(active.url || '').startsWith(chrome.runtime.getURL(''))) return active;
  const tabs = await chrome.tabs.query({ currentWindow: true, url: ['http://*/*', 'https://*/*'] });
  return tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}

function iconButton(label, path, cls, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn icon ' + cls;
  b.title = b.ariaLabel = label;
  b.innerHTML = E.icon_(path);
  b.onclick = onclick;
  return b;
}

(async () => {
  $('openOpts').onclick = () => { chrome.runtime.openOptionsPage(); window.close(); };
  await window.RADIAL_STORE.migrate();

  const tab = await currentTab();
  let url = null;
  try { url = tab && new URL(tab.url); } catch (_) { /* url inválida */ }
  if (!url || !/^https?:$/.test(url.protocol)) {
    $('unsupported').classList.remove('hidden');
    $('main').classList.add('hidden');
    $('siteName').textContent = 'Radial';
    return;
  }

  const site = window.RADIAL_DETECT(url);
  const host = E.hostKey(url.hostname);
  const known = site.id !== 'general';
  const ringId = known ? site.id : 'host:' + host;
  $('siteName').textContent = known ? site.name : host;
  $('siteSub').textContent = known ? host : 'Site fora da lista · anel próprio';
  $('savedLead').textContent = known ? 'Aparecem no anel de ' + site.short + '.' : 'Este site ganha um anel só dele, ao lado do Geral.';

  async function renderList() {
    const items = (await window.RADIAL_STORE.list()).filter((o) => (o.ctx || []).includes(ringId));
    const ul = $('list');
    ul.textContent = '';
    $('savedCard').classList.toggle('hidden', !items.length);
    items.forEach((o) => {
      const li = document.createElement('li');
      li.className = 'item';
      const info = document.createElement('div');
      info.className = 'info';
      const head = document.createElement('div');
      head.className = 'item-head';
      const name = Object.assign(document.createElement('b'), { textContent: o.name || '(sem nome)' });
      const badge = Object.assign(document.createElement('span'), { className: 'badge', textContent: o.type === 'js' ? 'JS' : 'Teclas' });
      head.append(name, badge);
      const sub = document.createElement('div');
      sub.className = 'help';
      sub.style.marginTop = '2px';
      sub.textContent = o.type === 'js' ? (o.code || '').length + ' caracteres' : (o.keys || []).map(E.comboText).join(' › ');
      info.append(head, sub);
      const edit = iconButton('Editar ' + o.name, 'edit', '', () => editor.edit(o));
      const del = iconButton('Excluir ' + o.name, 'trash', 'danger', async () => {
        await window.RADIAL_STORE.remove(o.id);
        toast('Excluída.');
        renderList();
      });
      li.append(info, edit, del);
      ul.appendChild(li);
    });
  }

  const editor = E.mount($('editor'), { fixed: { id: ringId, name: $('siteName').textContent }, toast, onChange: renderList });
  renderList();

  $('openNow').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'open-radial-tab', tabId: tab.id });
    window.close();
  };
})();
