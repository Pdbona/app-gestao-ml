// ============================================================
// RBAC — schema de permissões, perfil fixo de bootstrap e helpers
// ============================================================
//
// Simplificado em 07/09/2026 (pedido do Pablo: "faça igual à tela de
// perfil do app da Superior") — modelo anterior tinha 2 camadas (`abas`
// de topo + `cadastros` com matriz Ver/Criar/Editar/Excluir por seção).
// Agora é um catálogo FLAT único: cada acesso é um único flag (tem ou não
// tem — sem granularidade de ação), igual ao padrão já usado no app de
// Gestão Operacional da Superior Transportes.
//
// `area: 'aba'` = aba de topo na sidebar (Dashboard, Planejamento...).
// `area: 'cadastro'` = seção dentro de "Cadastros" — a aba "Cadastros" em
// si nem existe mais como flag próprio: aparece sozinha na sidebar assim
// que pelo menos 1 seção de cadastro estiver marcada (ver
// `temAlgumCadastro` em GestaoML.jsx). `grupo` (só entre as de cadastro)
// continua agrupando Turno/Tipo de Operação/Operação sob "Operação" no
// 2º nível de navegação, como já era.
//
// `coletor` é especial: se for o ÚNICO acesso de `area: 'aba'` habilitado
// (perfil "exclusivo" de Coletor), o login já leva direto pra tela do
// Coletor em vez do Dashboard — ver `abaInicial()`.
//
// Um usuário tem um `perfilId` (perfil base, cadastrado em Cadastros →
// Perfis) e, opcionalmente, `permissoesCustom` — override PARCIAL do
// mesmo formato, só pra aquele usuário. `mergePermissoes` combina os dois.
// `submenuPai` (07/09/2026) marca os 2 acessos que vivem DENTRO do item
// "Planejamento" da sidebar (em vez de serem um botão de topo à parte) —
// "Novo Planejamento" é o lançamento de MdO já existente; "Ajuste de
// Registros" é a ferramenta nova do Gestor pra corrigir/fechar/cancelar
// registros do Coletor que o operador esqueceu ou fez errado (ver
// AjusteRegistrosScreen.jsx). Continuam `area: 'aba'` normalmente (contam
// pra `abaInicial()` e aparecem na lista de Acessos do Perfil, só a
// sidebar em si que os agrupa visualmente).
export const CATALOGO_ACESSOS = [
  { id: 'dashboard', label: 'Dashboard', icone: '📊', area: 'aba' },
  { id: 'planejamentoNovo', label: 'Novo Planejamento', icone: '🗓️', area: 'aba', submenuPai: 'planejamento' },
  { id: 'planejamentoAjuste', label: 'Ajuste de Registros', icone: '🛠️', area: 'aba', submenuPai: 'planejamento' },
  { id: 'relatorios', label: 'Relatórios', icone: '📈', area: 'aba' },
  { id: 'autorizacoes', label: 'Autorizações', icone: '🔔', area: 'aba' },
  { id: 'coletor', label: 'Coletor', icone: '📱', area: 'aba' },
  // Não é uma tela própria (por isso `area: 'capacidade'`, nem 'aba' nem
  // 'cadastro' — não aparece na sidebar nem em Cadastros) — é um modificador
  // do comportamento da tela Coletor pra quem já tem acesso a ela. Pedido do
  // Pablo (08/09/2026, pro Líder/Diretor): quem tiver esse acesso enxerga
  // TODAS as operações em andamento no Coletor (não só a própria), pode
  // iniciar mais de uma operação ao mesmo tempo (sem a trava de "1 ativa por
  // usuário") e pode finalizar qualquer uma, mesmo iniciada por outro
  // usuário. Ver `souSupervisor` em ColetorScreen.jsx.
  { id: 'coletorSupervisao', label: 'Supervisão do Coletor (todas as operações)', icone: '🦺', area: 'capacidade' },
  { id: 'clientes', label: 'Cliente', icone: '🏢', area: 'cadastro' },
  // Perfil e Usuários (09/09/2026, pedido do Pablo) viraram uma única tela
  // ("Usuários", grupo `usuarios`) em vez de 2 itens separados na sidebar —
  // mesmo tratamento lado a lado já usado no grupo "Operação" (ver
  // CadastrosScreen.jsx). Continuam 2 flags de RBAC independentes.
  { id: 'perfis', label: 'Perfil', icone: '🛡️', area: 'cadastro', grupo: 'usuarios' },
  { id: 'usuarios', label: 'Usuários', icone: '👤', area: 'cadastro', grupo: 'usuarios' },
  { id: 'colaboradores', label: 'Colaborador', icone: '🧑‍🔧', area: 'cadastro' },
  { id: 'turnos', label: 'Turno', icone: '🕐', area: 'cadastro', grupo: 'operacao' },
  { id: 'tiposOperacao', label: 'Tipo de Operação', icone: '⚙️', area: 'cadastro', grupo: 'operacao' },
  { id: 'fluxos', label: 'Operação', icone: '🔀', area: 'cadastro', grupo: 'operacao' }
];

export const GRUPOS_CADASTRO = {
  operacao: { label: 'Operação' },
  usuarios: { label: 'Usuários' }
};

// Mantido só como "view" filtrada do catálogo pra quem já lia
// SECOES_CADASTRO (CadastrosScreen.jsx, montarNavegacaoCadastros) — mesmo
// shape de antes (id/label/grupo), sem precisar mudar quem consome.
export const SECOES_CADASTRO = CATALOGO_ACESSOS.filter((a) => a.area === 'cadastro');

export function permissoesVazias() {
  const acessos = {};
  CATALOGO_ACESSOS.forEach((a) => {
    acessos[a.id] = false;
  });
  return { acessos };
}

export function permissoesTotais() {
  const acessos = {};
  CATALOGO_ACESSOS.forEach((a) => {
    acessos[a.id] = true;
  });
  return { acessos };
}

// Perfil "de fábrica": sempre existe, mesmo sem nenhum dado no Firestore
// ainda. Não pode ser excluído (mas pode servir de base — copie e ajuste
// pra criar outros perfis). É o que garante login mesmo num Firestore
// recém-criado, antes de qualquer perfil/usuário real ser cadastrado.
export const PERFIL_ADMIN_PADRAO = {
  id: 'admin',
  nome: 'Administrador',
  descricao: 'Acesso total ao sistema (perfil de sistema, não pode ser excluído).',
  sistema: true,
  linkProprio: false,
  permissoes: permissoesTotais()
};

// Combina o perfil base do usuário com as permissões customizadas dele
// (quando existirem). Overrides são parciais: só o que for definido em
// `overrides` substitui o valor do perfil base.
export function mergePermissoes(base, overrides) {
  const permBase = base || permissoesVazias();
  if (!overrides) return permBase;
  return { acessos: { ...permBase.acessos, ...(overrides.acessos || {}) } };
}

// Aba em que o usuário cai logo após o login. Se "coletor" for o ÚNICO
// acesso de topo habilitado (perfil exclusivo de coletor), vai direto pra
// lá — senão, segue o padrão de sempre: Dashboard.
export function abaInicial(permissoes) {
  const acessos = permissoes?.acessos || {};
  const outrasAbas = CATALOGO_ACESSOS.filter((a) => a.area === 'aba' && a.id !== 'coletor' && acessos[a.id]);
  if (acessos.coletor && outrasAbas.length === 0) return 'coletor';
  return 'dashboard';
}

// Monta a árvore de navegação de 1º nível de Cadastros a partir das seções
// visíveis pro usuário: seções soltas (sem `grupo`) viram um item; seções
// com o mesmo `grupo` (ex: Tipo de Operação + Operação + Turno) viram um
// único item de grupo. Compartilhado entre a sidebar (GestaoML) e a tela
// de Cadastros.
export function montarNavegacaoCadastros(permissoes) {
  const secoesVisiveis = SECOES_CADASTRO.filter((s) => permissoes?.acessos?.[s.id]);
  const nivel1 = [];
  const gruposVistos = new Set();

  secoesVisiveis.forEach((s) => {
    if (!s.grupo) {
      nivel1.push({ tipo: 'secao', id: s.id, label: s.label, secao: s });
      return;
    }
    if (gruposVistos.has(s.grupo)) return;
    gruposVistos.add(s.grupo);
    nivel1.push({
      tipo: 'grupo',
      id: s.grupo,
      label: GRUPOS_CADASTRO[s.grupo]?.label || s.grupo,
      secoes: secoesVisiveis.filter((x) => x.grupo === s.grupo)
    });
  });

  return nivel1;
}

// ======== Link de acesso próprio (07/09/2026) ========
// Um perfil pode marcar `linkProprio: true` e ganhar uma URL própria
// (`?acesso=<slug>`, ver AcessoProprioScreen.jsx) — quem entra por ela
// pula a porta padrão (senha única, sem nome) e em vez disso escolhe o
// PRÓPRIO nome (dentre os usuários daquele perfil) e digita a própria
// senha curta. Pensado pro futuro de clientes da ML (Belmicro, Wepink...)
// acessarem só as telas liberadas pro perfil deles, com um link só deles
// — ainda NÃO restringe os DADOS ao cliente (ex: Relatórios continua
// pedindo escolher o Cliente/Local normalmente), só o ACESSO por link
// próprio + a lista de telas.
function normalizarSlug(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Gera um slug único entre os perfis existentes (acrescenta -2, -3... em
// caso de colisão) — `idAtual` exclui o próprio perfil da checagem de
// colisão quando é uma edição (não um perfil novo).
export function slugUnico(nome, perfisExistentes, idAtual) {
  const base = normalizarSlug(nome) || 'perfil';
  const usados = new Set(perfisExistentes.filter((p) => p.id !== idAtual && p.slug).map((p) => p.slug));
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// Regra de senha pro login por Link de acesso próprio (4 a 6 caracteres
// alfanuméricos — mais permissiva que exigir só dígitos, já que aqui não
// tem PIN numérico nenhum, é "senha" mesmo). Perfis SEM link próprio
// continuam sem essa restrição (só exigem não-vazio, ver
// UsuariosCadastro.jsx).
export const REGEX_SENHA_LINK_PROPRIO = /^[A-Za-z0-9]{4,6}$/;
