// Cartes personnalisées créées par l'éditeur : sérialisation JSON,
// validation et mise en place d'une partie à partir d'une carte.
// Format JSON : { name, terrain: { "c,r": type } (hexes non plaine seulement),
//                 obstacles: { "c,r": type }, units: [{ side, type, c, r }] }

import { W, H, TERRAIN, OBSTACLES, UNITS } from './config.js';
import { inBounds, key } from './hex.js';

const SIDES = ['allies', 'axis'];

// Une unité ne peut être posée ni sur un terrain infranchissable sans pont
// (rivière), ni sur un obstacle réservé à l'infanterie si elle n'en est pas.
export function unitAllowedOn(terrain, obstacles, type, c, r) {
  const t = TERRAIN[terrain[key(c, r)]];
  const o = OBSTACLES[obstacles[key(c, r)]];
  if (t?.impassable && !o?.makesPassable) return false;
  return !o || !o.infantryOnly || type === 'inf';
}

// Carte → objet JSON compact : seuls les hexes non plaine sont conservés.
export function serializeMap({ name = '', terrain, obstacles, units }) {
  const t = {};
  for (const [k, v] of Object.entries(terrain)) if (v !== 'plaine') t[k] = v;
  return {
    name,
    terrain: t,
    obstacles: { ...obstacles },
    units: units.map((u) => ({ side: u.side, type: u.type, c: u.c, r: u.r })),
  };
}

const fail = (msg) => {
  throw new Error(`Carte invalide : ${msg}.`);
};

function parseHexKey(k) {
  const [c, r] = k.split(',').map(Number);
  if (!Number.isInteger(c) || !Number.isInteger(r) || !inBounds(c, r))
    fail(`hex « ${k} » hors plateau`);
  return [c, r];
}

// Texte ou objet JSON → carte validée { name, terrain (complet), obstacles, units }.
// Lève une Error en français à la première anomalie.
export function parseMap(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      fail('JSON illisible');
    }
  }
  if (!data || typeof data !== 'object') fail('le fichier ne décrit pas un objet');

  const terrain = {};
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) terrain[key(c, r)] = 'plaine';
  for (const [k, t] of Object.entries(data.terrain ?? {})) {
    if (!TERRAIN[t]) fail(`terrain inconnu « ${t} »`);
    const [c, r] = parseHexKey(k);
    terrain[key(c, r)] = t;
  }

  const obstacles = {};
  for (const [k, o] of Object.entries(data.obstacles ?? {})) {
    if (!OBSTACLES[o]) fail(`obstacle inconnu « ${o} »`);
    const [c, r] = parseHexKey(k);
    obstacles[key(c, r)] = o;
  }

  const units = [];
  const taken = new Set();
  for (const u of data.units ?? []) {
    if (!SIDES.includes(u.side)) fail(`camp inconnu « ${u.side} »`);
    if (!UNITS[u.type]) fail(`type d'unité inconnu « ${u.type} »`);
    if (!Number.isInteger(u.c) || !Number.isInteger(u.r) || !inBounds(u.c, u.r))
      fail(`unité hors plateau en « ${u.c},${u.r} »`);
    if (taken.has(key(u.c, u.r))) fail(`deux unités sur l'hex « ${u.c},${u.r} »`);
    if (!unitAllowedOn(terrain, obstacles, u.type, u.c, u.r))
      fail(
        `emplacement interdit pour ${UNITS[u.type].label} en « ${u.c},${u.r} » ` +
          `(rivière sans pont ou obstacle réservé à l'infanterie)`,
      );
    taken.add(key(u.c, u.r));
    units.push({ side: u.side, type: u.type, c: u.c, r: u.r });
  }
  for (const side of SIDES)
    if (!units.some((u) => u.side === side)) fail(`aucune unité pour le camp « ${side} »`);

  return { name: typeof data.name === 'string' ? data.name : '', terrain, obstacles, units };
}

// Carte validée → mise en place neuve (copies fraîches, unités matérialisées),
// même forme que scenario() : la carte reste réutilisable de partie en partie.
export function setupFromMap(map) {
  return {
    terrain: { ...map.terrain },
    obstacles: { ...map.obstacles },
    units: map.units.map((u, i) => ({
      id: 'u' + i,
      side: u.side,
      type: u.type,
      c: u.c,
      r: u.r,
      figs: UNITS[u.type].figs,
      acted: false,
    })),
  };
}
