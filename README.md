# APP_Gestao_ML

App de gestão para a **ML Serviços** — SBS Solution.

Cadastro dos clientes atendidos pela ML Serviços (ex: Belmicro, ML-Brasil Web,
Wepink e futuros) e, com o tempo, registro das demandas/atividades de cada um.
Cada cliente poderá futuramente ter um perfil de acesso próprio, restrito aos
seus próprios dados.

Stack: React (Create React App) + Firebase Firestore + GitHub Pages.
Estrutura e padrões seguem a skill `sbs-webapp` do workspace SBS Solution.

## Estado atual

- ✅ Login por usuário/senha (Firestore `usuarios`) + acesso de emergência
  **`admin` / `admin9999`** (sempre disponível, mesmo com Firestore vazio —
  ver `src/components/GestaoML.jsx`)
- ✅ RBAC completo: perfis com permissões por aba/ação, e permissões
  personalizadas por usuário sobrepondo o perfil
- ✅ Aba **Dashboard** (default ao entrar — placeholder com contadores, os
  gráficos de operação entram quando definirmos o que precisa aparecer)
- ✅ Aba **Cadastros**, com 5 sub-telas:
  - **Clientes** — cadastro completo (criar/editar/excluir)
  - **Perfis** — perfil "Administrador" fixo + perfis personalizados, com
    matriz de permissões (abas + ações por seção de Cadastros)
  - **Usuários** — nome/senha alfanumérica, vínculo a um perfil, e
    permissões customizadas opcionais por usuário
  - **Tipos de Operação** — meta de tempo por tipo + motor de calibragem
    (sugere ajuste depois de 5 registros início/fim, depois a cada 10,
    tolerância de 10% — nunca aplica sozinho; ver `src/lib/calibragem.js`)
  - **Fluxos** — Recebimento/Expedição/Separação/Outros, com qtd. de fotos
    obrigatórias no início e no fim de cada um
- ⏳ Falta a tela de **registro de operações** em si (abrir/fechar uma
  operação de um tipo, tirando as fotos exigidas pelo fluxo) — é o que
  alimenta a calibragem de metas; ainda não foi pedida/desenhada
- ✅ **Projeto Firebase real criado e configurado** — `app-gestao-ml`
  (Firestore em `southamerica-east1`/São Paulo, regras publicadas, config
  real em `src/firebase.js`)
- ✅ **Identidade visual**: logo da ML Serviços em destaque no cabeçalho
  (login e app), logo da SBS Solution no rodapé como desenvolvedora —
  arquivos otimizados em `public/logos/` (originais em `SBS_Logos/`)
- ⏳ Sem repositório GitHub ainda

## Rodar localmente

```bash
npm install
npm start
```

O Firebase já está configurado (`app-gestao-ml`), então salvar/listar dados
funciona normalmente com internet.

## Próximos passos — GitHub

### Criar o repositório no GitHub
1. Crie um repositório vazio (ex: `app-gestao-ml`) na sua conta GitHub.
2. Atualize o campo `"homepage"` em [`package.json`](package.json) trocando `SEU_USUARIO` pelo seu usuário do GitHub.
3. Suba este código (`git init`, `git add .`, `git commit`, `git remote add origin ...`, `git push`).
4. **Settings → Pages → Source: gh-pages branch** (o workflow em `.github/workflows/deploy.yml` já publica automaticamente a cada push na `main`).
5. Deploy leva 2-4 minutos após o push.

Me avise quando quiser seguir com isso que eu te guio tela por tela (posso
criar o repositório junto com você direto no seu GitHub, do mesmo jeito que
fiz com o Firebase).
