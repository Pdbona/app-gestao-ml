// Utilitários de "dia civil local" (YYYY-MM-DD) — o app inteiro usa esse
// formato pra comparar "hoje" (planejamento, presença, operações do
// Coletor). NUNCA usar `new Date().toISOString().slice(0,10)` direto: o
// `toISOString()` sempre calcula o dia em UTC, que diverge do dia local
// sempre que o horário local já passou da meia-noite em UTC — no Brasil
// (UTC-3), isso acontece todo dia entre ~21h e 23h59: `toISOString()` já
// mostra o dia seguinte.
//
// Bug real causado por isso (03/09/2026): um colaborador confirmando
// presença à noite via QR Code via CheckinPublicScreen via `hojeISO()`
// buscava o planejamento de "amanhã" (pelo relógio UTC) em vez de hoje,
// não achava nada, caía no fallback de "mostrar todos os turnos" e
// deixava escolher um turno diferente do planejado.
export function dataLocalISO(valor) {
  const d = valor instanceof Date ? valor : new Date(valor);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function hojeISO() {
  return dataLocalISO(new Date());
}

// Lista de datas (YYYY-MM-DD) entre início e fim, inclusive — usada tanto
// pra lançar um período de planejamento quanto pra agregar um relatório
// por intervalo.
export function datasNoIntervalo(inicio, fim) {
  const datas = [];
  let atual = new Date(`${inicio}T00:00:00`);
  const limite = new Date(`${fim}T00:00:00`);
  if (Number.isNaN(atual.getTime()) || Number.isNaN(limite.getTime()) || atual > limite) return datas;
  while (atual <= limite) {
    datas.push(dataLocalISO(atual));
    atual.setDate(atual.getDate() + 1);
  }
  return datas;
}

export function formatarDataBr(iso) {
  if (!iso) return '-';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function addDiasISO(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return dataLocalISO(d);
}

export function labelDataCurta(iso, ehHoje) {
  if (ehHoje) return 'Hoje';
  const d = new Date(`${iso}T00:00:00`);
  return `${DIAS_SEMANA[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Timestamp do Firestore, Date ou string → milissegundos (ou null).
export function paraMillis(valor) {
  if (!valor) return null;
  return valor?.toMillis ? valor.toMillis() : new Date(valor).getTime();
}

export function ehMesmoDia(valor, diaISO) {
  const ms = paraMillis(valor);
  if (!ms) return false;
  return dataLocalISO(new Date(ms)) === diaISO;
}

export function formatarHorario(valor) {
  const ms = paraMillis(valor);
  if (!ms) return '--:--';
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Minutos decorridos desde o horaInicio ("HH:mm", turno) até `agora` — mesma
// técnica de parse já usada em DashboardTab.jsx (split(':') + setHours),
// centralizada aqui pra não duplicar de novo. Negativo se o turno ainda não
// começou. `null` se horaInicio não estiver cadastrado.
export function minutosDesdeInicioTurno(horaInicio, agora = new Date()) {
  if (!horaInicio) return null;
  const [h, m] = horaInicio.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const inicio = new Date(agora);
  inicio.setHours(h, m, 0, 0);
  return Math.round((agora.getTime() - inicio.getTime()) / 60000);
}

export const TOLERANCIA_JANELA_NORMAL_MINUTOS = 60;
export const LIMITE_JANELA_ATRASO_MINUTOS = 180;

// Classifica o momento do check-in em relação ao horaInicio do turno único
// planejado pro dia: 'sem_horario' (turno sem horaInicio cadastrado, não
// bloqueia por erro de cadastro) | 'antes' (turno ainda não começou) |
// 'normal' (dentro da tolerância de 1h — segue direto) | 'atraso' (de 1h a
// 3h — pede autorização da liderança) | 'expirado' (mais de 3h — bloqueia).
export function statusJanelaTurno(horaInicio, agora = new Date()) {
  const minutos = minutosDesdeInicioTurno(horaInicio, agora);
  if (minutos == null) return 'sem_horario';
  if (minutos < 0) return 'antes';
  if (minutos <= TOLERANCIA_JANELA_NORMAL_MINUTOS) return 'normal';
  if (minutos <= LIMITE_JANELA_ATRASO_MINUTOS) return 'atraso';
  return 'expirado';
}

// { inicio, fim } (ISO) da quinzena corrente a partir de diaISO: dia 1-15 do
// mês, ou dia 16-até o último dia do mês. Usada como período padrão do
// relatório de presença (ciclo de cobrança quinzenal da ML).
export function quinzenaAtual(diaISO = hojeISO()) {
  const [anoStr, mesStr, diaStr] = diaISO.split('-');
  const ano = Number(anoStr);
  const mes = Number(mesStr); // 1-12
  const dia = Number(diaStr);
  if (dia <= 15) {
    return { inicio: `${anoStr}-${mesStr}-01`, fim: `${anoStr}-${mesStr}-15` };
  }
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return { inicio: `${anoStr}-${mesStr}-16`, fim: `${anoStr}-${mesStr}-${String(ultimoDia).padStart(2, '0')}` };
}
