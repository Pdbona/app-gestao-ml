import React, { useEffect, useState } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ui } from '../../lib/styles';

const TURNO_VAZIO = { nome: '', horaInicio: '', horaFim: '', ativo: true };

// Turno é cadastro global reutilizável (igual Tipo de Operação/Operação):
// entra como seleção no Planejamento Operacional e no check-in de
// presença. `horaInicio` é o que baliza o horário de corte pro alerta de
// falta no Dashboard (tolerância fixa de 15min após o início do turno).
export default function TurnosCadastro({ permissoes }) {
  const perm = permissoes.cadastros?.turnos || {};

  const [turnos, setTurnos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(TURNO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'turnos'), orderBy('horaInicio'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setTurnos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    return () => unsubscribe();
  }, []);

  const abrirNovo = () => {
    setForm(TURNO_VAZIO);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (turno) => {
    setForm({
      nome: turno.nome || '',
      horaInicio: turno.horaInicio || '',
      horaFim: turno.horaFim || '',
      ativo: turno.ativo !== false
    });
    setEditandoId(turno.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(TURNO_VAZIO);
    setErro('');
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome do turno.');
      return;
    }
    if (!form.horaInicio) {
      setErro('Informe o horário de início do turno.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        nome: form.nome,
        horaInicio: form.horaInicio,
        horaFim: form.horaFim || null,
        ativo: form.ativo
      };
      if (editandoId) {
        await updateDoc(doc(db, 'turnos', editandoId), payload);
      } else {
        await addDoc(collection(db, 'turnos'), payload);
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (turno) => {
    if (!window.confirm(`Excluir o turno "${turno.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'turnos', turno.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Turno</h2>
        {perm.criar && !formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Novo turno
          </button>
        )}
      </div>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar turno' : 'Novo turno'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome *
              <input
                style={ui.input}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Manhã"
              />
            </label>
            <label style={ui.label}>
              Início do turno *
              <input
                type="time"
                style={ui.input}
                value={form.horaInicio}
                onChange={(e) => setForm({ ...form, horaInicio: e.target.value })}
              />
            </label>
            <label style={ui.label}>
              Fim do turno
              <input
                type="time"
                style={ui.input}
                value={form.horaFim}
                onChange={(e) => setForm({ ...form, horaFim: e.target.value })}
              />
            </label>
            <label style={ui.label}>
              Status
              <select
                style={ui.input}
                value={form.ativo ? 'ativo' : 'inativo'}
                onChange={(e) => setForm({ ...form, ativo: e.target.value === 'ativo' })}
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>
          </div>

          <p style={ui.placeholderNote}>
            O início do turno baliza o alerta de falta no Dashboard: se faltar 15min depois
            deste horário e ainda faltar gente confirmar presença, o alerta dispara.
          </p>

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

      {carregando ? (
        <p>Carregando turnos...</p>
      ) : turnos.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum turno cadastrado ainda.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome</th>
                <th style={ui.th}>Início</th>
                <th style={ui.th}>Fim</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id}>
                  <td style={ui.td}>{t.nome}</td>
                  <td style={ui.td}>{t.horaInicio}</td>
                  <td style={ui.td}>{t.horaFim || '-'}</td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(t.ativo !== false ? ui.badgeVerde : ui.badgeCinza) }}>
                      {t.ativo !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {perm.editar && (
                      <button style={ui.linkButton} onClick={() => abrirEdicao(t)}>
                        Editar
                      </button>
                    )}
                    {perm.deletar && (
                      <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(t)}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
