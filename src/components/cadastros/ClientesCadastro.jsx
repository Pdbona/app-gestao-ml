import React, { useEffect, useState } from 'react';
import { db } from '../../firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { ui } from '../../lib/styles';

const CLIENTE_VAZIO = {
  nome: '',
  cnpj: '',
  contato: '',
  email: '',
  telefone: '',
  status: 'ativo',
  observacoes: ''
};

export default function ClientesCadastro({ permissoes }) {
  const perm = permissoes.cadastros?.clientes || {};

  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(CLIENTE_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'clientes'), orderBy('nome'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    return () => unsubscribe();
  }, []);

  const abrirNovo = () => {
    setForm(CLIENTE_VAZIO);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (cliente) => {
    setForm({
      nome: cliente.nome || '',
      cnpj: cliente.cnpj || '',
      contato: cliente.contato || '',
      email: cliente.email || '',
      telefone: cliente.telefone || '',
      status: cliente.status || 'ativo',
      observacoes: cliente.observacoes || ''
    });
    setEditandoId(cliente.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(CLIENTE_VAZIO);
    setErro('');
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome/razão social do cliente.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      // NOTA: quando o cliente tiver perfil próprio de acesso (login
      // restrito aos seus próprios dados), este id de cliente é o que deve
      // ser vinculado ao usuário logado para filtrar demandas/registros.
      if (editandoId) {
        await updateDoc(doc(db, 'clientes', editandoId), { ...form, atualizadoEm: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'clientes'), { ...form, criadoEm: serverTimestamp() });
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (cliente) => {
    if (!window.confirm(`Excluir o cliente "${cliente.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteDoc(doc(db, 'clientes', cliente.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Clientes</h2>
        {perm.criar && !formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Novo cliente
          </button>
        )}
      </div>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar cliente' : 'Novo cliente'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome / Razão social *
              <input style={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label style={ui.label}>
              CNPJ
              <input style={ui.input} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
            </label>
            <label style={ui.label}>
              Contato (nome)
              <input style={ui.input} value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} />
            </label>
            <label style={ui.label}>
              E-mail
              <input style={ui.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label style={ui.label}>
              Telefone
              <input style={ui.input} value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </label>
            <label style={ui.label}>
              Status
              <select style={ui.input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>
          </div>

          <label style={ui.label}>
            Observações
            <textarea
              style={{ ...ui.input, minHeight: 70 }}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
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
        <p>Carregando clientes...</p>
      ) : clientes.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum cliente cadastrado ainda.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome / Razão social</th>
                <th style={ui.th}>CNPJ</th>
                <th style={ui.th}>Contato</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td style={ui.td}>{c.nome}</td>
                  <td style={ui.td}>{c.cnpj || '-'}</td>
                  <td style={ui.td}>
                    {c.contato || '-'}
                    {c.email ? ` · ${c.email}` : ''}
                  </td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(c.status === 'ativo' ? ui.badgeVerde : ui.badgeCinza) }}>
                      {c.status === 'ativo' ? 'Ativo' : 'Inativo'}
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
