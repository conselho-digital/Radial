// Lista de contatos dos RCs: lê a planilha (Excel ou CSV) de um link restrito à empresa (OneDrive/SharePoint ou
// Google Sheets), guarda as linhas no navegador (chrome.storage.local) e procura os contatos de um país.
// O link vem das configurações de cada pessoa; nada disso fica no código.
(() => {
  const RC_URL_KEY = 'rc_url', RC_DATA_KEY = 'rc_contacts', STALE_MS = 6 * 60 * 60 * 1000;
  const clean = (s) => String(s == null ? '' : s).replace(/[ ﻿]/g, ' ').trim();
  const norm = (s) => clean(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  // Endereço de download: OneDrive/SharePoint ganha ?download=1; Google Sheets vira CSV.
  function downloadUrl(link) {
    const u = clean(link);
    const g = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)/.exec(u);
    if (g) return 'https://docs.google.com/spreadsheets/d/' + g[1] + '/export?format=csv';
    if (/[?&]download=1\b/.test(u)) return u;
    return u + (u.includes('?') ? '&' : '?') + 'download=1';
  }

  // Lê o arquivo baixado. Devolve [{name,email,country,description,comment}].
  function parse(buf) {
    const b = new Uint8Array(buf);
    const isZip = b[0] === 0x50 && b[1] === 0x4b;
    const head = new TextDecoder().decode(b.slice(0, 200)).trimStart().toLowerCase();
    if (!isZip && (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<?xml'))) {
      throw new Error('The link returned a web page, not the file. Sign in to your company account in this browser and check the sharing.');
    }
    const wb = XLSX.read(b, { type: 'array' });
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
      for (let h = 0; h < Math.min(rows.length, 15); h++) {
        const head = rows[h].map(norm);
        const col = (re) => head.findIndex((x) => re.test(x));
        const iMail = col(/^e ?mail/), iCountry = col(/^country/);
        if (iMail < 0 || iCountry < 0) continue;
        const iName = col(/^(full )?name/), iDesc = col(/^description/), iCom = col(/^comments?/);
        const out = [];
        for (const r of rows.slice(h + 1)) {
          const mails = clean(r[iMail]).split(/[;,\s]+/).filter((m) => /@/.test(m));
          if (!mails.length || !clean(r[iCountry])) continue;
          mails.forEach((email) => out.push({
            name: iName >= 0 ? clean(r[iName]) : '', email, country: clean(r[iCountry]),
            description: iDesc >= 0 ? clean(r[iDesc]) : '', comment: iCom >= 0 ? clean(r[iCom]) : '',
          }));
        }
        return out;
      }
    }
    throw new Error('Columns not found. The first sheet needs: Full Name, Email, Country, Description, Comment.');
  }

  async function download(link) {
    const res = await fetch(downloadUrl(link), { credentials: 'include', redirect: 'follow', cache: 'no-store' });
    if (!res.ok) throw new Error('Could not open the link (HTTP ' + res.status + '). Check the sharing and your sign-in.');
    return parse(await res.arrayBuffer());
  }

  // Baixa de novo e guarda. Usado pelo "Validate" e pela atualização automática.
  async function refresh() {
    const link = clean((await chrome.storage.local.get(RC_URL_KEY))[RC_URL_KEY]);
    if (!link) throw new Error('No link set. Paste the Excel link in the settings.');
    const rows = await download(link);
    await chrome.storage.local.set({ [RC_DATA_KEY]: { rows, t: Date.now() } });
    return rows;
  }

  // Nomes de um país (a partir do código de 2 letras) aceitos na coluna Country.
  const ALIASES = {
    GB: ['united kingdom', 'uk', 'great britain', 'england'], US: ['united states', 'usa', 'united states of america'],
    CZ: ['czechia', 'czech republic'], TR: ['turkey', 'turkiye'], NL: ['netherlands', 'the netherlands', 'holland'],
    KR: ['south korea', 'korea', 'republic of korea'], RU: ['russia', 'russian federation'], AE: ['uae', 'united arab emirates'],
    CN: ['china', 'prc'], TW: ['taiwan'], VN: ['vietnam', 'viet nam'], MK: ['north macedonia', 'macedonia'],
  };
  function namesFor(code) {
    const set = new Set([code.toLowerCase()]);
    try { set.add(norm(new Intl.DisplayNames(['en'], { type: 'region' }).of(code))); } catch (_) { /* sem Intl */ }
    (ALIASES[code] || []).forEach((a) => set.add(norm(a)));
    return set;
  }
  function match(rows, code) {
    const names = namesFor(String(code).toUpperCase());
    return rows.filter((r) => names.has(norm(r.country)) || String(r.country).split(/[,;/&|\n]|\band\b/i).some((p) => names.has(norm(p))));
  }

  // Contatos de um país: usa a lista guardada e a atualiza se estiver velha (ou ausente).
  async function find(code) {
    let data = (await chrome.storage.local.get(RC_DATA_KEY))[RC_DATA_KEY];
    let note = '';
    if (!data || Date.now() - data.t > STALE_MS) {
      try { data = { rows: await refresh(), t: Date.now() }; } catch (e) { if (!data) throw e; note = e.message; }
    }
    return { rows: match(data.rows, code), total: data.rows.length, note };
  }

  globalThis.RCContacts = { refresh, find, match, parse, downloadUrl, RC_URL_KEY, RC_DATA_KEY };
})();
