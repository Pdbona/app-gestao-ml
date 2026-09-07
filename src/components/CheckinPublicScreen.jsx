import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db, storage } from '../firebase';
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { NAVY, ORANGE } from '../lib/styles';
import { normalizarCpf, validarCpf, formatarCpf } from '../lib/cpf';
import { capturarGeolocalizacao, distanciaMetros, TOLERANCIA_GEO_METROS } from '../lib/geo';
import { obterConfigSelfie } from '../lib/limpezaSelfies';
import { hojeISO, statusJanelaEntrada, statusJanelaSaida, minutosDesdeInicioTurno } from '../lib/data';

// Tela PÚBLICA (sem login) — aberta direto pelo QR Code fixado no
// Cliente/Local (ver botão "Gerar QR Code" em ClientesCadastro.jsx e a
// leitura de `?checkin=` em App.jsx). O mesmo QR serve pra CHEGADA e
// SAÍDA (feature de saída, 04/09/2026) — o colaborador só digita o CPF de
// novo; o sistema detecta sozinho se ele já tem uma presença aberta hoje
// nesse Cliente/Local (chegada sem saída) e já cai direto no wizard de
// Saída, sem escolha manual (confirmado com o Pablo via AskUserQuestion).
//
// Wizard CHEGADA: CPF → Turno (só se 2+ planejados) → [pedido de
// autorização, se atrasado] → Selfie → Geolocalização.
// Wizard SAÍDA: CPF (detecta) → [Justificativa, se fora da janela] →
// Selfie → Geolocalização.
// Se qualquer validação falhar, NADA é gravado — só mostra o erro.
export default function CheckinPublicScreen({ clienteId }) {
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [cliente, setCliente] = useState(null);
  const [colaboradores, setColaboradores] = useState([]);
  const [turnosDisponiveis, setTurnosDisponiveis] = useState([]);
  const [turnosAtivosTodos, setTurnosAtivosTodos] = useState([]);
  const [guardarSelfie, setGuardarSelfie] = useState(false);

  // cpf | turno | justificativaSaida | selfie | geo | sucesso | bloqueado | aguardandoAutorizacao
  const [etapa, setEtapa] = useState('cpf');
  const [modo, setModo] = useState('entrada'); // 'entrada' | 'saida' — decidido sozinho em confirmarCpf()
  const [cpfDigitado, setCpfDigitado] = useState('');
  const [colaborador, setColaborador] = useState(null);
  const [turnoId, setTurnoId] = useState('');
  const [selfie, setSelfie] = useState(null);
  const [capturandoGeo, setCapturandoGeo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [verificandoCpf, setVerificandoCpf] = useState(false);
  const [mensagemBloqueio, setMensagemBloqueio] = useState('');
  // Guarda o id da solicitação de presença em atraso já aprovada, pra poder
  // marcar `consumidaEm` nela depois que a presença for gravada com sucesso
  // (evita que a mesma aprovação sirva pra uma 2ª presença no mesmo turno/dia).
  const [solicitacaoAprovadaId, setSolicitacaoAprovadaId] = useState(null);

  // ======== Estado específico da SAÍDA ========
  const [presencaAbertaId, setPresencaAbertaId] = useState(null);
  const [turnoDaSaida, setTurnoDaSaida] = useState(null);
  const [tipoJustificativaSaida, setTipoJustificativaSaida] = useState(null); // 'antecipada' | 'tempo_extra' | null
  const [minutosDesvioSaida, setMinutosDesvioSaida] = useState(null);
  const [justificativaSaida, setJustificativaSaida] = useState('');

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

        // Sem nenhum turno planejado (ou o único planejado não bate com
        // nenhum turno ativo cadastrado) — bloqueia de vez. Antes disso
        // caía num fallback que mostrava TODOS os turnos ativos do sistema,
        // de qualquer cliente, o que deixava confirmar presença num turno
        // sem relação nenhuma com o planejamento do dia.
        if (turnosPlanejadosHoje.length === 0) {
          if (!cancelado) setErroCarga('Não há operação planejada para hoje neste Cliente/Local.');
          return;
        }

        const configSelfie = await obterConfigSelfie();

        if (cancelado) return;
        setCliente(clienteData);
        setColaboradores(colabs);
        setTurnosDisponiveis(turnosPlanejadosHoje);
        // Guarda TODOS os turnos ativos (não só os planejados hoje) — a
        // Saída precisa resolver o turno da presença aberta mesmo que, por
        // algum motivo, ele não esteja (mais) na lista de planejados hoje.
        setTurnosAtivosTodos(turnosAtivos);
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

  // ======== Fluxo de SAÍDA ========
  // Resolve o turno da presença aberta e decide se precisa de
  // justificativa (fora da janela de ±10min do horaFim) antes de seguir
  // pra selfie/geo — mesma ordem do fluxo de chegada (checagem de horário
  // primeiro, foto depois).
  const iniciarFluxoSaida = (presencaAberta) => {
    const turno = turnosAtivosTodos.find((t) => t.id === presencaAberta.turnoId) || null;
    setModo('saida');
    setPresencaAbertaId(presencaAberta.id);
    setTurnoId(presencaAberta.turnoId);
    setTurnoDaSaida(turno);

    const status = statusJanelaSaida(turno?.horaFim);
    if (status === 'normal' || status === 'sem_horario') {
      setTipoJustificativaSaida(null);
      setMinutosDesvioSaida(null);
      setEtapa('selfie');
      return;
    }
    setTipoJustificativaSaida(status === 'antecipada' ? 'antecipada' : 'tempo_extra');
    setMinutosDesvioSaida(minutosDesdeInicioTurno(turno.horaFim));
    setJustificativaSaida('');
    setEtapa('justificativaSaida');
  };

  // ======== Fluxo de CHEGADA (janela de horário aplicada ao turno que o
  // colaborador está de fato tentando confirmar — vale tanto quando o
  // turno foi auto-selecionado (só 1 planejado pro dia) quanto quando foi
  // escolhido manualmente no seletor (2+ planejados), ver histórico do bug
  // de janela com 2+ turnos corrigido em 03/09/2026). ========
  const avaliarJanelaEntrada = async (turno, colaboradorEscolhido) => {
    const solicitacaoId = `${colaboradorEscolhido.id}_${clienteId}_${turno.id}_${hojeISO()}`;

    setVerificandoCpf(true);
    try {
      // Guarda-corpo contra reabrir um turno já concluído (chegada + saída
      // já registradas hoje) — sem isso, ao escanear o QR de novo depois de
      // já ter saído, o fluxo trataria como uma chegada nova (a consulta
      // abaixo em confirmarCpf só acha presença ABERTA) e criaria um 2º
      // registro pro mesmo turno/dia, poluindo o relatório de presença.
      const fechadaSnap = await getDocs(
        query(
          collection(db, 'presencas'),
          where('clienteId', '==', clienteId),
          where('colaboradorId', '==', colaboradorEscolhido.id),
          where('turnoId', '==', turno.id),
          where('data', '==', hojeISO())
        )
      );
      if (fechadaSnap.docs.some((d) => d.data().dataHoraSaida)) {
        setMensagemBloqueio(`Você já registrou chegada e saída no turno ${turno.nome} hoje.`);
        setEtapa('bloqueado');
        return;
      }

      const solicitacaoSnap = await getDoc(doc(db, 'solicitacoesPresenca', solicitacaoId));
      if (solicitacaoSnap.exists()) {
        const solicitacao = solicitacaoSnap.data();
        if (solicitacao.status === 'negada') {
          setMensagemBloqueio('Sua solicitação de presença foi negada pela liderança. Fale com o Administrativo.');
          setEtapa('bloqueado');
          return;
        }
        if (solicitacao.status === 'aprovada' && !solicitacao.consumidaEm) {
          setTurnoId(turno.id);
          setSolicitacaoAprovadaId(solicitacaoId);
          setEtapa('selfie');
          return;
        }
        if (solicitacao.status === 'pendente') {
          setEtapa('aguardandoAutorizacao');
          return;
        }
        // status 'aprovada' mas já consumida (2ª tentativa depois de já ter
        // gravado a presença) — cai no fluxo normal abaixo.
      }

      const statusJanela = statusJanelaEntrada(turno.horaInicio);
      if (statusJanela === 'antes') {
        setMensagemBloqueio(
          `O turno ${turno.nome} começa às ${turno.horaInicio}${
            turno.horaFim ? ` (até ${turno.horaFim})` : ''
          }. Você pode confirmar a chegada a partir de 10 minutos antes.`
        );
        setEtapa('bloqueado');
        return;
      }
      if (statusJanela === 'atraso') {
        await setDoc(doc(db, 'solicitacoesPresenca', solicitacaoId), {
          colaboradorId: colaboradorEscolhido.id,
          colaboradorNome: colaboradorEscolhido.nome,
          cpf: normalizarCpf(colaboradorEscolhido.cpf),
          clienteId,
          clienteNome: cliente.nome,
          turnoId: turno.id,
          turnoNome: turno.nome,
          horaInicioTurno: turno.horaInicio,
          data: hojeISO(),
          minutosAtraso: minutosDesdeInicioTurno(turno.horaInicio),
          status: 'pendente',
          solicitadoEm: serverTimestamp(),
          resolvidoPor: null,
          resolvidoPorNome: null,
          resolvidoEm: null,
          consumidaEm: null,
          presencaId: null
        });
        setEtapa('aguardandoAutorizacao');
        return;
      }

      // 'normal' ou 'sem_horario' (turno sem horaInicio cadastrado, não
      // bloqueia por erro de cadastro) — segue o fluxo já existente.
      setTurnoId(turno.id);
      setEtapa('selfie');
    } catch (e) {
      setErro('Falha ao verificar o turno. Verifique sua conexão e tente novamente.');
    } finally {
      setVerificandoCpf(false);
    }
  };

  const confirmarCpf = async () => {
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
    setModo('entrada');

    // Detecta sozinho se é chegada ou saída: se já existe uma presença de
    // hoje, neste Cliente/Local, sem `dataHoraSaida`, o próximo registro
    // deste CPF é a saída dela — sem escolha manual (decisão confirmada
    // com o Pablo via AskUserQuestion).
    setVerificandoCpf(true);
    try {
      const abertaSnap = await getDocs(
        query(
          collection(db, 'presencas'),
          where('clienteId', '==', clienteId),
          where('colaboradorId', '==', encontrado.id),
          where('data', '==', hojeISO())
        )
      );
      const abertas = abertaSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => !p.dataHoraSaida)
        .sort((a, b) => (b.dataHoraCheckin?.toMillis?.() || 0) - (a.dataHoraCheckin?.toMillis?.() || 0));

      if (abertas.length > 0) {
        setVerificandoCpf(false);
        iniciarFluxoSaida(abertas[0]);
        return;
      }
    } catch (e) {
      setErro('Falha ao verificar seu status. Verifique sua conexão e tente novamente.');
      setVerificandoCpf(false);
      return;
    }
    setVerificandoCpf(false);

    if (turnosDisponiveis.length !== 1) {
      setEtapa('turno');
      return;
    }
    await avaliarJanelaEntrada(turnosDisponiveis[0], encontrado);
  };

  const confirmarTurno = async () => {
    if (!turnoId) {
      setErro('Selecione o turno.');
      return;
    }
    const turno = turnosDisponiveis.find((t) => t.id === turnoId);
    if (!turno) {
      setErro('Turno inválido — selecione novamente.');
      return;
    }
    setErro('');
    await avaliarJanelaEntrada(turno, colaborador);
  };

  const confirmarJustificativaSaida = () => {
    if (!justificativaSaida.trim()) {
      setErro('Explique o motivo pra continuar.');
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
          `Você está a ${Math.round(distancia)}m do local — precisa estar no Cliente/Local pra confirmar ${
            modo === 'saida' ? 'a saída' : 'presença'
          }.`
        );
        setCapturandoGeo(false);
        return;
      }
      if (modo === 'saida') {
        await salvarSaida({ lat, lng, distancia });
      } else {
        await salvarPresenca({ lat, lng, distancia });
      }
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
        fotoPath,
        // Campos de saída começam vazios — preenchidos só quando o mesmo
        // colaborador registrar a saída depois (ver salvarSaida()).
        dataHoraSaida: null,
        saidaJustificativa: null,
        saidaTipoJustificativa: null
      });
      // Se essa presença só foi possível porque a liderança aprovou uma
      // solicitação de atraso, marca a solicitação como consumida — best
      // effort, não trava a tela de sucesso por causa disso.
      if (solicitacaoAprovadaId) {
        updateDoc(doc(db, 'solicitacoesPresenca', solicitacaoAprovadaId), {
          consumidaEm: serverTimestamp(),
          presencaId: novoDocRef.id
        }).catch(() => {});
      }
      setEtapa('sucesso');
    } catch (e) {
      setErro('Falha ao gravar a presença. Verifique sua conexão e tente novamente.');
    } finally {
      setSalvando(false);
      setCapturandoGeo(false);
    }
  };

  // Atualiza a MESMA presença aberta (não cria um doc novo) com os dados
  // de saída — geo/selfie próprios de saída, pra não sobrescrever os de
  // chegada, e a justificativa (quando exigida) junto, pra tudo compor o
  // mesmo registro no relatório de presença.
  const salvarSaida = async ({ lat, lng, distancia }) => {
    setSalvando(true);
    setErro('');
    try {
      let fotoPathSaida = null;
      if (guardarSelfie) {
        fotoPathSaida = `presencas/${presencaAbertaId}/selfie-saida.jpg`;
        await uploadBytes(ref(storage, fotoPathSaida), selfie);
      }
      await updateDoc(doc(db, 'presencas', presencaAbertaId), {
        dataHoraSaida: serverTimestamp(),
        geoLatSaida: lat,
        geoLngSaida: lng,
        distanciaMetrosSaida: Math.round(distancia),
        fotoPathSaida,
        saidaJustificativa: justificativaSaida.trim() || null,
        saidaTipoJustificativa: tipoJustificativaSaida,
        saidaMinutosDesvio: minutosDesvioSaida
      });
      setEtapa('sucesso');
    } catch (e) {
      setErro('Falha ao gravar a saída. Verifique sua conexão e tente novamente.');
    } finally {
      setSalvando(false);
      setCapturandoGeo(false);
    }
  };

  // Reseta o wizard pro início — usado pelo botão "Sair" da tela de
  // "aguardando autorização" (pedido do Pablo: dar a opção de sair e
  // avisar que dá pra tentar de novo em 10min).
  const reiniciar = () => {
    setEtapa('cpf');
    setCpfDigitado('');
    setColaborador(null);
    setTurnoId('');
    setSelfie(null);
    setErro('');
    setMensagemBloqueio('');
    setSolicitacaoAprovadaId(null);
    setModo('entrada');
    setPresencaAbertaId(null);
    setTurnoDaSaida(null);
    setTipoJustificativaSaida(null);
    setMinutosDesvioSaida(null);
    setJustificativaSaida('');
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

  const turnoNome = (id) => turnosDisponiveis.find((t) => t.id === id)?.nome || turnoDaSaida?.nome || '';

  return (
    <div style={styles.pagina}>
      <div style={styles.card}>
        <h2 style={styles.titulo}>{modo === 'saida' && etapa !== 'cpf' ? 'Registrar saída' : 'Confirmar presença'}</h2>
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
            <p style={styles.textoAjuda}>Já confirmou chegada hoje? Digite o CPF de novo pra registrar a saída.</p>
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarCpf} disabled={verificandoCpf}>
              {verificandoCpf ? 'Verificando...' : 'Continuar'}
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
            <button style={styles.botaoGrande} onClick={confirmarTurno} disabled={verificandoCpf}>
              {verificandoCpf ? 'Verificando...' : 'Continuar'}
            </button>
          </>
        )}

        {etapa === 'justificativaSaida' && (
          <>
            <p style={styles.textoInfo}>
              {tipoJustificativaSaida === 'antecipada' ? (
                <>
                  Você está saindo <strong>antes</strong> do fim do turno {turnoDaSaida?.nome} (previsto pra{' '}
                  {turnoDaSaida?.horaFim}), {Math.abs(minutosDesvioSaida)}min antes. Saídas antecipadas de mais de
                  10min podem gerar <strong>desconto no pagamento</strong>. Explique o motivo:
                </>
              ) : (
                <>
                  Você está saindo <strong>depois</strong> do fim do turno {turnoDaSaida?.nome} (previsto pra{' '}
                  {turnoDaSaida?.horaFim}), {minutosDesvioSaida}min de tempo extra. Esse tempo precisa ser justificado
                  pra ser <strong>cobrado do cliente</strong>. Explique o motivo:
                </>
              )}
            </p>
            <label style={styles.rotulo}>
              Motivo *
              <textarea
                style={styles.textarea}
                rows={4}
                value={justificativaSaida}
                onChange={(e) => setJustificativaSaida(e.target.value)}
                placeholder="Explique o motivo..."
                autoFocus
              />
            </label>
            {erro && <div style={styles.erroTexto}>❌ {erro}</div>}
            <button style={styles.botaoGrande} onClick={confirmarJustificativaSaida}>
              Continuar
            </button>
          </>
        )}

        {etapa === 'selfie' && (
          <>
            <p style={styles.textoInfo}>
              {modo === 'saida' ? 'Agora tire uma selfie pra confirmar sua saída.' : 'Agora tire uma selfie pra confirmar quem é você.'}
            </p>
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
              Por último, confirme que você está {modo === 'saida' ? 'saindo de' : 'em'} <strong>{cliente.nome}</strong>.
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
              {modo === 'saida' ? `Saída registrada, ${colaborador.nome}!` : `Presença confirmada, ${colaborador.nome}!`}
              <br />
              {cliente.nome} — {turnoNome(turnoId)}
              {modo === 'saida' && tipoJustificativaSaida && (
                <>
                  <br />
                  <span style={{ fontSize: 13, fontWeight: 400, color: '#666' }}>Justificativa registrada.</span>
                </>
              )}
            </p>
          </div>
        )}

        {etapa === 'bloqueado' && (
          <div style={styles.sucesso}>
            <p style={styles.sucessoIcone}>❌</p>
            <p style={{ ...styles.sucessoTexto, color: '#D32F2F' }}>{mensagemBloqueio}</p>
          </div>
        )}

        {etapa === 'aguardandoAutorizacao' && (
          <div style={styles.sucesso}>
            <p style={styles.sucessoIcone}>⏳</p>
            <p style={styles.sucessoTexto}>
              Solicitação de presença em atraso enviada, aguarde 10min para liberação pela liderança!
            </p>
            <p style={{ fontSize: 13, color: '#666', marginTop: -6 }}>
              Você pode sair e tentar de novo daqui a 10 minutos.
            </p>
            <button style={styles.botaoSecundario} onClick={reiniciar}>
              Sair
            </button>
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
  textoAjuda: { fontSize: 12, color: '#999', textAlign: 'center', margin: '-10px 0 16px' },

  rotulo: { display: 'flex', flexDirection: 'column', fontSize: 14, fontWeight: 600, color: '#444', gap: 6, marginBottom: 16 },
  input: { padding: '13px 12px', borderRadius: 8, border: '1px solid #CCC', fontSize: 16, fontWeight: 400, background: '#FFF' },
  textarea: {
    padding: '13px 12px',
    borderRadius: 8,
    border: '1px solid #CCC',
    fontSize: 16,
    fontWeight: 400,
    background: '#FFF',
    fontFamily: 'inherit',
    resize: 'vertical'
  },

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
  botaoSecundario: {
    width: '100%',
    padding: 14,
    border: '1px solid #CCC',
    borderRadius: 8,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 15,
    background: '#FFF',
    color: '#444',
    marginTop: 14
  },

  sucesso: { textAlign: 'center', padding: '20px 0' },
  sucessoIcone: { fontSize: 48, margin: 0 },
  sucessoTexto: { fontSize: 17, color: NAVY, fontWeight: 600, lineHeight: 1.5 }
};
