// The Phuzzles mini app: solve the puzzle a post links to (or today's), and post one of your own.
//
// It runs inside Farcaster and the Base app, where ./sdk.js talks to the host, and in any browser, where
// everything works except posting, which needs a Farcaster account. The board is js/solver.js, the same one
// the shared-link solver (404.html) plays.

const $ = (id) => document.getElementById(id);
const Solver = window.PhuzzleSolver;
const MINI = "https://phuzzles.app/mini/";
const API = "https://us-central1-phuzzles.cloudfunctions.net";
const LEVEL_NAME = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard", EXPERT: "Expert" };
const SIDE = 1080;          // a sent photo is cut to a square this many pixels across (or its own size if smaller)
const MIN_SIDE = 200;       // what miniappCreatePuzzle accepts; smaller and the pieces are mush
const NOTE_MAX = 200;       // the apps' limit
// A Farcaster username (an fname, or an ENS or Base name), the shape miniappCreatePuzzle stores, so a mention in
// a cast only ever names the sender's own account.
const FC_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
// Photos come from Phuzzles' own Storage bucket, where the apps, the daily and miniappCreatePuzzle all put them.
// The create rule takes any imageUrl string, so without this a hand-made link puzzle could point solvers at a
// server of its own, and change the picture after anyone had looked at it.
const OUR_PHOTOS = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/phuzzles\.firebasestorage\.app\/o\/[^'"()\s\\]+$/;

// ── The host ────────────────────────────────────────────────────────────────────────────────────────────
// A Farcaster client frames the page (an iframe on the web, a WebView on phones) and answers the SDK with its
// context. Unframed, it is a plain browser and the SDK is never downloaded.
let sdk = null, ctx = null;
const framed = window.parent !== window || !!window.ReactNativeWebView;
const lib = framed ? import("./sdk.js").then((m) => m.sdk, () => null) : Promise.resolve(null);
// The page goes in-app whenever the context arrives. The SDK's isInMiniApp() gives up after one second, and
// with it a host slower than that would get a page that acts as a browser and never says it's ready: an endless
// splash screen.
const answered = lib.then((s) => s && Promise.resolve(s.context).then((c) => (c ? adopt(s, c) : null), () => null));
// What can't wait forever (whether Send shows the form) waits three seconds, and is redone if the host answers later.
const host = Promise.race([answered, new Promise((r) => setTimeout(r, 3000, null))]);

function adopt(s, c) {
  sdk = s;
  ctx = c;
  document.documentElement.classList.add("in-app");
  const inset = c.client && c.client.safeAreaInsets;
  if (inset) {
    document.documentElement.style.setProperty("--top", `max(13px, ${inset.top || 0}px)`);
    document.documentElement.style.setProperty("--bottom", `max(21px, ${inset.bottom || 0}px)`);
  }
  route();
  return s;
}

// The host shows its splash screen until ready(). It is said as soon as there is something to look at, or after
// three seconds whatever happens, and whether or not the host has answered yet: a slow network shows the loading
// board instead of an endless splash, and a page that frames this one without being a host ignores the message.
let readied = false;
function ready() {
  if (readied) return;
  readied = true;
  lib.then((s) => s && s.actions.ready().catch(() => {}));
}
setTimeout(ready, 3000);

function haptic(kind) {
  if (!sdk || !(ctx && ctx.features && ctx.features.haptics)) return;
  const h = sdk.haptics;
  (kind === "success" ? h.notificationOccurred("success") : h.impactOccurred("light")).catch(() => {});
}

// Same GA4 property as the rest of the site; index.html sends nothing from localhost.
function ev(name, extra) {
  try { if (window.gtag) window.gtag("event", name, Object.assign({ in_app: !!sdk }, extra || {})); } catch (e) { /* analytics never breaks the page */ }
}

// Outside links: a Farcaster client opens them itself; a browser follows the link.
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest("a[href]");
  if (!a) return;
  if (a.dataset.store) ev("store_click", { store: a.dataset.store, from: "mini_send" });
  const href = a.getAttribute("href");
  if (sdk && (/^(https?:|mailto:)/.test(href) || a.target === "_blank")) {
    e.preventDefault();
    const url = new URL(href, location.href).href;
    sdk.actions.openUrl(url).catch(() => { location.href = url; });
  }
});

// ── Screens ─────────────────────────────────────────────────────────────────────────────────────────────
// play or empty is the base (what ?p= or today's daily turned out to be); #send shows the send flow on top.
const SCREENS = ["play", "empty", "send", "sent", "elsewhere"];
let base = "play", sendStage = "send", leftBase = false;
function show(id) {
  SCREENS.forEach((s) => { $(s).hidden = s !== id; });
  document.documentElement.classList.toggle("on-play", id === "play");
  const onBase = id === "play" || id === "empty";
  const top = $("toplink");
  top.textContent = onBase ? "Send your own" : "Back";
  top.setAttribute("href", onBase ? "#send" : "#");
  if (sdk) {
    sdk.back.onback = onBase ? null : back;
    (onBase ? sdk.back.hide() : sdk.back.show()).catch(() => {});
  }
  if (!onBase) window.scrollTo(0, 0);
}
function back() {
  // A page opened straight on #send has nothing behind it to go back to.
  if (leftBase) history.back(); else location.hash = "";
}
function route() {
  if (location.hash !== "#send") {
    // A puzzle that went out is finished with, so the next Send your own starts a new one. One that was made but
    // not posted stays, so it can still be posted.
    if (made && made.posted) resetSend();
    show(base);
    return;
  }
  host.then(() => {
    if (location.hash !== "#send") return;
    show(sdk ? sendStage : "elsewhere");
    ev(sdk ? "mini_send_open" : "mini_send_elsewhere");
  });
}
window.addEventListener("hashchange", (e) => {
  if (location.hash === "#send" && !/#send$/.test(e.oldURL)) leftBase = true;
  route();
});
$("toplink").addEventListener("click", (e) => { if ($("toplink").getAttribute("href") === "#") { e.preventDefault(); back(); } });

// ── Loading a puzzle ────────────────────────────────────────────────────────────────────────────────────
const wanted = (new URLSearchParams(location.search).get("p") || "").trim();
let db = null, signedIn = null;
try {
  window.firebase.initializeApp({
    apiKey: "AIzaSyDPn4eEkZhUBp7x_3mVVcDlaiopfFDJna4",
    authDomain: "phuzzles.firebaseapp.com",
    projectId: "phuzzles",
    storageBucket: "phuzzles.firebasestorage.app",
    messagingSenderId: "945990447779",
    appId: "1:945990447779:android:19af9e38d335e5b5368516",
  });
  // The rules let an anonymous visitor get a puzzle shared by link, a public one or a daily, and list dailies.
  signedIn = window.firebase.auth().signInAnonymously();
  db = window.firebase.firestore();
} catch (e) {
  signedIn = Promise.reject(e);
}

async function fetchPuzzle(id) {
  await signedIn;
  if (id) {
    const doc = await db.collection("puzzles").doc(id).get();
    return doc.exists ? { id: doc.id, d: doc.data() } : null;
  }
  // Today's daily: the newest puzzle flagged isPotd (createPuzzleOfTheDay moves the flag at 11:00 Eastern).
  const snap = await db.collection("puzzles").where("isPotd", "==", true).get();
  const ms = (v) => (v && v.toMillis ? v.toMillis() : 0);
  const docs = snap.docs.slice().sort((a, b) => ms(b.get("sentAt")) - ms(a.get("sentAt")));
  return docs.length ? { id: docs[0].id, d: docs[0].data() } : null;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

function empty(kind) {
  const go = $("empty-go");
  if (kind === "offline") {
    $("empty-title").textContent = "Couldn’t reach Phuzzles";
    $("empty-text").textContent = "The puzzle didn’t load. Check your connection and try again.";
    go.textContent = "Try again";
    go.onclick = () => location.reload();
  } else if (kind === "busy") {
    // Firebase stops signing in new visitors from one IP address after a burst of them (TOO_MANY_ATTEMPTS_TRY_LATER;
    // on 2026-10-05 a day of test runs tripped it and it lifted within minutes). An office, a campus or a phone
    // carrier puts many people behind one address. Their connection is fine, so don't tell them to check it.
    $("empty-title").textContent = "Too many first visits from this network";
    $("empty-text").textContent = "Phuzzles can only let in so many at once from one network. Try again in a few minutes.";
    go.textContent = "Try again";
    go.onclick = () => location.reload();
  } else if (kind === "none") {
    $("empty-title").textContent = "Today’s puzzle isn’t up yet";
    $("empty-text").textContent = "A new one goes up every day at 11:00 Eastern.";
    go.textContent = "Try again";
    go.onclick = () => location.reload();
  } else {
    $("empty-title").textContent = "This Phuzzle has gone";
    $("empty-text").textContent = "Puzzles are deleted 30 days after they’re sent, and one sent straight to someone in the app only opens there.";
    go.textContent = "Solve today’s puzzle";
    go.onclick = () => { location.href = "./"; };
  }
  base = "empty";
  route();
  ev("mini_empty", { why: kind });
  ready();
}

async function start() {
  if (wanted && !/^[A-Za-z0-9]{10,40}$/.test(wanted)) { empty("gone"); return; }
  let p;
  try {
    p = await fetchPuzzle(wanted);
  } catch (e) {
    // Firestore answers permission-denied for a puzzle that no longer exists and for a private one alike.
    const code = e && e.code;
    empty(code === "permission-denied" ? "gone" : code === "auth/too-many-requests" ? "busy" : "offline");
    return;
  }
  if (!p) { empty(wanted ? "gone" : "none"); return; }
  if (typeof p.d.imageUrl !== "string" || !OUR_PHOTOS.test(p.d.imageUrl)) { empty("gone"); return; }
  let img;
  try { img = await loadImage(p.d.imageUrl); } catch (e) { empty("gone"); return; }
  play(p, img);
}

// ── Playing ─────────────────────────────────────────────────────────────────────────────────────────────
const plural = (n, one) => n + " " + one + (n === 1 ? "" : "s");
function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const ss = String(r).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
// Posted from here. Only miniappCreatePuzzle writes a senderId of "fc:<fid>" (the rules hold anyone else to their
// own Firebase uid), so a puzzle made by hand with source "miniapp" can't borrow a Farcaster name.
const fromMiniApp = (d) => d.source === "miniapp" && typeof d.senderId === "string" && d.senderId.startsWith("fc:");
function kindOf(d) {
  return d.senderId === Solver.OFFICIAL ? "daily" : fromMiniApp(d) ? "miniapp"
    : d.receiverId === "__link__" ? "link" : d.isPublic ? "public" : "direct";
}
// How to name the sender. A puzzle posted from here carries the poster's Farcaster username, which gets the
// @ people know it by; a puzzle from the apps carries a Phuzzles username, which is not a Farcaster account.
// The function keeps the bare name in farcasterUsername and writes senderUsername as "alice on Farcaster" for
// the apps (its first version put the bare name in senderUsername, which still reads right here).
function senderOf(d) {
  if (d.senderId === Solver.OFFICIAL) return { name: null, mention: null };
  if (fromMiniApp(d)) {
    const fc = [d.farcasterUsername, d.senderUsername].map((u) => (typeof u === "string" ? u.trim() : "")).find((u) => FC_NAME.test(u));
    if (fc) return { name: "@" + fc, mention: "@" + fc };
  }
  const u = typeof d.senderUsername === "string" ? d.senderUsername.trim() : "";
  return { name: u || null, mention: null };
}

let ticking = 0;
function play(p, img) {
  const { id, d } = p;
  const official = d.senderId === Solver.OFFICIAL;
  const today = official && Solver.isTodaysDaily(d, Date.now());
  const n = Solver.GRID[d.difficulty] || 4;
  const who = senderOf(d).name;
  $("eyebrow").textContent = (official ? "Puzzle of the Day · " : "") + n * n + " pieces · " + (LEVEL_NAME[d.difficulty] || "Medium");
  $("title").textContent = official ? (today ? "Today’s Phuzzle" : d.isPotd ? "Yesterday’s Phuzzle" : "Solve the Phuzzle")
    : who ? who + " sent you a Phuzzle" : "Solve the Phuzzle";

  const board = $("board");
  board.removeAttribute("aria-busy");
  board.setAttribute("aria-label", `A ${n} by ${n} photo puzzle`);
  const startedAt = Date.now();
  Solver.mount(board, {
    img: d.imageUrl, n, aspect: img.naturalWidth / img.naturalHeight,
    // The studio's dailies scramble the same way for everyone, so swap counts compare.
    seed: official ? id : null,
    onSwap: (m) => { $("moves").textContent = plural(m, "swap"); haptic("impact"); },
    onSolve: (r) => solved(p, r, Date.now() - startedAt, today),
  });
  $("moves").textContent = "Tap two pieces to swap them.";
  $("clock").textContent = "0:00";
  // Anyone can post a photo here, so anyone who sees one can flag it to a person. The studio's dailies are ours.
  if (!official) {
    const link = MINI + "?p=" + encodeURIComponent(id);
    $("report-link").href = "mailto:support@phuzzles.app?subject=" + encodeURIComponent("Report: Phuzzle " + id) +
      "&body=" + encodeURIComponent(`This photo shouldn't be up: ${link}\n\nWhat's wrong with it:\n`);
    $("report").hidden = false;
  }
  clearInterval(ticking);
  ticking = setInterval(() => { $("clock").textContent = clock(Date.now() - startedAt); }, 500);
  base = "play";
  route();
  ev("mini_open", { puzzle_kind: kindOf(d), pieces: n * n });
  ready();
}

function solved(p, r, ms, today) {
  clearInterval(ticking);
  const { id, d } = p;
  const official = d.senderId === Solver.OFFICIAL;
  $("result-time").textContent = "Solved in " + clock(ms);
  $("result-sub").textContent = plural(r.moves, "swap") + (official ? " · fewest possible " + r.fewest : "");
  $("meta").hidden = true;
  const msg = typeof d.message === "string" ? d.message.trim() : "";
  if (msg) {
    $("msg").textContent = msg;
    $("msg").classList.toggle("long", msg.length > 90);
    $("note").hidden = false;
  }
  $("after").hidden = false;
  if (today) {
    $("after-foot").textContent = "A new one goes up every day at 11:00 Eastern.";
    $("after-foot").hidden = false;
  }
  $("share").onclick = () => shareTime(p, r, ms, today);
  haptic("success");
  ev("mini_solved", { puzzle_kind: kindOf(d), swaps: r.moves, seconds: Math.round(ms / 1000) });
  // The same call the web solver makes for a puzzle shared by link. It counts the solve on the puzzle
  // (linkSolveCount, the only record that a posted puzzle got solved), and for one an app user shared it pushes
  // to the sender, at most a few times per puzzle. A puzzle posted from here has nobody to push to: telling a
  // Farcaster sender would take the mini app's own notifications, which v1 doesn't have.
  if (d.linkShared === true) {
    fetch(API + "/linkSolved", {
      method: "POST", keepalive: true, headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ms }),
    }).catch(() => {});
  }
  // Bring the time and the two buttons into view.
  requestAnimationFrame(() => reveal($("after")));
}

async function shareTime(p, r, ms, today) {
  const { id, d } = p;
  const url = MINI + "?p=" + encodeURIComponent(id);
  const t = clock(ms);
  let text;
  if (d.senderId === Solver.OFFICIAL) {
    text = (today ? "Solved today's Phuzzle" : "Solved a Phuzzle of the Day") +
      ` in ${t}, with ${plural(r.moves, "swap")} (the fewest possible was ${r.fewest}). Your turn.`;
  } else {
    const m = senderOf(d).mention;
    text = (m ? `Solved ${m}'s Phuzzle` : "Solved a Phuzzle") + ` in ${t}.`;
  }
  const btn = $("share");
  if (sdk) {
    try {
      const res = await sdk.actions.composeCast({ text, embeds: [url] });
      ev("mini_share_time", { method: "cast", posted: !!(res && res.cast) });
    } catch (e) { /* the composer was closed */ }
    return;
  }
  if (navigator.share) {
    try { await navigator.share({ text, url }); ev("mini_share_time", { method: "sheet" }); } catch (e) { /* cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(text + " " + url);
    btn.textContent = "Copied. Paste it anywhere";
    ev("mini_share_time", { method: "copy" });
  } catch (e) {
    btn.textContent = url;
  }
}

// ── Sending ─────────────────────────────────────────────────────────────────────────────────────────────
let photo = null;   // { blob, url } of the square JPEG
let made = null;    // { id, url, note, n, img, posted } once the puzzle exists
let staleToken = false;   // the function turned down the last sign-in, so the next try gets a new one

const levelNow = () => document.querySelector('input[name="level"]:checked').value;
function setCuts() {
  const n = Solver.GRID[levelNow()];
  $("cuts").style.setProperty("--n", n);
  document.querySelectorAll(".level").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
}
$("levels").addEventListener("change", setCuts);
$("note-in").addEventListener("input", () => { $("note-count").textContent = $("note-in").value.length; });

function sendError(text) {
  const box = $("send-err");
  box.textContent = text || "";
  box.hidden = !text;
  // On a short screen the box lands under the fold, and a refusal nobody sees looks like nothing happened.
  if (text) requestAnimationFrame(() => reveal(box));
}

// Scroll just enough to show an element with a little room around it, whichever side it is off.
function reveal(el) {
  const r = el.getBoundingClientRect(), room = 13;
  const by = r.bottom + room > window.innerHeight ? r.bottom + room - window.innerHeight : r.top < room ? r.top - room : 0;
  if (by) window.scrollBy({ top: by, behavior: "smooth" });
}

// Cut the middle square out of the photo, at most SIDE across, as a JPEG: what both apps play, and a few
// hundred KB to upload instead of a phone's 5 MB original.
async function squarePhoto(file) {
  if (file.size > 40e6) throw new Error("That file is over 40 MB. Pick a smaller photo.");
  const src = URL.createObjectURL(file);
  try {
    let img;
    try { img = await loadImage(src); } catch (e) { throw new Error("That file couldn’t be opened as a photo. Try a JPEG or PNG."); }
    const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
    if (s < MIN_SIDE) throw new Error(`That photo is too small to cut into pieces. Pick one at least ${MIN_SIDE} pixels across.`);
    const side = Math.min(SIDE, s);
    const c = document.createElement("canvas");
    c.width = c.height = side;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";                 // a transparent PNG would otherwise turn black as a JPEG
    g.fillRect(0, 0, side, side);
    g.imageSmoothingQuality = "high";
    g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, side, side);
    const blob = await new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("That photo couldn’t be prepared. Try another one.");
    return { blob, url: URL.createObjectURL(blob) };
  } finally {
    URL.revokeObjectURL(src);
  }
}

$("file").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";                   // so choosing the same file again still fires
  if (!file) return;
  sendError(null);
  try {
    const next = await squarePhoto(file);
    if (photo) URL.revokeObjectURL(photo.url);
    photo = next;
  } catch (err) {
    sendError(err.message);
    return;
  }
  $("pick-img").src = photo.url;
  ["pick-img", "cuts", "change"].forEach((x) => { $(x).hidden = false; });
  $("pick-empty").hidden = true;
  $("post").disabled = false;
  setCuts();
  ev("mini_photo_ready", { kb: Math.round(photo.blob.size / 1024) });
});

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// The backend's contract (functions/src/miniapp.ts on the Phuzzles app repo, branch miniapp-send):
//   POST /miniappCreatePuzzle, Authorization: Bearer <Quick Auth token>, JSON { photo, difficulty, message }
//   200 { id, url }, or { error, message } with 400/401/403/413/415/429/500/503, "message" fit to show as it is.
async function createPuzzle(token, blob, difficulty, message) {
  const res = await fetch(API + "/miniappCreatePuzzle", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ photo: await blobToBase64(blob), difficulty, message }),
  });
  let body = {};
  try { body = await res.json(); } catch (e) { /* not JSON */ }
  if (!res.ok || !body || typeof body.id !== "string" || !/^[A-Za-z0-9]{10,40}$/.test(body.id)) {
    const err = new Error("create failed");
    err.status = res.status;
    if (body && typeof body.message === "string" && body.message.length <= 300) err.said = body.message;
    throw err;
  }
  return body.id;
}

function whyNot(e) {
  if (e && /RejectedByUser/.test(String(e.name))) {
    return "Posting needs you to sign in with Farcaster, so the puzzle carries your name. Tap Post it to try again.";
  }
  // The function words its refusals for people (the hours until the daily limit resets, say); use them.
  if (e && e.said) return e.said;
  switch (e && e.status) {
    case 401: case 403: return "Farcaster couldn’t confirm it’s you just now. Try again.";
    case 413: return "That photo is too large to send. Try another one.";
    case 400: case 415: return "That photo didn’t go through. Try another one.";
    case 429: return "That’s as many Phuzzles as one account can post today. You can post more tomorrow.";
    default: return "Phuzzles couldn’t save your puzzle just now. Try again in a minute.";
  }
}

function posting(on) {
  const b = $("post");
  b.disabled = on || !photo;
  b.setAttribute("aria-busy", on ? "true" : "false");
  b.innerHTML = on ? '<span class="spin" aria-hidden="true"></span>Posting' : "Post it";
}

$("post").addEventListener("click", async () => {
  if (!photo || !sdk) return;
  sendError(null);
  posting(true);
  const difficulty = levelNow();
  const note = $("note-in").value.trim().slice(0, NOTE_MAX);
  try {
    // The SDK hands back the token it already has for as long as that is current, so after a refusal it would
    // send the same one again; force asks Farcaster for a new sign-in.
    const { token } = await sdk.quickAuth.getToken({ force: staleToken });
    staleToken = false;
    const id = await createPuzzle(token, photo.blob, difficulty, note);
    made = { id, url: MINI + "?p=" + id, note: !!note, n: Solver.GRID[difficulty], img: photo.url, posted: false };
    ev("mini_puzzle_made", { pieces: made.n * made.n, note: made.note });
  } catch (e) {
    if (e && e.status === 401) staleToken = true;
    sendError(whyNot(e));
    ev("mini_post_failed", { status: (e && e.status) || 0 });
    posting(false);
    return;
  }
  // Busy until the composer is done with, so a second tap can't make a second puzzle.
  await castIt();
  posting(false);
});

// The puzzle exists now; the post is the user's to check and send in the host's composer.
async function castIt() {
  const text = made.note ? "I made you a Phuzzle. Solve it to see the photo and my note." : "I made you a Phuzzle. Solve it to see the photo.";
  let posted = false;
  try {
    const r = await sdk.actions.composeCast({ text, embeds: [made.url] });
    posted = !!(r && r.cast);
  } catch (e) { /* the composer was closed or is unavailable */ }
  ev("mini_cast", { posted });
  made.posted = posted;
  showSent(posted);
}

function showSent(posted) {
  $("sent-title").textContent = posted ? "Posted" : "Not posted yet";
  $("sent-text").textContent = posted
    ? `Whoever solves it gets to see your photo${made.note ? " and your note" : ""}. It stays up for 30 days.`
    : "Your Phuzzle is made. Post it now, or copy the link and share it anywhere. It stays up for 30 days.";
  $("sent-img").src = made.img;
  $("sent-cuts").style.setProperty("--n", made.n);
  $("sent-post").hidden = posted;
  // The main thing to do next goes first: post it, or once posted, send another.
  $("sent-again").className = posted ? "btn" : "btn ghost";
  $("sent-again").style.order = posted ? "-1" : "";
  $("sent-link").hidden = true;
  $("sent-copy").textContent = "Copy the link";
  sendStage = "sent";
  if (location.hash === "#send") show("sent");
}

$("sent-post").addEventListener("click", castIt);
$("sent-copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(made.url);
    $("sent-copy").textContent = "Link copied";
  } catch (e) {
    // Some hosts block the clipboard in a frame; the link is shown to copy by hand.
    $("sent-link").textContent = made.url;
    $("sent-link").hidden = false;
  }
  ev("mini_link_copy");
});
// An empty form for the next puzzle.
function resetSend() {
  if (photo) URL.revokeObjectURL(photo.url);
  photo = null;
  made = null;
  $("note-in").value = "";
  $("note-count").textContent = "0";
  ["pick-img", "cuts", "change"].forEach((x) => { $(x).hidden = true; });
  $("pick-empty").hidden = false;
  posting(false);
  sendError(null);
  sendStage = "send";
}
$("sent-again").addEventListener("click", (e) => {
  e.preventDefault();
  resetSend();
  if (location.hash === "#send") show("send"); else location.hash = "send";
});

// ── Go ──────────────────────────────────────────────────────────────────────────────────────────────────
route();
start();
