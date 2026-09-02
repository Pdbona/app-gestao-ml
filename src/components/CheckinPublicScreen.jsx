import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db, storage } from '../firebase';
import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { NAVY, ORANGE } from '../lib/styles';
import { normalizarCpf, validarCpf, formatarCpf } from '../lib/cpf';
import { capturarGeolocalizacao, distanciaMetros, TOLERANCIA_GEO_METROS } from '../lib/geo';
import { obterConfigSelfie } from '../lib/limpezaSelfies';

const hojeISO = () => new Date().toISOString().slice(0, 10);

// Tela PÚBLICA (sem login) — aberta direto pelo QR Code fixado no
// Cliente/Local (ver botão "Gerar QR Code" em ClientesCadastro.jsx e a
// leitura de `?checkin=` em App.jsx). Wizard: CPF (validado contra a base
// de Colaboradores) → Turno → Selfie → Geolocalização. Se qualquer
// validação falhar, NADA é gravado — só mostra o erro.
export default function CheckinPublicScreen({ clienteId }) {
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [cliente, setCliente] = useState(null);
  const [colaboradores, setColaboradores] = useState([]);
  const [turnosDisponiveis, setTurnosDisponiveis] = useState([]);
  const [guardarSelfie, setGuardarSelfie] = useState(false);

  const [etapa, setEtapa] = useState('cpf'); // cpf | turno | selfie | geo | sucesso
  const [cpfDigitado, setCpfDigitado] = useState('');
  const [colaborador, setColaborador] = useState(null);
  const [turnoId, setTurnoId] = useState('');
  const [selfie, setSelfie] = useState(null);
  const [capturandoGeo, setCapturandoGeo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const inputSelfieRef = useRef(null);
  const selfieUrl = useMemo(() => (selfie ? URL.createObjectURL(selfie) : null), [selfie]);
  useEffect(() => () => selfieUrl && URL.revokeObjectURL(selfieUrl), [selfieUrl]);

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      try {
        const clienteSnap = await getDoc(doc(db, 'clientes', clienteId));
        if (!clienteSnap.exists() || clienteSnap.data().status === 'inativo') {
          if (!cancelado) setErroCarga('QR Code inválido ou Cliente/Local inativo. Fale com o Administrativo.');
          return;
        }
        const clienteData = { id: clienteSnap.id, ...clienteSnap.data() };

        const colabsSnap = await getDocs(collection(db, 'colaboradores'));
        const colabs = colabsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.ativo !== false);

        const planSnap = await getDocs(
          query(collection(db, 'planejamentoOperacional'), where('clienteId', '==', clienteId), where('data', '==', hojeISO()))
        );
        const turnoIdsPlanejados = [...new Set(planSnap.docs.map((d) => d.data().turnoId))];

        const turnosSnap = await getDocs(collection(db, 'turnos'));
        const turnosAtivos = turnosSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.ativo !== false);
        const turnosPlanejadosHoje = turnosAtivos.filter((t) => turnoIdsPlanejados.includes(t.id));

        const configSelfie = await obterConfigSelfie();

        if (cancelado) return;
        setCliente(clienteData);
        setColaboradores(colabs);
        setTurnosDisponiveis(turnosPlanejadosHoje.length > 0 ? turnosPlanejadosHoje : turnosAtivos);
        setGuardarSelfie(configSelfie.guardarSelfie);
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
  }, [clienteId]);

  const confirmarCpf = () => {
    setErro('');
    const cpfLimpo = normalizarCpf(cpfDigitado);
    if (!validarCpf(cpfLimpo)) {
      setErro('CPF inválido — confira os números digitados.');
      return;
    }
    const encontrado = colaboradores.find((c) => normalizarCpf(c.cpf) === cpfLimpo);
    if (!encontrado) {
      setErro('CPF não encontrado na base da ML. Fale com o Administrativo pra ser cadastrado.');
      return;
    }
    setColaborador(encontrado);
    if (turnosDisponiveis.length === 1) {
      setTurnoId(turnosDisponiveis[0].id);
      setEtapa('selfie');
    } else {
      setEtapa('turno');
    }
  };

  const confirmarTurno = () => {
    if (!turnoId) {
      setErro('Selecione o turno.');
      return;
    }
    setErro('');
    setEtapa('selfie');
  };

  const confirmarSelfie = () => {
    if (!selfie) {
      setErro('Tire a selfie pra continuar.');
      return;
    }
    setErro('');
    setEtapa('geo');
  };

  const confirmarLocal = async () => {
    setErro('');
    if (cliente.geoLat == null || cliente.geoLng == null) {
      setErro('Este Cliente/Local ainda não tem geolocalização cadastrada. Fale com o Administrativo.');
      return;
    }
    setCapturandoGeo(true);
    try {
      const { lat, lng } = await capturarGeolocalizacao();
      const distancia = distanciaMetros(lat, lng, cliente.geoLat, cliente.geoLng);
      if (distancia > TOLERANCIA_GEO_METROS) {
        setErro(
          `Você está a ${Math.round(distancia)}m do local — precisa estar no Cliente/Local pra confirmar presença.`
        );
        setCapturandoGeo(false);
        return;
      }
      await salvarPresenca({ lat, lng, distancia });
    } catch (e) {
      setErro('Não foi possível capturar sua localização. Verifique a permissão de localização do navegador.');
      setCapturandoGeo(false);
    }
  };

  const salvarPresenca = async ({ lat, lng, distancia }) => {
    setSalvando(true);
    setErro('');
    try {
      const novoDocRef = doc(collection(db, 'presencas'));
      // Selfie do check-in ainda NÃO é guardada de verdade por padrão — o
      // Storage do Firebase passou a exigir o plano pago (Blaze). A foto
      // continua sendo tirada e exigida no wizard (confirma visualmente
      // quem é a pessoa), só não sobe pra lugar nenhum, a não ser que o
      // Administrativo ligue isso em Planejamento → Selfie do check-in.
      let fotoPath = null;
      if (guardarSelfie) {
        fotoPath = `presencas/${novoDocRef.id}/selfie.jpg`;
        await uploadBytes(ref(storage, fotoPath), selfie);
      }
      await setDoc(novoDocRef, {
        clienteId,
        colaboradorId: colaborador.id,
        colaboradorNome: colaborador.nome,
        cpf: normalizarCpf(colaborador.cpf),
        turnoId,
        data: hojeISO(),
        dataHoraCheckin: serverTimestamp(),
        geoLat: lat,
        geoLng: lng,
        distanciaMetros: Math.round(distancia),
        fotoPath
      });
      setEtapa('sucesso');
    } catch (e) {
      setErro('Falha ao gravar a presença. Verifique sua conexão e tente novamente.');
    } finally {
      setSalvando(false);
      setCapturandoGeo(false);
    }
  };

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

  const turnoNome = (id) => turnosDisponiveis.find((t) => t.id === id)?.nome || '';

  return (
    <div style={styles.pagina}>
      <div style={styles.card}>
        <h2 style={styles.titulo}>Confirmar presença</h2>
        <p style={styles.subtitulo}>{cliente.nome}</p>

        {etapa === 'cpf' && (
          <>
            <label style={styles.rotulo}>
              CPF *
              <input
                type="text"
                inputMode="numeric"
                style={styles.input}
                value={cpfDigitado}
                onChange={(e) => setCpfDigitado(formatarCpf(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                autoFocus
              />
            </label>
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarCpf}>
              Continuar
            </button>
          </>
        )}

        {etapa === 'turno' && (
          <>
            <p style={styles.textoInfo}>Olá, {colaborador.nome}! Qual turno você está iniciando?</p>
            <label style={styles.rotulo}>
              Turno *
              <select style={styles.input} value={turnoId} onChange={(e) => setTurnoId(e.target.value)}>
                <option value="">Selecione...</option>
                {turnosDisponiveis.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.horaInicio})
                  </option>
                ))}
              </select>
            </label>
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarTurno}>
              Continuar
            </button>
          </>
        )}

        {etapa === 'selfie' && (
          <>
            <p style={styles.textoInfo}>Agora tire uma selfie pra confirmar quem é você.</p>
            <button
              type="button"
              onClick={() => inputSelfieRef.current?.click()}
              style={styles.fotoSlot}
            >
              {selfieUrl ? <img src={selfieUrl} alt="Selfie" style={styles.fotoThumb} /> : <span style={styles.fotoIcone}>🤳</span>}
            </button>
            <input
              ref={inputSelfieRef}
              type="file"
              accept="image/*"
              capture="user"
              style={{ display: 'none' }}
              onChange={(e) => setSelfie(e.target.files[0] || null)}
            />
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarSelfie}>
              Continuar
            </button>
          </>
        )}

        {etapa === 'geo' && (
          <>
            <p style={styles.textoInfo}>
              Por último, confirme que você está em <strong>{cliente.nome}</strong>.
            </p>
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarLocal} disabled={capturandoGeo || salvando}>
              {capturandoGeo || salvando ? 'Confirmando...' : '📍 Confirmar minha localização'}
            </button>
          </>
        )}

        {etapa === 'sucesso' && (
          <div style={styles.sucesso}>
            <p style={styles.sucessoIcone}>✅</p>
            <p style={styles.sucessoTexto}>
              Presença confirmada, {colaborador.nome}!
              <br />
              {cliente.nome} — {turnoNome(turnoId)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  pagina: { display: 'flex', justifyContent: 'center', padding: '24px 16px', minHeight: '100vh', background: '#F5F7FA' },
  card: {
    background: '#FFF',
    borderRadius: 12,
    padding: '28px 20px',
    width: '100%',
    maxWidth: 420,
    height: 'fit-content',
    boxShadow: '0 1px 6px rgba(0,0,0,0.1)'
  },
  titulo: { margin: '0 0 4px', color: NAVY, fontSize: 20, textAlign: 'center' },
  subtitulo: { margin: '0 0 20px', color: '#666', fontSize: 15, textAlign: 'center', fontWeight: 600 },
  textoInfo: { fontSize: 15, color: '#333', textAlign: 'center', marginBottom: 16 },

  rotulo: { display: 'flex', flexDirection: 'column', fontSize: 14, fontWeight: 600, color: '#444', gap: 6, marginBottom: 16 },
  input: { padding: '13px 12px', borderRadius: 8, border: '1px solid #CCC', fontSize: 16, fontWeight: 400, background: '#FFF' },

  fotoSlot: {
    width: '100%',
    aspectRatio: '1',
    maxWidth: 220,
    margin: '0 auto 16px',
    display: 'block',
    borderRadius: 12,
    border: '2px dashed #BBB',
    background: '#FAFAFA',
    cursor: 'pointer',
    padding: 0,
    overflow: 'hidden'
  },
  fotoThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  fotoIcone: { fontSize: 40 },

  erroTexto: { color: '#D32F2F', marginBottom: 12, fontSize: 14, textAlign: 'center' },
  erroBloqueio: { color: '#D32F2F', fontSize: 15, textAlign: 'center' },

  botaoGrande: {
    width: '100%',
    padding: 16,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 17,
    background: ORANGE,
    color: '#FFF'
  },

  sucesso: { textAlign: 'center', padding: '20px 0' },
  sucessoIcone: { fontSize: 48, margin: 0 },
  sucessoTexto: { fontSize: 17, color: NAVY, fontWeight: 600, lineHeight: 1.5 }
};
