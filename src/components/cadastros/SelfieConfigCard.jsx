import React, { useEffect, useState } from 'react';
import { ui, NAVY } from '../../lib/styles';
import { obterConfigSelfie, salvarConfigSelfie, RETENCAO_SELFIE_DIAS_PADRAO } from '../../lib/limpezaSelfies';

// Configuração de retenção da selfie do check-in — morava dentro da tela
// de Planejamento (não tinha relação nenhuma com lançar MdO por dia) até
// 07/09/2026, quando o Pablo pediu pra mover pra dentro de Cadastros →
// Operação (mesmo grupo de Tipo de Operação/Operação/Turno — faz mais
// sentido como configuração do fluxo operacional do que como parte do
// lançamento de planejamento). Mesmo padrão de card compacto de
// TurnosCadastro/FluxosCadastro, pra ficar lado a lado com eles.
export default function SelfieConfigCard() {
  const [guardarSelfie, setGuardarSelfie] = useState(false);
  const [retencaoDias, setRetencaoDias] = useState(RETENCAO_SELFIE_DIAS_PADRAO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    obterConfigSelfie().then((cfg) => {
      setGuardarSelfie(cfg.guardarSelfie);
      setRetencaoDias(cfg.retencaoSelfieDias);
    });
  }, []);

  const salvar = async () => {
    const dias = Number(retencaoDias);
    if (guardarSelfie && (!dias || dias <= 0)) {
      setErro('Informe um número de dias válido pra retenção da selfie.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await salvarConfigSelfie({ guardarSelfie, retencaoSelfieDias: dias || RETENCAO_SELFIE_DIAS_PADRAO });
    } catch (e) {
      setErro('Falha ao salvar a configuração de selfie.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div style={styles.cardCompacto}>
      <h3 style={styles.tituloCompacto}>⚙️ Selfie do check-in</h3>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginBottom: 12 }}>
        <input type="checkbox" style={{ marginTop: 3 }} checked={guardarSelfie} onChange={(e) => setGuardarSelfie(e.target.checked)} />
        <span>
          Guardar a selfie no Storage (auditoria)
          <br />
          <span style={{ fontSize: 11, color: '#999' }}>
            Requer o plano pago do Firebase (Blaze) — por ora a foto continua sendo exigida no
            check-in pra confirmar quem é a pessoa, só não fica salva em lugar nenhum.
          </span>
        </span>
      </label>

      {guardarSelfie && (
        <label style={{ ...ui.label, fontSize: 13 }}>
          Manter a selfie por quantos dias?
          <input type="number" min="1" style={ui.input} value={retencaoDias} onChange={(e) => setRetencaoDias(e.target.value)} />
        </label>
      )}
      {guardarSelfie && (
        <p style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
          Depois desse prazo, a foto é apagada automaticamente (o registro de presença em si
          continua existindo, só a foto some) — a limpeza roda quando alguém abre o Dashboard.
        </p>
      )}

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      <button style={ui.secondaryButton} onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  );
}

const styles = {
  cardCompacto: {
    background: '#FFF',
    borderRadius: 8,
    padding: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: 340
  },
  tituloCompacto: { margin: '0 0 12px', fontSize: 15, color: NAVY }
};
