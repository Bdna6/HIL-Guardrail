export const modes = [
  {
    id: 'build',
    name: 'Build',
    label: 'Direction & scope',
    description: 'Keep technical choices and project scope in your hands.',
    symbol: '◇',
  },
  {
    id: 'work',
    name: 'Work',
    label: 'Evidence & review',
    description: 'Keep key facts verifiable and take ownership of the result.',
    symbol: '⊞',
  },
  {
    id: 'learn',
    name: 'Study',
    label: 'Thinking & understanding',
    description: 'Try first, explore with hints, and explain what you understand.',
    symbol: '◎',
  },
];
export const boundaries = [
  {
    id: 'resources',
    name: 'New resources',
    description: 'Dependencies, external services, and additional permissions.',
  },
  {
    id: 'scope',
    name: 'Scope changes',
    description: 'Changes to requirements, architecture, or data flows.',
  },
  {
    id: 'handover',
    name: 'Results & handover',
    description: 'Important conclusions, understanding checks, and final review.',
  },
];
export const checkpoints = [
  {
    id: 'summary',
    name: 'Show a summary at checkpoints',
    description: 'Present the choice and its implications.',
  },
  {
    id: 'acknowledge',
    name: 'Ask for acknowledgment',
    description: 'Reserve a moment for your response.',
  },
  {
    id: 'context',
    name: 'Include context in review requests',
    description: 'Include the evidence behind a request.',
  },
];
export const repositories = [
  {
    name: 'HIL Core',
    category: 'Core',
    description: 'Trust boundaries, event signals, and intervention policies.',
    url: 'https://github.com/Bdna6/hil-guardrail',
  },
  {
    name: 'Claude Code adapter',
    category: 'Adapter',
    description: 'The existing hook integration in the HIL repository.',
    url: 'https://github.com/Bdna6/hil-guardrail',
  },
  {
    name: 'HIL Web',
    category: 'Web',
    description: 'The configuration interface and this browser-local demo.',
    url: 'https://github.com/Bdna6/hil-guardrail',
  },
  {
    name: 'Codex adapter',
    category: 'Adapter',
    description: 'Planned integration; no separate repository is configured.',
    url: null,
  },
];
const KEY = 'hil.workspace.demo.v1';
export const defaults = () => ({
  active: 'build',
  enabled: false,
  configs: Object.fromEntries(
    modes.map((m) => [
      m.id,
      {
        resources: true,
        scope: true,
        handover: true,
        summary: true,
        acknowledge: m.id !== 'build',
        context: true,
      },
    ]),
  ),
  appearance: 'light',
  density: 'comfortable',
  reduceMotion: false,
  range: 7,
});
export function loadDemo() {
  const value = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw || typeof raw !== 'object') return value;
    if (modes.some((m) => m.id === raw.active)) value.active = raw.active;
    if (typeof raw.enabled === 'boolean') value.enabled = raw.enabled;
    for (const mode of modes)
      for (const key of Object.keys(value.configs[mode.id]))
        if (typeof raw.configs?.[mode.id]?.[key] === 'boolean')
          value.configs[mode.id][key] = raw.configs[mode.id][key];
    if (['light', 'dark', 'system'].includes(raw.appearance)) value.appearance = raw.appearance;
    if (['comfortable', 'compact'].includes(raw.density)) value.density = raw.density;
    if (typeof raw.reduceMotion === 'boolean') value.reduceMotion = raw.reduceMotion;
    if ([7, 30, 90].includes(raw.range)) value.range = raw.range;
  } catch {
    /* Invalid browser data falls back to explicit defaults. */
  }
  return value;
}
export function persistDemo(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}
export function resetDemo() {
  localStorage.removeItem(KEY);
  return defaults();
}

// A fixed fictional timeline. No device activity is collected.
export const sampleEvents = Array.from({ length: 90 }, (_, day) => {
  const date = new Date(Date.UTC(2026, 9, 30 - day));
  return Array.from({ length: 1 + (day % 4) }, (_, session) => {
    const mode = modes[(day + session) % 3].id;
    return Array.from({ length: 1 + ((day + session) % 3) }, (_, checkpoint) => ({
      day,
      session: `${day}-${session}`,
      mode,
      boundary: boundaries[(day + checkpoint) % 3].name,
      outcome: ['Reviewed', 'Acknowledged', 'Recorded'][(day + session + checkpoint) % 3],
      time: `${date.toISOString().slice(0, 10)} ${String(9 + session).padStart(2, '0')}:${String(checkpoint * 15).padStart(2, '0')}`,
    }));
  }).flat();
}).flat();
export function usageFor(days) {
  const events = sampleEvents.filter((e) => e.day < days);
  const bins = days === 7 ? 7 : 10;
  const activity = Array.from({ length: bins }, (_, i) => {
    const oldest = days - Math.floor((i * days) / bins) - 1,
      newest = days - Math.floor(((i + 1) * days) / bins);
    return {
      label: days === 7 ? `Oct ${30 - oldest}` : `Days ${days - oldest}–${days - newest}`,
      count: events.filter((e) => e.day >= newest && e.day <= oldest).length,
    };
  });
  return {
    events,
    activity,
    sessions: new Set(events.map((e) => e.session)).size,
    checkpoints: events.length,
    reviews: events.filter((e) => e.outcome === 'Reviewed').length,
    distribution: modes.map((m) => ({ ...m, count: events.filter((e) => e.mode === m.id).length })),
  };
}
