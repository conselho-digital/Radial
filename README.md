# Radial

Extensão Chrome (Manifest V3) com menu radial contextual no cursor.

## Instalar
1. Baixe/clone esta pasta.
2. Abra `chrome://extensions` e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta.
4. Defina o atalho em `chrome://extensions/shortcuts` (padrão: `Alt+Shift+R`).
5. Mova o mouse na página e use o atalho (ou clique no ícone da extensão).

## Uso
- Clique numa fatia para executar. `Esc` ou clique fora fecha.
- Centro do anel alterna **Contexto ⇄ Geral**.
- Contextos: Geral, Google Planilhas, Google Docs, Teams (web).

## Bookmarklets
Abra as opções da extensão, cadastre índice (1–64), nome, código e os anéis
onde o botão aparece. Salvos em `chrome.storage.sync` como `bm_<índice>`.

## Limitações
- Ações de Planilhas/Docs/Teams dependem da interface dos sites (best effort).
- Bookmarklets podem ser bloqueados por CSP estrito da página.
- Só o frame principal; o atalho é o do Chrome (não é "segurar botão direito").
