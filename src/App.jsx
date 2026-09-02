import React from 'react';
import GestaoML from './components/GestaoML';
import CheckinPublicScreen from './components/CheckinPublicScreen';
import './App.css';

// Não há router no app (tudo mais é controlado por state em GestaoML.jsx).
// O check-in de presença é a única tela pública (sem login) — acessada
// direto pelo QR Code fixado no Cliente/Local, então é resolvida aqui via
// query string (?checkin=<clienteId>), que funciona em qualquer host
// estático (GitHub Pages incluso) sem precisar de rota por path.
function App() {
  const params = new URLSearchParams(window.location.search);
  const checkinClienteId = params.get('checkin');

  return (
    <div className="App">
      <main className="app-main">
        {checkinClienteId ? <CheckinPublicScreen clienteId={checkinClienteId} /> : <GestaoML />}
      </main>
    </div>
  );
}

export default App;
