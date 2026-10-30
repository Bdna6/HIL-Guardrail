import { mountDemo } from './demo.js';
import { defaults } from './demo-state.js';

export async function mountLocal(root) {
  let response = await fetch('/api/local/state', { cache: 'no-store' });
  if (!response.ok)
    throw new Error('Local HIL service is unavailable. Run hil start and open its local URL.');
  let current = await response.json();
  const state = defaults();
  state.active = current.config.mode === 'study' ? 'learn' : current.config.mode;
  state.enabled = current.config.enabled;
  for (const mode of ['build', 'work', 'learn'])
    state.configs[mode] = { ...current.config.policies[mode === 'learn' ? 'study' : mode] };
  try {
    const preferences = JSON.parse(localStorage.getItem('hil.local.appearance.v1'));
    if (preferences) {
      if (['light', 'dark', 'system'].includes(preferences.appearance))
        state.appearance = preferences.appearance;
      if (['comfortable', 'compact'].includes(preferences.density))
        state.density = preferences.density;
      if (typeof preferences.reduceMotion === 'boolean')
        state.reduceMotion = preferences.reduceMotion;
    }
  } catch {
    /* Defaults remain valid. */
  }
  let queue = Promise.resolve();
  const connection = {
    state,
    status: current.status,
    goal: current.config.goal,
    save(value) {
      const snapshot = structuredClone(value);
      const task = queue.then(async () => {
        const next = {
          revision: current.config.revision,
          enabled: snapshot.enabled,
          mode: snapshot.active === 'learn' ? 'study' : snapshot.active,
          goal: connection.goal,
          policies: Object.fromEntries(
            ['build', 'work', 'learn'].map((m) => [
              m === 'learn' ? 'study' : m,
              snapshot.configs[m],
            ]),
          ),
        };
        response = await fetch('/api/local/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not save local configuration');
        current = result;
        connection.status = result.status;
        try {
          localStorage.setItem(
            'hil.local.appearance.v1',
            JSON.stringify({
              appearance: snapshot.appearance,
              density: snapshot.density,
              reduceMotion: snapshot.reduceMotion,
            }),
          );
        } catch {
          /* Runtime configuration is saved even if local appearance storage is disabled. */
        }
      });
      queue = task.catch(() => {});
      return task;
    },
  };
  mountDemo(root, connection);
  setInterval(async () => {
    try {
      const result = await fetch('/api/local/state', { cache: 'no-store' });
      if (!result.ok) throw new Error();
      const value = await result.json();
      connection.status = value.status;
      const badge = root.querySelector('.demo-footer>span:last-child');
      if (badge)
        badge.textContent = `Claude Code: ${value.status.sessions.length} observed session(s) · v${value.status.version}`;
    } catch {
      connection.status = { running: false };
      const badge = root.querySelector('.demo-footer>span:last-child');
      if (badge) badge.textContent = 'HIL background service: Offline';
    }
  }, 5000);
}
