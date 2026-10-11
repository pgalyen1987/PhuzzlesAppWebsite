"""Build the 'idea' pages (one per occasion people search for) from index.html's own head, styles,
analytics and footer, so they look like the homepage and stay in step with it. Re-run after editing
index.html's head or footer:  python3 tools/make-idea-pages.py"""
import re, html, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / "index.html").read_text()
head_end = src.index("</head>")
head = src[:head_end]
style_end = head.index("  </style>")
header = re.search(r'    <header class="bar">.*?</header>\n', src, re.S).group(0)
footer = re.search(r'    <footer>.*?</footer>\n', src, re.S).group(0)
footer = footer.replace("      <p>Puffin photo by Fred Yost, U.S. Fish and Wildlife Service (public domain).</p>\n", "")

EXTRA_CSS = """
    /* idea pages */
    .idea { max-width: 720px; padding-block: 48px 72px; }
    .idea h1 { font: 700 var(--t-h1)/1.08 'Archivo', system-ui, sans-serif; letter-spacing: -0.02em; margin: 0 0 18px; }
    .idea .lede { font-size: var(--t-lg); color: var(--muted); margin: 0 0 32px; }
    .idea h2 { font: 700 1.6rem/1.2 'Archivo', system-ui, sans-serif; margin: 44px 0 14px; }
    .idea ol { padding-left: 1.2em; }
    .idea li { margin: 0 0 14px; }
    .idea li b { color: var(--paper); }
    .idea .tip { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--coral); border-radius: 14px; padding: 16px 18px; margin: 28px 0; }
    .idea .stores { margin-top: 28px; }
    .idea a { color: var(--teal); }
"""

def page(slug, title, desc, h1, lede, body):
    h = head[:style_end] + EXTRA_CSS + head[style_end:]
    h = re.sub(r"<title>.*?</title>", f"<title>{html.escape(title)}</title>", h)
    h = re.sub(r'<meta name="description" content="[^"]*" />', f'<meta name="description" content="{html.escape(desc)}" />', h)
    h = re.sub(r'<link rel="canonical" href="[^"]*" />', f'<link rel="canonical" href="https://phuzzles.app/{slug}" />', h)
    h = re.sub(r'<meta property="og:url" content="[^"]*" />', f'<meta property="og:url" content="https://phuzzles.app/{slug}" />', h)
    h = re.sub(r'<meta property="og:title" content="[^"]*" />', f'<meta property="og:title" content="{html.escape(h1)}" />', h)
    h = re.sub(r'<meta property="og:description" content="[^"]*" />', f'<meta property="og:description" content="{html.escape(desc)}" />', h)
    h = h.replace('  <link rel="preload" as="image" href="/img/puffin-960.jpg" />\n', "")
    stores = """        <div class="stores">
          <a href="https://apps.apple.com/app/id6766833614" target="_blank" rel="noopener"><img src="/app-store-badge.svg" alt="Download on the App Store" /></a>
          <a href="https://play.google.com/store/apps/details?id=rebelstudios.phuzzles.app" target="_blank" rel="noopener"><img class="gp" src="/google-play-badge.png" alt="Get it on Google Play" /></a>
        </div>
        <p class="price">Free, with ads. <a href="/">How Phuzzles works</a></p>
"""
    doc = (h + "</head>\n<body>\n  <div class=\"wrap\">\n" + header + "\n    <main class=\"idea\">\n"
           f"      <h1>{h1}</h1>\n      <p class=\"lede\">{lede}</p>\n{body}{stores}    </main>\n\n" + footer + "  </div>\n</body>\n</html>\n")
    (ROOT / f"{slug}.html").write_text(doc)
    print("wrote", slug + ".html", len(doc), "bytes")

SEND = """        <li><b>Send it.</b> Pick someone who has Phuzzles by their username, or start a group and send one puzzle to the whole family; everyone gets the same puzzle. On Android you can also send it as a link that opens in any phone's browser, so nobody needs the app.</li>
        <li><b>Wait.</b> You get a notification when it's solved.</li>
"""
KEPT = """      <h2>Worth knowing</h2>
      <p>Only the people you send it to can open it, or anyone you give its link to. Nothing goes on the public Feed unless you post it there yourself. Puzzles and their photos are deleted from our servers after 30 days, so keep your own copy of the picture.</p>
"""

page("pregnancy-announcement-puzzle",
     "A pregnancy announcement they have to solve | Phuzzles",
     "Send your pregnancy news as a photo puzzle. They see the picture, and the message hidden under it, only when the last piece lands. Free on iPhone and Android.",
     "A pregnancy announcement they have to solve",
     "Phuzzles scrambles the photo that carries your news. The people you send it to put it back together, and the message you folded underneath shows up only when the last piece lands.",
     """      <h2>How to do it</h2>
      <ol>
        <li><b>Pick the photo.</b> The news should be in the picture: the scan, the test, tiny shoes, a shirt that says big sister. If one piece would give it away at a glance, choose a bigger puzzle.</li>
        <li><b>Pick the size.</b> 3&times;3 is quick. 6&times;6 takes a while, which is the point if you want to watch them work for it.</li>
        <li><b>Write the message.</b> Up to 200 characters, hidden until the puzzle is solved. &ldquo;Due in May&rdquo; is enough.</li>
""" + SEND + """      </ol>
      <p class="tip">Sending it to grandparents who won't install anything? Send it from an Android phone as a link. It opens in their browser, and they solve it there.</p>
""" + KEPT)

page("gender-reveal-puzzle",
     "A gender reveal they have to solve | Phuzzles",
     "Hide the answer in a photo puzzle: they find out boy or girl only when the last piece lands. Free on iPhone and Android.",
     "A gender reveal they have to solve",
     "Turn the reveal into a puzzle. They piece the photo back together, and the answer appears only when they finish.",
     """      <h2>How to do it</h2>
      <ol>
        <li><b>Pick the photo.</b> A cake, balloons, the two of you. If the colour is in every corner of the picture, they'll guess from the first piece.</li>
        <li><b>Put the answer in the message, not the photo.</b> The message stays folded under the puzzle until the last piece lands. A neutral photo with &ldquo;It's a girl&rdquo; underneath keeps everyone guessing to the end.</li>
        <li><b>Pick the size.</b> 3&times;3 is quick; 6&times;6 takes a while.</li>
""" + SEND + """      </ol>
      <p class="tip">Revealing to a group? Start a group in the app and send the puzzle once; everyone in it gets the same one.</p>
""" + KEPT)
