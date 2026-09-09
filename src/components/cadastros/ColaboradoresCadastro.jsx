import React, { useEffect, useRef, useState } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { ui, NAVY } from '../../lib/styles';
import { formatarCpf, normalizarCpf, validarCpf } from '../../lib/cpf';
import { gerarModeloColaboradores, lerPlanilhaColaboradores } from '../../lib/colaboradoresImport';

const COLABORADOR_VAZIO = { nome: '', cpf: '', pix: '', cidade: '', bairro: '', ativo: true };

// Base de colaboradores da ML — nome, CPF (identifica no check-in
// público), PIX, Cidade e Bairro de residência (09/09/2026, pedido do
// Pablo, junto com a importação por planilha abaixo). É contra este
// cadastro que o check-in público (CheckinPublicScreen.jsx) valida quem
// está confirmando presença no Cliente/Local.
export default function ColaboradoresCadastro({ permissoes }) {
  const temAcesso = Boolean(permissoes.acessos?.colaboradores);
  const perm = { criar: temAcesso, editar: temAcesso, deletar: temAcesso };

  const [colaboradores, setColaboradores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(COLABORADOR_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // ======== Importar planilha (09/09/2026) ========
  // Layout ainda não definido pelo Pablo — ver lib/colaboradoresImport.js
  // pro modelo proposto (Nome completo/CPF/PIX/Cidade/Bairro de
  // residência). Fluxo: escolhe o arquivo → prévia com o que vai ser
  // criado/atualizado/rejeitado → só grava no Firestore se confirmar.
  const inputArquivoRef = useRef(null);
  const [modalImportar, setModalImportar] = useState(false);
  const [itensImportacao, setItensImportacao] = useState([]);
  const [nomeArquivoImportado, setNomeArquivoImportado] = useState('');
  const [lendoArquivo, setLendoArquivo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erroImportacao, setErroImportacao] = useState('');
  const [resultadoImportacao, setResultadoImportacao] = useState(null);

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
      pix: colaborador.pix || '',
      cidade: colaborador.cidade || '',
      bairro: colaborador.bairro || '',
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
      const payload = {
        nome: form.nome,
        cpf: cpfLimpo,
        pix: form.pix.trim(),
        cidade: form.cidade.trim(),
        bairro: form.bairro.trim(),
        ativo: form.ativo
      };
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

  const abrirImportacao = () => {
    setItensImportacao([]);
    setNomeArquivoImportado('');
    setErroImportacao('');
    setResultadoImportacao(null);
    setModalImportar(true);
  };

  const fecharImportacao = () => {
    setModalImportar(false);
    if (inputArquivoRef.current) inputArquivoRef.current.value = '';
  };

  const escolherArquivo = async (e) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setLendoArquivo(true);
    setErroImportacao('');
    setResultadoImportacao(null);
    setNomeArquivoImportado(arquivo.name);
    try {
      const { colunasFaltando, itens } = await lerPlanilhaColaboradores(arquivo, colaboradores);
      setItensImportacao(itens);
      if (colunasFaltando.length > 0) {
        const nomes = { nome: 'Nome completo', cpf: 'CPF' };
        setErroImportacao(
          `Não encontrei a coluna de ${colunasFaltando.map((c) => nomes[c]).join(' e ')} no arquivo. Confira o
           cabeçalho ou baixe o modelo abaixo.`
        );
      } else if (itens.length === 0) {
        setErroImportacao('A planilha não tem nenhuma linha de dado (só o cabeçalho).');
      }
    } catch (e) {
      setErroImportacao('Não consegui ler esse arquivo. Confira se é um .xlsx, .xls ou .csv válido.');
    } finally {
      setLendoArquivo(false);
    }
  };

  const itensValidos = itensImportacao.filter((i) => !i.erro);
  const itensComErro = itensImportacao.filter((i) => i.erro);

  const confirmarImportacao = async () => {
    if (itensValidos.length === 0) return;
    setImportando(true);
    setErroImportacao('');
    try {
      let criados = 0;
      let atualizados = 0;
      await Promise.all(
        itensValidos.map(async (item) => {
          const payload = {
            nome: item.nome,
            cpf: item.cpf,
            pix: item.pix,
            cidade: item.cidade,
            bairro: item.bairro,
            ativo: true
          };
          if (item.acao === 'atualizar') {
            await updateDoc(doc(db, 'colaboradores', item.colaboradorExistenteId), payload);
            atualizados += 1;
          } else {
            await addDoc(collection(db, 'colaboradores'), payload);
            criados += 1;
          }
        })
      );
      setResultadoImportacao({ criados, atualizados, comErro: itensComErro.length });
      setItensImportacao([]);
    } catch (e) {
      setErroImportacao('Falha ao gravar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setImportando(false);
    }
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Colaborador</h2>
        {perm.criar && !formAberto && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={ui.secondaryButton} onClick={abrirImportacao}>
              📥 Importar planilha
            </button>
            <button style={ui.primaryButton} onClick={abrirNovo}>
              ➕ Novo colaborador
            </button>
          </div>
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
              PIX
              <input style={ui.input} value={form.pix} onChange={(e) => setForm({ ...form, pix: e.target.value })} />
            </label>
            <label style={ui.label}>
              Cidade
              <input style={ui.input} value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </label>
            <label style={ui.label}>
              Bairro de residência
              <input style={ui.input} value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
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
                <th style={ui.th}>PIX</th>
                <th style={ui.th}>Cidade</th>
                <th style={ui.th}>Bairro</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {colaboradores.map((c) => (
                <tr key={c.id}>
                  <td style={ui.td}>{c.nome}</td>
                  <td style={ui.td}>{formatarCpf(c.cpf)}</td>
                  <td style={ui.td}>{c.pix || '-'}</td>
                  <td style={ui.td}>{c.cidade || '-'}</td>
                  <td style={ui.td}>{c.bairro || '-'}</td>
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

      {modalImportar && (
        <div style={styles.overlay} onClick={fecharImportacao}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: NAVY }}>Importar colaboradores por planilha</h3>
            <p style={ui.placeholderNote}>
              Layout esperado (.xlsx, .xls ou .csv, 1ª linha = cabeçalho): colunas <strong>Nome
              completo</strong>, <strong>CPF</strong>, <strong>PIX</strong>, <strong>Cidade</strong> e{' '}
              <strong>Bairro de residência</strong>. Colaborador com o mesmo CPF de um já cadastrado
              é atualizado em vez de duplicado. Ainda não tem a planilha pronta?{' '}
              <button style={{ ...ui.linkButton, marginRight: 0 }} onClick={gerarModeloColaboradores}>
                Baixar modelo
              </button>
            </p>

            <input
              ref={inputArquivoRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={escolherArquivo}
              style={{ marginBottom: 14 }}
            />

            {lendoArquivo && <p style={ui.placeholderNote}>Lendo {nomeArquivoImportado}...</p>}
            {erroImportacao && <div style={ui.erro}>❌ {erroImportacao}</div>}

            {resultadoImportacao ? (
              <div style={{ ...ui.formCard, margin: '14px 0 0' }}>
                <p style={{ margin: 0 }}>
                  ✅ Importação concluída: <strong>{resultadoImportacao.criados}</strong> novo(s),{' '}
                  <strong>{resultadoImportacao.atualizados}</strong> atualizado(s)
                  {resultadoImportacao.comErro > 0 && (
                    <>
                      , <strong>{resultadoImportacao.comErro}</strong> linha(s) ignorada(s) por erro
                    </>
                  )}
                  .
                </p>
              </div>
            ) : (
              itensImportacao.length > 0 && (
                <>
                  <p style={ui.placeholderNote}>
                    {itensValidos.length} linha(s) pronta(s) pra importar
                    {itensComErro.length > 0 && ` · ${itensComErro.length} com erro (não serão importadas)`}.
                  </p>
                  <div style={{ ...ui.tableWrapper, maxHeight: 320, overflowY: 'auto' }}>
                    <table style={ui.table}>
                      <thead>
                        <tr>
                          <th style={ui.th}>Linha</th>
                          <th style={ui.th}>Nome</th>
                          <th style={ui.th}>CPF</th>
                          <th style={ui.th}>PIX</th>
                          <th style={ui.th}>Cidade</th>
                          <th style={ui.th}>Bairro</th>
                          <th style={ui.th}>Situação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itensImportacao.map((item) => (
                          <tr key={item.linhaPlanilha}>
                            <td style={ui.td}>{item.linhaPlanilha}</td>
                            <td style={ui.td}>{item.nome || '-'}</td>
                            <td style={ui.td}>{item.cpf ? formatarCpf(item.cpf) : '-'}</td>
                            <td style={ui.td}>{item.pix || '-'}</td>
                            <td style={ui.td}>{item.cidade || '-'}</td>
                            <td style={ui.td}>{item.bairro || '-'}</td>
                            <td style={ui.td}>
                              {item.erro ? (
                                <span style={{ ...ui.badge, ...ui.badgeVermelho }}>{item.erro}</span>
                              ) : item.acao === 'atualizar' ? (
                                <span style={{ ...ui.badge, ...ui.badgeLaranja }}>Atualiza existente</span>
                              ) : (
                                <span style={{ ...ui.badge, ...ui.badgeVerde }}>Novo</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              {!resultadoImportacao && itensValidos.length > 0 && (
                <button style={ui.primaryButton} onClick={confirmarImportacao} disabled={importando}>
                  {importando ? 'Importando...' : `✅ Importar ${itensValidos.length} colaborador(es)`}
                </button>
              )}
              <button style={ui.secondaryButton} onClick={fecharImportacao}>
                {resultadoImportacao ? 'Fechar' : 'Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
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
    padding: '24px 28px',
    maxWidth: 760,
    width: '94%',
    maxHeight: '88vh',
    overflowY: 'auto',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)'
  }
};
