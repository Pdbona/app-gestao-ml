import React from 'react';
import { NAVY } from '../../lib/styles';
import { COR_STATUS_BOM } from '../ChartCanvas';

// Cor de alerta consistente com o resto do app (mesmo vermelho de
// ui.badgeVermelho em lib/styles.js) — não o #f44336 literal do
// documento, pra não introduzir uma 2ª paleta de vermelho/verde.
const COR_ALERTA = '#B3261E';

// Cada métrica diz se "maior é melhor" (seta verde quando sobe) ou não
// (tempo médio: menor é melhor). Equipe média não tem um sentido de
// "bom/ruim" óbvio sozinha, então fica sem julgamento de cor — só mostra a
// variação.
const METRICAS = [
  { chave: 'volumeTotal', label: 'Volume Total', sufixo: '', casasDecimais: 0, maiorEhMelhor: true },
  { chave: 'tempoMedio', label: 'Tempo Médio', sufixo: 'min', casasDecimais: 0, maiorEhMelhor: false },
  { chave: 'equipeMedia', label: 'Equipe Média', sufixo: 'pessoas', casasDecimais: 1, maiorEhMelhor: null },
  { chave: 'produtividade', label: 'Produtividade', sufixo: 'vol/pessoa', casasDecimais: 1, maiorEhMelhor: true },
  { chave: 'taxaHora', label: 'Taxa/Hora', sufixo: 'vol/h', casasDecimais: 1, maiorEhMelhor: true },
  { chave: 'eficiencia', label: 'Eficiência', sufixo: '%', casasDecimais: 0, maiorEhMelhor: true }
];

function formatarValor(valor, casasDecimais) {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casasDecimais, maximumFractionDigits: casasDecimais });
}

function Seta({ atual, anterior, maiorEhMelhor }) {
  if (atual == null || anterior == null || anterior === 0 || maiorEhMelhor == null) return null;
  const subiu = atual > anterior;
  if (atual === anterior) return null;
  const bom = maiorEhMelhor ? subiu : !subiu;
  const variacaoPct = Math.round(((atual - anterior) / Math.abs(anterior)) * 100);
  return (
    <span style={{ ...styles.seta, color: bom ? COR_STATUS_BOM : COR_ALERTA }}>
      {subiu ? '↑' : '↓'} {Math.abs(variacaoPct)}%
    </span>
  );
}

// 6 KPI Cards do Dashboard ML — fundo navy (identidade do app, ver
// lib/styles.js), seta comparando com o período anterior de mesmo tamanho.
export default function KPICardsML({ kpisAtual, kpisAnterior }) {
  return (
    <div style={styles.grid}>
      {METRICAS.map((m) => (
        <div key={m.chave} style={styles.card}>
          <div style={styles.label}>{m.label}</div>
          <div style={styles.valor}>
            {formatarValor(kpisAtual[m.chave], m.casasDecimais)}
            {kpisAtual[m.chave] != null && <span style={styles.sufixo}> {m.sufixo}</span>}
          </div>
          <Seta atual={kpisAtual[m.chave]} anterior={kpisAnterior[m.chave]} maiorEhMelhor={m.maiorEhMelhor} />
        </div>
      ))}
    </div>
  );
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
    marginBottom: 20
  },
  card: {
    background: NAVY,
    borderRadius: 10,
    padding: '16px 14px',
    color: '#FFF',
    boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
  },
  label: { fontSize: 12, opacity: 0.85, marginBottom: 6, fontWeight: 600 },
  valor: { fontSize: 24, fontWeight: 700 },
  sufixo: { fontSize: 12, fontWeight: 400, opacity: 0.85 },
  seta: { display: 'inline-block', marginTop: 6, fontSize: 12, fontWeight: 700 }
};
