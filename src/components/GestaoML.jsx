import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { PERFIL_ADMIN_PADRAO, mergePermissoes, montarNavegacaoCadastros, abaInicial } from '../lib/permissoes';
import { NAVY, NAVY_LIGHT, ORANGE, ui } from '../lib/styles';
import DashboardTab from './DashboardTab';
import CadastrosScreen from './cadastros/CadastrosScreen';
import ColetorScreen from './ColetorScreen';

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
export default function GestaoML() {
  const [usuarioAtivo, setUsuarioAtivo] = useState(null);
  const [abaAtual, setAbaAtual] = useState('dashboard');
  const [cadastrosExpandido, setCadastrosExpandido] = useState(false);
  const [secaoCadastroAtual, setSecaoCadastroAtual] = useState(null);

  // Perfil "exclusivo" de Coletor (só essa aba habilitada) já cai direto
  // na tela do Coletor; qualquer outro caso cai no Dashboard, como sempre.
  const handleLoginSuccess = (usuario) => {
    setUsuarioAtivo(usuario);
    setAbaAtual(abaInicial(usuario.permissoes));
  };

  if (!usuarioAtivo) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const permissoes = usuarioAtivo.permissoes;
  const temDashboard = Boolean(permissoes.abas?.dashboard);
  const temCadastros = Boolean(permissoes.abas?.cadastros);
  const temColetor = Boolean(permissoes.abas?.coletor);
  const navCadastros = temCadastros ? montarNavegacaoCadastros(permissoes) : [];
  const secaoAtual = navCadastros.find((n) => n.id === secaoCadastroAtual) || navCadastros[0];

  const abrirCadastros = () => {
    setAbaAtual('cadastros');
    setCadastrosExpandido((expandido) => !expandido);
  };

  const abrirSecaoCadastro = (id) => {
    setAbaAtual('cadastros');
    setCadastrosExpandido(true);
    setSecaoCadastroAtual(id);
  };

  return (
    <div style={styles.appShell}>
      {/* Regras de responsividade não dão pra fazer só com style inline —
          o perfil de Operação (Coletor) normalmente é usado no celular, e a
          sidebar fixa de 210px sozinha já não sobra espaço útil numa tela
          de ~360px. */}
      <style>{`
        @media (max-width: 640px) {
          .app-header { padding: 16px !important; }
          .app-title { font-size: 20px !important; }
          .app-logo { height: 40px !important; }
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
          <div style={styles.logoChipSmall}>
            <img src={LOGO_ML} alt="ML Serviços" style={styles.logoMlApp} className="app-logo" />
          </div>
        </div>
        <div style={styles.appHeaderCenter}>
          <p style={styles.appSubtitle} className="app-title">Sistema de Gestão Operacional</p>
        </div>
        <div style={{ ...styles.appHeaderRight, ...styles.userBox }}>
          <span>{usuarioAtivo.nome}</span>
          <button style={styles.logoutButton} onClick={() => setUsuarioAtivo(null)}>
            Sair
          </button>
        </div>
      </div>
      <div style={styles.orangeBar} />

      <div style={styles.bodyRow} className="app-body-row">
        <nav style={styles.sidebar} className="app-sidebar">
          {temDashboard && (
            <button
              onClick={() => setAbaAtual('dashboard')}
              style={{ ...styles.sidebarButton, ...(abaAtual === 'dashboard' ? styles.sidebarButtonAtivo : {}) }}
            >
              📊 Dashboard
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
              📷 Coletor
            </button>
          )}
        </nav>

        <div style={styles.content} className="app-content">
          {abaAtual === 'dashboard' && temDashboard && <DashboardTab />}
          {abaAtual === 'cadastros' && temCadastros && (
            <CadastrosScreen permissoes={permissoes} secaoAtualId={secaoAtual?.id} />
          )}
          {abaAtual === 'coletor' && temColetor && (
            <ColetorScreen usuario={{ uid: usuarioAtivo.uid, nome: usuarioAtivo.nome }} />
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
  footerText: { fontSize: 13, color: '#DDD' }
};
