import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ui, NAVY } from '../lib/styles';
import { hojeISO, addDiasISO, datasNoIntervalo, formatarDataBr, quinzenaAtual } from '../lib/data';
import { formatarCpf } from '../lib/cpf';
import {
  filtrarRegistros,
  filtrarPlanejamentos,
  filtrarPresencas,
  operacoesPorDia,
  agruparPorId,
  absenteismoPorDia,
  presencasParaTabela,
  resumoPeriodo
} from '../lib/relatorio';
import { gerarRelatorioPdf, gerarRelatorioPresencaPdf } from '../lib/relatorioPdf';
import { obterLogoMlBase64 } from '../lib/logoAssets';
import ChartCanvas, { CORES_CATEGORICAS, COR_STATUS_BOM } from './ChartCanvas';

const PERIODO_PADRAO_DIAS = 30;
const LOGO_ML_URL = `${process.env.PUBLIC_URL}/logos/logo-ml.png`;

// Tela do Administrativo pra "olhar pra trás": escolhe um Cliente/Local +
// um período (a Dashboard, por pedido do Pablo, fica só com o dia
// corrente) e vê os registros daquele intervalo com gráficos — em tela
// primeiro, com opção de gerar PDF (logo ML + logo do cliente) depois.
export default function RelatoriosScreen() {
  const [clientes, setClientes] = useState([]);
  const [tiposOperacao, setTiposOperacao] = useState([]);
  const [fluxos, setFluxos] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [planejamentos, setPlanejamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);

  const [clienteId, setClienteId] = useState('');
  const [dataInicio, setDataInicio] = useState(addDiasISO(hojeISO(), -(PERIODO_PADRAO_DIAS - 1)));
  const [dataFim, setDataFim] = useState(hojeISO());
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erro, setErro] = useState('');

  // Período do relatório de presença é INDEPENDENTE do período operacional
  // acima (não muda o default de 30 dias das 4 seções já existentes) —
  // default = quinzena fixa do calendário, ciclo de cobrança da ML, com os
  // campos de data livres pra escolher outro período.
  const quinzena = useMemo(() => quinzenaAtual(hojeISO()), []);
  const [dataInicioPresenca, setDataInicioPresenca] = useState(quinzena.inicio);
  const [dataFimPresenca, setDataFimPresenca] = useState(quinzena.fim);
  const [gerandoPdfPresenca, setGerandoPdfPresenca] = useState(false);
  const [erroPresenca, setErroPresenca] = useState('');
  // Pedido do Pablo: "quando gerar, primeiro me demonstre na tela e
  // depois opção pra gerar o PDF" — mesmo padrão já usado no romaneio do
  // Dashboard (abre uma prévia em modal, o PDF de verdade só é gerado se
  // clicar em "Baixar PDF" lá dentro).
  const [modalListaPresenca, setModalListaPresenca] = useState(false);

  const chartsRef = useRef({});

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'clientes'), (snap) => setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'tiposOperacao'), (snap) => setTiposOperacao(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'fluxos'), (snap) => setFluxos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'turnos'), (snap) => setTurnos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
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

  const presencasFiltradasPeriodo = useMemo(
    () => (clienteId ? filtrarPresencas(presencas, clienteId, dataInicioPresenca, dataFimPresenca) : []),
    [presencas, clienteId, dataInicioPresenca, dataFimPresenca]
  );
  // Ordem pedida pelo Pablo: data crescente, turno (pelo horaInicio
  // cadastrado), nome (alfabética) e hora de presença.
  const linhasPresenca = useMemo(
    () => presencasParaTabela(presencasFiltradasPeriodo, turnos),
    [presencasFiltradasPeriodo, turnos]
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
      await gerarRelatorioPdf({
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

  const gerarPdfPresenca = async () => {
    setGerandoPdfPresenca(true);
    setErroPresenca('');
    try {
      const logoMlBase64 = await obterLogoMlBase64();
      await gerarRelatorioPresencaPdf({
        clienteNome: cliente?.nome || 'Cliente',
        dataInicio: dataInicioPresenca,
        dataFim: dataFimPresenca,
        linhas: linhasPresenca,
        logoMlBase64,
        logoClienteBase64: cliente?.logoBase64 || null
      });
    } catch (e) {
      setErroPresenca('Falha ao gerar o PDF. Tente novamente.');
    } finally {
      setGerandoPdfPresenca(false);
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

          <h3 style={{ ...ui.sectionTitle, marginTop: 36 }}>Presenças confirmadas</h3>
          <p style={ui.placeholderNote}>
            Lista de quem confirmou presença por dia — pro cliente conferir. Período padrão é a
            quinzena corrente (ciclo de cobrança da ML), mas dá pra escolher outro período livremente.
          </p>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Data início
              <input
                type="date"
                style={ui.input}
                value={dataInicioPresenca}
                max={dataFimPresenca}
                onChange={(e) => setDataInicioPresenca(e.target.value)}
              />
            </label>
            <label style={ui.label}>
              Data fim
              <input
                type="date"
                style={ui.input}
                value={dataFimPresenca}
                min={dataInicioPresenca}
                onChange={(e) => setDataFimPresenca(e.target.value)}
              />
            </label>
          </div>

          <p style={ui.placeholderNote}>
            {linhasPresenca.length === 0
              ? 'Nenhuma presença confirmada no período.'
              : `${linhasPresenca.length} presença(s) confirmada(s) no período.`}
          </p>

          {erroPresenca && <div style={ui.erro}>❌ {erroPresenca}</div>}

          <button
            style={ui.primaryButton}
            onClick={() => setModalListaPresenca(true)}
            disabled={linhasPresenca.length === 0}
          >
            👁 Ver lista de presença
          </button>
        </>
      )}

      {modalListaPresenca && (
        <div style={styles.overlay} onClick={() => setModalListaPresenca(false)}>
          <div style={styles.modalLista} onClick={(e) => e.stopPropagation()}>
            <div style={styles.listaCabecalho}>
              <img src={LOGO_ML_URL} alt="ML Serviços" style={styles.listaLogoMl} />
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: 0, color: NAVY }}>Lista de Presença</h3>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#666' }}>
                  {cliente?.nome} — {formatarDataBr(dataInicioPresenca)} a {formatarDataBr(dataFimPresenca)}
                </p>
              </div>
              {cliente?.logoBase64 ? (
                <img src={cliente.logoBase64} alt="" style={styles.listaLogoCliente} />
              ) : (
                <div style={{ width: 44 }} />
              )}
            </div>
            <div style={styles.listaOrange} />

            <div style={ui.tableWrapper}>
              <table style={ui.table}>
                <thead>
                  <tr>
                    <th style={ui.th}>Data</th>
                    <th style={ui.th}>Nome Completo</th>
                    <th style={ui.th}>CPF</th>
                    <th style={ui.th}>Turno</th>
                    <th style={ui.th}>Hora de Presença</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasPresenca.map((linha) => (
                    <tr key={linha.id}>
                      <td style={ui.td}>{formatarDataBr(linha.data)}</td>
                      <td style={ui.td}>{linha.colaboradorNome}</td>
                      <td style={ui.td}>{formatarCpf(linha.cpf)}</td>
                      <td style={ui.td}>{linha.turnoNome}</td>
                      <td style={ui.td}>
                        {linha.dataHoraCheckin?.toMillis
                          ? new Date(linha.dataHoraCheckin.toMillis()).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : '--:--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {erroPresenca && <div style={{ ...ui.erro, marginTop: 12 }}>❌ {erroPresenca}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button style={ui.primaryButton} onClick={gerarPdfPresenca} disabled={gerandoPdfPresenca}>
                {gerandoPdfPresenca ? 'Gerando...' : '⬇️ Baixar PDF'}
              </button>
              <button style={ui.secondaryButton} onClick={() => setModalListaPresenca(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
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
  graficoTitulo: { margin: '0 0 10px', fontSize: 14, color: NAVY },

  // Modal de prévia da Lista de Presença — mesmo padrão visual do modal de
  // romaneio em DashboardTab.jsx (overlay + card + cabeçalho com logos +
  // faixa laranja), pra "demonstrar na tela" antes de gerar o PDF de
  // verdade.
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalLista: {
    background: '#FFF',
    borderRadius: 10,
    padding: '24px 28px',
    maxWidth: 720,
    width: '94%',
    maxHeight: '88vh',
    overflowY: 'auto',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)'
  },
  listaCabecalho: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  listaLogoMl: { height: 36, width: 'auto' },
  // object-fit: contain + fundo neutro — a logo do cliente nunca é
  // esticada fora de proporção aqui (mesmo cuidado que o PDF agora tem
  // via `encaixarProporcional` em lib/romaneio.js).
  listaLogoCliente: { height: 44, width: 44, objectFit: 'contain', borderRadius: 6, background: '#FAFAFA' },
  listaOrange: { height: 3, background: '#FF6B00', margin: '14px 0 18px', borderRadius: 2 }
};
