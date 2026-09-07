import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { NAVY, ORANGE, ui } from '../lib/styles';
import { mergePermissoes } from '../lib/permissoes';
import GestaoML from './GestaoML';

// Porta de entrada do "Link de acesso próprio" (07/09/2026) — acessada
// via `?acesso=<slug>` (ver App.jsx), lida direto do slug gravado no
// perfil (PerfisCadastro.jsx). Em vez da porta padrão (senha única, sem
// nome), aqui a pessoa ESCOLHE o próprio nome (dentre os usuários do
// perfil) e digita a própria senha curta — pensado pro futuro de
// clientes da ML (Belmicro, Wepink...) com link próprio pras telas que o
// perfil deles liberar. NÃO restringe dados por cliente ainda (isso é um
// passo futuro) — só o acesso por link + as telas do perfil.
export default function AcessoProprioScreen({ slug }) {
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [perfil, setPerfil] = useState(null);
  const [usuariosDoPerfil, setUsuariosDoPerfil] = useState([]);

  const [usuarioId, setUsuarioId] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState('');
  const [logado, setLogado] = useState(null);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const perfisSnap = await getDocs(collection(db, 'perfis'));
        const perfilEncontrado = perfisSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .find((p) => p.linkProprio && p.slug === slug);
        if (!perfilEncontrado) {
          if (!cancelado) setErroCarga('Link inválido ou o acesso próprio deste perfil foi desativado. Fale com o Administrativo.');
          return;
        }

        const usuariosSnap = await getDocs(collection(db, 'usuarios'));
        const doPerfil = usuariosSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => u.perfilId === perfilEncontrado.id && u.ativo !== false);

        if (cancelado) return;
        setPerfil(perfilEncontrado);
        setUsuariosDoPerfil(doPerfil);
      } catch (e) {
        if (!cancelado) setErroCarga('Falha ao carregar os dados. Verifique sua conexão e tente novamente.');
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [slug]);

  const entrar = () => {
    setErro('');
    if (!usuarioId) {
      setErro('Selecione o seu nome.');
      return;
    }
    if (!senha.trim()) {
      setErro('Informe a senha.');
      return;
    }
    setEntrando(true);
    // Validação é só local (já temos os usuários do perfil carregados) —
    // sem round-trip novo, mas ainda assim "entrando" dá o feedback visual
    // de que algo está acontecendo (evita a sensação de botão sem efeito).
    setTimeout(() => {
      const usuario = usuariosDoPerfil.find((u) => u.id === usuarioId);
      if (!usuario || usuario.senha !== senha) {
        setErro('Senha incorreta.');
        setEntrando(false);
        return;
      }
      setLogado({
        uid: usuario.id,
        nome: usuario.nome,
        perfilId: perfil.id,
        permissoes: mergePermissoes(perfil.permissoes, usuario.permissoesCustom)
      });
      setEntrando(false);
    }, 150);
  };

  // Já autenticado — renderiza o app normal (mesma shell de sempre), só
  // que sem passar pela LoginScreen padrão. `key` força remontar do zero
  // se a pessoa sair e entrar com outro nome na sequência (sem carregar
  // estado da sessão anterior).
  if (logado) {
    return <GestaoML key={logado.uid} usuarioInicial={logado} onSair={() => setLogado(null)} />;
  }

  if (carregando) {
    return (
      <div style={styles.pagina}>
        <p>Carregando...</p>
      </div>
    );
  }

  if (erroCarga) {
    return (
      <div style={styles.pagina}>
        <div style={styles.card}>
          <p style={styles.erroBloqueio}>❌ {erroCarga}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.pagina}>
      <div style={styles.card}>
        <h2 style={styles.titulo}>Acesso ao sistema</h2>
        <p style={styles.subtitulo}>{perfil.nome}</p>

        <label style={ui.label}>
          Seu nome *
          <select style={ui.input} value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
            <option value="">Selecione...</option>
            {usuariosDoPerfil.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...ui.label, marginTop: 14 }}>
          Senha
          <input
            type="password"
            style={ui.input}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && entrar()}
          />
        </label>

        {erro && <div style={{ ...ui.erro, marginTop: 10 }}>❌ {erro}</div>}

        <button style={styles.botaoEntrar} onClick={entrar} disabled={entrando}>
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  pagina: { display: 'flex', justifyContent: 'center', padding: '48px 20px', minHeight: '100vh', background: '#F5F7FA' },
  card: {
    background: '#FFF',
    borderRadius: 12,
    padding: '32px 28px',
    width: '100%',
    maxWidth: 400,
    height: 'fit-content',
    boxShadow: '0 1px 6px rgba(0,0,0,0.1)'
  },
  titulo: { margin: '0 0 4px', color: NAVY, fontSize: 20, textAlign: 'center' },
  subtitulo: { margin: '0 0 24px', color: '#666', fontSize: 15, textAlign: 'center', fontWeight: 600 },
  erroBloqueio: { color: '#D32F2F', fontSize: 15, textAlign: 'center' },
  botaoEntrar: {
    width: '100%',
    padding: 12,
    marginTop: 22,
    background: ORANGE,
    color: '#FFF',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 15
  }
};
