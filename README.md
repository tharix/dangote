# Dangote Electrical Academy

Static, offline-capable training workspace for electrical load sizing, load schedules, BOQs, component selection, circuit simulation, and troubleshooting exercises.

The current browser experience remains usable offline. Supabase integration is prepared through [supabase-config.js](./supabase-config.js) and the migration in [supabase/schema.sql](./supabase/schema.sql); configure those before enabling account-backed project storage.

## Development

The application has no build step. Serve the project directory with any static web server:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Tests

The pure calculation module has Node.js tests:

```powershell
npm test
```

Syntax checks:

```powershell
npm run check
```

There is also a dependency-free browser test page at `tests/browser-test.html`.

## Offline support

Runtime libraries are vendored under `assets/vendor/`. The application does not require a network connection after checkout.

## Team workflow

Use short branches and pull requests. Keep calculation logic in `core.js`, UI wiring in `script.js`, and update tests when engineering rules change. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Deployment

The [Deploy static app](./.github/workflows/deploy-pages.yml) workflow publishes the repository through GitHub Pages. Enable Pages with **GitHub Actions** as the source in repository settings.
