import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ui } from '../lib/styles';
import { limparSelfiesVencidas } from '../lib/limpezaSelfies';

// Tolerância fixa combinada com o Pablo: 15min depois do início do turno,
// se ainda faltar gente confirmar presença, dispara o alerta.
const TOLERANCIA_ATRASO_MINUTOS = 15;

const hojeISO = () => new Date().toISOString().slice(0, 10);

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

export default function DashboardTab() {
  const [clientes, setClientes] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [planejamentos, setPlanejamentos] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [agora, setAgora] = useState(Date.now());
  const [expandidos, setExpandidos] = useState({});

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

  const total = clientes.length;
  const ativos = clientes.filter((c) => c.status === 'ativo').length;
  const inativos = total - ativos;

  const nomeCliente = (id) => clientes.find((c) => c.id === id)?.nome || '(cliente removido)';
  const nomeTurno = (id) => turnos.find((t) => t.id === id)?.nome || '(turno removido)';

  const gruposHoje = useMemo(() => {
    const hoje = hojeISO();
    return planejamentos
      .filter((p) => p.data === hoje)
      .map((p) => {
        const presentesGrupo = presencas.filter(
          (pr) => pr.data === hoje && pr.clienteId === p.clienteId && pr.turnoId === p.turnoId
        );
        const turno = turnos.find((t) => t.id === p.turnoId);
        return {
          chave: `${p.clienteId}_${p.turnoId}`,
          clienteId: p.clienteId,
          turnoId: p.turnoId,
          planejado: p.qtdMdo,
          presentesGrupo,
          presente: presentesGrupo.length,
          atrasado: limiteAtrasoAtingido(turno?.horaInicio, agora)
        };
      });
  }, [planejamentos, presencas, turnos, agora]);

  const alertas = gruposHoje.filter((g) => g.atrasado && g.presente < g.planejado);

  const toggleExpandido = (chave) => setExpandidos((e) => ({ ...e, [chave]: !e[chave] }));

  return (
    <div>
      <h2 style={ui.sectionTitle}>Dashboard</h2>
      <div style={ui.cardsRow}>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{total}</div>
          <div style={ui.statLabel}>Clientes cadastrados</div>
        </div>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{ativos}</div>
          <div style={ui.statLabel}>Ativos</div>
        </div>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{inativos}</div>
          <div style={ui.statLabel}>Inativos</div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ ...ui.sectionTitle, fontSize: 16 }}>⚠️ Alertas de falta — hoje</h3>
          {alertas.map((g) => (
            <div key={g.chave} style={styles.alertaCard}>
              <div style={styles.alertaHeader} onClick={() => toggleExpandido(g.chave)}>
                <span>
                  <strong>{nomeCliente(g.clienteId)}</strong> — {nomeTurno(g.turnoId)}: faltam{' '}
                  <strong>{g.planejado - g.presente}</strong> de {g.planejado} colaborador(es)
                </span>
                <span style={styles.alertaToggle}>{expandidos[g.chave] ? '▲' : '▼'}</span>
              </div>
              {expandidos[g.chave] && (
                <div style={styles.alertaDetalhe}>
                  {g.presentesGrupo.length === 0 ? (
                    <p style={ui.placeholderNote}>Ninguém confirmou presença ainda.</p>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {g.presentesGrupo.map((p) => (
                        <li key={p.id}>
                          {p.colaboradorNome} — confirmou às {horarioCheckin(p)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {gruposHoje.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ ...ui.sectionTitle, fontSize: 16 }}>Presença de hoje</h3>
          <div style={ui.tableWrapper}>
            <table style={ui.table}>
              <thead>
                <tr>
                  <th style={ui.th}>Cliente/Local</th>
                  <th style={ui.th}>Turno</th>
                  <th style={ui.th}>Planejado</th>
                  <th style={ui.th}>Presente</th>
                  <th style={ui.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {gruposHoje.map((g) => {
                  const ok = g.presente >= g.planejado;
                  const estilo = ok ? ui.badgeVerde : g.atrasado ? ui.badgeVermelho : ui.badgeLaranja;
                  const texto = ok ? 'Completo' : g.atrasado ? 'Alerta' : 'Aguardando';
                  return (
                    <tr key={g.chave}>
                      <td style={ui.td}>{nomeCliente(g.clienteId)}</td>
                      <td style={ui.td}>{nomeTurno(g.turnoId)}</td>
                      <td style={ui.td}>{g.planejado}</td>
                      <td style={ui.td}>{g.presente}</td>
                      <td style={ui.td}>
                        <span style={{ ...ui.badge, ...estilo }}>{texto}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p style={ui.placeholderNote}>
        Gráficos de operações (por fluxo, por tipo, cumprimento de meta) entram aqui quando
        definirmos juntos o que precisa aparecer de imediato.
      </p>
    </div>
  );
}

const styles = {
  alertaCard: {
    background: '#FFF',
    border: '1px solid #F3C0C0',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden'
  },
  alertaHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#FBE7E7',
    cursor: 'pointer',
    color: '#B3261E',
    fontSize: 14
  },
  alertaToggle: { fontSize: 12 },
  alertaDetalhe: { padding: '10px 16px', fontSize: 14, color: '#333' }
};
