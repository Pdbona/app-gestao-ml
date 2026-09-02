// Gera o "romaneio" (relatório em PDF) de uma operação do Coletor —
// mesmo conceito do app da Superior Transportes: um documento por
// operação com os dados + as fotos de início/fim, pra imprimir ou
// mandar pro cliente. 100% no navegador (jsPDF), sem servidor.
import { jsPDF } from 'jspdf';

function formatarDataHora(valor) {
  if (!valor) return '-';
  const ms = valor?.toMillis ? valor.toMillis() : new Date(valor).getTime();
  if (!ms) return '-';
  return new Date(ms).toLocaleString('pt-BR');
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

export function gerarRomaneioPdf({
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
  fotosFim
}) {
  const docPdf = new jsPDF();
  const margemEsquerda = 14;
  let y = 20;

  docPdf.setFontSize(16);
  docPdf.setFont(undefined, 'bold');
  docPdf.text('Romaneio de Operação', margemEsquerda, y);
  docPdf.setFont(undefined, 'normal');
  docPdf.setFontSize(10);
  docPdf.text('ML Serviços — Sistema de Gestão Operacional', margemEsquerda, y + 6);
  y += 18;

  const linha = (rotulo, valor) => {
    docPdf.setFont(undefined, 'bold');
    docPdf.setFontSize(10);
    docPdf.text(`${rotulo}:`, margemEsquerda, y);
    docPdf.setFont(undefined, 'normal');
    docPdf.text(String(valor ?? '-'), margemEsquerda + 42, y);
    y += 7;
  };

  linha('Cliente/Local', clienteNome);
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
