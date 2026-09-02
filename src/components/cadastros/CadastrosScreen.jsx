import React, { useState } from 'react';
import { SECOES_CADASTRO } from '../../lib/permissoes';
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

export default function CadastrosScreen({ permissoes }) {
  const secoesVisiveis = SECOES_CADASTRO.filter((s) => permissoes.cadastros?.[s.id]?.visualizar);
  const [secaoAtual, setSecaoAtual] = useState(secoesVisiveis[0]?.id || null);

  if (secoesVisiveis.length === 0) {
    return <p style={{ color: '#777' }}>Nenhuma seção de cadastro liberada para o seu usuário.</p>;
  }

  const ativa = secoesVisiveis.some((s) => s.id === secaoAtual) ? secaoAtual : secoesVisiveis[0].id;
  const TelaAtiva = TELAS[ativa];

  return (
    <div>
      <div style={styles.subNav}>
        {secoesVisiveis.map((s) => (
          <button
            key={s.id}
            onClick={() => setSecaoAtual(s.id)}
            style={{ ...styles.subNavButton, ...(ativa === s.id ? styles.subNavButtonAtivo : {}) }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <TelaAtiva permissoes={permissoes} />
    </div>
  );
}

const styles = {
  subNav: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 20,
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
  subNavButtonAtivo: { background: NAVY, color: '#FFF' }
};
