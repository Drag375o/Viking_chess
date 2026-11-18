# Hnefatafl: Viking Chess · Last Update

**Current version:** 0.8
**Last updated:** 2026-11-18
**Repository:** https://github.com/Drag375o/Viking_chess
**Live site:** https://drag375o.github.io/Viking_chess/ (GitHub Pages, updates on every push) · also https://viking-chess-tafl.netlify.app (Netlify, manual deploys)

This file is the running record of what the game does now and how it got there. Read it before changing anything, and update it after every change.

---

## Instructions for agents and developers

Follow these steps every time you change the game, however small the change.

1. **Read this whole file first.** Section 2 describes how the game works today.
2. **Make your change.** Then run the tests and check the result in a browser (see [Testing](#9-testing)).
3. **Update Section 2 so it is true again.** Edit or delete statements your change made wrong; don't just add a line below an outdated one.
4. **Add a new entry at the top of Section 3 (Version history)** and bump the version:
   - **Minor (0.8 → 0.9):** a new feature, rule change, new board style, or anything a player would notice.
   - **Patch (0.8 → 0.8.1):** a bug fix, text tweak or style fix.
5. **Update the header:** `Current version` and `Last updated` (YYYY-MM-DD).
6. **Update `README.md`** if players would notice the change.
7. **If you deployed,** say so in the version entry. Pushing to `main` updates GitHub Pages; Netlify only changes after copying into `viking-chess/` and deploying (see [Deployment](#8-deployment)).
8. **Commits and pushes:** push to `main` after each finished feature. Commits are authored by the repository owner only: no `Co-Authored-By` lines or other co-author credits.
9. **Keep it factual.** Write what the code does. Put unfinished or broken things in [Known limitations](#10-known-limitations).

### Version entry template

```
### 0.9 · YYYY-MM-DD · Short title
**Changed:** what a player or developer would notice, as short bullets.
**Files:** the files you touched.
**Tested:** how you checked it.
**Notes:** anything the next person must know (optional).
```

---

## 1. What the game is

Hnefatafl ("the King's table"), the Viking board game, on the common 11 × 11 board: the defenders try to get their King to a corner, the attackers try to capture him.

- **Built with:** plain HTML, CSS and JavaScript. No build step, no framework, no server code.
- **Modelled on:** the owner's earlier game *Auction XI* (same structure: setup → toss → game, three play modes, online rooms over PeerJS, switchable themes, this file).
- **Original brief:** kept word for word at the bottom of `README.md`.

---

## 2. Current state (version 0.8)

### 2.1 Game modes
- **vs Computer:** the player is Player 1; the computer is Player 2 (Easy, Normal or Hard).
- **vs a Friend · same screen:** two players take turns on one device.
- **Online · different devices:** a room creator and one friend, joined by a 5-letter room code. See 2.6.

### 2.2 Rules (`js/engine.js`)
Copenhagen-style core rules, consistent everywhere:
1. Board 11 × 11, flat array of 121 squares (`index = row * 11 + col`, row 0 at the top). Values: 0 empty, 1 attacker, 2 defender, 3 king.
2. Start: 24 attackers in a T on each edge (`START_ATTACKERS`), 12 defenders in a diamond (`START_DEFENDERS`), King on the throne (f6, index 60).
3. Attackers move first. Pieces slide like a rook; no jumping.
4. Only the King may stop on the throne or the corners. Other pieces may pass over the empty throne. The King may return to the throne.
5. Custodial capture by the moving side, horizontally or vertically, several at once. Moving between two enemies is safe.
6. Hostile squares (`hostile()`): corners always; the empty throne for both sides. The King counts as a defender piece, so he is armed and the throne he sits on only helps defenders.
7. King capture (`kingCaptured()`): all four sides attackers, or three plus the empty throne. Never on the board edge. Checked only after an attacker moves next to him.
8. Endings: King on a corner → defenders (`escape`); King captured → attackers (`capture`); side to move has no legal move → loses (`stuck`); third occurrence of the same board with the same side to move → draw (`repetition`, `REPEAT_LIMIT` = 3); a player yields → `resign`.
9. Undo (`undo()`) restores the board, captured pieces, turn and repetition keys, and clears a result. An undone yield just clears the result.
10. Notation: columns a–k from the left, rows 1–11 from the bottom (a11 top-left, f6 throne). Log entries look like `d11–d9 ×c9`.

Game state is plain JSON (`create()`): `board`, `turn`, `players[{name, isCPU, level, side, standIn?}]`, `history[{from, to, piece, captured[[i, piece]], side}]`, `keys` (positions for repetition), `winner`, `reason`, `resigned?`.

### 2.3 Sides and the rune toss (`js/ui.js`)
- Setup option **Sides:** Rune toss (default), Player 1 attacks, Player 1 defends.
- Toss: Player 1 (the room creator, online) calls *Odin* (ᛟ) or *Tyr* (ᛏ). The winner chooses a side. A computer winner picks at random after a second.
- **Rematch** swaps sides. **Restart** keeps them.

### 2.4 Computer (`js/ai.js`)
- Negamax alpha-beta over `E.legalMoves`, with cheap move ordering (king moves, likely captures, squares next to the King, corner guards).
- `evaluate()` (defenders' point of view): material (14 per defender, −7 per attacker), −7 per attacker on a corner-guard square, open escape routes (a win if defenders are to move; +900 for two routes), King squares that would threaten one or two corners next move, King mobility and distance to a corner, attackers and the empty throne round the King (heavy penalty at 3 sides off the edge).
- Levels (`LEVELS`): easy depth 1, noise ±30, 30% chance of a random move among the top 5 non-losing ones; normal depth 2, noise ±5; hard iterative deepening to depth 4 with a 1.3 s limit.
- Always plays an immediately winning move. At the root, a move that would make a third repetition scores 0 (a draw).
- Runs on the main thread after a 450 ms pause, so the page shows "thinking…" first.

### 2.5 Screens and controls (`js/ui.js`)
setup → (online: lobby) → toss (only with Rune toss) → game.
- **Setup:** numbered steps (opponent + join box, players + computer strength, sides, board style + square-names toggle), "How to play" (`RULES`), Resume / Rejoin cards when an online save exists.
- **Game:** top bar (room chip, move number, Board menu, Rules, Quit/Leave); side cards for Attackers and Defenders (name, role, pieces on board, captures with a tray of taken pieces, "To move" flag, seat status online); status line; online request bar; the board; warnings (open path to a corner, King nearly surrounded, position seen twice); controls (Undo, Restart, Yield, Show result); move log; quick rules.
- **Board interaction:** only the side to move on this device can select. Movable pieces lift on hover; the selected piece is ringed; targets are ringed; targets that would capture (or win) are red. The last move's squares are tinted. The moved piece slides from its old square (FLIP animation); captured pieces topple and fade, with a toast naming what was taken.
- **Result card** over the board (title, winner, move count, Rematch · swap sides, New game / Leave room, View the board).
- **Keys:** Esc closes the rules or drops the selected piece.
- **Mobile (≤720px):** board first, then side cards, log and quick rules.

### 2.6 Online play (`js/net.js`, online section of `js/ui.js`)
- `js/net.js` is Auction XI's network module with the `VC` namespace and PeerJS id prefix `viking-chess-hnefatafl-room-`. PeerJS 1.5.4 from unpkg, free public PeerJS server.
- Room codes: 5 letters, no I or O.
- The **room creator's browser runs the rules**, sends a full snapshot after every render and saves the game. The joiner only sends actions; the room creator checks each one.

| Direction | Messages |
|---|---|
| joiner → room creator | `hello {name, token}`, `act {d}` with `d.type` = `move {from, to}`, `pick {side}`, `resign`, `request {kind: undo/restart}`, `answer {accept}`, `cancel`; `bye` |
| room creator → joiner | `state {screen, toss, lobby, game, request}`, `full`, `reserved {name}`, `closed`, `away` |
| both | `ping` every 2 s; 10 s of silence = lost |

- **Requests:** online Undo / Restart set `view.request = {type, from}`; the other player gets Allow / Decline. Accepted undo takes back moves until the requester's own last move is undone and it's their turn. If the computer is standing in, requests are accepted at once. Restart is disabled once the game is over (the room creator uses Rematch).
- **Seat passes, drop-outs, takeover, rejoin, resume:** as in Auction XI. 60 s countdown (`TAKEOVER_SECONDS`), then the computer plays seat 2 (`isCPU` + `standIn`); seat handed back on rejoin; **Let someone else join** opens the seat; joiner retries every 3 s up to 40 times; the room creator can **Resume game** after a reload.
- **Browser storage:**

| Key | Contents |
|---|---|
| `viking-chess:settings` | Settings (mode, names, sides, level, theme, coords) |
| `viking-chess:hosted-game` | The room creator's saved game (12 h, `SAVE_HOURS`) |
| `viking-chess:joined-room` | The joiner's room code and seat pass (12 h) |

- Board style is never synced. Each device keeps its own.

### 2.7 Board styles (`css/themes/*.css`) and pieces (`js/pieces.js`)
Each style is one stylesheet scoped to `[data-theme="id"]`, registered in `THEMES` in `js/ui.js` and linked in `index.html`.

| id | Name | Look | Design reference |
|---|---|---|---|
| `oak` | Carved Oak (default) | Wood planks with SVG-noise grain, burnt lines, ring-chain border, grass background; verdigris attackers, bone defenders | `ref1.jpg` |
| `linen` | Linen & Knot | Canvas weave, bold black grid, chain-knot border, double-framed attacker squares, Uncial Antiqua headings; dark wood vs ivory | `ref2.jpg` |
| `runestone` | Runestone | Speckled limestone, engraved lines with light edges, cupped attacker squares, raised slab; black basalt vs ivory | `ref3.jpg` |
| `saga` | Saga | Flat rule-sheet illustration: teal lines, rune marks (hash + ellipse), diamond border and step badges, Germania One headings; black attackers in white line art, terracotta-lined defenders | `ref4.jpg` |

- **Design references** are in `Reference/` in the local project folder. They are downloaded product photos (copyrighted), so `Reference/` is in `.gitignore` and must never be committed or deployed.
- **Pieces:** SVG symbols injected once (`Pieces.install()`) and drawn with `<use>`. Attacker: hooded figure with a spoked round shield. Defender: helmet with nose guard, beard, heater shield with a cross. King: crown, moustache and beard, great shield with rings, rays and a diamond boss. Colours come only from CSS variables (`--a-*`, `--d-*`, `--k-*`: body, hi, lo, face, shield, boss, ink, plus `--d-helm`, `--k-crown`, `--k-beard`).
- **Gotcha:** CSS selectors can't style inside a `<use>` instance by the instance's ancestors (rules match the original symbol). Theme differences for pieces and marks must go through inherited CSS variables, e.g. `.mk { --mark: … }`, not `.mk .mark-lines { … }`.
- Figurines are taller than their square and overlap the row behind (`z-index` = row) for a 3/4 view; the King is larger.
- Square names show on the bottom and left of the frame only (top/right would sit under the pieces' heads).

### 2.8 Files

```
index.html              page shell, Google Fonts, PeerJS, theme stylesheets, #carve SVG filter
css/base.css            layout and components for every style; variable defaults
css/themes/*.css        oak, linen, runestone, saga
js/engine.js            VC.Engine: rules and state, no DOM
js/ai.js                VC.AI: computer player
js/net.js               VC.Net: PeerJS rooms, seat passes, heartbeat
js/pieces.js            VC.Pieces: SVG figurines and board marks
js/ui.js                screens, events, online lobby/sync/save/rejoin
tests/engine.test.js    rule tests (Node, no packages)
tests/ai.test.js        computer tests (Node, no packages, about a minute)
docs/screenshots/       README images
README.md               player and developer guide, original brief at the bottom
last_Update.md          this file
.gitignore              excludes Reference/, viking-chess/ and local tooling
.nojekyll               tells GitHub Pages to serve the files as they are (no Jekyll build)
viking-chess/    (local only, not in git) the deployed copy, linked to Netlify by .netlify/state.json
```

- **Load order matters:** classic scripts sharing `window.VC` (not ES modules), so the game works from `file://`. Order: PeerJS, engine, ai, net, pieces, ui.

### 2.9 Key settings

| Setting | Value | File |
|---|---|---|
| `REPEAT_LIMIT` | 3 | `js/engine.js` |
| `LEVELS` | easy 1 / normal 2 / hard 4 (1.3 s) | `js/ai.js` |
| CPU move delay | 450 ms | `js/ui.js` (`scheduleCPU`) |
| `TAKEOVER_SECONDS` | 60 | `js/ui.js` |
| `SAVE_HOURS` | 12 | `js/ui.js` |
| `RECONNECT_TRIES` / `RECONNECT_GAP` | 40 / 3000 ms | `js/ui.js` |
| `PING_EVERY` / `DROP_AFTER` | 2000 / 10000 ms | `js/net.js` |
| `--board-size` | min(700px, 94vw, 100vh − 210px) | `css/base.css` |

---

## 3. Version history

Newest first. Each version was pushed to `main` when finished.

### 0.8 · 2026-11-18 · Live on GitHub Pages
**Changed:**
- GitHub Pages turned on for `Drag375o/Viking_chess`, branch `main`, folder `/`: https://drag375o.github.io/Viking_chess/. Chosen because Netlify deploys are blocked by account credits (see 0.7), and Pages updates on every push.
- Added an empty `.nojekyll`. README: Play now points to GitHub Pages, with Netlify as a second address; update instructions for both.

**Files:** `.nojekyll` (new), `README.md`, `last_Update.md`.
**Deployed:** yes (GitHub Pages).

### 0.7 · 2026-11-18 · Live on Netlify
**Changed:**
- New folder `viking-chess/` inside the project (first created as `Viking_Chess_Online/`): a copy of everything except `.git` and `Reference/` (copyrighted photos must not be published). It is the deploy folder and is in `.gitignore`.
- Created the Netlify site in team Drag375 (account slug `drag375o`). The name `viking-chess` belongs to someone else's site (https://viking-chess.netlify.app, unrelated), so the owner chose `viking-chess-tafl`. The site was first live as `hnefatafl-viking-chess` and renamed the same day.
- Visitor protection (`sso_login`) was on by default and showed visitors a Netlify login page (401). It was turned off through the API, as on Auction XI.
- README: Play now link, live-site and update instructions.

**Files:** `viking-chess/` (new, local only), `.gitignore`, `README.md`, `last_Update.md`.
**Tested:** the live URL, `js/`, `css/` and `docs/` return 200 and `Reference/` returns 404. On the live site: a vs-computer game with toss and undo, and a two-browser online game (join, moves both ways, undo request, drop-out countdown, rejoin, room closed). No page errors.
**Deployed:** yes (the game files). After the rename to `viking-chess-tafl`, one more deploy (to update the README and this file in the live copy) was refused by Netlify with 403 "Account credit usage exceeded - new deploys are blocked until credits are added". The live game files match the repository; only the live copies of `README.md` and `last_Update.md` still mention the first address.

### 0.6 · 2026-11-18 · README, screenshots and this file
**Changed:** README for players and developers (features, rules in detail, options, online play, computer, hosting, tests, structure, customising) with 8 screenshots; the original brief kept at the bottom. Added `last_Update.md`.
**Files:** `README.md`, `docs/screenshots/*.jpg`, `last_Update.md`.
**Tested:** screenshots captured by a Playwright script that plays a same-screen game to a King escape; no page errors.

### 0.5 · 2026-11-18 · Online play
**Changed:** Online mode with room codes, lobby, synced toss and game, Allow/Decline requests for undo and restart, saved seats, computer stand-in, reconnect, rejoin and resume.
**Files:** `js/net.js` (new), `js/ui.js`, `css/base.css`, `index.html`.
**Tested:** two separate Chrome contexts through the real PeerJS server: create, join, moves both ways, undo request allowed, joiner closes the page (countdown shown), rejoin into the saved seat, move after rejoin, room creator leaves (joiner told the room closed). No page errors.

### 0.4 · 2026-11-18 · Computer opponent
**Changed:** `js/ai.js` with Easy / Normal / Hard; computer picks a side after winning the toss; undo against it returns to your own turn; vs Computer became the default mode.
**Files:** `js/ai.js` (new), `tests/ai.test.js` (new), `js/ui.js`, `index.html`.
**Tested:** `node tests/ai.test.js` (wins taken, single routes blocked, five computer-vs-computer games; slowest move about 1.3 s); a browser game with toss, three moves each and undo.

### 0.3 · 2026-11-18 · Three more board styles
**Changed:** Linen & Knot, Runestone and Saga, each matched to a reference image; theme previews on setup.
**Files:** `css/themes/linen.css`, `runestone.css`, `saga.css` (new), `css/base.css`, `index.html`, `js/ui.js`.
**Tested:** screenshots of each style at desktop width, close-ups of the pieces.

### 0.2 · 2026-11-18 · Playable board, figurines, Carved Oak
**Changed:** setup, rune toss and game screens; same-screen play; SVG figurine pieces; selection, targets, capture marks, move animation, capture toasts, warnings, move log, undo, restart, yield, result card; Carved Oak style.
**Files:** `index.html`, `css/base.css`, `css/themes/oak.css`, `js/pieces.js`, `js/ui.js`.
**Tested:** Playwright screenshots at 1440 px and 390 px; moves played by clicking; no page errors.

### 0.1 · 2026-11-18 · Rules engine
**Changed:** `js/engine.js` with the full ruleset and undo; `tests/engine.test.js`; `.gitignore` (excludes `Reference/`).
**Tested:** 28 rule tests including 300 random games with undo checks.

---

## 4. How to run
- Open `index.html` in Chrome, Edge, Firefox or Safari. No build step, no server.
- Online play works from `file://` too, but both players need the same files; normally use the live site.

## 5. Architecture notes for changes
- **Rules belong in `js/engine.js`** and must stay free of DOM code, so tests and the computer can run them.
- **Game state must stay plain JSON.** It is sent to the joiner and saved to localStorage.
- **Moves go through `E.move(g, from, to)`**, which returns `false` for an illegal move. The UI then calls `afterChange()`.
- **In UI code, use `isMine(i)`** for "does this device control player i". Online it compares with `view.online.me`; offline it means "not the computer".
- **New protocol messages:** handle them in `onHostEvent`/`guestAct` and `onGuestEvent`, and add them to the table in 2.6.
- **Escape all user text** with `esc()` before putting it in HTML. Names arrive from other devices.
- **Rendering** replaces `#app` on every change. One-off effects (move slide, capture toast) run after render, keyed on `view.seenPly`, so repeated renders don't replay them.

## 6. Adding things
- **Board style:** copy a file in `css/themes/`, change its selector, set the variables (including the piece colours), link it in `index.html`, add it to `THEMES` in `js/ui.js`, update 2.7 and the README.
- **Rule variant:** change `js/engine.js`, update the tests, `RULES` in `js/ui.js`, the quick rules on the game screen, the README rules and 2.2. Keep one consistent ruleset.

## 7. Saved data and compatibility
- Storage keys are listed in 2.6. If the shape of saved data changes, migrate old values or make the reader ignore them safely.
- Online, both players need the same version. After deploying a protocol change, ask players to reload.

## 8. Deployment
- **GitHub Pages (main live site):** https://drag375o.github.io/Viking_chess/, built from `main`, folder `/`. Every push to `main` is live about a minute later. `.nojekyll` skips the Jekyll build. Settings → Pages in the repository.
- **Netlify (second address):** site `viking-chess-tafl` (siteId `2270a643-98f0-4aea-bc4b-3f1ac4f8262a`), team Drag375. Dashboard: https://app.netlify.com/projects/viking-chess-tafl
  - **Deploy folder:** `viking-chess/` inside the project, linked by `.netlify/state.json`. It is a copy of the repository files; copy changed files into it (never `Reference/` or `.git`), then from inside it run `npx netlify-cli deploy --prod --dir .` (needs a logged-in Netlify CLI).
  - **Visitor protection:** off (`sso_login: false`). A new Netlify site starts with it on.
  - **Credits:** deploys are blocked while the account's credits are used up (see Known limitations).
  - **Rollback:** publish an earlier deploy from the dashboard's **Deploys** page.
- **Online rooms work across both addresses** (rooms are found through the PeerJS server, not the host), but both players should run the same version.
- **Approval:** publishing reaches everyone, so get the owner's go-ahead first. `Reference/` is never in the repository, so Pages can't publish it.

## 9. Testing
- **Rules:** `node tests/engine.test.js` (28 tests).
- **Computer:** `node tests/ai.test.js` (about a minute).
- **UI and online:** checked with Playwright (Python) and system Chrome (`channel="chrome"`), including two separate browser contexts for online games through the real PeerJS server. Those scripts are not in the repository yet; adding them under `tests/` would be a good next step.

## 10. Known limitations
- **Netlify credits (2026-11-18):** the Drag375 account ran out of deploy credits, so new deploys are blocked until credits are added or the plan's allowance resets. GitHub Pages is unaffected. Redeploy Netlify from `viking-chess/` once it's allowed, so it catches up.
- **Room creator dependency:** online play depends on the room creator's tab and the free PeerJS server.
- **Strict networks:** some networks block direct WebRTC connections; there's no TURN relay server.
- **Cheating:** the room creator's browser runs the rules, so a technical user could tamper with it. Fine for friendly games.
- **Offline games aren't saved:** vs Computer and same-screen games start over after a reload.
- **Computer on the main thread:** Hard can pause the page for up to about 1.3 s per move (a Web Worker isn't used because the game must work from `file://`).
- **Computer vs computer** at equal Normal strength can shuffle for hundreds of moves without a result; human games end normally.
- **No encirclement rule or edge forts:** these Copenhagen extras aren't implemented; a King hugging the edge can't be captured, but he can still be blocked in, which ends the game if the defenders run out of moves.
- **No sound.**
