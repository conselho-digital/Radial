# Radial

Extensão Chrome (Manifest V3) com menu radial contextual no cursor.

## Instalar
1. Baixe/clone esta pasta.
2. Abra `chrome://extensions` e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta.
4. Defina o atalho em `chrome://extensions/shortcuts` (padrão: `Alt+Shift+R`).
5. Mova o mouse na página e use o atalho (ou clique no ícone da extensão).

## Uso
- Gatilhos (página de opções): segurar botão direito (solte sobre a fatia para escolher), botão do meio, botões laterais, tecla própria. O atalho do Chrome (`chrome://extensions/shortcuts`) continua disponível.
- Clique numa fatia para executar. `Esc` ou clique fora fecha.
- Centro do anel alterna **Contexto ⇄ Geral**.
- 50 sites reconhecidos, cada um com suas ferramentas (veja `sites.js`). Qualquer outro site usa o anel Geral.

## Bookmarklets
Abra as opções da extensão, cadastre índice (1–64), nome, código e os anéis
onde o botão aparece. Salvos em `chrome.storage.sync` como `bm_<índice>`.

## Segurança
- Menu e avisos ficam em Shadow DOM; a página não consegue estilizá-los.
- Só eventos reais (`isTrusted`) abrem o menu ou escolhem uma fatia.
- Bookmarklets: o código é lido pelo background (nunca passa pelo content script) e só roda por pedido da própria extensão.

## Limitações
- Ações de Planilhas/Docs/Teams dependem da interface dos sites (best effort).
- Bookmarklets podem ser bloqueados por CSP estrito da página.
- Só o frame principal; o atalho é o do Chrome (não é "segurar botão direito").

## Adicionar/editar um site
Tudo fica em `sites.js` (só dados). Cada ação é um passo: `url`, tecla (`k`), clique por seletor/texto (`click`),
`media`, etc. A lista de sites da página de opções (contextos dos bookmarklets) sai do mesmo arquivo.
