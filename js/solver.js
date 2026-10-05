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
  function shuffle(a, rnd) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  }
  function isSolved(o) { for (var i = 0; i < o.length; i++) if (o[i] !== i) return false; return true; }
  // Each swap changes the number of cycles by one and a solved board has one per tile, so the floor is tiles minus cycles.
  function fewestSwaps(o) {
    var seen = [], cycles = 0;
    for (var i = 0; i < o.length; i++) { if (seen[i]) continue; cycles++; for (var j = i; !seen[j]; j = o[j]) seen[j] = 1; }
    return o.length - cycles;
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
   * Scrambles a photo into `el` and plays it: tap one piece, then another, to swap them.
   *
   * opts.img     the photo's URL
   * opts.n       pieces per side (GRID[difficulty])
   * opts.aspect  the photo's width / height. The board is square and both apps play the centre square of a
   *              photo, so a wide or tall one is cropped here the same way instead of being squashed.
   * opts.seed    optional string: the same seed scrambles the same way for everyone (the studio's puzzles),
   *              so two people's swap counts can be compared
   * opts.onSwap(moves) and opts.onSolve({ moves, fewest }) report progress.
   *
   * Returns { fewest }, the fewest swaps that solve this scramble.
   */
  function mount(el, opts) {
    var n = opts.n, total = n * n, img = opts.img;
    // order[cell] = which correct-tile index currently sits in that cell
    var order = [];
    for (var i = 0; i < total; i++) order.push(i);
    var rnd = opts.seed ? seeded(opts.seed) : Math.random;
    do { shuffle(order, rnd); } while (isSolved(order));
    var fewest = fewestSwaps(order);

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
    }
    for (c = 0; c < total; c++) paint(c);

    var sel = -1, moves = 0, done = false;
    function pick(cell, on) {
      tiles[cell].classList.toggle("sel", on);
      tiles[cell].setAttribute("aria-pressed", on ? "true" : "false");
    }
    el.onclick = function (e) {
      var t = e.target.closest ? e.target.closest(".tile") : null;
      if (!t || done) return;
      var c = +t.dataset.cell;
      if (sel === -1) { sel = c; pick(c, true); return; }
      if (sel === c) { sel = -1; pick(c, false); return; }
      var a = sel, tmp = order[a]; order[a] = order[c]; order[c] = tmp;
      pick(a, false); sel = -1;
      moves++;
      paint(a); paint(c);
      // Restart the swap animation on both pieces, for pages that style .pop.
      [a, c].forEach(function (k) { tiles[k].classList.remove("pop"); void tiles[k].offsetWidth; tiles[k].classList.add("pop"); });
      if (opts.onSwap) opts.onSwap(moves);
      if (isSolved(order)) {
        done = true;
        el.classList.add("solved");
        tiles.forEach(function (x) { x.disabled = true; x.removeAttribute("aria-pressed"); });
        if (opts.onSolve) opts.onSolve({ moves: moves, fewest: fewest });
      }
    };
    return { fewest: fewest };
  }

  root.PhuzzleSolver = { GRID: GRID, OFFICIAL: OFFICIAL, isTodaysDaily: isTodaysDaily, mount: mount };
})(window);
