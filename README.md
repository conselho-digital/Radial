# Radial

Extensão Chrome (Manifest V3) com menu radial contextual no cursor.

## Instalar
1. Baixe/clone esta pasta.
2. Abra `chrome://extensions` e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta.
4. Defina o atalho em `chrome://extensions/shortcuts` (padrão: `Alt+Shift+R`).
5. Mova o mouse na página e use o atalho ou o gatilho do mouse (veja Uso).

## Uso
- Clicar no ícone da extensão lista as opções do radial **do site aberto** (sem digitar endereço) e permite adicionar: uma **ação pronta**, um **atalho de teclado gravado** (ex.: Alt+Shift+D) ou um **bookmarklet** criado na página de configurações. O radial abre no meio da página enquanto o popup está aberto, é refeito a cada mudança e some quando o popup fecha.
- Padrões: segurar o botão direito por 150 ms, "manter última opção" ligado, cancelar com o botão esquerdo. Gatilhos (página de configurações): segurar botão direito, botão do meio, botões laterais, tecla própria. O atalho do Chrome (`chrome://extensions/shortcuts`) continua disponível.
- **Soltar para ativar:** com um botão do mouse como gatilho, segure, arraste até a fatia e solte. Soltar no centro/fora deixa o menu aberto para clicar.
- **Manter última opção:** soltar ativa a última fatia em que o mouse passou (destacada); voltar ao centro desarma.
- **Botão para cancelar:** outro botão do mouse que fecha o radial sem ativar nada.
- **Tamanho** do radial ajustável (280–600 px).
- Centro do anel alterna **Site ⇄ Geral**. 50 sites reconhecidos (`sites.js`); qualquer outro site tem anel próprio por domínio, criado ao adicionar a primeira opção.

## Idiomas
Inglês (padrão), português, francês, italiano, alemão, árabe e bengali. Troque em Configurações → Language. As traduções ficam em `i18n-ui.js` (interface) e `i18n-labels.js` (ações dos sites).

## Opções do radial
Dois tipos, criados pelo popup ou pela página de configurações:
- **Atalho de teclado:** grave uma ou mais combinações; o radial as pressiona por você (só atalhos tratados pelo próprio site).
- **Bookmarklet com atalho:** na página de configurações, preencha nome, conteúdo e grave um atalho de teclado; ele roda em qualquer página. Opcionalmente também aparece no radial.
- **JavaScript:** código/bookmarklet, sem limite de 8 KB (guardado em `chrome.storage.local`, não sincroniza entre dispositivos). Bookmarklets antigos (`sync`) são migrados sozinhos.

## Bookmarklets padrão
O código fica em `defaults/<arquivo>.txt`, exatamente como enviado. `defaults/index.json` tem três partes: `bookmarklets` (`id`, `name`, `file`, `shortcut`), `remove` (ids a apagar, uma vez) e `presets` (por domínio: quais bookmarklets e ações prontas entram no radial, a ordem e quais opções padrão ficam escondidas). Tudo é aplicado uma vez na instalação/atualização; depois disso, o que o usuário mudar é respeitado.

## Status automático (Dynamics)
Nos sites da lista (padrão `isp.crm4.dynamics.com`, editável nas configurações): se o seu status é Do not disturb, a tela mostra Available; se o botão mostra Available, a extensão muda você para Do not disturb. **Shift + escolher Available** no menu dá o Available de verdade (vale nas outras páginas até você escolher outro status). Qualquer outro status aparece como é. O título "ISP - Customer Service" fica em negrito por 1 segundo quando o disfarce entra. Dá para desligar em Configurações → Automatic status.

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
