/* The parts of a Phuzzle both browser solvers share: the shared-link solver (404.html, for /puzzle/<id> and
   /solve/<id>) and the Farcaster mini app (/mini/). One copy, so a fix lands in both.

   A plain script rather than a module, because the 404 page is a plain script too. It defines PhuzzleSolver. */
(function (root) {
  "use strict";

  // Pieces per side for each difficulty, as in both apps: Easy is 3x3, Expert is 6x6.
  var GRID = { EASY: 3, MEDIUM: 4, HARD: 5, EXPERT: 6 };
  // The account createPuzzleOfTheDay posts the daily from.
  var OFFICIAL = "phuzzles-official";

  // FNV-1a of the id into mulberry32: the same id always gives the same sequence.
  function seeded(s) {
    var a = 2166136261;
    for (var i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 16777619);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function isSolved(o) { for (var i = 0; i < o.length; i++) if (o[i] !== i) return false; return true; }
  // Each swap changes the number of cycles by one and a solved board has one per tile, so the floor is tiles minus cycles.
  function fewestSwaps(o) {
    var seen = [], cycles = 0;
    for (var i = 0; i < o.length; i++) { if (seen[i]) continue; cycles++; for (var j = i; !seen[j]; j = o[j]) seen[j] = 1; }
    return o.length - cycles;
  }
  // A full shuffle leaves 36 pieces about 32 swaps from solved — 64 taps, and that is where web solvers
  // stopped. Counting the transpositions sets the work instead of inheriting it: about 4 swaps at 3x3,
  // 7 at 4x4, 16 at 6x6. Transpositions can also cancel each other out, and at 3x3 that handed out a board
  // two swaps from solved one time in five, so it keeps going until the board is worth solving. A seeded
  // board still scrambles the same way for everyone.
  function scramble(a, rnd) {
    var n = a.length, swaps = Math.max(3, Math.round(n * 0.45)), done = 0;
    while (done < swaps || fewestSwaps(a) < 3) {
      var i = Math.floor(rnd() * n), j = Math.floor(rnd() * n);
      if (i === j) continue;
      var t = a[i]; a[i] = a[j]; a[j] = t;
      done++;
    }
  }

  // A daily stays isPotd until the next one goes up at 11:00 Eastern, so from midnight to 11:00 it is still
  // yesterday's. It is today's only on the Eastern date it went up (potdAt; sentAt on older dailies).
  function isTodaysDaily(d, now) {
    if (!d.isPotd) return false;
    var at = d.potdAt || d.sentAt, ms = at && at.toMillis ? at.toMillis() : 0;
    if (!ms) return true;
    var day = function (t) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(t)); };
    return day(ms) === day(now);
  }

  /**
   * Scrambles a photo into `el` and plays it: tap one piece, then another, to swap them — or drag one
   * onto the other.
   *
   * opts.img     the photo's URL
   * opts.n       pieces per side (GRID[difficulty])
   * opts.aspect  the photo's width / height. The board is square and both apps play the centre square of a
   *              photo, so a wide or tall one is cropped here the same way instead of being squashed.
   * opts.seed    optional string: the same seed scrambles the same way for everyone (the studio's puzzles),
   *              so two people's swap counts can be compared
   * opts.saveKey optional localStorage key: with one, a half-solved board survives closing the tab
   * opts.elapsed optional function returning the milliseconds played so far, stored alongside the board
   * opts.onSwap(moves, home) and opts.onSolve({ moves, fewest }) report progress; `home` is how many
   *              pieces are in their own cell, which is also the .tile.ok class a page can style.
   *
   * Returns { fewest, moves, home, elapsed, setImage }: the fewest swaps that solve this scramble, the swaps,
   * pieces already in place and milliseconds a resumed board carries over, and a way to hand the board a
   * better copy of the photo.
   */
  function mount(el, opts) {
    var n = opts.n, total = n * n, img = opts.img;
    // order[cell] = which correct-tile index currently sits in that cell
    var order = [];
    for (var i = 0; i < total; i++) order.push(i);
    var rnd = opts.seed ? seeded(opts.seed) : Math.random;
    scramble(order, rnd);
    var fewest = fewestSwaps(order), moves = 0;
    // A board left half-solved is picked up where it was, par included: the fewest swaps for the scramble
    // they were given, not for whatever is left of it.
    var saved = restore();
    if (saved) { order = saved.o; moves = saved.m | 0; if (typeof saved.f === "number") fewest = saved.f; }
    var elapsed = saved ? saved.t | 0 : 0;

    var aspect = opts.aspect > 0 && isFinite(opts.aspect) ? opts.aspect : 1;
    var ax = Math.max(aspect, 1), ay = Math.max(1 / aspect, 1);
    var size = (n * ax * 100) + "% " + (n * ay * 100) + "%";
    // Background-position p% lines up p% of the image with p% of the tile. Solving for the offset that shows
    // piece k of the centred square gives this; with a square photo it is k / (n - 1).
    function pos(k, a) { return (((n * a - n) / 2 + k) / (n * a - 1) * 100) + "%"; }

    el.innerHTML = "";
    el.classList.remove("solved");
    el.style.gridTemplateColumns = "repeat(" + n + ",1fr)";
    el.style.gridTemplateRows = "repeat(" + n + ",1fr)";
    var tiles = [];
    for (var c = 0; c < total; c++) {
      var t = document.createElement("button");
      t.type = "button"; t.className = "tile"; t.dataset.cell = c;
      t.setAttribute("aria-pressed", "false");
      t.setAttribute("aria-label", "Piece in row " + (Math.floor(c / n) + 1) + ", column " + (c % n + 1));
      t.style.backgroundImage = "url('" + img + "')";
      t.style.backgroundSize = size;
      el.appendChild(t); tiles.push(t);
    }
    function paint(cell) {
      var k = order[cell];
      tiles[cell].style.backgroundPosition = pos(k % n, ax) + " " + pos(Math.floor(k / n), ay);
      // A piece in its own cell is the only progress there is to show, so it is on the piece itself.
      tiles[cell].classList.toggle("ok", k === cell);
    }
    for (c = 0; c < total; c++) paint(c);
    function home() { var h = 0; for (var k = 0; k < total; k++) if (order[k] === k) h++; return h; }

    // Closing the tab lost a half-solved board. Keep it under the puzzle's own key and pick it up next
    // visit; a private window, where storage throws, just starts fresh.
    function save() {
      if (!opts.saveKey) return;
      try {
        localStorage.setItem(opts.saveKey, JSON.stringify({
          o: order, m: moves, f: fewest, t: opts.elapsed ? opts.elapsed() : 0 }));
      } catch (e) {}
    }
    function restore() {
      if (!opts.saveKey) return null;
      var s = null;
      try { s = JSON.parse(localStorage.getItem(opts.saveKey)); } catch (e) { return null; }
      // Anything that is not a permutation of this board would paint pieces twice over, so it is dropped.
      if (!s || !(s.o instanceof Array) || s.o.length !== total) return null;
      var seen = [];
      for (var k = 0; k < total; k++) {
        var v = s.o[k];
        if (!(v >= 0 && v < total) || seen[v]) return null;
        seen[v] = 1;
      }
      return isSolved(s.o) ? null : s;
    }
    function forget() { if (opts.saveKey) { try { localStorage.removeItem(opts.saveKey); } catch (e) {} } }

    var sel = -1, done = false;
    function pick(cell, on) {
      tiles[cell].classList.toggle("sel", on);
      tiles[cell].setAttribute("aria-pressed", on ? "true" : "false");
    }
    function swap(a, c) {
      var tmp = order[a]; order[a] = order[c]; order[c] = tmp;
      moves++;
      paint(a); paint(c);
      // Restart the swap animation on both pieces, for pages that style .pop.
      [a, c].forEach(function (k) { tiles[k].classList.remove("pop"); void tiles[k].offsetWidth; tiles[k].classList.add("pop"); });
      save();
      if (opts.onSwap) opts.onSwap(moves, home());
      if (isSolved(order)) {
        done = true;
        forget();
        el.classList.add("solved");
        // The rings come off: what is left is the photo, not a scorecard.
        tiles.forEach(function (x) { x.disabled = true; x.removeAttribute("aria-pressed"); x.classList.remove("ok"); });
        if (opts.onSolve) opts.onSolve({ moves: moves, fewest: fewest });
      }
    }

    // Drag as well as tap: press a piece and drop it on another. Under the threshold nothing happens here
    // and the click below still reads it as the first of two taps. A drag the browser takes for a scroll
    // arrives as pointercancel, which puts the piece back.
    var from = -1, fromX = 0, fromY = 0, dragging = false, afterDrag = false;
    function tileAt(e) { var t = e.target.closest ? e.target.closest(".tile") : null; return t && t.parentNode === el ? t : null; }
    el.addEventListener("pointerdown", function (e) {
      var t = tileAt(e);
      afterDrag = false;
      if (!t || done) return;
      from = +t.dataset.cell; fromX = e.clientX; fromY = e.clientY; dragging = false;
      if (t.setPointerCapture) { try { t.setPointerCapture(e.pointerId); } catch (err) {} }
    });
    el.addEventListener("pointermove", function (e) {
      if (from === -1 || dragging) return;
      if (Math.abs(e.clientX - fromX) + Math.abs(e.clientY - fromY) < 8) return;
      dragging = true;
      if (sel !== -1 && sel !== from) { pick(sel, false); sel = -1; }
      pick(from, true);
    });
    el.addEventListener("pointerup", function (e) {
      var a = from, moved = dragging;
      from = -1; dragging = false;
      if (a === -1 || !moved) return;
      pick(a, false);
      // The piece has pointer capture, so where the finger let go has to be looked up by position.
      var over = document.elementFromPoint(e.clientX, e.clientY);
      var t = over && over.closest ? over.closest(".tile") : null;
      var b = t && t.parentNode === el ? +t.dataset.cell : -1;
      afterDrag = true;
      if (b === -1 || b === a || done) return;
      sel = -1;
      swap(a, b);
    });
    el.addEventListener("pointercancel", function () {
      if (from !== -1 && dragging) pick(from, false);
      from = -1; dragging = false;
    });
    el.onclick = function (e) {
      var t = tileAt(e);
      if (!t || done) return;
      // A drag ends in a click of its own, on whichever element its two ends have in common. The next real
      // tap clears this on its pointerdown, so dragging and tapping in quick succession both work.
      if (afterDrag) { afterDrag = false; return; }
      var c = +t.dataset.cell;
      if (sel === -1) { sel = c; pick(c, true); return; }
      if (sel === c) { sel = -1; pick(c, false); return; }
      var a = sel;
      pick(a, false); sel = -1;
      swap(a, c);
    };

    // The board can start on a thumbnail and take the full photo when it arrives: same crop, so only the
    // URL changes.
    function setImage(url) {
      img = url;
      for (var k = 0; k < total; k++) tiles[k].style.backgroundImage = "url('" + url + "')";
    }
    return { fewest: fewest, moves: moves, home: home(), elapsed: elapsed, setImage: setImage };
  }

  root.PhuzzleSolver = { GRID: GRID, OFFICIAL: OFFICIAL, isTodaysDaily: isTodaysDaily, mount: mount };
})(window);
