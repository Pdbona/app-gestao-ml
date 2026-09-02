import React, { useState } from 'react';
import { montarNavegacaoCadastros } from '../../lib/permissoes';
import { NAVY } from '../../lib/styles';
import ClientesCadastro from './ClientesCadastro';
import PerfisCadastro from './PerfisCadastro';
import UsuariosCadastro from './UsuariosCadastro';
import TiposOperacaoCadastro from './TiposOperacaoCadastro';
import FluxosCadastro from './FluxosCadastro';

const TELAS = {
  clientes: ClientesCadastro,
  perfis: PerfisCadastro,
  usuarios: UsuariosCadastro,
  tiposOperacao: TiposOperacaoCadastro,
  fluxos: FluxosCadastro
};

// O item de 1º nível (Cliente/Perfil/Usuários/Operação) já vem escolhido
// pela sidebar (`secaoAtualId`, controlado em GestaoML.jsx — ver
// `montarNavegacaoCadastros`). Esta tela cuida do 2º nível quando o item é
// um GRUPO: o grupo "operacao" (Tipo de Operação + Operação) é mostrado
// lado a lado — Tipo de Operação é a tela principal, Operação vira um card
// menor ao lado (a pedido do Pablo, já que os dois não têm mais vínculo
// entre si no cadastro). Um futuro grupo sem esse tratamento especial cai
// no fallback de sub-abas.
export default function CadastrosScreen({ permissoes, secaoAtualId }) {
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
      <div style={styles.grupoOperacaoRow}>
        {idsPresentes.includes('tiposOperacao') && (
          <div style={{ flex: 1, minWidth: 320 }}>
            <TiposOperacaoCadastro permissoes={permissoes} />
          </div>
        )}
        {idsPresentes.includes('fluxos') && <FluxosCadastro permissoes={permissoes} compacto />}
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
  grupoOperacaoRow: { display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' },
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
