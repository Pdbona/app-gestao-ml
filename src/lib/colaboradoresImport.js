// Importação de Colaborador por planilha (09/09/2026, pedido do Pablo).
// Ele ainda não tinha um layout definido ("não tenho ainda o layout desta
// planilha"), só os campos que quer trazer — Nome completo, CPF, PIX,
// Cidade e Bairro de residência — então este arquivo também É o modelo
// proposto: `gerarModeloColaboradores` gera um .xlsx de exemplo pra
// download, com essas 5 colunas nessa ordem. `lerPlanilhaColaboradores`
// reconhece pequenas variações no nome do cabeçalho (maiúscula/minúscula,
// com/sem acento, "Nome" em vez de "Nome completo"), pra não travar a
// importação por causa de um título de coluna levemente diferente.
//
// 100% client-side (biblioteca `xlsx`/SheetJS, lê .xlsx/.xls/.csv) — nada
// é gravado no Firestore aqui, só devolve as linhas já validadas; a tela
// (ColaboradoresCadastro.jsx) decide o que fazer com elas.
import * as XLSX from 'xlsx';
import { normalizarCpf, validarCpf } from './cpf';

export const COLUNAS_MODELO = ['Nome completo', 'CPF', 'PIX', 'Cidade', 'Bairro de residência'];

function normalizarCabecalho(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Cada campo aceita algumas variações plausíveis do texto da coluna.
const SINONIMOS_COLUNA = {
  nome: ['nome completo', 'nome', 'colaborador'],
  cpf: ['cpf'],
  pix: ['pix', 'chave pix'],
  cidade: ['cidade', 'municipio'],
  bairro: ['bairro de residencia', 'bairro residencia', 'bairro']
};

function mapearColunas(linhaCabecalho) {
  const indices = {};
  (linhaCabecalho || []).forEach((celula, i) => {
    const norm = normalizarCabecalho(celula);
    Object.entries(SINONIMOS_COLUNA).forEach(([campo, sinonimos]) => {
      if (indices[campo] === undefined && sinonimos.includes(norm)) indices[campo] = i;
    });
  });
  return indices;
}

// Gera e baixa o arquivo-modelo (.xlsx) — cabeçalho + 1 linha de exemplo —
// pra quem for preencher a planilha saber o formato esperado.
export function gerarModeloColaboradores() {
  const linhas = [
    COLUNAS_MODELO,
    ['João da Silva', '123.456.789-00', 'joao@exemplo.com', 'São Paulo', 'Centro']
  ];
  const planilha = XLSX.utils.aoa_to_sheet(linhas);
  planilha['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 20 }];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Colaboradores');
  XLSX.writeFile(livro, 'modelo-colaboradores.xlsx');
}

// Lê o arquivo escolhido e devolve `{ colunasFaltando, itens }`:
// - `colunasFaltando`: campos obrigatórios (nome/cpf) cujo cabeçalho não
//   foi reconhecido — se não vier vazio, a planilha nem chegou a ser
//   processada linha a linha (layout incompatível).
// - `itens`: uma entrada por linha de dado, já com `erro` preenchido
//   quando a linha não pode ser importada (nome/CPF em branco, CPF
//   inválido ou duplicado) e `acao` ('criar' ou 'atualizar', resolvido por
//   CPF contra `colaboradoresExistentes`) quando está tudo certo.
export async function lerPlanilhaColaboradores(arquivo, colaboradoresExistentes = []) {
  // `type: 'array'` do SheetJS espera um Uint8Array (acesso por índice) —
  // passar o ArrayBuffer cru direto faz a leitura falhar silenciosamente
  // (ArrayBuffer não suporta indexação, só a view por cima dele).
  // `codepage: 65001` força UTF-8 na leitura de .csv (sem isso, acento
  // vira caractere errado tipo "Ã©" — bairro/cidade em pt-BR sempre têm
  // acento; não afeta .xlsx/.xls, que já carregam a codificação certa).
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const livro = XLSX.read(bytes, { type: 'array', codepage: 65001 });
  const primeiraAba = livro.Sheets[livro.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(primeiraAba, { header: 1, raw: false, defval: '' });

  if (linhas.length === 0) {
    return { colunasFaltando: ['nome', 'cpf'], itens: [] };
  }

  const colunas = mapearColunas(linhas[0]);
  const colunasFaltando = ['nome', 'cpf'].filter((campo) => colunas[campo] === undefined);
  if (colunasFaltando.length > 0) {
    return { colunasFaltando, itens: [] };
  }

  const existentesPorCpf = new Map(colaboradoresExistentes.map((c) => [normalizarCpf(c.cpf), c]));
  const valorDaCelula = (linha, campo) =>
    colunas[campo] !== undefined ? String(linha[colunas[campo]] ?? '').trim() : '';

  const itens = linhas
    .slice(1)
    .filter((linha) => (linha || []).some((celula) => String(celula || '').trim() !== ''))
    .map((linha, i) => {
      const nome = valorDaCelula(linha, 'nome');
      const cpf = normalizarCpf(valorDaCelula(linha, 'cpf'));
      const pix = valorDaCelula(linha, 'pix');
      const cidade = valorDaCelula(linha, 'cidade');
      const bairro = valorDaCelula(linha, 'bairro');

      let erro = '';
      if (!nome) erro = 'Nome completo em branco.';
      else if (!cpf) erro = 'CPF em branco.';
      else if (!validarCpf(cpf)) erro = 'CPF inválido.';

      const existente = existentesPorCpf.get(cpf);
      return {
        linhaPlanilha: i + 2, // +2 = volta pra base 1 e pula a linha de cabeçalho
        nome,
        cpf,
        pix,
        cidade,
        bairro,
        erro,
        acao: erro ? null : existente ? 'atualizar' : 'criar',
        colaboradorExistenteId: existente?.id || null
      };
    });

  // CPF repetido dentro da própria planilha — a 1ª ocorrência fica valendo,
  // as demais são marcadas com erro (evita 2 documentos disputando o mesmo
  // CPF só porque vieram na mesma importação).
  const vistos = new Set();
  itens.forEach((item) => {
    if (item.erro) return;
    if (vistos.has(item.cpf)) {
      item.erro = 'CPF duplicado nesta planilha.';
      item.acao = null;
    } else {
      vistos.add(item.cpf);
    }
  });

  return { colunasFaltando: [], itens };
}
