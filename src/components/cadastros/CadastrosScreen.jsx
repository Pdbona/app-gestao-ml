import React, { useState } from 'react';
import { montarNavegacaoCadastros } from '../../lib/permissoes';
import { NAVY } from '../../lib/styles';
import ClientesCadastro from './ClientesCadastro';
import PerfisCadastro from './PerfisCadastro';
import UsuariosCadastro from './UsuariosCadastro';
import ColaboradoresCadastro from './ColaboradoresCadastro';
import TurnosCadastro from './TurnosCadastro';
import TiposOperacaoCadastro from './TiposOperacaoCadastro';
import FluxosCadastro from './FluxosCadastro';
import SelfieConfigCard from './SelfieConfigCard';

const TELAS = {
  clientes: ClientesCadastro,
  perfis: PerfisCadastro,
  usuarios: UsuariosCadastro,
  colaboradores: ColaboradoresCadastro,
  turnos: TurnosCadastro,
  tiposOperacao: TiposOperacaoCadastro,
  fluxos: FluxosCadastro
};

// O item de 1º nível (Cliente/Perfil/Usuários/Operação) já vem escolhido
// pela sidebar (`secaoAtualId`, controlado em GestaoML.jsx — ver
// `montarNavegacaoCadastros`). Esta tela cuida do 2º nível quando o item é
// um GRUPO: o grupo "operacao" (Tipo de Operação + Operação + Turno) é
// mostrado lado a lado — Tipo de Operação é a tela principal, Operação e
// Turno viram cards menores empilhados ao lado (a pedido do Pablo — Turno
// entrou nesse grupo depois, junto com Operação, já que nenhum dos dois tem
// vínculo direto com Tipo de Operação no cadastro). Um futuro grupo sem
// esse tratamento especial cai no fallback de sub-abas.
export default function CadastrosScreen({ permissoes, secaoAtualId, souAdministrador = false }) {
  const navegacao = montarNavegacaoCadastros(permissoes);
  const [subSecaoPorGrupo, setSubSecaoPorGrupo] = useState({});

  const itemAtual = navegacao.find((n) => n.id === secaoAtualId) || navegacao[0];

  if (!itemAtual) {
    return <p style={{ color: '#777' }}>Nenhuma seção de cadastro liberada para o seu usuário.</p>;
  }

  if (itemAtual.tipo === 'secao') {
    const TelaAtiva = TELAS[itemAtual.secao.id];
    return <TelaAtiva permissoes={permissoes} />;
  }

  if (itemAtual.id === 'operacao') {
    const idsPresentes = itemAtual.secoes.map((s) => s.id);
    return (
      <div style={styles.grupoLadoALadoRow}>
        {idsPresentes.includes('tiposOperacao') && (
          <div style={{ flex: 1, minWidth: 320 }}>
            <TiposOperacaoCadastro permissoes={permissoes} />
          </div>
        )}
        <div style={styles.grupoLadoALadoCol}>
          {idsPresentes.includes('fluxos') && <FluxosCadastro permissoes={permissoes} compacto />}
          {idsPresentes.includes('turnos') && <TurnosCadastro permissoes={permissoes} compacto />}
          {/* Selfie do check-in só aparece pro Administrador (09/09/2026,
              pedido do Pablo) — os outros perfis que têm acesso a este
              grupo (Diretoria, Líder...) não veem mais essa configuração. */}
          {souAdministrador && <SelfieConfigCard />}
        </div>
      </div>
    );
  }

  // Perfil + Usuários unificados numa tela só (09/09/2026, pedido do
  // Pablo) — mesmo tratamento lado a lado do grupo "Operação" acima:
  // Usuários (uso do dia a dia) principal, Perfis (mexido raramente) num
  // card compacto ao lado.
  if (itemAtual.id === 'usuarios') {
    const idsPresentes = itemAtual.secoes.map((s) => s.id);
    // Grid (não flex:1 + largura fixa) pra manter as 2 colunas numa
    // proporção fixa (~65/35) em vez do Usuários esticar pra preencher
    // todo espaço sobrando e deixar a tabela com colunas espalhadas
    // enquanto o card de Perfis fica apertado (feedback do Pablo,
    // 09/09/2026: "ficou desproporcional").
    return (
      <div style={styles.duasColunasProporcao}>
        {idsPresentes.includes('usuarios') && <UsuariosCadastro permissoes={permissoes} />}
        {idsPresentes.includes('perfis') && <PerfisCadastro permissoes={permissoes} compacto />}
      </div>
    );
  }

  // Fallback genérico (grupo desconhecido): sub-abas simples.
  const subId = subSecaoPorGrupo[itemAtual.id] || itemAtual.secoes[0].id;
  const secaoParaRenderizar = itemAtual.secoes.find((s) => s.id === subId) || itemAtual.secoes[0];
  const TelaAtiva = TELAS[secaoParaRenderizar.id];

  return (
    <div>
      {itemAtual.secoes.length > 1 && (
        <div style={styles.subNav}>
          {itemAtual.secoes.map((s) => (
            <button
              key={s.id}
              onClick={() => setSubSecaoPorGrupo({ ...subSecaoPorGrupo, [itemAtual.id]: s.id })}
              style={{
                ...styles.subNavButton,
                ...(secaoParaRenderizar.id === s.id ? styles.subNavButtonAtivo : {})
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <TelaAtiva permissoes={permissoes} />
    </div>
  );
}

const styles = {
  grupoLadoALadoRow: { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' },
  grupoLadoALadoCol: { display: 'flex', flexDirection: 'column', gap: 20 },
  // Usuários + Perfis (09/09/2026): grid com proporção fixa entre as 2
  // colunas, pra nenhuma das 2 ficar esticada/apertada demais dependendo
  // da largura da tela — ver comentário acima de onde é usado.
  duasColunasProporcao: {
    display: 'grid',
    gridTemplateColumns: 'minmax(420px, 1.9fr) minmax(300px, 1fr)',
    gap: 20,
    alignItems: 'start'
  },
  subNav: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 },
  subNavButton: {
    padding: '6px 14px',
    background: '#FFF',
    color: NAVY,
    border: `1px solid ${NAVY}`,
    borderRadius: 14,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600
  },
  subNavButtonAtivo: { background: NAVY, color: '#FFF' }
};
