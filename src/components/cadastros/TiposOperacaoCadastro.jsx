import React, { useEffect, useMemo, useState } from 'react';
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
import { analisarCalibragem, MIN_AMOSTRA } from '../../lib/calibragem';

const TIPO_VAZIO = { nome: '', semPadraoMeta: true, metaTempoMinutos: '', ativo: true };

const STATUS_LABEL = {
  sem_dados: { texto: `Aguardando registros (0/${MIN_AMOSTRA})`, estilo: 'badgeCinza' },
  aguardando: { texto: null, estilo: 'badgeCinza' }, // montado dinamicamente
  sugerir_estabelecer: { texto: 'Sugestão: estabelecer meta', estilo: 'badgeLaranja' },
  sugerir_ajuste: { texto: 'Sugestão: ajustar meta', estilo: 'badgeLaranja' },
  dentro_da_meta: { texto: 'Dentro da meta', estilo: 'badgeVerde' }
};

// O Tipo de Operação NÃO se vincula a uma Operação/Fluxo aqui no cadastro —
// esse vínculo é feito depois, na tela do Coletor, na hora de registrar de
// verdade (o coletor escolhe a Operação e o Tipo separadamente).
export default function TiposOperacaoCadastro({ permissoes }) {
  const perm = permissoes.cadastros?.tiposOperacao || {};

  const [tipos, setTipos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(TIPO_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const qTipos = query(collection(db, 'tiposOperacao'), orderBy('nome'));
    const unsubTipos = onSnapshot(
      qTipos,
      (snap) => {
        setTipos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    const unsubRegistros = onSnapshot(
      collection(db, 'registrosOperacao'),
      (snap) => setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setRegistros([])
    );
    return () => {
      unsubTipos();
      unsubRegistros();
    };
  }, []);

  const calibragemPorTipo = useMemo(() => {
    const mapa = {};
    tipos.forEach((tipo) => {
      const registrosDoTipo = registros.filter((r) => r.tipoOperacaoId === tipo.id);
      mapa[tipo.id] = analisarCalibragem(tipo, registrosDoTipo);
    });
    return mapa;
  }, [tipos, registros]);

  const abrirNovo = () => {
    setForm(TIPO_VAZIO);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (tipo) => {
    setForm({
      nome: tipo.nome || '',
      semPadraoMeta: tipo.semPadraoMeta !== false,
      metaTempoMinutos: tipo.metaTempoMinutos || '',
      ativo: tipo.ativo !== false
    });
    setEditandoId(tipo.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(TIPO_VAZIO);
    setErro('');
  };

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome do tipo de operação.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const payload = {
        nome: form.nome,
        ativo: form.ativo,
        semPadraoMeta: form.semPadraoMeta,
        metaTempoMinutos: form.semPadraoMeta ? null : Number(form.metaTempoMinutos) || null
      };
      if (editandoId) {
        await updateDoc(doc(db, 'tiposOperacao', editandoId), payload);
      } else {
        await addDoc(collection(db, 'tiposOperacao'), payload);
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (tipo) => {
    if (!window.confirm(`Excluir o tipo de operação "${tipo.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'tiposOperacao', tipo.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  const aplicarSugestao = async (tipo, minutos) => {
    try {
      await updateDoc(doc(db, 'tiposOperacao', tipo.id), {
        metaTempoMinutos: minutos,
        semPadraoMeta: false,
        calibradoEm: serverTimestamp()
      });
    } catch (e) {
      setErro('Falha ao aplicar a calibragem.');
    }
  };

  const aplicarValorManual = (tipo) => {
    const valor = window.prompt('Nova meta de tempo (minutos):', tipo.metaTempoMinutos || '');
    if (valor === null) return;
    const numero = Number(valor);
    if (!numero || numero <= 0) {
      window.alert('Informe um número de minutos válido.');
      return;
    }
    aplicarSugestao(tipo, numero);
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Tipo de Operação</h2>
        {perm.criar && !formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Novo tipo de operação
          </button>
        )}
      </div>

      <p style={ui.placeholderNote}>
        A calibragem de meta usa os registros de início/fim de cada operação (tela do Coletor):
        sugere ajuste depois de {MIN_AMOSTRA} registros, e depois disso a cada 10 novos, só quando
        o desvio da mediana passar de 10% para cima ou para baixo. Nunca aplica sozinho.
      </p>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar tipo de operação' : 'Novo tipo de operação'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome *
              <input style={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
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
              checked={!form.semPadraoMeta}
              onChange={(e) => setForm({ ...form, semPadraoMeta: !e.target.checked })}
            />
            Já tem um padrão de meta de tempo estabelecido para este tipo?
          </label>

          {!form.semPadraoMeta && (
            <label style={{ ...ui.label, maxWidth: 220, marginBottom: 14 }}>
              Meta de tempo (minutos)
              <input
                type="number"
                min="0"
                style={ui.input}
                value={form.metaTempoMinutos}
                onChange={(e) => setForm({ ...form, metaTempoMinutos: e.target.value })}
              />
            </label>
          )}
          {form.semPadraoMeta && (
            <p style={ui.placeholderNote}>
              Sem padrão ainda: a meta será sugerida pelo app assim que houver {MIN_AMOSTRA}{' '}
              registros de início/fim deste tipo.
            </p>
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
        <p>Carregando tipos de operação...</p>
      ) : tipos.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum tipo de operação cadastrado ainda.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome</th>
                <th style={ui.th}>Meta atual</th>
                <th style={ui.th}>Calibragem</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((tipo) => {
                const analise = calibragemPorTipo[tipo.id] || { status: 'sem_dados', amostra: 0 };
                const infoStatus = STATUS_LABEL[analise.status] || STATUS_LABEL.sem_dados;
                const textoStatus =
                  analise.status === 'aguardando'
                    ? `Aguardando registros (${analise.amostra}/${analise.amostra + analise.faltam})`
                    : analise.status === 'sugerir_ajuste'
                    ? `Sugestão: ${analise.sugestaoMinutos} min (desvio ${analise.desvioPct > 0 ? '+' : ''}${analise.desvioPct}%)`
                    : analise.status === 'sugerir_estabelecer'
                    ? `Sugestão: estabelecer ${analise.sugestaoMinutos} min`
                    : infoStatus.texto;

                return (
                  <tr key={tipo.id}>
                    <td style={ui.td}>{tipo.nome}</td>
                    <td style={ui.td}>
                      {tipo.semPadraoMeta || !tipo.metaTempoMinutos ? (
                        <span style={{ ...ui.badge, ...ui.badgeCinza }}>Sem padrão</span>
                      ) : (
                        `${tipo.metaTempoMinutos} min`
                      )}
                    </td>
                    <td style={ui.td}>
                      <span style={{ ...ui.badge, ...ui[infoStatus.estilo] }}>{textoStatus}</span>
                    </td>
                    <td style={ui.td}>
                      <span style={{ ...ui.badge, ...(tipo.ativo !== false ? ui.badgeVerde : ui.badgeCinza) }}>
                        {tipo.ativo !== false ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={ui.td}>
                      {perm.editar && (
                        <button style={ui.linkButton} onClick={() => abrirEdicao(tipo)}>
                          Editar
                        </button>
                      )}
                      {perm.editar && (analise.status === 'sugerir_ajuste' || analise.status === 'sugerir_estabelecer') && (
                        <>
                          <button
                            style={ui.linkButton}
                            onClick={() => aplicarSugestao(tipo, analise.sugestaoMinutos)}
                          >
                            Aplicar sugestão
                          </button>
                          <button style={ui.linkButton} onClick={() => aplicarValorManual(tipo)}>
                            Aplicar meu valor
                          </button>
                        </>
                      )}
                      {perm.deletar && (
                        <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(tipo)}>
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
