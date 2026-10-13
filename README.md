# Radial

Extensão Chrome (Manifest V3) com menu radial contextual no cursor.

## Instalar
1. Baixe/clone esta pasta.
2. Abra `chrome://extensions` e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta.
4. Defina o atalho em `chrome://extensions/shortcuts` (padrão: `Alt+Shift+R`).
5. Mova o mouse na página e use o atalho ou o gatilho do mouse (veja Uso).

## Uso
- Clicar no ícone da extensão abre as opções **do site atual** (adicionar/editar/excluir opções do radial, com botão Salvar) e o botão "Abrir radial agora".
- Gatilhos (página de configurações): segurar botão direito, botão do meio, botões laterais, tecla própria. O atalho do Chrome (`chrome://extensions/shortcuts`) continua disponível.
- **Soltar para ativar:** com um botão do mouse como gatilho, segure, arraste até a fatia e solte. Soltar no centro/fora deixa o menu aberto para clicar.
- **Manter última opção:** soltar ativa a última fatia em que o mouse passou (destacada); voltar ao centro desarma.
- **Botão para cancelar:** outro botão do mouse que fecha o radial sem ativar nada.
- **Tamanho** do radial ajustável (280–600 px).
- Centro do anel alterna **Site ⇄ Geral**. 50 sites reconhecidos (`sites.js`); qualquer outro site tem anel próprio por domínio, criado ao adicionar a primeira opção.

## Opções do radial
Dois tipos, criados pelo popup ou pela página de configurações:
- **Atalho de teclado:** grave uma ou mais combinações; o radial as pressiona por você (só atalhos tratados pelo próprio site).
- **JavaScript:** código/bookmarklet, sem limite de 8 KB (guardado em `chrome.storage.local`, não sincroniza entre dispositivos). Bookmarklets antigos (`sync`) são migrados sozinhos.

## Segurança
- Menu e avisos ficam em Shadow DOM; a página não consegue estilizá-los.
- Só eventos reais (`isTrusted`) abrem o menu ou escolhem uma fatia.
- Opções JavaScript: o código é lido pelo background (nunca passa pelo content script) e só roda por pedido da própria extensão.

## Limitações
- Ações de Planilhas/Docs/Teams dependem da interface dos sites (best effort).
- Opções JavaScript podem ser bloqueadas por CSP estrito da página.
- Só o frame principal; o atalho é o do Chrome (não é "segurar botão direito").

## Adicionar/editar um site
Tudo fica em `sites.js` (só dados). Cada ação é um passo: `url`, tecla (`k`), clique por seletor/texto (`click`),
`media`, etc. A lista de sites da página de opções (contextos dos bookmarklets) sai do mesmo arquivo.
