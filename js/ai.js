/*
 * Computer player: alpha-beta search over the engine's moves with a
 * Hnefatafl evaluation (escape routes, pressure on the king, corner
 * blockades, material). It can play either side.
 *
 * Levels: easy (1 move deep, plenty of randomness), normal (2 deep),
 * hard (deepens until a time limit, usually 3–4 moves).
 */
window.VC = window.VC || {};

(function (VC) {
  'use strict';

  const E = VC.Engine;
  const { SIZE, N, ATK, DEF, KING, STEP, ON_EDGE, IS_CORNER } = E;
  const WIN = 100000;

  const LEVELS = {
    easy: { depth: 1, noise: 30, sloppy: 0.3, time: 300 },
    normal: { depth: 2, noise: 5, sloppy: 0, time: 900 },
    hard: { depth: 4, noise: 1.5, sloppy: 0, time: 1300 },
  };

  // Squares attackers like to hold to seal a corner: the diagonal triangle in front of it.
  const GUARDS = new Array(N).fill(false);
  [[0, 2], [1, 1], [2, 0]].forEach(([r, c]) => {
    [[r, c], [r, SIZE - 1 - c], [SIZE - 1 - r, c], [SIZE - 1 - r, SIZE - 1 - c]].forEach(([rr, cc]) => { GUARDS[rr * SIZE + cc] = true; });
  });
  const CORNER_DIST = Array.from({ length: N }, (_, i) => {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    return Math.min(r, SIZE - 1 - r) + Math.min(c, SIZE - 1 - c);
  });

  /** Score from the defenders' point of view; `turn` is the side to move. */
  function evaluate(b, turn) {
    let a = 0, d = 0, k = -1, guards = 0;
    for (let i = 0; i < N; i++) {
      const p = b[i];
      if (p === ATK) { a++; if (GUARDS[i]) guards++; }
      else if (p === DEF) d++;
      else if (p === KING) k = i;
    }
    if (k < 0) return -WIN;
    let s = 14 * d - 7 * a - 7 * guards;

    const kingMoves = E.movesFrom(b, k);
    const routes = kingMoves.filter(i => IS_CORNER[i]).length;
    if (routes) {
      if (turn === 'D') return WIN / 2;      // escapes next move
      s += routes >= 2 ? 900 : 70;          // two routes can't both be blocked
    }
    // squares from which the king would threaten one or two corners next move
    let forks = 0, threats = 0;
    for (let n = 0; n < kingMoves.length; n++) {
      const t = kingMoves[n];
      if (!ON_EDGE[t] && CORNER_DIST[t] > 3) continue;
      b[t] = KING; b[k] = 0;
      let r = 0;
      const m = E.movesFrom(b, t);
      for (let x = 0; x < m.length; x++) if (IS_CORNER[m[x]]) r++;
      b[k] = KING; b[t] = 0;
      if (r >= 2) forks++;
      else if (r === 1) threats++;
    }
    s += (turn === 'D' ? 160 : 45) * Math.min(forks, 2) + 9 * Math.min(threats, 4);
    s += 1.2 * kingMoves.length - 5 * CORNER_DIST[k];

    // pressure around the king
    let press = 0;
    for (let dir = 0; dir < 4; dir++) {
      const n = STEP[dir][k];
      if (n !== -1 && (b[n] === ATK || n === E.THRONE)) press++;
    }
    if (!ON_EDGE[k]) s -= press === 3 ? (turn === 'A' ? 400 : 70) : 14 * press;
    return s;
  }

  // Cheap move ordering: likely-good moves first so alpha-beta prunes more.
  function order(b, moves, side) {
    const k = E.findKing(b);
    const near = new Set();
    if (k >= 0) for (let dir = 0; dir < 4; dir++) { const n = STEP[dir][k]; if (n !== -1) near.add(n); }
    const score = ([f, t]) => {
      let s = 0;
      if (side === 'D' && f === k) s += 30 + (ON_EDGE[t] ? 10 : 0) - CORNER_DIST[t];
      if (side === 'A') { if (near.has(t)) s += 20; if (GUARDS[t]) s += 8; }
      // a capture: an enemy next to the target with a friend or hostile square beyond
      for (let dir = 0; dir < 4; dir++) {
        const n = STEP[dir][t];
        if (n === -1 || b[n] === 0 || E.sideOf(b[n]) === side || b[n] === KING) continue;
        const beyond = STEP[dir][n];
        if (beyond !== -1 && beyond !== f && (E.sideOf(b[beyond]) === side || (b[beyond] === 0 && (IS_CORNER[beyond] || beyond === E.THRONE)))) s += 40;
      }
      return s;
    };
    return moves.map(m => [score(m), m]).sort((x, y) => y[0] - x[0]).map(x => x[1]);
  }

  function search(b, side, depth, alpha, beta, ply, ctx) {
    if ((++ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) ctx.out = true;
    if (ctx.out) return 0;
    const sign = side === 'D' ? 1 : -1;
    if (depth === 0) return sign * evaluate(b, side);
    const moves = E.legalMoves(b, side);
    if (!moves.length) return -WIN + ply; // no moves: this side loses
    let best = -Infinity;
    const ordered = order(b, moves, side);
    for (let n = 0; n < ordered.length; n++) {
      const [f, t] = ordered[n];
      const m = E.applyMove(b, f, t);
      let v;
      if (m.escaped || m.kingTaken) v = WIN - ply;
      else v = -search(b, E.other(side), depth - 1, -beta, -alpha, ply + 1, ctx);
      E.undoMove(b, m);
      if (ctx.out) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** Pick a move for the side to move in game g. Returns [from, to]. */
  function choose(g, levelId) {
    const level = LEVELS[levelId] || LEVELS.normal;
    const side = g.turn, b = g.board.slice();
    let moves = E.legalMoves(b, side);
    if (!moves.length) return null;

    // take a win at once; that's never a mistake worth randomising
    for (const [f, t] of moves) {
      const m = E.applyMove(b, f, t);
      E.undoMove(b, m);
      if (m.escaped || m.kingTaken) return [f, t];
    }

    const ctx = { nodes: 0, deadline: Date.now() + level.time, out: false };
    let scored = null;
    moves = order(b, moves, side);
    for (let depth = 1; depth <= level.depth; depth++) {
      const round = [];
      for (const [f, t] of moves) {
        const m = E.applyMove(b, f, t);
        let v = -search(b, E.other(side), depth - 1, -Infinity, Infinity, 1, ctx);
        // repeating a position for the third time is a draw: only welcome when losing
        const key = E.positionKey(b, E.other(side));
        if (g.keys.filter(x => x === key).length >= E.REPEAT_LIMIT - 1) v = 0;
        E.undoMove(b, m);
        if (ctx.out) break;
        round.push({ move: [f, t], v });
      }
      if (ctx.out && scored) break;
      if (round.length === moves.length || !scored) scored = round.length ? round : scored;
      if (ctx.out) break;
      // search the best moves first next time round
      moves = scored.slice().sort((x, y) => y.v - x.v).map(x => x.move);
    }
    if (!scored || !scored.length) return moves[0];

    scored.forEach(x => { x.r = x.v + (Math.random() * 2 - 1) * level.noise; });
    scored.sort((x, y) => y.r - x.r);
    if (level.sloppy && Math.random() < level.sloppy) {
      // easy: sometimes pick one of the next few moves instead, but never a losing one
      const ok = scored.filter(x => x.v > -WIN / 2).slice(0, 5);
      if (ok.length) return ok[Math.floor(Math.random() * ok.length)].move;
    }
    return scored[0].move;
  }

  VC.AI = { choose, evaluate, LEVELS };
})(window.VC);
