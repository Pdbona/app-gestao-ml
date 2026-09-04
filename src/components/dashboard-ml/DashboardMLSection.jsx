import React, { useMemo, useState } from 'react';
import { NAVY } from '../../lib/styles';
import FiltrosDashboardML, { lerFiltrosSalvos, salvarFiltros } from './FiltrosDashboardML';
import KPICardsML from './KPICardsML';
import ScatterVolumeTempo from './ScatterVolumeTempo';
import LinhaHistoricoPrevisao from './LinhaHistoricoPrevisao';
import HeatMapDemanda from './HeatMapDemanda';
import BarPlanejadoRealizado from './BarPlanejadoRealizado';
import GaugeEficiencia from './GaugeEficiencia';
import ParetoClientes from './ParetoClientes';
import { intervaloDoPeriodo, intervaloAnterior, filtrarRegistrosDashboard, calcularKpis } from '../../lib/dashboardMlCalc';

// Substitui a antiga seção "Indicadores de tempo realizado" do Dashboard —
// as seções 1 (Operações do dia) e 2 (Presença do dia) continuam como
// estavam por terem ações do dia a dia (romaneio, resolver falta), e a 3
// (Planejamento 7 dias) também foi mantida; só esta parte virou os 7
// gráficos + filtros pedidos.
//
// Dados (clientes/turnos/fluxos/tiposOperacao/registros/planejamentos) vêm
// como props de DashboardTab.jsx — que já mantém um onSnapshot de cada
// coleção — pra não abrir uma 2ª inscrição duplicada nas mesmas coleções.
export default function DashboardMLSection({ clientes, turnos, fluxos, tiposOperacao, registros, planejamentos, nomeCliente }) {
  const [rascunho, setRascunho] = useState(lerFiltrosSalvos);
  const [aplicados, setAplicados] = useState(lerFiltrosSalvos);

  const aplicarFiltros = () => {
    setAplicados(rascunho);
    salvarFiltros(rascunho);
  };

  const periodo = useMemo(
    () => intervaloDoPeriodo(aplicados.periodo, aplicados.customInicio, aplicados.customFim),
    [aplicados.periodo, aplicados.customInicio, aplicados.customFim]
  );
  const periodoAnterior = useMemo(() => intervaloAnterior(periodo), [periodo]);

  const filtrosAtual = useMemo(() => ({ ...aplicados, ...periodo }), [aplicados, periodo]);
  const filtrosAnterior = useMemo(() => ({ ...aplicados, ...periodoAnterior }), [aplicados, periodoAnterior]);

  const registrosAtual = useMemo(
    () => filtrarRegistrosDashboard(registros, filtrosAtual, turnos),
    [registros, filtrosAtual, turnos]
  );
  const registrosAnterior = useMemo(
    () => filtrarRegistrosDashboard(registros, filtrosAnterior, turnos),
    [registros, filtrosAnterior, turnos]
  );

  const kpisAtual = useMemo(() => calcularKpis(registrosAtual, tiposOperacao), [registrosAtual, tiposOperacao]);
  const kpisAnterior = useMemo(() => calcularKpis(registrosAnterior, tiposOperacao), [registrosAnterior, tiposOperacao]);

  return (
    <div>
      <FiltrosDashboardML
        rascunho={rascunho}
        setRascunho={setRascunho}
        clientes={clientes}
        turnos={turnos}
        fluxos={fluxos}
        onAplicar={aplicarFiltros}
      />

      <KPICardsML kpisAtual={kpisAtual} kpisAnterior={kpisAnterior} />

      <div style={styles.grid}>
        <div style={styles.card}>
          <h4 style={styles.titulo}>Volume × Tempo</h4>
          <ScatterVolumeTempo registrosFiltrados={registrosAtual} clientes={clientes} nomeCliente={nomeCliente} />
        </div>
        <div style={styles.card}>
          <h4 style={styles.titulo}>Histórico + Previsão</h4>
          <LinhaHistoricoPrevisao registrosFiltrados={registrosAtual} dataInicio={periodo.dataInicio} dataFim={periodo.dataFim} />
        </div>
        <div style={styles.card}>
          <h4 style={styles.titulo}>Demanda por dia/hora</h4>
          <HeatMapDemanda registrosFiltrados={registrosAtual} />
        </div>
        <div style={styles.card}>
          <h4 style={styles.titulo}>Planejado × Realizado (7 dias)</h4>
          <BarPlanejadoRealizado planejamentos={planejamentos} registros={registros} filtros={aplicados} turnos={turnos} />
        </div>
        <div style={{ ...styles.card, ...styles.cardCentralizado }}>
          <h4 style={styles.titulo}>Eficiência</h4>
          <GaugeEficiencia eficiencia={kpisAtual.eficiencia} />
        </div>
        <div style={styles.card}>
          <h4 style={styles.titulo}>Pareto — Top clientes (80/20)</h4>
          <ParetoClientes registrosFiltrados={registrosAtual} nomeCliente={nomeCliente} />
        </div>
      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: 16
  },
  card: {
    background: '#FFF',
    borderRadius: 10,
    border: '1px solid #E5E5E5',
    padding: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  },
  cardCentralizado: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  titulo: { margin: '0 0 10px', fontSize: 14, color: NAVY }
};
