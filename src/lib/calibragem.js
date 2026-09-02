// ============================================================
// Motor de calibragem de metas — Tipos de Operação
// ============================================================
//
// Mesmo modelo já validado no app de Gestão Operacional da Superior
// Transportes (modo "tempo", pra tipos sem linha de base de volume): compara
// a mediana do tempo real dos registros (início→fim) com a meta de tempo
// cadastrada, e sugere ajuste — nunca aplica sozinho.
//
// Regras:
//  - Precisa de pelo menos MIN_AMOSTRA registros pra sugerir pela 1ª vez.
//  - Depois de uma calibragem aplicada (tipo.calibradoEm), só volta a
//    sugerir depois de mais INTERVALO_RECALIBRAGEM registros NOVOS
//    (fim > calibradoEm) — evita ficar sugerindo de novo com o mesmo lote.
//  - Só sugere se o desvio da mediana em relação à meta atual passar de
//    TOLERANCIA_PCT (10%) pra cima ou pra baixo.
//  - Tipo com `semPadraoMeta: true` (ainda não tem meta confiável) pula a
//    comparação de desvio e sugere direto estabelecer a meta pela mediana.

export const MIN_AMOSTRA = 5;
export const INTERVALO_RECALIBRAGEM = 10;
export const TOLERANCIA_PCT = 0.10;

function mediana(valores) {
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 !== 0
    ? ordenado[meio]
    : (ordenado[meio - 1] + ordenado[meio]) / 2;
}

function arredonda1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * @param {object} tipo - documento de tiposOperacao (precisa de
 *   metaTempoMinutos, semPadraoMeta, calibradoEm opcional)
 * @param {Array<{fim: Date|string|number, tempoRealMinutos: number}>} registros
 *   - registros JÁ FILTRADOS para este tipo de operação
 * @returns {{
 *   status: 'sem_dados'|'aguardando'|'sugerir_estabelecer'|'sugerir_ajuste'|'dentro_da_meta',
 *   amostra: number, faltam?: number, sugestaoMinutos?: number, desvioPct?: number
 * }}
 */
export function analisarCalibragem(tipo, registros) {
  if (!registros || registros.length === 0) {
    return { status: 'sem_dados', amostra: 0, faltam: MIN_AMOSTRA };
  }

  const calibradoEm = tipo?.calibradoEm ? new Date(tipo.calibradoEm) : null;
  const novos = registros
    .filter((r) => r.fim && Number(r.tempoRealMinutos) > 0)
    .filter((r) => !calibradoEm || new Date(r.fim) > calibradoEm);

  const minimoNecessario = calibradoEm ? INTERVALO_RECALIBRAGEM : MIN_AMOSTRA;

  if (novos.length < minimoNecessario) {
    return { status: 'aguardando', amostra: novos.length, faltam: minimoNecessario - novos.length };
  }

  const medianaReal = mediana(novos.map((r) => Number(r.tempoRealMinutos)));

  if (tipo?.semPadraoMeta || !tipo?.metaTempoMinutos) {
    return { status: 'sugerir_estabelecer', amostra: novos.length, sugestaoMinutos: arredonda1(medianaReal) };
  }

  const metaAtual = Number(tipo.metaTempoMinutos);
  const desvioPct = (medianaReal - metaAtual) / metaAtual;

  if (Math.abs(desvioPct) > TOLERANCIA_PCT) {
    return {
      status: 'sugerir_ajuste',
      amostra: novos.length,
      sugestaoMinutos: arredonda1(medianaReal),
      desvioPct: arredonda1(desvioPct * 100)
    };
  }

  return { status: 'dentro_da_meta', amostra: novos.length };
}
