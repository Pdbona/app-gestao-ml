import React, { useEffect, useState } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ui } from '../../lib/styles';
import { PERFIL_ADMIN_PADRAO, permissoesVazias } from '../../lib/permissoes';
import PermissoesMatrix from '../PermissoesMatrix';

const PERFIL_VAZIO = { nome: '', descricao: '', permissoes: permissoesVazias() };

export default function PerfisCadastro({ permissoes }) {
  const perm = permissoes.cadastros?.perfis || {};

  const [perfis, setPerfis] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(PERFIL_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'perfis'), orderBy('nome'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setPerfis(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    return () => unsubscribe();
  }, []);

  // Perfil de sistema (Administrador) sempre aparece primeiro na lista,
  // mesmo antes de qualquer perfil real existir no Firestore.
  const listaCompleta = [PERFIL_ADMIN_PADRAO, ...perfis.filter((p) => p.id !== PERFIL_ADMIN_PADRAO.id)];

  const abrirNovo = () => {
    setForm(PERFIL_VAZIO);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (perfil) => {
    setForm({
      nome: perfil.nome || '',
      descricao: perfil.descricao || '',
      permissoes: perfil.permissoes || permissoesVazias()
    });
    setEditandoId(perfil.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(PERFIL_VAZIO);
    setErro('');
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome do perfil.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      if (editandoId) {
        await updateDoc(doc(db, 'perfis', editandoId), form);
      } else {
        await addDoc(collection(db, 'perfis'), form);
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (perfil) => {
    if (!window.confirm(`Excluir o perfil "${perfil.nome}"? Usuários vinculados a ele ficam sem perfil válido.`)) return;
    try {
      await deleteDoc(doc(db, 'perfis', perfil.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Perfis</h2>
        {perm.criar && !formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Novo perfil
          </button>
        )}
      </div>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar perfil' : 'Novo perfil'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome do perfil *
              <input style={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label style={ui.label}>
              Descrição
              <input
                style={ui.input}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </label>
          </div>

          <div style={{ marginTop: 10, marginBottom: 16 }}>
            <PermissoesMatrix value={form.permissoes} onChange={(p) => setForm({ ...form, permissoes: p })} />
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

      {/* O perfil "Administrador" (sistema) é sempre exibido, mesmo sem
          Firebase real configurado ainda — só a lista de perfis
          personalizados depende do Firestore carregar. */}
      {carregando && <p style={ui.placeholderNote}>Carregando perfis personalizados...</p>}
      {
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome</th>
                <th style={ui.th}>Descrição</th>
                <th style={ui.th}>Tipo</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {listaCompleta.map((p) => (
                <tr key={p.id}>
                  <td style={ui.td}>{p.nome}</td>
                  <td style={ui.td}>{p.descricao || '-'}</td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(p.sistema ? ui.badgeAzul : ui.badgeCinza) }}>
                      {p.sistema ? 'Sistema' : 'Personalizado'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {p.sistema ? (
                      <span style={{ color: '#999', fontSize: 13 }}>Fixo — não editável</span>
                    ) : (
                      <>
                        {perm.editar && (
                          <button style={ui.linkButton} onClick={() => abrirEdicao(p)}>
                            Editar
                          </button>
                        )}
                        {perm.deletar && (
                          <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(p)}>
                            Excluir
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );
}
