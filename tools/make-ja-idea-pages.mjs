// Build the Japanese "idea" pages (one per occasion) from a Japanese page that already shipped,
// so the chrome -- styles, self-hosted fonts, header, footer, store badges, the Play-referrer
// script -- cannot drift away from the rest of /ja/. Only the copy below is per theme.
//
//   node tools/make-ja-idea-pages.mjs
//
// WHY THIS EXISTS SEPARATELY. tools/make-idea-pages.py builds the ENGLISH idea pages out of
// index.html and does not know about /ja/ at all (it also documents its own coverage gap: three of
// the seven English pages are not built there either). The Japanese pages were hand-made before
// this. Writing them by hand again is how the chrome drifts, so they are generated here instead.
//
// WHAT IS NOT GENERATED, and must be kept in step by hand when a theme is added:
//   1. sitemap.xml  -- only <lastmod> is generated (tools/sitemap-lastmod.py); <loc> is by hand.
//   2. The reciprocal hreflang on the ENGLISH counterpart page. Google ignores a one-way
//      hreflang, so an entry here is worthless until the English page points back.
//   3. index.html's `STR.ja.footIdeasList` -- the footer Ideas list, which is the only internal
//      link into these pages. Edit it there, then re-run tools/make-lang-pages.mjs; editing
//      /ja/index.html directly is overwritten on the next run.
//
// The source page is the pregnancy one because it is the oldest and most-edited Japanese page, so
// it carries the current chrome. The writer guards below refuse to emit a page that still carries
// that theme's slug, og:image or wording.

import fs from 'fs';
import path from 'path';

const SITE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(SITE, 'ja/ninshin-houkoku-puzzle.html');
const shell = fs.readFileSync(SRC, 'utf8');

const KNOWN = {
  // enSlug -> other existing translations, used to emit reciprocal hreflang
  'gender-reveal-puzzle': { es: 'es/revelacion-de-genero-rompecabezas', pt: 'pt/cha-revelacao-quebra-cabeca' },
};

const THEMES = [
  {
    slug: 'tanjoubi-puzzle',
    en: 'birthday-puzzle',
    og: 'og-birthday.jpg',
    crumb: '誕生日の写真パズル',
    title: '誕生日に送る写真パズル | Phuzzles',
    desc: '誕生日の写真を、解かないと見られないパズルにして送ります。最後のピースで、下に隠したメッセージが出てきます。リンクを送るだけ、相手にアプリは要りません。',
    h1: 'おめでとうを、すぐには読ませない',
    lede: '誕生日の写真を、相手が組み立てないと見られない形にして送ります。最後のピースがはまったときに、下に折り込んでおいたメッセージが初めて出てきます。リンクで送るので、相手はブラウザで解くだけです。',
    steps: [
      ['写真を選ぶ', '去年の同じ日の写真、ケーキ、二人で写っているもの。顔が画面いっぱいに写っていると1ピース目で気づかれるので、少し引いた写真の方が長く持ちます。'],
      ['大きさを選ぶ', '3×3は乾杯の前に解き終わります。5×5にすると、席に座って黙って解き始めます。'],
      ['メッセージを書く', '200文字まで。解けるまで見えません。長い手紙より「10年前の今日、同じ店にいた」の方が効きます。'],
      ['送る', '日付が変わった瞬間に送れます。リンクなので、iPhoneでもAndroidでも相手のブラウザで開きます。'],
      ['待つ', '解かれると通知が届きます。何分かかったかも分かります。'],
    ],
    tip: '家族のグループに同じパズルを送ると、誰が先に解いたかでひとしきり盛り上がります。',
  },
  {
    slug: 'konyaku-houkoku-puzzle',
    en: 'engagement-announcement-puzzle',
    og: 'og-engagement.jpg',
    crumb: '婚約報告の写真パズル',
    title: '婚約報告を写真パズルで送る | Phuzzles',
    desc: '婚約の報告を写真パズルにして送ります。相手が組み立て終わるまで、指輪も日付も出てきません。リンクを送るだけ、相手にアプリは要りません。',
    h1: '指輪は、解いた人にだけ見せる',
    lede: '婚約の報告を、写真パズルにして送ります。相手が組み立て終わるまで、指輪も日付も出てきません。リンクで送るので、相手はブラウザで解くだけです。',
    steps: [
      ['写真を選ぶ', '手元の指輪、二人の影、プロポーズした場所。指輪が画面いっぱいだと最初の数ピースで分かってしまうので、引いて撮ったものの方が長く持ちます。'],
      ['大きさを選ぶ', '親に送るなら4×4。友だちに送るなら6×6でじらせます。'],
      ['メッセージを書く', '200文字まで。「式は来年の秋、場所はまだ決めていない」くらいが、ちょうど次の質問を呼びます。'],
      ['送る', '報告する順番がある家なら、リンクを送る順番がそのまま順番になります。送っていない人のところには何も届きません。'],
      ['待つ', '誰が解いたかは通知で分かります。'],
    ],
    tip: '先に伝えたい人には先にリンクを渡せます。パズルは公開されないので、順番が崩れません。',
  },
  {
    slug: 'seibetsu-happyou-puzzle',
    en: 'gender-reveal-puzzle',
    og: 'og-gender.jpg',
    crumb: '性別発表の写真パズル',
    title: '性別発表を写真パズルで送る | Phuzzles',
    desc: '性別の報告を写真パズルにして送ります。色が決め手になる写真ほど、ピースを細かくする意味があります。リンクを送るだけ、相手にアプリは要りません。',
    h1: '青かピンクか、最後の1ピースまで分からない',
    lede: '性別の報告を写真パズルにして送ります。色が出てしまう写真ほど、ピースを細かくする意味があります。リンクで送るので、相手はブラウザで解くだけです。',
    steps: [
      ['写真を選ぶ', '風船、小さな靴、エコー写真。色が決め手になるので、画面の端に色が寄っているとそこから先に埋まってばれます。中央に小さく置いた写真が一番長く持ちます。'],
      ['大きさを選ぶ', '色の写真は3×3だと一瞬で終わります。6×6にしてください。'],
      ['メッセージを書く', '200文字まで。名前をもう決めているなら、ここで初めて出すと効きます。'],
      ['送る', 'リンクで送れば、祖父母のブラウザでもそのまま開きます。インストールは要りません。'],
      ['待つ', '解かれると通知が届きます。'],
    ],
    tip: '家族のグループに同じパズルを送れば、全員が同時に解き始めます。',
  },
  {
    slug: 'koinu-okaeri-puzzle',
    en: 'new-puppy-puzzle',
    og: 'og-puppy.jpg',
    crumb: '子犬お迎えの写真パズル',
    title: '子犬のお迎えを写真パズルで知らせる | Phuzzles',
    desc: '迎えたばかりの犬の写真をパズルにして送ります。顔が出そろうまで、名前も体重も隠れたままです。リンクを送るだけ、相手にアプリは要りません。',
    h1: '新しい家族を、名前より先に見せない',
    lede: '迎えたばかりの犬の写真をパズルにして送ります。顔が出そろうまで、名前も体重も隠れたままです。リンクで送るので、相手はブラウザで解くだけです。',
    steps: [
      ['写真を選ぶ', '寝顔、かごの中、足だけ。全身が真ん中に大きく写っていると数ピースで分かるので、少し引いて撮ったものを選んでください。'],
      ['大きさを選ぶ', '4×4で十分じらせます。寝顔のように輪郭がはっきりしない写真なら3×3でも解くのに手間取ります。'],
      ['メッセージを書く', '200文字まで。「名前はモカ、2.1キロ」のような具体が一番喜ばれます。'],
      ['送る', 'リンクで送れます。相手にアプリは要りません。'],
      ['待つ', '解かれると通知が来ます。'],
    ],
    tip: '譲ってくれたブリーダーさんや里親さんにも、同じリンクをそのまま送れます。',
  },
  {
    slug: 'surprise-ryokou-puzzle',
    en: 'surprise-trip-puzzle',
    og: 'og-trip.jpg',
    crumb: 'サプライズ旅行の写真パズル',
    title: 'サプライズ旅行の行き先を写真パズルで渡す | Phuzzles',
    desc: '旅行の行き先を写真パズルにして渡します。組み立て終わるまで、地名も日付も出てきません。リンクを送るだけ、相手にアプリは要りません。',
    h1: '行き先は、解けるまで言わない',
    lede: '旅行の行き先を写真パズルにして渡します。組み立て終わるまで、地名も日付も出てきません。リンクで送るので、相手はブラウザで解くだけです。',
    steps: [
      ['写真を選ぶ', '行き先の景色、チケット、ホテルの外観。地名の文字が大きく写っていると1ピースで終わるので、文字の入っていない写真の方が長く持ちます。'],
      ['大きさを選ぶ', '5×5か6×6。すぐ分かってしまうと、驚く時間がなくなります。'],
      ['メッセージを書く', '200文字まで。「金曜の朝に出る。休みは取ってある」まで書くと、その場で予定を確かめ始めます。'],
      ['送る', '朝の食卓で渡したいなら、その場でリンクを送ってください。相手の端末のブラウザで開きます。'],
      ['待つ', '解かれると通知が届きます。'],
    ],
    tip: '一緒に行く人が何人かいるなら、同じパズルを全員に送れます。',
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function hreflangBlock(t) {
  const others = KNOWN[t.en] || {};
  const lines = [`  <link rel="alternate" hreflang="en" href="https://phuzzles.app/${t.en}" />`];
  for (const [lang, p] of Object.entries(others)) {
    lines.push(`  <link rel="alternate" hreflang="${lang}" href="https://phuzzles.app/${p}" />`);
  }
  lines.push(`  <link rel="alternate" hreflang="ja" href="https://phuzzles.app/ja/${t.slug}" />`);
  lines.push(`  <link rel="alternate" hreflang="x-default" href="https://phuzzles.app/${t.en}" />`);
  return lines.join('\n');
}

function build(t) {
  let h = shell;

  // --- head ---
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(t.title)}</title>`);
  h = h.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(t.desc)}" />`);
  h = h.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="https://phuzzles.app/ja/${t.slug}" />`);
  // replace the whole run of alternate links in one go
  h = h.replace(/(?:[ \t]*<link rel="alternate" hreflang="[^"]*" href="[^"]*" \/>\n)+/, hreflangBlock(t) + '\n');
  h = h.replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="https://phuzzles.app/ja/${t.slug}" />`);
  h = h.replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(t.h1)}" />`);
  h = h.replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${esc(t.desc)}" />`);
  h = h.replace(/<meta property="og:image" content="[^"]*" \/>/, `<meta property="og:image" content="https://phuzzles.app/img/${t.og}" />`);

  // --- breadcrumb JSON-LD: the source page points at the ENGLISH name and URL. Fix to ja. ---
  const crumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Phuzzles', item: 'https://phuzzles.app/ja/' },
      { '@type': 'ListItem', position: 2, name: t.crumb, item: `https://phuzzles.app/ja/${t.slug}` },
    ],
  };
  h = h.replace(/<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"BreadcrumbList"[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(crumb)}</script>`);

  // --- main content ---
  const steps = t.steps.map(([label, text]) => `        <li><b>${label}</b> ${text}</li>`).join('\n');
  const main = `    <main class="idea">
      <h1>${t.h1}</h1>
      <p class="lede">${t.lede}</p>
      <div class="try">
        <a href="/today/?from=${t.slug}">今日のパズルを解く</a>
        <a href="/make/?from=${t.slug}">いま作ってみる</a>
        <p>送る前に一度試してみてください。送るものと同じ仕組みで、インストールは要りません。</p>
      </div>
      <h2>やり方</h2>
      <ol>
${steps}
      </ol>
      <p class="tip">${t.tip}</p>
      <h2>知っておくこと</h2>
      <p>開けるのは、あなたが送った相手と、リンクを渡した人だけです。自分で投稿しない限り、公開フィードには何も載りません。パズルと写真はアカウントがある間保存され、アカウントと一緒に削除されます。アプリでパズルを削除すれば写真も消えます。</p>
        <div class="stores">
          <a href="https://apps.apple.com/app/id6766833614" target="_blank" rel="noopener"><img src="/app-store-badge.svg" alt="App Store" /></a>
          <a href="https://play.google.com/store/apps/details?id=rebelstudios.phuzzles.app&amp;referrer=utm_source%3Dphuzzles.app%26utm_medium%3Didea_page%26utm_campaign%3D${t.slug}" target="_blank" rel="noopener"><img class="gp" src="/google-play-badge.png" alt="Google Play" /></a>
        </div>
        <p class="price">無料、広告つき。 <a href="/ja/">Phuzzlesの仕組み</a></p>
    </main>`;
  h = h.replace(/[ \t]*<main class="idea">[\s\S]*?<\/main>/, main);

  return h;
}

let wrote = 0;
for (const t of THEMES) {
  const out = path.join(SITE, 'ja', t.slug + '.html');
  const html = build(t);
  // guards: refuse to write a page that still carries the source theme's fingerprints
  const bad = [];
  if (html.includes('ninshin-houkoku')) bad.push('still references the source slug');
  if (html.includes('og-pregnancy.jpg')) bad.push('still uses the source og:image');
  if (!html.includes(`/ja/${t.slug}`)) bad.push('canonical not rewritten');
  if (!html.includes(t.h1)) bad.push('h1 not written');
  if (bad.length) { console.log(`SKIP ${t.slug}: ${bad.join('; ')}`); continue; }
  fs.writeFileSync(out, html);
  wrote++;
  console.log(`wrote ja/${t.slug}.html  ${Buffer.byteLength(html)} bytes`);
}
console.log(`\n${wrote}/${THEMES.length} pages written`);
