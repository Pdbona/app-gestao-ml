import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { PERFIL_ADMIN_PADRAO, mergePermissoes } from '../lib/permissoes';
import { NAVY, NAVY_LIGHT, ORANGE, ui } from '../lib/styles';
import DashboardTab from './DashboardTab';
import CadastrosScreen from './cadastros/CadastrosScreen';

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
const BOOTSTRAP_NOME = 'admin';
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

async function autenticar(nomeDigitado, senhaDigitada) {
  try {
    const snap = await comTimeout(getDocs(collection(db, 'usuarios')));
    const usuarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const encontrado = usuarios.find(
      (u) =>
        u.ativo !== false &&
        (u.nome || '').toLowerCase() === nomeDigitado.toLowerCase() &&
        u.senha === senhaDigitada
    );
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

  if (nomeDigitado.toLowerCase() === BOOTSTRAP_NOME && senhaDigitada === BOOTSTRAP_SENHA) {
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
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');

  const handleLogin = async () => {
    if (!nome.trim() || !senha.trim()) {
      setErro('Informe usuário e senha.');
      return;
    }
    setEntrando(true);
    setErro('');
    const usuario = await autenticar(nome.trim(), senha);
    setEntrando(false);
    if (usuario) {
      onLoginSuccess(usuario);
    } else {
      setErro('Usuário ou senha inválidos.');
    }
  };

  return (
    <div style={styles.loginWrapper}>
      <div style={styles.loginHeader}>
        <div style={styles.loginHeaderInner}>
          <div style={styles.logoChip}>
            <img src={LOGO_ML} alt="ML Serviços" style={styles.logoMlLogin} />
          </div>
          <p style={styles.loginSubtitle}>Sistema de Gestão</p>
        </div>
      </div>
      <div style={styles.orangeBar} />

      <div style={styles.loginBody}>
        <div style={styles.loginCard}>
          <h2 style={styles.loginCardTitle}>Acesso ao sistema</h2>

          <label style={{ ...ui.label, marginBottom: 14 }}>
            Usuário
            <input
              style={ui.input}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </label>

          <label style={{ ...ui.label, marginBottom: 18 }}>
            Senha
            <input
              type="password"
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

  if (!usuarioAtivo) {
    return <LoginScreen onLoginSuccess={setUsuarioAtivo} />;
  }

  const permissoes = usuarioAtivo.permissoes;
  const abas = [
    permissoes.abas?.dashboard && { id: 'dashboard', label: '📊 Dashboard' },
    permissoes.abas?.cadastros && { id: 'cadastros', label: '🗂️ Cadastros' }
  ].filter(Boolean);

  return (
    <div>
      <div style={styles.appHeader}>
        <div style={styles.appHeaderInner}>
          <div style={styles.appBrandRow}>
            <div style={styles.logoChipSmall}>
              <img src={LOGO_ML} alt="ML Serviços" style={styles.logoMlApp} />
            </div>
            <p style={styles.appSubtitle}>Sistema de Gestão</p>
          </div>
          <div style={styles.userBox}>
            <span>{usuarioAtivo.nome}</span>
            <button style={styles.logoutButton} onClick={() => setUsuarioAtivo(null)}>
              Sair
            </button>
          </div>
        </div>
      </div>
      <div style={styles.orangeBar} />

      <div style={styles.tabsRow}>
        {abas.map((aba) => (
          <button
            key={aba.id}
            onClick={() => setAbaAtual(aba.id)}
            style={{ ...styles.tabButton, ...(abaAtual === aba.id ? styles.tabButtonAtivo : {}) }}
          >
            {aba.label}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {abaAtual === 'dashboard' && permissoes.abas?.dashboard && <DashboardTab />}
        {abaAtual === 'cadastros' && permissoes.abas?.cadastros && <CadastrosScreen permissoes={permissoes} />}
      </div>

      <div style={styles.footer}>
        <div style={styles.footerOrangeBar} />
        <p style={styles.footerDevBy}>Desenvolvido por</p>
        <div style={styles.footerSbsChip}>
          <img src={LOGO_SBS} alt="SBS Solution" style={styles.logoSbsFooter} />
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
  loginSubtitle: { margin: '10px 0 0', fontSize: 13, opacity: 0.85, letterSpacing: 0.5 },
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

  appHeader: { background: `linear-gradient(135deg, ${NAVY}, ${NAVY_LIGHT})`, color: '#FFF', padding: '18px 24px' },
  appHeaderInner: {
    maxWidth: 1100,
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12
  },
  appBrandRow: { display: 'flex', alignItems: 'center', gap: 14 },
  logoChipSmall: {
    display: 'inline-flex',
    background: '#FFF',
    borderRadius: 8,
    padding: '6px 12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.15)'
  },
  logoMlApp: { height: 32, width: 'auto', display: 'block' },
  appSubtitle: { margin: 0, fontSize: 12, opacity: 0.85 },
  userBox: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 },
  logoutButton: {
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.15)',
    color: '#FFF',
    border: '1px solid rgba(255,255,255,0.4)',
    borderRadius: 4,
    cursor: 'pointer'
  },

  tabsRow: { maxWidth: 1100, margin: '0 auto', padding: '12px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap' },
  tabButton: {
    padding: '10px 16px',
    background: '#E8E8E8',
    color: '#333',
    border: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    fontWeight: 600
  },
  tabButtonAtivo: { background: NAVY, color: '#FFF' },

  content: { maxWidth: 1100, margin: '0 auto', padding: '20px 24px 60px' },

  footer: { background: NAVY, color: '#FFF', textAlign: 'center', padding: '24px 20px' },
  footerOrangeBar: { height: 4, background: ORANGE, margin: '-24px -20px 20px' },
  footerDevBy: { margin: '0 0 10px', fontSize: 11, color: '#AAA', textTransform: 'uppercase', letterSpacing: 1 },
  footerSbsChip: {
    display: 'inline-flex',
    background: '#FFF',
    borderRadius: 8,
    padding: '6px 14px'
  },
  logoSbsFooter: { height: 26, width: 'auto', display: 'block' }
};
