#!/usr/bin/env bash
# Bump every package to one version, verify, commit, tag, publish and push.
#
#   scripts/release.sh patch      # 0.3.0 -> 0.3.1
#   scripts/release.sh minor      # 0.3.0 -> 0.4.0
#   scripts/release.sh major      # 0.3.0 -> 1.0.0
#   scripts/release.sh 0.4.2      # exact version
#
# Add --dry-run to stop after verifying (nothing committed or published).
# npm will ask for 2FA / browser approval during publish.
set -euo pipefail

cd "$(dirname "$0")/.."

BUMP="${1:-}"
DRY_RUN="${2:-}"
PACKAGES=(packages/core packages/singlebase-sdk packages/singlebase-elements)

if [[ -z "$BUMP" ]]; then
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree isn't clean. Commit or stash first." >&2
  exit 1
fi

CURRENT=$(node -p "require('./packages/core/package.json').version")
NEXT=$(node -e '
  const [cur, bump] = process.argv.slice(1);
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(bump)) { console.log(bump); process.exit(0); }
  let [ma, mi, pa] = cur.split("-")[0].split(".").map(Number);
  if (bump === "major") { ma++; mi = 0; pa = 0; }
  else if (bump === "minor") { mi++; pa = 0; }
  else if (bump === "patch") { pa++; }
  else { console.error("✗ Use patch, minor, major or x.y.z"); process.exit(1); }
  console.log(`${ma}.${mi}.${pa}`);
' "$CURRENT" "$BUMP")

if git rev-parse -q --verify "refs/tags/v$NEXT" >/dev/null; then
  echo "✗ Tag v$NEXT already exists." >&2
  exit 1
fi

echo "→ $CURRENT → $NEXT on $(git branch --show-current)"

for dir in "${PACKAGES[@]}"; do
  node -e '
    const fs = require("fs");
    const file = process.argv[1] + "/package.json";
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    pkg.version = process.argv[2];
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  ' "$dir" "$NEXT"
done

echo "→ Verifying (format, build, tests)"
pnpm run verify

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "✓ Dry run passed. Reverting the version bump."
  git checkout -- "${PACKAGES[@]/%//package.json}"
  exit 0
fi

git add "${PACKAGES[@]/%//package.json}"
git commit -m "Release v$NEXT"
git tag "v$NEXT"

echo "→ Publishing to npm"
pnpm -r publish --access public

echo "→ Pushing commit and tag"
git push --follow-tags

echo "✓ Released v$NEXT"
