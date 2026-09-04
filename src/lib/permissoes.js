// ============================================================
// RBAC — schema de permissões, perfil fixo de bootstrap e helpers
// ============================================================
//
// Toda permissão é organizada em duas camadas:
//   1. `abas`        — quais telas de topo o usuário vê (dashboard, cadastros,
//      coletor)
//   2. `cadastros`   — dentro de Cadastros, o que cada seção permite
//      (visualizar/criar/editar/deletar)
//
// `abas.coletor` é especial: se for a ÚNICA aba habilitada pro usuário
// (perfil "exclusivo" de Coletor), o login já leva direto pra tela do
// Coletor em vez do Dashboard — ver `abaInicial()` em GestaoML.jsx.
//
// Um usuário tem um `perfilId` (perfil base, cadastrado em Cadastros →
// Perfis) e, opcionalmente, `permissoesCustom` — um objeto PARCIAL no mesmo
// formato que sobrescreve pontualmente o perfil base só para aquele usuário
// (ex: um Conferente que também pode editar Fluxos, sem virar um perfil novo
// pra isso). `mergePermissoes` faz essa combinação.

// `grupo` agrupa seções relacionadas dentro de Cadastros (ex: Tipo de
// Operação e Operação vivem juntas sob "Operação" na navegação), sem mudar
// o `id` de cada uma — é só uma dica de UI pro CadastrosScreen.
export const SECOES_CADASTRO = [
  { id: 'clientes', label: 'Cliente' },
  { id: 'perfis', label: 'Perfil' },
  { id: 'usuarios', label: 'Usuários' },
  { id: 'colaboradores', label: 'Colaborador' },
  { id: 'turnos', label: 'Turno' },
  { id: 'tiposOperacao', label: 'Tipo de Operação', grupo: 'operacao' },
  { id: 'fluxos', label: 'Operação', grupo: 'operacao' }
];

export const GRUPOS_CADASTRO = {
  operacao: { label: 'Operação' }
};

export const ACOES_CADASTRO = ['visualizar', 'criar', 'editar', 'deletar'];

export function permissoesVazias() {
  const cadastros = {};
  SECOES_CADASTRO.forEach((s) => {
    cadastros[s.id] = { visualizar: false, criar: false, editar: false, deletar: false };
  });
  return {
    abas: { dashboard: true, cadastros: false, coletor: false, planejamento: false, relatorios: false, autorizacoes: false },
    cadastros
  };
}

export function permissoesTotais() {
  const cadastros = {};
  SECOES_CADASTRO.forEach((s) => {
    cadastros[s.id] = { visualizar: true, criar: true, editar: true, deletar: true };
  });
  return {
    abas: { dashboard: true, cadastros: true, coletor: true, planejamento: true, relatorios: true, autorizacoes: true },
    cadastros
  };
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
  permissoes: permissoesTotais()
};

// Combina o perfil base do usuário com as permissões customizadas dele
// (quando existirem). Overrides são parciais: só o que for definido em
// `overrides` substitui o valor do perfil base.
export function mergePermissoes(base, overrides) {
  const permBase = base || permissoesVazias();
  if (!overrides) return permBase;

  const abas = { ...permBase.abas, ...(overrides.abas || {}) };
  const cadastros = {};
  SECOES_CADASTRO.forEach((s) => {
    cadastros[s.id] = {
      ...(permBase.cadastros?.[s.id] || {}),
      ...(overrides.cadastros?.[s.id] || {})
    };
  });
  return { abas, cadastros };
}

export function temPermissaoCadastro(permissoes, secao, acao) {
  return Boolean(permissoes?.cadastros?.[secao]?.[acao]);
}

// Aba em que o usuário cai logo após o login. Se "coletor" for a ÚNICA aba
// habilitada (perfil exclusivo de coletor), vai direto pra lá — senão,
// segue o padrão de sempre: Dashboard.
export function abaInicial(permissoes) {
  const abas = permissoes?.abas || {};
  const outras = Object.keys(abas).filter((k) => k !== 'coletor' && abas[k]);
  if (abas.coletor && outras.length === 0) return 'coletor';
  return 'dashboard';
}

// Monta a árvore de navegação de 1º nível de Cadastros a partir das seções
// visíveis pro usuário: seções soltas (sem `grupo`) viram um item; seções
// com o mesmo `grupo` (ex: Tipo de Operação + Operação) viram um único item
// de grupo. Compartilhado entre a sidebar (GestaoML) e a tela de Cadastros.
export function montarNavegacaoCadastros(permissoes) {
  const secoesVisiveis = SECOES_CADASTRO.filter((s) => permissoes?.cadastros?.[s.id]?.visualizar);
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
