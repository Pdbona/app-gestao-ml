import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { ui, NAVY } from '../lib/styles';
import { limparSelfiesVencidas } from '../lib/limpezaSelfies';
import { limparFotosOperacaoVencidas } from '../lib/limpezaFotosOperacao';
import { gerarRomaneioPdf } from '../lib/romaneio';

// Tolerância fixa combinada com o Pablo: 15min depois do início do turno,
// se ainda faltar gente confirmar presença, dispara o alerta.
const TOLERANCIA_ATRASO_MINUTOS = 15;
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const hojeISO = () => new Date().toISOString().slice(0, 10);

function addDiasISO(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function labelDataCurta(iso, ehHoje) {
  if (ehHoje) return 'Hoje';
  const d = new Date(`${iso}T00:00:00`);
  return `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function paraMillis(valor) {
  if (!valor) return null;
  return valor?.toMillis ? valor.toMillis() : new Date(valor).getTime();
}

function ehMesmoDia(valor, diaISO) {
  const ms = paraMillis(valor);
  if (!ms) return false;
  return new Date(ms).toISOString().slice(0, 10) === diaISO;
}

function formatarHorario(valor) {
  const ms = paraMillis(valor);
  if (!ms) return '--:--';
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

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
  const [pdfGerandoId, setPdfGerandoId] = useState(null);

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
    return Object.entries(porCliente)
      .map(([clienteId, itens]) => ({
        clienteId,
        itens: itens.sort((a, b) => (paraMillis(b.inicio) || 0) - (paraMillis(a.inicio) || 0))
      }))
      .sort((a, b) =>
        (a.clienteId === '_semCliente' ? 'zzz' : nomeCliente(a.clienteId)).localeCompare(
          b.clienteId === '_semCliente' ? 'zzz' : nomeCliente(b.clienteId)
        )
      );
  }, [registros, hoje]); // eslint-disable-line react-hooks/exhaustive-deps

  const gerarPdf = async (op) => {
    setPdfGerandoId(op.id);
    try {
      const fotosSnap = await getDocs(collection(db, 'registrosOperacao', op.id, 'fotos'));
      const todasFotos = fotosSnap.docs.map((d) => d.data());
      gerarRomaneioPdf({
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
        fotosInicio: todasFotos.filter((f) => f.tipo === 'inicio').sort((a, b) => a.ordem - b.ordem),
        fotosFim: todasFotos.filter((f) => f.tipo === 'fim').sort((a, b) => a.ordem - b.ordem)
      });
    } catch (e) {
      window.alert('Falha ao gerar o PDF. Tente novamente.');
    } finally {
      setPdfGerandoId(null);
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

    return { mediaGeral, totalOperacoes: finalizadas.length, porCliente: porClienteLista };
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
          {operacoesHojePorCliente.map(({ clienteId, itens }) => {
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
                {itens.map((op) => (
                  <div key={op.id} style={styles.operacaoRow}>
                    <div style={styles.operacaoTopo}>
                      <span style={styles.turnoNome}>
                        {nomeTipo(op.tipoOperacaoId)} — {nomeFluxo(op.fluxoId)}
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
                        onClick={() => gerarPdf(op)}
                        disabled={pdfGerandoId === op.id}
                      >
                        {pdfGerandoId === op.id ? 'Gerando PDF...' : '📄 Gerar romaneio (PDF)'}
                      </button>
                    )}
                  </div>
                ))}
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
          <div style={{ ...styles.cardsGrid7Dias, marginTop: 14 }}>
            {indicadoresTempo.porCliente.map((ind) => (
              <div key={ind.clienteId} style={styles.diaCard}>
                <div style={styles.diaCardHeader}>
                  {ind.clienteId === '_semCliente' ? '(sem cliente)' : nomeCliente(ind.clienteId)}
                </div>
                <div style={styles.diaCardItem}>
                  <div style={styles.turnoQtd}>{ind.media}min</div>
                  <div style={styles.diaCardTurno}>{ind.qtd} operação(ões)</div>
                </div>
              </div>
            ))}
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
    </div>
  );
}

const styles = {
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
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
  cardLogo: { width: 32, height: 32, objectFit: 'contain', borderRadius: 6, background: '#FAFAFA' },

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
  }
};
