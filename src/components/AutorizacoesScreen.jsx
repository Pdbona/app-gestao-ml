import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../firebase';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ui, NAVY } from '../lib/styles';
import { formatarDataBr } from '../lib/data';

// Fila de solicitações de presença que precisam de autorização da liderança
// (CheckinPublicScreen.jsx cria um doc em `solicitacoesPresenca` — sem
// prazo de expiração automática, fica pendente até resolver aqui). 2 tipos
// (`s.tipo`, ver avaliarJanelaEntrada em CheckinPublicScreen.jsx):
// - 'atraso' (já existia): tentou confirmar chegada mais de 10min depois do
//   início do turno planejado.
// - 'retorno' (08/09/2026, pedido do Pablo): já tinha registrado chegada E
//   saída nesse turno/dia e está tentando confirmar uma NOVA chegada
//   (precisou voltar por algum motivo). Docs antigos sem `s.tipo` são
//   tratados como 'atraso' (era o único tipo antes de existir 'retorno').
// É uma tela própria — não embutida no Dashboard — de propósito: a
// permissão `abas.autorizacoes` é desacoplada de `abas.dashboard`, pra dar
// pra um líder de turno autorizar sem precisar de acesso ao Dashboard
// inteiro. Mesmo padrão visual do modal de "falta" do Dashboard (overlay +
// card + 2 botões), mas com Aprovar/Negar no lugar de Alterar/Confirmar.
export default function AutorizacoesScreen({ usuario }) {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modalSolicitacao, setModalSolicitacao] = useState(null);
  const [resolvendo, setResolvendo] = useState(false);
  const [erro, setErro] = useState('');
  const [erroCarga, setErroCarga] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'solicitacoesPresenca'),
      (snap) => {
        setSolicitacoes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => {
        // Sem regra de segurança liberada pra essa coleção ainda (pendência
        // de infraestrutura, ver CheckinPublicScreen.jsx) — sem esse
        // callback de erro, o onSnapshot falha silenciosamente e a tela
        // fica presa em "Carregando..." pra sempre.
        setErroCarga('Falha ao carregar as solicitações. Fale com o Administrativo.');
        setCarregando(false);
      }
    );
    return () => unsub();
  }, []);

  const pendentes = useMemo(
    () =>
      solicitacoes
        .filter((s) => s.status === 'pendente')
        .sort((a, b) => (a.solicitadoEm?.toMillis?.() || 0) - (b.solicitadoEm?.toMillis?.() || 0)),
    [solicitacoes]
  );

  const abrirModal = (solicitacao) => {
    setModalSolicitacao(solicitacao);
    setErro('');
  };

  const fecharModal = () => {
    setModalSolicitacao(null);
    setErro('');
  };

  const resolver = async (status) => {
    setResolvendo(true);
    setErro('');
    try {
      await updateDoc(doc(db, 'solicitacoesPresenca', modalSolicitacao.id), {
        status,
        resolvidoPor: usuario.uid,
        resolvidoPorNome: usuario.nome,
        resolvidoEm: serverTimestamp()
      });
      fecharModal();
    } catch (e) {
      setErro('Falha ao salvar. Tente novamente.');
    } finally {
      setResolvendo(false);
    }
  };

  if (carregando) {
    return <p style={ui.placeholderNote}>Carregando...</p>;
  }

  return (
    <div>
      <h2 style={ui.sectionTitle}>Autorizações de presença</h2>
      <p style={ui.placeholderNote}>
        Solicitações que precisam de autorização da liderança: chegada com mais de 10min de atraso, ou
        colaborador tentando confirmar uma NOVA chegada depois de já ter registrado saída no turno hoje
        — autorize ou negue pra liberar (ou não) o check-in.
      </p>

      {erroCarga ? (
        <div style={ui.erro}>❌ {erroCarga}</div>
      ) : pendentes.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhuma solicitação de presença pendente.</p>
      ) : (
        <div style={styles.lista}>
          {pendentes.map((s) => (
            <div key={s.id} style={styles.card} onClick={() => abrirModal(s)}>
              <div>
                <div style={styles.cardColaborador}>{s.colaboradorNome}</div>
                <div style={styles.cardInfo}>
                  {s.clienteNome} — {s.turnoNome} ({s.horaInicioTurno || '--:--'}) · {formatarDataBr(s.data)}
                </div>
              </div>
              <span style={{ ...ui.badge, ...ui.badgeLaranja }}>
                {s.tipo === 'retorno' ? '🔁 Retorno após saída' : `${s.minutosAtraso ?? '?'}min de atraso`}
              </span>
            </div>
          ))}
        </div>
      )}

      {modalSolicitacao && (
        <div style={styles.overlay} onClick={fecharModal}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: NAVY }}>{modalSolicitacao.colaboradorNome}</h3>
            <p style={ui.placeholderNote}>
              CPF: {modalSolicitacao.cpf} · {modalSolicitacao.clienteNome} — {modalSolicitacao.turnoNome}
              <br />
              Início do turno: {modalSolicitacao.horaInicioTurno || '--:--'} · Data:{' '}
              {formatarDataBr(modalSolicitacao.data)}
              <br />
              {modalSolicitacao.tipo === 'retorno' ? (
                <>Já registrou chegada e saída nesse turno hoje — está pedindo pra confirmar uma NOVA chegada.</>
              ) : (
                <>Atraso no momento da solicitação: {modalSolicitacao.minutosAtraso}min</>
              )}
            </p>

            {erro && <div style={ui.erro}>❌ {erro}</div>}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button style={ui.primaryButton} onClick={() => resolver('aprovada')} disabled={resolvendo}>
                {resolvendo ? 'Salvando...' : 'Aprovar'}
              </button>
              <button style={ui.secondaryButton} onClick={() => resolver('negada')} disabled={resolvendo}>
                Negar
              </button>
            </div>
            <p style={{ ...ui.placeholderNote, marginTop: 10 }}>
              Aprovar libera o colaborador a refazer o check-in (ele precisa escanear o QR Code de
              novo). Negar bloqueia o check-in nesse turno/dia.
            </p>

            <button style={{ ...ui.linkButton, marginTop: 6 }} onClick={fecharModal}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  lista: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    background: '#FFF',
    borderRadius: 8,
    padding: '14px 18px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    cursor: 'pointer',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  cardColaborador: { fontWeight: 700, color: NAVY, fontSize: 15 },
  cardInfo: { fontSize: 13, color: '#666', marginTop: 2 },

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
    padding: 28,
    maxWidth: 420,
    width: '90%',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)'
  }
};
