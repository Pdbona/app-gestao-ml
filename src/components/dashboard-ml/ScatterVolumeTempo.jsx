import React, { useMemo } from 'react';
import ChartCanvas, { CORES_CATEGORICAS, COR_INK_MUTED } from '../ChartCanvas';
import { regressaoLinear } from '../../lib/dashboardMlCalc';

// Scatter Volume × Tempo — um ponto por operação finalizada, cor por
// cliente, com linha de tendência (regressão linear sobre TODOS os
// pontos, independente do cliente).
export default function ScatterVolumeTempo({ registrosFiltrados, clientes, nomeCliente }) {
  const { datasets, temDados } = useMemo(() => {
    const finalizados = registrosFiltrados.filter((r) => r.fim && Number(r.tempoRealMinutos) > 0);
    const porCliente = {};
    finalizados.forEach((r) => {
      const chave = r.clienteId || '_semCliente';
      if (!porCliente[chave]) porCliente[chave] = [];
      porCliente[chave].push({ x: Number(r.tempoRealMinutos) / 60, y: Number(r.qtdVolumes) || 0 });
    });

    const dsPontos = Object.entries(porCliente).map(([clienteId, pontos], i) => ({
      label: clienteId === '_semCliente' ? '(sem cliente)' : nomeCliente(clienteId),
      data: pontos,
      backgroundColor: CORES_CATEGORICAS[i % CORES_CATEGORICAS.length],
      pointRadius: 5,
      pointHoverRadius: 7
    }));

    const todosPontos = finalizados.map((r) => ({ x: Number(r.tempoRealMinutos) / 60, y: Number(r.qtdVolumes) || 0 }));
    const reg = regressaoLinear(todosPontos);
    if (reg && todosPontos.length) {
      const xs = todosPontos.map((p) => p.x);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      dsPontos.push({
        type: 'line',
        label: 'Tendência',
        data: [
          { x: xMin, y: reg.slope * xMin + reg.intercept },
          { x: xMax, y: reg.slope * xMax + reg.intercept }
        ],
        borderColor: COR_INK_MUTED,
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      });
    }

    return { datasets: dsPontos, temDados: finalizados.length > 0 };
  }, [registrosFiltrados, clientes]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!temDados) return <p style={{ color: '#777', fontSize: 13 }}>Sem operações finalizadas no período.</p>;

  return (
    <ChartCanvas
      tipo="scatter"
      dados={{ datasets }}
      opcoes={{
        plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x: { title: { display: true, text: 'Tempo (horas)' } },
          y: { title: { display: true, text: 'Volume' }, beginAtZero: true }
        }
      }}
    />
  );
}
