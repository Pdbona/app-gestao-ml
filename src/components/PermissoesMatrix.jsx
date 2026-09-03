import React from 'react';
import { SECOES_CADASTRO, ACOES_CADASTRO } from '../lib/permissoes';
import { ui, NAVY } from '../lib/styles';

const LABEL_ACAO = {
  visualizar: 'Ver',
  criar: 'Criar',
  editar: 'Editar',
  deletar: 'Excluir'
};

// Grade de checkboxes reutilizada tanto na edição de Perfis quanto na
// personalização de permissões por Usuário. `value` é sempre o objeto
// completo { abas: {...}, cadastros: {...} }.
export default function PermissoesMatrix({ value, onChange }) {
  const setAba = (aba, checked) => {
    onChange({ ...value, abas: { ...value.abas, [aba]: checked } });
  };

  const setAcao = (secaoId, acao, checked) => {
    onChange({
      ...value,
      cadastros: {
        ...value.cadastros,
        [secaoId]: { ...value.cadastros[secaoId], [acao]: checked }
      }
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: NAVY, marginBottom: 6, fontSize: 13 }}>
          Abas visíveis
        </div>
        <label style={{ marginRight: 20, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={Boolean(value.abas?.dashboard)}
            onChange={(e) => setAba('dashboard', e.target.checked)}
          />{' '}
          Dashboard
        </label>
        <label style={{ marginRight: 20, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={Boolean(value.abas?.cadastros)}
            onChange={(e) => setAba('cadastros', e.target.checked)}
          />{' '}
          Cadastros
        </label>
        <label style={{ marginRight: 20, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={Boolean(value.abas?.coletor)}
            onChange={(e) => setAba('coletor', e.target.checked)}
          />{' '}
          Coletor
        </label>
        <label style={{ marginRight: 20, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={Boolean(value.abas?.planejamento)}
            onChange={(e) => setAba('planejamento', e.target.checked)}
          />{' '}
          Planejamento
        </label>
        <label style={{ fontSize: 14 }}>
          <input
            type="checkbox"
            checked={Boolean(value.abas?.relatorios)}
            onChange={(e) => setAba('relatorios', e.target.checked)}
          />{' '}
          Relatórios
        </label>
        <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
          Se "Coletor" for a única aba marcada, o login já leva direto pra tela do Coletor.
        </div>
      </div>

      <div style={{ fontWeight: 700, color: NAVY, marginBottom: 6, fontSize: 13 }}>
        Ações dentro de Cadastros
      </div>
      <div style={ui.permGrid}>
        <div />
        {ACOES_CADASTRO.map((acao) => (
          <div key={acao} style={ui.permHeaderCell}>
            {LABEL_ACAO[acao]}
          </div>
        ))}

        {SECOES_CADASTRO.map((secao) => (
          <React.Fragment key={secao.id}>
            <div style={ui.permRowLabel}>{secao.label}</div>
            {ACOES_CADASTRO.map((acao) => (
              <div key={acao} style={{ textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={Boolean(value.cadastros?.[secao.id]?.[acao])}
                  onChange={(e) => setAcao(secao.id, acao, e.target.checked)}
                />
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
