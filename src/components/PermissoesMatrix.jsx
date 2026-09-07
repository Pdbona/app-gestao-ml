import React from 'react';
import { CATALOGO_ACESSOS } from '../lib/permissoes';
import { NAVY, ORANGE } from '../lib/styles';

// Lista de "Acessos" em cards com ícone — mesmo estilo visual da tela de
// Perfil do app da Superior Transportes (pedido do Pablo, 07/09/2026,
// substitui a antiga grade "Abas visíveis" + matriz Ver/Criar/Editar/
// Excluir: agora cada item é só um flag, tem ou não tem acesso).
// `value` é sempre `{ acessos: { [id]: bool } }`.
export default function PermissoesMatrix({ value, onChange }) {
  const toggle = (id) => {
    onChange({ ...value, acessos: { ...value.acessos, [id]: !value.acessos?.[id] } });
  };

  return (
    <div>
      <div style={{ fontWeight: 700, color: NAVY, marginBottom: 8, fontSize: 13 }}>Acessos</div>
      <div style={styles.lista}>
        {CATALOGO_ACESSOS.map((item) => {
          const marcado = Boolean(value.acessos?.[item.id]);
          return (
            <label key={item.id} style={{ ...styles.card, ...(marcado ? styles.cardMarcado : {}) }}>
              <input type="checkbox" checked={marcado} onChange={() => toggle(item.id)} style={styles.checkbox} />
              <span style={styles.icone}>{item.icone}</span>
              <span style={styles.label}>{item.label}</span>
            </label>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: '#777', marginTop: 8 }}>
        Se "Coletor" for o único acesso de tela marcado, o login já leva direto pra tela do Coletor.
      </p>
    </div>
  );
}

const styles = {
  lista: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#FFF',
    border: '1px solid #E5E5E5',
    borderRadius: 8,
    cursor: 'pointer',
    userSelect: 'none'
  },
  cardMarcado: { borderColor: ORANGE, background: '#FFF7EF' },
  checkbox: { width: 16, height: 16, flexShrink: 0 },
  icone: { fontSize: 16, flexShrink: 0 },
  label: { fontSize: 14, fontWeight: 600, color: '#333' }
};
