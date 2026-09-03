import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ui, NAVY } from '../lib/styles';
import { hojeISO, addDiasISO, datasNoIntervalo, formatarDataBr } from '../lib/data';
import {
  filtrarRegistros,
  filtrarPlanejamentos,
  filtrarPresencas,
  operacoesPorDia,
  agruparPorId,
  absenteismoPorDia,
  resumoPeriodo
} from '../lib/relatorio';
import { gerarRelatorioPdf } from '../lib/relatorioPdf';
import { obterLogoMlBase64 } from '../lib/logoAssets';
import ChartCanvas, { CORES_CATEGORICAS, COR_STATUS_BOM } from './ChartCanvas';

const PERIODO_PADRAO_DIAS = 30;

// Tela do Administrativo pra "olhar pra trás": escolhe um Cliente/Local +
// um período (a Dashboard, por pedido do Pablo, fica só com o dia
// corrente) e vê os registros daquele intervalo com gráficos — em tela
// primeiro, com opção de gerar PDF (logo ML + logo do cliente) depois.
export default function RelatoriosScreen() {
  const [clientes, setClientes] = useState([]);
  const [tiposOperacao, setTiposOperacao] = useState([]);
  const [fluxos, setFluxos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [planejamentos, setPlanejamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);

  const [clienteId, setClienteId] = useState('');
  const [dataInicio, setDataInicio] = useState(addDiasISO(hojeISO(), -(PERIODO_PADRAO_DIAS - 1)));
  const [dataFim, setDataFim] = useState(hojeISO());
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erro, setErro] = useState('');

  const chartsRef = useRef({});

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'clientes'), (snap) => setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'tiposOperacao'), (snap) => setTiposOperacao(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'fluxos'), (snap) => setFluxos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'registrosOperacao'), (snap) => setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'planejamentoOperacional'), (snap) =>
        setPlanejamentos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(collection(db, 'presencas'), (snap) => setPresencas(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  const cliente = clientes.find((c) => c.id === clienteId);
  const nomeTipo = (id) => tiposOperacao.find((t) => t.id === id)?.nome;
  const nomeFluxo = (id) => fluxos.find((f) => f.id === id)?.nome;

  const datasPeriodo = useMemo(() => datasNoIntervalo(dataInicio, dataFim), [dataInicio, dataFim]);

  const registrosFiltrados = useMemo(
    () => (clienteId ? filtrarRegistros(registros, clienteId, dataInicio, dataFim) : []),
    [registros, clienteId, dataInicio, dataFim]
  );
  const planejamentosFiltrados = useMemo(
    () => (clienteId ? filtrarPlanejamentos(planejamentos, clienteId, dataInicio, dataFim) : []),
    [planejamentos, clienteId, dataInicio, dataFim]
  );
  const presencasFiltradas = useMemo(
    () => (clienteId ? filtrarPresencas(presencas, clienteId, dataInicio, dataFim) : []),
    [presencas, clienteId, dataInicio, dataFim]
  );

  const resumo = useMemo(
    () => resumoPeriodo(registrosFiltrados, planejamentosFiltrados, presencasFiltradas),
    [registrosFiltrados, planejamentosFiltrados, presencasFiltradas]
  );
  const dadosPorDia = useMemo(() => operacoesPorDia(registrosFiltrados, datasPeriodo), [registrosFiltrados, datasPeriodo]);
  const dadosPorTipo = useMemo(
    () => agruparPorId(registrosFiltrados, 'tipoOperacaoId', nomeTipo),
    [registrosFiltrados, tiposOperacao] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dadosPorFluxo = useMemo(
    () => agruparPorId(registrosFiltrados, 'fluxoId', nomeFluxo),
    [registrosFiltrados, fluxos] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dadosAbsenteismo = useMemo(
    () => absenteismoPorDia(planejamentosFiltrados, presencasFiltradas, datasPeriodo),
    [planejamentosFiltrados, presencasFiltradas, datasPeriodo]
  );

  const labelsDias = datasPeriodo.map((d) => formatarDataBr(d).slice(0, 5));

  const configPorDia = {
    labels: labelsDias,
    datasets: [
      {
        label: 'Operações',
        data: dadosPorDia.map((d) => d.contagem),
        backgroundColor: CORES_CATEGORICAS[0],
        borderRadius: 4,
        maxBarThickness: 28
      }
    ]
  };
  const configPorTipo = {
    labels: dadosPorTipo.map((d) => d.nome),
    datasets: [
      {
        data: dadosPorTipo.map((d) => d.contagem),
        backgroundColor: dadosPorTipo.map((_, i) => CORES_CATEGORICAS[i % CORES_CATEGORICAS.length]),
        borderRadius: 4,
        maxBarThickness: 36
      }
    ]
  };
  const configPorFluxo = {
    labels: dadosPorFluxo.map((d) => d.nome),
    datasets: [
      {
        data: dadosPorFluxo.map((d) => d.contagem),
        backgroundColor: dadosPorFluxo.map((_, i) => CORES_CATEGORICAS[i % CORES_CATEGORICAS.length]),
        borderRadius: 4,
        maxBarThickness: 36
      }
    ]
  };
  const configAbsenteismo = {
    labels: labelsDias,
    datasets: [
      { label: 'Planejado', data: dadosAbsenteismo.map((d) => d.planejado), backgroundColor: CORES_CATEGORICAS[0], borderRadius: 4 },
      { label: 'Presente', data: dadosAbsenteismo.map((d) => d.presente), backgroundColor: COR_STATUS_BOM, borderRadius: 4 }
    ]
  };
  const opcoesComLegenda = { plugins: { legend: { display: true, position: 'top' } } };

  const gerarPdf = async () => {
    if (!clienteId) return;
    setGerandoPdf(true);
    setErro('');
    try {
      const logoMlBase64 = await obterLogoMlBase64();
      const imagensGraficos = {
        porDia: chartsRef.current.porDia?.canvas.toDataURL('image/png', 1.0),
        porTipo: chartsRef.current.porTipo?.canvas.toDataURL('image/png', 1.0),
        porFluxo: chartsRef.current.porFluxo?.canvas.toDataURL('image/png', 1.0),
        absenteismo: chartsRef.current.absenteismo?.canvas.toDataURL('image/png', 1.0)
      };
      gerarRelatorioPdf({
        clienteNome: cliente?.nome || 'Cliente',
        dataInicio,
        dataFim,
        resumo,
        imagensGraficos,
        logoMlBase64,
        logoClienteBase64: cliente?.logoBase64 || null
      });
    } catch (e) {
      setErro('Falha ao gerar o PDF. Tente novamente.');
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <div>
      <h2 style={ui.sectionTitle}>Relatórios</h2>
      <p style={ui.placeholderNote}>
        Escolha um Cliente/Local e um período pra ver os registros com gráficos — a Dashboard fica só
        com o dia corrente, esta tela é pra olhar períodos anteriores.
      </p>

      <div style={ui.formGrid}>
        <label style={ui.label}>
          Cliente/Local *
          <select style={ui.input} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Selecione...</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={ui.label}>
          Data início
          <input type="date" style={ui.input} value={dataInicio} max={dataFim} onChange={(e) => setDataInicio(e.target.value)} />
        </label>
        <label style={ui.label}>
          Data fim
          <input type="date" style={ui.input} value={dataFim} min={dataInicio} onChange={(e) => setDataFim(e.target.value)} />
        </label>
      </div>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {!clienteId ? (
        <p style={ui.placeholderNote}>Selecione um cliente pra ver o relatório.</p>
      ) : (
        <>
          <div style={{ ...ui.cardsRow, marginBottom: 20 }}>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{resumo.totalOperacoes}</div>
              <div style={ui.statLabel}>Operações no período</div>
            </div>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{resumo.totalPlanejado}</div>
              <div style={ui.statLabel}>Planejado</div>
            </div>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{resumo.totalPresente}</div>
              <div style={ui.statLabel}>Presente</div>
            </div>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{resumo.absenteismoPct}%</div>
              <div style={ui.statLabel}>Absenteísmo</div>
            </div>
          </div>

          <div style={styles.graficosGrid}>
            <div style={styles.graficoCard}>
              <h3 style={styles.graficoTitulo}>Operações por dia</h3>
              <ChartCanvas
                tipo="bar"
                dados={configPorDia}
                onPronto={(chart) => (chartsRef.current.porDia = chart)}
              />
            </div>
            <div style={styles.graficoCard}>
              <h3 style={styles.graficoTitulo}>Operações por Tipo de Operação</h3>
              <ChartCanvas
                tipo="bar"
                dados={configPorTipo}
                onPronto={(chart) => (chartsRef.current.porTipo = chart)}
              />
            </div>
            <div style={styles.graficoCard}>
              <h3 style={styles.graficoTitulo}>Operações por Operação (fluxo)</h3>
              <ChartCanvas
                tipo="bar"
                dados={configPorFluxo}
                onPronto={(chart) => (chartsRef.current.porFluxo = chart)}
              />
            </div>
            <div style={styles.graficoCard}>
              <h3 style={styles.graficoTitulo}>Absenteísmo (planejado × presente)</h3>
              <ChartCanvas
                tipo="bar"
                dados={configAbsenteismo}
                opcoes={opcoesComLegenda}
                onPronto={(chart) => (chartsRef.current.absenteismo = chart)}
              />
            </div>
          </div>

          <button style={{ ...ui.primaryButton, marginTop: 20 }} onClick={gerarPdf} disabled={gerandoPdf}>
            {gerandoPdf ? 'Gerando...' : '📄 Gerar PDF do relatório'}
          </button>
        </>
      )}
    </div>
  );
}

const styles = {
  graficosGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
    gap: 20
  },
  graficoCard: {
    background: '#FFF',
    borderRadius: 10,
    border: '1px solid #E5E5E5',
    padding: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  },
  graficoTitulo: { margin: '0 0 10px', fontSize: 14, color: NAVY }
};
