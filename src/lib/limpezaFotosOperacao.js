// Retenção das fotos de início/fim das operações do Coletor (o "romaneio")
// — guardadas em `registrosOperacao/{id}/fotos` (ver ColetorScreen.jsx).
// Mesmo padrão "preguiçoso" da selfie do check-in (lib/limpezaSelfies.js):
// sem Cloud Function agendada, roda quando o Administrativo abre o
// Dashboard. Prazo fixo de 3 dias (a pedido do Pablo — diferente do prazo
// da selfie, que é configurável).
import { db } from '../firebase';
import { collection, query, where, getDocs, deleteDoc, Timestamp } from 'firebase/firestore';

export const RETENCAO_FOTOS_OPERACAO_DIAS = 3;

// Retorna quantas fotos foram apagadas nesta passada.
export async function limparFotosOperacaoVencidas() {
  const limite = Timestamp.fromMillis(Date.now() - RETENCAO_FOTOS_OPERACAO_DIAS * 24 * 60 * 60 * 1000);

  // Só olha operações já finalizadas há mais de 3 dias — range query num
  // único campo, sem precisar de índice composto (mesmo cuidado de
  // sempre nesse app).
  const q = query(collection(db, 'registrosOperacao'), where('fim', '<', limite));
  const snap = await getDocs(q);

  let apagadas = 0;
  await Promise.all(
    snap.docs.map(async (operacaoDoc) => {
      const fotosSnap = await getDocs(collection(db, 'registrosOperacao', operacaoDoc.id, 'fotos'));
      await Promise.all(
        fotosSnap.docs.map(async (fotoDoc) => {
          try {
            await deleteDoc(fotoDoc.ref);
            apagadas += 1;
          } catch (e) {
            // Segue pras próximas mesmo se uma falhar.
          }
        })
      );
    })
  );

  return apagadas;
}
