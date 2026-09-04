// PDF do relatório por período (RelatoriosScreen.jsx) — cabeçalho com
// logos (reaproveitado de romaneio.js), resumo numérico e os 4 gráficos
// como imagem (canvas.toDataURL() de cada ChartCanvas).
import { jsPDF } from 'jspdf';
import { adicionarCabecalho, NAVY } from './romaneio';
import { formatarDataBr } from './data';
import { formatarCpf } from './cpf';

function adicionarGrafico(docPdf, titulo, dataUrlImagem, y) {
  const margemEsquerda = 14;
  const largura = 182;
  const altura = 70;

  if (y + altura + 12 > 285) {
    docPdf.addPage();
    y = 20;
  }
  docPdf.setTextColor(NAVY);
  docPdf.setFont(undefined, 'bold');
  docPdf.setFontSize(11);
  docPdf.text(titulo, margemEsquerda, y);
  docPdf.setTextColor('#000000');
  y += 4;
  if (dataUrlImagem) {
    try {
      docPdf.addImage(dataUrlImagem, 'PNG', margemEsquerda, y, largura, altura);
    } catch (e) {
      // Gráfico sem dados/canvas vazio — segue sem travar o PDF.
    }
  }
  return y + altura + 10;
}

export async function gerarRelatorioPdf({
  clienteNome,
  dataInicio,
  dataFim,
  resumo,
  imagensGraficos,
  logoMlBase64,
  logoClienteBase64
}) {
  const docPdf = new jsPDF();
  const margemEsquerda = 14;

  let y = await adicionarCabecalho(
    docPdf,
    'Relatório Operacional',
    `${clienteNome} — ${formatarDataBr(dataInicio)} a ${formatarDataBr(dataFim)}`,
    logoMlBase64,
    logoClienteBase64
  );

  docPdf.setFont(undefined, 'bold');
  docPdf.setFontSize(10);
  const resumoTexto = [
    `Operações: ${resumo.totalOperacoes}`,
    `Planejado: ${resumo.totalPlanejado}`,
    `Presente: ${resumo.totalPresente}`,
    `Absenteísmo: ${resumo.absenteismoPct}%`
  ].join('    ·    ');
  docPdf.text(resumoTexto, margemEsquerda, y);
  docPdf.setFont(undefined, 'normal');
  y += 10;

  y = adicionarGrafico(docPdf, 'Operações por dia', imagensGraficos.porDia, y);
  y = adicionarGrafico(docPdf, 'Operações por Tipo de Operação', imagensGraficos.porTipo, y);
  y = adicionarGrafico(docPdf, 'Operações por Operação (fluxo)', imagensGraficos.porFluxo, y);
  y = adicionarGrafico(docPdf, 'Absenteísmo (planejado × presente)', imagensGraficos.absenteismo, y);

  const nomeArquivo = `relatorio-${(clienteNome || 'cliente').replace(/\W+/g, '-').toLowerCase()}-${dataInicio}-a-${dataFim}.pdf`;
  docPdf.save(nomeArquivo);
}

// Colunas da tabela de presença — Data / Nome Completo / CPF / Turno /
// Hora de Presença, nessa ordem (pedido do Pablo). Larguras calibradas
// pra caber tudo entre as margens de 14 e 196mm (A4 retrato).
const COLUNAS_PRESENCA = [
  { chave: 'data', rotulo: 'Data', x: 14, largura: 24 },
  { chave: 'nome', rotulo: 'Nome Completo', x: 40, largura: 58 },
  { chave: 'cpf', rotulo: 'CPF', x: 100, largura: 30 },
  { chave: 'turno', rotulo: 'Turno', x: 132, largura: 28 },
  { chave: 'hora', rotulo: 'Hora de Presença', x: 162, largura: 34 }
];

// Trunca com "…" se o texto não couber na largura da coluna — nunca deixa
// o jsPDF simplesmente sobrepor a coluna seguinte (ele não faz isso
// sozinho, ao contrário de HTML/CSS).
function truncarParaLargura(docPdf, texto, larguraMax) {
  const original = String(texto ?? '-');
  if (docPdf.getTextWidth(original) <= larguraMax) return original;
  let cortado = original;
  while (cortado.length > 1 && docPdf.getTextWidth(`${cortado}…`) > larguraMax) {
    cortado = cortado.slice(0, -1);
  }
  return `${cortado}…`;
}

function desenharCabecalhoTabela(docPdf, y) {
  docPdf.setFont(undefined, 'bold');
  docPdf.setFontSize(9);
  docPdf.setTextColor(NAVY);
  COLUNAS_PRESENCA.forEach((c) => docPdf.text(c.rotulo, c.x, y));
  docPdf.setDrawColor('#CCCCCC');
  docPdf.setLineWidth(0.2);
  docPdf.line(14, y + 2, 196, y + 2);
  docPdf.setTextColor('#000000');
  docPdf.setDrawColor('#000000');
  docPdf.setFont(undefined, 'normal');
  return y + 8;
}

function periodoTurno(t) {
  return `${t.turnoHoraInicio || '--:--'}${t.turnoHoraFim ? ` às ${t.turnoHoraFim}` : ''}`;
}

// Linha de subtotal (itálico, cinza) — turno dentro de um dia, ou o
// subtotal do dia (negrito, cor NAVY). Quebra de página própria (o
// cabeçalho da coluna não precisa ser redesenhado aqui, já que uma linha
// de subtotal não é uma linha de dado — só o próximo dado redesenha).
function desenharSubtotal(docPdf, texto, y, negrito) {
  if (y + 7 > 285) {
    docPdf.addPage();
    y = 20;
  }
  docPdf.setFont(undefined, negrito ? 'bold' : 'italic');
  docPdf.setFontSize(negrito ? 10 : 9);
  docPdf.setTextColor(negrito ? NAVY : '#666666');
  docPdf.text(texto, 14, y);
  docPdf.setTextColor('#000000');
  docPdf.setFont(undefined, 'normal');
  return y + (negrito ? 8 : 6.5);
}

// PDF da lista de presença (RelatoriosScreen.jsx, seção "Presenças
// confirmadas") — pro cliente conferir quem confirmou presença no
// período, em forma de tabela de verdade (cabeçalho de coluna + linhas
// zebradas), com subtotal por turno (com o período do turno) e por dia,
// e o total geral do período + total geral por turno no final. Sem lib
// de tabela (o projeto não usa jspdf-autotable em lugar nenhum) —
// desenhado manualmente, redesenhando o cabeçalho da coluna sempre que
// vira página no meio dos dados.
export async function gerarRelatorioPresencaPdf({ clienteNome, dataInicio, dataFim, agrupado, logoMlBase64, logoClienteBase64 }) {
  const docPdf = new jsPDF();
  const margemEsquerda = 14;

  let y = await adicionarCabecalho(
    docPdf,
    'Lista de Presença',
    `${clienteNome} — ${formatarDataBr(dataInicio)} a ${formatarDataBr(dataFim)}`,
    logoMlBase64,
    logoClienteBase64
  );

  const nomeArquivo = `lista-presenca-${(clienteNome || 'cliente').replace(/\W+/g, '-').toLowerCase()}-${dataInicio}-a-${dataFim}.pdf`;

  if (agrupado.totalGeral === 0) {
    docPdf.setFontSize(11);
    docPdf.text('Nenhuma presença confirmada no período.', margemEsquerda, y);
    docPdf.save(nomeArquivo);
    return;
  }

  y = desenharCabecalhoTabela(docPdf, y);
  let indiceZebra = 0;

  agrupado.porDia.forEach((dia) => {
    dia.porTurno.forEach((turno) => {
      turno.pessoas.forEach((linha) => {
        if (y + 7 > 285) {
          docPdf.addPage();
          y = 20;
          y = desenharCabecalhoTabela(docPdf, y);
        }
        if (indiceZebra % 2 === 1) {
          docPdf.setFillColor('#F7F8FA');
          docPdf.rect(margemEsquerda, y - 4.2, 182, 6.2, 'F');
        }
        indiceZebra += 1;
        docPdf.setFontSize(9);
        docPdf.text(truncarParaLargura(docPdf, formatarDataBr(linha.data), 22), 14, y);
        docPdf.text(truncarParaLargura(docPdf, linha.colaboradorNome, 56), 40, y);
        docPdf.text(truncarParaLargura(docPdf, formatarCpf(linha.cpf), 28), 100, y);
        docPdf.text(truncarParaLargura(docPdf, linha.turnoNome, 26), 132, y);
        docPdf.text(
          linha.dataHoraCheckin?.toMillis
            ? new Date(linha.dataHoraCheckin.toMillis()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            : '--:--',
          162,
          y
        );
        y += 6.5;
      });
      y = desenharSubtotal(
        docPdf,
        `Subtotal ${turno.turnoNome} (${periodoTurno(turno)}): ${turno.pessoas.length} pessoa(s)`,
        y,
        false
      );
    });
    y = desenharSubtotal(docPdf, `Subtotal do dia ${formatarDataBr(dia.data)}: ${dia.subtotalDia} pessoa(s)`, y, true);
    y += 2;
  });

  // Totais gerais do período — sempre com uma linha separadora antes,
  // pra não parecer só mais um subtotal de dia.
  if (y + 24 > 285) {
    docPdf.addPage();
    y = 20;
  }
  docPdf.setDrawColor('#CCCCCC');
  docPdf.setLineWidth(0.3);
  docPdf.line(margemEsquerda, y, 196, y);
  y += 8;

  docPdf.setFont(undefined, 'bold');
  docPdf.setFontSize(11);
  docPdf.setTextColor(NAVY);
  docPdf.text(`Total geral no período: ${agrupado.totalGeral} pessoa(s)`, margemEsquerda, y);
  y += 8;
  docPdf.setFontSize(10);
  docPdf.text('Total geral no período por turno:', margemEsquerda, y);
  y += 6.5;
  docPdf.setFont(undefined, 'normal');
  docPdf.setFontSize(9);
  docPdf.setTextColor('#000000');
  agrupado.totalPorTurno.forEach((t) => {
    if (y + 6.5 > 285) {
      docPdf.addPage();
      y = 20;
    }
    docPdf.text(`• ${t.turnoNome} (${periodoTurno(t)}): ${t.subtotal} pessoa(s)`, margemEsquerda + 4, y);
    y += 6.5;
  });

  docPdf.save(nomeArquivo);
}
