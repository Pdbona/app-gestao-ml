// Gera o "romaneio" (relatório em PDF) de uma operação do Coletor —
// mesmo conceito do app da Superior Transportes: um documento por
// operação com os dados + as fotos de início/fim, pra imprimir ou
// mandar pro cliente. 100% no navegador (jsPDF), sem servidor.
//
// NÃO baixa mais sozinho — quem chama decide quando (ver o modal de
// prévia em DashboardTab.jsx, a pedido do Pablo: "gerar em tela e dar
// opção pra PDF, não gerar PDF direto").
import { jsPDF } from 'jspdf';

export const NAVY = '#1E3A5F';
export const ORANGE = '#FF6B00';
const LOGO_ML_LARGURA = 26;
const LOGO_ML_ALTURA = 21; // proporção real do PNG (700x564)

function formatarDataHora(valor) {
  if (!valor) return '-';
  const ms = valor?.toMillis ? valor.toMillis() : new Date(valor).getTime();
  if (!ms) return '-';
  return new Date(ms).toLocaleString('pt-BR');
}

// Descobre a proporção real (largura/altura) de uma imagem base64 —
// necessário porque `docPdf.addImage` NÃO respeita proporção sozinho, ele
// estica pra caber exatamente no w/h passado (foi isso que deixou a logo
// do cliente distorcida quando ela não é quadrada).
function carregarDimensoesImagem(base64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ largura: img.naturalWidth, altura: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = base64;
  });
}

// "object-fit: contain" manual — encaixa largura×altura dentro de um
// quadrado `tamanho`, preservando a proporção (nunca estica).
function encaixarProporcional(largura, altura, tamanho) {
  if (!largura || !altura) return { w: tamanho, h: tamanho };
  const escala = Math.min(tamanho / largura, tamanho / altura);
  return { w: largura * escala, h: altura * escala };
}

// Exportado — reaproveitado por relatorioPdf.js pra manter o mesmo
// cabeçalho (logos + faixa laranja) nos dois PDFs. Assíncrono porque
// precisa carregar a imagem da logo do cliente antes de saber a
// proporção certa pra desenhar (ver `carregarDimensoesImagem` acima).
export async function adicionarCabecalho(docPdf, titulo, subtitulo, logoMlBase64, logoClienteBase64) {
  const margemEsquerda = 14;
  const margemDireita = 196;
  let y = 16;

  if (logoMlBase64) {
    try {
      docPdf.addImage(logoMlBase64, 'PNG', margemEsquerda, 8, LOGO_ML_LARGURA, LOGO_ML_ALTURA);
    } catch (e) {
      // Logo corrompida — segue sem ela.
    }
  }
  if (logoClienteBase64) {
    try {
      const tamanho = 22;
      const dim = await carregarDimensoesImagem(logoClienteBase64);
      const { w, h } = encaixarProporcional(dim?.largura, dim?.altura, tamanho);
      // Centralizado no mesmo "slot" de 22x22 que antes era ocupado à
      // força — só o desenho agora respeita a proporção real da imagem.
      const x = margemDireita - tamanho + (tamanho - w) / 2;
      const yImg = 8 + (tamanho - h) / 2;
      docPdf.addImage(logoClienteBase64, 'JPEG', x, yImg, w, h);
    } catch (e) {
      // idem
    }
  }

  docPdf.setTextColor(NAVY);
  docPdf.setFontSize(16);
  docPdf.setFont(undefined, 'bold');
  docPdf.text(titulo, 105, y, { align: 'center' });
  y += 6;
  docPdf.setFont(undefined, 'normal');
  docPdf.setFontSize(10);
  docPdf.setTextColor('#666666');
  docPdf.text(subtitulo, 105, y, { align: 'center' });

  docPdf.setDrawColor(ORANGE);
  docPdf.setLineWidth(1.2);
  docPdf.line(margemEsquerda, 34, margemDireita, 34);
  docPdf.setTextColor('#000000');
  docPdf.setDrawColor('#000000');
  docPdf.setLineWidth(0.2);

  return 42;
}

function adicionarGradeFotos(docPdf, titulo, fotos, yInicial) {
  let y = yInicial;
  const margemEsquerda = 14;
  const larguraFoto = 55;
  const alturaFoto = 55;
  const gap = 6;
  const porLinha = 3;

  if (fotos.length === 0) return y;

  if (y + 10 > 280) {
    docPdf.addPage();
    y = 20;
  }
  docPdf.setFontSize(11);
  docPdf.setFont(undefined, 'bold');
  docPdf.text(titulo, margemEsquerda, y);
  docPdf.setFont(undefined, 'normal');
  y += 4;

  fotos.forEach((foto, i) => {
    const coluna = i % porLinha;
    if (coluna === 0 && i > 0) y += alturaFoto + gap;
    if (y + alturaFoto > 285) {
      docPdf.addPage();
      y = 20;
    }
    const x = margemEsquerda + coluna * (larguraFoto + gap);
    try {
      docPdf.addImage(foto.base64, 'JPEG', x, y, larguraFoto, alturaFoto);
    } catch (e) {
      // Foto corrompida/formato inesperado — pula ela, não trava o PDF inteiro.
    }
  });

  return y + alturaFoto + 10;
}

export async function gerarRomaneioPdf({
  clienteNome,
  tipoNome,
  fluxoNome,
  documentoProcesso,
  qtdVolumes,
  qtdMdo,
  usuarioNome,
  inicio,
  fim,
  tempoRealMinutos,
  observacao,
  fotosInicio,
  fotosFim,
  logoMlBase64,
  logoClienteBase64
}) {
  const docPdf = new jsPDF();
  const margemEsquerda = 14;

  let y = await adicionarCabecalho(docPdf, 'Romaneio de Operação', clienteNome, logoMlBase64, logoClienteBase64);

  const linha = (rotulo, valor) => {
    docPdf.setFont(undefined, 'bold');
    docPdf.setFontSize(10);
    docPdf.text(`${rotulo}:`, margemEsquerda, y);
    docPdf.setFont(undefined, 'normal');
    docPdf.text(String(valor ?? '-'), margemEsquerda + 42, y);
    y += 7;
  };

  linha('Tipo de Operação', tipoNome);
  linha('Operação', fluxoNome);
  linha('Documento', documentoProcesso);
  linha('Qtd. de volumes', qtdVolumes);
  linha('Qtd. de MdO', qtdMdo);
  linha('Colaborador', usuarioNome);
  linha('Início', formatarDataHora(inicio));
  linha('Fim', formatarDataHora(fim));
  linha('Tempo real', tempoRealMinutos ? `${tempoRealMinutos} min` : '-');
  if (observacao) linha('Observação', observacao);

  y += 4;
  y = adicionarGradeFotos(docPdf, 'Fotos de início', fotosInicio, y);
  y = adicionarGradeFotos(docPdf, 'Fotos de fim', fotosFim, y);

  const nomeArquivo = `romaneio-${(documentoProcesso || 'operacao').replace(/\W+/g, '-')}.pdf`;
  docPdf.save(nomeArquivo);
}
