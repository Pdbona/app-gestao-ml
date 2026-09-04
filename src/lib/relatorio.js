// Agregação pura pro relatório por período (RelatoriosScreen.jsx) —
// mesmas funções alimentam os gráficos em tela e o PDF, pra nunca
// mostrar dois números diferentes pra mesma coisa.
import { dataLocalISO, paraMillis } from './data';

// Filtra por clienteId + intervalo [dataInicio, dataFim] (strings
// YYYY-MM-DD). `campoData` é o nome do campo com a data — Timestamp de
// verdade (registrosOperacao.inicio) ou já string ISO
// (planejamentoOperacional.data / presencas.data).
function noPeriodo(itens, clienteId, dataInicio, dataFim, campoData, ehTimestamp) {
  return itens.filter((item) => {
    if (item.clienteId !== clienteId) return false;
    const dataItem = ehTimestamp ? dataLocalISO(new Date(paraMillis(item[campoData]))) : item[campoData];
    return dataItem >= dataInicio && dataItem <= dataFim;
  });
}

export function filtrarRegistros(registros, clienteId, dataInicio, dataFim) {
  return noPeriodo(registros, clienteId, dataInicio, dataFim, 'inicio', true);
}

export function filtrarPlanejamentos(planejamentos, clienteId, dataInicio, dataFim) {
  return noPeriodo(planejamentos, clienteId, dataInicio, dataFim, 'data', false);
}

export function filtrarPresencas(presencas, clienteId, dataInicio, dataFim) {
  return noPeriodo(presencas, clienteId, dataInicio, dataFim, 'data', false);
}

// [{ data, contagem }] pra cada dia do período (0 incluso, pra o gráfico
// não pular dias sem operação).
export function operacoesPorDia(registros, datas) {
  return datas.map((data) => ({
    data,
    contagem: registros.filter((r) => dataLocalISO(new Date(paraMillis(r.inicio))) === data).length
  }));
}

// [{ nome, contagem }] agrupado por um id (tipoOperacaoId ou fluxoId),
// resolvendo o nome via o mapa de nomes já carregado na tela.
export function agruparPorId(registros, campoId, mapaNomes) {
  const contagens = {};
  registros.forEach((r) => {
    const id = r[campoId] || '_outro';
    contagens[id] = (contagens[id] || 0) + 1;
  });
  return Object.entries(contagens)
    .map(([id, contagem]) => ({ nome: mapaNomes(id) || '(removido)', contagem }))
    .sort((a, b) => b.contagem - a.contagem);
}

// [{ data, planejado, presente }] pra cada dia do período — soma todos
// os turnos do cliente naquele dia.
export function absenteismoPorDia(planejamentos, presencas, datas) {
  return datas.map((data) => {
    const planejadosDoDia = planejamentos.filter((p) => p.data === data);
    const planejado = planejadosDoDia.reduce((soma, p) => soma + (Number(p.qtdMdo) || 0), 0);
    const presente = presencas.filter((pr) => pr.data === data).length;
    return { data, planejado, presente };
  });
}

// [{ data, itens }] — presenças confirmadas agrupadas por dia, ordenadas
// cronologicamente (dia e, dentro do dia, horário do check-in). Usada pelo
// relatório de presença (lista pro cliente conferir) — tanto na tabela em
// tela quanto no PDF, pra nunca divergir.
export function presencasPorDia(presencas, datas) {
  return datas
    .map((data) => ({
      data,
      itens: presencas
        .filter((p) => p.data === data)
        .sort((a, b) => (paraMillis(a.dataHoraCheckin) || 0) - (paraMillis(b.dataHoraCheckin) || 0))
    }))
    .filter((grupo) => grupo.itens.length > 0);
}

export function resumoPeriodo(registros, planejamentos, presencas) {
  const totalOperacoes = registros.length;
  const totalPlanejado = planejamentos.reduce((soma, p) => soma + (Number(p.qtdMdo) || 0), 0);
  const totalPresente = presencas.length;
  const absenteismoPct = totalPlanejado > 0 ? Math.round(((totalPlanejado - totalPresente) / totalPlanejado) * 100) : 0;
  return { totalOperacoes, totalPlanejado, totalPresente, absenteismoPct };
}
