import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { ui, NAVY, ORANGE } from '../lib/styles';

// Tela do Coletor: quem está no campo escolhe a Operação (Recebimento/
// Expedição/Separação/Outros) e o Tipo de Operação, tira as fotos exigidas
// por aquela Operação (cadastradas em Cadastros → Operação → Operação),
// inicia, e depois finaliza — o tempo real vira registro pra calibragem de
// metas em Tipo de Operação. O vínculo entre Operação e Tipo é feito só
// aqui, na hora (ver nota em TiposOperacaoCadastro.jsx).
//
// ⚠️ As fotos ainda NÃO são enviadas/guardadas de verdade — só contamos
// quantas foram selecionadas pra liberar iniciar/finalizar. Persistir os
// arquivos precisa do Firebase Storage, que ainda não foi configurado
// neste projeto.
export default function ColetorScreen({ usuario }) {
  const [fluxos, setFluxos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [fluxoId, setFluxoId] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [fotosInicio, setFotosInicio] = useState(0);
  const [fotosFim, setFotosFim] = useState(0);
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
    return () => {
      unsubFluxos();
      unsubTipos();
      unsubRegistros();
    };
  }, []);

  // Atualiza o cronômetro da operação em andamento a cada segundo.
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const operacaoAtiva = useMemo(
    () => registros.find((r) => r.usuarioId === usuario.uid && !r.fim),
    [registros, usuario.uid]
  );

  const fluxoDaAtiva = fluxos.find((f) => f.id === operacaoAtiva?.fluxoId);
  const tipoDaAtiva = tipos.find((t) => t.id === operacaoAtiva?.tipoOperacaoId);
  const fluxoSelecionado = fluxos.find((f) => f.id === fluxoId);

  const iniciarInicioMs = operacaoAtiva?.inicio?.toMillis
    ? operacaoAtiva.inicio.toMillis()
    : operacaoAtiva?.inicio
    ? new Date(operacaoAtiva.inicio).getTime()
    : null;
  const decorridoSegundos = iniciarInicioMs ? Math.max(0, Math.floor((agora - iniciarInicioMs) / 1000)) : 0;
  const decorridoTexto = `${String(Math.floor(decorridoSegundos / 60)).padStart(2, '0')}:${String(
    decorridoSegundos % 60
  ).padStart(2, '0')}`;

  const iniciar = async () => {
    setErro('');
    if (!fluxoId || !tipoId) {
      setErro('Selecione a Operação e o Tipo de Operação.');
      return;
    }
    const faltam = (fluxoSelecionado?.fotosInicio || 0) - fotosInicio;
    if (faltam > 0) {
      setErro(`Faltam ${faltam} foto(s) de início.`);
      return;
    }
    setSalvando(true);
    try {
      await addDoc(collection(db, 'registrosOperacao'), {
        fluxoId,
        tipoOperacaoId: tipoId,
        usuarioId: usuario.uid,
        usuarioNome: usuario.nome,
        inicio: serverTimestamp(),
        fim: null,
        fotosInicioQtd: fotosInicio
      });
      setFluxoId('');
      setTipoId('');
      setFotosInicio(0);
    } catch (e) {
      setErro('Falha ao iniciar. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const finalizar = async () => {
    setErro('');
    const faltam = (fluxoDaAtiva?.fotosFim || 0) - fotosFim;
    if (faltam > 0) {
      setErro(`Faltam ${faltam} foto(s) de fim.`);
      return;
    }
    setSalvando(true);
    try {
      const tempoRealMinutos = iniciarInicioMs ? Math.max(1, Math.round((Date.now() - iniciarInicioMs) / 60000)) : null;
      await updateDoc(doc(db, 'registrosOperacao', operacaoAtiva.id), {
        fim: serverTimestamp(),
        fotosFimQtd: fotosFim,
        tempoRealMinutos
      });
      setFotosFim(0);
    } catch (e) {
      setErro('Falha ao finalizar. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return <p>Carregando...</p>;
  }

  if (fluxos.length === 0 || tipos.length === 0) {
    return (
      <div>
        <h2 style={ui.sectionTitle}>Coletor</h2>
        <p style={ui.placeholderNote}>
          Ainda não há {fluxos.length === 0 ? 'Operações' : 'Tipos de Operação'} cadastradas — peça
          pro Administrador cadastrar em Cadastros → Operação antes de começar a coletar.
        </p>
      </div>
    );
  }

  // ---- Operação em andamento: tela de finalizar ----
  if (operacaoAtiva) {
    return (
      <div>
        <h2 style={ui.sectionTitle}>Coletor</h2>
        <div style={styles.cardAtiva}>
          <div style={styles.cronometro}>{decorridoTexto}</div>
          <p style={styles.infoAtiva}>
            <strong>{fluxoDaAtiva?.nome || '...'}</strong> — {tipoDaAtiva?.nome || '...'}
          </p>
          <p style={{ ...ui.placeholderNote, textAlign: 'center' }}>Operação em andamento</p>

          {fluxoDaAtiva?.fotosFim > 0 && (
            <label style={{ ...ui.label, marginBottom: 14 }}>
              Fotos de fim (mín. {fluxoDaAtiva.fotosFim})
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => setFotosFim(e.target.files.length)}
              />
              {fotosFim > 0 && <span style={{ fontSize: 12, color: '#1E7A34' }}>{fotosFim} foto(s) selecionada(s)</span>}
            </label>
          )}

          {erro && <div style={ui.erro}>❌ {erro}</div>}

          <button style={styles.botaoFinalizar} onClick={finalizar} disabled={salvando}>
            {salvando ? 'Finalizando...' : '⏹ Finalizar operação'}
          </button>
        </div>
      </div>
    );
  }

  // ---- Nenhuma operação em andamento: tela de iniciar ----
  return (
    <div>
      <h2 style={ui.sectionTitle}>Coletor</h2>
      <div style={styles.cardNova}>
        <label style={ui.label}>
          Operação *
          <select
            style={ui.input}
            value={fluxoId}
            onChange={(e) => {
              setFluxoId(e.target.value);
              setFotosInicio(0);
            }}
          >
            <option value="">Selecione...</option>
            {fluxos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>

        <label style={{ ...ui.label, marginTop: 14 }}>
          Tipo de Operação *
          <select style={ui.input} value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">Selecione...</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>

        {fluxoSelecionado?.fotosInicio > 0 && (
          <label style={{ ...ui.label, marginTop: 14 }}>
            Fotos de início (mín. {fluxoSelecionado.fotosInicio})
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => setFotosInicio(e.target.files.length)}
            />
            {fotosInicio > 0 && <span style={{ fontSize: 12, color: '#1E7A34' }}>{fotosInicio} foto(s) selecionada(s)</span>}
          </label>
        )}

        {erro && <div style={ui.erro}>❌ {erro}</div>}

        <button style={styles.botaoIniciar} onClick={iniciar} disabled={salvando}>
          {salvando ? 'Iniciando...' : '▶ Iniciar operação'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  cardNova: {
    background: '#FFF',
    borderRadius: 8,
    padding: 24,
    maxWidth: 420,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
  },
  cardAtiva: {
    background: '#FFF',
    borderRadius: 8,
    padding: 24,
    maxWidth: 420,
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)'
  },
  cronometro: { fontSize: 48, fontWeight: 700, color: NAVY, fontVariantNumeric: 'tabular-nums' },
  infoAtiva: { fontSize: 16, margin: '8px 0' },
  botaoIniciar: {
    width: '100%',
    marginTop: 18,
    padding: 14,
    background: ORANGE,
    color: '#FFF',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 16
  },
  botaoFinalizar: {
    width: '100%',
    marginTop: 8,
    padding: 14,
    background: NAVY,
    color: '#FFF',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 16
  }
};
