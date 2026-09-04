import React from 'react';
import { ui } from '../../lib/styles';

const CHAVE_LOCALSTORAGE = 'dashboardMLFiltros';

export const FILTROS_PADRAO = {
  clienteId: '',
  turnoId: '',
  fluxoId: '',
  periodo: 'semana',
  customInicio: '',
  customFim: ''
};

// Lê os últimos filtros aplicados salvos em localStorage (pedido do
// documento: "Aplicar (salva em localStorage)") — se não houver nada
// salvo ainda, ou o navegador bloquear localStorage, cai no padrão.
export function lerFiltrosSalvos() {
  try {
    const bruto = window.localStorage.getItem(CHAVE_LOCALSTORAGE);
    if (!bruto) return FILTROS_PADRAO;
    return { ...FILTROS_PADRAO, ...JSON.parse(bruto) };
  } catch {
    return FILTROS_PADRAO;
  }
}

export function salvarFiltros(filtros) {
  try {
    window.localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(filtros));
  } catch {
    // localStorage indisponível (aba privada etc.) — segue sem persistir.
  }
}

// Barra de filtros do Dashboard ML — os selects só mudam o estado
// "pendente" (`rascunho`); os gráficos só recalculam quando o Administrativo
// clica "Aplicar" (`onAplicar`), que também é o momento em que salva em
// localStorage. Isso evita recalcular 6 gráficos a cada tecla/clique
// enquanto a pessoa ainda está ajustando os filtros.
export default function FiltrosDashboardML({ rascunho, setRascunho, clientes, turnos, fluxos, onAplicar }) {
  const mudar = (campo) => (e) => setRascunho((r) => ({ ...r, [campo]: e.target.value }));

  return (
    <div style={styles.card}>
      <div style={ui.formGrid}>
        <label style={ui.label}>
          Cliente
          <select style={ui.input} value={rascunho.clienteId} onChange={mudar('clienteId')}>
            <option value="">Todos</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={ui.label}>
          Turno
          <select style={ui.input} value={rascunho.turnoId} onChange={mudar('turnoId')}>
            <option value="">Todos</option>
            {turnos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={ui.label}>
          Tipo Op. (Operação)
          <select style={ui.input} value={rascunho.fluxoId} onChange={mudar('fluxoId')}>
            <option value="">Todos</option>
            {fluxos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={ui.label}>
          Período
          <select style={ui.input} value={rascunho.periodo} onChange={mudar('periodo')}>
            <option value="dia">Dia (hoje)</option>
            <option value="semana">Semana (últimos 7 dias)</option>
            <option value="mes">Mês (últimos 30 dias)</option>
            <option value="ano">Ano (últimos 365 dias)</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
        {rascunho.periodo === 'custom' && (
          <>
            <label style={ui.label}>
              De
              <input
                type="date"
                style={ui.input}
                value={rascunho.customInicio}
                max={rascunho.customFim || undefined}
                onChange={mudar('customInicio')}
              />
            </label>
            <label style={ui.label}>
              Até
              <input
                type="date"
                style={ui.input}
                value={rascunho.customFim}
                min={rascunho.customInicio || undefined}
                onChange={mudar('customFim')}
              />
            </label>
          </>
        )}
      </div>
      <button type="button" style={ui.primaryButton} onClick={onAplicar}>
        Aplicar
      </button>
    </div>
  );
}

const styles = {
  card: {
    background: '#FFF',
    borderRadius: 10,
    border: '1px solid #E5E5E5',
    padding: 16,
    marginBottom: 20,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
  }
};
