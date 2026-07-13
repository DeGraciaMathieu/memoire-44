// Modale de combat : mise en scène d'un résultat DÉJÀ résolu par les règles.
// play() reçoit l'outcome d'attackUnit et déroule l'animation ; elle ne
// décide rien.

import { FACES, UNITS } from '../src/config.js';
import { key } from '../src/hex.js';
import { SYM, SIDE_FR, calcHTML, forcePanelHTML } from './html.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createCombatModal({ requestDraw, getUi }) {
  const els = {
    scrim: document.getElementById('scrim'),
    head: document.getElementById('dHead'),
    atk: document.getElementById('dAtk'),
    def: document.getElementById('dDef'),
    calc: document.getElementById('dCalc'),
    dice: document.getElementById('dDice'),
    out: document.getElementById('dOut'),
    btn: document.getElementById('dBtn'),
  };

  async function play(state, outcome, { auto = false } = {}) {
    const { attacker, defender, report, figsBefore, range, terrainKey } = outcome;
    getUi().modalOpen = true;

    els.head.textContent = `Engagement — portée ${range}`;
    els.atk.innerHTML = forcePanelHTML(
      attacker,
      state.terrain[key(attacker.c, attacker.r)],
      'Attaquant',
      attacker.figs,
      0,
    );
    els.def.innerHTML = forcePanelHTML(defender, terrainKey, 'Défenseur', figsBefore, 0);
    els.calc.innerHTML = calcHTML(outcome);
    els.dice.innerHTML = '';
    els.out.innerHTML = '';
    els.btn.classList.remove('on');
    els.scrim.classList.add('on');

    await sleep(520);

    // les dés roulent : on brasse des faces, le résultat est déjà tiré
    const dice = report.faces.map((_, i) => {
      const d = document.createElement('div');
      d.className = 'die rolling';
      d.style.animationDelay = i * 55 + 'ms'; // désynchronise les culbutes
      els.dice.appendChild(d);
      return d;
    });
    let tick = 0;
    const spin = setInterval(() => {
      tick++;
      dice.forEach((d, i) => {
        if (!d.classList.contains('settled')) d.textContent = SYM[FACES[(tick + i) % 6]];
      });
    }, 60);

    await sleep(750);

    // ils s'immobilisent un par un, et se colorent selon leur verdict
    const hitOn = UNITS[defender.type].hitOn;
    for (let i = 0; i < report.faces.length; i++) {
      const f = report.faces[i];
      const d = dice[i];
      d.style.animationDelay = '0ms';
      d.classList.remove('rolling');
      d.classList.add('settled', hitOn.includes(f) ? 'isHit' : f === 'flag' ? 'isFlag' : 'isMiss');
      d.textContent = SYM[f];
      await sleep(190);
    }
    clearInterval(spin);
    await sleep(260);

    // les figurines perdues s'effacent dans le panneau du défenseur,
    // et le plateau reflète enfin le dénouement (repli, destruction)
    const lost = Math.min(figsBefore, report.hits + report.extraLoss);
    els.def.innerHTML = forcePanelHTML(defender, terrainKey, 'Défenseur', figsBefore, lost);
    requestDraw();

    const line = (txt, cls = '') => {
      const p = document.createElement('div');
      p.className = 'line ' + cls;
      p.textContent = txt;
      els.out.appendChild(p);
    };

    line(
      report.hits ? `${report.hits} touche${report.hits > 1 ? 's' : ''}` : 'Aucune touche',
      report.hits ? 'hit' : '',
    );
    await sleep(280);
    if (report.flags) {
      line(
        report.retreated
          ? `${report.flags} drapeau${report.flags > 1 ? 'x' : ''} — repli d’un hex`
          : `${report.flags} drapeau${report.flags > 1 ? 'x' : ''} — repli impossible : ${report.extraLoss} perte(s)`,
        'flagline',
      );
      await sleep(280);
    }
    if (report.killed) {
      line(`★ ${UNITS[defender.type].label} anéantie — médaille ${SIDE_FR[attacker.side]}`, 'kill');
      await sleep(200);
    } else {
      line(`Il reste ${defender.figs} figurine${defender.figs > 1 ? 's' : ''} au défenseur.`);
    }

    await new Promise((res) => {
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        els.scrim.classList.remove('on');
        els.btn.onclick = null;
        getUi().modalOpen = false;
        res();
      };
      els.btn.classList.add('on');
      els.btn.onclick = close;
      if (auto) setTimeout(close, 2100);
    });
  }

  return { play };
}
