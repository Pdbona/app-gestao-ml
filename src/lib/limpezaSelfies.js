// Retenção/limpeza das selfies do check-in de presença. NÃO é um job
// agendado (Cloud Function) — de propósito, pra não precisar migrar o
// projeto do plano Spark (gratuito) pro Blaze só por causa disso. Em vez
// disso, roda "preguiçosamente": toda vez que o Administrativo abre o
// Dashboard/Planejamento, verifica se alguma selfie já passou do prazo de
// retenção configurado e apaga o arquivo (o registro de presença em si
// continua existindo, só a foto some).
import { db, storage } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';

const CONFIG_COLLECTION = 'configuracoes';
const CONFIG_DOC_ID = 'geral';
export const RETENCAO_SELFIE_DIAS_PADRAO = 5;

// O Storage do Firebase passou a exigir o plano pago (Blaze) até pra
// existir — não é mais grátis por padrão como o Firestore (ver conversa
// com o Pablo em 02/09/2026). Por isso a selfie do check-in começa
// DESLIGADA (`guardarSelfie: false`): a foto continua sendo tirada e
// exigida no wizard (confirma visualmente quem é a pessoa), só não sobe
// pro Storage nem fica salva em lugar nenhum. O campo fica pronto — é só
// ligar aqui (Planejamento → Selfie do check-in) quando o Pablo decidir
// migrar o projeto pra Blaze.
export async function obterConfigSelfie() {
  try {
    const snap = await getDoc(doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID));
    const dados = snap.exists() ? snap.data() : {};
    const dias = Number(dados.retencaoSelfieDias);
    return {
      guardarSelfie: Boolean(dados.guardarSelfie),
      retencaoSelfieDias: dias > 0 ? dias : RETENCAO_SELFIE_DIAS_PADRAO
    };
  } catch (e) {
    // Firestore indisponível — segue com o padrão (selfie desligada).
  }
  return { guardarSelfie: false, retencaoSelfieDias: RETENCAO_SELFIE_DIAS_PADRAO };
}

export async function salvarConfigSelfie({ guardarSelfie, retencaoSelfieDias }) {
  await setDoc(
    doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID),
    { guardarSelfie: Boolean(guardarSelfie), retencaoSelfieDias: Number(retencaoSelfieDias) },
    { merge: true }
  );
}

// Mantido só pra quem ainda chama a versão antiga (limparSelfiesVencidas
// abaixo usa a nova obterConfigSelfie diretamente).
export async function obterRetencaoSelfieDias() {
  return (await obterConfigSelfie()).retencaoSelfieDias;
}

// Retorna quantas selfies foram apagadas nesta passada.
export async function limparSelfiesVencidas() {
  const { guardarSelfie, retencaoSelfieDias: diasRetencao } = await obterConfigSelfie();
  if (!guardarSelfie) return 0; // Storage desligado — nunca há foto pra limpar.
  const limite = Timestamp.fromMillis(Date.now() - diasRetencao * 24 * 60 * 60 * 1000);

  // Range query num único campo — não precisa de índice composto (mesmo
  // cuidado já seguido em ColetorScreen.jsx pra registrosOperacao).
  const q = query(collection(db, 'presencas'), where('dataHoraCheckin', '<', limite));
  const snap = await getDocs(q);
  const vencidas = snap.docs.filter((d) => d.data().fotoPath);

  await Promise.all(
    vencidas.map(async (d) => {
      try {
        await deleteObject(ref(storage, d.data().fotoPath));
      } catch (e) {
        // Arquivo já pode ter sido removido antes (ex: limpeza rodou em
        // duas abas ao mesmo tempo) — não é motivo pra parar a limpeza.
      }
      try {
        await updateDoc(doc(db, 'presencas', d.id), { fotoPath: null, fotoExcluidaEm: serverTimestamp() });
      } catch (e) {
        // Segue pras próximas mesmo se uma falhar.
      }
    })
  );

  return vencidas.length;
}
