/*
 * Online rooms, peer-to-peer over WebRTC (PeerJS).
 *
 * The room creator ("host") runs the game; the player who joins ("guest")
 * sends their moves to the host and receives the game state back. Rooms
 * are found through the free PeerJS server using a 5-letter code.
 *
 * Everything network-specific lives here, so this file can be swapped for
 * another transport (e.g. Firebase) without touching the game.
 */
window.VC = window.VC || {};

(function (VC) {
  'use strict';

  const PREFIX = 'viking-chess-hnefatafl-room-';
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they look like 1 and 0
  const CODE_LENGTH = 5;
  const CONNECT_TIMEOUT = 15000;
  // WebRTC can take 30s+ to notice a vanished peer, so both sides send a
  // heartbeat and treat 10s of silence as a lost connection.
  const PING_EVERY = 2000, DROP_AFTER = 10000;

  let peer = null, conn = null, heartbeat = null, handler = () => {};

  const available = () => typeof window.Peer === 'function';
  const makeCode = () => Array.from({ length: CODE_LENGTH }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  const normaliseCode = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH);

  function friendly(err) {
    const messages = {
      'peer-unavailable': 'Room not found. Check the code, or ask your friend to create a new room.',
      'network': 'Network problem. Check your internet connection.',
      'server-error': "Couldn't reach the room server. Try again in a moment.",
      'socket-error': "Couldn't reach the room server. Try again in a moment.",
      'browser-incompatible': "This browser can't play online. Try Chrome, Edge, Firefox or Safari.",
    };
    return new Error(messages[err && err.type] || (err && err.message) || 'Connection problem. Please try again.');
  }

  // Note when we last heard from a connection; heartbeats aren't passed on.
  function heard(c, msg) {
    c.lastSeen = Date.now();
    return !(msg && msg.t === 'ping');
  }

  function dropped(c) {
    if (conn !== c) return;
    stopWatch();
    conn = null;
    try { c.close(); } catch (e) { /* already closed */ }
    handler({ type: 'left' });
  }

  function watch(c) {
    stopWatch();
    c.lastSeen = Date.now();
    heartbeat = setInterval(() => {
      if (conn !== c) { stopWatch(); return; }
      if (Date.now() - c.lastSeen > DROP_AFTER) { dropped(c); return; }
      try { c.send({ t: 'ping' }); } catch (e) { /* will time out */ }
    }, PING_EVERY);
  }

  function stopWatch() {
    clearInterval(heartbeat);
    heartbeat = null;
  }

  function wire(c) {
    c.on('data', msg => { if (heard(c, msg)) handler({ type: 'message', msg }); });
    c.on('close', () => dropped(c));
    c.on('error', () => {});
  }

  function keepAlive(p) {
    // losing the signalling server doesn't drop an open game, but we need it to accept rejoins
    p.on('disconnected', () => { if (!p.destroyed) p.reconnect(); });
  }

  /**
   * Create a room. Resolves with its code.
   * opts.code reopens a specific room (after a reload); the server may need a
   * few seconds to release it, so it's retried before falling back to a new code.
   *
   * Anyone who connects is held as a "visitor": their messages arrive with
   * `active: false` until the game calls accept(from). Only the accepted
   * player's messages are active, and only their disconnect raises 'left'.
   */
  function host(onEvent, opts) {
    const wanted = opts && opts.code;
    close();
    handler = onEvent;
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const tryCode = () => {
        const reuse = wanted && attempts < 6;
        const code = reuse ? wanted : makeCode();
        const p = new window.Peer(PREFIX + code);
        let opened = false;
        p.on('open', () => { opened = true; peer = p; resolve(code); });
        p.on('error', err => {
          if (!opened && err.type === 'unavailable-id' && ++attempts < 12) { p.destroy(); setTimeout(tryCode, reuse ? 2000 : 0); }
          else if (!opened) { p.destroy(); reject(friendly(err)); }
          else handler({ type: 'error', message: friendly(err).message });
        });
        keepAlive(p);
        p.on('connection', c => {
          c.on('open', () => {
            c.on('data', msg => { if (heard(c, msg)) handler({ type: 'message', msg, from: c, active: c === conn }); });
            c.on('close', () => dropped(c));
            c.on('error', () => {});
          });
        });
      };
      tryCode();
    });
  }

  /** Host: make this visitor the player in seat 2 (replacing any old connection). */
  function accept(c) {
    if (conn && conn !== c) {
      const old = conn;
      conn = null;
      try { old.close(); } catch (e) { /* already closed */ }
    }
    conn = c;
    watch(c);
  }

  /** Host: turn a visitor away with a message. */
  function reject(c, msg) {
    try { c.send(msg); } catch (e) { /* gone already */ }
    setTimeout(() => { try { c.close(); } catch (e) { /* gone already */ } }, 400);
  }

  /** Join a room by code. Resolves once connected to the host. */
  function join(rawCode, onEvent) {
    close();
    handler = onEvent;
    const code = normaliseCode(rawCode);
    return new Promise((resolve, reject) => {
      if (code.length !== CODE_LENGTH) { reject(new Error(`Room codes are ${CODE_LENGTH} letters.`)); return; }
      let settled = false;
      const p = new window.Peer();
      peer = p;
      const fail = err => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        close();
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error("Couldn't reach that room. Check the code and try again.")), CONNECT_TIMEOUT);
      p.on('open', () => {
        const c = p.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        c.on('open', () => {
          settled = true;
          clearTimeout(timer);
          conn = c;
          wire(c);
          watch(c);
          resolve(code);
        });
      });
      p.on('error', err => {
        if (!settled) fail(friendly(err));
        else handler({ type: 'error', message: friendly(err).message });
      });
      keepAlive(p);
    });
  }

  function send(msg) {
    if (conn && conn.open) conn.send(msg);
  }

  // Detach now; tear down after `delay` ms so a last message can still get out.
  function close(delay) {
    const c = conn, p = peer;
    stopWatch();
    conn = null;
    peer = null;
    handler = () => {};
    const shut = () => {
      if (c) { try { c.close(); } catch (e) { /* already closed */ } }
      if (p && !p.destroyed) p.destroy();
    };
    if (delay) setTimeout(shut, delay); else shut();
  }

  // Secret "seat pass" that lets a player reclaim their seat after disconnecting.
  function makeToken() {
    const bytes = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  VC.Net = {
    CODE_LENGTH, available, normaliseCode, makeToken, host, accept, reject, join, send, close,
    isConnected: () => !!(conn && conn.open),
  };
})(window.VC);
