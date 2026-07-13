// HUD DOM : journal, plateau de dés, médailles, invite, infobulle.

import { SYM } from './html.js';

export function createHud() {
  const els = {
    log: document.getElementById('log'),
    tray: document.getElementById('tray'),
    mAllies: document.getElementById('mAllies'),
    mAxis: document.getElementById('mAxis'),
    prompt: document.getElementById('prompt'),
    tip: document.getElementById('tip'),
  };

  function log(txt, cls = '') {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.textContent = txt;
    els.log.prepend(p);
  }

  function clearLog() {
    els.log.innerHTML = '';
  }

  function showDice(faces) {
    els.tray.innerHTML = '';
    faces.forEach((f, i) => {
      const d = document.createElement('div');
      d.className = 'die' + (f === 'flag' ? ' flag' : '') + (f === 'star' ? ' miss' : '');
      d.style.animationDelay = i * 45 + 'ms';
      d.textContent = SYM[f];
      els.tray.appendChild(d);
    });
  }

  function clearDice() {
    els.tray.innerHTML = '';
  }

  function setMedals(state) {
    els.mAllies.textContent = state.medals.allies;
    els.mAxis.textContent = state.medals.axis;
  }

  function setPrompt(txt) {
    els.prompt.textContent = txt;
  }

  function setTip(html) {
    els.tip.innerHTML = html;
  }

  function moveTip(cx, cy) {
    const pad = 16;
    const w = 212;
    const h = els.tip.offsetHeight || 150;
    let x = cx + pad;
    let y = cy + pad;
    if (x + w > window.innerWidth - 8) x = cx - w - pad;
    if (y + h > window.innerHeight - 8) y = Math.max(8, cy - h - pad);
    els.tip.style.left = x + 'px';
    els.tip.style.top = y + 'px';
    els.tip.classList.add('on');
  }

  function hideTip() {
    els.tip.classList.remove('on');
  }

  return { log, clearLog, showDice, clearDice, setMedals, setPrompt, setTip, moveTip, hideTip };
}
