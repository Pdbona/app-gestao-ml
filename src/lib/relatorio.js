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

// Lista PLANA de presenças confirmadas (uma linha por presença — Data,
// Nome, CPF, Turno, Hora), ordenada por data crescente, depois turno
// (pelo horaInicio cadastrado — mesma noção de "ordem do turno" já usada
// em TurnosCadastro/PlanejamentoScreen, não alfabética, pra "Diurno" vir
// antes de "Noturno" mesmo sem ser ordem alfabética), depois nome
// (alfabética) e por fim hora de presença. Usada pelo relatório de
// presença (lista pro cliente conferir) — a mesma função alimenta a
// prévia em tela e o PDF, pra nunca divergir. Enriquecida com
// `turnoNome`/`turnoHoraInicio` resolvidos, pra quem desenha a tabela não
// precisar fazer o lookup de novo.
export function presencasParaTabela(presencas, turnos) {
  const turno = (id) => turnos.find((t) => t.id === id);
  return presencas
    .map((p) => ({
      ...p,
      turnoNome: turno(p.turnoId)?.nome || '(turno removido)',
      // Sem horário cadastrado vai pro fim da lista, não pro começo.
      turnoHoraInicio: turno(p.turnoId)?.horaInicio || '99:99',
      turnoHoraFim: turno(p.turnoId)?.horaFim || null
    }))
    .sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      if (a.turnoHoraInicio !== b.turnoHoraInicio) return a.turnoHoraInicio < b.turnoHoraInicio ? -1 : 1;
      const nomeA = (a.colaboradorNome || '').toLowerCase();
      const nomeB = (b.colaboradorNome || '').toLowerCase();
      if (nomeA !== nomeB) return nomeA < nomeB ? -1 : 1;
      return (paraMillis(a.dataHoraCheckin) || 0) - (paraMillis(b.dataHoraCheckin) || 0);
    });
}

// Recebe a lista já ordenada de `presencasParaTabela` e monta a estrutura
// com subtotais pro relatório de presença (pedido do Pablo): agrupada por
// dia e, dentro do dia, por turno — cada grupo de turno carrega quantas
// pessoas confirmaram (`pessoas.length`) e o período do turno
// (`turnoHoraInicio`/`turnoHoraFim`), cada dia carrega o subtotal do dia
// (`subtotalDia`), e por fim o total geral do período inteiro
// (`totalGeral`) e o total geral por turno somando todos os dias
// (`totalPorTurno`, ordenado pelo horário de início do turno). Como
// `linhas` já vem ordenada (data → turno → nome → hora), os `Map`
// preservam essa ordem sozinhos — não precisa reordenar de novo aqui.
export function agruparPresencasComSubtotais(linhas) {
  const porDiaMap = new Map();
  linhas.forEach((linha) => {
    if (!porDiaMap.has(linha.data)) porDiaMap.set(linha.data, new Map());
    const porTurnoMap = porDiaMap.get(linha.data);
    if (!porTurnoMap.has(linha.turnoId)) {
      porTurnoMap.set(linha.turnoId, {
        turnoId: linha.turnoId,
        turnoNome: linha.turnoNome,
        turnoHoraInicio: linha.turnoHoraInicio,
        turnoHoraFim: linha.turnoHoraFim,
        pessoas: []
      });
    }
    porTurnoMap.get(linha.turnoId).pessoas.push(linha);
  });

  const porDia = [...porDiaMap.entries()].map(([data, porTurnoMap]) => {
    const porTurno = [...porTurnoMap.values()];
    const subtotalDia = porTurno.reduce((soma, t) => soma + t.pessoas.length, 0);
    return { data, porTurno, subtotalDia };
  });

  const totalPorTurnoMap = new Map();
  linhas.forEach((linha) => {
    if (!totalPorTurnoMap.has(linha.turnoId)) {
      totalPorTurnoMap.set(linha.turnoId, {
        turnoId: linha.turnoId,
        turnoNome: linha.turnoNome,
        turnoHoraInicio: linha.turnoHoraInicio,
        turnoHoraFim: linha.turnoHoraFim,
        subtotal: 0
      });
    }
    totalPorTurnoMap.get(linha.turnoId).subtotal += 1;
  });
  const totalPorTurno = [...totalPorTurnoMap.values()].sort((a, b) =>
    (a.turnoHoraInicio || '99:99').localeCompare(b.turnoHoraInicio || '99:99')
  );

  return { porDia, totalPorTurno, totalGeral: linhas.length };
}

export function resumoPeriodo(registros, planejamentos, presencas) {
  const totalOperacoes = registros.length;
  const totalPlanejado = planejamentos.reduce((soma, p) => soma + (Number(p.qtdMdo) || 0), 0);
  const totalPresente = presencas.length;
  const absenteismoPct = totalPlanejado > 0 ? Math.round(((totalPlanejado - totalPresente) / totalPlanejado) * 100) : 0;
  return { totalOperacoes, totalPlanejado, totalPresente, absenteismoPct };
}
