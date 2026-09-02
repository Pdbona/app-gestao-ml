# APP_Gestao_ML

App de gestão para a **ML Serviços** — SBS Solution.

🔗 **No ar:** https://pdbona.github.io/app-gestao-ml/
📦 **Repositório:** https://github.com/Pdbona/app-gestao-ml

Cadastro dos clientes atendidos pela ML Serviços (ex: Belmicro, ML-Brasil Web,
Wepink e futuros) e, com o tempo, registro das demandas/atividades de cada um.
Cada cliente poderá futuramente ter um perfil de acesso próprio, restrito aos
seus próprios dados.

Stack: React (Create React App) + Firebase Firestore + GitHub Pages.
Estrutura e padrões seguem a skill `sbs-webapp` do workspace SBS Solution.

## Estado atual

- ✅ Login **só por senha** (sem digitar usuário — a senha sozinha identifica
  a conta e já leva pra tela que o perfil permite; por isso precisa ser
  única entre usuários ativos) + acesso de emergência **`130399`** (sempre
  disponível, mesmo com Firestore vazio — ver `src/components/GestaoML.jsx`)
- ✅ RBAC completo: perfis com permissões por aba/ação, e permissões
  personalizadas por usuário sobrepondo o perfil
- ✅ Layout: cabeçalho maior com a logo ML no canto esquerdo + navegação
  principal em árvore na sidebar esquerda (Dashboard, Cadastros com os
  sub-itens já expandidos abaixo)
- ✅ Aba **Dashboard** (default ao entrar — placeholder com contadores, os
  gráficos de operação entram quando definirmos o que precisa aparecer)
- ✅ Aba **Cadastros**, com 4 itens (Cliente/Perfil/Usuários soltos, Operação
  agrupando duas sub-telas):
  - **Cliente** — só Nome + Local (CEP → busca automática de
    logradouro/bairro/cidade/UF via ViaCEP, número manual, e captura de
    geolocalização real via GPS do navegador — o mesmo cliente pode ter
    vários locais/obras, cada um com sua própria geolocalização, já que o
    endereço do CEP sozinho não garante o ponto exato do serviço)
  - **Perfil** — perfil "Administrador" fixo + perfis personalizados, com
    matriz de permissões (abas + ações por seção de Cadastros)
  - **Usuários** — nome + senha alfanumérica única, vínculo a um perfil, e
    permissões customizadas opcionais por usuário
  - **Operação** (grupo, ver `src/components/cadastros/CadastrosScreen.jsx`)
    — mostrado lado a lado, sem vínculo entre os dois (o vínculo é feito na
    hora, na tela do Coletor):
    - **Tipo de Operação** — meta de tempo por tipo + motor de calibragem
      (sugere ajuste depois de 5 registros início/fim, depois a cada 10,
      tolerância de 10% — nunca aplica sozinho; ver `src/lib/calibragem.js`)
    - **Operação** (Recebimento/Expedição/Separação/Outros, card compacto)
      — qtd. de fotos obrigatórias no início e no fim de cada uma (0 = não
      obrigatório)
- ✅ Aba **Coletor** (`src/components/ColetorScreen.jsx`) — layout mobile-first
  (sidebar vira barra horizontal em telas ≤640px, campos grandes, um por
  linha). Pra iniciar uma operação, o Operador preenche, TODOS
  obrigatórios: Tipo de Operação, Operação/fluxo (Recebimento/Expedição/
  Separação/Outros), Documento do processo (NF/Conhecimento/Pedido), Qtd.
  de volumes, Qtd. de MdO, e as fotos de início exigidas pelo fluxo
  escolhido (0 = nenhuma) — o botão "Iniciar operação" só destrava quando
  tudo isso estiver completo. Fotos são tiradas na hora pela câmera
  (`capture="environment"`, sem opção de galeria), com preview local
  imediato. Enquanto ativa, mostra cronômetro ao vivo; pra finalizar exige
  as fotos de fim (conforme fluxo) + campo de observação opcional, grava
  data/hora do fim e calcula o tempo real pra calibragem. Só o mesmo
  usuário que iniciou enxerga a própria operação ativa pra finalizá-la.
  Perfil "exclusivo" de Coletor (só essa aba habilitada) já cai direto
  nessa tela ao logar, sem passar pelo Dashboard (`abaInicial()` em
  `src/lib/permissoes.js`). ⚠️ Fotos ainda não são enviadas/guardadas de
  verdade (falta configurar o Firebase Storage) — só a contagem/preview
  local é validada.
- ✅ **Projeto Firebase real criado e configurado** — `app-gestao-ml`
  (Firestore em `southamerica-east1`/São Paulo, regras publicadas, config
  real em `src/firebase.js`)
- ✅ **Identidade visual**: logo da ML Serviços em destaque no cabeçalho
  (login e app), logo da SBS Solution no rodapé como desenvolvedora —
  arquivos otimizados em `public/logos/` (originais em `SBS_Logos/`)
- ✅ **Repositório no GitHub criado e publicado** — `Pdbona/app-gestao-ml`,
  deploy automático via GitHub Actions → GitHub Pages a cada push na `main`
  (branch `gh-pages`, workflow em `.github/workflows/deploy.yml`)

## Rodar localmente

```bash
npm install
npm start
```

O Firebase já está configurado (`app-gestao-ml`), então salvar/listar dados
funciona normalmente com internet.

## Deploy

Todo push na branch `main` dispara o workflow `Deploy` (GitHub Actions), que
builda o app e publica no branch `gh-pages` — o GitHub Pages já está apontado
pra esse branch. Leva 2-4 minutos após o push pra ir ao ar em
https://pdbona.github.io/app-gestao-ml/.

**Nota (02/09/2026):** o primeiro deploy falhou com `exit code 128` porque o
`GITHUB_TOKEN` padrão de repositórios novos vem como somente leitura — corrigido
adicionando `permissions: contents: write` no topo do `deploy.yml`. Se algum
outro app SBS tiver o mesmo problema, a correção é a mesma.
