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
    request: null,  // online: { type: 'undo'|'restart', from: player index }
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
        ${resumeCards()}
        <div class="field">
          <h2 class="step"><span class="num">1</span>Who are you playing?</h2>
          <div class="choice-row">${chip('mode', 'cpu', 'vs Computer', !modeAvailable('cpu'))}${chip('mode', 'pvp', 'vs a Friend · same screen')}${chip('mode', 'online', 'Online · different devices', !modeAvailable('online'))}</div>
          ${online ? joinBox() : ''}
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
      ${seatStatus(i)}
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
    if (view.online) {
      if (view.request || g.resigned) return false;
      return g.history.some(h => E.playerOf(g, h.side) === view.online.me);
    }
    if (g.resigned) return true;
    if (!g.players.some(p => p.isCPU)) return g.history.length > 0;
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
          ${requestBanner(g)}
          <div class="board-wrap${g.winner && !view.hideResult ? ' dimmed' : ''}">${boardHTML(g)}${resultCard(g)}</div>
          <div class="warnings">${warnings(g)}</div>
          <div class="controls">
            <button class="btn" data-action="undo"${canUndo(g) ? '' : ' disabled'}>↶ ${undoLabel}</button>
            <button class="btn" data-action="restart"${(g.history.length || g.winner) && !(view.online && (view.request || g.winner)) ? '' : ' disabled'}>⟲ ${restartLabel}</button>
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
    if (view.online) { requestFromMe('undo'); return; }
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
    if (view.online) { requestFromMe('restart'); return; }
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

  /* ---------- online rooms ---------- */
  /*
   * The room creator's browser runs the game and sends a snapshot of the
   * state to the other player after every render. The other player only
   * sends their moves and answers. Board styles are never synced.
   */

  const Net = VC.Net;
  const HOSTED = 'viking-chess:hosted-game'; // room creator: the game in progress, to resume after a reload
  const JOINED = 'viking-chess:joined-room'; // joiner: room code + seat pass, to rejoin later
  const SAVE_HOURS = 12;
  const TAKEOVER_SECONDS = 60;
  const RECONNECT_TRIES = 40, RECONNECT_GAP = 3000; // keeps trying for about 2 minutes

  function readSaved(key) {
    try {
      const s = JSON.parse(localStorage.getItem(key));
      if (s && Date.now() - s.savedAt < SAVE_HOURS * 3600e3) return s;
    } catch (e) { /* corrupt or blocked */ }
    forget(key);
    return null;
  }
  function writeSaved(key, data) {
    try { localStorage.setItem(key, JSON.stringify(Object.assign({ savedAt: Date.now() }, data))); } catch (e) { /* full or blocked */ }
  }
  function forget(key) {
    try { localStorage.removeItem(key); } catch (e) { /* blocked */ }
  }

  const SIDE_SUMMARY = { toss: 'Sides by rune toss', attack: 'Room creator attacks', defend: 'Room creator defends' };

  function snapshot() {
    return { t: 'state', screen: view.screen, toss: view.toss, lobby: lobbyInfo(), game: view.game, request: view.request || null };
  }

  function lobbyInfo() {
    const o = view.online;
    return {
      host: { name: playerName(0) },
      guest: o.guest && o.guestConnected ? { name: o.guest.name } : null, // never send the seat pass
      summary: SIDE_SUMMARY[settings.sides] || '',
    };
  }

  // Called after every render: the room creator shares the state and saves the game.
  function afterRender() {
    if (!isHost() || view.online.status === 'creating') return;
    Net.send(snapshot());
    if (view.game && view.screen !== 'lobby') {
      const o = view.online;
      writeSaved(HOSTED, { code: o.code, screen: view.screen, toss: view.toss, game: view.game, guest: o.guest, request: view.request || null });
    }
  }

  /* room creator */

  function createRoom() {
    if (!Net.available()) { view.notice = 'Online play needs an internet connection.'; render(); return; }
    saveSettings();
    forget(HOSTED);
    view.resume = null;
    view.game = null;
    view.request = null;
    const o = view.online = { role: 'host', me: 0, code: '', status: 'creating', guest: null, guestConnected: false };
    go('lobby');
    Net.host(onHostEvent)
      .then(code => { o.code = code; o.status = 'waiting'; render(); })
      .catch(err => leaveRoom(err.message));
  }

  function resumeHost() {
    const saved = readSaved(HOSTED);
    view.resume = null;
    if (!saved) { render(); return; }
    if (!Net.available()) { view.notice = 'Online play needs an internet connection.'; render(); return; }
    view.game = saved.game;
    view.toss = saved.toss;
    view.request = saved.request || null;
    if (view.toss && view.toss.call) view.toss.done = true;
    view.seenPly = view.game.history.length;
    view.cpuKey = '';
    view.notice = null;
    const o = view.online = { role: 'host', me: 0, code: saved.code, status: 'creating', resuming: true, guest: saved.guest, guestConnected: false };
    go('lobby');
    Net.host(onHostEvent, { code: saved.code })
      .then(code => {
        o.status = 'ready';
        o.resuming = false;
        o.code = code;
        go(saved.screen);
        if (!o.guestConnected) guestAway();
        if (code !== saved.code) {
          view.notice = `Room ${saved.code} was still busy, so your game reopened as room ${code}. Send your friend the new code.`;
        }
        render();
      })
      .catch(err => leaveRoom(err.message, { keep: true }));
  }

  const cleanName = s => String(s || '').trim().slice(0, 16) || 'Player 2';

  function onHostEvent(ev) {
    const o = view.online;
    if (!o) return;
    if (ev.type === 'message' && ev.msg.t === 'hello') {
      const msg = ev.msg, token = String(msg.token || '');
      if (view.game) {
        // game under way: the seat is reserved for the device holding the seat pass,
        // unless the room creator has opened it to anyone
        const p = view.game.players[1];
        const owner = !!o.guest && token === o.guest.token;
        if (!owner && !o.seatOpen) {
          Net.reject(ev.from, { t: 'reserved', name: o.guest ? o.guest.name : '' });
          return;
        }
        Net.accept(ev.from);
        o.guestConnected = true;
        o.seatOpen = false;
        if (!owner) {
          const name = cleanName(msg.name);
          p.name = name;
          o.guest = { name, token };
        }
        guestBack(!owner);
      } else {
        // still in the lobby: anyone can take the empty seat
        if (o.guest && o.guestConnected && token !== o.guest.token) {
          Net.reject(ev.from, { t: 'full' });
          return;
        }
        Net.accept(ev.from);
        o.guest = { name: cleanName(msg.name), token };
        o.guestConnected = true;
      }
      render();
    } else if (ev.type === 'message' && ev.msg.t === 'act' && ev.active) {
      guestAct(ev.msg.d || {});
    } else if (ev.type === 'message' && ev.msg.t === 'bye' && ev.active) {
      o.leftOnPurpose = true; // their connection closes right after this
    } else if (ev.type === 'left') {
      const onPurpose = o.leftOnPurpose;
      o.leftOnPurpose = false;
      o.guestConnected = false;
      if (!view.game) o.guest = null; // lobby: free the seat
      else if (onPurpose) guestQuit();
      else guestAway();
      render();
    } else if (ev.type === 'error') {
      view.notice = ev.message;
      render();
    }
  }

  // The joiner's moves and answers, checked here before anything changes.
  function guestAct(d) {
    const g = view.game;
    if (!g || g.players[1].isCPU) return;
    if (d.type === 'move' && view.screen === 'game' && turnPlayer(g) === 1) {
      if (E.move(g, Number(d.from), Number(d.to))) afterChange();
    } else if (d.type === 'pick' && view.screen === 'toss') {
      pickSide(1, d.side === 'D' ? 'D' : 'A');
    } else if (d.type === 'resign' && view.screen === 'game' && !g.winner) {
      E.resign(g, g.players[1].side);
      afterChange();
    } else if (d.type === 'request' && view.screen === 'game' && !view.request && ['undo', 'restart'].includes(d.kind)) {
      if (d.kind === 'undo' && !g.history.some(h => E.playerOf(g, h.side) === 1)) return;
      view.request = { type: d.kind, from: 1 };
      render();
    } else if (d.type === 'answer' && view.request && view.request.from === 0) {
      answerRequest(!!d.accept);
    } else if (d.type === 'cancel' && view.request && view.request.from === 1) {
      view.request = null;
      render();
    }
  }

  // The joiner pressed Leave: the computer takes over at once and the seat opens to anyone.
  function guestQuit() {
    const o = view.online, g = view.game, p = g.players[1];
    stopTakeover();
    o.seatOpen = true;
    view.request = null;
    if (!g.winner && !p.isCPU) {
      p.isCPU = true;
      p.standIn = true;
      view.cpuKey = '';
    }
    view.notice = `${p.name} left the game${g.winner ? '' : ', so the computer is playing for them'}. Anyone with code ${o.code} can take the seat.`;
  }

  function openSeat() {
    const o = view.online, p = view.game.players[1];
    o.seatOpen = true;
    view.notice = `Seat 2 is open. Anyone with code ${o.code} can join and take over ${p.name}'s side.`;
    render();
  }

  const secondsLeft = () => Math.max(0, Math.ceil((view.online.takeoverAt - Date.now()) / 1000));

  // The joiner dropped out mid-game: count down, then let the computer play their side.
  function guestAway() {
    const o = view.online, p = view.game.players[1];
    stopTakeover();
    if (p.isCPU || view.game.winner || view.screen !== 'game') {
      view.notice = `${p.name} left. They can rejoin with code ${o.code}${p.isCPU ? '; until then the computer plays for them' : ''}.`;
      return;
    }
    o.takeoverAt = Date.now() + TAKEOVER_SECONDS * 1000;
    view.notice = () => `<b>${esc(p.name)}</b> lost connection. The computer takes over in <b data-countdown>${secondsLeft()}</b>s unless they rejoin with code <b>${o.code}</b>.`;
    o.takeover = setInterval(() => {
      const el = document.querySelector('[data-countdown]');
      if (el) el.textContent = secondsLeft();
      if (secondsLeft() <= 0) { stopTakeover(); computerTakesOver(); }
    }, 1000);
  }

  function stopTakeover() {
    const o = view.online;
    if (o && o.takeover) { clearInterval(o.takeover); o.takeover = null; }
  }

  function computerTakesOver() {
    const o = view.online, g = view.game;
    if (!o || !g || o.guestConnected) return;
    const p = g.players[1];
    p.isCPU = true;
    p.standIn = true;
    view.cpuKey = '';
    if (view.request) answerRequest(true); // the computer agrees to whatever was asked
    view.notice = `The computer is now playing for ${p.name}. If they rejoin with code ${o.code}, they get their side back.`;
    render();
  }

  function guestBack(newcomer) {
    const p = view.game.players[1];
    stopTakeover();
    if (p.standIn) { p.isCPU = false; p.standIn = false; }
    const msg = newcomer ? `${p.name} joined and takes over seat 2.` : `${p.name} is back.`;
    view.notice = msg;
    setTimeout(() => { if (view.notice === msg) { view.notice = null; render(); } }, 4000);
  }

  /* undo / restart requests: the other player has to agree */

  function requestFromMe(type) {
    const g = view.game, me = view.online.me;
    if (view.request) return;
    if (isGuest()) {
      Net.send({ t: 'act', d: { type: 'request', kind: type } });
      view.request = { type, from: me };
      render();
      return;
    }
    view.request = { type, from: me };
    if (g.players[1].isCPU) { answerRequest(true); return; }
    render();
  }

  function answerRequest(accept) {
    const r = view.request;
    if (!r) return;
    view.request = null;
    const g = view.game, other = g.players[1 - r.from].name;
    if (accept) {
      if (r.type === 'undo') takeBack(g, r.from);
      else resetBoard(false);
      if (!g.players[1].isCPU) view.notice = r.type === 'undo' ? 'The move was taken back.' : 'The battle was restarted.';
    } else {
      view.notice = `${other} declined to ${r.type === 'undo' ? 'take back the move' : 'restart'}.`;
    }
    render();
  }

  function requestBanner(g) {
    const r = view.request;
    if (!r || !view.online) return '';
    if (r.from === view.online.me) {
      return `<div class="request-bar">Waiting for <b>${esc(g.players[1 - r.from].name)}</b> to agree to ${r.type === 'undo' ? 'take back your move' : 'a restart'}<span class="dots"><i>.</i><i>.</i><i>.</i></span>
        <button class="btn small ghost" data-action="cancel-request">Cancel</button></div>`;
    }
    const what = r.type === 'undo' ? 'take back their last move' : 'restart the battle';
    return `<div class="request-bar ask"><span><b>${esc(g.players[r.from].name)}</b> asks to ${what}.</span>
      <button class="btn small primary" data-action="answer" data-value="yes">Allow</button>
      <button class="btn small" data-action="answer" data-value="no">Decline</button></div>`;
  }

  // Room creator only: who can take seat 2 while its player is away.
  function seatStatus(i) {
    const o = view.online;
    if (i !== 1 || !isHost() || o.guestConnected || !view.game) return '';
    const name = view.game.players[1].name;
    return `<div class="seat-status">${o.seatOpen
      ? `Seat open: anyone with code <b>${o.code}</b> can join`
      : `Waiting for ${esc(name)} to rejoin <button class="btn ghost small" data-action="open-seat">Let someone else join</button>`}</div>`;
  }

  /* joiner */

  function joinBox() {
    return `<div class="join-box">
      <div class="join-text"><b>Joining a friend's room?</b>
        <small class="muted">Type their ${Net.CODE_LENGTH}-letter code. They choose how sides are decided; you bring your own name.</small></div>
      <div class="join-row">
        <input class="code-input" data-code maxlength="${Net.CODE_LENGTH}" placeholder="ABCDE" value="${esc(view.joinCode)}"
          autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Room code">
        <button class="btn" data-action="join">Join room</button>
      </div>
    </div>`;
  }

  function joinRoom() {
    const code = Net.normaliseCode(view.joinCode);
    if (code.length !== Net.CODE_LENGTH) { view.notice = `Room codes are ${Net.CODE_LENGTH} letters.`; render(); return; }
    if (!Net.available()) { view.notice = 'Online play needs an internet connection.'; render(); return; }
    saveSettings();
    const prev = readSaved(JOINED);
    const rejoining = !!prev && prev.code === code;
    const o = view.online = { role: 'guest', me: 1, code, token: rejoining ? prev.token : Net.makeToken(), status: 'connecting', lobby: null };
    view.notice = null;
    view.rejoin = null;
    view.game = null;
    view.request = null;
    go('lobby');
    connectGuest(o).catch(err => leaveRoom(err.message, { keep: rejoining }));
  }

  function connectGuest(o) {
    return Net.join(o.code, onGuestEvent).then(() => {
      if (view.online !== o) { Net.close(); return; }
      o.status = 'joined';
      writeSaved(JOINED, { code: o.code, token: o.token });
      // an unchanged default name would show as a second "Player 1"
      const mine = (settings.names[0] || '').trim();
      const name = mine && mine !== DEFAULTS.names[0] ? mine : DEFAULTS.names[1];
      Net.send({ t: 'hello', name, token: o.token });
      render();
    });
  }

  // Connection lost: keep retrying quietly for about 2 minutes.
  function guestReconnect(reason) {
    const o = view.online;
    if (!o || o.reconnecting) return;
    o.reconnecting = true;
    let tries = 0;
    view.notice = () => `${esc(reason)} Reconnecting<span class="dots"><i>.</i><i>.</i><i>.</i></span>`;
    render();
    const attempt = () => {
      if (view.online !== o) return;
      tries++;
      connectGuest(o)
        .then(() => {
          if (view.online !== o) return;
          o.reconnecting = false;
          view.notice = null;
          render();
        })
        .catch(() => {
          if (view.online !== o) return;
          if (tries >= RECONNECT_TRIES) leaveRoom(`Couldn't reconnect to room ${o.code}. You can rejoin from this screen once it's back.`, { keep: true });
          else o.retry = setTimeout(attempt, RECONNECT_GAP);
        });
    };
    o.retry = setTimeout(attempt, 1000);
  }

  function onGuestEvent(ev) {
    const o = view.online;
    if (!o) return;
    if (ev.type === 'message') {
      const msg = ev.msg;
      if (msg.t === 'state') {
        const moved = !view.game || !msg.game || msg.game.history.length !== view.game.history.length;
        view.game = msg.game;
        view.toss = msg.toss;
        view.request = msg.request;
        o.lobby = msg.lobby;
        if (moved) view.selected = null;
        if (view.game && view.game.history.length < view.seenPly) view.seenPly = view.game.history.length;
        writeSaved(JOINED, { code: o.code, token: o.token }); // keep the seat pass fresh
        if (msg.screen !== view.screen) { view.screen = msg.screen; window.scrollTo(0, 0); }
        render();
      } else if (msg.t === 'full') {
        leaveRoom('That room already has two players.');
      } else if (msg.t === 'reserved') {
        leaveRoom(`That game is already under way, and seat 2 is saved for ${msg.name || 'the other player'}'s device. If that's you on a different device or browser, ask the room creator to tap "Let someone else join".`);
      } else if (msg.t === 'closed') {
        leaveRoom('The room creator left, so the room is closed.');
      } else if (msg.t === 'away') {
        guestReconnect('The room creator dropped out.');
      }
    } else if (ev.type === 'left') {
      guestReconnect('Lost connection to the room.');
    } else if (ev.type === 'error') {
      view.notice = ev.message;
      render();
    }
  }

  /* both */

  // opts.keep: keep the saved game / seat pass so it can be resumed later
  function leaveRoom(message, opts) {
    const o = view.online, keep = !!(opts && opts.keep);
    if (o) {
      clearTimeout(o.retry);
      stopTakeover();
      if (o.role === 'host' && !keep) { Net.send({ t: 'closed' }); forget(HOSTED); }
      if (o.role === 'guest' && !keep) { Net.send({ t: 'bye' }); forget(JOINED); }
    }
    Net.close(o ? 300 : 0); // give the goodbye time to reach the other player
    view.online = null;
    view.request = null;
    view.notice = message || null;
    view.resume = readSaved(HOSTED);
    view.rejoin = readSaved(JOINED);
    go('setup');
  }

  function resumeCards() {
    const cards = [];
    const r = view.resume, j = view.rejoin;
    if (r) {
      const other = r.game.players[1].name;
      cards.push(`<div class="resume-card">
        <div class="join-text"><b>Your online game is saved</b>
          <small class="muted">Room ${esc(r.code)} · vs ${esc(other)} · ${r.game.winner ? 'finished' : `move ${Math.floor(r.game.history.length / 2) + 1}`}</small></div>
        <div class="join-row">
          <button class="btn primary" data-action="resume-host">Resume game</button>
          <button class="btn ghost small" data-action="discard-host">Discard</button>
        </div>
      </div>`);
    }
    if (j) {
      cards.push(`<div class="resume-card">
        <div class="join-text"><b>Rejoin your online game?</b>
          <small class="muted">Room ${esc(j.code)}. Your seat is saved for you.</small></div>
        <div class="join-row">
          <button class="btn primary" data-action="rejoin">Rejoin</button>
          <button class="btn ghost small" data-action="dismiss-rejoin">Dismiss</button>
        </div>
      </div>`);
    }
    return cards.join('');
  }

  function renderLobby() {
    const o = view.online, host = o.role === 'host';
    let body;
    if (o.status === 'creating' || o.status === 'connecting' || (!host && !o.lobby)) {
      body = `<p class="toss-prompt">${o.resuming ? `Reopening room <b>${o.code}</b>` : host ? 'Creating your room' : `Joining room <b>${o.code}</b>`}<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>`;
    } else {
      const info = host ? lobbyInfo() : o.lobby;
      const seat = (p, i) => `<li class="p-${i}">
        <span class="seat-name">${p ? esc(p.name) : `Waiting for your friend<span class="dots"><i>.</i><i>.</i><i>.</i></span>`}</span>
        <small class="muted">${p ? (i === 0 ? 'room creator' : 'joined') : 'not joined yet'}${i === o.me ? ' · you' : ''}</small></li>`;
      body = `<p class="muted">${host ? 'Share this code with your friend' : 'You\'re in room'}</p>
        <div class="room-code" aria-label="Room code ${o.code}">${o.code.split('').map(c => `<span>${c}</span>`).join('')}</div>
        ${host ? '<button class="btn small" data-action="copy-code">Copy code</button>' : ''}
        <ul class="seats">${seat(info.host, 0)}${seat(info.guest, 1)}</ul>
        <p class="muted">${esc(info.summary)}</p>
        ${host
          ? `<button class="btn primary big" data-action="online-start"${info.guest ? '' : ' disabled'}>${settings.sides === 'toss' ? 'Go to the rune toss →' : 'Begin the battle →'}</button>`
          : waitingFor(info.host.name)}`;
    }
    return `<section class="screen lobby">
      <div class="panel toss-panel">
        <h2 class="panel-title">${host ? 'Your room' : 'Online room'}</h2>
        ${themeSwitch()}
        ${body}
        <button class="btn small ghost" data-action="leave">Leave room</button>
      </div>
    </section>`;
  }

  function onlineAction(action, el) {
    switch (action) {
      case 'create-room': createRoom(); break;
      case 'join': joinRoom(); break;
      case 'leave': leaveRoom(); break;
      case 'resume-host': resumeHost(); break;
      case 'open-seat': if (isHost()) openSeat(); break;
      case 'discard-host': forget(HOSTED); view.resume = null; render(); break;
      case 'rejoin': view.joinCode = view.rejoin.code; joinRoom(); break;
      case 'dismiss-rejoin': forget(JOINED); view.rejoin = null; render(); break;
      case 'copy-code':
        if (navigator.clipboard) navigator.clipboard.writeText(view.online.code).then(() => { el.textContent = 'Copied!'; }, () => {});
        break;
      case 'answer':
        if (isGuest()) { Net.send({ t: 'act', d: { type: 'answer', accept: el.dataset.value === 'yes' } }); view.request = null; render(); }
        else if (view.request && view.request.from === 1) answerRequest(el.dataset.value === 'yes');
        break;
      case 'cancel-request':
        if (isGuest()) Net.send({ t: 'act', d: { type: 'cancel' } });
        view.request = null;
        render();
        break;
    }
  }

  app.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset.code !== undefined) joinRoom();
  });

  // If the room creator reloads or closes the tab, the game is saved and can be
  // resumed, so tell the other player to wait and keep reconnecting.
  window.addEventListener('beforeunload', () => { if (isHost()) Net.send({ t: 'away' }); });

  view.resume = readSaved(HOSTED);
  view.rejoin = readSaved(JOINED);

  /* ---------- render & events ---------- */

  function render() {
    const screens = { setup: renderSetup, lobby: renderLobby, toss: renderToss, game: renderGame };
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
    afterRender();
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
        if (view.online) leaveRoom(); else go('setup');
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
        onlineAction(d.action, el);
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
