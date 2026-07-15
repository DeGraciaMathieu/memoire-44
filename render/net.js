// Client réseau du mode en ligne : salons et flux SSE du relais (server.js).
// Aucune règle ici : transporte des messages opaques pour app.js, qui les
// applique via src/online.js. EventSource se reconnecte tout seul et renvoie
// Last-Event-ID : le relais rejoue alors les messages manqués.

const api = (path) => `/api/rooms${path}`;

async function post(path, body) {
  const res = await fetch(api(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `erreur réseau (${res.status})`);
  }
  return res.json();
}

// → { code }
export const createRoom = ({ seed, map, hostSide }) => post('', { seed, map, hostSide });

// → { seed, map, side } (le camp laissé par l'hôte)
export const joinRoom = (code) => post(`/${code}/join`);

// Ouvre le flux du salon ; onMessage reçoit chaque message du pair.
export function connectRoom(code, role, onMessage) {
  const es = new EventSource(api(`/${code}/events?role=${role}`));
  es.onmessage = (e) => onMessage(JSON.parse(e.data));
  return {
    send: (msg) => post(`/${code}/msg`, { role, msg }),
    close: () => es.close(),
  };
}
