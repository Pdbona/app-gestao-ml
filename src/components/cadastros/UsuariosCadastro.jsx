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
  orderBy
} from 'firebase/firestore';
import { ui } from '../../lib/styles';
import { PERFIL_ADMIN_PADRAO } from '../../lib/permissoes';
import PermissoesMatrix from '../PermissoesMatrix';

const USUARIO_VAZIO = { nome: '', senha: '', perfilId: PERFIL_ADMIN_PADRAO.id, ativo: true };

export default function UsuariosCadastro({ permissoes }) {
  const perm = permissoes.cadastros?.usuarios || {};

  const [usuarios, setUsuarios] = useState([]);
  const [perfis, setPerfis] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(USUARIO_VAZIO);
  const [personalizarPerm, setPersonalizarPerm] = useState(false);
  const [permCustom, setPermCustom] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const qUsuarios = query(collection(db, 'usuarios'), orderBy('nome'));
    const unsubUsuarios = onSnapshot(
      qUsuarios,
      (snap) => {
        setUsuarios(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    const qPerfis = query(collection(db, 'perfis'), orderBy('nome'));
    const unsubPerfis = onSnapshot(qPerfis, (snap) => {
      setPerfis(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubUsuarios();
      unsubPerfis();
    };
  }, []);

  const perfisDisponiveis = [PERFIL_ADMIN_PADRAO, ...perfis.filter((p) => p.id !== PERFIL_ADMIN_PADRAO.id)];
  const getPerfil = (id) => perfisDisponiveis.find((p) => p.id === id) || PERFIL_ADMIN_PADRAO;

  const abrirNovo = () => {
    setForm(USUARIO_VAZIO);
    setEditandoId(null);
    setPersonalizarPerm(false);
    setPermCustom(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (usuario) => {
    setForm({
      nome: usuario.nome || '',
      senha: usuario.senha || '',
      perfilId: usuario.perfilId || PERFIL_ADMIN_PADRAO.id,
      ativo: usuario.ativo !== false
    });
    setPersonalizarPerm(Boolean(usuario.permissoesCustom));
    setPermCustom(usuario.permissoesCustom || null);
    setEditandoId(usuario.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(USUARIO_VAZIO);
    setPersonalizarPerm(false);
    setPermCustom(null);
    setErro('');
  };

  const togglePersonalizar = (checked) => {
    setPersonalizarPerm(checked);
    if (checked && !permCustom) {
      // Ponto de partida: cópia das permissões do perfil selecionado.
      setPermCustom(JSON.parse(JSON.stringify(getPerfil(form.perfilId).permissoes)));
    }
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome de usuário (login).');
      return;
    }
    if (!form.senha.trim()) {
      setErro('Informe a senha.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        ...form,
        // NOTA: senha em texto simples — igual ao padrão de PIN dos apps
        // SBS v1 (uso interno, sem Firebase Auth). Evoluir para hash antes
        // de expor a clientes externos.
        permissoesCustom: personalizarPerm ? permCustom : null
      };
      if (editandoId) {
        await updateDoc(doc(db, 'usuarios', editandoId), payload);
      } else {
        await addDoc(collection(db, 'usuarios'), payload);
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (usuario) => {
    if (!window.confirm(`Excluir o usuário "${usuario.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'usuarios', usuario.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Usuários</h2>
        {perm.criar && !formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Novo usuário
          </button>
        )}
      </div>

      <p style={ui.placeholderNote}>
        Login por usuário/senha alfanumérica (sem Firebase Auth ainda — ver nota no código). O
        bootstrap <strong>admin / admin9999</strong> continua disponível como acesso de emergência.
      </p>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar usuário' : 'Novo usuário'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome (login) *
              <input style={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label style={ui.label}>
              Senha (alfanumérica) *
              <input
                style={ui.input}
                value={form.senha}
                onChange={(e) => setForm({ ...form, senha: e.target.value })}
              />
            </label>
            <label style={ui.label}>
              Perfil
              <select
                style={ui.input}
                value={form.perfilId}
                onChange={(e) => setForm({ ...form, perfilId: e.target.value })}
              >
                {perfisDisponiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
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

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={personalizarPerm}
              onChange={(e) => togglePersonalizar(e.target.checked)}
            />
            Personalizar permissões deste usuário (sobrepõe o perfil só para ele)
          </label>

          {personalizarPerm && permCustom && (
            <div style={{ marginBottom: 16, padding: 16, background: '#F8F9FB', borderRadius: 6 }}>
              <PermissoesMatrix value={permCustom} onChange={setPermCustom} />
            </div>
          )}

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
        <p>Carregando usuários...</p>
      ) : usuarios.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum usuário cadastrado ainda (o acesso de emergência admin/admin9999 continua valendo).</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome</th>
                <th style={ui.th}>Perfil</th>
                <th style={ui.th}>Permissões</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td style={ui.td}>{u.nome}</td>
                  <td style={ui.td}>{getPerfil(u.perfilId).nome}</td>
                  <td style={ui.td}>
                    {u.permissoesCustom ? (
                      <span style={{ ...ui.badge, ...ui.badgeLaranja }}>Personalizada</span>
                    ) : (
                      <span style={{ ...ui.badge, ...ui.badgeCinza }}>Padrão do perfil</span>
                    )}
                  </td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(u.ativo !== false ? ui.badgeVerde : ui.badgeCinza) }}>
                      {u.ativo !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {perm.editar && (
                      <button style={ui.linkButton} onClick={() => abrirEdicao(u)}>
                        Editar
                      </button>
                    )}
                    {perm.deletar && (
                      <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(u)}>
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
