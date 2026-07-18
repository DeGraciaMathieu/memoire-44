// Page d'accueil : liste les cartes du dossier maps/ (manifeste maps/index.json)
// et mène au jeu via game.html?map=<fichier>&side=<camp> — ou vers une carte
// aléatoire via game.html?random=<graine>&biome=<biome>. Aucune règle métier ici.

import { parseMap, setupFromMap } from '../src/map.js';
import { BIOMES } from '../src/generator.js';
import { homeMapsHTML, homeRandomHTML, homeSideHTML } from './html.js';
import { buildBoardLayer } from './board.js';
import { COL, boardSize, hexCenter } from './gfx.js';

const PREVIEW_W = 576; // 2× la largeur intérieure d'une tuile, net sur écran retina

const list = document.getElementById('maps');
const sidepick = document.getElementById('sidepick');

// Camp choisi : répercuté sur le lien de chaque tuile.
let side = 'allies';
sidepick.innerHTML = homeSideHTML(side);
sidepick.addEventListener('change', (e) => {
  side = e.target.value;
  for (const a of list.querySelectorAll('.maptile')) {
    const url = new URL(a.href);
    url.searchParams.set('side', side);
    a.href = url;
  }
});

// Carte aléatoire : biome au choix, graine saisie ou tirée au hasard — la
// graine rend la carte rejouable et partageable.
const randpick = document.getElementById('randpick');
randpick.innerHTML = homeRandomHTML(BIOMES);
document.getElementById('btnRandomPlay').onclick = () => {
  const biome = document.getElementById('homeBiome').value;
  const attacker = document.getElementById('homeProfile').value;
  const raw = document.getElementById('homeSeed').value.trim();
  const seed = /^\d+$/.test(raw) ? Number(raw) : (Math.random() * 1e6) | 0;
  const profile = attacker ? `&attacker=${attacker}` : '';
  location.href = `game.html?random=${seed}&biome=${biome}${profile}&side=${side}`;
};

// Aperçu d'une carte : le raster du plateau (terrain + objectifs) surmonté
// d'une pastille par unité, réduit en image.
function mapPreviewURL(map) {
  const setup = setupFromMap(map);
  const layer = buildBoardLayer(setup, 1);
  const ctx = layer.getContext('2d');
  for (const u of setup.units) {
    const p = hexCenter(u.c, u.r);
    ctx.fillStyle = COL[u.side];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  const { width, height } = boardSize();
  const out = document.createElement('canvas');
  out.width = PREVIEW_W;
  out.height = Math.round((height / width) * PREVIEW_W);
  out.getContext('2d').drawImage(layer, 0, 0, out.width, out.height);
  return out.toDataURL();
}

async function loadMaps() {
  const res = await fetch('maps/index.json');
  if (!res.ok) throw new Error(`manifeste introuvable (${res.status})`);
  const files = await res.json();
  return Promise.all(
    files.map(async (file) => {
      try {
        const map = parseMap(await fetch(`maps/${file}`).then((r) => r.text()));
        return { file, name: map.name || file.replace(/\.json$/, ''), preview: mapPreviewURL(map) };
      } catch {
        // carte illisible : la tuile reste cliquable, sans aperçu
        return { file, name: file.replace(/\.json$/, ''), preview: null };
      }
    }),
  );
}

loadMaps()
  .then((maps) => {
    list.innerHTML = homeMapsHTML(maps, side);
  })
  .catch((err) => {
    list.innerHTML = `<p class="empty">✖ Impossible de charger la liste des cartes : ${err.message}</p>`;
  });
