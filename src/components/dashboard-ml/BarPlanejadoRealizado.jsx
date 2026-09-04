import React, { useMemo } from 'react';
import ChartCanvas, { CORES_CATEGORICAS, COR_STATUS_BOM } from '../ChartCanvas';
import { planejadoRealizado7Dias } from '../../lib/dashboardMlCalc';
import { formatarDataBr } from '../../lib/data';

const COR_PLANEJADO = CORES_CATEGORICAS[0];
const COR_ALERTA = '#B3261E';
const COR_ATENCAO = '#B85700';

// Verde se cumpriu/superou o planejado, laranja se chegou perto (≥80%),
// vermelho abaixo disso — mesma leitura de status que o resto do app já
// usa (badges verde/laranja/vermelho).
function corRealizado(planejado, realizado) {
  if (planejado === 0) return realizado > 0 ? COR_STATUS_BOM : '#CCC';
  const pct = realizado / planejado;
  if (pct >= 1) return COR_STATUS_BOM;
  if (pct >= 0.8) return COR_ATENCAO;
  return COR_ALERTA;
}

// Bar chart Planejado × Realizado — sempre os últimos 7 dias corridos
// (fixo, não segue o filtro de Período — ver lib/dashboardMlCalc.js).
export default function BarPlanejadoRealizado({ planejamentos, registros, filtros, turnos }) {
  const dados = useMemo(
    () => planejadoRealizado7Dias(planejamentos, registros, filtros, turnos),
    [planejamentos, registros, filtros, turnos]
  );

  return (
    <ChartCanvas
      tipo="bar"
      dados={{
        labels: dados.map((d) => formatarDataBr(d.data).slice(0, 5)),
        datasets: [
          { label: 'Planejado (MdO)', data: dados.map((d) => d.planejado), backgroundColor: COR_PLANEJADO, borderRadius: 4 },
          {
            label: 'Realizado (MdO)',
            data: dados.map((d) => d.realizado),
            backgroundColor: dados.map((d) => corRealizado(d.planejado, d.realizado)),
            borderRadius: 4
          }
        ]
      }}
      opcoes={{
        plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } }
      }}
    />
  );
}
