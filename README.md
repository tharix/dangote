# Dangote Electrical Academy

Static, offline-capable training workspace for electrical load sizing, load schedules, BOQs, component selection, circuit simulation, and troubleshooting exercises.

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

There is also a dependency-free browser test page at `tests/browser-test.html`.

## Offline support

Runtime libraries are vendored under `assets/vendor/`. The application does not require a network connection after checkout.

## Team workflow

Use short branches and pull requests. Keep calculation logic in `core.js`, UI wiring in `script.js`, and update tests when engineering rules change. See [CONTRIBUTING.md](./CONTRIBUTING.md).
