import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { PERFIL_ADMIN_PADRAO, mergePermissoes, montarNavegacaoCadastros, abaInicial, SECOES_CADASTRO } from '../lib/permissoes';
import { NAVY, NAVY_LIGHT, ORANGE, ui } from '../lib/styles';
import DashboardTab from './DashboardTab';
import CadastrosScreen from './cadastros/CadastrosScreen';
import ColetorScreen from './ColetorScreen';
import PlanejamentoScreen from './PlanejamentoScreen';
import AjusteRegistrosScreen from './AjusteRegistrosScreen';
import RelatoriosScreen from './RelatoriosScreen';
import AutorizacoesScreen from './AutorizacoesScreen';

// Sub-itens do menu "Planejamento" (07/09/2026) — mesmo espírito do
// submenu de Cadastros, só que fixo (não vem de SECOES_CADASTRO porque
// não tem grupo/2º nível): "Novo Planejamento" é o lançamento de MdO já
// existente, "Ajuste de Registros" é a ferramenta nova pro Gestor
// corrigir/fechar/cancelar registros do Coletor.
const ITENS_SUBMENU_PLANEJAMENTO = [
  { id: 'planejamentoNovo', label: 'Novo Planejamento' },
  { id: 'planejamentoAjuste', label: 'Ajuste de Registros' }
];

// Logo da ML Serviços é a marca principal do app — sempre em destaque. A
// logo da SBS Solution aparece só como desenvolvedora (rodapé). Arquivos em
// public/logos/ (redimensionados a partir de SBS_Logos/Logo_ML.png e
// Logo_SBS.png — os originais eram grandes demais pra web).
const LOGO_ML = `${process.env.PUBLIC_URL}/logos/logo-ml.png`;
const LOGO_SBS = `${process.env.PUBLIC_URL}/logos/logo-sbs.png`;

// Credencial de emergência — sempre disponível, mesmo com o Firestore
// vazio/indisponível. Serve pra Pablo conseguir entrar e cadastrar o
// primeiro usuário/perfil reais em Cadastros → Usuários. Uso interno, sem
// Firebase Auth ainda (ver nota em UsuariosCadastro.jsx sobre senha em
// texto simples). Trocar/desativar quando não for mais necessária.
const BOOTSTRAP_SENHA = '130399';

// Sem projeto Firebase real (config fictícia em src/firebase.js), o SDK do
// Firestore não rejeita rápido — ele fica tentando resolver o host
// indefinidamente. Sem um timeout aqui, o fallback de emergência abaixo
// nunca seria alcançado e ninguém conseguiria logar. Uma vez com o projeto
// real, isso passa a resolver em bem menos que 4s.
function comTimeout(promise, ms = 4000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout ao consultar o Firestore')), ms))
  ]);
}

async function buscarPerfil(perfilId) {
  if (!perfilId || perfilId === PERFIL_ADMIN_PADRAO.id) return PERFIL_ADMIN_PADRAO;
  try {
    const snap = await comTimeout(getDoc(doc(db, 'perfis', perfilId)));
    if (snap.exists()) return { id: snap.id, ...snap.data() };
  } catch (e) {
    // Firestore indisponível — cai no perfil de sistema como fallback.
  }
  return PERFIL_ADMIN_PADRAO;
}

// Login só por senha (sem campo de usuário): a senha sozinha identifica a
// conta e já carrega direto o perfil/permissões dela — por isso a senha
// precisa ser única entre usuários ativos (validado em UsuariosCadastro).
async function autenticar(senhaDigitada) {
  try {
    const snap = await comTimeout(getDocs(collection(db, 'usuarios')));
    const usuarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const encontrado = usuarios.find((u) => u.ativo !== false && u.senha === senhaDigitada);
    if (encontrado) {
      const perfilBase = await buscarPerfil(encontrado.perfilId);
      return {
        uid: encontrado.id,
        nome: encontrado.nome,
        perfilId: encontrado.perfilId,
        permissoes: mergePermissoes(perfilBase.permissoes, encontrado.permissoesCustom)
      };
    }
  } catch (e) {
    // Sem projeto Firebase real ainda, ou sem conexão — segue pro bootstrap.
  }

  if (senhaDigitada === BOOTSTRAP_SENHA) {
    return {
      uid: 'bootstrap-admin',
      nome: PERFIL_ADMIN_PADRAO.nome,
      perfilId: PERFIL_ADMIN_PADRAO.id,
      permissoes: PERFIL_ADMIN_PADRAO.permissoes
    };
  }

  return null;
}

// ============================================================
// TELA DE LOGIN
// ============================================================
function LoginScreen({ onLoginSuccess }) {
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');

  const handleLogin = async () => {
    if (!senha.trim()) {
      setErro('Informe a senha.');
      return;
    }
    setEntrando(true);
    setErro('');
    const usuario = await autenticar(senha);
    setEntrando(false);
    if (usuario) {
      onLoginSuccess(usuario);
    } else {
      setErro('Senha inválida.');
    }
  };

  return (
    <div style={styles.loginWrapper}>
      <div style={styles.loginHeader}>
        <div style={styles.loginHeaderInner}>
          <div style={styles.logoChip}>
            <img src={LOGO_ML} alt="ML Serviços" style={styles.logoMlLogin} />
          </div>
          <p style={styles.loginSubtitle}>Sistema de Gestão Operacional</p>
        </div>
      </div>
      <div style={styles.orangeBar} />

      <div style={styles.loginBody}>
        <div style={styles.loginCard}>
          <h2 style={styles.loginCardTitle}>Acesso ao sistema</h2>

          <label style={{ ...ui.label, marginBottom: 18 }}>
            Senha
            <input
              type="password"
              autoFocus
              style={ui.input}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </label>

          <button onClick={handleLogin} style={styles.loginButton} disabled={entrando}>
            {entrando ? 'Entrando...' : 'Entrar'}
          </button>

          {erro && <div style={ui.erro}>❌ {erro}</div>}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
// `usuarioInicial`/`onSair` (07/09/2026) — usados só por
// AcessoProprioScreen.jsx: quem entra pelo Link de acesso próprio de um
// perfil já chega autenticado (escolheu o nome + digitou a senha curta
// numa tela própria, antes de chegar aqui), então pula a LoginScreen
// padrão; `onSair`, se vier, é chamado no lugar do logout normal — volta
// pro seletor de nome do MESMO link, em vez de expor a porta padrão
// (senha única) de todo o sistema.
export default function GestaoML({ usuarioInicial = null, onSair = null }) {
  const [usuarioAtivo, setUsuarioAtivo] = useState(usuarioInicial);
  const [abaAtual, setAbaAtual] = useState(usuarioInicial ? abaInicial(usuarioInicial.permissoes) : 'dashboard');
  const [cadastrosExpandido, setCadastrosExpandido] = useState(false);
  const [secaoCadastroAtual, setSecaoCadastroAtual] = useState(null);
  const [planejamentoExpandido, setPlanejamentoExpandido] = useState(false);
  const [secaoPlanejamentoAtual, setSecaoPlanejamentoAtual] = useState(null);
  const [pendentesAutorizacao, setPendentesAutorizacao] = useState(0);

  // Perfil "exclusivo" de Coletor (só essa aba habilitada) já cai direto
  // na tela do Coletor; qualquer outro caso cai no Dashboard, como sempre.
  const handleLoginSuccess = (usuario) => {
    setUsuarioAtivo(usuario);
    setAbaAtual(abaInicial(usuario.permissoes));
  };

  // Pedido do Pablo: quem tem a permissão de Autorizações marcada no
  // perfil vê um popup em QUALQUER tela do app avisando que tem
  // solicitação de presença pendente, não só quando entra na aba
  // Autorizações — clicar no popup já leva direto pra lá. Precisa ficar
  // ANTES do `if (!usuarioAtivo)` porque hook não pode ser condicional; o
  // próprio efeito decide se inscreve ou não.
  useEffect(() => {
    if (!usuarioAtivo?.permissoes?.acessos?.autorizacoes) {
      setPendentesAutorizacao(0);
      return undefined;
    }
    const unsub = onSnapshot(
      collection(db, 'solicitacoesPresenca'),
      (snap) => setPendentesAutorizacao(snap.docs.filter((d) => d.data().status === 'pendente').length),
      () => setPendentesAutorizacao(0)
    );
    return () => unsub();
  }, [usuarioAtivo]);

  if (!usuarioAtivo) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const permissoes = usuarioAtivo.permissoes;
  const temDashboard = Boolean(permissoes.acessos?.dashboard);
  // "Cadastros" não é mais um flag próprio — aparece assim que pelo menos
  // 1 seção de cadastro estiver marcada (modelo flat, ver lib/permissoes.js).
  const temCadastros = SECOES_CADASTRO.some((s) => permissoes.acessos?.[s.id]);
  const temColetor = Boolean(permissoes.acessos?.coletor);
  const navPlanejamento = ITENS_SUBMENU_PLANEJAMENTO.filter((item) => permissoes.acessos?.[item.id]);
  const temPlanejamento = navPlanejamento.length > 0;
  const temRelatorios = Boolean(permissoes.acessos?.relatorios);
  const temAutorizacoes = Boolean(permissoes.acessos?.autorizacoes);
  const navCadastros = temCadastros ? montarNavegacaoCadastros(permissoes) : [];
  const secaoAtual = navCadastros.find((n) => n.id === secaoCadastroAtual) || navCadastros[0];
  const secaoPlanejamentoAtualResolvida = navPlanejamento.find((n) => n.id === secaoPlanejamentoAtual) || navPlanejamento[0];

  const abrirCadastros = () => {
    setAbaAtual('cadastros');
    setCadastrosExpandido((expandido) => !expandido);
  };

  const abrirSecaoCadastro = (id) => {
    setAbaAtual('cadastros');
    setCadastrosExpandido(true);
    setSecaoCadastroAtual(id);
  };

  const abrirPlanejamento = () => {
    setAbaAtual('planejamento');
    setPlanejamentoExpandido((expandido) => !expandido);
  };

  const abrirSecaoPlanejamento = (id) => {
    setAbaAtual('planejamento');
    setPlanejamentoExpandido(true);
    setSecaoPlanejamentoAtual(id);
  };

  return (
    <div style={styles.appShell}>
      {/* Regras de responsividade não dão pra fazer só com style inline —
          o perfil de Operação (Coletor) normalmente é usado no celular, e a
          sidebar fixa de 210px sozinha já não sobra espaço útil numa tela
          de ~360px. */}
      <style>{`
        @keyframes popupAutorizacaoPulso {
          0%, 100% { box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 12px 46px rgba(255,107,0,0.55); }
        }
        @media (max-width: 640px) {
          .app-header {
            padding: 8px 12px !important;
            grid-template-columns: auto 1fr auto !important;
            gap: 8px !important;
          }
          .app-title {
            font-size: 14px !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .app-logo { height: 26px !important; }
          .app-logo-chip { padding: 5px 10px !important; }
          .app-username { display: none; }
          .app-logout-button { padding: 5px 10px !important; font-size: 12px !important; }
          .app-body-row { flex-direction: column; }
          .app-sidebar {
            width: 100% !important;
            flex-direction: row !important;
            overflow-x: auto;
            border-right: none !important;
            border-bottom: 1px solid #E5E5E5;
            padding: 8px !important;
          }
          .app-sidebar-sub { flex-direction: row !important; flex-wrap: wrap; }
          .app-content { padding: 16px !important; }
        }
      `}</style>
      <div style={styles.appHeader} className="app-header">
        <div style={styles.appHeaderLeft}>
          <div style={styles.logoChipSmall} className="app-logo-chip">
            <img src={LOGO_ML} alt="ML Serviços" style={styles.logoMlApp} className="app-logo" />
          </div>
        </div>
        <div style={styles.appHeaderCenter}>
          <p style={styles.appSubtitle} className="app-title">Sistema de Gestão Operacional</p>
        </div>
        <div style={{ ...styles.appHeaderRight, ...styles.userBox }}>
          <span className="app-username">{usuarioAtivo.nome}</span>
          <button
            style={styles.logoutButton}
            className="app-logout-button"
            onClick={() => (onSair ? onSair() : setUsuarioAtivo(null))}
          >
            Sair
          </button>
        </div>
      </div>
      <div style={styles.orangeBar} />

      <div style={styles.bodyRow} className="app-body-row">
        {abaAtual !== 'coletor' && (
        <nav style={styles.sidebar} className="app-sidebar">
          {temDashboard && (
            <button
              onClick={() => setAbaAtual('dashboard')}
              style={{ ...styles.sidebarButton, ...(abaAtual === 'dashboard' ? styles.sidebarButtonAtivo : {}) }}
            >
              📊 Dashboard
            </button>
          )}

          {temPlanejamento && (
            <>
              <button
                onClick={abrirPlanejamento}
                style={{
                  ...styles.sidebarButton,
                  ...(abaAtual === 'planejamento' ? styles.sidebarButtonAtivo : {})
                }}
              >
                🗓️ Planejamento
              </button>
              {planejamentoExpandido && (
                <div style={styles.sidebarSubGroup} className="app-sidebar-sub">
                  {navPlanejamento.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => abrirSecaoPlanejamento(item.id)}
                      style={{
                        ...styles.sidebarSubButton,
                        ...(abaAtual === 'planejamento' && secaoPlanejamentoAtualResolvida?.id === item.id
                          ? styles.sidebarSubButtonAtivo
                          : {})
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {temRelatorios && (
            <button
              onClick={() => setAbaAtual('relatorios')}
              style={{ ...styles.sidebarButton, ...(abaAtual === 'relatorios' ? styles.sidebarButtonAtivo : {}) }}
            >
              📈 Relatórios
            </button>
          )}

          {temCadastros && (
            <>
              <button
                onClick={abrirCadastros}
                style={{
                  ...styles.sidebarButton,
                  ...(abaAtual === 'cadastros' ? styles.sidebarButtonAtivo : {})
                }}
              >
                🗂️ Cadastros
              </button>
              {cadastrosExpandido && (
                <div style={styles.sidebarSubGroup} className="app-sidebar-sub">
                  {navCadastros.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => abrirSecaoCadastro(item.id)}
                      style={{
                        ...styles.sidebarSubButton,
                        ...(abaAtual === 'cadastros' && secaoAtual?.id === item.id
                          ? styles.sidebarSubButtonAtivo
                          : {})
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {temColetor && (
            <button
              onClick={() => setAbaAtual('coletor')}
              style={{ ...styles.sidebarButton, ...(abaAtual === 'coletor' ? styles.sidebarButtonAtivo : {}) }}
            >
              📱 Coletor
            </button>
          )}

          {temAutorizacoes && (
            <button
              onClick={() => setAbaAtual('autorizacoes')}
              style={{ ...styles.sidebarButton, ...(abaAtual === 'autorizacoes' ? styles.sidebarButtonAtivo : {}) }}
            >
              🔔 Autorizações
              {pendentesAutorizacao > 0 && <span style={styles.sidebarBadge}>{pendentesAutorizacao}</span>}
            </button>
          )}
        </nav>
        )}

        <div style={styles.content} className="app-content">
          {abaAtual === 'dashboard' && temDashboard && <DashboardTab />}
          {abaAtual === 'cadastros' && temCadastros && (
            <CadastrosScreen permissoes={permissoes} secaoAtualId={secaoAtual?.id} />
          )}
          {abaAtual === 'coletor' && temColetor && (
            <ColetorScreen
              usuario={{ uid: usuarioAtivo.uid, nome: usuarioAtivo.nome, permissoes: usuarioAtivo.permissoes }}
            />
          )}
          {abaAtual === 'planejamento' && temPlanejamento && secaoPlanejamentoAtualResolvida?.id === 'planejamentoAjuste' && (
            <AjusteRegistrosScreen usuario={{ uid: usuarioAtivo.uid, nome: usuarioAtivo.nome }} />
          )}
          {abaAtual === 'planejamento' && temPlanejamento && secaoPlanejamentoAtualResolvida?.id !== 'planejamentoAjuste' && (
            <PlanejamentoScreen />
          )}
          {abaAtual === 'relatorios' && temRelatorios && <RelatoriosScreen />}
          {abaAtual === 'autorizacoes' && temAutorizacoes && (
            <AutorizacoesScreen usuario={{ uid: usuarioAtivo.uid, nome: usuarioAtivo.nome }} />
          )}
        </div>
      </div>

      <div style={styles.footer}>
        <div style={styles.footerOrangeBar} />
        <div style={styles.footerRow}>
          <div style={styles.footerSbsChip}>
            <img src={LOGO_SBS} alt="SBS Solution" style={styles.logoSbsFooter} />
          </div>
          <span style={styles.footerText}>Desenvolvido pela SBS Solution e Byplo.</span>
        </div>
      </div>

      {pendentesAutorizacao > 0 && abaAtual !== 'autorizacoes' && (
        <>
          <div style={styles.popupAutorizacaoFundo} />
          <button type="button" style={styles.popupAutorizacao} onClick={() => setAbaAtual('autorizacoes')}>
            <span style={styles.popupAutorizacaoIcone}>🔔</span>
            <span>
              <strong>{pendentesAutorizacao}</strong> solicitação{pendentesAutorizacao > 1 ? 'ões' : ''} de presença
              pendente{pendentesAutorizacao > 1 ? 's' : ''}
              <br />
              <span style={styles.popupAutorizacaoLink}>Ver agora →</span>
            </span>
          </button>
        </>
      )}
    </div>
  );
}

// ============================================================
// ESTILOS (específicos do shell — o resto vem de lib/styles.js)
// ============================================================
const styles = {
  loginWrapper: { minHeight: '100vh', background: '#F5F7FA' },
  loginHeader: {
    background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`,
    color: '#FFF',
    padding: '28px 20px'
  },
  loginHeaderInner: { maxWidth: 420, margin: '0 auto', textAlign: 'center' },
  loginSubtitle: { margin: '10px 0 0', fontSize: 26, fontWeight: 600, opacity: 0.9, letterSpacing: 0.5 },
  logoChip: {
    display: 'inline-flex',
    background: '#FFF',
    borderRadius: 12,
    padding: '10px 20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
  },
  logoMlLogin: { height: 56, width: 'auto', display: 'block' },
  orangeBar: { height: 4, background: ORANGE },
  loginBody: { display: 'flex', justifyContent: 'center', padding: '48px 20px' },
  loginCard: {
    background: '#FFF',
    borderRadius: 8,
    padding: 44,
    maxWidth: 420,
    width: '100%',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
  },
  loginCardTitle: { marginTop: 0, textAlign: 'center', color: NAVY },
  loginButton: {
    width: '100%',
    padding: 12,
    background: ORANGE,
    color: '#FFF',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15
  },

  appShell: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },

  appHeader: {
    background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`,
    color: '#FFF',
    padding: '26px 28px',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: 16
  },
  appHeaderLeft: { justifySelf: 'start' },
  appHeaderCenter: { justifySelf: 'center', textAlign: 'center' },
  appHeaderRight: { justifySelf: 'end' },
  logoChipSmall: {
    display: 'inline-flex',
    background: '#FFF',
    borderRadius: 12,
    padding: '10px 22px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
  },
  logoMlApp: { height: 64, width: 'auto', display: 'block' },
  appSubtitle: { margin: 0, fontSize: 34, fontWeight: 700, letterSpacing: 0.5 },
  userBox: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 },
  logoutButton: {
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.15)',
    color: '#FFF',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: 4,
    cursor: 'pointer'
  },

  bodyRow: { display: 'flex', flex: 1, alignItems: 'stretch' },
  sidebar: {
    width: 210,
    flexShrink: 0,
    background: '#FFF',
    borderRight: '1px solid #E5E5E5',
    padding: '20px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  sidebarButton: {
    textAlign: 'left',
    padding: '12px 16px',
    background: 'transparent',
    color: '#333',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14
  },
  sidebarButtonAtivo: { background: NAVY, color: '#FFF' },
  sidebarBadge: {
    marginLeft: 8,
    background: ORANGE,
    color: '#FFF',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 700,
    padding: '1px 7px'
  },
  sidebarSubGroup: { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 },
  sidebarSubButton: {
    textAlign: 'left',
    padding: '9px 16px 9px 30px',
    background: 'transparent',
    color: '#555',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: 13
  },
  sidebarSubButtonAtivo: { background: '#E5EDF7', color: NAVY, fontWeight: 700 },

  content: { flex: 1, padding: '24px 28px 60px', minWidth: 0 },

  footer: { background: NAVY, color: '#FFF', padding: '18px 20px' },
  footerOrangeBar: { height: 4, background: ORANGE, margin: '-18px -20px 16px' },
  footerRow: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12, paddingLeft: 12 },
  footerSbsChip: {
    display: 'inline-flex',
    background: '#FFF',
    borderRadius: 8,
    padding: '4px 12px'
  },
  logoSbsFooter: { height: 22, width: 'auto', display: 'block' },
  footerText: { fontSize: 13, color: '#DDD' },

  // Popup flutuante de solicitação de presença pendente — some quando não
  // há nenhuma pendente ou quando o usuário já está na aba Autorizações
  // (reativo, sem botão de "dispensar": resolve sozinho quando a fila
  // esvazia, mesmo espírito do alerta de falta do Dashboard).
  // Centralizado + bem maior (pedido do Pablo, 08/09/2026 — o canto
  // inferior direito passava despercebido). O fundo escurecido reforça a
  // urgência mas fica com `pointerEvents: none`: só o card em si é
  // clicável, o resto da tela continua utilizável por trás dele.
  popupAutorizacaoFundo: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.45)',
    zIndex: 1199,
    pointerEvents: 'none'
  },
  popupAutorizacao: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    background: '#FFF',
    border: `3px solid ${ORANGE}`,
    borderRadius: 18,
    padding: '30px 36px',
    maxWidth: 440,
    textAlign: 'left',
    fontSize: 18,
    color: '#333',
    cursor: 'pointer',
    animation: 'popupAutorizacaoPulso 2.2s ease-in-out infinite'
  },
  popupAutorizacaoIcone: { fontSize: 44, lineHeight: 1 },
  popupAutorizacaoLink: { display: 'inline-block', marginTop: 6, color: ORANGE, fontWeight: 700, fontSize: 16 }
};
