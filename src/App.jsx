import React from 'react';
import GestaoML from './components/GestaoML';
import CheckinPublicScreen from './components/CheckinPublicScreen';
import AcessoProprioScreen from './components/AcessoProprioScreen';
import './App.css';

// Não há router no app (tudo mais é controlado por state em GestaoML.jsx).
// Duas telas públicas (sem login padrão) são resolvidas via query string —
// funciona em qualquer host estático (GitHub Pages incluso) sem precisar
// de rota por path:
//  - `?checkin=<clienteId>` — check-in de presença, acessado pelo QR Code
//    fixado no Cliente/Local.
//  - `?acesso=<slug>` — Link de acesso próprio de um perfil (07/09/2026,
//    ver AcessoProprioScreen.jsx/PerfisCadastro.jsx), pula a porta padrão
//    (senha única) e deixa a pessoa escolher o próprio nome + senha curta.
function App() {
  const params = new URLSearchParams(window.location.search);
  const checkinClienteId = params.get('checkin');
  const acessoSlug = params.get('acesso');

  return (
    <div className="App">
      <main className="app-main">
        {checkinClienteId ? (
          <CheckinPublicScreen clienteId={checkinClienteId} />
        ) : acessoSlug ? (
          <AcessoProprioScreen slug={acessoSlug} />
        ) : (
          <GestaoML />
        )}
      </main>
    </div>
  );
}

export default App;
