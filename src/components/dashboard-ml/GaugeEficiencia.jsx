import React from 'react';
import ChartCanvas, { CORES_CATEGORICAS, COR_STATUS_BOM } from '../ChartCanvas';
import { NAVY } from '../../lib/styles';

const COR_ALERTA = '#B3261E';
const COR_ATENCAO = CORES_CATEGORICAS[3]; // amarelo/laranja da paleta categórica

function corFaixa(valor) {
  if (valor < 70) return COR_ALERTA;
  if (valor < 90) return COR_ATENCAO;
  return COR_STATUS_BOM;
}

// Gauge (velocímetro) de Eficiência — Chart.js não tem tipo "gauge" nativo,
// então é um doughnut de meia-volta (rotation 270°, circumference 180°)
// com 2 fatias: valor (colorida pela faixa) e o restante até 100 (cinza
// claro). O número central é um <div> sobreposto via position:absolute, não
// um plugin do Chart.js — mais simples e evita mais uma dependência.
export default function GaugeEficiencia({ eficiencia }) {
  const valor = eficiencia == null ? 0 : Math.max(0, Math.min(100, eficiencia));
  const semDados = eficiencia == null;

  return (
    <div style={{ position: 'relative' }}>
      <ChartCanvas
        tipo="doughnut"
        altura={160}
        dados={{
          datasets: [
            {
              data: [valor, 100 - valor],
              backgroundColor: [semDados ? '#DDD' : corFaixa(valor), '#EEE'],
              borderWidth: 0
            }
          ]
        }}
        opcoes={{
          rotation: 270,
          circumference: 180,
          cutout: '72%',
          plugins: { legend: { display: false }, tooltip: { enabled: false } }
        }}
      />
      <div style={styles.centro}>
        <div style={{ ...styles.valor, color: semDados ? '#999' : corFaixa(valor) }}>{semDados ? '—' : `${Math.round(valor)}%`}</div>
        <div style={styles.label}>Eficiência Atual</div>
      </div>
    </div>
  );
}

const styles = {
  centro: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 6,
    textAlign: 'center'
  },
  valor: { fontSize: 24, fontWeight: 700 },
  label: { fontSize: 11, color: NAVY, fontWeight: 600 }
};
