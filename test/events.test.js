import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/events.js';

test('le bus délivre les événements à tous les abonnés, avec le payload', () => {
  const bus = createBus();
  const received = [];
  bus.on('ping', (p) => received.push(['a', p]));
  bus.on('ping', (p) => received.push(['b', p]));
  bus.emit('ping', 42);
  assert.deepEqual(received, [
    ['a', 42],
    ['b', 42],
  ]);
});

test("émettre sans abonné ne lève pas d'erreur, et se désabonner fonctionne", () => {
  const bus = createBus();
  bus.emit('rien', null);
  let count = 0;
  const off = bus.on('tick', () => count++);
  bus.emit('tick');
  off();
  bus.emit('tick');
  assert.equal(count, 1);
});
