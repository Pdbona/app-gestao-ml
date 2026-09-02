// Redimensiona uma imagem no navegador (canvas) e devolve como data URL
// base64 — usado pra logo do Cliente. Guardamos direto no documento do
// Firestore (não no Storage): o Storage do Firebase passou a exigir o
// plano pago (Blaze), que o Pablo decidiu não ativar por ora (ver
// CheckinPublicScreen.jsx/limpezaSelfies.js) — reaproveitando o mesmo
// contorno pra logo, comprimindo bastante (até ~320px) pra caber sem
// problema no limite de 1MB por documento do Firestore.
const DIMENSAO_MAXIMA_PADRAO = 320;
const QUALIDADE_PADRAO = 0.82;
const TAMANHO_MAXIMO_BYTES = 700 * 1024;

export function redimensionarImagemParaBase64(file, maxDim = DIMENSAO_MAXIMA_PADRAO, qualidade = QUALIDADE_PADRAO) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo não é uma imagem válida.'));
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', qualidade);
        if (dataUrl.length > TAMANHO_MAXIMO_BYTES) {
          reject(new Error('A imagem ficou grande demais mesmo depois de comprimida — tente uma mais simples.'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
