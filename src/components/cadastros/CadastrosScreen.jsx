import React, { useState } from 'react';
import { SECOES_CADASTRO, GRUPOS_CADASTRO } from '../../lib/permissoes';
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

// Monta a navegação de 1º nível: seções soltas (Cliente, Perfil, Usuários)
// aparecem direto; seções com `grupo` (Tipo de Operação, Operação) viram um
// item único do grupo (ex: "Operação") que abre uma sub-navegação de 2º
// nível com as seções daquele grupo.
function montarNavegacao(secoesVisiveis) {
  const nivel1 = [];
  const gruposVistos = new Set();

  secoesVisiveis.forEach((s) => {
    if (!s.grupo) {
      nivel1.push({ tipo: 'secao', secao: s });
      return;
    }
    if (gruposVistos.has(s.grupo)) return;
    gruposVistos.add(s.grupo);
    const secoesDoGrupo = secoesVisiveis.filter((x) => x.grupo === s.grupo);
    nivel1.push({
      tipo: 'grupo',
      grupoId: s.grupo,
      label: GRUPOS_CADASTRO[s.grupo]?.label || s.grupo,
      secoes: secoesDoGrupo
    });
  });

  return nivel1;
}

export default function CadastrosScreen({ permissoes }) {
  const secoesVisiveis = SECOES_CADASTRO.filter((s) => permissoes.cadastros?.[s.id]?.visualizar);
  const navegacao = montarNavegacao(secoesVisiveis);

  const primeiroItem = navegacao[0];
  const [itemAtualId, setItemAtualId] = useState(
    primeiroItem ? (primeiroItem.tipo === 'secao' ? primeiroItem.secao.id : primeiroItem.grupoId) : null
  );
  const [subSecaoPorGrupo, setSubSecaoPorGrupo] = useState({});

  if (navegacao.length === 0) {
    return <p style={{ color: '#777' }}>Nenhuma seção de cadastro liberada para o seu usuário.</p>;
  }

  const itemAtual = navegacao.find((n) => (n.tipo === 'secao' ? n.secao.id : n.grupoId) === itemAtualId) || navegacao[0];

  let secaoParaRenderizar;
  if (itemAtual.tipo === 'secao') {
    secaoParaRenderizar = itemAtual.secao;
  } else {
    const subId = subSecaoPorGrupo[itemAtual.grupoId] || itemAtual.secoes[0].id;
    secaoParaRenderizar = itemAtual.secoes.find((s) => s.id === subId) || itemAtual.secoes[0];
  }

  const TelaAtiva = TELAS[secaoParaRenderizar.id];

  return (
    <div>
      <div style={styles.subNav}>
        {navegacao.map((item) => {
          const id = item.tipo === 'secao' ? item.secao.id : item.grupoId;
          const label = item.tipo === 'secao' ? item.secao.label : item.label;
          return (
            <button
              key={id}
              onClick={() => setItemAtualId(id)}
              style={{ ...styles.subNavButton, ...(itemAtualId === id ? styles.subNavButtonAtivo : {}) }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {itemAtual.tipo === 'grupo' && itemAtual.secoes.length > 1 && (
        <div style={styles.subSubNav}>
          {itemAtual.secoes.map((s) => (
            <button
              key={s.id}
              onClick={() => setSubSecaoPorGrupo({ ...subSecaoPorGrupo, [itemAtual.grupoId]: s.id })}
              style={{
                ...styles.subSubNavButton,
                ...(secaoParaRenderizar.id === s.id ? styles.subSubNavButtonAtivo : {})
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
  subNav: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 16,
    borderBottom: '1px solid #E0E0E0',
    paddingBottom: 12
  },
  subNavButton: {
    padding: '8px 14px',
    background: '#F0F2F5',
    color: '#333',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600
  },
  subNavButtonAtivo: { background: NAVY, color: '#FFF' },

  subSubNav: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 },
  subSubNavButton: {
    padding: '6px 12px',
    background: '#FFF',
    color: NAVY,
    border: `1px solid ${NAVY}`,
    borderRadius: 14,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600
  },
  subSubNavButtonAtivo: { background: NAVY, color: '#FFF' }
};
