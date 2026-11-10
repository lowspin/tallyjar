# Tallyjar

A calm, friendly Progressive Web App for counting things. Create **jars** and keep tallies of
the **items** inside them. No accounts: everything lives on your device and can be exported as
JSON.

See [REQUIREMENTS.md](REQUIREMENTS.md) for the full specification.

## Development

Requires Node 22+.

```sh
npm install
npm run dev        # dev server
npm test           # unit tests (Vitest)
npm run lint       # ESLint
npm run format     # Prettier
npm run build      # type-check and production build into dist/
npm run preview    # serve dist/ locally (service worker active)
```

The service worker only runs in production builds, so test offline behaviour and installing
with `npm run build && npm run preview`.

### Icons

`public/logo.svg` is the source for every app icon. After changing it, run `npm run icons` to
regenerate the PNGs and `favicon.ico` in `public/`.

## Deployment

Every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which
lints, tests, builds and publishes `dist/` to GitHub Pages. In the repository settings,
**Pages → Source** must be set to **GitHub Actions**.

All asset paths are relative (`base: './'`), so the app works under any sub-path such as
`https://<user>.github.io/tallyjar/`.
