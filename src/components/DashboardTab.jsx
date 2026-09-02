import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ui, NAVY } from '../lib/styles';
import { limparSelfiesVencidas } from '../lib/limpezaSelfies';

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

function limiteAtrasoAtingido(horaInicio, agora) {
  if (!horaInicio) return false;
  const [h, m] = horaInicio.split(':').map(Number);
  const limite = new Date(agora);
  limite.setHours(h, m + TOLERANCIA_ATRASO_MINUTOS, 0, 0);
  return agora > limite;
}

function horarioCheckin(presenca) {
  const ms = presenca.dataHoraCheckin?.toMillis ? presenca.dataHoraCheckin.toMillis() : null;
  if (!ms) return '--:--';
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
  const [agora, setAgora] = useState(Date.now());
  const [expandidos, setExpandidos] = useState({});
  const [modalFalta, setModalFalta] = useState(null);
  const [novaQtd, setNovaQtd] = useState('');
  const [salvandoFalta, setSalvandoFalta] = useState(false);
  const [erroFalta, setErroFalta] = useState('');

  useEffect(() => {
    const unsubClientes = onSnapshot(collection(db, 'clientes'), (snap) => {
      setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubTurnos = onSnapshot(collection(db, 'turnos'), (snap) => {
      setTurnos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubPlanejamentos = onSnapshot(collection(db, 'planejamentoOperacional'), (snap) => {
      setPlanejamentos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubPresencas = onSnapshot(collection(db, 'presencas'), (snap) => {
      setPresencas(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubClientes();
      unsubTurnos();
      unsubPlanejamentos();
      unsubPresencas();
    };
  }, []);

  // Limpeza "preguiçosa" das selfies vencidas — roda 1x quando o
  // Administrativo abre o Dashboard (ver lib/limpezaSelfies.js).
  useEffect(() => {
    limparSelfiesVencidas().catch(() => {});
  }, []);

  // Reavalia o horário de corte periodicamente (não precisa ser por
  // segundo — é só pra recalcular quando o relógio passar do limite com a
  // tela já aberta).
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const hoje = hojeISO();
  const proximasDatas = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDiasISO(hoje, i)), [hoje]);

  const cliente = (id) => clientes.find((c) => c.id === id);
  const nomeCliente = (id) => cliente(id)?.nome || '(cliente removido)';
  const nomeTurno = (id) => turnos.find((t) => t.id === id)?.nome || '(turno removido)';

  // ---- Cards de hoje, agrupados por cliente ----
  const cardsHoje = useMemo(() => {
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

  // ---- Tabela dos próximos 7 dias ----
  const linhas7Dias = useMemo(() => {
    const mapa = {};
    planejamentos
      .filter((p) => proximasDatas.includes(p.data))
      .forEach((p) => {
        const chave = `${p.clienteId}_${p.turnoId}`;
        if (!mapa[chave]) mapa[chave] = { clienteId: p.clienteId, turnoId: p.turnoId, porDia: {} };
        mapa[chave].porDia[p.data] = p.qtdMdo;
      });
    return Object.values(mapa).sort((a, b) => nomeCliente(a.clienteId).localeCompare(nomeCliente(b.clienteId)));
  }, [planejamentos, proximasDatas]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirModalFalta = (item, clienteId) => {
    setModalFalta({ ...item, clienteId, clienteNome: nomeCliente(clienteId) });
    setNovaQtd(String(item.planejado));
    setErroFalta('');
  };
  const toggleExpandido = (chave) => setExpandidos((e) => ({ ...e, [chave]: !e[chave] }));

  const fecharModalFalta = () => {
    setModalFalta(null);
    setErroFalta('');
  };

  const salvarNovaQtd = async () => {
    const qtd = Number(novaQtd);
    if (!qtd || qtd <= 0) {
      setErroFalta('Informe uma quantidade válida.');
      return;
    }
    setSalvandoFalta(true);
    setErroFalta('');
    try {
      // Corrigir a quantidade manualmente substitui uma eventual marcação
      // anterior de "sem reposição" — a situação mudou.
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

      <h3 style={{ ...ui.sectionTitle, fontSize: 16 }}>Operações de hoje</h3>
      {cardsHoje.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhuma operação planejada pra hoje ainda.</p>
      ) : (
        <div style={styles.cardsGrid}>
          {cardsHoje.map(({ clienteId, itens }) => {
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
                                  {p.colaboradorNome} — {horarioCheckin(p)}
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

      <h3 style={{ ...ui.sectionTitle, fontSize: 16, marginTop: 28 }}>Planejamento — próximos 7 dias</h3>
      {linhas7Dias.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum planejamento lançado pros próximos dias.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Cliente/Local</th>
                <th style={ui.th}>Turno</th>
                {proximasDatas.map((data, i) => (
                  <th key={data} style={{ ...ui.th, textAlign: 'center' }}>
                    {labelDataCurta(data, i === 0)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas7Dias.map((linha) => (
                <tr key={`${linha.clienteId}_${linha.turnoId}`}>
                  <td style={ui.td}>{nomeCliente(linha.clienteId)}</td>
                  <td style={ui.td}>{nomeTurno(linha.turnoId)}</td>
                  {proximasDatas.map((data) => (
                    <td key={data} style={{ ...ui.td, textAlign: 'center' }}>
                      {linha.porDia[data] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
