import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ui, NAVY, ORANGE } from '../lib/styles';
import { hojeISO, addDiasISO, datasNoIntervalo, formatarDataBr, quinzenaAtual, paraMillis, formatarDataHoraCurta } from '../lib/data';
import { formatarCpf } from '../lib/cpf';
import {
  filtrarRegistros,
  filtrarPlanejamentos,
  filtrarPresencas,
  operacoesPorDia,
  agruparPorId,
  absenteismoPorDia,
  presencasParaTabela,
  agruparPresencasComSubtotais,
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
  // Drill-down dos cards de resumo (09/09/2026, pedido do Pablo: "permita
  // que ao clicar nestes cards, demonstre estas ocorrências") — null =
  // fechado, senão qual card foi clicado.
  const [modalCard, setModalCard] = useState(null); // 'operacoes' | 'planejado' | 'absenteismo' | null

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
  const nomeClienteAtual = clienteId ? cliente?.nome || 'Cliente' : 'Todos os clientes';
  const nomeTipo = (id) => tiposOperacao.find((t) => t.id === id)?.nome;
  const nomeFluxo = (id) => fluxos.find((f) => f.id === id)?.nome;
  const nomeClientePorId = (id) => clientes.find((c) => c.id === id)?.nome || '(cliente removido)';
  const nomeTurno = (id) => turnos.find((t) => t.id === id)?.nome || '(turno removido)';
  const periodoTurno = (t) => `${t.turnoHoraInicio || '--:--'}${t.turnoHoraFim ? ` às ${t.turnoHoraFim}` : ''}`;

  const datasPeriodo = useMemo(() => datasNoIntervalo(dataInicio, dataFim), [dataInicio, dataFim]);

  const registrosFiltrados = useMemo(
    () => filtrarRegistros(registros, clienteId, dataInicio, dataFim),
    [registros, clienteId, dataInicio, dataFim]
  );
  const planejamentosFiltrados = useMemo(
    () => filtrarPlanejamentos(planejamentos, clienteId, dataInicio, dataFim),
    [planejamentos, clienteId, dataInicio, dataFim]
  );
  const presencasFiltradas = useMemo(
    () => filtrarPresencas(presencas, clienteId, dataInicio, dataFim),
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
    () => filtrarPresencas(presencas, clienteId, dataInicioPresenca, dataFimPresenca),
    [presencas, clienteId, dataInicioPresenca, dataFimPresenca]
  );
  // Ordem pedida pelo Pablo: data crescente, turno (pelo horaInicio
  // cadastrado), nome (alfabética) e hora de presença.
  const linhasPresenca = useMemo(
    () => presencasParaTabela(presencasFiltradasPeriodo, turnos),
    [presencasFiltradasPeriodo, turnos]
  );
  // Subtotal por turno (com o período do turno) e por dia, + total geral
  // do período e total geral por turno — pedido do Pablo depois de ver a
  // 1ª versão da lista.
  const presencaAgrupada = useMemo(() => agruparPresencasComSubtotais(linhasPresenca), [linhasPresenca]);

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

  // Cor do card de Absenteísmo por faixa de gravidade (mesmo espírito de
  // "cor por status" da skill dataviz) — verde até 10%, laranja até 30%,
  // vermelho acima disso.
  const corAbsenteismo = (pct) => (pct <= 10 ? COR_STATUS_BOM : pct <= 30 ? ORANGE : '#D32F2F');

  // Linhas do drill-down de "Operações no período" — mesma lista que
  // alimenta os gráficos, só ordenada mais recente primeiro pra leitura.
  const registrosParaModal = useMemo(
    () => [...registrosFiltrados].sort((a, b) => (paraMillis(b.inicio) || 0) - (paraMillis(a.inicio) || 0)),
    [registrosFiltrados]
  );
  const planejamentosParaModal = useMemo(
    () => [...planejamentosFiltrados].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)),
    [planejamentosFiltrados]
  );

  const gerarPdf = async () => {
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
        clienteNome: nomeClienteAtual,
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
        clienteNome: nomeClienteAtual,
        dataInicio: dataInicioPresenca,
        dataFim: dataFimPresenca,
        agrupado: presencaAgrupada,
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
        Por padrão mostra os dados de TODAS as operações (só as válidas — canceladas não entram nos
        gráficos nem nos totais); escolha um Cliente/Local pra ver só o dele. Período pra olhar pra
        trás — a Dashboard fica só com o dia corrente.
      </p>

      <div style={ui.formGrid}>
        <label style={ui.label}>
          Cliente/Local
          <select style={ui.input} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Todos os clientes</option>
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

      <>
        <style>{`
          .rel-card-destaque:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.16); transform: translateY(-2px); }
        `}</style>
        <div style={{ ...ui.cardsRow, marginBottom: 20 }}>
            <div
              className="rel-card-destaque"
              style={{ ...styles.cardDestaque, borderLeftColor: NAVY }}
              role="button"
              tabIndex={0}
              onClick={() => setModalCard('operacoes')}
              onKeyDown={(e) => e.key === 'Enter' && setModalCard('operacoes')}
            >
              <div style={{ ...styles.cardDestaqueValor, color: NAVY }}>{resumo.totalOperacoes}</div>
              <div style={styles.cardDestaqueLabel}>Operações no período</div>
              <div style={styles.cardDestaqueDica}>👁 Ver ocorrências</div>
            </div>
            <div
              className="rel-card-destaque"
              style={{ ...styles.cardDestaque, borderLeftColor: ORANGE }}
              role="button"
              tabIndex={0}
              onClick={() => setModalCard('planejado')}
              onKeyDown={(e) => e.key === 'Enter' && setModalCard('planejado')}
            >
              <div style={{ ...styles.cardDestaqueValor, color: ORANGE }}>{resumo.totalPlanejado}</div>
              <div style={styles.cardDestaqueLabel}>Planejado</div>
              <div style={styles.cardDestaqueDica}>👁 Ver ocorrências</div>
            </div>
            <div
              className="rel-card-destaque"
              style={{ ...styles.cardDestaque, borderLeftColor: corAbsenteismo(resumo.absenteismoPct) }}
              role="button"
              tabIndex={0}
              onClick={() => setModalCard('absenteismo')}
              onKeyDown={(e) => e.key === 'Enter' && setModalCard('absenteismo')}
            >
              <div style={{ ...styles.cardDestaqueValor, color: corAbsenteismo(resumo.absenteismoPct) }}>
                {resumo.absenteismoPct}%
              </div>
              <div style={styles.cardDestaqueLabel}>Absenteísmo</div>
              <div style={styles.cardDestaqueDica}>👁 Ver ocorrências</div>
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

      {modalListaPresenca && (
        <div style={styles.overlay} onClick={() => setModalListaPresenca(false)}>
          <div style={styles.modalLista} onClick={(e) => e.stopPropagation()}>
            <div style={styles.listaCabecalho}>
              <img src={LOGO_ML_URL} alt="ML Serviços" style={styles.listaLogoMl} />
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: 0, color: NAVY }}>Lista de Presença</h3>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#666' }}>
                  {nomeClienteAtual} — {formatarDataBr(dataInicioPresenca)} a {formatarDataBr(dataFimPresenca)}
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
                    <th style={ui.th}>Hora de Saída</th>
                    <th style={ui.th}>Justificativa</th>
                  </tr>
                </thead>
                <tbody>
                  {presencaAgrupada.porDia.map((dia) => (
                    <React.Fragment key={dia.data}>
                      {dia.porTurno.map((turno) => (
                        <React.Fragment key={turno.turnoId}>
                          {turno.pessoas.map((linha) => (
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
                              <td style={ui.td}>
                                {linha.dataHoraSaida?.toMillis
                                  ? new Date(linha.dataHoraSaida.toMillis()).toLocaleTimeString('pt-BR', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })
                                  : '—'}
                              </td>
                              <td style={{ ...ui.td, fontSize: 12, color: '#555', maxWidth: 220 }}>
                                {linha.saidaJustificativa
                                  ? `${linha.saidaTipoJustificativa === 'antecipada' ? 'Saída antecipada' : 'Hora extra'}: ${
                                      linha.saidaJustificativa
                                    }`
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td colSpan={7} style={styles.linhaSubtotalTurno}>
                              Subtotal {turno.turnoNome} ({periodoTurno(turno)}): {turno.pessoas.length} pessoa(s)
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                      <tr>
                        <td colSpan={7} style={styles.linhaSubtotalDia}>
                          Subtotal do dia {formatarDataBr(dia.data)}: {dia.subtotalDia} pessoa(s)
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={styles.totaisGerais}>
              <p style={styles.totalGeralTexto}>
                Total geral no período: <strong>{presencaAgrupada.totalGeral} pessoa(s)</strong>
              </p>
              <p style={{ margin: '6px 0 4px', fontWeight: 700, color: NAVY, fontSize: 13 }}>
                Total geral no período por turno:
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#333' }}>
                {presencaAgrupada.totalPorTurno.map((t) => (
                  <li key={t.turnoId}>
                    {t.turnoNome} ({periodoTurno(t)}): {t.subtotal} pessoa(s)
                  </li>
                ))}
              </ul>
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

      {modalCard && (
        <div style={styles.overlay} onClick={() => setModalCard(null)}>
          <div style={styles.modalOcorrencias} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: NAVY }}>
              {modalCard === 'operacoes' && 'Operações no período'}
              {modalCard === 'planejado' && 'Planejado'}
              {modalCard === 'absenteismo' && 'Absenteísmo (planejado × presente)'}
            </h3>
            <p style={ui.placeholderNote}>
              {nomeClienteAtual} — {formatarDataBr(dataInicio)} a {formatarDataBr(dataFim)}
            </p>

            {modalCard === 'operacoes' &&
              (registrosParaModal.length === 0 ? (
                <p style={ui.placeholderNote}>Nenhuma operação válida no período.</p>
              ) : (
                <div style={ui.tableWrapper}>
                  <table style={ui.table}>
                    <thead>
                      <tr>
                        <th style={ui.th}>Início</th>
                        {!clienteId && <th style={ui.th}>Cliente</th>}
                        <th style={ui.th}>Tipo</th>
                        <th style={ui.th}>Operação</th>
                        <th style={ui.th}>Documento</th>
                        <th style={ui.th}>Volumes</th>
                        <th style={ui.th}>MdO</th>
                        <th style={ui.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registrosParaModal.map((r) => (
                        <tr key={r.id}>
                          <td style={ui.td}>{formatarDataHoraCurta(r.inicio)}</td>
                          {!clienteId && <td style={ui.td}>{nomeClientePorId(r.clienteId)}</td>}
                          <td style={ui.td}>{nomeTipo(r.tipoOperacaoId) || '(removido)'}</td>
                          <td style={ui.td}>{nomeFluxo(r.fluxoId) || '(removido)'}</td>
                          <td style={ui.td}>{r.documentoProcesso}</td>
                          <td style={ui.td}>
                            {r.qtdVolumes} {r.tipoVolume || ''}
                          </td>
                          <td style={ui.td}>{r.qtdMdo}</td>
                          <td style={ui.td}>
                            <span style={{ ...ui.badge, ...(r.fim ? ui.badgeVerde : ui.badgeAzul) }}>
                              {r.fim ? 'Finalizada' : '🟢 Em andamento'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {modalCard === 'planejado' &&
              (planejamentosParaModal.length === 0 ? (
                <p style={ui.placeholderNote}>Nenhum planejamento no período.</p>
              ) : (
                <div style={ui.tableWrapper}>
                  <table style={ui.table}>
                    <thead>
                      <tr>
                        <th style={ui.th}>Data</th>
                        {!clienteId && <th style={ui.th}>Cliente</th>}
                        <th style={ui.th}>Turno</th>
                        <th style={ui.th}>Qtd. MdO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {planejamentosParaModal.map((p) => (
                        <tr key={p.id}>
                          <td style={ui.td}>{formatarDataBr(p.data)}</td>
                          {!clienteId && <td style={ui.td}>{nomeClientePorId(p.clienteId)}</td>}
                          <td style={ui.td}>{nomeTurno(p.turnoId)}</td>
                          <td style={ui.td}>{p.qtdMdo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {modalCard === 'absenteismo' &&
              (dadosAbsenteismo.every((d) => d.planejado === 0 && d.presente === 0) ? (
                <p style={ui.placeholderNote}>Sem planejamento nem presença no período.</p>
              ) : (
                <div style={ui.tableWrapper}>
                  <table style={ui.table}>
                    <thead>
                      <tr>
                        <th style={ui.th}>Data</th>
                        <th style={ui.th}>Planejado</th>
                        <th style={ui.th}>Presente</th>
                        <th style={ui.th}>Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dadosAbsenteismo
                        .filter((d) => d.planejado > 0 || d.presente > 0)
                        .map((d) => (
                          <tr key={d.data}>
                            <td style={ui.td}>{formatarDataBr(d.data)}</td>
                            <td style={ui.td}>{d.planejado}</td>
                            <td style={ui.td}>{d.presente}</td>
                            <td style={ui.td}>
                              <span
                                style={{
                                  ...ui.badge,
                                  ...(d.presente >= d.planejado ? ui.badgeVerde : ui.badgeVermelho)
                                }}
                              >
                                {d.presente - d.planejado > 0 ? '+' : ''}
                                {d.presente - d.planejado}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ))}

            <div style={{ marginTop: 20 }}>
              <button style={ui.secondaryButton} onClick={() => setModalCard(null)}>
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

  // Cards de resumo com mais destaque (09/09/2026, pedido do Pablo) —
  // valor bem maior, faixa colorida à esquerda (cor por card/gravidade,
  // ver corAbsenteismo) e clicáveis (abrem o drill-down em `modalCard`).
  // O card "Presente" foi removido a pedido dele (media com o card de
  // Operações, que é de outra grandeza).
  cardDestaque: {
    background: '#FFF',
    borderRadius: 8,
    padding: '20px 22px 16px',
    minWidth: 170,
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    borderLeft: '5px solid transparent',
    cursor: 'pointer',
    transition: 'box-shadow 0.15s, transform 0.15s'
  },
  cardDestaqueValor: { fontSize: 36, fontWeight: 800, lineHeight: 1.1 },
  cardDestaqueLabel: { fontSize: 13, color: '#666', marginTop: 6, fontWeight: 600 },
  cardDestaqueDica: { fontSize: 11, color: '#999', marginTop: 10 },

  // Modal de drill-down dos cards acima — mesmo padrão visual dos outros
  // modais da tela (overlay + card centralizado).
  modalOcorrencias: {
    background: '#FFF',
    borderRadius: 10,
    padding: '24px 28px',
    maxWidth: 720,
    width: '94%',
    maxHeight: '88vh',
    overflowY: 'auto',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)'
  },

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
  listaOrange: { height: 3, background: '#FF6B00', margin: '14px 0 18px', borderRadius: 2 },

  // Linhas de subtotal (turno/dia) intercaladas na mesma tabela — mais
  // claras que uma linha normal, texto em itálico, pra separar visualmente
  // "gente confirmada" de "resumo calculado".
  linhaSubtotalTurno: {
    padding: '6px 16px',
    fontSize: 12,
    fontStyle: 'italic',
    color: '#666',
    background: '#FBFBFB',
    borderBottom: '1px solid #EEE'
  },
  linhaSubtotalDia: {
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 700,
    color: NAVY,
    background: '#F0F3F7',
    borderBottom: '2px solid #E5E5E5'
  },
  totaisGerais: {
    marginTop: 18,
    padding: '14px 16px',
    background: '#F7F8FA',
    borderRadius: 8,
    border: '1px solid #E5E5E5'
  },
  totalGeralTexto: { margin: 0, fontSize: 14, color: NAVY }
};
