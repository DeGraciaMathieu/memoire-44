// Modale de combat : mise en scène d'un résultat DÉJÀ résolu par les règles.
// play() reçoit l'outcome d'attackUnit et déroule l'animation ; elle ne
// décide rien.

import { FACES, OBSTACLES, UNITS } from '../src/config.js';
import { key } from '../src/hex.js';
import { SIDE_FR, SYM, calcHTML, faceHTML, forcePanelHTML } from './html.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createCombatModal({ requestDraw, getUi }) {
  const els = {
    scrim: document.getElementById('scrim'),
    head: document.getElementById('dHead'),
    atk: document.getElementById('dAtk'),
    def: document.getElementById('dDef'),
    calc: document.getElementById('dCalc'),
    dice: document.getElementById('dDice'),
    save: document.getElementById('dSave'),
    saveHead: document.getElementById('dSaveHead'),
    saveDice: document.getElementById('dSaveDice'),
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
    els.save.hidden = true;
    els.saveDice.innerHTML = '';
    els.out.innerHTML = '';
    els.btn.classList.remove('on');
    els.scrim.classList.add('on');

    await sleep(520);

    const line = (txt, cls = '') => {
      const p = document.createElement('div');
      p.className = 'line ' + cls;
      p.textContent = txt;
      els.out.appendChild(p);
    };

    // Une volée de dés : ils roulent (le résultat est déjà tiré), puis
    // s'immobilisent un par un, colorés selon leur verdict.
    const rollRow = async (faces, verdictOf, host = els.dice) => {
      const dice = faces.map((_, i) => {
        const d = document.createElement('div');
        d.className = 'die rolling';
        d.style.animationDelay = i * 55 + 'ms'; // désynchronise les culbutes
        host.appendChild(d);
        return d;
      });
      let tick = 0;
      const spin = setInterval(() => {
        tick++;
        dice.forEach((d, i) => {
          if (!d.classList.contains('settled')) d.innerHTML = faceHTML(FACES[(tick + i) % 6]);
        });
      }, 60);
      await sleep(750);
      for (let i = 0; i < faces.length; i++) {
        const d = dice[i];
        d.style.animationDelay = '0ms';
        d.classList.remove('rolling');
        d.classList.add('settled', verdictOf(faces[i]));
        d.innerHTML = faceHTML(faces[i]);
        await sleep(190);
      }
      clearInterval(spin);
    };

    const hitOn = UNITS[defender.type].hitOn;
    await rollRow(report.faces, (f) =>
      hitOn.includes(f) ? 'isHit' : f === 'flag' ? 'isFlag' : 'isMiss',
    );

    // Défenseur rerollHits (Tigre) : sa réaction s'affiche SOUS les dés de
    // l'attaque — les dés qui ont touché sont relancés, seules les faces
    // listées confirment, le reste est ignoré.
    if (report.reroll) {
      await sleep(300);
      const confirmOn = UNITS[defender.type].rerollHits;
      els.saveHead.textContent =
        `Réaction du défenseur — le ${UNITS[defender.type].label} relance ` +
        `les dés qui l’ont touché : seul ${confirmOn.map((f) => SYM[f]).join(' ')} confirme`;
      els.save.hidden = false;
      await rollRow(
        report.reroll,
        (f) => (confirmOn.includes(f) ? 'isHit' : 'isMiss'),
        els.saveDice,
      );
    }
    await sleep(260);

    // les figurines perdues s'effacent dans le panneau du défenseur,
    // et le plateau reflète enfin le dénouement (repli, destruction)
    const lost = Math.min(figsBefore, report.hits + report.extraLoss);
    els.def.innerHTML = forcePanelHTML(defender, terrainKey, 'Défenseur', figsBefore, lost);
    requestDraw();

    const s = report.hits > 1 ? 's' : '';
    line(
      report.hits
        ? `${report.hits} touche${s}${report.reroll ? ` confirmée${s}` : ''}`
        : report.reroll
          ? 'Aucune touche confirmée'
          : 'Aucune touche',
      report.hits ? 'hit' : '',
    );
    await sleep(280);
    if (report.flagsIgnored) {
      line(`1 drapeau ignoré (${OBSTACLES[outcome.obstacleKey].label.toLowerCase()})`, 'flagline');
      await sleep(280);
    }
    const flagsLeft = report.flags - report.flagsIgnored;
    if (flagsLeft) {
      line(
        report.retreated
          ? `${flagsLeft} drapeau${flagsLeft > 1 ? 'x' : ''} — repli d’un hex`
          : `${flagsLeft} drapeau${flagsLeft > 1 ? 'x' : ''} — repli impossible : ${report.extraLoss} perte(s)`,
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
