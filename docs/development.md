# Development

Working on singlebase-js itself: building, testing, the examples, and
releasing.

## Commands

```bash
pnpm install
pnpm build        # core, then the SDK, then the elements
pnpm test         # Jest for core and the SDK, headless Chromium for the elements
pnpm verify       # format check + build + test, as CI runs it
pnpm example      # serves the repo at http://localhost:4517
```

Open `examples/index.html` (the auth widget), `examples/customize.html`
(the visual customizer), `examples/uploader.html` (the uploader),
`examples/chat.html` (the chat) or `examples/spa.html` (the client in a
single-page app). All run against mocks.

## Publish

You need to be logged in to npm (`npm login`) with access to the `@singlebase`
organization, and have a clean, committed working tree.

```bash
scripts/release.sh patch           # or minor, major, or an exact 1.2.3
```

It bumps all three packages to the same version, runs `pnpm verify`, commits
`Release vX.Y.Z`, tags `vX.Y.Z`, publishes with pnpm and pushes the commit and
tag. Add `--dry-run` (`scripts/release.sh minor --dry-run`) to verify the bump
and then revert it, with nothing committed or published.

By hand, the same steps are:

```bash
pnpm verify                        # format check, build, test
pnpm -r publish --dry-run          # see exactly what would ship
pnpm -r publish --access public    # publish core, then the SDK, then elements
```

- **Use `pnpm`, never `npm publish`.** pnpm replaces the internal
  `workspace:*` dependencies with real version numbers. npm doesn't, and the
  published packages would fail to install.
- **Each package builds itself before publishing** (`prepublishOnly`), so a
  stale or missing `dist` can't be published.
- **Versions move together.** Bump all three packages to the same version
  before publishing, because each depends on the others' exact version.
