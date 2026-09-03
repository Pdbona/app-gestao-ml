// Converte um asset estático (public/) em base64 — o jsPDF (addImage)
// precisa de base64/dados brutos, não aceita URL direta de forma
// confiável. Usado pra colocar a logo da ML nos PDFs (romaneio e
// relatório por período); a logo do cliente já vem em base64 direto do
// Firestore (ClientesCadastro.jsx), não precisa passar por aqui.
let logoMlCache = null;

export async function obterLogoMlBase64() {
  if (logoMlCache) return logoMlCache;
  const url = `${process.env.PUBLIC_URL}/logos/logo-ml.png`;
  const resp = await fetch(url);
  const blob = await resp.blob();
  logoMlCache = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao carregar a logo da ML.'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
  return logoMlCache;
}
