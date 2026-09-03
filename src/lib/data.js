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
