import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { NAVY, ORANGE } from '../lib/styles';
import { redimensionarImagemParaBase64 } from '../lib/imagem';
import { hojeISO } from '../lib/data';

// Fotos do romaneio (início/fim) ficam maiores que a selfie/logo — precisam
// dar pra ler o documento na foto — mas ainda comprimidas o bastante pra
// não pesar (guardadas em subcoleção `fotos`, ver salvarFotos abaixo).
const FOTO_OPERACAO_DIM_MAX = 640;
const FOTO_OPERACAO_QUALIDADE = 0.7;

async function salvarFotos(operacaoId, arquivos, tipo) {
  const validos = arquivos.filter(Boolean);
  await Promise.all(
    validos.map(async (file, i) => {
      const base64 = await redimensionarImagemParaBase64(file, FOTO_OPERACAO_DIM_MAX, FOTO_OPERACAO_QUALIDADE);
      await addDoc(collection(db, 'registrosOperacao', operacaoId, 'fotos'), {
        tipo,
        ordem: i,
        base64,
        criadoEm: serverTimestamp()
      });
    })
  );
}

// Slot de uma foto obrigatória: tira na hora (câmera do celular, sem opção
// de galeria — `capture="environment"`) e mostra um preview local (blob URL
// só nesta sessão). Tocar de novo no preview deixa retirar a foto.
function FotoSlot({ label, file, onChange }) {
  const inputRef = useRef(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <div style={styles.fotoSlotWrap}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        style={{ ...styles.fotoSlot, ...(url ? styles.fotoSlotPreenchido : {}) }}
      >
        {url ? <img src={url} alt={label} style={styles.fotoThumb} /> : <span style={styles.fotoIcone}>📷</span>}
      </button>
      <span style={styles.fotoLabel}>{url ? '✅ ' : ''}{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => onChange(e.target.files[0] || null)}
      />
    </div>
  );
}

function GradeFotos({ quantidade, arquivos, onChangeSlot, prefixo }) {
  if (!quantidade) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={styles.rotulo}>Fotos {prefixo} (obrigatório: {quantidade})</div>
      <div style={styles.fotosGrid}>
        {Array.from({ length: quantidade }).map((_, i) => (
          <FotoSlot
            key={i}
            label={`Foto ${i + 1}`}
            file={arquivos[i] || null}
            onChange={(file) => onChangeSlot(i, file)}
          />
        ))}
      </div>
    </div>
  );
}

// Tela do Coletor — pensada primeiro pro celular (é assim que o perfil de
// Operação normalmente vai usar): cards grandes, um campo por linha, fotos
// tiradas na hora (sem galeria), botão de ação só libera quando tudo que é
// obrigatório estiver preenchido.
//
// ⚠️ As fotos ainda NÃO são enviadas/guardadas de verdade (preview só dura
// a sessão) — falta configurar o Firebase Storage pra persistir os arquivos.
export default function ColetorScreen({ usuario }) {
  const [fluxos, setFluxos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [planejamentos, setPlanejamentos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [clienteId, setClienteId] = useState('');
  const [fluxoId, setFluxoId] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [documentoProcesso, setDocumentoProcesso] = useState('');
  const [qtdVolumes, setQtdVolumes] = useState('');
  const [qtdMdo, setQtdMdo] = useState('');
  const [fotosInicio, setFotosInicio] = useState([]);
  const [fotosFim, setFotosFim] = useState([]);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    const unsubFluxos = onSnapshot(collection(db, 'fluxos'), (snap) => {
      setFluxos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => f.ativo !== false));
      setCarregando(false);
    });
    const unsubTipos = onSnapshot(collection(db, 'tiposOperacao'), (snap) => {
      setTipos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.ativo !== false));
    });
    const unsubRegistros = onSnapshot(collection(db, 'registrosOperacao'), (snap) => {
      setRegistros(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubClientes = onSnapshot(collection(db, 'clientes'), (snap) => {
      setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.status !== 'inativo'));
    });
    const unsubPlanejamentos = onSnapshot(collection(db, 'planejamentoOperacional'), (snap) => {
      setPlanejamentos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubFluxos();
      unsubTipos();
      unsubRegistros();
      unsubClientes();
      unsubPlanejamentos();
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Operação em andamento — só a do PRÓPRIO usuário logado. Como só ele
  // enxerga a dele aqui, na prática só ele consegue finalizá-la: o
  // requisito "só quem iniciou pode finalizar" já sai garantido disso.
  const operacaoAtiva = useMemo(
    () => registros.find((r) => r.usuarioId === usuario.uid && !r.fim),
    [registros, usuario.uid]
  );

  const fluxoDaAtiva = fluxos.find((f) => f.id === operacaoAtiva?.fluxoId);
  const tipoDaAtiva = tipos.find((t) => t.id === operacaoAtiva?.tipoOperacaoId);
  const clienteDaAtiva = clientes.find((c) => c.id === operacaoAtiva?.clienteId);
  const fluxoSelecionado = fluxos.find((f) => f.id === fluxoId);

  // Teto de MdO pra hoje neste cliente: soma o que o Administrativo
  // planejou (todos os turnos) em Planejamento Operacional. O operador não
  // consegue digitar mais que isso — se precisar de mais gente, quem tem
  // que mexer é o Administrativo, lá no planejamento (regra do Pablo:
  // "o que foi planejado tem que ser cumprido pelo operador").
  const mdoPlanejadoHoje = planejamentos
    .filter((p) => p.clienteId === clienteId && p.data === hojeISO())
    .reduce((soma, p) => soma + (Number(p.qtdMdo) || 0), 0);

  // Zera as fotos de início quando troca de Operação (a quantidade exigida
  // muda de uma pra outra).
  useEffect(() => {
    setFotosInicio(Array(fluxoSelecionado?.fotosInicio || 0).fill(null));
  }, [fluxoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setFotosFim(Array(fluxoDaAtiva?.fotosFim || 0).fill(null));
  }, [operacaoAtiva?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const iniciarInicioMs = operacaoAtiva?.inicio?.toMillis
    ? operacaoAtiva.inicio.toMillis()
    : operacaoAtiva?.inicio
    ? new Date(operacaoAtiva.inicio).getTime()
    : null;
  const decorridoSegundos = iniciarInicioMs ? Math.max(0, Math.floor((agora - iniciarInicioMs) / 1000)) : 0;
  const decorridoTexto = `${String(Math.floor(decorridoSegundos / 60)).padStart(2, '0')}:${String(
    decorridoSegundos % 60
  ).padStart(2, '0')}`;

  const fotosInicioOk = fotosInicio.filter(Boolean).length >= (fluxoSelecionado?.fotosInicio || 0);
  const mdoDentroDoPlanejado = Number(qtdMdo) > 0 && Number(qtdMdo) <= mdoPlanejadoHoje;
  const podeIniciar =
    Boolean(clienteId) &&
    Boolean(fluxoId) &&
    Boolean(tipoId) &&
    Boolean(documentoProcesso.trim()) &&
    Number(qtdVolumes) > 0 &&
    mdoDentroDoPlanejado &&
    fotosInicioOk;

  const fotosFimOk = fotosFim.filter(Boolean).length >= (fluxoDaAtiva?.fotosFim || 0);

  const setFotoInicioSlot = (i, file) => {
    setFotosInicio((arr) => {
      const novo = [...arr];
      novo[i] = file;
      return novo;
    });
  };
  const setFotoFimSlot = (i, file) => {
    setFotosFim((arr) => {
      const novo = [...arr];
      novo[i] = file;
      return novo;
    });
  };

  const iniciar = async () => {
    if (!podeIniciar) return;
    setErro('');
    setSalvando(true);
    try {
      const novoDocRef = await addDoc(collection(db, 'registrosOperacao'), {
        clienteId,
        fluxoId,
        tipoOperacaoId: tipoId,
        documentoProcesso: documentoProcesso.trim(),
        qtdVolumes: Number(qtdVolumes),
        qtdMdo: Number(qtdMdo),
        usuarioId: usuario.uid,
        usuarioNome: usuario.nome,
        inicio: serverTimestamp(),
        fim: null,
        fotosInicioQtd: fotosInicio.filter(Boolean).length
      });
      await salvarFotos(novoDocRef.id, fotosInicio, 'inicio');
      // Atualização otimista local — não espera o listener do Firestore
      // ecoar de volta (com serverTimestamp() pendente, o snapshot local
      // mostra `inicio: null` até o servidor confirmar, o que podia
      // deixar a tela "presa" na tela de Nova Operação por um instante
      // em conexão ruim). Ver mesmo ajuste em `finalizar`.
      setRegistros((atual) => [
        ...atual,
        {
          id: novoDocRef.id,
          clienteId,
          fluxoId,
          tipoOperacaoId: tipoId,
          documentoProcesso: documentoProcesso.trim(),
          qtdVolumes: Number(qtdVolumes),
          qtdMdo: Number(qtdMdo),
          usuarioId: usuario.uid,
          usuarioNome: usuario.nome,
          inicio: new Date(),
          fim: null
        }
      ]);
      setClienteId('');
      setFluxoId('');
      setTipoId('');
      setDocumentoProcesso('');
      setQtdVolumes('');
      setQtdMdo('');
      setFotosInicio([]);
    } catch (e) {
      setErro('Falha ao iniciar. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const finalizar = async () => {
    if (!fotosFimOk) return;
    setErro('');
    setSalvando(true);
    try {
      const tempoRealMinutos = iniciarInicioMs ? Math.max(1, Math.round((Date.now() - iniciarInicioMs) / 60000)) : null;
      await updateDoc(doc(db, 'registrosOperacao', operacaoAtiva.id), {
        fim: serverTimestamp(),
        fotosFimQtd: fotosFim.filter(Boolean).length,
        observacao: observacao.trim() || null,
        tempoRealMinutos
      });
      await salvarFotos(operacaoAtiva.id, fotosFim, 'fim');
      // Mesmo ajuste de cima: corrige localmente na hora, sem esperar o
      // listener — é o que resolve a tela ficar "presa" depois de
      // finalizar (bug relatado pelo Pablo em 03/09/2026).
      setRegistros((atual) =>
        atual.map((r) => (r.id === operacaoAtiva.id ? { ...r, fim: new Date(), tempoRealMinutos } : r))
      );
      setFotosFim([]);
      setObservacao('');
    } catch (e) {
      setErro('Falha ao finalizar. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  // TODO: funcionalidade de pausa ainda a ser definida com o Pablo — por
  // enquanto o botão é só o placeholder visual.
  const pausar = () => {};

  if (carregando) {
    return <p>Carregando...</p>;
  }

  if (fluxos.length === 0 || tipos.length === 0 || clientes.length === 0) {
    return (
      <div style={styles.pagina}>
        <h2 style={styles.tituloPagina}>Coletor</h2>
        <p style={styles.avisoVazio}>
          Ainda não há{' '}
          {clientes.length === 0 ? 'Clientes' : fluxos.length === 0 ? 'Operações' : 'Tipos de Operação'}{' '}
          cadastrados — peça pro Administrador cadastrar em Cadastros antes de começar a coletar.
        </p>
      </div>
    );
  }

  // ---- Operação em andamento: tela de finalizar ----
  if (operacaoAtiva) {
    return (
      <div style={styles.pagina}>
        <div style={styles.card}>
          <div style={styles.cronometro}>{decorridoTexto}</div>
          <p style={styles.infoAtiva}>
            <strong>{clienteDaAtiva?.nome || '...'}</strong>
            <br />
            {fluxoDaAtiva?.nome || '...'} — {tipoDaAtiva?.nome || '...'}
          </p>
          <div style={styles.tagsAtiva}>
            {operacaoAtiva.documentoProcesso && <span style={styles.tag}>{operacaoAtiva.documentoProcesso}</span>}
            {operacaoAtiva.qtdVolumes != null && <span style={styles.tag}>{operacaoAtiva.qtdVolumes} volume(s)</span>}
            {operacaoAtiva.qtdMdo != null && <span style={styles.tag}>{operacaoAtiva.qtdMdo} MdO</span>}
          </div>
          <p style={styles.emAndamento}>🟢 Operação em andamento</p>

          <button type="button" style={styles.botaoPausar} onClick={pausar}>
            ⏸ Pausar
          </button>

          <GradeFotos
            quantidade={fluxoDaAtiva?.fotosFim || 0}
            arquivos={fotosFim}
            onChangeSlot={setFotoFimSlot}
            prefixo="de fim"
          />

          <label style={styles.rotulo}>
            Observação (opcional)
            <textarea
              style={styles.textarea}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Alguma observação sobre esta operação..."
            />
          </label>

          {erro && <div style={styles.erro}>❌ {erro}</div>}

          <button
            style={{ ...styles.botaoGrande, ...styles.botaoFinalizar, ...(!fotosFimOk ? styles.botaoDesabilitado : {}) }}
            onClick={finalizar}
            disabled={salvando || !fotosFimOk}
          >
            {salvando ? 'Finalizando...' : '⏹ Finalizar operação'}
          </button>
          {!fotosFimOk && (fluxoDaAtiva?.fotosFim || 0) > 0 && (
            <p style={styles.dicaBotao}>Tire todas as fotos de fim pra liberar.</p>
          )}
        </div>
      </div>
    );
  }

  // ---- Nenhuma operação em andamento: tela de iniciar ----
  return (
    <div style={styles.pagina}>
      <div style={styles.card}>
        <h2 style={styles.tituloCard}>Nova operação</h2>

        <label style={styles.rotulo}>
          Cliente/Local *
          <span style={styles.ajuda}>Em qual cliente/obra você está agora</span>
          <select style={styles.input} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Selecione...</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.rotulo}>
          Tipo de Operação *
          <span style={styles.ajuda}>O que está sendo manuseado (ex: pneus, geladeira)</span>
          <select style={styles.input} value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">Selecione...</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.rotulo}>
          Operação (fluxo) *
          <span style={styles.ajuda}>Etapa do processo: recebimento, separação, expedição...</span>
          <select style={styles.input} value={fluxoId} onChange={(e) => setFluxoId(e.target.value)}>
            <option value="">Selecione...</option>
            {fluxos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.rotulo}>
          Documento do processo *
          <span style={styles.ajuda}>Número da NF, Conhecimento ou Pedido</span>
          <input
            type="text"
            inputMode="numeric"
            style={styles.input}
            value={documentoProcesso}
            onChange={(e) => setDocumentoProcesso(e.target.value)}
            placeholder="Nº do documento"
          />
        </label>

        <div style={styles.duasColunas}>
          <label style={styles.rotulo}>
            Qtd. de volumes *
            <span style={styles.ajuda}>Itens/paletes desta operação</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              style={styles.input}
              value={qtdVolumes}
              onChange={(e) => setQtdVolumes(e.target.value)}
            />
          </label>
          <label style={styles.rotulo}>
            Qtd. de MdO *
            <span style={styles.ajuda}>
              {clienteId
                ? `Colaboradores nesta operação (máx. ${mdoPlanejadoHoje} planejado hoje)`
                : 'Colaboradores dedicados a esta operação'}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={clienteId ? mdoPlanejadoHoje : undefined}
              style={styles.input}
              value={qtdMdo}
              onChange={(e) => setQtdMdo(e.target.value)}
            />
          </label>
        </div>
        {clienteId && mdoPlanejadoHoje === 0 && (
          <p style={styles.avisoPlanejamento}>
            ⚠️ Não há MdO planejada pra hoje neste cliente. Peça pro Administrativo lançar em
            Planejamento antes de iniciar.
          </p>
        )}
        {clienteId && mdoPlanejadoHoje > 0 && Number(qtdMdo) > mdoPlanejadoHoje && (
          <p style={styles.avisoPlanejamento}>
            ⚠️ Só há {mdoPlanejadoHoje} colaborador(es) planejado(s) pra hoje. Se precisar de mais,
            peça pro Administrativo ajustar o Planejamento.
          </p>
        )}

        {fluxoSelecionado && (
          <GradeFotos
            quantidade={fluxoSelecionado.fotosInicio || 0}
            arquivos={fotosInicio}
            onChangeSlot={setFotoInicioSlot}
            prefixo="de início"
          />
        )}

        {erro && <div style={styles.erro}>❌ {erro}</div>}

        <button
          style={{ ...styles.botaoGrande, ...styles.botaoIniciar, ...(!podeIniciar ? styles.botaoDesabilitado : {}) }}
          onClick={iniciar}
          disabled={salvando || !podeIniciar}
        >
          {salvando ? 'Iniciando...' : '▶ Iniciar operação'}
        </button>
        {!podeIniciar && <p style={styles.dicaBotao}>Preencha todos os campos e fotos obrigatórias pra liberar.</p>}
      </div>
    </div>
  );
}

const styles = {
  pagina: { display: 'flex', justifyContent: 'center', padding: '4px 0' },
  tituloPagina: { color: NAVY, textAlign: 'center' },
  avisoVazio: { color: '#777', fontSize: 14, textAlign: 'center', maxWidth: 420 },

  card: {
    background: '#FFF',
    borderRadius: 12,
    padding: '24px 20px',
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 1px 6px rgba(0,0,0,0.1)'
  },
  tituloCard: { margin: '0 0 18px', color: NAVY, fontSize: 20, textAlign: 'center' },

  rotulo: { display: 'flex', flexDirection: 'column', fontSize: 14, fontWeight: 600, color: '#444', gap: 6, marginBottom: 16 },
  ajuda: { fontSize: 11, fontWeight: 400, color: '#999', marginTop: -4 },
  avisoPlanejamento: {
    background: '#FFF3E0',
    color: '#B85700',
    fontSize: 12,
    padding: '8px 10px',
    borderRadius: 6,
    marginTop: -8,
    marginBottom: 14
  },
  input: {
    padding: '13px 12px',
    borderRadius: 8,
    border: '1px solid #CCC',
    fontSize: 16,
    fontWeight: 400,
    background: '#FFF'
  },
  textarea: {
    padding: '13px 12px',
    borderRadius: 8,
    border: '1px solid #CCC',
    fontSize: 16,
    fontWeight: 400,
    minHeight: 70,
    resize: 'vertical',
    fontFamily: 'inherit'
  },
  duasColunas: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 14
  },

  fotosGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 10 },
  fotoSlotWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  fotoSlot: {
    width: '100%',
    aspectRatio: '1',
    borderRadius: 10,
    border: '2px dashed #BBB',
    background: '#FAFAFA',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    overflow: 'hidden'
  },
  fotoSlotPreenchido: { border: `2px solid ${NAVY}` },
  fotoIcone: { fontSize: 26 },
  fotoThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  fotoLabel: { fontSize: 11, color: '#666', textAlign: 'center' },

  cronometro: { fontSize: 52, fontWeight: 700, color: NAVY, textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
  infoAtiva: { fontSize: 17, textAlign: 'center', margin: '4px 0 12px', lineHeight: 1.4 },
  tagsAtiva: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 8 },
  tag: { background: '#EEF2F7', color: NAVY, borderRadius: 12, padding: '4px 12px', fontSize: 12, fontWeight: 600 },
  emAndamento: { textAlign: 'center', color: '#1E7A34', fontWeight: 600, marginBottom: 16 },

  erro: { color: '#D32F2F', marginTop: 4, marginBottom: 12, fontSize: 14, textAlign: 'center' },

  botaoGrande: {
    width: '100%',
    padding: 16,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 17,
    marginTop: 8
  },
  botaoIniciar: { background: ORANGE, color: '#FFF' },
  botaoFinalizar: { background: NAVY, color: '#FFF' },
  botaoPausar: {
    width: '100%',
    padding: 12,
    border: `1px solid ${NAVY}`,
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15,
    marginBottom: 18,
    background: '#FFF',
    color: NAVY
  },
  botaoDesabilitado: { background: '#CCC', color: '#888', cursor: 'not-allowed' },
  dicaBotao: { textAlign: 'center', fontSize: 12, color: '#999', marginTop: 8 }
};
