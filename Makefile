.PHONY: update release patch minor major

# ── make update [v=patch|minor|major] ─────────────────────────────────────────
# Bumps the version, commits, tags, and pushes — triggering a GitHub release.
#
# Usage:
#   make update          # bump patch (0.7.3 → 0.7.4)
#   make update v=minor  # bump minor (0.7.3 → 0.8.0)
#   make update v=major  # bump major (0.7.3 → 1.0.0)

v     ?= patch
notes ?=

update:
	@echo "→ Bumping $(v) version..."
	@npm version $(v) --no-git-tag-version
	@VERSION=$$(node -p "require('./package.json').version"); \
	echo "→ Version: $$VERSION"; \
	git add package.json; \
	git commit -m "release: v$$VERSION"; \
	git push; \
	git tag v$$VERSION; \
	git push origin v$$VERSION; \
	echo ""; \
	echo "✓ Released v$$VERSION — GitHub Actions is building now."; \
	if [ -n "$(notes)" ]; then \
		gh release edit "v$$VERSION" --notes "$(notes)"; \
		echo "✓ Release notes updated."; \
	fi
