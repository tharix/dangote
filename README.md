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

## Circuit builder

The circuit builder supports AC mains and battery sources, MCB/RCD protection, switches, lamps, sockets, and motors. Enable **Connect components**, click two components to create a wire, and use **Validate circuit** to check source, protection, load, and connectivity requirements. Diagrams can be saved locally, loaded, exported as JSON, and imported from JSON. Simulation reports voltage, current, power, and estimated energy for the training circuit.

Undo/redo is available for diagram edits, and fault modes simulate open circuits, short circuits, and earth leakage for classroom exercises.

## Engineering calculator

Cable sizing accepts cable length, ambient-temperature correction, and grouping correction factors. Results show adjusted derating and voltage-drop percentage. These remain training estimates and must be checked against the applicable installation standard before field use.

## Team workflow

Use short branches and pull requests. Keep calculation logic in `core.js`, UI wiring in `script.js`, and update tests when engineering rules change. The repository assigns default review ownership through [CODEOWNERS](./.github/CODEOWNERS) and checks GitHub Actions updates with Dependabot. See [CONTRIBUTING.md](./CONTRIBUTING.md).

Security concerns should follow the process in [SECURITY.md](./SECURITY.md).

Use [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for production releases and pull requests.

## Deployment

The [Deploy static app](./.github/workflows/deploy-pages.yml) workflow publishes the repository through GitHub Pages. Enable Pages with **GitHub Actions** as the source in repository settings.

Production site: [https://tharix.github.io/dangote/](https://tharix.github.io/dangote/)

The current `main` deployment and quality-check workflow runs are green. Keep `main` protected in GitHub so changes arrive through reviewed pull requests.
