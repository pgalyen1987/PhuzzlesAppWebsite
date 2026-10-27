#!/usr/bin/env bash
# Phuzzles iOS launch watcher. Run by the systemd user timer phuzzles-ios-live.timer every 15 minutes.
#
# Does nothing until Apple's public lookup lists the app (that only happens once it is actually on the
# store, so the badge link can't 404). Then, once:
#   1. merges branch ios-app-store-badge into main and pushes it (GitHub Pages deploys www.phuzzles.app)
#   2. waits until the live homepage shows the App Store badge
#   3. marks phuzzles-ios live in ~/boss/registry.json and adds a dashboard todo
#   4. disables its own timer
# Every step is safe to repeat, so a failed run just tries again on the next tick.
#
# Test without touching anything:  FORCE_LIVE=1 DRY_RUN=1 tools/ios-live-watch.sh
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:/usr/local/bin:/usr/bin:/bin"

APP_ID=6766833614
BRANCH=ios-app-store-badge
WT="$HOME/.cache/phuzzles-site-ios"          # worktree of ~/PhuzzlesAppWebsite, so the main checkout is never touched
REMOTE=https://github.com/pgalyen1987/PhuzzlesAppWebsite.git
SITE=https://phuzzles.app/                   # www 301s to the apex since 09-22
DRY_RUN=${DRY_RUN:-}
log() { echo "$(date -u +%FT%TZ) $*"; }

json_field() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(eval("j."+process.argv[1])??"")}catch{console.log("")}})' "$1"; }

lookup=$(curl -s --max-time 20 "https://itunes.apple.com/lookup?id=$APP_ID" || true)
count=$(printf '%s' "$lookup" | json_field resultCount)
if [ "${FORCE_LIVE:-}" != 1 ] && [ "${count:-0}" != "" ] && [ "${count:-0}" -lt 1 ] 2>/dev/null; then
  log "not on the App Store yet (lookup resultCount=${count:-?})"
  exit 0
fi
[ -z "$count" ] && { log "lookup failed, retry next tick"; exit 0; }
store_url=$(printf '%s' "$lookup" | json_field 'results[0].trackViewUrl')
log "LIVE: resultCount=$count ${store_url:-(forced)}"

cd "$WT"
git fetch -q origin
if git merge-base --is-ancestor "$BRANCH" origin/main; then
  log "badge commit already on origin/main"
else
  git checkout -q --detach origin/main
  if ! git merge -q --no-edit -m "Merge $BRANCH: Phuzzles is live on the App Store" "$BRANCH"; then
    git merge --abort || true
    git checkout -q "$BRANCH"
    log "MERGE CONFLICT with origin/main, needs a human"
    if [ -z "$DRY_RUN" ] && [ ! -e "$HOME/.cache/phuzzles-ios-live.conflict" ]; then
      touch "$HOME/.cache/phuzzles-ios-live.conflict"
      curl -s -X POST localhost:7777/api/todos -H 'content-type: application/json' \
        -d '{"action":"add","project":"phuzzles-site","text":"Phuzzles is live on the App Store but the App Store badge branch (ios-app-store-badge) conflicts with main — merge it by hand"}' >/dev/null || true
    fi
    exit 1
  fi
  if [ -n "$DRY_RUN" ]; then
    git push --dry-run "$REMOTE" HEAD:main 2>&1 | sed 's/^/  push: /'
    git checkout -q "$BRANCH"
    log "DRY RUN: merge OK and push accepted; stopping before deploy"
    exit 0
  fi
  git push -q "$REMOTE" HEAD:main
  git checkout -q "$BRANCH"
  log "pushed to main"
fi

[ -n "$DRY_RUN" ] && { log "DRY RUN: already merged; stopping"; exit 0; }

for i in $(seq 1 30); do
  page=$(curl -sL --max-time 20 "$SITE?v=$(date +%s)" || true)   # no pipe: grep -q + pipefail can report a false miss
  if grep -q 'app-store-badge.svg' <<<"$page"; then live=1; break; fi
  sleep 20
done
[ "${live:-}" = 1 ] || { log "pushed, but the live site doesn't show the badge yet; will re-check next tick"; exit 1; }
log "www.phuzzles.app shows the App Store badge"

node - "$store_url" <<'EOF'
const { execFileSync } = require("node:child_process");
const pm = `${process.env.HOME}/boss/project.mjs`;
const cur = JSON.parse(execFileSync("node", [pm, "show", "phuzzles-ios"], { encoding: "utf8" }));
const day = new Date().toISOString().slice(0, 10);
if (!String(cur.note || "").startsWith("**LIVE on the App Store")) {
  const note = `**LIVE on the App Store ${day}** (auto-detected; ${process.argv[2] || "apps.apple.com/app/id6766833614"}). Site badge + iOS deep-link routing deployed. ` + (cur.note || "");
  execFileSync("node", [pm, "set", "phuzzles-ios", "stage=live", "pct=100", `note=${note}`], { stdio: "inherit" });
}
EOF
curl -s -X POST localhost:7777/api/todos -H 'content-type: application/json' \
  -d '{"action":"add","project":"phuzzles-ios","text":"Phuzzles is LIVE on the App Store — site badge deployed. Start the launch push: print Phuzzles_Poster.pdf, iOS launch checklist in DISTRIBUTION_KIT.md"}' >/dev/null || true

systemctl --user disable --now phuzzles-ios-live.timer || true
log "done; timer disabled"
