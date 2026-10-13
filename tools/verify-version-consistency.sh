#!/bin/sh
# package.json, package-lock.json and the top CHANGELOG.md entry must carry the
# same version. With a release tag (argument or BASICRUM_RELEASE_TAG), the tag
# must be v<version>.

set -eu

fail() {
	printf '%s\n' "$1" >&2
	exit 1
}

repository_root=$( git rev-parse --show-toplevel 2>/dev/null ) || fail 'Version consistency check must run inside a Git worktree.'
cd "$repository_root"

for required_file in package.json package-lock.json CHANGELOG.md; do
	[ -f "$required_file" ] || fail "Required version metadata file is missing: $required_file"
done

package_version=$( node -p "require('./package.json').version" )
lock_version=$( node -p "require('./package-lock.json').version" )
lock_root_version=$( node -p "require('./package-lock.json').packages[''].version" )
changelog_version=$( sed -n 's/^## \[\([0-9][^]]*\)\].*$/\1/p' CHANGELOG.md | head -n 1 )

# Full Semantic Versioning 2.0.0 grammar (semver.org), evaluated by Node so the
# check does not depend on the platform's grep dialect.
node -e '
	const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
	process.exit(semver.test(process.argv[1]) ? 0 : 1);
' "$package_version" || fail "package.json version ($package_version) is not a valid Semantic Versioning 2.0.0 version."
[ "$lock_version" = "$package_version" ] ||
	fail "package-lock.json version ($lock_version) does not match package.json ($package_version). Run: npm install --package-lock-only"
[ "$lock_root_version" = "$package_version" ] ||
	fail "package-lock.json root package version ($lock_root_version) does not match package.json ($package_version)."
[ -n "$changelog_version" ] || fail 'CHANGELOG.md has no versioned "## [X.Y.Z]" heading.'
[ "$changelog_version" = "$package_version" ] ||
	fail "Top CHANGELOG.md version ($changelog_version) does not match package.json ($package_version)."

[ "$#" -le 1 ] || fail 'Usage: tools/verify-version-consistency.sh [release-tag]'
release_tag=${BASICRUM_RELEASE_TAG:-}
[ "$#" -eq 0 ] || release_tag=$1

if [ -n "$release_tag" ]; then
	[ "$release_tag" = "v$package_version" ] ||
		fail "Release tag ($release_tag) does not match package.json version ($package_version). Use v$package_version."
fi

printf '%s\n' "Version consistency check passed: $package_version"
