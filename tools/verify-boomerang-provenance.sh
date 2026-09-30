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

grep -q "$header_commit" THIRD-PARTY-NOTICES.md || fail "THIRD-PARTY-NOTICES.md does not mention Boomerang source commit $header_commit."
grep -q "$file_version" THIRD-PARTY-NOTICES.md || fail "THIRD-PARTY-NOTICES.md does not mention Boomerang $file_version."
[ -f vendor/boomerang/LICENSE.txt ] || fail 'vendor/boomerang/LICENSE.txt is missing next to the vendored build.'

for path in $( find vendor -type f ! -name provenance.json | LC_ALL=C sort ); do
	expected=$( node -p "require('./vendor/provenance.json').files['$path'] || ''" )
	[ -n "$expected" ] || fail "vendor/provenance.json does not list $path."
	actual=$( shasum -a 256 "$path" | cut -d ' ' -f 1 )
	[ "$expected" = "$actual" ] || fail "SHA-256 mismatch for $path: manifest $expected, file $actual."
done

printf '%s\n' "Boomerang provenance check passed: $file_version $header_commit"
