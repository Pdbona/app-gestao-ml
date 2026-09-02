// Distância entre duas coordenadas (fórmula de Haversine) — usado no
// check-in público pra confirmar que o colaborador está mesmo no
// Cliente/Local (compara com a geo capturada no cadastro do cliente).

const RAIO_TERRA_METROS = 6371000;

export function distanciaMetros(lat1, lng1, lat2, lng2) {
  const toRad = (graus) => (graus * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return RAIO_TERRA_METROS * c;
}

// Tolerância padrão pra considerar "está no local" — GPS de celular tem
// margem de erro própria, então uma distância curta ainda conta.
export const TOLERANCIA_GEO_METROS = 150;

export function capturarGeolocalizacao() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não é suportada neste navegador.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}
