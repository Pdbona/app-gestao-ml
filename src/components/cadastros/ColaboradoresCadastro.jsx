import React, { useEffect, useState } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ui } from '../../lib/styles';
import { formatarCpf, normalizarCpf, validarCpf } from '../../lib/cpf';

const COLABORADOR_VAZIO = { nome: '', cpf: '', ativo: true };

// Base de colaboradores da ML — por hora só nome e CPF. É contra este
// cadastro que o check-in público (CheckinPublicScreen.jsx) valida quem
// está confirmando presença no Cliente/Local.
export default function ColaboradoresCadastro({ permissoes }) {
  const perm = permissoes.cadastros?.colaboradores || {};

  const [colaboradores, setColaboradores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(COLABORADOR_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'colaboradores'), orderBy('nome'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setColaboradores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    return () => unsubscribe();
  }, []);

  const abrirNovo = () => {
    setForm(COLABORADOR_VAZIO);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (colaborador) => {
    setForm({
      nome: colaborador.nome || '',
      cpf: formatarCpf(colaborador.cpf || ''),
      ativo: colaborador.ativo !== false
    });
    setEditandoId(colaborador.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(COLABORADOR_VAZIO);
    setErro('');
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome do colaborador.');
      return;
    }
    const cpfLimpo = normalizarCpf(form.cpf);
    if (!validarCpf(cpfLimpo)) {
      setErro('CPF inválido — confira os números digitados.');
      return;
    }
    // O check-in público identifica o colaborador só pelo CPF, então
    // precisa ser único entre os ativos (mesmo padrão de unicidade de
    // senha usado em UsuariosCadastro.jsx).
    const colisao = colaboradores.some(
      (c) => c.id !== editandoId && c.ativo !== false && normalizarCpf(c.cpf) === cpfLimpo
    );
    if (colisao) {
      setErro('Já existe um colaborador ativo com esse CPF.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = { nome: form.nome, cpf: cpfLimpo, ativo: form.ativo };
      if (editandoId) {
        await updateDoc(doc(db, 'colaboradores', editandoId), payload);
      } else {
        await addDoc(collection(db, 'colaboradores'), payload);
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (colaborador) => {
    if (!window.confirm(`Excluir o colaborador "${colaborador.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'colaboradores', colaborador.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Colaborador</h2>
        {perm.criar && !formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Novo colaborador
          </button>
        )}
      </div>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar colaborador' : 'Novo colaborador'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome *
              <input style={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label style={ui.label}>
              CPF *
              <input
                style={ui.input}
                inputMode="numeric"
                value={form.cpf}
                onChange={(e) => setForm({ ...form, cpf: formatarCpf(e.target.value) })}
                placeholder="000.000.000-00"
                maxLength={14}
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
        <p>Carregando colaboradores...</p>
      ) : colaboradores.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum colaborador cadastrado ainda.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome</th>
                <th style={ui.th}>CPF</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {colaboradores.map((c) => (
                <tr key={c.id}>
                  <td style={ui.td}>{c.nome}</td>
                  <td style={ui.td}>{formatarCpf(c.cpf)}</td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(c.ativo !== false ? ui.badgeVerde : ui.badgeCinza) }}>
                      {c.ativo !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {perm.editar && (
                      <button style={ui.linkButton} onClick={() => abrirEdicao(c)}>
                        Editar
                      </button>
                    )}
                    {perm.deletar && (
                      <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(c)}>
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
