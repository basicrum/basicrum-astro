#!/bin/sh
# The vendored Boomerang build, the version constant in src/core/assets.js,
# the documented source commit in THIRD-PARTY-NOTICES.md and the SHA-256
# manifest in vendor/provenance.json must all agree.

set -eu

fail() {
	printf '%s\n' "$1" >&2
	exit 1
}

repository_root=$( git rev-parse --show-toplevel 2>/dev/null ) || fail 'Provenance check must run inside a Git worktree.'
cd "$repository_root"

bundle_count=$( find vendor/boomerang -name 'boomerang-*.min.js' | wc -l | tr -d ' ' )
[ "$bundle_count" -eq 1 ] || fail "Expected exactly one vendored Boomerang build, found $bundle_count."
bundle=$( find vendor/boomerang -name 'boomerang-*.min.js' )

header_line=$( grep -m 1 'Boomerang Version:' "$bundle" || true )
header_version=$( printf '%s\n' "$header_line" | sed -n 's/.*Boomerang Version: \([0-9.]*\) .*/\1/p' )
header_commit=$( printf '%s\n' "$header_line" | grep -oE '[0-9a-f]{40}' | head -n 1 )
[ -n "$header_version" ] && [ -n "$header_commit" ] || fail 'Vendored Boomerang header does not carry a version and source commit.'

file_version=$( basename "$bundle" | sed -n 's/^boomerang-\([0-9.]*\)\..*/\1/p' )
[ "$header_version" = "$file_version" ] || fail "Boomerang version mismatch: header $header_version, file name $file_version."

code_version=$( sed -n 's/^export const BOOMERANG_VERSION = "\([^"]*\)";$/\1/p' src/core/assets.js )
[ "$code_version" = "$file_version" ] || fail "BOOMERANG_VERSION in src/core/assets.js ($code_version) does not match the vendored file ($file_version)."

grep -Fq "$header_commit" THIRD-PARTY-NOTICES.md || fail "THIRD-PARTY-NOTICES.md does not mention Boomerang source commit $header_commit."
grep -Fq "Boomerang $file_version" THIRD-PARTY-NOTICES.md || fail "THIRD-PARTY-NOTICES.md does not mention Boomerang $file_version."
[ -f vendor/boomerang/LICENSE.txt ] || fail 'vendor/boomerang/LICENSE.txt is missing next to the vendored build.'

# The manifest's loader source commit must be the one the notices document.
source_commit=$( node -p "require('./vendor/provenance.json').sourceCommit || ''" )
printf '%s\n' "$source_commit" | grep -Eq '^[0-9a-f]{40}$' || fail 'vendor/provenance.json has no 40-character sourceCommit.'
grep -Fq "$source_commit" THIRD-PARTY-NOTICES.md || fail "THIRD-PARTY-NOTICES.md does not mention the loader source commit $source_commit."

# Every vendored file is listed with its current digest, and every listed file exists.
for path in $( node -p "Object.keys(require('./vendor/provenance.json').files).join(' ')" ); do
	[ -f "$path" ] || fail "vendor/provenance.json lists $path, which does not exist."
done
for path in $( find vendor -type f ! -name provenance.json | LC_ALL=C sort ); do
	expected=$( node -p "require('./vendor/provenance.json').files['$path'] || ''" )
	[ -n "$expected" ] || fail "vendor/provenance.json does not list $path."
	actual=$( shasum -a 256 "$path" | cut -d ' ' -f 1 )
	[ "$expected" = "$actual" ] || fail "SHA-256 mismatch for $path: manifest $expected, file $actual."
done

# The digest the notices print for the bundle must be the manifest's, and no
# digest in the notices may be stale.
bundle_digest=$( node -p "require('./vendor/provenance.json').files['$bundle']" )
grep -Fq "$bundle_digest" THIRD-PARTY-NOTICES.md || fail "THIRD-PARTY-NOTICES.md does not print the bundle digest $bundle_digest."
for digest in $( grep -oE '[0-9a-f]{64}' THIRD-PARTY-NOTICES.md | LC_ALL=C sort -u ); do
	node -e 'process.exit(Object.values(require("./vendor/provenance.json").files).includes(process.argv[1]) ? 0 : 1)' "$digest" ||
		fail "THIRD-PARTY-NOTICES.md prints digest $digest, which is not in vendor/provenance.json."
done

printf '%s\n' "Boomerang provenance check passed: $file_version $header_commit"
