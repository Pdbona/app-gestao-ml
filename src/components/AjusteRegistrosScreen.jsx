import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ui, NAVY } from '../lib/styles';
import { hojeISO, addDiasISO, paraMillis, dataLocalISO, formatarDataBr, formatarHorario } from '../lib/data';
import { TIPOS_VOLUME } from './ColetorScreen';

const PERIODO_PADRAO_DIAS = 7;

function paraDatetimeLocal(valor) {
  const ms = paraMillis(valor);
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// `datetime-local` sem sufixo de fuso é interpretado pelo `new Date()` como
// horário LOCAL — exatamente o que precisamos aqui, sem conversão manual.
function deDatetimeLocal(str) {
  return str ? new Date(str) : null;
}

const FORM_VAZIO = {
  clienteId: '',
  tipoOperacaoId: '',
  fluxoId: '',
  documentoProcesso: '',
  qtdVolumes: '',
  tipoVolume: '',
  qtdMdo: '',
  inicio: '',
  fim: '',
  observacao: ''
};

const STATUS_INFO = {
  andamento: { label: '🟢 Em andamento', estilo: 'badgeAzul' },
  finalizada: { label: 'Finalizada', estilo: 'badgeVerde' },
  cancelada: { label: 'Cancelada', estilo: 'badgeCinza' }
};

// Ferramenta do Gestor (07/09/2026, submenu novo dentro de "Planejamento")
// pra corrigir a mão os registros que o Coletor gerou — pro caso do
// operador esquecer de finalizar, digitar algo errado no início, ou pra
// lançar do zero uma operação que nem chegou a passar pelo app. Tudo que
// esta tela grava/edita carrega `ajustadoManualmente` + quem + quando, pra
// nunca se confundir com o que o Coletor gravou sozinho. "Cancelar" NUNCA
// apaga — só marca `cancelado: true`, que some de qualquer cálculo
// (Dashboard, Relatórios, calibragem) mas fica guardado pra auditoria.
export default function AjusteRegistrosScreen({ usuario }) {
  const [registros, setRegistros] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [fluxos, setFluxos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [filtroCliente, setFiltroCliente] = useState('');
  const [dataInicio, setDataInicio] = useState(addDiasISO(hojeISO(), -(PERIODO_PADRAO_DIAS - 1)));
  const [dataFim, setDataFim] = useState(hojeISO());

  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, 'registrosOperacao'), (snap) => {
        setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      }),
      onSnapshot(collection(db, 'clientes'), (snap) =>
        setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.status !== 'inativo'))
      ),
      onSnapshot(collection(db, 'tiposOperacao'), (snap) =>
        setTipos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.ativo !== false))
      ),
      onSnapshot(collection(db, 'fluxos'), (snap) =>
        setFluxos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => f.ativo !== false))
      )
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const nomeCliente = (id) => clientes.find((c) => c.id === id)?.nome || '(cliente removido)';
  const nomeTipo = (id) => tipos.find((t) => t.id === id)?.nome || '(tipo removido)';
  const nomeFluxo = (id) => fluxos.find((f) => f.id === id)?.nome || '(operação removida)';

  const statusDoRegistro = (r) => (r.cancelado ? 'cancelada' : r.fim ? 'finalizada' : 'andamento');

  const registrosFiltrados = useMemo(
    () =>
      registros
        .filter((r) => !filtroCliente || r.clienteId === filtroCliente)
        .filter((r) => {
          const ms = paraMillis(r.inicio);
          if (!ms) return false;
          const dia = dataLocalISO(new Date(ms));
          return dia >= dataInicio && dia <= dataFim;
        })
        .sort((a, b) => (paraMillis(b.inicio) || 0) - (paraMillis(a.inicio) || 0)),
    [registros, filtroCliente, dataInicio, dataFim]
  );

  const abrirNovo = () => {
    setForm({ ...FORM_VAZIO, inicio: paraDatetimeLocal(new Date()) });
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (r) => {
    setForm({
      clienteId: r.clienteId || '',
      tipoOperacaoId: r.tipoOperacaoId || '',
      fluxoId: r.fluxoId || '',
      documentoProcesso: r.documentoProcesso || '',
      qtdVolumes: String(r.qtdVolumes ?? ''),
      tipoVolume: r.tipoVolume || '',
      qtdMdo: String(r.qtdMdo ?? ''),
      inicio: paraDatetimeLocal(r.inicio),
      fim: paraDatetimeLocal(r.fim),
      observacao: r.observacao || ''
    });
    setEditandoId(r.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelarForm = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setErro('');
  };

  const salvar = async () => {
    if (!form.clienteId) return setErro('Selecione o Cliente/Local.');
    if (!form.tipoOperacaoId) return setErro('Selecione o Tipo de Operação.');
    if (!form.fluxoId) return setErro('Selecione a Operação.');
    if (!form.documentoProcesso.trim()) return setErro('Informe o documento do processo.');
    if (!(Number(form.qtdVolumes) > 0)) return setErro('Informe a quantidade de volumes (maior que zero).');
    if (!form.tipoVolume) return setErro('Selecione o tipo de volume.');
    if (!(Number(form.qtdMdo) > 0)) return setErro('Informe a quantidade de MdO (maior que zero).');
    if (!form.inicio) return setErro('Informe o início.');

    const inicioDate = deDatetimeLocal(form.inicio);
    const fimDate = form.fim ? deDatetimeLocal(form.fim) : null;
    let tempoRealMinutos = null;
    if (fimDate) {
      tempoRealMinutos = Math.round((fimDate.getTime() - inicioDate.getTime()) / 60000);
      if (tempoRealMinutos < 1) return setErro('O fim precisa ser depois do início.');
    }

    setSalvando(true);
    setErro('');
    try {
      const payload = {
        clienteId: form.clienteId,
        tipoOperacaoId: form.tipoOperacaoId,
        fluxoId: form.fluxoId,
        documentoProcesso: form.documentoProcesso.trim(),
        qtdVolumes: Number(form.qtdVolumes),
        tipoVolume: form.tipoVolume,
        qtdMdo: Number(form.qtdMdo),
        inicio: inicioDate,
        fim: fimDate,
        tempoRealMinutos,
        observacao: form.observacao.trim() || null,
        ajustadoManualmente: true,
        ajustadoPorNome: usuario.nome,
        ajustadoEm: serverTimestamp()
      };
      if (editandoId) {
        await updateDoc(doc(db, 'registrosOperacao', editandoId), payload);
      } else {
        await addDoc(collection(db, 'registrosOperacao'), {
          ...payload,
          usuarioId: usuario.uid,
          usuarioNome: usuario.nome,
          cancelado: false
        });
      }
      cancelarForm();
    } catch (e) {
      setErro('Falha ao salvar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const finalizarAgora = async (r) => {
    if (!window.confirm(`Finalizar agora a operação de ${nomeCliente(r.clienteId)} (Doc ${r.documentoProcesso})?`)) return;
    try {
      const inicioMs = paraMillis(r.inicio);
      const tempoRealMinutos = inicioMs ? Math.max(1, Math.round((Date.now() - inicioMs) / 60000)) : null;
      await updateDoc(doc(db, 'registrosOperacao', r.id), {
        fim: serverTimestamp(),
        tempoRealMinutos,
        ajustadoManualmente: true,
        ajustadoPorNome: usuario.nome,
        ajustadoEm: serverTimestamp()
      });
    } catch (e) {
      setErro('Falha ao finalizar. Tente novamente.');
    }
  };

  const alternarCancelamento = async (r) => {
    const vaiCancelar = !r.cancelado;
    const msg = vaiCancelar
      ? `Cancelar esta operação (${nomeCliente(r.clienteId)}, Doc ${r.documentoProcesso})? Ela some do Dashboard/Relatórios, mas continua guardada.`
      : `Reativar esta operação (${nomeCliente(r.clienteId)}, Doc ${r.documentoProcesso})?`;
    if (!window.confirm(msg)) return;
    try {
      await updateDoc(doc(db, 'registrosOperacao', r.id), {
        cancelado: vaiCancelar,
        canceladoPorNome: vaiCancelar ? usuario.nome : null,
        canceladoEm: vaiCancelar ? serverTimestamp() : null
      });
    } catch (e) {
      setErro('Falha ao salvar. Tente novamente.');
    }
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Ajuste de Registros</h2>
        {!formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Novo registro manual
          </button>
        )}
      </div>

      <p style={ui.placeholderNote}>
        Corrija ou lance à mão os registros do Coletor — pro caso do operador esquecer de finalizar,
        errar algum dado, ou nem chegar a registrar a operação no app. Tudo que for criado/editado
        aqui fica marcado como ajuste manual, com quem fez e quando. "Cancelar" nunca apaga — só some
        dos cálculos (Dashboard, Relatórios, calibragem), mantendo o registro guardado.
      </p>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar registro' : 'Novo registro manual'}</h3>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Cliente/Local *
              <select style={ui.input} value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                <option value="">Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label style={ui.label}>
              Tipo de Operação *
              <select
                style={ui.input}
                value={form.tipoOperacaoId}
                onChange={(e) => setForm({ ...form, tipoOperacaoId: e.target.value })}
              >
                <option value="">Selecione...</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </label>
            <label style={ui.label}>
              Operação (fluxo) *
              <select style={ui.input} value={form.fluxoId} onChange={(e) => setForm({ ...form, fluxoId: e.target.value })}>
                <option value="">Selecione...</option>
                {fluxos.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </label>
            <label style={ui.label}>
              Documento do processo *
              <input
                style={ui.input}
                value={form.documentoProcesso}
                onChange={(e) => setForm({ ...form, documentoProcesso: e.target.value })}
              />
            </label>
            <label style={ui.label}>
              Qtd. de volumes *
              <input
                type="number"
                min="1"
                style={ui.input}
                value={form.qtdVolumes}
                onChange={(e) => setForm({ ...form, qtdVolumes: e.target.value })}
              />
            </label>
            <label style={ui.label}>
              Tipo de volume *
              <select style={ui.input} value={form.tipoVolume} onChange={(e) => setForm({ ...form, tipoVolume: e.target.value })}>
                <option value="">Selecione...</option>
                {TIPOS_VOLUME.map((t) => (
                  <option key={t} value={t}>
                    {t}
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
            <label style={ui.label}>
              Início *
              <input type="datetime-local" style={ui.input} value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
            </label>
            <label style={ui.label}>
              Fim
              <input type="datetime-local" style={ui.input} value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
              <span style={{ fontSize: 11, color: '#999', fontWeight: 400 }}>Em branco = operação em andamento</span>
            </label>
          </div>

          <label style={{ ...ui.label, marginBottom: 14 }}>
            Observação
            <textarea
              style={{ ...ui.input, minHeight: 60, fontFamily: 'inherit' }}
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </label>

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={ui.primaryButton} onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <button style={ui.secondaryButton} onClick={cancelarForm} disabled={salvando}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={ui.formGrid}>
        <label style={ui.label}>
          Cliente
          <select style={ui.input} value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={ui.label}>
          De
          <input type="date" style={ui.input} value={dataInicio} max={dataFim} onChange={(e) => setDataInicio(e.target.value)} />
        </label>
        <label style={ui.label}>
          Até
          <input type="date" style={ui.input} value={dataFim} min={dataInicio} onChange={(e) => setDataFim(e.target.value)} />
        </label>
      </div>

      {carregando ? (
        <p>Carregando registros...</p>
      ) : registrosFiltrados.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum registro no período/cliente selecionado.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Início</th>
                <th style={ui.th}>Cliente</th>
                <th style={ui.th}>Tipo / Operação</th>
                <th style={ui.th}>Documento</th>
                <th style={ui.th}>Volumes</th>
                <th style={ui.th}>MdO</th>
                <th style={ui.th}>Fim</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {registrosFiltrados.map((r) => {
                const status = statusDoRegistro(r);
                const info = STATUS_INFO[status];
                return (
                  <tr key={r.id}>
                    <td style={ui.td}>
                      {formatarDataBr(dataLocalISO(new Date(paraMillis(r.inicio) || Date.now())))} {formatarHorario(r.inicio)}
                    </td>
                    <td style={ui.td}>{nomeCliente(r.clienteId)}</td>
                    <td style={ui.td}>
                      {nomeTipo(r.tipoOperacaoId)} — {nomeFluxo(r.fluxoId)}
                    </td>
                    <td style={ui.td}>{r.documentoProcesso}</td>
                    <td style={ui.td}>
                      {r.qtdVolumes} {r.tipoVolume || ''}
                    </td>
                    <td style={ui.td}>{r.qtdMdo}</td>
                    <td style={ui.td}>{r.fim ? formatarHorario(r.fim) : '—'}</td>
                    <td style={ui.td}>
                      <span style={{ ...ui.badge, ...ui[info.estilo] }}>{info.label}</span>
                      {r.ajustadoManualmente && (
                        <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                          Ajustado por {r.ajustadoPorNome}
                        </div>
                      )}
                    </td>
                    <td style={ui.td}>
                      <button style={ui.linkButton} onClick={() => abrirEdicao(r)}>
                        Editar
                      </button>
                      {!r.fim && !r.cancelado && (
                        <button style={ui.linkButton} onClick={() => finalizarAgora(r)}>
                          Finalizar agora
                        </button>
                      )}
                      <button
                        style={{ ...ui.linkButton, color: r.cancelado ? NAVY : '#D32F2F' }}
                        onClick={() => alternarCancelamento(r)}
                      >
                        {r.cancelado ? 'Reativar' : 'Cancelar'}
                      </button>
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
