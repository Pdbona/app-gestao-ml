import React, { useEffect, useState } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ui } from '../../lib/styles';

const FLUXOS_PADRAO = ['Recebimento', 'Expedição', 'Separação'];

const FLUXO_VAZIO = { nome: '', fotosInicio: 0, fotosFim: 0, ativo: true };

export default function FluxosCadastro({ permissoes }) {
  const perm = permissoes.cadastros?.fluxos || {};

  const [fluxos, setFluxos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FLUXO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'fluxos'), orderBy('nome'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setFluxos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    return () => unsubscribe();
  }, []);

  const abrirNovo = () => {
    setForm(FLUXO_VAZIO);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (fluxo) => {
    setForm({
      nome: fluxo.nome || '',
      fotosInicio: fluxo.fotosInicio || 0,
      fotosFim: fluxo.fotosFim || 0,
      ativo: fluxo.ativo !== false
    });
    setEditandoId(fluxo.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(FLUXO_VAZIO);
    setErro('');
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome da operação.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        ...form,
        fotosInicio: Number(form.fotosInicio) || 0,
        fotosFim: Number(form.fotosFim) || 0
      };
      if (editandoId) {
        await updateDoc(doc(db, 'fluxos', editandoId), payload);
      } else {
        await addDoc(collection(db, 'fluxos'), payload);
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (fluxo) => {
    if (!window.confirm(`Excluir a operação "${fluxo.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'fluxos', fluxo.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  const criarPadroes = async () => {
    setSalvando(true);
    try {
      const existentes = new Set(fluxos.map((f) => f.nome));
      const faltando = FLUXOS_PADRAO.filter((nome) => !existentes.has(nome));
      await Promise.all(
        faltando.map((nome) => addDoc(collection(db, 'fluxos'), { nome, fotosInicio: 0, fotosFim: 0, ativo: true }))
      );
    } catch (e) {
      setErro('Falha ao criar os fluxos padrão.');
    } finally {
      setSalvando(false);
    }
  };

  const faltamPadroes = FLUXOS_PADRAO.some((nome) => !fluxos.some((f) => f.nome === nome));

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Operação</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {perm.criar && faltamPadroes && !carregando && (
            <button style={ui.secondaryButton} onClick={criarPadroes} disabled={salvando}>
              Criar Recebimento/Expedição/Separação
            </button>
          )}
          {perm.criar && !formAberto && (
            <button style={ui.primaryButton} onClick={abrirNovo}>
              ➕ Nova operação (Outros)
            </button>
          )}
        </div>
      </div>

      <p style={ui.placeholderNote}>
        Cada operação define quantas fotos são obrigatórias no início e no fim (0 = não
        obrigatório). Recebimento, Expedição e Separação são as operações padrão — qualquer outro
        nome cadastrado aqui entra como "Outros". Isso vai definir o que o perfil de Operação
        (coletor) precisa preencher em cada uma.
      </p>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar operação' : 'Nova operação'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome da operação *
              <input style={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label style={ui.label}>
              Fotos obrigatórias no início
              <input
                type="number"
                min="0"
                style={ui.input}
                value={form.fotosInicio}
                onChange={(e) => setForm({ ...form, fotosInicio: e.target.value })}
              />
            </label>
            <label style={ui.label}>
              Fotos obrigatórias no fim
              <input
                type="number"
                min="0"
                style={ui.input}
                value={form.fotosFim}
                onChange={(e) => setForm({ ...form, fotosFim: e.target.value })}
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
        <p>Carregando operações...</p>
      ) : fluxos.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhuma operação cadastrada ainda.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome</th>
                <th style={ui.th}>Fotos no início</th>
                <th style={ui.th}>Fotos no fim</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {fluxos.map((f) => (
                <tr key={f.id}>
                  <td style={ui.td}>{f.nome}</td>
                  <td style={ui.td}>{f.fotosInicio || 0}</td>
                  <td style={ui.td}>{f.fotosFim || 0}</td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(f.ativo !== false ? ui.badgeVerde : ui.badgeCinza) }}>
                      {f.ativo !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {perm.editar && (
                      <button style={ui.linkButton} onClick={() => abrirEdicao(f)}>
                        Editar
                      </button>
                    )}
                    {perm.deletar && (
                      <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(f)}>
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
