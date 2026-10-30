# HIL web demonstration

Run `npm run dashboard`, then visit http://127.0.0.1:4173.

The landing page and authentication dialogs are independent from the interactive demo. Authentication is disconnected; the demo link opens `/demo/dashboard` without creating an account or reading authentication state.

## Demo routes

- `/demo/dashboard`: Build, Work, and Study presets; selection persists immediately.
- `/demo/settings`: independent per-mode configuration with save/discard; editing a mode never activates it. Light/dark/system appearance, density, and additional reduced motion apply immediately.
- `/demo/usage`: deterministic fictional checkpoint data for 7, 30, and 90 days, ending October 30, 2026. No activity is collected from the machine. Metrics, activity bars, distribution and recent events use the same dataset.
- `/demo/open-source`: component list using the repository configured in the project's package metadata. Planned components without links are explicitly labeled.

The static server maps these routes to `index.html`; root-relative assets support refresh and direct links. Client navigation uses browser history. Back to website performs a normal navigation to the existing landing experience.

## Files and state

- `demo.js`: shared shell, navigation and four page renderers.
- `demo-state.js`: product copy, component metadata, validated storage and sample usage aggregation.
- `base.css`: shared browser resets and form primitives.
- `demo.css`: scoped monochrome workspace styling, themes and responsive layouts.
- `app.js`: entry router between landing and demo.
- `access.js`, `access-motion.js`, `access.css`, `logo.js`: landing, animation, authentication UI and shared logo.

Only `hil.workspace.demo.v1` in localStorage is used for the new demo. Invalid fields fall back to defaults. Reset demo removes only that key. It does not clear old prototype accounts, authentication data or unrelated browser storage. There is no local adapter connection, cloud synchronization or claim that settings are applied to an Agent.

Replace `loadDemo` / `persistDemo` with account-backed persistence in a future implementation. Keep runtime acknowledgment separate from web configuration saving.

## Live local control

The compiled HIL runtime additionally serves `/local/*`. It reuses the workspace through `local.js`, with HTTP configuration persistence, revisions, runtime facts and an actual enable switch. Demo storage and authentication remain separate. Start with `npm run hil -- start --port 4174` after building. See [the runtime guide](../docs/10-local-runtime.zh-CN.md).
