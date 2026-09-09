import React, { useEffect, useState } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ui, NAVY } from '../../lib/styles';
import { PERFIL_ADMIN_PADRAO, permissoesVazias, slugUnico } from '../../lib/permissoes';
import PermissoesMatrix from '../PermissoesMatrix';

const PERFIL_VAZIO = { nome: '', descricao: '', linkProprio: false, permissoes: permissoesVazias() };

// URL do Link de acesso próprio — mesmo padrão de montarUrlCheckin em
// ClientesCadastro.jsx (`?acesso=<slug>`, lido em App.jsx por
// AcessoProprioScreen.jsx), funciona em qualquer host estático sem rota
// por path.
function montarUrlAcesso(slug) {
  const base = `${window.location.origin}${process.env.PUBLIC_URL}/`;
  return `${base}?acesso=${slug}`;
}

// `compacto` renderiza um card menor (lista em vez de tabela, sem o texto
// explicativo) — usado lado a lado com Usuários em CadastrosScreen.jsx
// desde que as 2 telas viraram uma só (09/09/2026), mesmo padrão já usado
// por FluxosCadastro/TurnosCadastro no grupo "Operação".
export default function PerfisCadastro({ permissoes, compacto = false }) {
  const temAcesso = Boolean(permissoes.acessos?.perfis);
  const perm = { criar: temAcesso, editar: temAcesso, deletar: temAcesso };

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
      linkProprio: Boolean(perfil.linkProprio),
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
      // Slug só existe (e só é recalculado) quando "Link de acesso
      // próprio" está marcado — desmarcar apaga o slug (o link para de
      // funcionar; os usuários do perfil voltam a precisar da porta
      // padrão, se algum outro acesso ainda fizer sentido pra eles).
      const payload = {
        nome: form.nome,
        descricao: form.descricao,
        linkProprio: form.linkProprio,
        slug: form.linkProprio ? slugUnico(form.nome, perfis, editandoId) : null,
        permissoes: form.permissoes
      };
      if (editandoId) {
        await updateDoc(doc(db, 'perfis', editandoId), payload);
      } else {
        await addDoc(collection(db, 'perfis'), payload);
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
    <div style={compacto ? styles.cardCompacto : undefined}>
      <div style={ui.sectionHeaderRow}>
        {compacto ? <h3 style={styles.tituloCompacto}>Perfis</h3> : <h2 style={ui.sectionTitle}>Perfis</h2>}
        {perm.criar && !formAberto && (
          <button style={compacto ? ui.smallButton : ui.primaryButton} onClick={abrirNovo}>
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

          <label style={styles.linkProprioLabel}>
            <input
              type="checkbox"
              checked={form.linkProprio}
              onChange={(e) => setForm({ ...form, linkProprio: e.target.checked })}
              style={{ marginTop: 2 }}
            />
            <span>
              <strong style={{ color: NAVY }}>Link de acesso próprio</strong>
              <br />
              <span style={{ fontSize: 12, color: '#777' }}>
                Em vez de entrar pela porta padrão com senha, cada usuário deste perfil recebe um link à
                parte, com tela própria: seleciona o nome e digita uma senha (4 a 6 caracteres, pode ter
                letras).
              </span>
            </span>
          </label>

          {form.linkProprio && form.nome.trim() && (
            <p style={styles.previewLink}>
              🔗 Link: <strong>{montarUrlAcesso(slugUnico(form.nome, perfis, editandoId))}</strong>
            </p>
          )}

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
      {compacto ? (
        <div style={styles.listaCompacta}>
          {listaCompleta.map((p) => (
            <div key={p.id} style={styles.itemCompacto}>
              <div>
                <strong>{p.nome}</strong>{' '}
                <span style={{ ...ui.badge, ...(p.sistema ? ui.badgeAzul : ui.badgeCinza) }}>
                  {p.sistema ? 'Sistema' : 'Personalizado'}
                </span>
                {p.linkProprio && p.slug && (
                  <div style={{ fontSize: 11, color: '#777', marginTop: 2, wordBreak: 'break-all' }}>
                    🔗 {montarUrlAcesso(p.slug)}
                  </div>
                )}
              </div>
              <div>
                {p.sistema ? (
                  <span style={{ color: '#999', fontSize: 12 }}>Fixo</span>
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
              </div>
            </div>
          ))}
        </div>
      ) : (
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
                  <td style={ui.td}>
                    {p.nome}
                    {p.linkProprio && p.slug && (
                      <div style={{ fontSize: 11, color: '#777', marginTop: 2 }}>
                        🔗 {montarUrlAcesso(p.slug)}
                      </div>
                    )}
                  </td>
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
      )}
    </div>
  );
}

const styles = {
  cardCompacto: {
    background: '#FFF',
    borderRadius: 8,
    padding: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: 340
  },
  tituloCompacto: { margin: '0 0 12px', fontSize: 15, color: NAVY },
  listaCompacta: { display: 'flex', flexDirection: 'column', gap: 10 },
  itemCompacto: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 0',
    borderBottom: '1px solid #EEE',
    fontSize: 13
  },
  linkProprioLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 14,
    marginBottom: 12,
    padding: '10px 14px',
    background: '#F8F9FB',
    borderRadius: 6,
    cursor: 'pointer'
  },
  previewLink: {
    fontSize: 13,
    color: NAVY,
    background: '#F0F3F7',
    borderRadius: 6,
    padding: '8px 12px',
    margin: '0 0 16px',
    wordBreak: 'break-all'
  }
};
