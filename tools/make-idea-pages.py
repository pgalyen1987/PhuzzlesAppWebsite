"""Build the 'idea' pages (one per occasion people search for) from index.html's own head, styles,
analytics and footer, so they look like the homepage and stay in step with it. Re-run after editing
index.html's head or footer:  python3 tools/make-idea-pages.py

HOW TO CHANGE THIS SAFELY (2026-11-17). index.html grew a home-page-only i18n layer and its own
hreflang cluster, and the idea pages grew per-page share cards, per-page alternates and the /make/
CTA. For a while this generator had drifted far enough that running it would have undone five
shipped things at once -- per-page og:image, per-page hreflang, the /make/ CTA, the seven-link
footer Ideas list (for non-English visitors), and the page's own title and <html lang> on a
non-English browser. It no longer does, but the only way to know that is to MEASURE it:

    rm -rf /tmp/ideagen && mkdir -p /tmp/ideagen/tools
    cp index.html /tmp/ideagen/ && cp tools/make-idea-pages.py /tmp/ideagen/tools/
    cd /tmp/ideagen && python3 tools/make-idea-pages.py
    for f in pregnancy-announcement-puzzle birthday-puzzle new-puppy-puzzle surprise-trip-puzzle; do
      diff ~/PhuzzlesAppWebsite/$f.html $f.html; done

Run it in that sandbox FIRST, every time, and read the diff before you let it near the site. As of
2026-11-17 the only expected diffs are two additions: the unused .make rule (the whole of
index.html's stylesheet is copied on purpose, so the pages stay in step visually) and a /daily/
footer link the live pages predate.

COVERAGE GAP: three of the seven live idea pages -- gender-reveal-puzzle, christmas-gift-reveal-puzzle
and engagement-announcement-puzzle -- are NOT built here. This generator will not touch them, but it
also will not carry an index.html head change into them. They drift on their own."""
import re, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "index.html").read_text()
head_end = src.index("</head>")
head = src[:head_end]

# index.html's <head> carries two things that belong to the HOME PAGE alone. Both have to come out
# before anything is spliced in, or this generator silently un-ships work that has already shipped.
#
# (a) The home page's hreflang cluster points at phuzzles.app/ and its /ja/ /fr/ /es/ /de/ /pt/
#     translations -- translations of the HOME PAGE. Copied onto an idea page it declares that idea
#     page an alternate of the home page, and it overwrites the page's own cluster. Each idea page
#     states its real alternates itself, via ALTS below.
head, n = re.subn(r'  <!-- lang-alternates:.*?  <!-- /lang-alternates -->\n', "{ALTS}", head, flags=re.S)
assert n == 1, "index.html's lang-alternates block moved or changed shape -- re-read it before running"

# (b) The home page's i18n layer. Its dictionaries are keyed to the home page's element ids, and it
#     ends with `document.documentElement.lang = lang; document.title = d.title`. On an idea page it
#     would retitle the page with the HOME PAGE's localised title and rewrite <html lang> for any
#     visitor whose browser is not English, while canonical and og:url still name this page's
#     English URL -- content in one language under another language's address. That is exactly the
#     bug found live on /make/ and fixed on 2026-11-17. Do not re-import it.
head, n = re.subn(r"<script>\n// i18n\..*?\n</script>\n", "", head, flags=re.S)
assert n == 1, "index.html's i18n <script> moved or changed shape -- re-read it before running"

style_end = head.index("  </style>")
header = re.search(r'    <header class="bar">.*?</header>\n', src, re.S).group(0)
footer = re.search(r'    <footer>.*?</footer>\n', src, re.S).group(0)

# With the i18n script gone the data-i18n* hooks are dead attributes; strip them so the markup says
# what it does. The footer's "Ideas:" list is the one that matters: as data-i18n="footIdeasList" the
# script replaces all seven idea links with the home page's two-link localised list, so every
# non-English visitor loses five of the internal links these pages exist to carry.
header = re.sub(r' data-i18n(?:-label|-alt|-html)?="[^"]*"', "", header)
footer = re.sub(r' data-i18n(?:-label|-alt|-html)?="[^"]*"', "", footer)
footer = footer.replace('<p class="ideas"><span>Ideas:</span> <span>', '<p class="ideas">Ideas: ')
footer = footer.replace("</span></p>", "</p>")
# No puffin on an idea page, so no puffin credit. A regex, and a loud assert: as a literal string
# match this silently stopped working the day index.html added data-i18n="credit" to the line.
footer, n = re.subn(r"^ *<p>Puffin photo by Fred Yost[^\n]*</p>\n", "", footer, flags=re.M)
assert n == 1, "the puffin credit line moved or changed wording -- check the footer before running"

EXTRA_CSS = """
    /* idea pages */
    .idea { max-width: 720px; margin-inline: auto; padding-block: 48px 72px; }
    .idea h1 { font: 700 var(--t-h1)/1.08 'Archivo', system-ui, sans-serif; letter-spacing: -0.02em; margin: 0 0 18px; }
    .idea .lede { font-size: var(--t-lg); color: var(--muted); margin: 0 0 32px; }
    .idea h2 { font: 700 1.6rem/1.2 'Archivo', system-ui, sans-serif; margin: 44px 0 14px; }
    .idea ol { padding-left: 1.2em; }
    .idea li { margin: 0 0 14px; }
    .idea li b { color: var(--paper); }
    .idea .tip { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--coral); border-radius: 14px; padding: 16px 18px; margin: 28px 0; }
    .idea .stores { margin-top: 28px; }
    .idea a { color: var(--teal); }
    /* The one thing to do on the page, and it sits in the first screen: measured 2026-11-11, the
       first tappable element used to be 1,671px down a 2,212px page, so a visitor from a pin saw
       a headline and a paragraph and nothing to do. Action first, explanation under it. */
    .try { margin: 0 0 10px; }
    .try p { font-size: var(--t-sm); color: var(--muted); margin: 12px 0 0; }
    .try a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 20px;
      border: 1px solid var(--line); border-radius: 12px; color: var(--teal); font-size: var(--t-body);
      text-decoration: none; }
    .try a:hover { border-color: var(--teal); }
    .try a:focus-visible { outline: 2px solid var(--teal); outline-offset: 3px; }
"""

FROM = {"pregnancy-announcement-puzzle": "pregnancy", "birthday-puzzle": "birthday",
        "new-puppy-puzzle": "puppy", "surprise-trip-puzzle": "trip"}

def page(slug, title, desc, h1, lede, body, og_image, alts=()):
    h = head[:style_end] + EXTRA_CSS + head[style_end:]
    h = re.sub(r"<title>.*?</title>", f"<title>{html.escape(title)}</title>", h)
    h = re.sub(r'<meta name="description" content="[^"]*" />', f'<meta name="description" content="{html.escape(desc)}" />', h)
    h = re.sub(r'<link rel="canonical" href="[^"]*" />', f'<link rel="canonical" href="https://phuzzles.app/{slug}" />', h)
    h = re.sub(r'<meta property="og:url" content="[^"]*" />', f'<meta property="og:url" content="https://phuzzles.app/{slug}" />', h)
    h = re.sub(r'<meta property="og:title" content="[^"]*" />', f'<meta property="og:title" content="{html.escape(h1)}" />', h)
    h = re.sub(r'<meta property="og:description" content="[^"]*" />', f'<meta property="og:description" content="{html.escape(desc)}" />', h)
    # Each idea page has its own share card, drawn for its own occasion. The home page's og-card.jpg
    # is not a stand-in for it: a pregnancy announcement shared to a group chat has to preview as one.
    h = re.sub(r'<meta property="og:image" content="[^"]*" />',
               f'<meta property="og:image" content="https://phuzzles.app/img/{og_image}" />', h)
    # This page's own alternates, in the slot the home page's cluster was removed from. A page with
    # no translation yet declares none -- an hreflang pointing nowhere is worse than its absence.
    if alts:
        rows = [f'  <link rel="alternate" hreflang="en" href="https://phuzzles.app/{slug}" />']
        rows += [f'  <link rel="alternate" hreflang="{lg}" href="https://phuzzles.app/{path}" />'
                 for lg, path in alts]
        rows.append(f'  <link rel="alternate" hreflang="x-default" href="https://phuzzles.app/{slug}" />')
        h = h.replace("{ALTS}", "\n".join(rows) + "\n")
    else:
        h = h.replace("{ALTS}", "")
    h = h.replace('  <link rel="preload" as="image" href="/img/puffin-960.jpg" />\n', "")
    # A per-page breadcrumb so the intent pages show "Phuzzles › <page>" in search,
    # not a bare URL. The crumb is the slug read as words; nothing invented.
    crumb = slug.replace("-", " ")
    crumb = crumb[0].upper() + crumb[1:]
    breadcrumb = ('  <script type="application/ld+json">{"@context":"https://schema.org",'
        '"@type":"BreadcrumbList","itemListElement":['
        '{"@type":"ListItem","position":1,"name":"Phuzzles","item":"https://phuzzles.app/"},'
        '{"@type":"ListItem","position":2,"name":"' + html.escape(crumb) + '",'
        '"item":"https://phuzzles.app/' + slug + '"}]}</script>\n')
    h = h.replace('id=rebelstudios.phuzzles.app"]}</script>\n',
                  'id=rebelstudios.phuzzles.app"]}</script>\n' + breadcrumb, 1)
    stores = """        <div class="stores">
          <a href="https://apps.apple.com/app/id6766833614" target="_blank" rel="noopener"><img src="/app-store-badge.svg" alt="Download on the App Store" /></a>
          <a href="https://play.google.com/store/apps/details?id=rebelstudios.phuzzles.app&amp;referrer=utm_source%3Dphuzzles.app%26utm_medium%3Didea_page%26utm_campaign%3D{slug}" target="_blank" rel="noopener"><img class="gp" src="/google-play-badge.png" alt="Get it on Google Play" /></a>
        </div>
        <p class="price">Free, with ads. <a href="/">How Phuzzles works</a></p>
""".replace("{slug}", slug)
    try_block = """      <div class="try">
        <a href="/today/?from={from}">Solve today's puzzle</a>
        <a href="/make/?from={from}">Make one now</a>
        <p>Try one before you send one. It works like the one you would send, and there is nothing
          to install.</p>
      </div>
""".replace("{from}", FROM[slug])
    doc = (h + "</head>\n<body>\n  <div class=\"wrap\">\n" + header + "\n    <main class=\"idea\">\n"
           f"      <h1>{h1}</h1>\n      <p class=\"lede\">{lede}</p>\n{try_block}{body}{stores}    </main>\n\n" + footer + "  </div>\n" + FORWARD.replace("{slug}", slug) + "</body>\n</html>\n")
    # Name the floor: these four are what going wrong looks like, so check them rather than trust the
    # strips above. Cheaper to fail here than to find it live.
    for bad, why in (("window.PHZ", "home page i18n layer leaked in"),
                     ("data-i18n", "dead i18n hook leaked in"),
                     ("{ALTS}", "hreflang placeholder was never filled"),
                     ):
        assert bad not in doc, f"{slug}: {why}"
    # og:image only. The JSON-LD below it keeps og-card.jpg on purpose: that block describes the
    # APP, at phuzzles.app/, not this page, so the app's own card is the right image there.
    # Caught by mutation-testing this check: asserting only that og_image was applied still passes
    # if og_image IS the home page's generic card, which is the failure being guarded against.
    assert og_image != "og-card.jpg", f"{slug}: needs its own share card, not the home page's"
    assert f'<meta property="og:image" content="https://phuzzles.app/img/{og_image}" />' in doc, slug
    assert doc.count('rel="canonical"') == 1 and f'rel="canonical" href="https://phuzzles.app/{slug}"' in doc
    (ROOT / f"{slug}.html").write_text(doc)
    print("wrote", slug + ".html", len(doc), "bytes")

FORWARD = """  <script>
    // Arrived from a tagged link (a pin, a post)? Pass its tags to Play so the install is credited to it.
    (function () {
      try {
        var q = new URLSearchParams(location.search), parts = [];
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) { var v = q.get(k); if (v) parts.push(k + '=' + v); });
        if (!q.get('utm_source')) return;
        if (!q.get('utm_campaign')) parts.push('utm_campaign={slug}');
        document.querySelectorAll('a[href*="play.google.com"]').forEach(function (a) {
          a.href = a.href.split('&referrer=')[0] + '&referrer=' + encodeURIComponent(parts.join('&'));
        });
      } catch (e) {}
    })();
  </script>
"""

SEND = """        <li><b>Send it.</b> Pick someone who has Phuzzles by their username, or start a group and send one puzzle to the whole family; everyone gets the same puzzle. Or send it as a link, from an iPhone or from Android, that opens in any phone's browser, so the person you send it to doesn't need the app.</li>
        <li><b>Wait.</b> You get a notification when it's solved.</li>
"""
KEPT = """      <h2>Worth knowing</h2>
      <p>Only the people you send it to can open it, or anyone you give its link to. Nothing goes on the public Feed unless you post it there yourself. Puzzles and their photos are kept while your account exists and are deleted with it. Delete a puzzle in the app and its photo goes too.</p>
"""

page("pregnancy-announcement-puzzle",
     "A pregnancy announcement they have to solve | Phuzzles",
     "Send your pregnancy news as a photo puzzle. They see the picture, and the message hidden under it, only when the last piece lands. Free on iPhone and Android.",
     "A pregnancy announcement they have to solve",
     "Phuzzles scrambles the photo that carries your news. The people you send it to put it back together, and the message you folded underneath shows up only when the last piece lands. You send it as a link, so the people you send it to solve it in their browser, with nothing to install.",
     """      <h2>How to do it</h2>
      <ol>
        <li><b>Pick the photo.</b> The news should be in the picture: the scan, the test, tiny shoes, a shirt that says big sister. If one piece would give it away at a glance, choose a bigger puzzle.</li>
        <li><b>Pick the size.</b> 3&times;3 is quick. 6&times;6 takes a while, which is the point if you want to watch them work for it.</li>
        <li><b>Write the message.</b> Up to 200 characters, hidden until the puzzle is solved. &ldquo;Due in May&rdquo; is enough.</li>
""" + SEND + """      </ol>
      <p class="tip">Sending it to grandparents who won't install anything? Send it as a link. It opens in their browser and they solve it there, with nothing to install.</p>
""" + KEPT,
     og_image="og-pregnancy.jpg",
     alts=(("fr", "fr/annonce-de-grossesse-puzzle"), ("ja", "ja/ninshin-houkoku-puzzle")))

page("birthday-puzzle",
     "A birthday message they have to solve | Phuzzles",
     "Send a birthday photo as a puzzle with your message hidden underneath. They read it when the last piece lands. Free on iPhone and Android.",
     "A birthday message they have to solve",
     "A card gets opened, read and put down. A puzzle gets a few minutes of their attention first, and your message shows up only when they finish it. It goes as a link they open in any browser, so there is nothing for them to install.",
     """      <h2>How to do it</h2>
      <ol>
        <li><b>Pick the photo.</b> One they haven't seen, or one they've forgotten: the two of you ten years ago, their dog, the place you're taking them.</li>
        <li><b>Write the message.</b> Up to 200 characters, hidden until the puzzle is solved. Say the thing you'd skip in a text.</li>
        <li><b>Pick the size.</b> 3&times;3 for a quick smile; 6&times;6 if you want them busy for a while.</li>
""" + SEND + """      </ol>
      <p class="tip">Giving something you can't wrap, like tickets or a trip? Put a picture of it in the puzzle and the details in the message &mdash; there's <a href="/surprise-trip-puzzle">a whole page on doing that</a>.</p>
""" + KEPT, og_image="og-birthday.jpg")
page("new-puppy-puzzle",
     "A new puppy they have to solve | Phuzzles",
     "Send a photo of your new puppy as a puzzle. The people you send it to put it back together and meet the newest member of the family only when the last piece lands. Free on iPhone and Android.",
     "A new puppy they have to solve",
     "Phuzzles scrambles the photo of your new best friend. The people you send it to put it back together, and meet the puppy only when the last piece lands. Send it as a link and they meet the puppy in their browser, with nothing for them to install.",
     """      <h2>How to do it</h2>
      <ol>
        <li><b>Pick the photo.</b> The puppy, obviously &mdash; asleep in someone's arms, the first car ride, the whole litter if you're still choosing. If one piece gives the face away at a glance, choose a bigger puzzle.</li>
        <li><b>Pick the size.</b> 3&times;3 is quick. 6&times;6 takes a while, which is the point if you want to watch them work for it.</li>
        <li><b>Write the message.</b> Up to 200 characters, hidden until the puzzle is solved. &ldquo;Meet Biscuit&rdquo; is enough.</li>
""" + SEND + """      </ol>
      <p class="tip">Sending it to grandparents who won't install anything? Send it as a link. It opens in their browser and they solve it there, with nothing to install.</p>
""" + KEPT, og_image="og-puppy.jpg")

page("surprise-trip-puzzle",
     "A surprise trip they have to solve | Phuzzles",
     "Reveal a surprise trip as a photo puzzle. They put the picture back together to find out where they are going, and the dates are hidden underneath until the last piece lands.",
     "A surprise trip they have to solve",
     "The photo is the answer to &ldquo;where are we going?&rdquo; Phuzzles scrambles it, so they work the answer out a piece at a time, and the dates you folded underneath appear when the last piece lands. You send it as a link that opens in any browser, so the people you send it to do not need the app.",
     """      <h2>How to do it</h2>
      <ol>
        <li><b>Pick the photo that names the place.</b> Not a beach: the beach. The castle, the stadium, the cabin you booked, the sign at the trailhead, the boarding pass with the airport code still on it. If a stranger couldn't tell where it is, neither can they.</li>
        <li><b>Then make it harder, not easier.</b> A landmark gives itself away from one corner piece, so go 6&times;6 and let them sit with it. Keep 3&times;3 for a photo that only means anything once it's whole.</li>
        <li><b>Put the details in the message.</b> Up to 200 characters, hidden until the puzzle is solved: the dates, who else is coming, what to pack, whether they need to ask for the week off.</li>
""" + SEND + """      </ol>
      <p class="tip">Telling a whole family at once? Send it to a group. Everyone gets the same puzzle at the same time, so nobody hears it secondhand.</p>
      <h2>What it won't do</h2>
      <p>There is no scheduled send and no timer: a puzzle goes the moment you send it. If it has to land on a particular morning, send it that morning.</p>
""" + KEPT, og_image="og-trip.jpg")
