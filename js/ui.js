/*
 * UI: renders screens from game state and wires up clicks.
 * Screens: setup → (online: lobby) → toss → game.
 * All colours, fonts and textures come from the active theme stylesheet.
 */
(function (VC) {
  'use strict';

  const E = VC.Engine, P = VC.Pieces;
  const app = document.getElementById('app');
  const STORE = 'viking-chess:settings';
  const DEFAULTS = { mode: 'cpu', names: ['Player 1', 'Player 2'], sides: 'toss', level: 'normal', theme: 'oak', coords: true };

  // Each theme is one stylesheet in css/themes/, scoped to [data-theme="id"].
  const THEMES = [
    { id: 'oak', name: 'Carved Oak' },
    { id: 'linen', name: 'Linen & Knot' },
    { id: 'runestone', name: 'Runestone' },
    { id: 'saga', name: 'Saga' },
  ];

  const LEVELS = [
    { id: 'easy', name: 'Easy', blurb: 'Learning the ropes' },
    { id: 'normal', name: 'Normal', blurb: 'A fair fight' },
    { id: 'hard', name: 'Hard', blurb: 'Thinks further ahead' },
  ];

  const RULES = [
    ['Attackers move first', 'Players take turns, moving one piece each turn.'],
    ['Move like a rook', 'A piece slides any number of empty squares in a straight line. No diagonals, no jumping over pieces.'],
    ['Marked squares', 'Only the King may stop on the throne (centre) or the four corners. Other pieces may pass over the empty throne.'],
    ['Sandwich to capture', 'Trap an enemy between two of your pieces in a row or column. Several can fall in one move. Moving between two enemies yourself is safe.'],
    ['Hostile squares', 'The corners, and the throne when empty, act as an enemy piece. The King is armed and helps his defenders capture.'],
    ['Capturing the King', 'Attackers must close all four sides of him, or three sides plus the throne. He can\'t be captured on the board edge.'],
    ['Victory', 'Defenders win when the King reaches a corner. Attackers win by capturing him. A side with no legal move loses.'],
    ['No endless loops', 'If the same position comes up a third time, the game is a draw.'],
  ];

  let settings = loadSettings();
  if (!THEMES.some(t => t.id === settings.theme)) settings.theme = DEFAULTS.theme;
  applyTheme();

  const view = {
    screen: 'setup', game: null, toss: null, timers: [],
    selected: null, seenPly: 0, cpuKey: '',
    online: null, joinCode: '', notice: null, rulesOpen: false, hideResult: false,
  };

  /* ---------- helpers ---------- */

  function loadSettings() {
    const base = JSON.parse(JSON.stringify(DEFAULTS));
    try { return Object.assign(base, JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { return base; }
  }
  function saveSettings() {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) { /* private mode */ }
  }
  function applyTheme() { document.documentElement.dataset.theme = settings.theme; }

  const esc = str => String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function later(fn, ms) { view.timers.push(setTimeout(fn, ms)); }
  function clearTimers() { view.timers.forEach(clearTimeout); view.timers = []; }

  function go(screen) {
    clearTimers();
    view.screen = screen;
    view.selected = null;
    render();
    window.scrollTo(0, 0);
  }

  const modeAvailable = mode => (mode === 'cpu' ? !!VC.AI : mode === 'online' ? !!VC.Net : true);
  if (!modeAvailable(settings.mode)) settings.mode = 'pvp';

  function playerName(i) {
    if (settings.mode === 'cpu' && i === 1) return 'Computer';
    return (settings.names[i] || '').trim() || `Player ${i + 1}`;
  }

  // Whose moves does this device make?
  function isMine(i) {
    return view.online ? i === view.online.me : !view.game.players[i].isCPU;
  }
  const isGuest = () => !!view.online && view.online.role === 'guest';
  const isHost = () => !!view.online && view.online.role === 'host';

  const turnPlayer = g => E.playerOf(g, g.turn);
  const myTurn = g => !g.winner && view.screen === 'game' && isMine(turnPlayer(g));
  const sideClass = side => (side === 'A' ? 's-A' : 's-D');
  const nameOf = (g, side) => g.players[E.playerOf(g, side)].name;

  /* ---------- board ---------- */

  function boardHTML(g, opts) {
    const o = opts || {};
    const b = g.board, interactive = !o.static && myTurn(g);
    const sel = view.selected;
    const targets = new Set(interactive && sel !== null ? E.movesFrom(b, sel) : []);
    const capturing = new Set();
    if (targets.size) {
      targets.forEach(t => {
        const m = E.applyMove(b, sel, t);
        if (m.captured.length || m.kingTaken || m.escaped) capturing.add(t);
        E.undoMove(b, m);
      });
    }
    const last = g.history[g.history.length - 1];
    const k = E.findKing(b);
    const kingRisk = k >= 0 && !E.ON_EDGE[k] && E.kingPressure(b, k) >= 3 && !g.winner;
    const movable = interactive ? new Set(E.legalMoves(b, g.turn).map(m => m[0])) : new Set();
    const camps = new Set(E.START_ATTACKERS);
    const fresh = !o.static && g.history.length === view.seenPly + 1 ? last : null;

    const cells = [];
    for (let i = 0; i < E.N; i++) {
      const r = Math.floor(i / E.SIZE), c = i % E.SIZE, p = b[i];
      const cls = ['cell', (r + c) % 2 ? 'odd' : 'even'];
      if (E.IS_CORNER[i]) cls.push('corner');
      if (i === E.THRONE) cls.push('throne');
      if (camps.has(i)) cls.push('camp');
      if (movable.has(i)) cls.push('movable');
      if (i === sel) cls.push('selected');
      if (targets.has(i)) cls.push('target');
      if (capturing.has(i)) cls.push('strike');
      if (last && i === last.from) cls.push('last-from');
      if (last && i === last.to) cls.push('last-to');
      if (p === E.KING && kingRisk) cls.push('king-risk');
      if (p === E.KING && g.winner === 'D' && g.reason === 'escape') cls.push('king-free');
      const special = E.IS_CORNER[i] || i === E.THRONE ? `${P.mark('knot')}${P.mark('rune')}` : '';
      const ghost = fresh && fresh.captured.some(([ci]) => ci === i)
        ? P.svg(fresh.captured.find(([ci]) => ci === i)[1], 'ghost') : '';
      const label = `${E.square(i)}${p ? ' ' + ({ 1: 'attacker', 2: 'defender', 3: 'king' }[p]) : ''}${targets.has(i) ? ', move here' : ''}`;
      cells.push(`<button class="${cls.join(' ')}" data-cell="${i}" style="--r:${r}" aria-label="${label}"${interactive ? '' : ' tabindex="-1"'}>
        ${special}${p ? P.svg(p) : ''}${ghost}</button>`);
    }
    const files = 'abcdefghijk'.split('').map(l => `<span>${l}</span>`).join('');
    const ranks = Array.from({ length: E.SIZE }, (_, n) => `<span>${E.SIZE - n}</span>`).join('');
    return `<div class="frame${settings.coords ? ' with-coords' : ''}">
      <div class="coords files top">${files}</div><div class="coords files bottom">${files}</div>
      <div class="coords ranks left">${ranks}</div><div class="coords ranks right">${ranks}</div>
      <div class="grid${interactive ? ' live' : ''}">${cells.join('')}</div>
    </div>`;
  }

  // Slide the piece that just moved from its old square (FLIP), once per move.
  function animateLastMove() {
    const g = view.game;
    if (!g || view.screen !== 'game') return;
    const n = g.history.length;
    if (n === view.seenPly) return;
    const fresh = n === view.seenPly + 1;
    view.seenPly = n;
    if (!fresh) return;
    const last = g.history[n - 1];
    const fromEl = app.querySelector(`[data-cell="${last.from}"]`);
    const toEl = app.querySelector(`[data-cell="${last.to}"]`);
    const piece = toEl && toEl.querySelector('.piece:not(.ghost)');
    if (!fromEl || !piece) return;
    const a = fromEl.getBoundingClientRect(), z = toEl.getBoundingClientRect();
    piece.style.transition = 'none';
    piece.style.transform = `translate(${a.left - z.left}px, ${a.top - z.top}px)`;
    piece.classList.add('moving');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      piece.style.transition = '';
      piece.style.transform = '';
      setTimeout(() => piece.classList.remove('moving'), 400);
    }));
    if (last.captured.length) {
      const victims = last.captured.map(([, p]) => p);
      const what = victims.length === 1
        ? (victims[0] === E.ATK ? 'An attacker' : 'A defender') + ' is captured'
        : `${victims.length} ${victims[0] === E.ATK ? 'attackers' : 'defenders'} are captured`;
      toast(`${what}!`, last.side);
    }
  }

  function toast(text, side) {
    const wrap = app.querySelector('.board-wrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = `toast ${sideClass(side)}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="toast-icon">⚔</span>${esc(text)}`;
    wrap.appendChild(el);
    setTimeout(() => el.classList.add('out'), 1900);
    setTimeout(() => el.remove(), 2400);
  }

  /* ---------- setup screen ---------- */

  function chip(key, value, label, disabled) {
    return `<button class="chip${settings[key] === value ? ' selected' : ''}" data-action="set" data-key="${key}" data-value="${value}"${disabled ? ' disabled title="Coming soon"' : ''}>${label}</button>`;
  }

  function playerColumn(i) {
    const cpu = settings.mode === 'cpu' && i === 1;
    return `<div class="player-col p-${i}">
      <label class="name-label" for="name-${i}">${settings.mode === 'online' ? 'You' : `Player ${i + 1}`}${cpu ? ' · computer' : ''}</label>
      <input id="name-${i}" class="name-input" data-name="${i}" maxlength="16" autocomplete="off"
        value="${esc(cpu ? 'Computer' : settings.names[i])}"${cpu ? ' disabled' : ''}>
    </div>`;
  }

  function sidePick(value, title, blurb, icons) {
    return `<button class="side-pick${settings.sides === value ? ' selected' : ''}" data-action="set" data-key="sides" data-value="${value}">
      <span class="side-icons">${icons}</span><span class="sp-title">${title}</span><span class="sp-blurb">${blurb}</span></button>`;
  }

  function themePreview(id) {
    // a 4 × 4 corner of the board in that theme's colours
    const layout = { 0: 'corner', 2: 1, 5: 3, 6: 2, 11: 1, 15: 2 };
    const cells = Array.from({ length: 16 }, (_, i) => {
      const v = layout[i];
      return `<span class="cell ${(Math.floor(i / 4) + i) % 2 ? 'odd' : 'even'}${v === 'corner' ? ' corner' : ''}" style="--r:${Math.floor(i / 4)}">
        ${v === 'corner' ? P.mark('knot') + P.mark('rune') : v ? P.svg(v) : ''}</span>`;
    }).join('');
    return `<span class="tp" data-theme="${id}"><span class="frame"><span class="grid mini">${cells}</span></span></span>`;
  }

  function renderSetup() {
    const cpu = settings.mode === 'cpu', online = settings.mode === 'online';
    const p0 = esc(online ? 'You' : playerName(0));
    const themes = THEMES.map(t => `<button class="theme-card${settings.theme === t.id ? ' selected' : ''}" data-action="set" data-key="theme" data-value="${t.id}">
      ${themePreview(t.id)}<span class="tc-name">${t.name}</span></button>`).join('');
    const levels = LEVELS.map(l => `<button class="level-card${settings.level === l.id ? ' selected' : ''}" data-action="set" data-key="level" data-value="${l.id}">
      <span class="lv-name">${l.name}</span><span class="lv-blurb">${l.blurb}</span></button>`).join('');
    const sides = [
      sidePick('toss', 'Rune toss', 'The winner chooses a side', `${P.svg('A')}<span class="or">or</span>${P.svg('K')}`),
      sidePick('attack', `${p0} attacks`, '24 attackers · move first', P.svg('A') + P.svg('A')),
      sidePick('defend', `${p0} defends`, 'The King and 12 defenders', P.svg('D') + P.svg('K')),
    ].join('');

    return `<section class="screen setup">
      <header class="title-block">
        <p class="runes" aria-hidden="true">ᚺᚾᛖᚠᚨᛏᚨᚠᛚ</p>
        <h1 class="logo">Hnefatafl</h1>
        <p class="tagline">Viking Chess · Lead the King to a corner, or close the trap around him.</p>
      </header>
      <div class="panel setup-panel">
        ${typeof resumeCards === 'function' ? resumeCards() : ''}
        <div class="field">
          <h2 class="step"><span class="num">1</span>Who are you playing?</h2>
          <div class="choice-row">${chip('mode', 'cpu', 'vs Computer', !modeAvailable('cpu'))}${chip('mode', 'pvp', 'vs a Friend · same screen')}${chip('mode', 'online', 'Online · different devices', !modeAvailable('online'))}</div>
          ${online && typeof joinBox === 'function' ? joinBox() : ''}
        </div>
        <div class="field">
          <h2 class="step"><span class="num">2</span>${online ? 'Your name' : 'Players'}</h2>
          <div class="players">${online
            ? `${playerColumn(0)}<div class="player-col online-note p-1">
                <span class="name-label">Your opponent</span>
                <p>Plays from their own phone or computer: they open this game, choose <b>Online</b>, and type the
                room code you'll get on the next screen. No account or install needed.</p></div>`
            : playerColumn(0) + playerColumn(1)}</div>
          ${cpu ? `<div class="sub-field"><span class="sub-label">Computer strength</span><div class="level-grid">${levels}</div></div>` : ''}
        </div>
        <div class="field">
          <h2 class="step"><span class="num">3</span>Sides</h2>
          <div class="side-grid">${sides}</div>
        </div>
        <div class="field">
          <h2 class="step"><span class="num">4</span>Board style</h2>
          <div class="theme-grid">${themes}</div>
          <label class="toggle"><input type="checkbox" data-toggle="coords"${settings.coords ? ' checked' : ''}> Show square names (a–k, 1–11)</label>
        </div>
        <div class="field">
          <h2 class="step"><span class="num">?</span>How to play</h2>
          ${rulesList()}
        </div>
        <div class="start-row">${online
          ? '<button class="btn primary big" data-action="create-room">Create a room →</button>'
          : `<button class="btn primary big" data-action="start">${settings.sides === 'toss' ? 'To the rune toss →' : 'Begin the battle →'}</button>`}</div>
      </div>
      <footer class="credit">Hnefatafl, “the King's table”, was played across the Viking world over a thousand years ago.
        These are the common 11 × 11 rules.</footer>
    </section>`;
  }

  function rulesList() {
    return `<ol class="rules">${RULES.map(([title, text], n) => `<li><span class="rule-num">${n + 1}</span><b>${title}</b><span>${text}</span></li>`).join('')}</ol>`;
  }

  function newGame(players) {
    view.game = E.create({ players });
    view.seenPly = 0;
    view.cpuKey = '';
    view.selected = null;
    view.hideResult = false;
  }

  function startGame() {
    saveSettings();
    const players = view.online
      ? [{ name: playerName(0) }, { name: view.online.guest.name, isCPU: !view.online.guestConnected }]
      : [0, 1].map(i => ({ name: playerName(i), isCPU: settings.mode === 'cpu' && i === 1, level: settings.level }));
    newGame(players);
    if (view.online && !view.online.guestConnected) view.game.players[1].standIn = true;
    if (settings.sides === 'toss') {
      view.toss = { call: null, result: null, winner: null, done: false, picked: null };
      go('toss');
    } else {
      view.toss = null;
      E.setSides(view.game, settings.sides === 'attack' ? 0 : 1);
      go('game');
    }
  }

  /* ---------- rune toss ---------- */

  const FACES = { odin: { rune: 'ᛟ', name: 'Odin' }, tyr: { rune: 'ᛏ', name: 'Tyr' } };

  function waitingFor(name) {
    return `<p class="toss-prompt">Waiting for <b>${esc(name)}</b><span class="dots"><i>.</i><i>.</i><i>.</i></span></p>`;
  }

  function renderToss() {
    const g = view.game, t = view.toss, caller = g.players[0];
    let coin = '', body;
    if (!t.call) {
      body = isMine(0)
        ? `<p class="toss-prompt"><b>${esc(caller.name)}</b>, call the rune!</p>
          <div class="choice-row center">
            <button class="btn big" data-action="call" data-value="odin"><span class="rune-glyph">ᛟ</span> Odin</button>
            <button class="btn big" data-action="call" data-value="tyr"><span class="rune-glyph">ᛏ</span> Tyr</button>
          </div>`
        : `${waitingFor(caller.name)}<p class="muted">They're calling Odin or Tyr.</p>`;
    } else if (!t.done) {
      coin = 'flip-' + t.result;
      body = `<p class="toss-prompt">${esc(caller.name)} calls <b>${FACES[t.call].name}</b>…</p>`;
    } else {
      coin = 'show-' + t.result;
      const w = g.players[t.winner];
      let pick;
      if (t.picked) {
        const atk = g.players[E.playerOf(g, 'A')], def = g.players[E.playerOf(g, 'D')];
        pick = `<p class="toss-prompt"><b>${esc(atk.name)}</b> leads the Attackers. <b>${esc(def.name)}</b> defends the King.</p>
          ${isGuest() ? waitingFor(caller.name) : '<button class="btn primary big" data-action="begin">Begin the battle →</button>'}`;
      } else if (isMine(t.winner)) {
        pick = `<p class="toss-prompt"><b>${esc(w.name)}</b>, choose your side</p>
          <div class="side-grid two">
            <button class="side-pick" data-action="pick" data-value="A"><span class="side-icons">${P.svg('A')}${P.svg('A')}</span>
              <span class="sp-title">Attackers</span><span class="sp-blurb">24 warriors · move first · capture the King</span></button>
            <button class="side-pick" data-action="pick" data-value="D"><span class="side-icons">${P.svg('D')}${P.svg('K')}</span>
              <span class="sp-title">Defenders</span><span class="sp-blurb">The King and 12 · reach a corner</span></button>
          </div>`;
      } else {
        pick = `${waitingFor(w.name)}<p class="muted">They're choosing a side.</p>`;
      }
      body = `<p class="toss-result">${FACES[t.result].name}!</p>
        <p class="toss-prompt"><b>${esc(w.name)}</b> wins the toss.</p>${pick}`;
    }
    return `<section class="screen toss">
      <div class="panel toss-panel">
        <h2 class="panel-title">Rune toss</h2>
        ${themeSwitch()}
        <div class="coin-stage"><div class="coin ${coin}">
          <div class="face odin"><span>ᛟ</span></div><div class="face tyr"><span>ᛏ</span></div></div></div>
        ${body}
        ${view.online
          ? '<button class="btn small ghost" data-action="leave">Leave room</button>'
          : '<button class="btn small ghost" data-action="back-setup">← Back to setup</button>'}
      </div>
    </section>`;
  }

  function callToss(value) {
    const t = view.toss;
    if (!t || t.call || !isMine(0)) return;
    t.call = value;
    t.result = Math.random() < 0.5 ? 'odin' : 'tyr';
    t.winner = t.call === t.result ? 0 : 1;
    render();
    later(() => {
      t.done = true;
      render();
      if (view.game.players[t.winner].isCPU) later(() => pickSide(t.winner, Math.random() < 0.5 ? 'A' : 'D'), 1100);
    }, 1800);
  }

  function pickSide(who, side) {
    const t = view.toss, g = view.game;
    if (!t || !t.done || t.picked || who !== t.winner) return;
    t.picked = side;
    E.setSides(g, side === 'A' ? who : 1 - who);
    render();
  }

  /* ---------- game screen ---------- */

  function themeSwitch() {
    const opts = THEMES.map(t => `<option value="${t.id}"${settings.theme === t.id ? ' selected' : ''}>${t.name}</option>`).join('');
    return `<label class="theme-switch">Board <select data-change="theme">${opts}</select></label>`;
  }

  function statusText(g) {
    if (g.winner) return resultHeadline(g);
    const i = turnPlayer(g), p = g.players[i], side = E.sideName(g.turn);
    if (p.isCPU) return `<b>${esc(p.name)}</b> is thinking<span class="dots"><i>.</i><i>.</i><i>.</i></span>`;
    if (view.online && !isMine(i)) return `Waiting for <b>${esc(p.name)}</b> <small>(${side})</small><span class="dots"><i>.</i><i>.</i><i>.</i></span>`;
    if (view.online || settings.mode === 'cpu') return `Your move · <b>${side}</b>`;
    return `<b>${esc(p.name)}</b> · ${side} to move`;
  }

  function warnings(g) {
    if (g.winner) return '';
    const k = E.findKing(g.board);
    const routes = E.escapeRoutes(g.board, k).length;
    const out = [];
    if (routes) out.push(`<span class="warn escape">The King has a clear path to ${routes > 1 ? `${routes} corners` : 'a corner'}!</span>`);
    if (!E.ON_EDGE[k] && E.kingPressure(g.board, k) === 3) out.push('<span class="warn danger">The King is nearly surrounded!</span>');
    const reps = E.repeats(g);
    if (reps === E.REPEAT_LIMIT - 1) out.push('<span class="warn">This position has come up twice. A third time is a draw.</span>');
    return out.join('');
  }

  function sideCard(g, side) {
    const i = E.playerOf(g, side), p = g.players[i];
    const c = E.counts(g.board), took = E.taken(g);
    const onBoard = side === 'A' ? c.A : c.D + c.K;
    const total = side === 'A' ? 24 : 13;
    const isTurn = !g.winner && g.turn === side;
    const enemy = side === 'A' ? 'D' : 'A';
    const trayCount = took[side];
    const tray = trayCount ? Array.from({ length: trayCount }, () => P.svg(enemy, 'mini')).join('') : '<small class="muted">No captures yet</small>';
    const tags = [E.sideName(side)];
    if (p.standIn) tags.push('computer standing in');
    else if (p.isCPU) tags.push(`computer · ${p.level}`);
    if (view.online && view.online.me === i) tags.push('you');
    return `<aside class="panel side-card ${sideClass(side)}${isTurn ? ' is-turn' : ''}${g.winner === side ? ' winner' : ''}">
      <div class="side-head">
        <span class="side-icon">${side === 'A' ? P.svg('A') : P.svg('K')}</span>
        <div class="side-id"><h3>${esc(p.name)}</h3><span class="tag">${tags.join(' · ')}</span></div>
      </div>
      <p class="goal">${side === 'A' ? 'Surround and capture the King' : 'Lead the King to a corner'}</p>
      <div class="stats">
        <div><b>${onBoard}</b><small>of ${total} on board</small></div>
        <div><b>${trayCount}</b><small>captured</small></div>
      </div>
      <div class="tray">${tray}</div>
      ${typeof seatStatus === 'function' ? seatStatus(i) : ''}
      <div class="turn-flag">${isTurn ? (p.isCPU ? 'Thinking…' : 'To move') : ''}</div>
    </aside>`;
  }

  function moveLog(g) {
    if (!g.history.length) return '<p class="muted">No moves yet. Attackers open the battle.</p>';
    const rows = [];
    for (let n = 0; n < g.history.length; n += 2) {
      const a = g.history[n], d = g.history[n + 1];
      rows.push(`<li><span class="mv-no">${n / 2 + 1}.</span><span class="mv ${sideClass(a.side)}">${E.notation(a)}</span><span class="mv ${d ? sideClass(d.side) : ''}">${d ? E.notation(d) : ''}</span></li>`);
    }
    return `<ol class="log">${rows.reverse().join('')}</ol>`;
  }

  function canUndo(g) {
    if (isGuest() || (isHost() && !view.online.guestConnected && !g.players[1].isCPU)) return !!g.history.length || !!g.resigned;
    if (g.resigned) return true;
    // vs computer: only if one of your own moves is there to take back
    return g.history.some(h => isMine(E.playerOf(g, h.side)));
  }

  function resultHeadline(g) {
    const winnerName = g.winner === 'draw' ? '' : esc(nameOf(g, g.winner));
    switch (g.reason) {
      case 'escape': return `The King escapes! <b>${winnerName}</b> wins`;
      case 'capture': return `The King is captured! <b>${winnerName}</b> wins`;
      case 'stuck': return `${E.sideName(E.other(g.winner))} have no moves left. <b>${winnerName}</b> wins`;
      case 'repetition': return 'Draw by repetition';
      case 'resign': return `${E.sideName(g.resigned)} yield. <b>${winnerName}</b> wins`;
      default: return '';
    }
  }

  function resultCard(g) {
    if (!g.winner || view.hideResult) return '';
    const titles = {
      escape: 'The King escapes!', capture: 'The King has fallen!', stuck: 'No moves left',
      repetition: 'A stalemate of shields', resign: 'The battle is yielded',
    };
    const moves = Math.ceil(g.history.length / 2);
    const line = g.winner === 'draw'
      ? `The same position came up three times. The saga ends in a draw after ${plural(moves, 'move')}.`
      : `<b>${esc(nameOf(g, g.winner))}</b> wins with the ${E.sideName(g.winner)} after ${plural(moves, 'move')}.`;
    const icon = g.winner === 'A' ? P.svg('A') + P.svg('A') : g.winner === 'D' ? P.svg('K') : P.svg('A') + P.svg('K');
    const actions = isGuest()
      ? `${waitingFor(g.players[0].name)}`
      : `<button class="btn primary" data-action="rematch">Rematch · swap sides</button>
         <button class="btn" data-action="${view.online ? 'leave' : 'new'}">${view.online ? 'Leave room' : 'New game'}</button>`;
    return `<div class="result-card${g.winner !== 'draw' ? ' ' + sideClass(g.winner) : ''}" role="dialog" aria-label="Game over">
      <span class="result-icons">${icon}</span>
      <p class="kicker">${g.winner === 'draw' ? 'Draw' : `${E.sideName(g.winner)} win`}</p>
      <h2 class="result-title">${titles[g.reason]}</h2>
      <p>${line}</p>
      <div class="result-actions">${actions}
        <button class="btn ghost small" data-action="view-board">View the board</button></div>
    </div>`;
  }

  function renderGame() {
    const g = view.game;
    const sideFirst = 'A';
    const roomChip = view.online ? `<span class="room-chip">Room ${view.online.code}</span>` : '';
    const undoLabel = view.online ? 'Ask to undo' : 'Undo';
    const restartLabel = view.online ? 'Ask to restart' : 'Restart';
    return `<section class="screen game">
      <header class="panel game-bar">
        <span class="bar-logo">Hnefatafl</span>
        <span class="bar-meta">${roomChip}Move ${Math.floor(g.history.length / 2) + 1}</span>
        ${themeSwitch()}
        <button class="btn small ghost" data-action="rules">Rules</button>
        <button class="btn small ghost" data-action="quit">${view.online ? 'Leave' : 'Quit'}</button>
      </header>
      <div class="game-grid">
        <div class="col col-left">${sideCard(g, sideFirst)}
          <div class="panel log-panel"><h3 class="panel-sub">Saga of moves</h3>${moveLog(g)}</div>
        </div>
        <div class="board-col">
          <div class="status-line ${g.winner ? 'over' : sideClass(g.turn)}">${statusText(g)}</div>
          <div class="board-wrap${g.winner && !view.hideResult ? ' dimmed' : ''}">${boardHTML(g)}${resultCard(g)}</div>
          <div class="warnings">${warnings(g)}</div>
          <div class="controls">
            <button class="btn" data-action="undo"${canUndo(g) ? '' : ' disabled'}>↶ ${undoLabel}</button>
            <button class="btn" data-action="restart"${g.history.length || g.winner ? '' : ' disabled'}>⟲ ${restartLabel}</button>
            ${g.winner ? (view.hideResult ? '<button class="btn primary" data-action="show-result">Show result</button>' : '')
              : `<button class="btn ghost" data-action="resign"${myTurn(g) || (!view.online && settings.mode === 'pvp') ? '' : ' disabled'}>⚑ Yield</button>`}
          </div>
        </div>
        <div class="col col-right">${sideCard(g, E.other(sideFirst))}
          <div class="panel quick-rules"><h3 class="panel-sub">Remember</h3>
            <ul>
              <li>Sandwich an enemy to capture it.</li>
              <li>Only the King may stop on the <span class="mk">${P.mark('knot')}${P.mark('rune')}</span> squares.</li>
              <li>Corners and the empty throne are hostile.</li>
              <li>The King needs 4 sides closed (3 next to the throne), and is safe on the edge.</li>
            </ul>
          </div>
        </div>
      </div>
      ${view.rulesOpen ? rulesModal() : ''}
    </section>`;
  }

  function rulesModal() {
    return `<div class="modal-backdrop" data-action="close-rules"><div class="panel modal" role="dialog" aria-label="How to play">
      <h2 class="panel-title">How to play</h2>${rulesList()}
      <button class="btn primary" data-action="close-rules">Back to the battle</button></div></div>`;
  }

  /* ---------- moves ---------- */

  function clickCell(i) {
    const g = view.game;
    if (!g || !myTurn(g)) return;
    const sel = view.selected;
    if (sel !== null && E.movesFrom(g.board, sel).includes(i)) {
      view.selected = null;
      playMove(sel, i);
      return;
    }
    view.selected = E.sideOf(g.board[i]) === g.turn && sel !== i ? i : null;
    render();
  }

  function playMove(from, to) {
    if (isGuest()) { VC.Net.send({ t: 'act', d: { type: 'move', from, to } }); return; }
    if (!E.move(view.game, from, to)) return;
    afterChange();
  }

  function afterChange() {
    view.selected = null;
    view.cpuKey = '';
    if (view.game.winner) view.hideResult = false;
    render();
  }

  function undo() {
    const g = view.game;
    if (!canUndo(g)) return;
    if (view.online && typeof requestFromMe === 'function') { requestFromMe('undo'); return; }
    takeBack(g, null);
  }

  // Undo the last move; against the computer, go back to your own previous turn.
  function takeBack(g, forPlayer) {
    clearTimers();
    if (g.resigned) { E.undo(g); afterChange(); return; }
    const owner = forPlayer === null ? null : forPlayer;
    const mine = i => (owner === null ? isMine(i) : i === owner);
    const vsMachine = owner !== null || g.players.some(p => p.isCPU);
    if (!vsMachine) E.undo(g);
    else {
      // undo until a move by this player has been taken back and it's their turn
      let undoneMine = false;
      while (g.history.length && !(undoneMine && mine(turnPlayer(g)))) {
        const last = g.history[g.history.length - 1];
        if (mine(E.playerOf(g, last.side))) undoneMine = true;
        E.undo(g);
      }
    }
    view.seenPly = g.history.length;
    afterChange();
  }

  function restart() {
    const g = view.game;
    if (view.online && typeof requestFromMe === 'function') { requestFromMe('restart'); return; }
    if (!g.winner && !window.confirm('Restart this battle? The board goes back to the start, same sides.')) return;
    resetBoard(false);
  }

  // New board with the same players; swap sides for a rematch.
  function resetBoard(swap) {
    const old = view.game;
    const atk = E.playerOf(old, 'A');
    newGame(old.players.map(p => ({ name: p.name, isCPU: p.isCPU, level: p.level })));
    old.players.forEach((p, i) => { if (p.standIn) view.game.players[i].standIn = true; });
    E.setSides(view.game, swap ? 1 - atk : atk);
    clearTimers();
    render();
  }

  function resign() {
    const g = view.game;
    if (g.winner) return;
    const side = view.online ? g.players[view.online.me].side : g.turn;
    if (!window.confirm(`Yield the battle for the ${E.sideName(side)}?`)) return;
    if (isGuest()) { VC.Net.send({ t: 'act', d: { type: 'resign' } }); return; }
    E.resign(g, side);
    afterChange();
  }

  function scheduleCPU() {
    const g = view.game;
    if (!g || g.winner || view.screen !== 'game' || isGuest() || !VC.AI) return;
    const i = turnPlayer(g), p = g.players[i];
    if (!p.isCPU) return;
    const key = g.history.length + g.turn;
    if (view.cpuKey === key) return;
    view.cpuKey = key;
    later(() => {
      if (view.game !== g || g.winner || g.history.length + g.turn !== key) return;
      const mv = VC.AI.choose(g, p.level);
      if (mv && E.move(g, mv[0], mv[1])) afterChange();
    }, 450);
  }

  /* ---------- render & events ---------- */

  function render() {
    const screens = { setup: renderSetup, toss: renderToss, game: renderGame };
    if (typeof renderLobby === 'function') screens.lobby = renderLobby;
    const entering = view.screen !== view.renderedScreen;
    view.renderedScreen = view.screen;
    document.documentElement.dataset.screen = view.screen;
    const n = view.notice;
    const notice = n
      ? `<div class="notice" role="status"><span>${typeof n === 'function' ? n() : esc(n)}</span><button data-action="dismiss" aria-label="Dismiss">×</button></div>`
      : '';
    app.innerHTML = notice + screens[view.screen]();
    if (entering) app.querySelector('.screen').classList.add('enter');
    if (view.screen === 'game') { animateLastMove(); scheduleCPU(); }
    if (typeof afterRender === 'function') afterRender();
  }

  app.addEventListener('click', e => {
    const cell = e.target.closest('[data-cell]');
    if (cell && cell.closest('.grid.live')) { clickCell(Number(cell.dataset.cell)); return; }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    if (el.classList.contains('modal-backdrop') && e.target !== el) return; // clicks inside the dialog
    const d = el.dataset;
    switch (d.action) {
      case 'set':
        settings[d.key] = d.value;
        if (d.key === 'theme') applyTheme();
        saveSettings(); render();
        break;
      case 'start':
      case 'online-start':
        if (isGuest()) return;
        startGame();
        break;
      case 'call':
        callToss(d.value);
        break;
      case 'pick':
        if (isGuest()) VC.Net.send({ t: 'act', d: { type: 'pick', side: d.value } });
        else pickSide(view.toss.winner, d.value);
        break;
      case 'begin':
        if (isGuest()) return;
        go('game');
        break;
      case 'back-setup':
      case 'new':
        go('setup');
        break;
      case 'quit':
        if (!window.confirm(view.online ? 'Leave this online game? It ends for both players.' : 'Quit this battle? The game will be lost.')) break;
        if (view.online && typeof leaveRoom === 'function') leaveRoom(); else go('setup');
        break;
      case 'undo':
        undo();
        break;
      case 'restart':
        restart();
        break;
      case 'rematch':
        if (isGuest()) return;
        resetBoard(true);
        break;
      case 'resign':
        resign();
        break;
      case 'view-board':
        view.hideResult = true; render();
        break;
      case 'show-result':
        view.hideResult = false; render();
        break;
      case 'rules':
        view.rulesOpen = true; render();
        break;
      case 'close-rules':
        view.rulesOpen = false; render();
        break;
      case 'dismiss':
        view.notice = null; render();
        break;
      default:
        if (typeof onlineAction === 'function') onlineAction(d.action, el);
    }
  });

  app.addEventListener('change', e => {
    if (e.target.dataset.change === 'theme') {
      settings.theme = e.target.value;
      applyTheme();
      saveSettings();
    } else if (e.target.dataset.toggle) {
      settings[e.target.dataset.toggle] = e.target.checked;
      saveSettings();
    }
  });

  app.addEventListener('input', e => {
    if (e.target.dataset.code !== undefined) {
      view.joinCode = VC.Net.normaliseCode(e.target.value);
      e.target.value = view.joinCode;
      return;
    }
    const i = e.target.dataset.name;
    if (i === undefined) return;
    settings.names[Number(i)] = e.target.value;
    saveSettings();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (view.rulesOpen) { view.rulesOpen = false; render(); }
      else if (view.selected !== null) { view.selected = null; render(); }
    }
  });

  P.install();
  render();
})(window.VC);
