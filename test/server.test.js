// Relais du mode en ligne (server.js) : création / jonction de salon et
// acheminement des messages entre hôte et invité via SSE.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

const listen = (app) => new Promise((res) => app.listen(0, () => res(app.address().port)));

// Lit un flux SSE au fil de l'eau : next() rend le prochain événement décodé.
async function sseReader(url) {
  const res = await fetch(url);
  assert.equal(res.status, 200);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    async next() {
      for (;;) {
        const i = buffer.indexOf('\n\n');
        if (i >= 0) {
          const data = buffer
            .slice(0, i)
            .split('\n')
            .find((l) => l.startsWith('data: '));
          buffer = buffer.slice(i + 2);
          if (data) return JSON.parse(data.slice(6));
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('flux SSE fermé');
        buffer += decoder.decode(value, { stream: true });
      }
    },
    close: () => reader.cancel().catch(() => {}),
  };
}

test('relais : salon créé, rejoint une seule fois, messages relayés dans les deux sens', async () => {
  const app = createApp();
  const port = await listen(app);
  const api = (p) => `http://127.0.0.1:${port}/api/rooms${p}`;
  const post = async (p, body) => {
    const res = await fetch(api(p), { method: 'POST', body: JSON.stringify(body ?? {}) });
    return { status: res.status, data: await res.json() };
  };

  try {
    // création : un code court, la configuration reste chez le relais
    const created = await post('', { seed: 123, map: 'plage.json', hostSide: 'axis' });
    assert.equal(created.status, 200);
    const code = created.data.code;
    assert.match(code, /^[A-Z0-9]{4}$/);

    const host = await sseReader(api(`/${code}/events?role=host`));

    // l'invité récupère seed + carte + le camp laissé libre, l'hôte est prévenu
    const joined = await post(`/${code}/join`);
    assert.equal(joined.status, 200);
    assert.deepEqual(joined.data, { seed: 123, map: 'plage.json', side: 'allies' });
    assert.deepEqual(await host.next(), { t: 'joined' });

    // salon complet ou inconnu
    assert.equal((await post(`/${code}/join`)).status, 409);
    assert.equal((await post('/ZZZZ/join')).status, 404);

    // relais des messages, dans les deux sens — y compris vers un flux ouvert après coup
    await post(`/${code}/msg`, { role: 'host', msg: { t: 'play', card: 'recon' } });
    const guest = await sseReader(api(`/${code}/events?role=guest`));
    assert.deepEqual(await guest.next(), { t: 'play', card: 'recon' });
    await post(`/${code}/msg`, { role: 'guest', msg: { t: 'end', side: 'axis' } });
    assert.deepEqual(await host.next(), { t: 'end', side: 'axis' });

    host.close();
    guest.close();
  } finally {
    app.closeAllConnections();
    await new Promise((res) => app.close(res));
  }
});

test('relais : il sert aussi les fichiers statiques du jeu', async () => {
  const app = createApp();
  const port = await listen(app);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), /Ordre de Bataille/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/../secret`)).status, 404);
  } finally {
    app.closeAllConnections();
    await new Promise((res) => app.close(res));
  }
});
