import React, { useMemo } from 'react';
import ChartCanvas, { CORES_CATEGORICAS, COR_INK_MUTED } from '../ChartCanvas';
import { paretoClientes } from '../../lib/dashboardMlCalc';

const COR_TOP80 = CORES_CATEGORICAS[0];
const COR_LINHA_80 = '#B3261E';

// Pareto (80/20) por cliente — barras e linha acumulada NO MESMO eixo
// (0-100%), de propósito: em vez de eixo duplo (volume absoluto à
// esquerda, % acumulado à direita — a skill dataviz do projeto proíbe
// eixo duplo), cada barra já é o "% do total" daquele cliente, então bar e
// linha cumulativa compartilham a mesma escala sem truque nenhum.
export default function ParetoClientes({ registrosFiltrados, nomeCliente }) {
  const dados = useMemo(() => paretoClientes(registrosFiltrados, nomeCliente), [registrosFiltrados]); // eslint-disable-line react-hooks/exhaustive-deps

  if (dados.length === 0) return <p style={{ color: '#777', fontSize: 13 }}>Sem operações finalizadas no período.</p>;

  return (
    <ChartCanvas
      tipo="bar"
      dados={{
        labels: dados.map((d) => d.nome),
        datasets: [
          {
            type: 'bar',
            label: '% do volume total',
            data: dados.map((d) => d.pctDoTotal),
            backgroundColor: dados.map((d) => (d.noTop80 ? COR_TOP80 : COR_INK_MUTED)),
            borderRadius: 4,
            order: 2
          },
          {
            type: 'line',
            label: '% acumulado',
            data: dados.map((d) => d.pctAcumulado),
            borderColor: COR_LINHA_80,
            backgroundColor: COR_LINHA_80,
            borderWidth: 2,
            pointRadius: 3,
            fill: false,
            order: 1
          }
        ]
      }}
      opcoes={{
        scales: { y: { max: 100, ticks: { callback: (v) => `${v}%` } } },
        plugins: {
          legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` } }
        }
      }}
    />
  );
}
