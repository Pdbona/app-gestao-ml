import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { ui } from '../lib/styles';

export default function DashboardTab() {
  const [clientes, setClientes] = useState([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'clientes'), (snap) => {
      setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsubscribe();
  }, []);

  const total = clientes.length;
  const ativos = clientes.filter((c) => c.status === 'ativo').length;
  const inativos = total - ativos;

  return (
    <div>
      <h2 style={ui.sectionTitle}>Dashboard</h2>
      <div style={ui.cardsRow}>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{total}</div>
          <div style={ui.statLabel}>Clientes cadastrados</div>
        </div>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{ativos}</div>
          <div style={ui.statLabel}>Ativos</div>
        </div>
        <div style={ui.statCard}>
          <div style={ui.statValue}>{inativos}</div>
          <div style={ui.statLabel}>Inativos</div>
        </div>
      </div>
      <p style={ui.placeholderNote}>
        Gráficos de operações (por fluxo, por tipo, cumprimento de meta) entram aqui quando
        definirmos juntos o que precisa aparecer de imediato.
      </p>
    </div>
  );
}
