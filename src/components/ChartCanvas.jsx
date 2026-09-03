import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// Cores da paleta validada da skill dataviz (references/palette.md) —
// já passa nos 6 checks de acessibilidade, usada como está (sem
// recustomizar hue nenhum).
export const CORES_CATEGORICAS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const COR_STATUS_BOM = '#0ca30c';
export const COR_INK_PRIMARIA = '#0b0b0b';
export const COR_INK_SECUNDARIA = '#52514e';
export const COR_INK_MUTED = '#898781';
export const COR_GRADE = '#e1e0d9';

const OPCOES_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: COR_INK_MUTED, font: { size: 11 } }
    },
    y: {
      beginAtZero: true,
      grid: { color: COR_GRADE },
      ticks: { color: COR_INK_MUTED, font: { size: 11 }, precision: 0 }
    }
  },
  plugins: {
    legend: { display: false, labels: { color: COR_INK_SECUNDARIA, font: { size: 12 } } }
  }
};

// Wrapper fino em cima do Chart.js — desenha em <canvas> (crucial pra
// virar imagem no PDF via canvas.toDataURL(), sem precisar rasterizar
// SVG). `onPronto` recebe a instância do Chart assim que ela existe, pra
// quem for gerar o PDF conseguir pegar o canvas na hora certa.
export default function ChartCanvas({ tipo, dados, opcoes, altura = 220, onPronto }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const config = {
      type: tipo,
      data: dados,
      options: {
        ...OPCOES_BASE,
        ...opcoes,
        plugins: { ...OPCOES_BASE.plugins, ...(opcoes?.plugins || {}) }
      }
    };
    chartRef.current = new Chart(canvasRef.current, config);
    if (onPronto) onPronto(chartRef.current);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, JSON.stringify(dados), JSON.stringify(opcoes)]);

  return (
    <div style={{ height: altura, position: 'relative' }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
