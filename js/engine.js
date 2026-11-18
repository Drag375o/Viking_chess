/*
 * Rules and game state for 11 × 11 Hnefatafl (Copenhagen-style core rules).
 * No DOM code here, so the rules can run headless (tests, computer player).
 * Game state is plain JSON: it is sent to the other device online and saved.
 *
 * Board: a flat array of 121 squares, index = row * 11 + col, row 0 at the top.
 * Square values: 0 empty, 1 attacker, 2 defender, 3 king.
 * Sides: 'A' attackers (move first), 'D' defenders (the king's side).
 */
window.VC = window.VC || {};

(function (VC) {
  'use strict';

  const SIZE = 11, N = SIZE * SIZE;
  const EMPTY = 0, ATK = 1, DEF = 2, KING = 3;
  const THRONE = 60;
  const CORNERS = [0, 10, 110, 120];
  const IS_CORNER = new Array(N).fill(false);
  CORNERS.forEach(i => { IS_CORNER[i] = true; });
  const RESTRICTED = i => i === THRONE || IS_CORNER[i]; // only the king may stop here
  const REPEAT_LIMIT = 3; // the same position a third time is a draw
  const SIDE_NAMES = { A: 'Attackers', D: 'Defenders' };

  // Step to the neighbouring square in each direction, or -1 off the board.
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const STEP = DIRS.map(([dr, dc]) => Array.from({ length: N }, (_, i) => {
    const r = Math.floor(i / SIZE) + dr, c = (i % SIZE) + dc;
    return r < 0 || r >= SIZE || c < 0 || c >= SIZE ? -1 : r * SIZE + c;
  }));
  const ON_EDGE = Array.from({ length: N }, (_, i) => {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    return r === 0 || c === 0 || r === SIZE - 1 || c === SIZE - 1;
  });

  const at = (r, c) => r * SIZE + c;

  // The common 11 × 11 opening: attackers in a T on each edge, defenders in a diamond round the king.
  const START_ATTACKERS = [
    at(0, 3), at(0, 4), at(0, 5), at(0, 6), at(0, 7), at(1, 5),
    at(10, 3), at(10, 4), at(10, 5), at(10, 6), at(10, 7), at(9, 5),
    at(3, 0), at(4, 0), at(5, 0), at(6, 0), at(7, 0), at(5, 1),
    at(3, 10), at(4, 10), at(5, 10), at(6, 10), at(7, 10), at(5, 9),
  ];
  const START_DEFENDERS = [
    at(3, 5), at(4, 4), at(4, 5), at(4, 6), at(5, 3), at(5, 4),
    at(5, 6), at(5, 7), at(6, 4), at(6, 5), at(6, 6), at(7, 5),
  ];

  function startBoard() {
    const b = new Array(N).fill(EMPTY);
    START_ATTACKERS.forEach(i => { b[i] = ATK; });
    START_DEFENDERS.forEach(i => { b[i] = DEF; });
    b[THRONE] = KING;
    return b;
  }

  const sideOf = p => (p === ATK ? 'A' : p === DEF || p === KING ? 'D' : null);
  const other = side => (side === 'A' ? 'D' : 'A');

  /** Squares the piece on `from` can move to. Non-king pieces may pass over the empty throne but not stop on it. */
  function movesFrom(board, from) {
    const p = board[from];
    if (p === EMPTY) return [];
    const out = [];
    for (let d = 0; d < 4; d++) {
      const step = STEP[d];
      let i = step[from];
      while (i !== -1 && board[i] === EMPTY) {
        if (p === KING || !RESTRICTED(i)) out.push(i);
        i = step[i];
      }
    }
    return out;
  }

  function legalMoves(board, side) {
    const out = [];
    for (let i = 0; i < N; i++) {
      if (sideOf(board[i]) !== side) continue;
      const targets = movesFrom(board, i);
      for (let k = 0; k < targets.length; k++) out.push([i, targets[k]]);
    }
    return out;
  }

  function hasMove(board, side) {
    for (let i = 0; i < N; i++) {
      if (sideOf(board[i]) === side && movesFrom(board, i).length) return true;
    }
    return false;
  }

  // Can square i act as the far side of a sandwich against a piece of `victim` side?
  // Friendly pieces of the capturer count, the king included (he is armed).
  // Corners are hostile to everyone; the throne is hostile to everyone while empty.
  function hostile(board, i, capturer) {
    const p = board[i];
    if (p !== EMPTY) return sideOf(p) === capturer;
    return IS_CORNER[i] || i === THRONE;
  }

  /** Indices of ordinary pieces captured by the piece that just landed on `to`. */
  function capturesAt(board, to) {
    const side = sideOf(board[to]);
    const out = [];
    for (let d = 0; d < 4; d++) {
      const n = STEP[d][to];
      if (n === -1) continue;
      const victim = board[n];
      if (victim === EMPTY || victim === KING || sideOf(victim) === side) continue;
      const beyond = STEP[d][n];
      if (beyond !== -1 && hostile(board, beyond, side)) out.push(n);
    }
    return out;
  }

  /**
   * The king is captured when attackers (or the empty throne) close all four sides.
   * He can't be captured on the board edge, so attackers must keep him off it.
   */
  function kingCaptured(board, k) {
    if (k < 0 || ON_EDGE[k]) return false;
    for (let d = 0; d < 4; d++) {
      const n = STEP[d][k];
      if (board[n] !== ATK && n !== THRONE) return false;
    }
    return true;
  }

  const findKing = board => board.indexOf(KING);

  /** How many corners the king could reach right now along a clear straight line. */
  function escapeRoutes(board, k) {
    if (k === undefined) k = findKing(board);
    if (k < 0) return [];
    return movesFrom(board, k).filter(i => IS_CORNER[i]);
  }

  /** Attackers (and the empty throne) touching the king: 4 means captured. */
  function kingPressure(board, k) {
    if (k === undefined) k = findKing(board);
    if (k < 0) return 4;
    let n = 0;
    for (let d = 0; d < 4; d++) {
      const s = STEP[d][k];
      if (s !== -1 && (board[s] === ATK || s === THRONE)) n++;
    }
    return n;
  }

  /**
   * Make a move on a bare board (no history). Returns what happened so it can be undone:
   * { from, to, piece, captured: [[index, piece]...], kingTaken, escaped }.
   * Used by the game and by the computer's search.
   */
  function applyMove(board, from, to) {
    const piece = board[from];
    board[to] = piece;
    board[from] = EMPTY;
    const captured = capturesAt(board, to).map(i => [i, board[i]]);
    captured.forEach(([i]) => { board[i] = EMPTY; });
    let kingTaken = false;
    if (piece === ATK) {
      const k = findKing(board);
      // only a king next to the moving attacker can have just been closed in
      for (let d = 0; d < 4 && !kingTaken; d++) {
        if (STEP[d][to] === k) kingTaken = kingCaptured(board, k);
      }
    }
    return { from, to, piece, captured, kingTaken, escaped: piece === KING && IS_CORNER[to] };
  }

  function undoMove(board, m) {
    board[m.from] = m.piece;
    board[m.to] = EMPTY;
    m.captured.forEach(([i, p]) => { board[i] = p; });
  }

  const positionKey = (board, turn) => board.join('') + turn;

  /* ---------- game ---------- */

  /**
   * players: [{ name, isCPU?, level? }, ...] (2). Sides are set later with setSides().
   */
  function create(cfg) {
    const board = startBoard();
    return {
      v: 1,
      board,
      turn: 'A',
      players: cfg.players.map(p => ({ name: p.name, isCPU: !!p.isCPU, level: p.level || 'normal', side: null })),
      history: [],
      keys: [positionKey(board, 'A')],
      winner: null,   // 'A' | 'D' | 'draw'
      reason: null,   // 'escape' | 'capture' | 'stuck' | 'repetition' | 'resign'
      log: [],
    };
  }

  function setSides(g, attackerIndex) {
    g.players[attackerIndex].side = 'A';
    g.players[1 - attackerIndex].side = 'D';
  }

  const playerOf = (g, side) => g.players.findIndex(p => p.side === side);
  const sideName = side => SIDE_NAMES[side];

  /** Can the side to move legally play from → to? */
  function canMove(g, from, to) {
    if (g.winner) return false;
    if (sideOf(g.board[from]) !== g.turn) return false;
    return movesFrom(g.board, from).includes(to);
  }

  /** Play a move. Returns the history record, or false if it's illegal. */
  function move(g, from, to) {
    if (!canMove(g, from, to)) return false;
    const m = applyMove(g.board, from, to);
    const rec = { from, to, piece: m.piece, captured: m.captured, side: g.turn };
    g.history.push(rec);
    g.turn = other(g.turn);
    g.keys.push(positionKey(g.board, g.turn));
    if (m.escaped) finish(g, 'D', 'escape');
    else if (m.kingTaken) finish(g, 'A', 'capture');
    else if (!hasMove(g.board, g.turn)) finish(g, other(g.turn), 'stuck');
    else if (repeats(g) >= REPEAT_LIMIT) finish(g, 'draw', 'repetition');
    return rec;
  }

  function repeats(g) {
    const last = g.keys[g.keys.length - 1];
    return g.keys.reduce((n, k) => n + (k === last ? 1 : 0), 0);
  }

  function finish(g, winner, reason) {
    g.winner = winner;
    g.reason = reason;
  }

  function resign(g, side) {
    if (g.winner) return false;
    finish(g, other(side), 'resign');
    g.resigned = side;
    return true;
  }

  /** Take back the last move (also clears a finished result). */
  function undo(g) {
    if (g.resigned) { delete g.resigned; g.winner = null; g.reason = null; return true; }
    const rec = g.history.pop();
    if (!rec) return false;
    undoMove(g.board, { from: rec.from, to: rec.to, piece: rec.piece, captured: rec.captured });
    g.turn = rec.side;
    g.keys.pop();
    g.winner = null;
    g.reason = null;
    return true;
  }

  function counts(board) {
    let A = 0, D = 0, K = 0;
    for (let i = 0; i < N; i++) {
      if (board[i] === ATK) A++;
      else if (board[i] === DEF) D++;
      else if (board[i] === KING) K++;
    }
    return { A, D, K };
  }

  /** Pieces each side has taken so far. */
  function taken(g) {
    const out = { A: 0, D: 0 };
    g.history.forEach(h => { out[h.side] += h.captured.length; });
    return out;
  }

  // Columns a–k from the left, rows 1–11 from the bottom.
  const square = i => 'abcdefghijk'[i % SIZE] + (SIZE - Math.floor(i / SIZE));
  const notation = rec => `${square(rec.from)}–${square(rec.to)}${rec.captured.length ? ' ×' + rec.captured.map(([i]) => square(i)).join(' ×') : ''}`;

  /** Squares where the side to move could capture right now (for hints and the computer). */
  function threatened(board, side) {
    const out = new Set();
    legalMoves(board, side).forEach(([f, t]) => {
      const m = applyMove(board, f, t);
      m.captured.forEach(([i]) => out.add(i));
      undoMove(board, m);
    });
    return out;
  }

  VC.Engine = {
    SIZE, N, EMPTY, ATK, DEF, KING, THRONE, CORNERS, IS_CORNER, ON_EDGE, STEP, REPEAT_LIMIT,
    START_ATTACKERS, START_DEFENDERS, RESTRICTED,
    startBoard, sideOf, other, movesFrom, legalMoves, hasMove, capturesAt, kingCaptured, findKing,
    escapeRoutes, kingPressure, applyMove, undoMove, positionKey, threatened,
    create, setSides, playerOf, sideName, canMove, move, undo, resign, repeats, counts, taken, square, notation,
  };
})(window.VC);
