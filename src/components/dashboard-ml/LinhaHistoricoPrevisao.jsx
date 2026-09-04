import React, { useMemo } from 'react';
import ChartCanvas, { CORES_CATEGORICAS, COR_INK_MUTED } from '../ChartCanvas';
import { historicoEPrevisao } from '../../lib/dashboardMlCalc';
import { formatarDataBr } from '../../lib/data';

const COR_HISTORICO = CORES_CATEGORICAS[0];

// Line chart: histórico (sólido) + previsão (tracejado) com banda ≈90% —
// ver comentário de historicoEPrevisao() em lib/dashboardMlCalc.js sobre a
// simplicidade da heurística usada.
export default function LinhaHistoricoPrevisao({ registrosFiltrados, dataInicio, dataFim }) {
  const { historico, previsao } = useMemo(
    () => historicoEPrevisao(registrosFiltrados, dataInicio, dataFim),
    [registrosFiltrados, dataInicio, dataFim]
  );

  const labels = [...historico.map((h) => h.data), ...previsao.map((p) => p.data)].map((d) => formatarDataBr(d).slice(0, 5));
  const nHist = historico.length;

  // Datasets alinhados por índice: histórico preenche só os primeiros N
  // pontos (resto null), previsão só os últimos (resto null) — assim as 2
  // linhas aparecem separadas no mesmo eixo X sem se sobrepor.
  const dadosHistorico = [...historico.map((h) => h.volume), ...previsao.map(() => null)];
  // O primeiro ponto da previsão repete o último valor real, pra linha
  // tracejada "continuar" visualmente a partir de onde a sólida parou.
  const dadosPrevisao = [
    ...historico.map(() => null),
    ...(nHist ? [historico[nHist - 1].volume] : []),
    ...previsao.slice(nHist ? 0 : 1).map((p) => p.central)
  ].slice(0, labels.length);
  const dadosMin = [...historico.map(() => null), ...(nHist ? [historico[nHist - 1].volume] : []), ...previsao.map((p) => p.minimo)].slice(
    0,
    labels.length
  );
  const dadosMax = [...historico.map(() => null), ...(nHist ? [historico[nHist - 1].volume] : []), ...previsao.map((p) => p.maximo)].slice(
    0,
    labels.length
  );

  return (
    <ChartCanvas
      tipo="line"
      dados={{
        labels,
        datasets: [
          {
            label: 'Máximo (≈90%)',
            data: dadosMax,
            borderColor: 'transparent',
            backgroundColor: 'rgba(42,120,214,0.12)',
            pointRadius: 0,
            fill: '+1'
          },
          {
            label: 'Mínimo (≈90%)',
            data: dadosMin,
            borderColor: 'transparent',
            backgroundColor: 'rgba(42,120,214,0.12)',
            pointRadius: 0,
            fill: false
          },
          {
            label: 'Realizado',
            data: dadosHistorico,
            borderColor: COR_HISTORICO,
            backgroundColor: COR_HISTORICO,
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.25,
            fill: false
          },
          {
            label: 'Previsão',
            data: dadosPrevisao,
            borderColor: COR_INK_MUTED,
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.25,
            fill: false
          }
        ]
      }}
      opcoes={{
        plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } }
      }}
    />
  );
}
