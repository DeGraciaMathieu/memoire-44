// Éventail de cartes + boutons d'action.

import { cardById } from '../src/cards.js';
import { cardHTML, ordersLabel } from './html.js';

const SPREAD = 8; // degrés entre deux cartes

export function createHand({ onPlayCard, onEndTurn, onNewGame, onCutWire, onAirStrike }) {
  const handEl = document.getElementById('hand');
  const fan = document.getElementById('fan');
  const acts = document.getElementById('acts');
  const reconScrim = document.getElementById('reconScrim');
  const reconCards = document.getElementById('reconCards');
  const reconHead = document.getElementById('rHead');

  const cardLabel = (cd) => `${cd.name}, ${cd.desc ?? ordersLabel(cd)}`;

  // Bonus de pioche d'une Reconnaissance : le joueur clique la carte à garder.
  function showReconChoice(ids, onPick) {
    reconHead.textContent = 'Reconnaissance — gardez une carte, l’autre est défaussée';
    reconCards.innerHTML = '';
    for (const id of ids) {
      const cd = cardById(id);
      const b = document.createElement('button');
      b.className = 'card';
      b.setAttribute('aria-label', cardLabel(cd));
      b.innerHTML = cardHTML(cd);
      b.onclick = () => {
        reconScrim.classList.remove('on');
        onPick(id);
      };
      reconCards.appendChild(b);
    }
    reconScrim.classList.add('on');
  }

  // Carte à choix de secteur (Assaut d'infanterie) : le joueur clique le
  // secteur où donner les ordres.
  function showSectorChoice(sectors, onPick) {
    reconHead.textContent = 'Assaut d’infanterie — choisissez le secteur';
    reconCards.innerHTML = '';
    for (const s of sectors) {
      const b = document.createElement('button');
      b.className = 'act';
      b.textContent = s === 'centre' ? 'Au centre' : `À ${s}`;
      b.onclick = () => {
        reconScrim.classList.remove('on');
        onPick(s);
      };
      reconCards.appendChild(b);
    }
    reconScrim.classList.add('on');
  }

  /* --- survol de la main -----------------------------------------------
     Le :hover CSS est instable ici : la carte se soulève sous le curseur,
     sa boîte de collision se déplace, le survol se perd et elle retombe
     (et les cartes rotées se chevauchent, donc la cible saute d'une carte
     à l'autre). On calcule donc la carte survolée à partir de bandes
     verticales FIXES, indépendantes de toute animation.               */
  let hoverBands = null;
  let hoveredIdx = -1;

  function setHovered(i) {
    if (i === hoveredIdx || !hoverBands) return;
    hoveredIdx = i;
    hoverBands.els.forEach((el, k) => el.classList.toggle('hovered', k === i));
  }

  function onHover(e) {
    if (!hoverBands || !hoverBands.playable || !hoverBands.count) return setHovered(-1);
    if (e.target.closest('.actions')) return setHovered(-1);
    const rect = fan.getBoundingClientRect();
    const x = e.clientX - (rect.left + rect.width / 2); // écart au centre de l'éventail
    const i = Math.round(x / hoverBands.gap + hoverBands.mid);
    setHovered(Math.max(0, Math.min(hoverBands.count - 1, i)));
  }

  handEl.addEventListener('pointermove', onHover);
  handEl.addEventListener('pointerleave', () => setHovered(-1));

  async function playFromHand(id, el) {
    el.disabled = true;
    fan.querySelectorAll('.card').forEach((c) => (c.disabled = true));
    el.classList.add('played');
    await new Promise((r) => setTimeout(r, 460));
    onPlayCard(id);
  }

  function render(state, ui) {
    fan.innerHTML = '';
    acts.innerHTML = '';
    hoveredIdx = -1;
    const playable = state.turn === state.playerSide && state.phase === 'card' && !state.winner;
    const hand = state.hands[state.playerSide];
    const mid = (hand.length - 1) / 2;
    const gap = window.innerWidth < 900 ? 62 : 78; // écartement horizontal

    hand.forEach((id, i) => {
      const cd = cardById(id);
      const b = document.createElement('button');
      b.className = 'card';
      b.style.setProperty('--rot', ((i - mid) * SPREAD).toFixed(2) + 'deg');
      b.style.setProperty('--tx', ((i - mid) * gap).toFixed(1) + 'px');
      b.style.zIndex = i;
      b.disabled = !playable;
      b.setAttribute('aria-label', cardLabel(cd));
      b.innerHTML = cardHTML(cd);
      // les cartes fraîchement piochées se posent en dernier
      if (ui.justDrew && i >= hand.length - ui.justDrew) {
        b.classList.add('dealt');
        b.style.animationDelay = (i - (hand.length - ui.justDrew)) * 90 + 'ms';
      }
      b.onclick = () => playFromHand(id, b);
      fan.appendChild(b);
    });
    ui.justDrew = 0;
    hoverBands = { count: hand.length, gap, mid, playable, els: [...fan.children] };

    if (state.phase === 'orders' && state.turn === state.playerSide && !state.winner) {
      if (ui.cutWire) {
        const w = document.createElement('button');
        w.className = 'act';
        w.textContent = 'Couper les barbelés';
        w.onclick = onCutWire;
        acts.appendChild(w);
      }
      // attaque aérienne : frapper avant d'avoir désigné les 4 unités
      if (ui.action?.kind === 'air' && ui.action.picks.length) {
        const a = document.createElement('button');
        a.className = 'act';
        a.textContent = 'Déclencher la frappe';
        a.onclick = onAirStrike;
        acts.appendChild(a);
      }
      const e = document.createElement('button');
      e.className = 'act';
      e.textContent = 'Fin de tour';
      e.onclick = onEndTurn;
      acts.appendChild(e);
    }
    const rs = document.createElement('button');
    rs.className = 'act';
    rs.textContent = 'Nouvelle partie';
    rs.onclick = onNewGame;
    acts.appendChild(rs);
  }

  return { render, showReconChoice, showSectorChoice };
}
