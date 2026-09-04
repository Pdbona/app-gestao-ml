import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { ui, NAVY } from '../lib/styles';
import { limparSelfiesVencidas } from '../lib/limpezaSelfies';
import { limparFotosOperacaoVencidas } from '../lib/limpezaFotosOperacao';
import { gerarRomaneioPdf } from '../lib/romaneio';
import { obterLogoMlBase64 } from '../lib/logoAssets';
import { hojeISO, addDiasISO, labelDataCurta, paraMillis, ehMesmoDia, formatarHorario } from '../lib/data';
import ChartCanvas, { CORES_CATEGORICAS, COR_GRADE, COR_INK_MUTED } from './ChartCanvas';

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function labelMes(chaveAnoMes) {
  const [ano, mes] = chaveAnoMes.split('-');
  return `${MESES_ABREV[Number(mes) - 1]}/${ano.slice(2)}`;
}

// Cores fixas por MÉTRICA (não por categoria) — Operações e Tempo médio
// aparecem juntas nos dois painéis combinados abaixo, então usam sempre os
// mesmos 2 slots categóricos (skill dataviz: "color follows the entity,
// never its rank" — cada painel de barra por cliente/mês passou a usar 1
// cor só, em vez de uma cor por barra, já que a categoria já está no eixo).
const COR_OPERACOES = CORES_CATEGORICAS[0]; // slot 1 — azul
const COR_TEMPO = CORES_CATEGORICAS[1]; // slot 2 — laranja

function hexParaRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Largura do eixo Y travada em 40px nos dois mini-gráficos de um mesmo
// painel — sem isso, o eixo de "Operações" (números tipo "4") e o de
// "Tempo médio" (números tipo "180") teriam larguras diferentes e as
// colunas/pontos dos dois gráficos ficariam desalinhados verticalmente.
function travarLarguraEixoY(scale) {
  scale.width = 40;
}

const OPCOES_EIXO_Y_BASE = {
  beginAtZero: true,
  afterFit: travarLarguraEixoY,
  grid: { color: COR_GRADE },
  ticks: { color: COR_INK_MUTED, font: { size: 10 }, precision: 0 }
};

// ======== Painel combinado (skill dataviz: nunca eixo duplo — em vez
// disso, 2 mini-gráficos empilhados com o MESMO eixo X, cada um com seu
// próprio eixo Y de escala própria). Pra "por mês" (eixo temporal), o
// painel de baixo é uma LINHA (tendência ao longo do tempo); pra "por
// cliente" (eixo nominal, sem ordem natural), os dois painéis são barra
// — uma linha ligando clientes sem ordem sugeriria uma tendência que não
// existe. ========
function PainelIndicador({ titulo, labels, valoresOperacoes, valoresTempo, tipoTempo }) {
  const semDados = labels.length === 0;
  return (
    <div style={styles.painelCard}>
      <div style={styles.painelHeader}>
        <h4 style={styles.graficoTitulo}>{titulo}</h4>
        <div style={styles.painelLegenda}>
          <span style={styles.legendaItem}>
            <span style={{ ...styles.legendaSwatch, background: COR_OPERACOES }} /> Operações
          </span>
          <span style={styles.legendaItem}>
            <span style={{ ...styles.legendaSwatch, background: COR_TEMPO }} /> Tempo médio
          </span>
        </div>
      </div>
      {semDados ? (
        <p style={{ ...ui.placeholderNote, margin: '8px 0 0' }}>Sem dados suficientes ainda.</p>
      ) : (
        <>
          <ChartCanvas
            tipo="bar"
            altura={90}
            dados={{
              labels,
              datasets: [
                {
                  label: 'Operações',
                  data: valoresOperacoes,
                  backgroundColor: COR_OPERACOES,
                  borderRadius: 4,
                  maxBarThickness: 24
                }
              ]
            }}
            opcoes={{
              scales: {
                x: { display: false, grid: { display: false } },
                y: OPCOES_EIXO_Y_BASE
              },
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} operação(ões)` } }
              }
            }}
          />
          <div style={styles.painelDivisor} />
          <ChartCanvas
            tipo={tipoTempo}
            altura={130}
            dados={{
              labels,
              datasets: [
                {
                  label: 'Tempo médio (min)',
                  data: valoresTempo,
                  ...(tipoTempo === 'line'
                    ? {
                        borderColor: COR_TEMPO,
                        backgroundColor: hexParaRgba(COR_TEMPO, 0.1),
                        borderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: COR_TEMPO,
                        pointBorderColor: '#FFF',
                        pointBorderWidth: 2,
                        fill: true,
                        tension: 0.3
                      }
                    : { backgroundColor: COR_TEMPO, borderRadius: 4, maxBarThickness: 24 })
                }
              ]
            }}
            opcoes={{
              scales: {
                x: { grid: { display: false }, ticks: { color: COR_INK_MUTED, font: { size: 10 } } },
                y: OPCOES_EIXO_Y_BASE
              },
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} min` } }
              }
            }}
          />
        </>
      )}
    </div>
  );
}

const LOGO_ML_URL = `${process.env.PUBLIC_URL}/logos/logo-ml.png`;

// Tolerância fixa combinada com o Pablo: 15min depois do início do turno,
// se ainda faltar gente confirmar presença, dispara o alerta.
const TOLERANCIA_ATRASO_MINUTOS = 15;

function limiteAtrasoAtingido(horaInicio, agora) {
  if (!horaInicio) return false;
  const [h, m] = horaInicio.split(':').map(Number);
  const limite = new Date(agora);
  limite.setHours(h, m + TOLERANCIA_ATRASO_MINUTOS, 0, 0);
  return agora > limite;
}

// completo | sem_reposicao | alerta | aguardando
function statusItem(item) {
  if (item.presente >= item.planejado) return 'completo';
  if (item.faltaAceita) return 'sem_reposicao';
  if (item.atrasado) return 'alerta';
  return 'aguardando';
}

const STATUS_INFO = {
  completo: { label: 'Completo', estilo: 'badgeVerde' },
  sem_reposicao: { label: 'Sem reposição', estilo: 'badgeCinza' },
  alerta: { label: 'Faltam', estilo: 'badgeVermelho' },
  aguardando: { label: 'Aguardando', estilo: 'badgeLaranja' }
};

const BORDA_STATUS = {
  completo: '#CDEBD6',
  sem_reposicao: '#E0E0E0',
  alerta: '#F3C0C0',
  aguardando: '#FFE0BD'
};

export default function DashboardTab() {
  const [clientes, setClientes] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [planejamentos, setPlanejamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [tiposOperacao, setTiposOperacao] = useState([]);
  const [fluxos, setFluxos] = useState([]);
  const [agora, setAgora] = useState(Date.now());

  const [expandidos, setExpandidos] = useState({});
  const [modalFalta, setModalFalta] = useState(null);
  const [novaQtd, setNovaQtd] = useState('');
  const [salvandoFalta, setSalvandoFalta] = useState(false);
  const [erroFalta, setErroFalta] = useState('');
  const [abrindoRomaneioId, setAbrindoRomaneioId] = useState(null);
  const [modalRomaneio, setModalRomaneio] = useState(null);
  const [baixandoPdf, setBaixandoPdf] = useState(false);

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'clientes'), (snap) => setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'turnos'), (snap) => setTurnos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'planejamentoOperacional'), (snap) =>
        setPlanejamentos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(collection(db, 'presencas'), (snap) => setPresencas(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'registrosOperacao'), (snap) =>
        setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(collection(db, 'tiposOperacao'), (snap) => setTiposOperacao(snap.docs.map((d) => ({ id: d.id, ...d.data() })))),
      onSnapshot(collection(db, 'fluxos'), (snap) => setFluxos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))))
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  // Limpeza "preguiçosa" de selfie/fotos vencidas — roda 1x quando o
  // Administrativo abre o Dashboard (ver lib/limpezaSelfies.js e
  // lib/limpezaFotosOperacao.js).
  useEffect(() => {
    limparSelfiesVencidas().catch(() => {});
    limparFotosOperacaoVencidas().catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const hoje = hojeISO();
  const proximasDatas = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDiasISO(hoje, i)), [hoje]);

  const cliente = (id) => clientes.find((c) => c.id === id);
  const nomeCliente = (id) => cliente(id)?.nome || '(cliente removido)';
  const nomeTurno = (id) => turnos.find((t) => t.id === id)?.nome || '(turno removido)';
  const nomeTipo = (id) => tiposOperacao.find((t) => t.id === id)?.nome || '(tipo removido)';
  const nomeFluxo = (id) => fluxos.find((f) => f.id === id)?.nome || '(operação removida)';

  const formatarHoraMin = (minutos) => {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Cor de destaque do nome da Operação (fluxo) nos cards — pedido do
  // Pablo: Recebimento azul, Expedição vermelho, Separação laranja,
  // Outros preto. Casa pelo nome (sem acento/maiúscula) em vez de um id
  // fixo, porque Fluxo é um cadastro livre — nomes fora desses 4 ficam
  // sem destaque (cor padrão do texto).
  const corFluxo = (nome) => {
    const chave = (nome || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    if (chave.includes('recebimento')) return '#2a78d6';
    if (chave.includes('expedicao')) return '#e34948';
    if (chave.includes('separacao')) return '#eb6834';
    if (chave.includes('outros')) return '#0b0b0b';
    return undefined;
  };

  // ======== Seção 1: Operações do dia (Coletor), por cliente ========
  const operacoesHojePorCliente = useMemo(() => {
    const porCliente = {};
    registros
      .filter((r) => ehMesmoDia(r.inicio, hoje))
      .forEach((r) => {
        const chave = r.clienteId || '_semCliente';
        if (!porCliente[chave]) porCliente[chave] = [];
        porCliente[chave].push(r);
      });
    // Em andamento sempre primeiro (entre elas, início mais recente primeiro
    // — pedido do Pablo); depois as finalizadas, por finalização mais
    // recente primeiro.
    const ordenarOperacoes = (a, b) => {
      const aAndamento = !a.fim;
      const bAndamento = !b.fim;
      if (aAndamento !== bAndamento) return aAndamento ? -1 : 1;
      if (aAndamento) return (paraMillis(b.inicio) || 0) - (paraMillis(a.inicio) || 0);
      return (paraMillis(b.fim) || 0) - (paraMillis(a.fim) || 0);
    };
    return Object.entries(porCliente)
      .map(([clienteId, itensBrutos]) => {
        const itens = itensBrutos.sort(ordenarOperacoes);
        const resumo = {
          totalOperacoes: itens.length,
          tempoTotalMinutos: itens.reduce((soma, op) => soma + (op.tempoRealMinutos || 0), 0),
          totalVolumes: itens.reduce((soma, op) => soma + (Number(op.qtdVolumes) || 0), 0)
        };
        return { clienteId, itens, resumo };
      })
      .sort((a, b) =>
        (a.clienteId === '_semCliente' ? 'zzz' : nomeCliente(a.clienteId)).localeCompare(
          b.clienteId === '_semCliente' ? 'zzz' : nomeCliente(b.clienteId)
        )
      );
  }, [registros, hoje]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clicar em "Ver romaneio" só busca as fotos e abre a prévia em tela —
  // o PDF de verdade só é gerado se o usuário clicar em "Baixar PDF" lá
  // dentro (pedido do Pablo: "gerar em tela e dar opção pra PDF, não
  // gerar PDF direto").
  const abrirRomaneio = async (op) => {
    setAbrindoRomaneioId(op.id);
    try {
      const fotosSnap = await getDocs(collection(db, 'registrosOperacao', op.id, 'fotos'));
      const todasFotos = fotosSnap.docs.map((d) => d.data());
      setModalRomaneio({
        op,
        fotosInicio: todasFotos.filter((f) => f.tipo === 'inicio').sort((a, b) => a.ordem - b.ordem),
        fotosFim: todasFotos.filter((f) => f.tipo === 'fim').sort((a, b) => a.ordem - b.ordem)
      });
    } catch (e) {
      window.alert('Falha ao carregar o romaneio. Tente novamente.');
    } finally {
      setAbrindoRomaneioId(null);
    }
  };

  const fecharRomaneio = () => setModalRomaneio(null);

  const baixarRomaneioPdf = async () => {
    const { op, fotosInicio, fotosFim } = modalRomaneio;
    setBaixandoPdf(true);
    try {
      const logoMlBase64 = await obterLogoMlBase64();
      await gerarRomaneioPdf({
        clienteNome: nomeCliente(op.clienteId),
        tipoNome: nomeTipo(op.tipoOperacaoId),
        fluxoNome: nomeFluxo(op.fluxoId),
        documentoProcesso: op.documentoProcesso,
        qtdVolumes: op.qtdVolumes,
        qtdMdo: op.qtdMdo,
        usuarioNome: op.usuarioNome,
        inicio: op.inicio,
        fim: op.fim,
        tempoRealMinutos: op.tempoRealMinutos,
        observacao: op.observacao,
        fotosInicio,
        fotosFim,
        logoMlBase64,
        logoClienteBase64: cliente(op.clienteId)?.logoBase64 || null
      });
    } catch (e) {
      window.alert('Falha ao gerar o PDF. Tente novamente.');
    } finally {
      setBaixandoPdf(false);
    }
  };

  // ======== Seção 2: Presença do dia (planejado × confirmado) ========
  const cardsPresencaHoje = useMemo(() => {
    const presencasHoje = presencas.filter((p) => p.data === hoje);
    const porCliente = {};
    planejamentos
      .filter((p) => p.data === hoje)
      .forEach((p) => {
        const turno = turnos.find((t) => t.id === p.turnoId);
        const presentesGrupo = presencasHoje.filter((pr) => pr.clienteId === p.clienteId && pr.turnoId === p.turnoId);
        const item = {
          planejamentoId: p.id,
          turnoId: p.turnoId,
          turnoNome: turno?.nome || '(turno removido)',
          horaInicio: turno?.horaInicio,
          planejado: p.qtdMdo,
          presente: presentesGrupo.length,
          presentesGrupo,
          atrasado: limiteAtrasoAtingido(turno?.horaInicio, agora),
          faltaAceita: Boolean(p.faltaAceita),
          faltaAceitaQtd: p.faltaAceitaQtd || 0
        };
        if (!porCliente[p.clienteId]) porCliente[p.clienteId] = [];
        porCliente[p.clienteId].push(item);
      });
    return Object.entries(porCliente)
      .map(([clienteId, itens]) => ({
        clienteId,
        itens: itens.sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''))
      }))
      .sort((a, b) => nomeCliente(a.clienteId).localeCompare(nomeCliente(b.clienteId)));
  }, [planejamentos, presencas, turnos, agora, hoje]); // eslint-disable-line react-hooks/exhaustive-deps

  // ======== Seção 3: próximos 7 dias, em card por dia ========
  const cardsProximosDias = useMemo(
    () =>
      proximasDatas.map((data, i) => ({
        data,
        label: labelDataCurta(data, i === 0),
        itens: planejamentos
          .filter((p) => p.data === data)
          .sort((a, b) => nomeCliente(a.clienteId).localeCompare(nomeCliente(b.clienteId)))
      })),
    [proximasDatas, planejamentos] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ======== Seção 4: indicadores de tempo realizado ========
  const indicadoresTempo = useMemo(() => {
    const finalizadas = registros.filter((r) => r.fim && r.tempoRealMinutos);
    const mediaGeral = finalizadas.length
      ? Math.round(finalizadas.reduce((soma, r) => soma + r.tempoRealMinutos, 0) / finalizadas.length)
      : null;

    const porCliente = {};
    finalizadas.forEach((r) => {
      const chave = r.clienteId || '_semCliente';
      if (!porCliente[chave]) porCliente[chave] = [];
      porCliente[chave].push(r.tempoRealMinutos);
    });
    const porClienteLista = Object.entries(porCliente)
      .map(([clienteId, tempos]) => ({
        clienteId,
        media: Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length),
        qtd: tempos.length
      }))
      .sort((a, b) =>
        (a.clienteId === '_semCliente' ? 'zzz' : nomeCliente(a.clienteId)).localeCompare(
          b.clienteId === '_semCliente' ? 'zzz' : nomeCliente(b.clienteId)
        )
      );

    const porMes = {};
    finalizadas.forEach((r) => {
      const ms = paraMillis(r.inicio);
      if (!ms) return;
      const d = new Date(ms);
      const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!porMes[chave]) porMes[chave] = [];
      porMes[chave].push(r.tempoRealMinutos);
    });
    const porMesLista = Object.entries(porMes)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6) // últimos 6 meses com dado, pra não lotar o gráfico com o tempo
      .map(([mes, tempos]) => ({
        mes,
        media: Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length),
        qtd: tempos.length
      }));

    return { mediaGeral, totalOperacoes: finalizadas.length, porCliente: porClienteLista, porMes: porMesLista };
  }, [registros]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirModalFalta = (item, clienteId) => {
    setModalFalta({ ...item, clienteId, clienteNome: nomeCliente(clienteId) });
    setNovaQtd(String(item.planejado));
    setErroFalta('');
  };
  const fecharModalFalta = () => {
    setModalFalta(null);
    setErroFalta('');
  };
  const toggleExpandido = (chave) => setExpandidos((e) => ({ ...e, [chave]: !e[chave] }));

  const salvarNovaQtd = async () => {
    const qtd = Number(novaQtd);
    if (!qtd || qtd <= 0) {
      setErroFalta('Informe uma quantidade válida.');
      return;
    }
    setSalvandoFalta(true);
    setErroFalta('');
    try {
      await updateDoc(doc(db, 'planejamentoOperacional', modalFalta.planejamentoId), {
        qtdMdo: qtd,
        faltaAceita: false,
        faltaAceitaQtd: 0
      });
      fecharModalFalta();
    } catch (e) {
      setErroFalta('Falha ao salvar. Tente novamente.');
    } finally {
      setSalvandoFalta(false);
    }
  };

  const confirmarSemReposicao = async () => {
    setSalvandoFalta(true);
    setErroFalta('');
    try {
      await updateDoc(doc(db, 'planejamentoOperacional', modalFalta.planejamentoId), {
        faltaAceita: true,
        faltaAceitaQtd: modalFalta.planejado - modalFalta.presente,
        faltaAceitaEm: serverTimestamp()
      });
      fecharModalFalta();
    } catch (e) {
      setErroFalta('Falha ao salvar. Tente novamente.');
    } finally {
      setSalvandoFalta(false);
    }
  };

  return (
    <div>
      <h2 style={ui.sectionTitle}>Dashboard</h2>

      {/* ===== 1) Operações em andamento e finalizadas por cliente, hoje ===== */}
      <h3 style={{ ...ui.sectionTitle, fontSize: 16 }}>Operações do dia</h3>
      {operacoesHojePorCliente.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhuma operação registrada no Coletor hoje.</p>
      ) : (
        <div style={styles.cardsGrid}>
          {operacoesHojePorCliente.map(({ clienteId, itens, resumo }) => {
            const c = cliente(clienteId);
            const temEmAndamento = itens.some((op) => !op.fim);
            return (
              <div
                key={clienteId}
                style={{ ...styles.clienteCard, borderColor: temEmAndamento ? '#BFD4EA' : '#E5E5E5' }}
              >
                <div style={styles.clienteCardHeader}>
                  {c?.logoBase64 && <img src={c.logoBase64} alt="" style={styles.cardLogo} />}
                  <strong>{clienteId === '_semCliente' ? '(sem cliente informado)' : nomeCliente(clienteId)}</strong>
                </div>
                <div style={styles.resumoCard}>
                  <span>{resumo.totalOperacoes} operação(ões)</span>
                  <span>⏱ {formatarHoraMin(resumo.tempoTotalMinutos)}</span>
                  <span>📦 {resumo.totalVolumes} volume(s)</span>
                </div>
                {itens.map((op) => {
                  const nomeFluxoOp = nomeFluxo(op.fluxoId);
                  return (
                  <div key={op.id} style={styles.operacaoRow}>
                    <div style={styles.operacaoTopo}>
                      <span style={styles.turnoNome}>
                        {nomeTipo(op.tipoOperacaoId)} — <span style={{ color: corFluxo(nomeFluxoOp) }}>{nomeFluxoOp}</span>
                      </span>
                      {op.fim ? (
                        <span style={{ ...ui.badge, ...ui.badgeVerde }}>
                          Finalizada {op.tempoRealMinutos ? `(${op.tempoRealMinutos}min)` : ''}
                        </span>
                      ) : (
                        <span style={{ ...ui.badge, ...ui.badgeAzul }}>🟢 Em andamento</span>
                      )}
                    </div>
                    <div style={styles.operacaoDetalhe}>
                      Doc {op.documentoProcesso} · {op.qtdVolumes} volume(s) · {op.qtdMdo} MdO ·{' '}
                      {formatarHorario(op.inicio)}
                      {op.fim ? ` – ${formatarHorario(op.fim)}` : ''}
                    </div>
                    {op.fim && (
                      <button
                        type="button"
                        style={ui.linkButton}
                        onClick={() => abrirRomaneio(op)}
                        disabled={abrindoRomaneioId === op.id}
                      >
                        {abrindoRomaneioId === op.id ? 'Carregando...' : '📄 Ver romaneio'}
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 2) Planejamento e confirmação de presença por cliente, hoje ===== */}
      <h3 style={{ ...ui.sectionTitle, fontSize: 16, marginTop: 28 }}>Presença do dia</h3>
      {cardsPresencaHoje.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhuma operação planejada pra hoje ainda.</p>
      ) : (
        <div style={styles.cardsGrid}>
          {cardsPresencaHoje.map(({ clienteId, itens }) => {
            const statusPiores = itens.map(statusItem);
            const corBorda = statusPiores.includes('alerta')
              ? BORDA_STATUS.alerta
              : statusPiores.includes('aguardando')
              ? BORDA_STATUS.aguardando
              : statusPiores.includes('sem_reposicao')
              ? BORDA_STATUS.sem_reposicao
              : BORDA_STATUS.completo;
            const c = cliente(clienteId);
            return (
              <div key={clienteId} style={{ ...styles.clienteCard, borderColor: corBorda }}>
                <div style={styles.clienteCardHeader}>
                  {c?.logoBase64 && <img src={c.logoBase64} alt="" style={styles.cardLogo} />}
                  <strong>{nomeCliente(clienteId)}</strong>
                </div>
                {itens.map((item) => {
                  const status = statusItem(item);
                  const info = STATUS_INFO[status];
                  const temFalta = item.presente < item.planejado;
                  const expandido = Boolean(expandidos[item.planejamentoId]);
                  return (
                    <div key={item.turnoId}>
                      <div
                        style={{ ...styles.turnoRow, ...styles.turnoRowClicavel }}
                        onClick={
                          temFalta
                            ? () => abrirModalFalta(item, clienteId)
                            : () => toggleExpandido(item.planejamentoId)
                        }
                      >
                        <div>
                          <div style={styles.turnoNome}>{item.turnoNome}</div>
                          <div style={styles.turnoHora}>{item.horaInicio || '--:--'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={styles.turnoQtd}>
                            {item.presente}/{item.planejado}
                          </div>
                          <span style={{ ...ui.badge, ...ui[info.estilo] }}>
                            {status === 'alerta' ? `Faltam ${item.planejado - item.presente}` : info.label}
                          </span>
                        </div>
                      </div>
                      {!temFalta && expandido && (
                        <div style={styles.turnoDetalhe}>
                          {item.presentesGrupo.length === 0 ? (
                            <p style={{ ...ui.placeholderNote, margin: 0 }}>Ninguém confirmou presença ainda.</p>
                          ) : (
                            <ul style={{ margin: 0, paddingLeft: 16 }}>
                              {item.presentesGrupo.map((p) => (
                                <li key={p.id}>
                                  {p.colaboradorNome} — {formatarHorario(p.dataHoraCheckin)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 3) Planejamento dos próximos 7 dias, em cards ===== */}
      <h3 style={{ ...ui.sectionTitle, fontSize: 16, marginTop: 28 }}>Planejamento — próximos 7 dias</h3>
      <div style={styles.cardsGrid7Dias}>
        {cardsProximosDias.map((dia) => (
          <div key={dia.data} style={styles.diaCard}>
            <div style={styles.diaCardHeader}>{dia.label}</div>
            {dia.itens.length === 0 ? (
              <p style={styles.diaCardVazio}>Nada planejado</p>
            ) : (
              dia.itens.map((p) => (
                <div key={p.id} style={styles.diaCardItem}>
                  <div style={styles.diaCardCliente}>{nomeCliente(p.clienteId)}</div>
                  <div style={styles.diaCardTurno}>
                    {nomeTurno(p.turnoId)} · {p.qtdMdo} MdO
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      {/* ===== 4) Indicadores de tempo realizado ===== */}
      <h3 style={{ ...ui.sectionTitle, fontSize: 16, marginTop: 28 }}>Indicadores de tempo realizado</h3>
      {indicadoresTempo.totalOperacoes === 0 ? (
        <p style={ui.placeholderNote}>Ainda não há operações finalizadas pra calcular indicadores.</p>
      ) : (
        <>
          <div style={ui.cardsRow}>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{indicadoresTempo.mediaGeral}min</div>
              <div style={ui.statLabel}>Tempo médio geral</div>
            </div>
            <div style={ui.statCard}>
              <div style={ui.statValue}>{indicadoresTempo.totalOperacoes}</div>
              <div style={ui.statLabel}>Operações finalizadas</div>
            </div>
          </div>
          <div style={styles.graficosIndicadoresGrid}>
            <PainelIndicador
              titulo="Por mês"
              labels={indicadoresTempo.porMes.map((m) => labelMes(m.mes))}
              valoresOperacoes={indicadoresTempo.porMes.map((m) => m.qtd)}
              valoresTempo={indicadoresTempo.porMes.map((m) => m.media)}
              tipoTempo="line"
            />
            <PainelIndicador
              titulo="Por cliente"
              labels={indicadoresTempo.porCliente.map((c) =>
                c.clienteId === '_semCliente' ? '(sem cliente)' : nomeCliente(c.clienteId)
              )}
              valoresOperacoes={indicadoresTempo.porCliente.map((c) => c.qtd)}
              valoresTempo={indicadoresTempo.porCliente.map((c) => c.media)}
              tipoTempo="bar"
            />
          </div>
        </>
      )}

      {modalFalta && (
        <div style={styles.overlay} onClick={fecharModalFalta}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: NAVY }}>
              {modalFalta.clienteNome} — {modalFalta.turnoNome}
            </h3>
            <p style={ui.placeholderNote}>
              Planejado: {modalFalta.planejado} · Presente: {modalFalta.presente} · Faltam:{' '}
              {modalFalta.planejado - modalFalta.presente}
            </p>
            {modalFalta.faltaAceita && (
              <p style={{ ...ui.badge, ...ui.badgeCinza, display: 'inline-block', marginBottom: 14 }}>
                Já marcado como sem reposição
              </p>
            )}

            <label style={{ ...ui.label, marginBottom: 14 }}>
              Alterar quantidade planejada pra hoje
              <input
                type="number"
                min="1"
                style={ui.input}
                value={novaQtd}
                onChange={(e) => setNovaQtd(e.target.value)}
              />
            </label>

            {erroFalta && <div style={ui.erro}>❌ {erroFalta}</div>}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button style={ui.primaryButton} onClick={salvarNovaQtd} disabled={salvandoFalta}>
                {salvandoFalta ? 'Salvando...' : 'Salvar nova quantidade'}
              </button>
              <button style={ui.secondaryButton} onClick={confirmarSemReposicao} disabled={salvandoFalta}>
                Confirmar que não será reposto
              </button>
            </div>
            <p style={{ ...ui.placeholderNote, marginTop: 10 }}>
              "Confirmar que não será reposto" mantém o planejado original (fica no histórico como
              falta sem reposição) e encerra o alerta de hoje.
            </p>

            <button style={{ ...ui.linkButton, marginTop: 6 }} onClick={fecharModalFalta}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {modalRomaneio && (
        <div style={styles.overlay} onClick={fecharRomaneio}>
          <div style={styles.modalRomaneio} onClick={(e) => e.stopPropagation()}>
            <div style={styles.romaneioCabecalho}>
              <img src={LOGO_ML_URL} alt="ML Serviços" style={styles.romaneioLogoMl} />
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: 0, color: NAVY }}>Romaneio de Operação</h3>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#666' }}>{nomeCliente(modalRomaneio.op.clienteId)}</p>
              </div>
              {cliente(modalRomaneio.op.clienteId)?.logoBase64 ? (
                <img src={cliente(modalRomaneio.op.clienteId).logoBase64} alt="" style={styles.romaneioLogoCliente} />
              ) : (
                <div style={{ width: 44 }} />
              )}
            </div>
            <div style={styles.romaneioOrange} />

            <div style={styles.romaneioGrid}>
              <div>
                <strong>Tipo de Operação:</strong> {nomeTipo(modalRomaneio.op.tipoOperacaoId)}
              </div>
              <div>
                <strong>Operação:</strong> {nomeFluxo(modalRomaneio.op.fluxoId)}
              </div>
              <div>
                <strong>Documento:</strong> {modalRomaneio.op.documentoProcesso}
              </div>
              <div>
                <strong>Qtd. de volumes:</strong> {modalRomaneio.op.qtdVolumes}
              </div>
              <div>
                <strong>Qtd. de MdO:</strong> {modalRomaneio.op.qtdMdo}
              </div>
              <div>
                <strong>Colaborador:</strong> {modalRomaneio.op.usuarioNome}
              </div>
              <div>
                <strong>Início:</strong> {formatarHorario(modalRomaneio.op.inicio)}
              </div>
              <div>
                <strong>Fim:</strong> {formatarHorario(modalRomaneio.op.fim)}
                {modalRomaneio.op.tempoRealMinutos ? ` (${modalRomaneio.op.tempoRealMinutos} min)` : ''}
              </div>
              {modalRomaneio.op.observacao && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <strong>Observação:</strong> {modalRomaneio.op.observacao}
                </div>
              )}
            </div>

            {modalRomaneio.fotosInicio.length > 0 && (
              <>
                <p style={styles.romaneioFotoTitulo}>Fotos de início</p>
                <div style={styles.romaneioFotosGrid}>
                  {modalRomaneio.fotosInicio.map((f, i) => (
                    <img key={i} src={f.base64} alt="" style={styles.romaneioFoto} />
                  ))}
                </div>
              </>
            )}
            {modalRomaneio.fotosFim.length > 0 && (
              <>
                <p style={styles.romaneioFotoTitulo}>Fotos de fim</p>
                <div style={styles.romaneioFotosGrid}>
                  {modalRomaneio.fotosFim.map((f, i) => (
                    <img key={i} src={f.base64} alt="" style={styles.romaneioFoto} />
                  ))}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button style={ui.primaryButton} onClick={baixarRomaneioPdf} disabled={baixandoPdf}>
                {baixandoPdf ? 'Gerando...' : '⬇️ Baixar PDF'}
              </button>
              <button style={ui.secondaryButton} onClick={fecharRomaneio}>
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
  // Largura MÁXIMA fixa (não 1fr) pra pedido do Pablo: card de Operações do
  // dia/Presença do dia não deve esticar pra preencher a linha inteira
  // quando tem só 1-2 clientes — fica sempre do tamanho equivalente a
  // caberem uns 4 lado a lado, mesmo sobrando espaço vazio na linha.
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 300px))',
    gap: 16,
    marginBottom: 8
  },
  clienteCard: {
    background: '#FFF',
    borderRadius: 10,
    border: '2px solid #E5E5E5',
    padding: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  },
  clienteCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottom: '1px solid #F0F0F0',
    color: NAVY,
    fontSize: 15
  },
  cardLogo: { width: 52, height: 52, objectFit: 'contain', borderRadius: 8, background: '#FAFAFA', flexShrink: 0 },

  resumoCard: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    fontSize: 11,
    fontWeight: 600,
    color: '#666',
    background: '#F7F8FA',
    borderRadius: 6,
    padding: '6px 10px',
    marginBottom: 8
  },

  operacaoRow: { padding: '8px 6px', borderBottom: '1px solid #F5F5F5' },
  operacaoTopo: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  operacaoDetalhe: { fontSize: 12, color: '#666' },

  turnoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 6px',
    borderRadius: 6
  },
  turnoRowClicavel: { cursor: 'pointer', background: '#FBF6F1' },
  turnoNome: { fontSize: 13, fontWeight: 600, color: '#333' },
  turnoHora: { fontSize: 11, color: '#999' },
  turnoQtd: { fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 2 },
  turnoDetalhe: { padding: '2px 10px 8px', fontSize: 12, color: '#555' },

  cardsGrid7Dias: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12
  },
  diaCard: {
    background: '#FFF',
    borderRadius: 10,
    border: '1px solid #E5E5E5',
    padding: 12,
    minHeight: 70
  },
  diaCardHeader: { fontWeight: 700, color: NAVY, fontSize: 13, marginBottom: 8 },
  diaCardVazio: { fontSize: 11, color: '#AAA', margin: 0 },
  diaCardItem: { marginBottom: 6 },
  diaCardCliente: { fontSize: 12, fontWeight: 600, color: '#333' },
  diaCardTurno: { fontSize: 11, color: '#777' },

  graficosIndicadoresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: 16,
    marginTop: 14
  },
  painelCard: {
    background: '#FFF',
    borderRadius: 10,
    border: '1px solid #E5E5E5',
    padding: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  },
  painelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4
  },
  painelLegenda: { display: 'flex', gap: 14 },
  legendaItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#666', fontWeight: 600 },
  legendaSwatch: { width: 8, height: 8, borderRadius: 2, display: 'inline-block' },
  // Divisória fina entre os 2 mini-gráficos empilhados de um mesmo painel —
  // não é borda em volta de uma marca (isso a skill dataviz proíbe), é um
  // separador entre 2 PAINÉIS sincronizados no mesmo eixo X, convenção comum
  // em dashboards (ex: preço em cima, volume embaixo).
  painelDivisor: { height: 1, background: COR_GRADE, margin: '0 4px' },
  graficoTitulo: { margin: 0, fontSize: 13, color: NAVY },

  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    background: '#FFF',
    borderRadius: 10,
    padding: 28,
    maxWidth: 420,
    width: '90%',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)'
  },

  modalRomaneio: {
    background: '#FFF',
    borderRadius: 10,
    padding: '24px 28px',
    maxWidth: 560,
    width: '92%',
    maxHeight: '88vh',
    overflowY: 'auto',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)'
  },
  romaneioCabecalho: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  romaneioLogoMl: { height: 36, width: 'auto' },
  romaneioLogoCliente: { height: 44, width: 44, objectFit: 'contain', borderRadius: 6, background: '#FAFAFA' },
  romaneioOrange: { height: 3, background: '#FF6B00', margin: '14px 0 18px', borderRadius: 2 },
  romaneioGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '8px 16px',
    fontSize: 13,
    color: '#333',
    marginBottom: 8
  },
  romaneioFotoTitulo: { fontWeight: 700, color: NAVY, fontSize: 13, margin: '16px 0 8px' },
  romaneioFotosGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8 },
  romaneioFoto: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: '1px solid #E5E5E5' }
};
