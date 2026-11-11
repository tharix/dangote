# Dangote Electrical Academy

Static, offline-capable training workspace for electrical load sizing, load schedules, BOQs, component selection, low-voltage electronics design, circuit simulation, and troubleshooting exercises.

The current browser experience remains usable offline. Optional Supabase sign-in, cohort membership, cloud project submission, instructor review, and a class dashboard are implemented but inactive until a Supabase project is configured. Apply the reviewed SQL in [supabase/schema.sql](./supabase/schema.sql), then set the project URL and public anon key in [supabase-config.js](./supabase-config.js). Never place a service-role key in the browser app.

## Development

The application has no build step. Serve the project directory with any static web server:

```powershell
python -m http.server 8000
```

Then open `http://localhost:8000/`.

From the parent workspace, open `Dangote-Electrical-Academy.code-workspace` to work in the active repository without including local history, archived prototypes, or bundled runtimes in the Explorer.

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
Run its integration checks in Chromium with:

```powershell
npm ci
npx playwright install chromium
npm run test:browser
```

The CI workflow runs these browser checks in addition to the Node.js tests and
syntax checks.

## Offline support

Runtime libraries are vendored under `assets/vendor/`. The application does not require a network connection after checkout.
The dashboard summarizes projects, lesson progress, troubleshooting, and BOQ lines saved in the current browser; it does not display fabricated organization-wide activity.

## Circuit builder

The circuit builder supports AC mains, 12 V batteries, and a 5 V bench-supply model; MCB/RCD/fuse protection; isolators, switches, timers, relays and contactors; junctions and transformer symbols; and lamp, socket, motor, resistor, capacitor, diode, LED, and transistor parts. Enable **Connect components**, choose a conductor (line, phases A/B/C, neutral, or protective earth), then select the visible output and input terminals to create a wire. Adjustable component properties include resistor, capacitor, diode, LED, fuse, transformer-ratio, and motor training values; these values persist with circuit diagrams and project revisions. Junctions expose an input and two branch outputs for simple parallel circuits. Validation requires exactly one source, a connected topology, protection on the line/phase path to a load, and an earth-leakage path with an RCD when that fault is selected. An LED exercise also requires a battery or 5 V bench source and a resistor on a line-conductor path to the LED. Use **Validate circuit** to check source, protection, load, terminal wiring, conductor, and connectivity requirements. Diagrams can be saved locally, loaded, exported as JSON, and imported from JSON. Simulation reports illustrative voltage, current, power, and estimated energy for the training circuit. Existing version-1 diagrams remain importable and are upgraded when restored.

The dashboard provides a suggested Learn → Draw → Explore → Diagnose route. The Circuit Builder includes a labeled, offline protected-lamp schematic, a left-to-right connection sequence, and the live drag-and-connect workbench. The Electronics Lab includes its own labeled LED/resistor diagram and symbol key. The interface uses brown for line/phase, blue for neutral/return, green-yellow for protective earth, amber for caution, green for safe/complete, and red for faults. These are illustrative IEC-style cues; verify the locally applicable wiring color codes. Schematic examples are simplified classroom illustrations, not installation drawings.

Undo/redo is available for diagram edits, and fault modes simulate open circuits, short circuits, earth leakage, loose connections, reversed LED polarity, and component failure for classroom troubleshooting exercises. A simulation trend plot graphs the estimated voltage, current, or power against elapsed run time. Junction branches use separate branch A and branch B terminals, and validation rejects invalid or duplicated destination terminals.

The protected-lamp walkthrough checks each component and connection in sequence without replacing the learner's canvas. Virtual multimeter readings use the simplified simulator's values; continuity reports only whether the classroom topology validates and requires the simulation to be stopped. The oscilloscope displays idealized AC, DC, or no-signal traces. Neither instrument represents physical probes or measured equipment, and these displays must never guide live electrical work.

## PLC simulator

The PLC Simulator includes editable ladder-logic examples for a seal-in motor starter, an interlocked conveyor, a tank pump, and analog level control. Toggle simulated digital inputs and scaled 0–100% analog inputs; edit NO/NC contacts, analog comparisons, output coils and setpoints; add series contacts, parallel branches, rungs, TON timers, and CTU counters. Run a single scan or a continuous scan loop to observe the I/O image, timer/counter states, a rung-by-rung scan explanation, and digital output trend. Training faults can force a digital input on/off or inhibit an output channel. Three ladder challenges run defined test sequences against the current program, and three evidence-led troubleshooting cases record attempts and completion offline.

PLC programs are saved on-device and can be exported/imported as JSON. They are also included in named project saves, project revisions and comparisons, project import/export, review submissions, unified engineering reports, and training review exports. PLC challenge and troubleshooting progress appears in the dashboard and learner summary.

This is a browser-based teaching model, not a PLC IDE, target runtime, safety controller, or commissioning tool. Its scan timing and I/O are illustrative only. Never use it to design, test, commission, bypass, or operate real machinery or safety functions.

Three guided electronics projects cover a current-limited 5 V LED indicator, an instructor-reviewed RC timing monitor, and a datasheet-based low-voltage transistor load switch. They are supervised classroom activities only. Use isolated current-limited DC supplies at or below 24 V, de-energize before changing wiring, and never connect these projects to mains or industrial equipment.

## Engineering calculator

Cable sizing accepts cable length, ambient-temperature correction, and grouping correction factors. Results show adjusted derating, voltage-drop percentage, and a breaker rating coordinated against the adjusted cable capacity where the training model has a suitable combination. Loads beyond the model's cable or breaker table are flagged instead of being presented as a complete recommendation. These remain training estimates and must be checked against the applicable installation standard before field use.

Three-phase load schedules assign each circuit to Phase A, B, or C and report phase-current spread, estimated neutral current, and phase-specific capacity warnings. A balance spread above 20% is flagged for review. Load sizing, load schedules, motor feeder estimates, LED resistor sizing, divider loading, RC charging, and circuit simulations include generated SVG plots based on their current model inputs.

## Offline project storage

Named projects contain the BOQ, load schedule, cable-sizing inputs, and circuit diagram together, with up to ten previous snapshots retained as revisions. Loading a project or revision restores its sizing inputs and recalculates the result; students must save sizing-input edits before submitting. Projects are written to IndexedDB for larger offline-safe storage and mirrored to localStorage as a compatibility fallback. Use **Export project** and **Import project** to move a complete project between devices without a server. The Profile module also exports a versioned full-device JSON backup of known academy storage and validates it before restoring; restore replaces the academy data on that browser, so save the current device state first. Keep backup files private.

## Guided learning and review

The Lessons module provides practical circuit exercises with hints, offline progress tracking, and a review JSON export for instructors. The circuit review also displays the dominant phase current for the active training topology. Cloud collaboration remains optional; no Supabase credentials are required for offline use.

Offline profiles support student, instructor, and administrator roles. Saved projects can be reviewed locally, marked approved, or returned for changes; reviewer name and timestamps are stored with the project.

The project workspace can export a unified engineering report as JSON or PDF containing the calculation, motor feeder estimate, load schedule, installation record, BOQ, circuit validation, review history, and learning progress. Reports explicitly state that their estimates have not been independently validated for standards compliance. Saved project revisions can be compared and restored to the workspace before saving; comparisons include BOQ, circuit components and connections, load schedule, motor design, installation checks, and review status. Students submit saved work for review; instructors approve or request changes with comments and a resubmission history; administrators can manage the local project directory. Troubleshooting attempts and completed scenarios are stored offline and included in the student progress summary.

Offline role selection and role-based controls are local workflow conveniences only and must not be used as a security boundary. When Supabase is configured, cloud authorization is based on the server-managed profile and cohort membership policies, not on the local role selector. Until a project is configured, the cloud dashboard and server-side authorization are unavailable. Have a qualified electrical designer review the calculation methods against the applicable local standard before relying on them for any real project.

The Installation & Commissioning module includes a standards-basis and external-review record for the jurisdiction, exact standard and edition, amendments, reviewer credentials, declaration, evidence references, and reviewer-entered topic outcomes. Nigeria and the NEMSA NESIS Regulations 2015 are prefilled as a proposed basis, alongside source links supplied for NEMSA, IEC, ECOWAS, SON, and ECREEE. The supplied NESIS document identifies user-site requirements in scope and references BS 7671:2008 and NIS IEC documents; the supplied 2023 ECOWAS PDF is the ECOWAS Energy Policy, not a wiring-installation code.

A public-source check found that NEMSA's 2025 accreditation certificate (valid through 24 July 2029) lists NESIS 2015 among its applicable documents, strong evidence of current NEMSA administrative use. NESIS was made under the EPSR Act 2005, and the sources reviewed did not conclusively establish its formal legal continuation under the Electricity Act 2023. The supplied NESIS text references BS 7671:2008; the IET now publishes BS 7671:2018+A4:2026, but that UK publication does not automatically amend Nigeria's cited edition. SON's [Digital Standards Platform](https://nnsdp.son.gov.ng/) is the official access point for Nigerian Industrial Standards; current NIS IEC and NCP 09 edition/amendment records were not publicly verified here.

NEMSA publishes category-based individual and corporate installer certification routes, including qualifications and experience evidence; the corporate engineer route includes interview/examination. The reviewer record now has a field for a self-reported NEMSA category/authorization reference. The specific category, validity, work scope, and authority to sign a particular installation certificate still need direct verification with NEMSA. A degree or self-declaration alone is not proof of authorization.

On 2026-11-11, the project owner self-reported an engineering review covering the listed calculation topics and no findings, and supplied this proposed technical reference map for Nigeria:

- Cable sizing: IEC 60364-5-52:2009 + AMD1:2024 (Edition 3.1) and the IEC 60287 series; the listed core current-rating parts are 2023 editions (IEC 60287-1-1, -1-2, -1-3, and -2-1).
- Voltage drop: IEC 60364-5-52:2009 + AMD1:2024 (Edition 3.1).
- Earth-fault loop impedance: IEC 60364-4-41:2005 + AMD1:2017 (Edition 5.1).
- Overcurrent protection and circuit-breakers: IEC 60364-4-43:2023 (Edition 4.0) and IEC 60947-2:2024 (Edition 6.0).
- Short-circuit current: IEC 60909-0:2026 (Edition 3.0).
- Earthing conductors: IEC 60364-5-54:2011 + AMD1:2021 (Edition 3.1).
- Installation verification: IEC 60364-6 (edition/year not supplied).
- Surge protection: the supplied reference was incomplete ("IEC 60364-4") and does not identify a complete part or edition.

This is a record of the project owner's statement, not an independently verified standards crosswalk. The supplied information does not identify a separate load-diversity or motor-design reference. It does not establish Nigerian adoption, resolve NESIS's legal status under the Electricity Act 2023, verify controlled editions or amendments, or identify reviewer credentials and signing authority. No detailed calculation-by-calculation evidence was supplied. Accordingly, the review report is not represented as a compliance determination, and the app's formulas and training-only limitations remain unchanged. The demo cable/breaker tables and installation factors are not traced here to approved standard tables; the app does not calculate prospective fault current/device curves or perform physical tests.

The standards record is autosaved locally, travels with named projects and revisions, is included in full-device backups, and appears in unified JSON/PDF reports. It does not verify credentials or citations, calculate compliance, or certify a design. Do not mark an outcome as acceptable unless a qualified reviewer has assessed the project evidence against the governing requirements. No electrical sizing formulas are presented as code-compliant by this workflow.

### Enabling optional cloud accounts

1. Create a Supabase project and apply [supabase/schema.sql](./supabase/schema.sql) in its SQL editor.
2. Copy the project URL and public anon/publishable key into [supabase-config.js](./supabase-config.js). These browser-visible values are not secrets; database permissions must remain enforced by RLS.
3. Configure Supabase Auth's site URL and redirect allowlist for the deployed app, then invite users through Supabase Auth. Use the standard hosted confirmation flow so verification credentials return in the URL fragment; do not configure email templates or redirects to put `token_hash` values in the query string. Invitation and recovery links return to the app, where users must set a 12-character-minimum password. Profiles are created as students by default. A trusted project administrator must assign instructor roles in the database; never let a browser choose its server role.
4. An instructor signs in, creates a cohort, and shares its invite code with enrolled students. Students sign in and join using that code. Cloud submissions and review actions are checked by database policies and triggers.

The browser keeps its access and refresh tokens in session-scoped storage, not in full-device backups. Use HTTPS in deployment. The local profile role remains editable and is never the cloud authorization source. Instructor cohort views are limited by RLS to their memberships; review actions are recorded by a database trigger. Apply the migration to a test Supabase project and verify its policies before using real learner records.

Keyboard users can move through controls using visible focus indicators. The interface honors reduced-motion preferences and exposes the skip link and live status messages. These improvements do not by themselves establish conformance to WCAG; test with assistive technology before making an accessibility-conformance claim.

The circuit toolbox also includes a five-second timer relay and a manually toggled relay. Timer components begin open and close after the simulated delay; relay components can be toggled during a simulation. Building fault scenarios cover motor overloads, intermittent lighting, and heat-damaged outlets as well as timer and relay faults. The separate Power Station Diagnostics Lab uses evidence-led scenarios for generator and transformer protection, excitation and voltage regulation, prime movers, rotating equipment, auxiliary systems, and grid disturbances. It practices correlating alarms, time-sequenced events, trends, independent indications, and specialist escalation; cases and progress are stored offline and included in training exports.

The Electronics Lab provides low-voltage DC design worksheets for LED series resistors (with an E12 suggestion and power margin), unloaded voltage dividers, first-order RC timing/filter estimates, and NPN base-drive resistor selection using forced beta. Its plots show LED current versus supply voltage, divider output under a variable load, normalized RC charging over five time constants, and estimated transistor collector drive versus control voltage. Six evidence-led troubleshooting cases cover LED polarity/current limiting, loaded dividers, RC timing, op-amp saturation, transistor switching, and sensor noise. Case progress is stored offline and included in the dashboard, learner summary, and report exports. Calculations and the circuit builder are introductory models, not SPICE or installation simulators: follow datasheets, use isolated current-limited supplies at or below 24 V, and de-energize before changing wiring. Never use plots or software readings to guide live electrical work. The feature does not cover mains or industrial electronics or replace design review or competent supervision.

The Power Station Lab and Electronics Lab are classroom aids only. The station lab does not provide switching, resetting, protection-setting, isolation, testing, or repair instructions. Actual plant events belong to authorized control-room staff and competent site teams working to approved procedures, permits, and the system operator's requirements.

## Motor feeder and installation planning

The Motor Feeder Design tool estimates three-phase motor full-load current from output power, supply voltage, power factor, and efficiency. It shows an illustrative cable/protection-table check, voltage drop, and starting-current estimate using a multiplier supplied from motor/starter data. It does not select a starter, overload setting, or certify a design; verify nameplate and manufacturer data, fault levels, starting conditions, and the locally adopted installation standard with a qualified designer.

The Installation Planner stores a building installation and commissioning record with project saves, exports, and revisions. Statuses and evidence references are a recordkeeping aid only: the app performs no electrical test, checks no pass limits, and does not authorize energization. Isolation, inspection, testing, certification, and handover remain the responsibility of competent persons under applicable local requirements. Do not enter confidential or personally identifying information in notes.

## Team workflow

Use short branches and pull requests. Keep calculation logic in `core.js`, UI wiring in `script.js`, and update tests when engineering rules change. The repository assigns default review ownership through [CODEOWNERS](./.github/CODEOWNERS) and checks GitHub Actions updates with Dependabot. See [CONTRIBUTING.md](./CONTRIBUTING.md).

Security concerns should follow the process in [SECURITY.md](./SECURITY.md).

Use [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for production releases and pull requests.

## Deployment

The [Deploy static app](./.github/workflows/deploy-pages.yml) workflow publishes only the app entry point, runtime scripts/styles, and vendored assets through GitHub Pages. Enable Pages with **GitHub Actions** as the source in repository settings.

Production site: [https://tharix.github.io/dangote/](https://tharix.github.io/dangote/)

The current `main` deployment and quality-check workflow runs are green. Keep `main` protected in GitHub so changes arrive through reviewed pull requests.
