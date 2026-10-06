// The photo check both browser solvers run before they load a puzzle's picture (OUR_PHOTOS in 404.html and
// mini/mini.js), tested on the addresses that matter. It has been wrong twice: first it took any host, then it
// refused the iPhone app's ":443" form. Run from anywhere: node tools/check-photo-urls.mjs (or npm test in tools/).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["404.html", "mini/mini.js"];
const sources = FILES.map((f) => {
  const m = readFileSync(join(site, f), "utf8").match(/OUR_PHOTOS = (\/\^https:.*\/);/);
  return { file: f, src: m && m[1] };
});

const B = "https://firebasestorage.googleapis.com/v0/b/phuzzles.firebasestorage.app/o/";
const CASES = [
  // accepted: every form our writers produce
  ["Android app's download URL", B + "puzzles%2FAbC123%2F1696500000000.jpg?alt=media&token=not-a-real-token", true],
  ["iPhone app's download URL (names port 443)", B.replace(".com/", ".com:443/") + "puzzles%2FAbC123%2Fx.jpg?alt=media&token=not-a-real-token", true],
  ["built by a function (the daily, the mini app)", B + "potd%2Fcorgi.jpg?alt=media&token=t", true],
  ["no query", B + "puzzles%2Fu%2Fx.jpg", true],
  // refused: anything that is not a file in our own bucket, or that would break out of CSS url('...')
  ["another port", B.replace(".com/", ".com:8443/") + "x.jpg?alt=media", false],
  ["userinfo before another host", "https://firebasestorage.googleapis.com:443@evil.example/v0/b/phuzzles.firebasestorage.app/o/x.jpg", false],
  ["another bucket", "https://firebasestorage.googleapis.com/v0/b/someone-elses.appspot.com/o/x.jpg?alt=media", false],
  ["../ climbing out to another bucket", B + "a/../../../someone-elses.appspot.com/o/x.jpg?alt=media", false],
  ["another host", "https://evil.example/track.png", false],
  ["plain http", B.replace("https:", "http:") + "x.jpg?alt=media", false],
  ["a quote", B + "x.jpg')?alt=media", false],
  ["a bracket in the query", B + "x.jpg?alt=media&t=)", false],
  ["a space", B + "x .jpg?alt=media", false],
  ["a #fragment", B + "x.jpg?alt=media#y", false],
  ["backslashes", B + "x\\..\\y.jpg", false],
];

let failed = 0;
const fail = (msg) => { failed++; console.log("FAIL " + msg); };
for (const { file, src } of sources) {
  if (!src) { fail(`${file}: no OUR_PHOTOS found`); continue; }
  const re = new Function("return " + src)();
  for (const [name, url, want] of CASES) {
    if (re.test(url) !== want) fail(`${file}: ${name} should be ${want ? "accepted" : "refused"}`);
  }
}
if (sources.every((s) => s.src) && new Set(sources.map((s) => s.src)).size !== 1) fail("the two copies of OUR_PHOTOS differ");
console.log(failed ? `${failed} failed` : `OUR_PHOTOS: ${CASES.length} addresses right in ${FILES.join(" and ")}, both copies identical`);
process.exit(failed ? 1 : 0);
