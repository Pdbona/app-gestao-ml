// PDF do relatório por período (RelatoriosScreen.jsx) — cabeçalho com
// logos (reaproveitado de romaneio.js), resumo numérico e os 4 gráficos
// como imagem (canvas.toDataURL() de cada ChartCanvas).
import { jsPDF } from 'jspdf';
import { adicionarCabecalho, NAVY } from './romaneio';
import { formatarDataBr } from './data';

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

export function gerarRelatorioPdf({
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

  let y = adicionarCabecalho(
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

// PDF da lista de presença por dia (RelatoriosScreen.jsx, seção "Presenças
// confirmadas") — pro cliente conferir quem confirmou presença no período.
// Sem lib de tabela (o projeto não usa jspdf-autotable em lugar nenhum):
// desenha manualmente, um cabeçalho de dia em negrito seguido das linhas,
// com a mesma paginação manual já usada no resto do arquivo.
export function gerarRelatorioPresencaPdf({
  clienteNome,
  dataInicio,
  dataFim,
  presencasPorDiaLista,
  logoMlBase64,
  logoClienteBase64
}) {
  const docPdf = new jsPDF();
  const margemEsquerda = 14;

  let y = adicionarCabecalho(
    docPdf,
    'Relatório de Presença',
    `${clienteNome} — ${formatarDataBr(dataInicio)} a ${formatarDataBr(dataFim)}`,
    logoMlBase64,
    logoClienteBase64
  );

  if (presencasPorDiaLista.length === 0) {
    docPdf.setFont(undefined, 'normal');
    docPdf.setFontSize(11);
    docPdf.text('Nenhuma presença confirmada no período.', margemEsquerda, y);
  }

  presencasPorDiaLista.forEach((grupo) => {
    if (y + 14 > 285) {
      docPdf.addPage();
      y = 20;
    }
    docPdf.setTextColor(NAVY);
    docPdf.setFont(undefined, 'bold');
    docPdf.setFontSize(12);
    docPdf.text(formatarDataBr(grupo.data), margemEsquerda, y);
    docPdf.setTextColor('#000000');
    y += 7;

    grupo.itens.forEach((item) => {
      if (y + 7 > 285) {
        docPdf.addPage();
        y = 20;
      }
      docPdf.setFont(undefined, 'normal');
      docPdf.setFontSize(10);
      const horario = item.dataHoraCheckin?.toMillis
        ? new Date(item.dataHoraCheckin.toMillis()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : '--:--';
      docPdf.text(item.colaboradorNome || '-', margemEsquerda, y);
      docPdf.text(item.turnoNome || '-', margemEsquerda + 80, y);
      docPdf.text(horario, margemEsquerda + 140, y);
      y += 7;
    });
    y += 4;
  });

  const nomeArquivo = `presenca-${(clienteNome || 'cliente').replace(/\W+/g, '-').toLowerCase()}-${dataInicio}-a-${dataFim}.pdf`;
  docPdf.save(nomeArquivo);
}
