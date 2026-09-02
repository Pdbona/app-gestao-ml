import React, { useEffect, useState } from 'react';
import { db } from '../../firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import QRCode from 'qrcode';
import { ui, NAVY } from '../../lib/styles';
import { redimensionarImagemParaBase64 } from '../../lib/imagem';

// URL que o QR Code do Cliente/Local aponta — cai direto na tela pública
// de check-in (CheckinPublicScreen.jsx via App.jsx), sem passar pelo
// login do sistema. `?checkin=<id>` funciona em qualquer host estático
// (GitHub Pages incluso) sem precisar de rota por path.
function montarUrlCheckin(clienteId) {
  const base = `${window.location.origin}${process.env.PUBLIC_URL}/`;
  return `${base}?checkin=${clienteId}`;
}

const CLIENTE_VAZIO = {
  nome: '',
  cep: '',
  logradouro: '',
  bairro: '',
  cidade: '',
  uf: '',
  numero: '',
  status: 'ativo',
  geoLat: null,
  geoLng: null,
  geoCapturadoEm: null,
  logoBase64: null
};

// CEP só dá o endereço "geral" (rua/bairro/cidade) — não a coordenada exata.
// Como a ML atende o mesmo cliente em locais diferentes (às vezes até no
// mesmo CEP, mas o trabalho acontece em outro ponto), a geolocalização
// precisa ser capturada de verdade no local (GPS do navegador de quem está
// cadastrando), não deduzida só do CEP.
async function buscarEnderecoPorCep(cepDigitado) {
  const cepLimpo = cepDigitado.replace(/\D/g, '');
  if (cepLimpo.length !== 8) return null;
  const resp = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
  if (!resp.ok) return null;
  const data = await resp.json();
  if (data.erro) return null;
  return {
    logradouro: data.logradouro || '',
    bairro: data.bairro || '',
    cidade: data.localidade || '',
    uf: data.uf || ''
  };
}

function capturarGeolocalizacao() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não é suportada neste navegador.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

export default function ClientesCadastro({ permissoes }) {
  const perm = permissoes.cadastros?.clientes || {};

  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [formAberto, setFormAberto] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState(CLIENTE_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [capturandoGeo, setCapturandoGeo] = useState(false);
  const [processandoLogo, setProcessandoLogo] = useState(false);
  const [erro, setErro] = useState('');
  const [qrCliente, setQrCliente] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [gerandoQr, setGerandoQr] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'clientes'), orderBy('nome'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      () => setCarregando(false)
    );
    return () => unsubscribe();
  }, []);

  const abrirNovo = () => {
    setForm(CLIENTE_VAZIO);
    setEditandoId(null);
    setFormAberto(true);
    setErro('');
  };

  const abrirEdicao = (cliente) => {
    setForm({
      nome: cliente.nome || '',
      cep: cliente.cep || '',
      logradouro: cliente.logradouro || '',
      bairro: cliente.bairro || '',
      cidade: cliente.cidade || '',
      uf: cliente.uf || '',
      numero: cliente.numero || '',
      status: cliente.status || 'ativo',
      geoLat: cliente.geoLat ?? null,
      geoLng: cliente.geoLng ?? null,
      geoCapturadoEm: cliente.geoCapturadoEm ?? null,
      logoBase64: cliente.logoBase64 ?? null
    });
    setEditandoId(cliente.id);
    setFormAberto(true);
    setErro('');
  };

  const cancelar = () => {
    setFormAberto(false);
    setEditandoId(null);
    setForm(CLIENTE_VAZIO);
    setErro('');
  };

  const handleCepBlur = async () => {
    if (!form.cep.trim()) return;
    setBuscandoCep(true);
    setErro('');
    try {
      const endereco = await buscarEnderecoPorCep(form.cep);
      if (endereco) {
        setForm((f) => ({ ...f, ...endereco }));
      } else {
        setErro('CEP não encontrado — confira o número ou preencha o endereço manualmente.');
      }
    } catch (e) {
      setErro('Falha ao buscar o CEP. Preencha o endereço manualmente.');
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleCapturarGeo = async () => {
    setCapturandoGeo(true);
    setErro('');
    try {
      const { lat, lng } = await capturarGeolocalizacao();
      setForm((f) => ({ ...f, geoLat: lat, geoLng: lng, geoCapturadoEm: new Date().toISOString() }));
    } catch (e) {
      setErro('Não foi possível capturar a localização. Verifique a permissão de localização do navegador.');
    } finally {
      setCapturandoGeo(false);
    }
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois de remover
    if (!file) return;
    setProcessandoLogo(true);
    setErro('');
    try {
      const dataUrl = await redimensionarImagemParaBase64(file);
      setForm((f) => ({ ...f, logoBase64: dataUrl }));
    } catch (e2) {
      setErro(e2.message || 'Não foi possível processar essa imagem.');
    } finally {
      setProcessandoLogo(false);
    }
  };

  const removerLogo = () => setForm((f) => ({ ...f, logoBase64: null }));

  const salvar = async () => {
    if (!form.nome.trim()) {
      setErro('Informe o nome do cliente.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      if (editandoId) {
        await updateDoc(doc(db, 'clientes', editandoId), { ...form, atualizadoEm: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'clientes'), { ...form, criadoEm: serverTimestamp() });
      }
      cancelar();
    } catch (e) {
      setErro('Falha ao salvar na nuvem. Verifique a conexão com o Firebase e tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (cliente) => {
    if (!window.confirm(`Excluir o cliente "${cliente.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteDoc(doc(db, 'clientes', cliente.id));
    } catch (e) {
      setErro('Falha ao excluir. Tente novamente.');
    }
  };

  const gerarQr = async (cliente) => {
    setGerandoQr(true);
    setQrCliente(cliente);
    try {
      const url = await QRCode.toDataURL(montarUrlCheckin(cliente.id), { width: 320, margin: 1 });
      setQrDataUrl(url);
    } catch (e) {
      setErro('Falha ao gerar o QR Code.');
      setQrCliente(null);
    } finally {
      setGerandoQr(false);
    }
  };

  const fecharQr = () => {
    setQrCliente(null);
    setQrDataUrl('');
  };

  const enderecoResumo = (c) => {
    const partes = [c.logradouro, c.numero].filter(Boolean).join(', ');
    const cidadeUf = [c.cidade, c.uf].filter(Boolean).join('/');
    return [partes, c.bairro, cidadeUf].filter(Boolean).join(' — ') || '-';
  };

  return (
    <div>
      <div style={ui.sectionHeaderRow}>
        <h2 style={ui.sectionTitle}>Clientes</h2>
        {perm.criar && !formAberto && (
          <button style={ui.primaryButton} onClick={abrirNovo}>
            ➕ Novo cliente
          </button>
        )}
      </div>

      {erro && <div style={ui.erro}>❌ {erro}</div>}

      {formAberto && (
        <div style={ui.formCard}>
          <h3 style={{ marginTop: 0 }}>{editandoId ? 'Editar cliente' : 'Novo cliente'}</h3>
          <p style={ui.placeholderNote}>
            A ML atende o mesmo cliente em locais diferentes — se for outro endereço/obra, cadastre
            um novo registro (mesmo nome, local diferente).
          </p>

          <div style={ui.formGrid}>
            <label style={ui.label}>
              Nome do Cliente *
              <input style={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label style={ui.label}>
              Status
              <select style={ui.input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </label>
          </div>

          <h4 style={{ marginBottom: 8, color: '#1E3A5F' }}>Local</h4>
          <div style={ui.formGrid}>
            <label style={ui.label}>
              CEP
              <input
                style={ui.input}
                value={form.cep}
                onChange={(e) => setForm({ ...form, cep: e.target.value })}
                onBlur={handleCepBlur}
                placeholder="00000-000"
              />
            </label>
            <label style={ui.label}>
              Número
              <input style={ui.input} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </label>
            <label style={ui.label}>
              Logradouro
              <input
                style={ui.input}
                value={form.logradouro}
                onChange={(e) => setForm({ ...form, logradouro: e.target.value })}
              />
            </label>
            <label style={ui.label}>
              Bairro
              <input style={ui.input} value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </label>
            <label style={ui.label}>
              Cidade
              <input style={ui.input} value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </label>
            <label style={ui.label}>
              UF
              <input style={ui.input} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })} maxLength={2} />
            </label>
          </div>
          {buscandoCep && <p style={ui.placeholderNote}>Buscando endereço pelo CEP...</p>}

          <div style={{ marginTop: 6, marginBottom: 16 }}>
            <button type="button" style={ui.secondaryButton} onClick={handleCapturarGeo} disabled={capturandoGeo}>
              {capturandoGeo ? 'Capturando...' : '📍 Capturar localização atual'}
            </button>
            {form.geoLat != null && form.geoLng != null && (
              <span style={{ marginLeft: 12, fontSize: 13, color: '#1E7A34' }}>
                ✅ Localização capturada ({form.geoLat.toFixed(5)}, {form.geoLng.toFixed(5)})
              </span>
            )}
          </div>

          <h4 style={{ marginBottom: 8, color: '#1E3A5F' }}>Logo do cliente</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            {form.logoBase64 && (
              <img src={form.logoBase64} alt="Logo do cliente" style={styles.logoPreview} />
            )}
            <div>
              <label style={ui.secondaryButton}>
                {processandoLogo ? 'Processando...' : form.logoBase64 ? 'Trocar logo' : '🖼️ Escolher logo'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleLogoChange}
                  disabled={processandoLogo}
                />
              </label>
              {form.logoBase64 && (
                <button type="button" style={{ ...ui.linkButton, marginLeft: 10 }} onClick={removerLogo}>
                  Remover
                </button>
              )}
              <p style={{ ...ui.placeholderNote, marginTop: 6, marginBottom: 0 }}>
                Usada nos cards do Dashboard e em outros lugares do sistema. A imagem é comprimida
                automaticamente.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button style={ui.primaryButton} onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <button style={ui.secondaryButton} onClick={cancelar} disabled={salvando}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {carregando ? (
        <p>Carregando clientes...</p>
      ) : clientes.length === 0 ? (
        <p style={ui.placeholderNote}>Nenhum cliente cadastrado ainda.</p>
      ) : (
        <div style={ui.tableWrapper}>
          <table style={ui.table}>
            <thead>
              <tr>
                <th style={ui.th}>Nome do Cliente</th>
                <th style={ui.th}>Local</th>
                <th style={ui.th}>Geolocalização</th>
                <th style={ui.th}>Status</th>
                <th style={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td style={ui.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {c.logoBase64 && <img src={c.logoBase64} alt="" style={styles.logoThumb} />}
                      {c.nome}
                    </div>
                  </td>
                  <td style={ui.td}>{enderecoResumo(c)}</td>
                  <td style={ui.td}>
                    {c.geoLat != null ? (
                      <span style={{ ...ui.badge, ...ui.badgeVerde }}>Capturada</span>
                    ) : (
                      <span style={{ ...ui.badge, ...ui.badgeCinza }}>Pendente</span>
                    )}
                  </td>
                  <td style={ui.td}>
                    <span style={{ ...ui.badge, ...(c.status === 'ativo' ? ui.badgeVerde : ui.badgeCinza) }}>
                      {c.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={ui.td}>
                    {perm.editar && (
                      <button style={ui.linkButton} onClick={() => abrirEdicao(c)}>
                        Editar
                      </button>
                    )}
                    <button style={ui.linkButton} onClick={() => gerarQr(c)}>
                      🔗 QR Code
                    </button>
                    {perm.deletar && (
                      <button style={{ ...ui.linkButton, color: '#D32F2F' }} onClick={() => excluir(c)}>
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {qrCliente && (
        <div style={styles.overlay} onClick={fecharQr}>
          <div style={styles.qrModal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, color: NAVY }}>QR Code — {qrCliente.nome}</h3>
            <p style={ui.placeholderNote}>
              Imprima e fixe no Cliente/Local. O colaborador escaneia pra confirmar presença.
            </p>
            {gerandoQr ? (
              <p>Gerando...</p>
            ) : (
              qrDataUrl && <img src={qrDataUrl} alt={`QR Code de ${qrCliente.nome}`} style={styles.qrImg} />
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              {qrDataUrl && (
                <a
                  href={qrDataUrl}
                  download={`qrcode-${qrCliente.nome.replace(/\s+/g, '-').toLowerCase()}.png`}
                  style={{ ...ui.primaryButton, textDecoration: 'none', display: 'inline-block' }}
                >
                  ⬇️ Baixar PNG
                </a>
              )}
              <button style={ui.secondaryButton} onClick={fecharQr}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  qrModal: {
    background: '#FFF',
    borderRadius: 10,
    padding: 28,
    maxWidth: 380,
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.25)'
  },
  qrImg: { width: '100%', maxWidth: 280, height: 'auto' },
  logoPreview: {
    width: 64,
    height: 64,
    objectFit: 'contain',
    borderRadius: 8,
    border: '1px solid #E5E5E5',
    background: '#FAFAFA'
  },
  logoThumb: { width: 28, height: 28, objectFit: 'contain', borderRadius: 4, background: '#FAFAFA' }
};
