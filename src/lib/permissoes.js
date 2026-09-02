// ============================================================
// RBAC — schema de permissões, perfil fixo de bootstrap e helpers
// ============================================================
//
// Toda permissão é organizada em duas camadas:
//   1. `abas`        — quais telas de topo o usuário vê (dashboard, cadastros)
//   2. `cadastros`   — dentro de Cadastros, o que cada seção permite
//      (visualizar/criar/editar/deletar)
//
// Um usuário tem um `perfilId` (perfil base, cadastrado em Cadastros →
// Perfis) e, opcionalmente, `permissoesCustom` — um objeto PARCIAL no mesmo
// formato que sobrescreve pontualmente o perfil base só para aquele usuário
// (ex: um Conferente que também pode editar Fluxos, sem virar um perfil novo
// pra isso). `mergePermissoes` faz essa combinação.

export const SECOES_CADASTRO = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'perfis', label: 'Perfis' },
  { id: 'usuarios', label: 'Usuários' },
  { id: 'tiposOperacao', label: 'Tipos de Operação' },
  { id: 'fluxos', label: 'Fluxos' }
];

export const ACOES_CADASTRO = ['visualizar', 'criar', 'editar', 'deletar'];

export function permissoesVazias() {
  const cadastros = {};
  SECOES_CADASTRO.forEach((s) => {
    cadastros[s.id] = { visualizar: false, criar: false, editar: false, deletar: false };
  });
  return { abas: { dashboard: true, cadastros: false }, cadastros };
}

export function permissoesTotais() {
  const cadastros = {};
  SECOES_CADASTRO.forEach((s) => {
    cadastros[s.id] = { visualizar: true, criar: true, editar: true, deletar: true };
  });
  return { abas: { dashboard: true, cadastros: true }, cadastros };
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
