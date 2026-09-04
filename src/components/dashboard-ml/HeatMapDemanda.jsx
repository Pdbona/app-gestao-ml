import React, { useMemo } from 'react';
import { NAVY } from '../../lib/styles';
import { matrizDemanda } from '../../lib/dashboardMlCalc';

// Heat Map de demanda (dia da semana × hora) — sem lib de matrix chart
// (não é dependência do projeto): grid HTML manual, mesma linha de
// raciocínio já usada pras tabelas de PDF do app (desenhar na mão em vez
// de trazer mais uma dependência só pra isso). Cor interpolada branco→
// vermelho (mesmo vermelho de alerta do resto do app) pela contagem
// relativa ao máximo da matriz.
function corCelula(valor, maximo) {
  if (valor === 0) return '#FFFFFF';
  const intensidade = valor / maximo; // 0..1
  // branco (255,255,255) -> vermelho de alerta (227,73,72)
  const r = Math.round(255 + (227 - 255) * intensidade);
  const g = Math.round(255 + (73 - 255) * intensidade);
  const b = Math.round(255 + (72 - 255) * intensidade);
  return `rgb(${r},${g},${b})`;
}

const HORAS_EXIBIDAS = [0, 3, 6, 9, 12, 15, 18, 21]; // rótulos a cada 3h, célula existe pra todas as 24

export default function HeatMapDemanda({ registrosFiltrados }) {
  const { dias, matriz, maximo } = useMemo(() => matrizDemanda(registrosFiltrados), [registrosFiltrados]);

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ ...styles.linha, marginBottom: 2 }}>
        <div style={styles.rotuloDia} />
        {Array.from({ length: 24 }).map((_, h) => (
          <div key={h} style={styles.rotuloHora}>
            {HORAS_EXIBIDAS.includes(h) ? h : ''}
          </div>
        ))}
      </div>
      {dias.map((dia, i) => (
        <div key={dia} style={styles.linha}>
          <div style={styles.rotuloDia}>{dia}</div>
          {matriz[i].map((valor, h) => (
            <div
              key={h}
              title={`${dia} ${String(h).padStart(2, '0')}h — ${valor} operação(ões)`}
              style={{ ...styles.celula, background: corCelula(valor, maximo) }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const styles = {
  linha: { display: 'flex', alignItems: 'center' },
  rotuloDia: { width: 34, fontSize: 10, fontWeight: 700, color: NAVY, flexShrink: 0 },
  rotuloHora: { width: 18, fontSize: 9, color: '#999', textAlign: 'center', flexShrink: 0 },
  celula: {
    width: 18,
    height: 16,
    border: '1px solid #F0F0F0',
    flexShrink: 0
  }
};
