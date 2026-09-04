// Agregação pura pro Dashboard ML (7 gráficos + KPIs) — DashboardMLSection.jsx
// e os 6 componentes de gráfico só chamam essas funções, nunca recalculam
// por conta própria, pra nunca ter dois números diferentes pra mesma coisa
// (mesmo espírito de lib/relatorio.js).
import { dataLocalISO, paraMillis, addDiasISO, hojeISO, datasNoIntervalo } from './data';

// ======== Período (filtro "Semana/Dia/Mês/Ano/Custom") ========
// Interpretação adotada (o documento não define se é mês/ano corrido ou
// janela móvel): janelas móveis terminando hoje, mesmo padrão que
// RelatoriosScreen.jsx já usa pro período padrão de 30 dias — Dia=hoje,
// Semana=últimos 7 dias, Mês=últimos 30 dias, Ano=últimos 365 dias.
export function intervaloDoPeriodo(periodo, customInicio, customFim) {
  const hoje = hojeISO();
  switch (periodo) {
    case 'dia':
      return { dataInicio: hoje, dataFim: hoje };
    case 'mes':
      return { dataInicio: addDiasISO(hoje, -29), dataFim: hoje };
    case 'ano':
      return { dataInicio: addDiasISO(hoje, -364), dataFim: hoje };
    case 'custom':
      return customInicio && customFim && customInicio <= customFim
        ? { dataInicio: customInicio, dataFim: customFim }
        : { dataInicio: addDiasISO(hoje, -6), dataFim: hoje };
    case 'semana':
    default:
      return { dataInicio: addDiasISO(hoje, -6), dataFim: hoje };
  }
}

// Período imediatamente anterior, do mesmo tamanho — usado só pra
// comparação das setas ↑/↓ dos KPI Cards, nunca mostrado como filtro.
export function intervaloAnterior({ dataInicio, dataFim }) {
  const dias = datasNoIntervalo(dataInicio, dataFim).length || 1;
  return { dataInicio: addDiasISO(dataInicio, -dias), dataFim: addDiasISO(dataInicio, -1) };
}

// ======== Turno por horário (heurística) ========
// registrosOperacao NUNCA teve campo turnoId (só planejamento/presença
// têm) — pra ainda assim dar pra filtrar o Coletor por Turno aqui, casamos
// pelo horário: a operação "pertence" ao turno se o horário de início cai
// dentro de [horaInicio, horaFim), tratando turno que vira a noite (ex.
// Noturno 18h-03h) como intervalo circular. Sem horaInicio/horaFim
// cadastrado, o turno não filtra nada (inclui tudo) — é aproximação, não
// vínculo real, então erra pra "incluir" em vez de "excluir" indevido.
export function operacaoNoTurno(millisInicio, turno) {
  if (!turno?.horaInicio || !turno?.horaFim || !millisInicio) return true;
  const d = new Date(millisInicio);
  const minutosDoDia = d.getHours() * 60 + d.getMinutes();
  const [hi, mi] = turno.horaInicio.split(':').map(Number);
  const [hf, mf] = turno.horaFim.split(':').map(Number);
  const inicio = hi * 60 + mi;
  const fim = hf * 60 + mf;
  if (Number.isNaN(inicio) || Number.isNaN(fim)) return true;
  if (inicio <= fim) return minutosDoDia >= inicio && minutosDoDia < fim;
  return minutosDoDia >= inicio || minutosDoDia < fim; // turno cruza a meia-noite
}

// ======== Filtro combinado (Cliente + Turno + Tipo Op/fluxo + período) ========
export function filtrarRegistrosDashboard(registros, filtros, turnos) {
  const turno = filtros.turnoId ? turnos.find((t) => t.id === filtros.turnoId) : null;
  return registros.filter((r) => {
    const ms = paraMillis(r.inicio);
    if (!ms) return false;
    const diaISO = dataLocalISO(new Date(ms));
    if (diaISO < filtros.dataInicio || diaISO > filtros.dataFim) return false;
    if (filtros.clienteId && r.clienteId !== filtros.clienteId) return false;
    if (filtros.fluxoId && r.fluxoId !== filtros.fluxoId) return false;
    if (turno && !operacaoNoTurno(ms, turno)) return false;
    return true;
  });
}

// ======== KPI Cards ========
// O modelo do app não tem um campo "volumeProcessado" separado — a
// contagem de volume é `qtdVolumes`, capturada no início da operação e
// nunca alterada. Todos os KPIs abaixo usam só operações FINALIZADAS
// (tempo real conhecido), pra não misturar operação em andamento (que
// ainda pode mudar) com indicador fechado do período.
export function calcularKpis(registrosFiltrados, tiposOperacao) {
  const finalizados = registrosFiltrados.filter((r) => r.fim && Number(r.tempoRealMinutos) > 0);
  const n = finalizados.length;

  const volumeTotal = finalizados.reduce((s, r) => s + (Number(r.qtdVolumes) || 0), 0);
  const equipeTotal = finalizados.reduce((s, r) => s + (Number(r.qtdMdo) || 0), 0);
  const tempoTotalMinutos = finalizados.reduce((s, r) => s + (Number(r.tempoRealMinutos) || 0), 0);

  const tempoMedio = n ? tempoTotalMinutos / n : null;
  const equipeMedia = n ? equipeTotal / n : null;
  const produtividade = equipeMedia ? volumeTotal / equipeMedia : null; // Volume / Equipe (pedido literal do documento)
  const taxaHora = tempoTotalMinutos > 0 ? volumeTotal / (tempoTotalMinutos / 60) : null;

  // Eficiência = meta de tempo (tiposOperacao.metaTempoMinutos) vs tempo
  // real, só entre operações cujo Tipo já tem meta estabelecida (não
  // `semPadraoMeta`) — sem isso não há "meta futura" pra comparar. Cada
  // operação contribui com min(100, meta/real*100); null se nenhuma tiver
  // meta aplicável no período filtrado.
  const comMeta = finalizados
    .map((r) => {
      const tipo = tiposOperacao.find((t) => t.id === r.tipoOperacaoId);
      if (!tipo || tipo.semPadraoMeta || !tipo.metaTempoMinutos) return null;
      return Math.min(100, (Number(tipo.metaTempoMinutos) / Number(r.tempoRealMinutos)) * 100);
    })
    .filter((v) => v != null);
  const eficiencia = comMeta.length ? comMeta.reduce((a, b) => a + b, 0) / comMeta.length : null;

  return { volumeTotal, tempoMedio, equipeMedia, produtividade, taxaHora, eficiencia, totalOperacoes: n };
}

// ======== Scatter: Volume × Tempo, com linha de tendência ========
// Regressão linear simples (mínimos quadrados) — só o suficiente pra
// desenhar uma linha de tendência num scatter, não é um modelo preditivo.
export function regressaoLinear(pontos) {
  const n = pontos.length;
  if (n < 2) return null;
  const somaX = pontos.reduce((s, p) => s + p.x, 0);
  const somaY = pontos.reduce((s, p) => s + p.y, 0);
  const somaXY = pontos.reduce((s, p) => s + p.x * p.y, 0);
  const somaX2 = pontos.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * somaX2 - somaX * somaX;
  if (denom === 0) return null;
  const slope = (n * somaXY - somaX * somaY) / denom;
  const intercept = (somaY - slope * somaX) / n;
  return { slope, intercept };
}

// ======== Line chart: histórico + previsão ========
// Heurística simples de previsão (NÃO é um modelo estatístico de verdade):
// regressão linear sobre o histórico diário, projetada pros próximos dias,
// com uma banda ≈90% de confiança a partir do desvio padrão dos resíduos
// (mean ± 1.645·σ, aproximação assumindo resíduos normais). Serve pra dar
// uma noção de tendência, não uma previsão precisa.
export function historicoEPrevisao(registrosFiltrados, dataInicio, dataFim, diasPrevisao = 4) {
  const datas = datasNoIntervalo(dataInicio, dataFim);
  const volumePorDia = datas.map((data) => ({
    data,
    volume: registrosFiltrados
      .filter((r) => r.fim && dataLocalISO(new Date(paraMillis(r.inicio))) === data)
      .reduce((s, r) => s + (Number(r.qtdVolumes) || 0), 0)
  }));

  const pontos = volumePorDia.map((d, i) => ({ x: i, y: d.volume }));
  const reg = regressaoLinear(pontos);

  let desvioPadrao = 0;
  if (reg) {
    const residuos = pontos.map((p) => p.y - (reg.slope * p.x + reg.intercept));
    const media = residuos.reduce((a, b) => a + b, 0) / residuos.length;
    const variancia = residuos.reduce((s, r) => s + (r - media) ** 2, 0) / residuos.length;
    desvioPadrao = Math.sqrt(variancia);
  }

  const datasPrevisao = Array.from({ length: diasPrevisao }).map((_, i) => addDiasISO(dataFim, i + 1));
  const previsao = datasPrevisao.map((data, i) => {
    const x = pontos.length + i;
    const central = reg ? Math.max(0, reg.slope * x + reg.intercept) : volumePorDia.at(-1)?.volume || 0;
    return {
      data,
      central: Math.round(central),
      minimo: Math.max(0, Math.round(central - 1.645 * desvioPadrao)),
      maximo: Math.round(central + 1.645 * desvioPadrao)
    };
  });

  return { historico: volumePorDia, previsao };
}

// ======== Heat map: demanda por dia da semana × hora ========
const DIAS_SEMANA_HEATMAP = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function matrizDemanda(registrosFiltrados) {
  const matriz = DIAS_SEMANA_HEATMAP.map(() => Array(24).fill(0));
  registrosFiltrados.forEach((r) => {
    const ms = paraMillis(r.inicio);
    if (!ms) return;
    const d = new Date(ms);
    matriz[d.getDay()][d.getHours()] += 1;
  });
  const maximo = Math.max(1, ...matriz.flat());
  return { dias: DIAS_SEMANA_HEATMAP, matriz, maximo };
}

// ======== Bar chart: Planejado × Realizado (últimos 7 dias, fixo) ========
// Fixo em 7 dias por pedido explícito do documento — independe do filtro
// de Período (que só afeta os outros 6 gráficos/KPIs). "Tipo Op" (fluxo)
// não existe em planejamentoOperacional, então só filtra o lado
// Realizado; o lado Planejado respeita Cliente/Turno.
export function planejadoRealizado7Dias(planejamentos, registros, filtros, turnos) {
  const hoje = hojeISO();
  const datas = Array.from({ length: 7 }).map((_, i) => addDiasISO(hoje, i - 6));
  const turno = filtros.turnoId ? turnos.find((t) => t.id === filtros.turnoId) : null;

  return datas.map((data) => {
    const planejado = planejamentos
      .filter((p) => p.data === data)
      .filter((p) => !filtros.clienteId || p.clienteId === filtros.clienteId)
      .filter((p) => !filtros.turnoId || p.turnoId === filtros.turnoId)
      .reduce((s, p) => s + (Number(p.qtdMdo) || 0), 0);

    const realizado = registros
      .filter((r) => {
        const ms = paraMillis(r.inicio);
        if (!ms || dataLocalISO(new Date(ms)) !== data) return false;
        if (filtros.clienteId && r.clienteId !== filtros.clienteId) return false;
        if (filtros.fluxoId && r.fluxoId !== filtros.fluxoId) return false;
        if (turno && !operacaoNoTurno(ms, turno)) return false;
        return true;
      })
      .reduce((s, r) => s + (Number(r.qtdMdo) || 0), 0);

    return { data, planejado, realizado };
  });
}

// ======== Pareto: clientes por volume (80/20) ========
export function paretoClientes(registrosFiltrados, nomeCliente) {
  const porCliente = {};
  registrosFiltrados
    .filter((r) => r.fim)
    .forEach((r) => {
      const chave = r.clienteId || '_semCliente';
      porCliente[chave] = (porCliente[chave] || 0) + (Number(r.qtdVolumes) || 0);
    });
  const totalGeral = Object.values(porCliente).reduce((a, b) => a + b, 0);
  const lista = Object.entries(porCliente)
    .map(([clienteId, volume]) => ({ clienteId, volume }))
    .sort((a, b) => b.volume - a.volume);

  let acumulado = 0;
  return lista.map((item) => {
    const pctDoTotal = totalGeral > 0 ? (item.volume / totalGeral) * 100 : 0;
    acumulado += pctDoTotal;
    return {
      clienteId: item.clienteId,
      nome: item.clienteId === '_semCliente' ? '(sem cliente)' : nomeCliente(item.clienteId),
      volume: item.volume,
      pctDoTotal,
      pctAcumulado: Math.min(100, acumulado),
      noTop80: acumulado - pctDoTotal < 80 // entrou antes do acumulado passar de 80%
    };
  });
}
