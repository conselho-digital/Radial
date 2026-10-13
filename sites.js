// Registro de sites e ferramentas contextuais do menu radial.
// É só DADOS: content.js interpreta os passos (veja runStep). Também é lido
// pela página de opções para listar os contextos dos bookmarklets.
//
// Passos disponíveis (o campo "do" de cada ação):
//   { url, fb }              navega (aceita {owner} {repo} {login} {proj}; fb = alternativa)
//   { k, c, s, a, to }       tecla (c = Ctrl/Cmd, s = Shift, a = Alt; to:'docs' = editores Google)
//   { click, text, last }    clica em seletor CSS ou por texto/aria-label (pt/en)
//   { focus } / { search }   foca um campo / a busca do site
//   { media, n }             play | full | mute | seek no <video>/<audio>
//   { menu, t, sub } / { pick }  menus do Google Docs/Sheets/Slides
//   { type }                 digita texto no campo ativo
//   { ctx }                  clique direito (menu de contexto) no seletor
//   { copy }                 copia texto (aceita tokens)
//   { fn:'dark' | 'copyUrl' }
//   { seq:[...] }            executa em ordem  |  { any:[...] } tenta até um funcionar
//   { wait: ms }
(() => {
  const G = globalThis;

  const hostIs = (h, ...ds) => ds.some((d) => h === d || h.endsWith('.' + d));

  // ---- construtores de passos ----
  const K = (k, o) => ({ k, ...o });
  const CL = (text, sel, o) => ({ click: sel || [], text: text || [], ...o });
  const U = (url, fb) => ({ url, fb });
  const SEQ = (...s) => ({ seq: s });
  const ANY = (...s) => ({ any: s });
  const W = (wait) => ({ wait });
  const SEARCH = { search: 1 };
  const A = (label, icon, step) => ({ label, icon, do: step });

  const DOCS = { to: 'docs' };
  const insertMenu = (t, sub) => ({ menu: 'docs-insert-menu', t, sub });

  const SITES = [
    // ---------------- Google Workspace ----------------
    { id: 'sheets', name: 'Google Planilhas', short: 'Planilhas',
      m: (h, p) => h === 'docs.google.com' && p.startsWith('/spreadsheets'),
      actions: [
        A('Copiar valor', 'copy', K('c', { c: 1, ...DOCS })),
        A('Colar como valor', 'paste', K('v', { c: 1, s: 1, ...DOCS })),
        A('AutoSoma', 'sigma', insertMenu(['sum', 'soma'], ['function', 'função', 'funcao'])),
        A('Inserir linha', 'rowPlus', insertMenu(['row above', 'linha acima', 'rows above', 'linhas acima'], ['rows', 'linhas'])),
        A('Inserir coluna', 'colPlus', insertMenu(['column left', 'coluna à esquerda', 'coluna a esquerda', 'columns left'], ['columns', 'colunas'])),
        A('Formatar como moeda', 'dollar', K('4', { c: 1, s: 1, ...DOCS }))
      ] },
    { id: 'docs', name: 'Google Docs', short: 'Docs',
      m: (h, p) => h === 'docs.google.com' && p.startsWith('/document'),
      actions: [
        A('Inserir tabela', 'table', insertMenu(['table', 'tabela'])),
        A('Inserir comentário', 'comment', K('m', { c: 1, a: 1, ...DOCS })),
        A('Aplicar negrito', 'bold', K('b', { c: 1, ...DOCS })),
        A('Aplicar itálico', 'italic', K('i', { c: 1, ...DOCS })),
        A('Destacar texto', 'highlight', SEQ(
          CL(null, ['#textBackgroundColorButton']), W(250),
          CL(null, ['[class*="colorpalette-cell"][aria-label="yellow" i]', '[class*="colorpalette-cell"][aria-label="amarelo" i]',
            '[class*="colorpalette-cell"][aria-label*="yellow" i]', '[class*="colorpalette-cell"][aria-label*="amarelo" i]'])))
      ] },
    { id: 'slides', name: 'Google Slides', short: 'Slides',
      m: (h, p) => h === 'docs.google.com' && p.startsWith('/presentation'),
      actions: [
        A('Novo slide', 'slideNew', K('m', { c: 1, ...DOCS })),
        A('Duplicar slide', 'copy', K('d', { c: 1, ...DOCS })),
        A('Inserir imagem', 'image', SEQ(insertMenu(['image', 'imagem']), W(250),
          { pick: ['upload from computer', 'fazer upload do computador', 'upload do computador'] })),
        A('Modo ecrã inteiro', 'fullscreen', ANY(CL(null, ['#punch-start-presentation-left']), K('F5', { c: 1, ...DOCS }))),
        A('Inserir forma', 'square', insertMenu(['shape', 'forma']))
      ] },
    { id: 'drive', name: 'Google Drive', short: 'Drive',
      m: (h) => h === 'drive.google.com',
      actions: [
        A('Novo arquivo/pasta', 'plus', CL(['new', 'novo'])),
        A('Baixar', 'download', CL(['download', 'baixar'])),
        A('Partilhar', 'share', CL(['share', 'compartilhar'])),
        A('Mover p/ lixeira', 'trash', ANY(CL(['move to trash', 'mover para a lixeira', 'mover para lixeira']), K('Delete'))),
        A('Renomear', 'edit', K('n'))
      ] },
    { id: 'gmail', name: 'Gmail', short: 'Gmail',
      m: (h) => h === 'mail.google.com',
      actions: [
        A('Escrever mensagem', 'edit', ANY(CL(['compose', 'escrever']), K('c'))),
        A('Responder a todos', 'replyAll', ANY(CL(['reply all', 'responder a todos']), K('a'))),
        A('Arquivar', 'archive', ANY(CL(['archive', 'arquivar']), K('e'))),
        A('Marcar como lido', 'check', ANY(CL(['mark as read', 'marcar como lida', 'marcar como lido']), K('I', { s: 1 }))),
        A('Adicionar estrela', 'star', ANY(CL(['not starred', 'não favoritado', 'star', 'estrela']), K('s')))
      ] },
    { id: 'calendar', name: 'Google Agenda', short: 'Agenda',
      m: (h) => h === 'calendar.google.com',
      actions: [
        A('Novo evento', 'calendar', U('/calendar/u/0/r/eventedit')),
        A('Ir para hoje', 'today', ANY(CL(['today', 'hoje']), K('t'))),
        A('Vista diária', 'calendar', U('/calendar/u/0/r/day')),
        A('Vista semanal', 'calendar', U('/calendar/u/0/r/week')),
        A('Criar tarefa', 'checkCircle', SEQ(CL(['create', 'criar']), W(300), CL(['task', 'tarefa'])))
      ] },
    { id: 'meet', name: 'Google Meet', short: 'Meet',
      m: (h) => h === 'meet.google.com',
      actions: [
        A('Mutar microfone', 'micOff', ANY(CL(['turn off microphone', 'turn on microphone', 'desativar o microfone', 'ativar o microfone']), K('d', { c: 1 }))),
        A('Câmera on/off', 'video', ANY(CL(['turn off camera', 'turn on camera', 'desativar a câmera', 'ativar a câmera']), K('e', { c: 1 }))),
        A('Levantar mão', 'hand', ANY(CL(['raise hand', 'levantar a mão']), K('h', { c: 1, a: 1 }))),
        A('Partilhar ecrã', 'screen', CL(['present now', 'apresentar agora', 'share screen', 'compartilhar tela'])),
        A('Sair da chamada', 'leave', CL(['leave call', 'sair da chamada']))
      ] },

    // ---------------- Microsoft ----------------
    { id: 'word', name: 'Word Online', short: 'Word',
      m: (h, p) => /^word[\w-]*\.officeapps\.live\.com$/.test(h) ||
        (hostIs(h, 'office.live.com', 'office.com', 'sharepoint.com') && /word|\.docx|doc\.aspx/i.test(p)),
      actions: [
        A('Negrito', 'bold', K('b', { c: 1 })),
        A('Itálico', 'italic', K('i', { c: 1 })),
        A('Inserir tabela', 'table', SEQ(CL(['insert', 'inserir']), W(300), CL(['table', 'tabela']))),
        A('Inserir comentário', 'comment', K('m', { c: 1, a: 1 })),
        A('Desfazer', 'undo', K('z', { c: 1 }))
      ] },
    { id: 'excel', name: 'Excel Online', short: 'Excel',
      m: (h, p) => /^(excel|ms-excel)[\w-]*\.officeapps\.live\.com$/.test(h) ||
        (hostIs(h, 'office.live.com', 'office.com', 'sharepoint.com') && /excel|\.xlsx|xlviewer/i.test(p)),
      actions: [
        A('Colar como valor', 'paste', K('v', { c: 1, s: 1 })),
        A('AutoSoma', 'sigma', K('=', { a: 1 })),
        A('Inserir linha', 'rowPlus', K('+', { c: 1, s: 1 })),
        A('Inserir coluna', 'colPlus', K('+', { c: 1, s: 1 })),
        A('Filtro', 'filter', K('l', { c: 1, s: 1 }))
      ] },
    { id: 'powerpoint', name: 'PowerPoint Online', short: 'PowerPoint',
      m: (h, p) => /^(powerpoint|ms-powerpoint)[\w-]*\.officeapps\.live\.com$/.test(h) ||
        (hostIs(h, 'office.live.com', 'office.com', 'sharepoint.com') && /powerpoint|\.pptx|ppt/i.test(p)),
      actions: [
        A('Novo slide', 'slideNew', ANY(CL(['new slide', 'novo slide']), K('m', { c: 1 }))),
        A('Duplicar slide', 'copy', CL(['duplicate slide', 'duplicar slide'])),
        A('Inserir imagem', 'image', SEQ(CL(['insert', 'inserir']), W(300), CL(['pictures', 'imagens', 'picture', 'imagem']))),
        A('Modo ecrã inteiro', 'fullscreen', ANY(CL(['slide show', 'apresentação de slides', 'present', 'apresentar']), K('F5'))),
        A('Inserir animação', 'sparkle', CL(['animations', 'animações']))
      ] },
    { id: 'onedrive', name: 'OneDrive', short: 'OneDrive',
      m: (h) => hostIs(h, 'onedrive.live.com', 'onedrive.com'),
      actions: [
        A('Baixar', 'download', CL(['download', 'baixar'])),
        A('Partilhar', 'share', CL(['share', 'compartilhar'])),
        A('Mover', 'folder', CL(['move to', 'mover para'])),
        A('Eliminar', 'trash', ANY(CL(['delete', 'excluir']), K('Delete'))),
        A('Renomear', 'edit', ANY(CL(['rename', 'renomear']), K('F2')))
      ] },
    { id: 'outlook', name: 'Outlook Web', short: 'Outlook',
      m: (h) => hostIs(h, 'outlook.office.com', 'outlook.live.com', 'outlook.office365.com'),
      actions: [
        A('Novo email', 'edit', ANY(CL(['new mail', 'new message', 'novo email', 'nova mensagem', 'novo e-mail']), K('n'))),
        A('Responder', 'reply', ANY(CL(['reply', 'responder']), K('r', { c: 1 }))),
        A('Arquivar', 'archive', ANY(CL(['archive', 'arquivar']), K('e'))),
        A('Marcar como lido', 'check', K('q', { c: 1 })),
        A('Eliminar', 'trash', ANY(CL(['delete', 'excluir']), K('Delete')))
      ] },
    { id: 'teams', name: 'Microsoft Teams', short: 'Teams',
      m: (h) => hostIs(h, 'teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft'),
      actions: [
        A('Mutar microfone', 'micOff', ANY(CL(null, ['#microphone-button', '[data-tid="toggle-mute"]', 'button[aria-label*="mic" i]', 'button[aria-label*="mute" i]']), K('m', { c: 1, s: 1 }))),
        A('Câmera on/off', 'video', ANY(CL(null, ['#video-button', '[data-tid="toggle-video"]', 'button[aria-label*="camera" i]', 'button[aria-label*="câmera" i]']), K('o', { c: 1, s: 1 }))),
        A('Levantar mão', 'hand', ANY(CL(null, ['#raisehands-button', 'button[aria-label*="raise" i]', 'button[aria-label*="levantar" i]']), K('k', { c: 1, s: 1 }))),
        A('Iniciar gravação', 'record', SEQ(CL(null, ['#callingButtons-showMoreBtn', 'button[aria-label*="more actions" i]', 'button[aria-label*="mais ações" i]']), W(350),
          CL(['start recording', 'iniciar gravação', 'record', 'gravar']))),
        A('Sair da reunião', 'leave', ANY(CL(null, ['#hangup-button', '[data-tid="hangup-main-btn"]', 'button[aria-label*="leave" i]', 'button[aria-label*="sair" i]']), K('h', { c: 1, s: 1 })))
      ] },

    // ---------------- Criação / IA ----------------
    { id: 'photopea', name: 'Photopea', short: 'Photopea',
      m: (h) => hostIs(h, 'photopea.com'),
      actions: [
        A('Desfazer', 'undo', K('z', { c: 1 })),
        A('Refazer', 'redo', K('z', { c: 1, s: 1 })),
        A('Nova camada', 'layers', K('n', { c: 1, s: 1 })),
        A('Recortar (Crop)', 'crop', K('c')),
        A('Exportar como PNG', 'download', SEQ(CL(['file', 'arquivo']), W(200), CL(['export as', 'exportar como']), W(200), CL(['png'])))
      ] },
    { id: 'chatgpt', name: 'ChatGPT', short: 'ChatGPT',
      m: (h) => hostIs(h, 'chatgpt.com', 'chat.openai.com'),
      actions: [
        A('Novo chat', 'newChat', ANY(CL(['new chat', 'novo chat']), K('o', { c: 1, s: 1 }))),
        A('Copiar última resposta', 'copy', ANY(CL(null, ['[data-testid="copy-turn-action-button"]'], { last: 1 }), K('c', { c: 1, s: 1 }))),
        A('Regenerar resposta', 'refresh', CL(['regenerate', 'try again', 'gerar novamente', 'tentar novamente'], [], { last: 1 })),
        A('Alternar tema escuro', 'moon', { fn: 'dark' }),
        A('Arquivar chat', 'archive', SEQ(CL(null, ['[data-testid="conversation-options-button"]', 'button[aria-label*="conversation options" i]', 'button[aria-label*="opções da conversa" i]']), W(300), CL(['archive', 'arquivar'])))
      ] },
    { id: 'claude', name: 'Claude', short: 'Claude',
      m: (h) => hostIs(h, 'claude.ai'),
      actions: [
        A('Novo chat', 'newChat', U('/new')),
        A('Copiar resposta', 'copy', CL(['copy', 'copiar'], ['[data-testid="action-bar-copy"]'], { last: 1 })),
        A('Limpar conversa', 'trash', U('/new')),
        A('Anexar ficheiro', 'paperclip', CL(null, ['input[type="file"]'])),
        A('Alternar tema', 'moon', { fn: 'dark' })
      ] },
    { id: 'gemini', name: 'Google Gemini', short: 'Gemini',
      m: (h) => hostIs(h, 'gemini.google.com'),
      actions: [
        A('Novo chat', 'newChat', ANY(CL(['new chat', 'nova conversa', 'novo chat']), U('/app'))),
        A('Copiar resposta', 'copy', CL(['copy', 'copiar'], [], { last: 1 })),
        A('Exportar para Docs', 'share', SEQ(CL(['share & export', 'compartilhar e exportar', 'share and export'], [], { last: 1 }), W(300), CL(['export to docs', 'exportar para o docs', 'exportar para docs']))),
        A('Partilhar', 'share', CL(['share', 'compartilhar'])),
        A('Limpar conversa', 'trash', U('/app'))
      ] },
    { id: 'perplexity', name: 'Perplexity AI', short: 'Perplexity',
      m: (h) => hostIs(h, 'perplexity.ai'),
      actions: [
        A('Nova pesquisa', 'newChat', U('/')),
        A('Copiar resposta', 'copy', CL(['copy', 'copiar'], [], { last: 1 })),
        A('Partilhar', 'share', CL(['share', 'compartilhar'])),
        A('Coleção', 'folder', U('/spaces')),
        A('Limpar chat', 'trash', U('/'))
      ] },
    { id: 'deepl', name: 'DeepL Translate', short: 'DeepL',
      m: (h) => hostIs(h, 'deepl.com'),
      actions: [
        A('Traduzir texto', 'translate', ANY({ focus: ['[data-testid="translator-source-input"]', 'd-textarea[dl-test="translator-source-input"]', 'textarea', '[contenteditable="true"]'] }, U('/translator'))),
        A('Copiar tradução', 'copy', CL(['copy', 'copiar'], ['[data-testid="translator-target-toolbar-copy"]', 'button[dl-test="translator-target-toolbar-copy"]'])),
        A('Limpar caixa', 'trash', CL(['clear', 'limpar'], ['[data-testid="translator-source-clear-button"]', 'button[dl-test="translator-source-clear-button"]'])),
        A('Trocar idiomas', 'swap', CL(['swap languages', 'trocar idiomas'], ['[data-testid="translator-swap-languages-button"]'])),
        A('Guardar', 'bookmark', CL(['save', 'salvar', 'favorite', 'favoritar']))
      ] },

    // ---------------- Produtividade / Dev ----------------
    { id: 'notion', name: 'Notion', short: 'Notion',
      m: (h) => hostIs(h, 'notion.so'),
      actions: [
        A('Nova página', 'plus', ANY(CL(['new page', 'nova página']), K('n', { c: 1, a: 1 }))),
        A('Duplicar bloco', 'copy', K('d', { c: 1 })),
        A('Inserir tabela', 'table', SEQ({ type: '/table' }, W(500), K('Enter'))),
        A('Alternar modo escuro', 'moon', K('l', { c: 1, s: 1 })),
        A('Pesquisa rápida', 'search', K('p', { c: 1 }))
      ] },
    { id: 'trello', name: 'Trello', short: 'Trello',
      m: (h) => hostIs(h, 'trello.com'),
      actions: [
        A('Novo cartão', 'plus', ANY(CL(['add a card', 'adicionar um cartão', 'add another card', 'adicionar outro cartão']), K('n'))),
        A('Mover cartão', 'move', K('m')),
        A('Adicionar etiqueta', 'tag', K('l')),
        A('Arquivar cartão', 'archive', K('c')),
        A('Pesquisar', 'search', SEARCH)
      ] },
    { id: 'asana', name: 'Asana', short: 'Asana',
      m: (h) => hostIs(h, 'asana.com'),
      actions: [
        A('Nova tarefa', 'plus', CL(['add task', 'adicionar tarefa', 'new task', 'nova tarefa'])),
        A('Marcar concluída', 'checkCircle', CL(['mark complete', 'marcar como concluída', 'marcar como concluido'])),
        A('Atribuir a mim', 'user', CL(['assign to me', 'atribuir a mim'])),
        A('Adicionar comentário', 'comment', { focus: ['div[aria-label*="comment" i][contenteditable]', 'div[aria-label*="comentário" i][contenteditable]', '[placeholder*="comment" i]'] }),
        A('Filtrar tarefas', 'filter', CL(['filter', 'filtrar']))
      ] },
    { id: 'jira', name: 'Jira', short: 'Jira',
      m: (h) => hostIs(h, 'atlassian.net'),
      actions: [
        A('Criar issue', 'plus', ANY(CL(['create', 'criar']), K('c'))),
        A('Atribuir a mim', 'user', ANY(CL(['assign to me', 'atribuir a mim']), K('i'))),
        A('Alterar estado', 'sort', ANY(CL(null, ['[data-testid*="status-field"] button', '[data-testid*="transition"] button']), K('.'))),
        A('Adicionar comentário', 'comment', ANY(CL(['add a comment', 'adicionar um comentário']), K('m'))),
        A('Pesquisar', 'search', SEARCH)
      ] },
    { id: 'github', name: 'GitHub', short: 'GitHub',
      m: (h) => hostIs(h, 'github.com'),
      actions: [
        A('Novo repositório', 'plus', U('/new')),
        A('Criar Pull Request', 'pr', U('/{owner}/{repo}/compare')),
        A('Ver issues', 'issue', U('/{owner}/{repo}/issues', '/issues')),
        A('Alternar tema', 'moon', U('/settings/appearance')),
        A('Ir para perfil', 'user', U('/{login}', '/settings/profile'))
      ] },
    { id: 'gitlab', name: 'GitLab', short: 'GitLab',
      m: (h) => hostIs(h, 'gitlab.com'),
      actions: [
        A('Novo projeto', 'plus', U('/projects/new')),
        A('Criar merge request', 'pr', U('{proj}/-/merge_requests/new', '/dashboard/merge_requests')),
        A('Ver issues', 'issue', U('{proj}/-/issues', '/dashboard/issues')),
        A('Copiar URL de clone', 'copy', { copy: 'https://gitlab.com{proj}.git' }),
        A('Alternar tema', 'moon', U('/-/profile/preferences'))
      ] },
    { id: 'stackoverflow', name: 'Stack Overflow', short: 'Stack Overflow',
      m: (h) => hostIs(h, 'stackoverflow.com'),
      actions: [
        A('Fazer pergunta', 'plus', U('/questions/ask')),
        A('Pesquisar', 'search', SEARCH),
        A('Votar positivo', 'thumb', CL(['up vote', 'voto positivo'], ['button.js-vote-up-btn', '[data-controller*="s-tooltip"][aria-label*="Up vote" i]'])),
        A('Salvar favorito', 'bookmark', CL(['save', 'salvar'], ['button.js-saves-btn'])),
        A('Ir para perfil', 'user', U('/users/current'))
      ] },
    { id: 'figma', name: 'Figma', short: 'Figma',
      m: (h) => hostIs(h, 'figma.com'),
      actions: [
        A('Ferramenta moldura', 'frame', K('f')),
        A('Ferramenta texto', 'text', K('t')),
        A('Criar componente', 'component', K('k', { c: 1, a: 1 })),
        A('Exportar', 'download', K('e', { c: 1, s: 1 })),
        A('Zoom 100%', 'zoom', K('0', { s: 1 }))
      ] },
    { id: 'canva', name: 'Canva', short: 'Canva',
      m: (h) => hostIs(h, 'canva.com'),
      actions: [
        A('Adicionar texto', 'text', K('t')),
        A('Adicionar forma', 'square', K('r')),
        A('Redimensionar', 'crop', CL(['resize', 'redimensionar'])),
        A('Descarregar', 'download', ANY(CL(['download', 'baixar']), SEQ(CL(['share', 'compartilhar']), W(300), CL(['download', 'baixar'])))),
        A('Partilhar', 'share', CL(['share', 'compartilhar']))
      ] },
    { id: 'miro', name: 'Miro', short: 'Miro',
      m: (h) => hostIs(h, 'miro.com'),
      actions: [
        A('Adicionar post-it', 'sticky', K('n')),
        A('Ferramenta caneta', 'pen', K('p')),
        A('Adicionar forma', 'square', K('s')),
        A('Ajustar ecrã', 'fullscreen', K('1', { s: 1 })),
        A('Comentar', 'comment', K('c'))
      ] },
    { id: 'excalidraw', name: 'Excalidraw', short: 'Excalidraw',
      m: (h) => hostIs(h, 'excalidraw.com'),
      actions: [
        A('Ferramenta retângulo', 'square', K('r')),
        A('Caneta', 'pen', K('p')),
        A('Texto', 'text', K('t')),
        A('Limpar tela', 'eraser', CL(['reset the canvas', 'limpar tela', 'redefinir a tela'], ['[data-testid="clear-canvas-button"]'])),
        A('Exportar imagem', 'image', K('e', { c: 1, s: 1 }))
      ] },
    { id: 'codepen', name: 'CodePen', short: 'CodePen',
      m: (h) => hostIs(h, 'codepen.io'),
      actions: [
        A('Executar código', 'play', ANY(CL(['run', 'executar']), K('Enter', { c: 1 }))),
        A('Guardar', 'save', K('s', { c: 1 })),
        A('Mudar layout', 'columns', CL(['change view', 'alterar visualização', 'layout'])),
        A('Ecrã inteiro', 'fullscreen', CL(['full page', 'tela inteira', 'fullscreen'])),
        A('Definições', 'settings', CL(['settings', 'configurações']))
      ] },
    { id: 'vercel', name: 'Vercel', short: 'Vercel',
      m: (h) => hostIs(h, 'vercel.com'),
      actions: [
        A('Novo projeto', 'plus', U('/new')),
        A('Ver deployments', 'rocket', U('/{owner}/{repo}/deployments', '/')),
        A('Definições', 'settings', U('/{owner}/{repo}/settings', '/account')),
        A('Registos (logs)', 'terminal', U('/{owner}/{repo}/logs', '/')),
        A('Partilhar', 'share', { fn: 'copyUrl' })
      ] },
    { id: 'todoist', name: 'Todoist', short: 'Todoist',
      m: (h) => hostIs(h, 'todoist.com'),
      actions: [
        A('Adicionar tarefa', 'plus', K('q')),
        A('Caixa de entrada', 'mail', SEQ(K('g'), K('i'))),
        A('Vista hoje', 'today', SEQ(K('g'), K('t'))),
        A('Próximos 7 dias', 'calendar', SEQ(K('g'), K('u'))),
        A('Pesquisar', 'search', SEARCH)
      ] },
    { id: 'airtable', name: 'Airtable', short: 'Airtable',
      m: (h) => hostIs(h, 'airtable.com'),
      actions: [
        A('Novo registo', 'plus', CL(['add record', 'adicionar registro', 'new record', 'novo registro'])),
        A('Adicionar campo', 'colPlus', CL(['add field', 'adicionar campo'], ['[aria-label*="Add field" i]'])),
        A('Filtrar', 'filter', CL(['filter', 'filtrar'])),
        A('Ordenar', 'sort', CL(['sort', 'ordenar'])),
        A('Exportar para CSV', 'download', CL(['download csv', 'baixar csv']))
      ] },
    { id: 'medium', name: 'Medium', short: 'Medium',
      m: (h) => hostIs(h, 'medium.com'),
      actions: [
        A('Nova história', 'edit', U('/new-story')),
        A('Guardar nos favoritos', 'bookmark', CL(['save', 'salvar', 'add to list'], ['[aria-label*="Add to list" i]', '[aria-label*="Save" i]'])),
        A('Partilhar', 'share', CL(['share', 'compartilhar'])),
        A('Seguir autor', 'user', CL(['follow', 'seguir'])),
        A('Pesquisar', 'search', SEARCH)
      ] },
    { id: 'substack', name: 'Substack', short: 'Substack',
      m: (h) => hostIs(h, 'substack.com'),
      actions: [
        A('Novo post', 'edit', U('/publish/post')),
        A('Ver assinantes', 'user', U('/publish/subscribers')),
        A('Comentários', 'comment', U('/publish/comments')),
        A('Estatísticas', 'stats', U('/publish/stats')),
        A('Definições', 'settings', U('/publish/settings'))
      ] },

    // ---------------- Comunicação / Social ----------------
    { id: 'whatsapp', name: 'WhatsApp Web', short: 'WhatsApp',
      m: (h) => hostIs(h, 'web.whatsapp.com'),
      actions: [
        A('Nova conversa', 'newChat', K('n', { c: 1, a: 1 })),
        A('Arquivar chat', 'archive', K('e', { c: 1, a: 1 })),
        A('Marcar como lido', 'check', K('u', { c: 1, a: 1, s: 1 })),
        A('Silenciar chat', 'volumeOff', K('m', { c: 1, a: 1, s: 1 })),
        A('Pesquisar', 'search', K('/', { c: 1, a: 1 }))
      ] },
    { id: 'telegram', name: 'Telegram Web', short: 'Telegram',
      m: (h) => hostIs(h, 'web.telegram.org'),
      actions: [
        A('Nova mensagem', 'edit', SEQ(CL(null, ['button.btn-menu-toggle', '.sidebar-tools-button']), W(250), CL(['new message', 'nova mensagem', 'new private chat', 'novo chat privado']))),
        A('Silenciar', 'volumeOff', SEQ({ ctx: ['.chatlist-chat.active', '.chatlist-chat'] }, W(250), CL(['mute', 'silenciar']))),
        A('Arquivar', 'archive', SEQ({ ctx: ['.chatlist-chat.active', '.chatlist-chat'] }, W(250), CL(['archive', 'arquivar']))),
        A('Pesquisar', 'search', SEARCH),
        A('Definições', 'settings', SEQ(CL(null, ['button.btn-menu-toggle', '.sidebar-tools-button']), W(250), CL(['settings', 'configurações'])))
      ] },
    { id: 'slack', name: 'Slack', short: 'Slack',
      m: (h) => hostIs(h, 'slack.com'),
      actions: [
        A('Nova mensagem', 'edit', ANY(CL(null, ['button[data-qa="composer_button"]', 'button[aria-label*="New message" i]', 'button[aria-label*="Nova mensagem" i]']), K('n', { c: 1 }))),
        A('Marcar tudo como lido', 'check', K('Escape', { s: 1 })),
        A('Salvar p/ mais tarde', 'bookmark', CL(['save for later', 'salvar para mais tarde'], ['[data-qa="save_message"]'])),
        A('Alternar canal', 'swap', K('k', { c: 1 })),
        A('Silenciar', 'volumeOff', SEQ({ focus: ['div.ql-editor[contenteditable="true"]', '[data-qa="message_input"] [contenteditable="true"]'] }, { type: '/mute ' }))
      ] },
    { id: 'discord', name: 'Discord', short: 'Discord',
      m: (h) => hostIs(h, 'discord.com'),
      actions: [
        A('Mutar microfone', 'micOff', ANY(CL(['mute', 'unmute', 'silenciar microfone', 'ativar microfone'], ['button[aria-label="Mute"]', 'button[aria-label="Unmute"]']), K('m', { c: 1, s: 1 }))),
        A('Desativar som', 'volumeOff', ANY(CL(null, ['button[aria-label="Deafen"]', 'button[aria-label="Undeafen"]']), K('d', { c: 1, s: 1 }))),
        A('Marcar canal lido', 'check', K('Escape')),
        A('Alternar servidor', 'swap', K('k', { c: 1 })),
        A('Definições', 'settings', CL(['user settings', 'configurações de usuário', 'configurações do usuário'], ['button[aria-label="User Settings"]']))
      ] },
    { id: 'x', name: 'X (Twitter)', short: 'X',
      m: (h) => hostIs(h, 'x.com', 'twitter.com'),
      actions: [
        A('Novo post', 'edit', ANY(CL(null, ['[data-testid="SideNav_NewTweet_Button"]']), K('n'))),
        A('Curtir', 'heart', ANY(CL(null, ['[data-testid="like"]']), K('l'))),
        A('Retweet', 'repeat', SEQ(ANY(CL(null, ['[data-testid="retweet"]']), K('t')), W(300), CL(null, ['[data-testid="retweetConfirm"]']))),
        A('Partilhar', 'share', CL(['share', 'compartilhar'], ['[aria-label="Share post"]', '[aria-label="Share"]'])),
        A('Pesquisar', 'search', { search: 1, sel: ['[data-testid="SearchBox_Search_Input"]'] })
      ] },
    { id: 'linkedin', name: 'LinkedIn', short: 'LinkedIn',
      m: (h) => hostIs(h, 'linkedin.com'),
      actions: [
        A('Criar publicação', 'edit', CL(['start a post', 'começar publicação', 'iniciar publicação', 'create a post'])),
        A('Ver mensagens', 'mail', U('/messaging/')),
        A('Notificações', 'bell', U('/notifications/')),
        A('Perfil', 'user', U('/in/me/')),
        A('Pesquisar vagas', 'search', U('/jobs/search/'))
      ] },
    { id: 'reddit', name: 'Reddit', short: 'Reddit',
      m: (h) => hostIs(h, 'reddit.com'),
      actions: [
        A('Criar post', 'edit', U('/submit')),
        A('Votar para cima', 'thumb', CL(['upvote', 'votar positivamente', 'votar para cima'], ['button[aria-label*="upvote" i]', 'button.upvote'])),
        A('Salvar', 'bookmark', CL(['save', 'salvar'])),
        A('Partilhar', 'share', CL(['share', 'compartilhar'])),
        A('Pesquisar', 'search', { search: 1, sel: ['input[name="q"]', 'faceplate-search-input input'] })
      ] },
    { id: 'instagram', name: 'Instagram', short: 'Instagram',
      m: (h) => hostIs(h, 'instagram.com'),
      actions: [
        A('Criar publicação', 'plus', CL(['new post', 'create', 'nova publicação', 'criar'])),
        A('Ver directs', 'mail', U('/direct/inbox/')),
        A('Notificações', 'bell', CL(['notifications', 'notificações'])),
        A('Explorar', 'search', U('/explore/')),
        A('Perfil', 'user', CL(['profile', 'perfil']))
      ] },

    // ---------------- Compras ----------------
    { id: 'amazon', name: 'Amazon Brasil', short: 'Amazon',
      m: (h) => hostIs(h, 'amazon.com.br'),
      actions: [
        A('Ver carrinho', 'cart', U('/gp/cart/view.html')),
        A('Lista de desejos', 'heart', U('/hz/wishlist/ls')),
        A('Encomendas', 'package', U('/gp/css/order-history')),
        A('Pesquisar', 'search', { search: 1, sel: ['#twotabsearchtextbox'] }),
        A('Ajuda', 'help', U('/gp/help/customer/display.html'))
      ] },
    { id: 'mercadolivre', name: 'Mercado Livre', short: 'M. Livre',
      m: (h) => hostIs(h, 'mercadolivre.com.br'),
      actions: [
        A('Ver carrinho', 'cart', U('https://www.mercadolivre.com.br/carrinho')),
        A('Compras', 'package', U('https://myaccount.mercadolivre.com.br/my_purchases/list')),
        A('Favoritos', 'heart', U('https://myaccount.mercadolivre.com.br/bookmarks/list')),
        A('Notificações', 'bell', ANY(CL(['notifications', 'notificações']), U('https://myaccount.mercadolivre.com.br/notifications'))),
        A('Ajuda', 'help', U('https://www.mercadolivre.com.br/ajuda'))
      ] },

    // ---------------- Vídeo / Música ----------------
    { id: 'youtube', name: 'YouTube', short: 'YouTube',
      m: (h) => hostIs(h, 'youtube.com'),
      actions: [
        A('Reproduzir/Pausar', 'playPause', { media: 'play' }),
        A('Ecrã inteiro', 'fullscreen', { media: 'full' }),
        A('Silenciar', 'volumeOff', { media: 'mute' }),
        A('Avançar 10s', 'fwd', { media: 'seek', n: 10 }),
        A('Retroceder 10s', 'back', { media: 'seek', n: -10 })
      ] },
    { id: 'spotify', name: 'Spotify Web', short: 'Spotify',
      m: (h) => hostIs(h, 'open.spotify.com'),
      actions: [
        A('Tocar/Pausar', 'playPause', CL(['play', 'pause', 'reproduzir', 'pausar'], ['[data-testid="control-button-playpause"]'])),
        A('Próxima música', 'next', CL(['next', 'próxima'], ['[data-testid="control-button-skip-forward"]'])),
        A('Música anterior', 'prev', CL(['previous', 'anterior'], ['[data-testid="control-button-skip-back"]'])),
        A('Modo aleatório', 'shuffle', CL(['shuffle', 'aleatório'], ['[data-testid="control-button-shuffle"]'])),
        A('Repetir', 'repeat', CL(['repeat', 'repetir'], ['[data-testid="control-button-repeat"]']))
      ] },
    { id: 'netflix', name: 'Netflix', short: 'Netflix',
      m: (h) => hostIs(h, 'netflix.com'),
      actions: [
        A('Tocar/Pausar', 'playPause', ANY({ media: 'play' }, K(' '))),
        A('Ecrã inteiro', 'fullscreen', K('f')),
        A('Avançar 10s', 'fwd', K('ArrowRight')),
        A('Retroceder 10s', 'back', K('ArrowLeft')),
        A('Legendas on/off', 'subtitles', ANY(CL(null, ['[data-uia="control-audio-subtitle"]']), K('s')))
      ] },
    { id: 'twitch', name: 'Twitch', short: 'Twitch',
      m: (h) => hostIs(h, 'twitch.tv'),
      actions: [
        A('Tocar/Pausar', 'playPause', { media: 'play' }),
        A('Ecrã inteiro', 'fullscreen', ANY(CL(null, ['[data-a-target="player-fullscreen-button"]']), { media: 'full' })),
        A('Silenciar', 'volumeOff', { media: 'mute' }),
        A('Seguir canal', 'heart', CL(['follow', 'seguir'], ['[data-a-target="follow-button"]'])),
        A('Modo teatro', 'screen', K('t', { a: 1 }))
      ] }
  ];

  // Anel "Geral" (qualquer site). Mantido aqui para ficar junto do restante.
  const GENERAL = {
    id: 'general', name: 'Geral', short: 'Geral',
    actions: [
      A('Recarregar', 'refresh', { fn: 'reload' }),
      A('Copiar URL', 'link', { fn: 'copyUrl' }),
      A('Topo', 'top', { fn: 'top' }),
      A('Modo escuro', 'moon', { fn: 'dark' })
    ]
  };

  // Encontra o site pelo endereço atual (primeiro que casar).
  G.RADIAL_DETECT = (loc) => {
    const h = loc.hostname.toLowerCase();
    return SITES.find((s) => s.m(h, loc.pathname, loc.href)) || GENERAL;
  };
  G.RADIAL_SITES = [GENERAL, ...SITES];
})();
