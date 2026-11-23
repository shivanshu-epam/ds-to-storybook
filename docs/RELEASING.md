# Releasing ds-sync

The CLI (npm package `ds-sync`, in `engine/`) and the Claude Code plugin (`engine/claude-plugin`, installed from this repository's marketplace) are released together, under one version.

## Every release

1. Set the same version in `engine/package.json` and `engine/claude-plugin/.claude-plugin/plugin.json`.
2. Add a `## <version>` section to `engine/CHANGELOG.md`. The engine tests fail if the versions differ or the changelog has no entry.
3. Check the package, on a clean checkout of the release commit:

   ```bash
   cd engine
   npm ci
   npm publish --dry-run     # runs typecheck and tests (prepublishOnly) and the build (prepack); lists the files
   ```

4. Merge to `main`, then tag the release commit and push the tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

   The `release` workflow (`.github/workflows/release.yml`) checks that the tag, the package and the plugin have the same version. It then type-checks, tests, builds and publishes to npm with provenance.

The plugin needs no separate step: `/plugin marketplace update ds-sync` picks up the new version from `main`.

## The first release (once)

npm's trusted publishing can only be set up for a package that already exists, so the first version is published by hand, by the package owner:

```bash
npm login                   # the owner's npm account, with two-factor authentication
cd engine
npm ci
npm publish --access public # asks for the one-time code
```

Then, on npmjs.com, open the `ds-sync` package › Settings › Trusted publishing. Add this repository (`shivanshu-epam/ds-to-storybook`) and the workflow file `release.yml`. From then on, tags publish without a token. Alternatively, store a granular access token with publish rights as the repository secret `NPM_TOKEN`.

## After a release

- Check that `npx ds-sync@<version> --version` prints the version.
- Projects pin the version in their workflow (`DS_SYNC_VERSION` in `.github/workflows/ds-sync.yml`). They upgrade by changing that line, which regenerates their Storybook once with the new engine.
