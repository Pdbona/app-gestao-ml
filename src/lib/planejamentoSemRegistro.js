// Planejamento (Cliente/Local + Turno + dia) sem NENHUM registro do
// Coletor (registrosOperacao) pro mesmo Cliente/Local naquele dia —
// spec do Pablo (09/09/2026): a partir do dia ÚTIL seguinte ao dia
// planejado, vira um alerta no Dashboard pedindo ajuste ou cancelamento;
// se ninguém mexer até completar 2 dias úteis, cancela sozinho. Mesma
// filosofia "preguiçosa" da limpeza de selfie/fotos (lib/limpezaSelfies.js,
// lib/limpezaFotosOperacao.js) — sem Cloud Function agendada, roda
// quando alguém abre o Dashboard.
//
// registrosOperacao não guarda `turnoId` (Coletor não pergunta turno),
// então a checagem é por Cliente/Local + dia, não por turno específico —
// é a granularidade que os dados permitem.
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { dataLocalISO, paraMillis, addDiasUteisISO, hojeISO } from './data';

export const DIAS_UTEIS_ALERTA = 1;
export const DIAS_UTEIS_CANCELAMENTO = 2;

export function diaUtilAlerta(dataPlanejamentoISO) {
  return addDiasUteisISO(dataPlanejamentoISO, DIAS_UTEIS_ALERTA);
}

export function diaUtilCancelamentoAutomatico(dataPlanejamentoISO) {
  return addDiasUteisISO(dataPlanejamentoISO, DIAS_UTEIS_CANCELAMENTO);
}

// `planejamentos`/`registros` já vêm sem cancelado (mesmo shape usado no
// resto do Dashboard). Devolve os planejamentos de dias PASSADOS sem
// nenhum registro do mesmo cliente naquele dia, já elegíveis pro alerta
// (dia útil seguinte já chegou) — cada item ganha
// `diaUtilCancelamento`/`podeSerCanceladoAutomatico` pra UI e limpeza.
export function planejamentosSemRegistro(planejamentos, registros, hoje = hojeISO()) {
  const diasComRegistroPorCliente = new Map(); // clienteId -> Set(datas com registro)
  registros.forEach((r) => {
    const ms = paraMillis(r.inicio);
    if (!ms || !r.clienteId) return;
    const dia = dataLocalISO(new Date(ms));
    if (!diasComRegistroPorCliente.has(r.clienteId)) diasComRegistroPorCliente.set(r.clienteId, new Set());
    diasComRegistroPorCliente.get(r.clienteId).add(dia);
  });

  return planejamentos
    .filter((p) => p.data < hoje)
    .filter((p) => !diasComRegistroPorCliente.get(p.clienteId)?.has(p.data))
    .filter((p) => hoje >= diaUtilAlerta(p.data))
    .map((p) => {
      const diaCancelamento = diaUtilCancelamentoAutomatico(p.data);
      return { ...p, diaUtilCancelamento: diaCancelamento, podeSerCanceladoAutomatico: hoje >= diaCancelamento };
    });
}

// Cancela sozinho (nunca apaga — mesmo padrão non-destrutivo de
// PlanejamentoScreen.jsx) todo planejamento sem registro que já estourou
// o prazo de 2 dias úteis. Devolve quantos foram cancelados nesta
// passada.
export async function cancelarPlanejamentosSemRegistroVencidos(planejamentos, registros, hoje = hojeISO()) {
  const vencidos = planejamentosSemRegistro(planejamentos, registros, hoje).filter(
    (p) => p.podeSerCanceladoAutomatico
  );
  await Promise.all(
    vencidos.map((p) =>
      updateDoc(doc(db, 'planejamentoOperacional', p.id), {
        cancelado: true,
        canceladoPorNome: 'Sistema (automático)',
        canceladoEm: serverTimestamp(),
        canceladoAutomaticamente: true
      }).catch(() => {})
    )
  );
  return vencidos.length;
}
