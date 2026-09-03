import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, setDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ui, NAVY } from '../lib/styles';
import { obterConfigSelfie, salvarConfigSelfie, RETENCAO_SELFIE_DIAS_PADRAO } from '../lib/limpezaSelfies';
import { hojeISO, dataLocalISO } from '../lib/data';

const FORM_VAZIO = {
  clienteId: '',
  sequencia: false,
  dataInicio: hojeISO(),
  dataFim: hojeISO(),
  turnoId: '',
  qtdMdo: ''
};

// Gera a lista de datas (YYYY-MM-DD) entre início e fim, inclusive.
function datasNoIntervalo(inicio, fim) {
  const datas = [];
  let atual = new Date(`${inicio}T00:00:00`);
  const limite = new Date(`${fim}T00:00:00`);
  if (Number.isNaN(atual.getTime()) || Number.isNaN(limite.getTime()) || atual > limite) return datas;
  while (atual <= limite) {
    datas.push(dataLocalISO(atual));
    atual.setDate(atual.getDate() + 1);
  }
  return datas;
}

function formatarDataBr(iso) {
  if (!iso) return '-';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

// Tela do Administrativo pra lançar quanta MdO está direcionada pra cada
// Cliente/Local, por dia e por turno — é contra isso que o Dashboard
// compara quem efetivamente confirmou presença (CheckinPublicScreen.jsx).
// Também abriga a configuração de quantos dias a selfie do check-in fica
// guardada antes de ser apagada (ColetorScreen/Dashboard fazem a limpeza
// de verdade, aqui é só onde o número é ajustado).
export default function PlanejamentoScreen() {
  const [clientes, setClientes] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [planejamentos, setPlanejamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');

  const [guardarSelfie, setGuardarSelfie] = useState(false);
  const [retencaoDias, setRetencaoDias] = useState(RETENCAO_SELFIE_DIAS_PADRAO);
  const [salvandoConfigSelfie, setSalvandoConfigSelfie] = useState(false);

  useEffect(() => {
    const unsubClientes = onSnapshot(query(collection(db, 'clientes'), orderBy('nome')), (snap) => {
      setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.status !== 'inativo'));
    });
    const unsubTurnos = onSnapshot(query(collection(db, 'turnos'), orderBy('horaInicio')), (snap) => {
      setTurnos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.ativo !== false));
    });
    const unsubPlanejamentos = onSnapshot(
      collection(db, 'planejamentoOperacional'),
      (snap) => {
        setPlanejamentos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    return () => {
      unsubClientes();
      unsubTurnos();
      unsubPlanejamentos();
    };
  }, []);

  useEffect(() => {
    obterConfigSelfie().then((cfg) => {
      setGuardarSelfie(cfg.guardarSelfie);
      setRetencaoDias(cfg.retencaoSelfieDias);
    });
  }, []);

  const nomeCliente = (id) => clientes.find((c) => c.id === id)?.nome || '(cliente removido)';
  const nomeTurno = (id) => turnos.find((t) => t.id === id)?.nome || '(turno removido)';

  const abrirNovo = () => {
    setForm(FORM_VAZIO);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (p) => {
    setForm({
      clienteId: p.clienteId,
      sequencia: false,
      dataInicio: p.data,
      dataFim: p.data,
      turnoId: p.turnoId,
      qtdMdo: String(p.qtdMdo)
    });
    setEditandoId(p.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setErro('');
  };

  const salvar = async () => {
    if (!form.clienteId) {
      setErro('Selecione o Cliente/Local.');
      return;
    }
    if (!form.turnoId) {
      setErro('Selecione o turno.');
      return;
    }
    const qtd = Number(form.qtdMdo);
    if (!qtd || qtd <= 0) {
      setErro('Informe a quantidade de MdO (maior que zero).');
      return;
    }
    const dataFim = form.sequencia ? form.dataFim : form.dataInicio;
    const datas = datasNoIntervalo(form.dataInicio, dataFim);
    if (datas.length === 0) {
      setErro('Confira as datas — o período informado é inválido.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await Promise.all(
        datas.map((data) => {
          const id = `${form.clienteId}_${data}_${form.turnoId}`;
          return setDoc(
            doc(db, 'planejamentoOperacional', id),
            { clienteId: form.clienteId, data, turnoId: form.turnoId, qtdMdo: qtd },
            { merge: true }
          );
        })
      );
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (p) => {
    if (!window.confirm(`Excluir o planejamento de ${formatarDataBr(p.data)} (${nomeCliente(p.clienteId)})?`)) return;
    try {
      await deleteDoc(doc(db, 'planejamentoOperacional', p.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  const salvarConfigSelfieForm = async () => {
    const dias = Number(retencaoDias);
    if (guardarSelfie && (!dias || dias <= 0)) {
      setErro('Informe um número de dias válido pra retenção da selfie.');
      return;
    }
    setSalvandoConfigSelfie(true);
    setErro('');
    try {
      await salvarConfigSelfie({ guardarSelfie, retencaoSelfieDias: dias || RETENCAO_SELFIE_DIAS_PADRAO });
    } catch (e) {
      setErro('Falha ao salvar a configuração de selfie.');
    } finally {
      setSalvandoConfigSelfie(false);
    }
  };

  const listaFiltrada = planejamentos
    .filter((p) => !filtroCliente || p.clienteId === filtroCliente)
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Planejamento Operacional</h2>
        {!formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Novo planejamento
          </button>
        )}
      </div>

      <p style={ui.placeholderNote}>
        Lance quanta MdO está direcionada pra cada Cliente/Local, por dia e turno. O Dashboard
        compara isso com quem efetivamente confirmou presença pelo QR Code do local.
      </p>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar planejamento' : 'Novo planejamento'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Cliente/Local *
              <select
                style={ui.input}
                value={form.clienteId}
                onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
              >
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label style={ui.label}>
              Turno *
              <select
                style={ui.input}
                value={form.turnoId}
                onChange={(e) => setForm({ ...form, turnoId: e.target.value })}
              >
                <option value="">Selecione...</option>
                {turnos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.horaInicio})
                  </option>
                ))}
              </select>
            </label>
            <label style={ui.label}>
              Qtd. de MdO *
              <input
                type="number"
                min="1"
                style={ui.input}
                value={form.qtdMdo}
                onChange={(e) => setForm({ ...form, qtdMdo: e.target.value })}
              />
            </label>
          </div>

          {!editandoId && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={form.sequencia}
                onChange={(e) => setForm({ ...form, sequencia: e.target.checked })}
              />
              Planejar uma sequência de dias (em vez de um dia só)
            </label>
          )}

          <div style={ui.formGrid}>
            <label style={ui.label}>
              {form.sequencia ? 'Data início *' : 'Data *'}
              <input
                type="date"
                style={ui.input}
                value={form.dataInicio}
                onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
              />
            </label>
            {form.sequencia && (
              <label style={ui.label}>
                Data fim *
                <input
                  type="date"
                  style={ui.input}
                  value={form.dataFim}
                  min={form.dataInicio}
                  onChange={(e) => setForm({ ...form, dataFim: e.target.value })}
                />
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={ui.primaryButton} onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <button style={ui.secondaryButton} onClick={cancelar} disabled={salvando}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={{ ...ui.label, maxWidth: 260 }}>
          Filtrar por cliente
          <select style={ui.input} value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      {carregando ? (
        <p>Carregando planejamento...</p>
      ) : listaFiltrada.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum planejamento lançado ainda.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Data</th>
                <th style={ui.th}>Cliente/Local</th>
                <th style={ui.th}>Turno</th>
                <th style={ui.th}>Qtd. MdO</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((p) => (
                <tr key={p.id}>
                  <td style={ui.td}>{formatarDataBr(p.data)}</td>
                  <td style={ui.td}>{nomeCliente(p.clienteId)}</td>
                  <td style={ui.td}>{nomeTurno(p.turnoId)}</td>
                  <td style={ui.td}>{p.qtdMdo}</td>
                  <td style={ui.td}>
                    <button style={ui.linkButton} onClick={() => abrirEdicao(p)}>
                      Editar
                    </button>
                    <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(p)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ ...ui.formCard, marginTop: 28, maxWidth: 420 }}>
        <h3 style={{ marginTop: 0, color: NAVY, fontSize: 16 }}>⚙️ Selfie do check-in</h3>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, marginBottom: 12 }}>
          <input
            type="checkbox"
            style={{ marginTop: 3 }}
            checked={guardarSelfie}
            onChange={(e) => setGuardarSelfie(e.target.checked)}
          />
          <span>
            Guardar a selfie no Storage (auditoria)
            <br />
            <span style={{ fontSize: 12, color: '#999' }}>
              Requer o plano pago do Firebase (Blaze) — por ora a foto continua sendo exigida no
              check-in pra confirmar quem é a pessoa, só não fica salva em lugar nenhum.
            </span>
          </span>
        </label>

        {guardarSelfie && (
          <label style={ui.label}>
            Manter a selfie por quantos dias?
            <input
              type="number"
              min="1"
              style={ui.input}
              value={retencaoDias}
              onChange={(e) => setRetencaoDias(e.target.value)}
            />
          </label>
        )}
        {guardarSelfie && (
          <p style={ui.placeholderNote}>
            Depois desse prazo, a foto é apagada automaticamente (o registro de presença em si
            continua existindo, só a foto some) — a limpeza roda quando alguém abre o Dashboard.
          </p>
        )}

        <button style={ui.secondaryButton} onClick={salvarConfigSelfieForm} disabled={salvandoConfigSelfie}>
          {salvandoConfigSelfie ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}
