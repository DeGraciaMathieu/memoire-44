// Éditeur de cartes : peint terrains, obstacles, objectifs et unités sur le
// plateau, exporte et importe le JSON compris par src/map.js. Aucune règle
// métier ici : la légalité d'un placement et la validation viennent de src/map.js.

import { W, H, TERRAIN, OBSTACLES, UNITS } from '../src/config.js';
import { inBounds, key } from '../src/hex.js';
import { parseMap, serializeMap, unitAllowedOn } from '../src/map.js';
import { createUiState } from './uiState.js';
import { buildBoardLayer } from './board.js';
import { createStage, DPR } from './stage.js';
import { COL, pickHex } from './gfx.js';
import { SIDE_FR, UNIT_GLYPH } from './html.js';

const canvas = document.getElementById('cv');
const statusEl = document.getElementById('status');
const nameInput = document.getElementById('mapName');
const fileImport = document.getElementById('fileImport');

/* --- état de l'éditeur (document en cours, purement local) --------------- */

function blankMap() {
  const terrain = {};
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) if (inBounds(c, r)) terrain[key(c, r)] = 'plaine';
  return { terrain, obstacles: {}, objectives: {}, units: [] };
}

let map = blankMap();
let tool = { kind: 'terrain', id: 'foret' };
let boardLayer = buildBoardLayer(map, DPR);
const ui = createUiState();

const stage = createStage(canvas, () => ({
  state: {
    terrain: map.terrain,
    obstacles: map.obstacles,
    units: map.units.map((u, i) => ({ ...u, id: 'e' + i, figs: UNITS[u.type].figs })),
    playedCard: null,
    phase: 'card',
    turn: 'axis',
  },
  ui,
  boardLayer,
}));

function setStatus(msg, bad = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('bad', bad);
}

function repaintTerrain() {
  boardLayer = buildBoardLayer(map, DPR);
  stage.requestDraw();
}

/* --- palette d'outils ----------------------------------------------------- */

function addTool(parent, label, next, decorate) {
  const b = document.createElement('button');
  b.className = 'tool';
  b.textContent = label;
  decorate?.(b);
  b.onclick = () => {
    tool = next;
    document.querySelectorAll('.tool').forEach((el) => el.classList.toggle('on', el === b));
    setStatus(`Outil : ${label}.`);
  };
  parent.appendChild(b);
  return b;
}

const terrainTools = document.getElementById('terrainTools');
for (const [id, t] of Object.entries(TERRAIN)) {
  const b = addTool(terrainTools, t.label, { kind: 'terrain', id }, (el) => {
    el.style.setProperty('--swatch', COL[id]);
    el.classList.add('swatched');
  });
  if (tool.kind === 'terrain' && tool.id === id) b.classList.add('on');
}

const obstacleTools = document.getElementById('obstacleTools');
for (const [id, o] of Object.entries(OBSTACLES))
  addTool(obstacleTools, o.label, { kind: 'obstacle', id });
addTool(obstacleTools, 'Enlever l’obstacle', { kind: 'obstacle', id: null });

const objectiveTools = document.getElementById('objectiveTools');
for (const id of ['both', 'allies', 'axis'])
  addTool(
    objectiveTools,
    `Objectif ★ ${id === 'both' ? 'mixte' : SIDE_FR[id]}`,
    { kind: 'objective', id },
    (el) => {
      el.style.setProperty('--swatch', id === 'both' ? COL.objective : COL[id]);
      el.classList.add('swatched');
    },
  );
addTool(objectiveTools, 'Enlever l’objectif', { kind: 'objective', id: null });

const unitTools = document.getElementById('unitTools');
for (const side of ['allies', 'axis'])
  for (const [type, u] of Object.entries(UNITS))
    addTool(unitTools, `${u.label} ${SIDE_FR[side]}`, { kind: 'unit', side, type }, (el) => {
      el.style.setProperty('--swatch', COL[side]);
      el.classList.add('swatched');
      el.textContent = `${UNIT_GLYPH[type]} ${u.label} — ${SIDE_FR[side]}`;
    });
addTool(unitTools, 'Enlever l’unité', { kind: 'unit', side: null, type: null });

/* --- application d'un outil sur un hex ------------------------------------ */

const BLOCKED_MSG = 'Hex refusé : rivière sans pont ou obstacle réservé à l’infanterie.';

function applyTool(hex) {
  const k = key(hex.c, hex.r);
  const occupant = map.units.find((x) => x.c === hex.c && x.r === hex.r);
  if (tool.kind === 'terrain') {
    if (map.terrain[k] === tool.id) return;
    const next = { ...map.terrain, [k]: tool.id };
    if (occupant && !unitAllowedOn(next, map.obstacles, occupant.type, hex.c, hex.r)) {
      setStatus(BLOCKED_MSG, true);
      return;
    }
    map.terrain = next;
    repaintTerrain();
    return;
  }
  if (tool.kind === 'obstacle') {
    const next = { ...map.obstacles };
    if (tool.id === null) delete next[k];
    else next[k] = tool.id;
    if (occupant && !unitAllowedOn(map.terrain, next, occupant.type, hex.c, hex.r)) {
      setStatus(BLOCKED_MSG, true);
      return;
    }
    map.obstacles = next;
    stage.requestDraw();
    return;
  }
  if (tool.kind === 'objective') {
    // dessiné dans la couche statique du plateau : re-raster nécessaire
    const next = { ...map.objectives };
    if (tool.id === null) delete next[k];
    else next[k] = tool.id;
    map.objectives = next;
    repaintTerrain();
    return;
  }
  // unité : pose (en remplaçant l'occupant) ou retrait
  map.units = map.units.filter((x) => x.c !== hex.c || x.r !== hex.r);
  if (tool.type !== null) {
    if (!unitAllowedOn(map.terrain, map.obstacles, tool.type, hex.c, hex.r)) {
      setStatus(BLOCKED_MSG, true);
      stage.requestDraw();
      return;
    }
    map.units.push({ side: tool.side, type: tool.type, c: hex.c, r: hex.r });
  }
  stage.requestDraw();
}

/* --- pointeur -------------------------------------------------------------- */

// Échelles séparées par axe : max-width ET max-height peuvent contraindre le
// canvas indépendamment (écran bas), l'échelle n'est alors plus uniforme.
const toCanvas = (e) => {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * stage.width) / rect.width,
    y: ((e.clientY - rect.top) * stage.height) / rect.height,
  };
};

let painting = false;

canvas.addEventListener('pointerdown', (e) => {
  const { x, y } = toCanvas(e);
  const hex = pickHex(x, y);
  if (!hex) return;
  painting = true;
  canvas.setPointerCapture(e.pointerId);
  applyTool(hex);
});

canvas.addEventListener('pointermove', (e) => {
  const { x, y } = toCanvas(e);
  const hex = pickHex(x, y);
  if (!ui.hover || !hex || ui.hover.c !== hex.c || ui.hover.r !== hex.r) {
    ui.hover = hex;
    stage.requestDraw();
  }
  // seul le terrain se peint en glissant : obstacles et unités se posent au clic
  if (painting && hex && tool.kind === 'terrain') applyTool(hex);
});

canvas.addEventListener('pointerup', () => (painting = false));
canvas.addEventListener('pointerleave', () => {
  ui.hover = null;
  stage.requestDraw();
});

/* --- export / import / réinitialisation ------------------------------------ */

document.getElementById('btnExport').onclick = () => {
  const data = serializeMap({ name: nameInput.value.trim(), ...map });
  try {
    parseMap(data);
  } catch (err) {
    setStatus(err.message, true);
    return;
  }
  const slug =
    (data.name || 'carte')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'carte';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  a.download = `${slug}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`Carte « ${data.name || slug} » exportée — chargez-la depuis le jeu.`);
};

document.getElementById('btnImport').onclick = () => fileImport.click();
fileImport.onchange = async () => {
  const file = fileImport.files[0];
  fileImport.value = '';
  if (!file) return;
  try {
    const loaded = parseMap(await file.text());
    map = {
      terrain: loaded.terrain,
      obstacles: loaded.obstacles,
      objectives: loaded.objectives,
      units: loaded.units,
    };
    nameInput.value = loaded.name;
    repaintTerrain();
    setStatus(`Carte « ${loaded.name || file.name} » chargée dans l’éditeur.`);
  } catch (err) {
    setStatus(err.message, true);
  }
};

document.getElementById('btnClear').onclick = () => {
  map = blankMap();
  repaintTerrain();
  setStatus('Plateau vidé.');
};

stage.requestDraw();
