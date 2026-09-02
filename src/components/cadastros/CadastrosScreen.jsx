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
// `montarNavegacaoCadastros`). Esta tela só cuida do 2º nível: quando o
// item é um GRUPO (ex: "Operação" = Tipo de Operação + Operação), mostra a
// sub-navegação interna entre as telas daquele grupo.
export default function CadastrosScreen({ permissoes, secaoAtualId }) {
  const navegacao = montarNavegacaoCadastros(permissoes);
  const [subSecaoPorGrupo, setSubSecaoPorGrupo] = useState({});

  const itemAtual = navegacao.find((n) => n.id === secaoAtualId) || navegacao[0];

  if (!itemAtual) {
    return <p style={{ color: '#777' }}>Nenhuma seção de cadastro liberada para o seu usuário.</p>;
  }

  let secaoParaRenderizar;
  if (itemAtual.tipo === 'secao') {
    secaoParaRenderizar = itemAtual.secao;
  } else {
    const subId = subSecaoPorGrupo[itemAtual.id] || itemAtual.secoes[0].id;
    secaoParaRenderizar = itemAtual.secoes.find((s) => s.id === subId) || itemAtual.secoes[0];
  }

  const TelaAtiva = TELAS[secaoParaRenderizar.id];

  return (
    <div>
      {itemAtual.tipo === 'grupo' && itemAtual.secoes.length > 1 && (
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
