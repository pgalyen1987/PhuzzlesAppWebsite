#!/usr/bin/env python3
"""Set every <lastmod> in sitemap.xml from the page's real last-commit date.

Hand-maintained dates drift, and a lastmod that understates the truth is worse than
none: it tells Google not to bother recrawling a page we just corrected. Driven from
git so the date cannot be wrong, and so a re-run is the whole maintenance story.

Only <lastmod> is ever rewritten. <loc> is left byte-for-byte alone.

  python3 tools/sitemap-lastmod.py            # dry run, prints what would change
  python3 tools/sitemap-lastmod.py --write
"""
import re, subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"
BASE = "https://phuzzles.app/"


def page_file(url):
    p = url[len(BASE):] if url.startswith(BASE) else url
    if p == "":
        return "index.html"
    if p.endswith("/"):
        return p + "index.html"
    return p if p.endswith(".html") else p + ".html"


def git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args],
                          capture_output=True, text=True).stdout.strip()


def main():
    write = "--write" in sys.argv
    xml = SITEMAP.read_text()
    entries = re.findall(r"<loc>([^<]+)</loc>\s*<lastmod>([^<]*)</lastmod>", xml)
    if len(entries) != xml.count("<url>"):
        sys.exit(f"GUARD: {xml.count('<url>')} <url> blocks but {len(entries)} loc+lastmod pairs; "
                 "every entry must carry a lastmod before this script owns them")

    out, changed = xml, []
    for url, old in entries:
        f = page_file(url)
        if not (ROOT / f).exists():
            sys.exit(f"GUARD: {url} maps to {f}, which does not exist")
        dirty = git("status", "--porcelain", "--", f)
        if dirty:
            sys.exit(f"GUARD: {f} has uncommitted changes, so its commit date understates it:\n{dirty}")
        new = git("log", "-1", "--format=%ad", "--date=short", "--", f)
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", new):
            sys.exit(f"GUARD: no commit date for {f} (got {new!r})")
        if new != old:
            changed.append((url, old, new))
            # Anchor on the loc so a shared date cannot be rewritten on the wrong entry,
            # and count the substitution: a silent no-op once reported "updated" and
            # pushed nothing, which is the one failure this script must not have.
            pat = re.compile(r"(<loc>" + re.escape(url) + r"</loc>\s*<lastmod>)" + re.escape(old) + r"(</lastmod>)")
            out, n = pat.subn(r"\g<1>" + new + r"\g<2>", out, count=1)
            if n != 1:
                sys.exit(f"GUARD: could not rewrite the lastmod for {url}; refusing to half-write")

    for url, old, new in changed:
        print(f"  {old} -> {new}  {url}")
    print(f"{len(changed)} of {len(entries)} lastmod dates {'updated' if write else 'would change'}")
    if not changed:
        return
    if out.count("<loc>") != xml.count("<loc>") or re.findall(r"<loc>([^<]+)</loc>", out) != [u for u, _ in entries]:
        sys.exit("GUARD: the loc list changed; refusing to write")
    if write:
        SITEMAP.write_text(out)
        back = SITEMAP.read_text()
        for url, _, new in changed:
            m = re.search(r"<loc>" + re.escape(url) + r"</loc>\s*<lastmod>([^<]*)</lastmod>", back)
            if not m or m.group(1) != new:
                sys.exit(f"GUARD: read-back says {url} is {m and m.group(1)!r}, not {new!r}")
        print("wrote", SITEMAP, "- read-back confirms all", len(changed), "dates")


main()
