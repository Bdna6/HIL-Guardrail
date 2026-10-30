import {
  boundaries,
  checkpoints,
  loadDemo,
  modes,
  persistDemo,
  repositories,
  resetDemo,
  usageFor,
} from './demo-state.js';
import { circularLogo } from './logo.js';
import { modeLettering } from './mode-lettering.js';

export function mountDemo(root, connection = null) {
  document.documentElement.lang = 'en';
  let state = connection?.state ?? loadDemo(),
    editing = state.active,
    draft = { ...state.configs[editing] },
    tab = 'modes',
    category = 'All',
    message = '';
  const pages = ['dashboard', 'settings', 'usage', 'open-source'];
  let displayedPage, displayedTab, displayedMode;
  const media = matchMedia('(prefers-color-scheme: dark)'),
    motion = matchMedia('(prefers-reduced-motion: reduce)');
  const dirty = () => JSON.stringify(draft) !== JSON.stringify(state.configs[editing]);
  const modeName = (id) => modes.find((m) => m.id === id)?.name;
  const route = () => location.pathname.replace(/\/$/, '').split('/').at(-1);
  function persist() {
    if (connection) {
      message = 'Saving local configuration…';
      connection
        .save(state)
        .then(() => {
          message = 'Saved locally · applies on the next user message';
          render();
        })
        .catch((error) => {
          message = `Not saved: ${error.message}. Reload to recover current settings.`;
          render();
        });
      return;
    }
    try {
      persistDemo(state);
      message = 'Saved in this browser';
    } catch {
      message = 'Browser storage is unavailable. Changes are temporary.';
    }
  }
  function apply() {
    const el = root.querySelector('.demo-app');
    if (!el) return;
    el.dataset.theme =
      state.appearance === 'system' ? (media.matches ? 'dark' : 'light') : state.appearance;
    el.dataset.density = state.density;
    el.dataset.motion = state.reduceMotion || motion.matches ? 'reduce' : 'full';
    document.documentElement.style.colorScheme = el.dataset.theme;
  }
  function heading(label, title, description, extra = '') {
    return `<div class="demo-heading"><div><p class="demo-kicker">${label}</p><h1>${title}</h1><p>${description}</p></div>${extra}</div>`;
  }
  function render() {
    const page = pages.includes(route()) ? route() : 'dashboard';
    const previousAngles = new Map(
      [...root.querySelectorAll('.radial-mode')].map((label) => {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(label).transform);
        return [
          label.querySelector('input').value,
          (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
        ];
      }),
    );
    const previousSelection = root
      .querySelector('.demo-nav [aria-current]')
      ?.getBoundingClientRect();
    const pageChanged = displayedPage !== page;
    const tabChanged = page === 'settings' && displayedTab !== tab;
    document.title = `HIL · ${page === 'open-source' ? 'Open Source' : page[0].toUpperCase() + page.slice(1)} demo`;
    root.innerHTML = `<div class="demo-app"><a class="demo-skip" href="#demo-main">Skip to content</a><header class="demo-nav"><a class="demo-brand" href="/" aria-label="HIL website">${circularLogo('demo-brand-logo')}<strong>HIL</strong></a><nav aria-label="Workspace">${pages.map((p) => `<a href="/demo/${p}" ${p === page ? 'aria-current="page"' : ''}>${p === 'open-source' ? 'Open Source' : p[0].toUpperCase() + p.slice(1)}</a>`).join('')}</nav><span class="demo-badge">Demo workspace</span></header><main id="demo-main" class="demo-main" tabindex="-1"><div class="demo-context"><a href="/">← Back to website</a><span>Explore with sample data. Changes stay in this browser.</span></div>${page === 'dashboard' ? dashboard() : page === 'settings' ? settings() : page === 'usage' ? usage() : openSource()}<p class="demo-feedback" role="status" aria-live="polite">${message}</p></main><footer class="demo-footer"><span>HUMAN IN THE LOOP</span><span>Local adapter: Not connected</span></footer><dialog class="demo-reset"><h2>Reset this demo?</h2><p>This clears only the demo configuration and preferences saved in this browser.</p><div class="demo-button-row"><button data-action="cancel-reset">Cancel</button><button class="demo-primary" data-action="confirm-reset">Reset demo</button></div></dialog></div>`;
    if (connection) {
      root.querySelectorAll('a[href^="/demo/"]').forEach((a) => {
        a.setAttribute('href', a.getAttribute('href').replace('/demo/', '/local/'));
      });
      root.querySelector('.demo-badge').textContent = 'Local workspace';
      root.querySelector('.demo-context > span').textContent =
        `HIL v${connection.status.version ?? '?'} · ${connection.status.running ? 'Service online' : 'Service offline'} · semantic ${connection.status.semantic ?? 'unavailable'}`;
      root.querySelector('.demo-footer > span:last-child').textContent =
        `Claude Code: ${connection.status.sessions?.length ?? 0} observed session(s)`;
      const status = root.querySelector('.demo-adapter');
      if (status)
        status.textContent = `HIL ${connection.status.running ? 'background service online' : 'background service offline'} · configured mode: ${modeName(state.active)} · ${state.enabled ? 'Enabled' : 'Disabled'} · revision ${connection.status.revision ?? '?'} (session confirmation in CLI)`;
      const description = root.querySelector('.demo-heading > div > p:last-child');
      if (description)
        description.textContent =
          'Settings are stored by your local HIL service. Work and learning stay in Claude Code.';
      const goalSection = root.querySelector('.demo-settings-columns');
      if (goalSection) {
        const note = root.querySelector('.demo-panel > .demo-caption');
        if (note)
          note.textContent =
            'Local configuration — applied by Claude Code hooks. Semantic checks require a configured evaluator.';
        const label = document.createElement('label');
        label.className = 'local-goal';
        label.textContent = 'Project goal / constraints (optional)';
        const input = document.createElement('textarea');
        input.rows = 2;
        input.maxLength = 2000;
        input.value = connection.goal;
        input.placeholder = 'For example: local-only app, no paid services.';
        input.addEventListener('change', () => {
          connection.goal = input.value;
          persist();
        });
        label.append(input);
        goalSection.before(label);
      }
      const reset = root.querySelector('.demo-reset-area');
      if (reset) reset.remove();
    }
    apply();
    bind();
    const angleFor = (index, active) => {
      const selected = modes.findIndex((mode) => mode.id === active);
      const offset = (index - selected + modes.length) % modes.length;
      return (offset === 2 ? -1 : offset) * 34;
    };
    root.querySelectorAll('.radial-mode').forEach((label, index) => {
      const angle = angleFor(index, state.active);
      label.style.transform = `rotate(${angle}deg)`;
      if (
        displayedPage === 'dashboard' &&
        displayedMode &&
        displayedMode !== state.active &&
        !state.reduceMotion &&
        !motion.matches
      ) {
        const start = previousAngles.get(modes[index].id) ?? angleFor(index, displayedMode);
        let end = angle;
        while (end < start - 0.1) end += 360;
        const frames = Array.from({ length: 81 }, (_, step) => {
          const rotation = start + ((end - start) * step) / 80;
          const facing = Math.cos((rotation * Math.PI) / 180);
          const fade = Math.max(0, Math.min(1, (facing - 0.05) / 0.4));
          return {
            transform: `rotate(${rotation}deg)`,
            opacity: fade * fade * (3 - 2 * fade),
          };
        });
        label.animate(frames, {
          duration: end - start > 180 ? 660 : 480,
          easing: 'cubic-bezier(.25,.6,.25,1)',
        });
      }
    });
    displayedMode = state.active;
    if (!state.reduceMotion && !motion.matches) {
      if (pageChanged) {
        const content = root.querySelector('#demo-main');
        content.animate(
          [
            { opacity: 0, transform: 'translateY(12px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 340, easing: 'cubic-bezier(.2,.7,.2,1)' },
        );
        const selected = root.querySelector('.demo-nav [aria-current]');
        if (selected && previousSelection) {
          const next = selected.getBoundingClientRect();
          selected.animate(
            [
              {
                transform: `translateX(${previousSelection.x - next.x}px) scaleX(${previousSelection.width / next.width})`,
              },
              { transform: 'translateX(0) scaleX(1)' },
            ],
            { duration: 360, easing: 'cubic-bezier(.22,.8,.25,1)', pseudoElement: '::before' },
          );
        }
      } else if (tabChanged) {
        root.querySelector('.demo-panel')?.animate(
          [
            { opacity: 0, transform: 'translateY(7px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 260, easing: 'ease-out' },
        );
      }
    }
    displayedPage = page;
    displayedTab = tab;
  }
  function dashboard() {
    const current = modes.find((mode) => mode.id === state.active);
    return `${heading('01 / YOUR WORKFLOW', 'Your mode. Your boundaries.', 'Choose your mode, then set HIL on or off.')}<div class="demo-mode-stage"><fieldset class="demo-radial-modes"><legend class="demo-sr">Collaboration mode</legend><span class="radial-origin" aria-hidden="true"></span>${modes.map((m) => `<label class="radial-mode ${state.active === m.id ? 'is-selected' : ''}"><input type="radio" name="active-mode" value="${m.id}" ${state.active === m.id ? 'checked' : ''}><span class="demo-sr">${m.name} mode</span><span class="radial-word" aria-hidden="true">${modeLettering(m.id)}</span></label>`).join('')}</fieldset><section class="demo-current-mode" aria-label="Current mode"><p class="demo-kicker">CURRENT MODE</p><h2>${current.name}<span>mode</span></h2><p class="current-mode-description">${current.description}</p><label class="demo-power"><span class="power-off">Off</span><input id="hil-enabled" type="checkbox" role="switch" aria-label="Enable HIL in this demo" ${state.enabled ? 'checked' : ''}><span class="demo-power-track" aria-hidden="true"></span><span class="power-on">On</span></label><a class="demo-mode-customize" href="/demo/settings#${state.active}">Customize settings ↗</a></section></div><p class="demo-adapter"><span aria-hidden="true">○</span> Local adapter: <strong>Not connected</strong><span>Mode and switch are demo preferences only.</span></p>`;
  }
  function toggle(item) {
    return `<label class="demo-toggle-row"><span><strong>${item.name}</strong><small>${item.description}</small></span><input type="checkbox" data-config="${item.id}" ${draft[item.id] ? 'checked' : ''}><span class="demo-toggle" aria-hidden="true"></span></label>`;
  }
  function settings() {
    return `${heading('02 / MAKE IT YOURS', 'Small settings. Meaningful boundaries.', 'Configure the demo without changing your local Agent.')}<div class="demo-tabs" role="group" aria-label="Settings section"><button data-tab="modes" aria-pressed="${tab === 'modes'}">Modes & boundaries</button><button data-tab="appearance" aria-pressed="${tab === 'appearance'}">Appearance & preferences</button></div>${tab === 'modes' ? `<section class="demo-panel"><div class="demo-editor-heading"><label>Editing mode<select id="editing-mode">${modes.map((m) => `<option value="${m.id}" ${m.id === editing ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label><span>Active mode: <strong>${modeName(state.active)}</strong></span></div><p class="demo-caption">Example configuration — local enforcement is not connected.</p><div class="demo-settings-columns"><div><h2>Boundaries</h2>${boundaries.map(toggle).join('')}</div><div><h2>At checkpoints</h2>${checkpoints.map(toggle).join('')}</div></div><div class="demo-save"><span id="demo-dirty" role="status">${dirty() ? 'Unsaved changes' : 'No unsaved changes'}</span><div class="demo-button-row"><button data-action="discard" ${dirty() ? '' : 'disabled'}>Discard changes</button><button class="demo-primary" data-action="save" ${dirty() ? '' : 'disabled'}>Save changes</button></div></div></section>` : `<section class="demo-panel demo-preferences"><label>Appearance<select data-preference="appearance">${['light', 'dark', 'system'].map((v) => `<option value="${v}" ${state.appearance === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></label><label>Interface density<select data-preference="density">${['comfortable', 'compact'].map((v) => `<option value="${v}" ${state.density === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></label><label class="demo-toggle-row"><span><strong>Reduce motion</strong><small>Reduce interface animation. System preferences are always respected.</small></span><input type="checkbox" data-preference="reduceMotion" ${state.reduceMotion ? 'checked' : ''}><span class="demo-toggle" aria-hidden="true"></span></label></section>`}<section class="demo-reset-area"><div><h2>A fresh start</h2><p>Restore this demo’s defaults. Your account and other browser data stay untouched.</p></div><button data-action="reset">Reset demo</button></section>`;
  }
  function usage() {
    const data = usageFor(state.range),
      max = Math.max(...data.activity.map((b) => b.count));
    return `${heading('03 / SAMPLE ACTIVITY', 'Your collaboration at a glance.', 'A fictional timeline, not activity collected from your devices.', `<label class="demo-range">Time range<select id="usage-range">${[7, 30, 90].map((d) => `<option value="${d}" ${state.range === d ? 'selected' : ''}>${d} days</option>`).join('')}</select></label>`)}<span class="demo-sample">Sample data · ending Oct 30, 2026</span><div class="demo-metrics">${[
      ['Sessions', data.sessions],
      ['Checkpoints', data.checkpoints],
      ['Human reviews', data.reviews],
    ]
      .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
      .join(
        '',
      )}</div><div class="demo-chart-layout"><section class="demo-panel"><div class="demo-section-title"><h2>Checkpoint activity</h2><span>Sample / ${state.range} days</span></div><svg class="demo-chart" viewBox="0 0 620 250" role="img" aria-label="${data.checkpoints} sample checkpoints over ${state.range} days"><path d="M20 210H610 M20 110H610 M20 10H610" class="demo-grid-line"/>${data.activity
      .map((b, i) => {
        const w = 580 / data.activity.length,
          x = 25 + i * w,
          h = (180 * b.count) / max;
        return `<g tabindex="0" role="img" aria-label="${b.label}: ${b.count} sample checkpoints"><title>${b.label}: ${b.count} checkpoints</title><rect x="${x}" y="${210 - h}" width="${w - 14}" height="${h}" rx="5"/><text x="${x + (w - 14) / 2}" y="${200 - h}" text-anchor="middle">${b.count}</text><text x="${x + (w - 14) / 2}" y="233" text-anchor="middle">${i + 1}</text></g>`;
      })
      .join(
        '',
      )}</svg><p class="demo-caption">${data.checkpoints} checkpoints across ${data.sessions} sessions; ${data.reviews} marked Reviewed. Each bar is ${state.range === 7 ? 'one day' : 'a consecutive three-day or nine-day group'}.</p><details><summary>Read chart data</summary><ul>${data.activity.map((b) => `<li>${b.label}: ${b.count} checkpoints</li>`).join('')}</ul></details></section><section class="demo-panel"><h2>Mode distribution</h2><p class="demo-caption">Share of sample checkpoints</p>${data.distribution.map((m, i) => `<div class="demo-distribution"><div><span>${m.name}</span><strong>${Math.round((m.count / data.checkpoints) * 100)}%</strong></div><meter class="distribution-${i}" min="0" max="${data.checkpoints}" value="${m.count}" aria-label="${m.name}: ${m.count} sample checkpoints"></meter><small>${m.count} checkpoints</small></div>`).join('')}</section></div><section class="demo-panel demo-recent"><div class="demo-section-title"><h2>Recent activity</h2><span>Sample data</span></div><div class="demo-table-wrap"><table><caption class="demo-sr">Recent fictional checkpoint events</caption><thead><tr><th scope="col">Time</th><th scope="col">Mode</th><th scope="col">Boundary</th><th scope="col">Outcome</th></tr></thead><tbody>${data.events
      .slice(0, 8)
      .map(
        (e) =>
          `<tr><td>${e.time}</td><td>${modeName(e.mode)}</td><td>${e.boundary}</td><td>${e.outcome}</td></tr>`,
      )
      .join('')}</tbody></table></div></section>`;
  }
  function openSource() {
    return `${heading('04 / OPEN SOURCE', 'Built in the open.', 'One HIL repository, with distinct responsibilities.')}<div class="demo-filter" role="group" aria-label="Filter components">${['All', 'Core', 'Adapter', 'Web'].map((c) => `<button data-category="${c}" aria-pressed="${category === c}">${c}</button>`).join('')}</div><section class="demo-repositories" aria-label="HIL components">${repositories
      .filter((r) => category === 'All' || r.category === category)
      .map(
        (r) =>
          `<article><span class="demo-repo-icon" aria-hidden="true">↳</span><div><span class="demo-kicker">${r.category}</span><h2>${r.name}</h2><p>${r.description}</p></div>${r.url ? `<a href="${r.url}" target="_blank" rel="noopener noreferrer">Project repository ↗<span class="demo-sr"> — ${r.name}, opens in a new tab</span></a>` : '<span class="demo-caption">Repository link coming soon</span>'}</article>`,
      )
      .join(
        '',
      )}</section><p class="demo-caption">Components in the same project share its repository link; these are not separate releases.</p>`;
  }
  function updateDirty() {
    root.querySelector('#demo-dirty').textContent = dirty()
      ? 'Unsaved changes'
      : 'No unsaved changes';
    root.querySelectorAll('[data-action="save"],[data-action="discard"]').forEach((b) => {
      b.disabled = !dirty();
    });
  }
  function abandon() {
    return !dirty() || confirm('Discard unsaved mode settings?');
  }
  function navigate(url) {
    if (!abandon()) return;
    history.pushState(null, '', url);
    editing = state.active;
    draft = { ...state.configs[editing] };
    if (location.hash && modes.some((m) => `#${m.id}` === location.hash)) {
      editing = location.hash.slice(1);
      draft = { ...state.configs[editing] };
      tab = 'modes';
    }
    message = '';
    render();
  }
  function bind() {
    root.querySelector('#hil-enabled')?.addEventListener('change', (event) => {
      state.enabled = event.target.checked;
      persist();
      render();
      root.querySelector('#hil-enabled')?.focus({ preventScroll: true });
    });
    root.querySelectorAll('a[href^="/demo/"], a[href^="/local/"]').forEach(
      (a) =>
        void a.addEventListener('click', (e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          navigate(a.getAttribute('href'));
        }),
    );
    root.querySelectorAll('input[name="active-mode"]').forEach(
      (el) =>
        void el.addEventListener('change', () => {
          if (!abandon()) {
            render();
            return;
          }
          state.active = el.value;
          editing = state.active;
          draft = { ...state.configs[editing] };
          persist();
          render();
          root.querySelector(`input[value="${state.active}"]`)?.focus();
        }),
    );
    root.querySelectorAll('[data-tab]').forEach(
      (el) =>
        void el.addEventListener('click', () => {
          tab = el.dataset.tab;
          render();
        }),
    );
    root.querySelector('#editing-mode')?.addEventListener('change', (e) => {
      if (!abandon()) {
        e.target.value = editing;
        return;
      }
      editing = e.target.value;
      draft = { ...state.configs[editing] };
      message = '';
      render();
    });
    root.querySelectorAll('[data-config]').forEach(
      (el) =>
        void el.addEventListener('change', () => {
          draft[el.dataset.config] = el.checked;
          message = '';
          updateDirty();
        }),
    );
    root.querySelectorAll('[data-preference]').forEach(
      (el) =>
        void el.addEventListener('change', () => {
          state[el.dataset.preference] = el.type === 'checkbox' ? el.checked : el.value;
          persist();
          apply();
          root.querySelector('.demo-feedback').textContent = message;
        }),
    );
    root.querySelector('#usage-range')?.addEventListener('change', (e) => {
      state.range = Number(e.target.value);
      persist();
      render();
    });
    root.querySelectorAll('[data-category]').forEach(
      (el) =>
        void el.addEventListener('click', () => {
          category = el.dataset.category;
          render();
        }),
    );
    root.querySelectorAll('[data-action]').forEach(
      (el) =>
        void el.addEventListener('click', () => {
          const a = el.dataset.action;
          if (a === 'save') {
            state.configs[editing] = { ...draft };
            persist();
            render();
          }
          if (a === 'discard') {
            draft = { ...state.configs[editing] };
            message = 'Changes discarded';
            render();
          }
          if (a === 'reset') {
            root.querySelector('dialog').showModal();
          }
          if (a === 'cancel-reset') root.querySelector('dialog').close();
          if (a === 'confirm-reset') {
            try {
              state = resetDemo();
              editing = state.active;
              draft = { ...state.configs[editing] };
              message = 'Demo reset';
              render();
            } catch {
              root.querySelector('dialog p').textContent =
                'Browser storage could not be cleared. Please try again.';
            }
          }
        }),
    );
    root.querySelectorAll('a[href="/"]').forEach(
      (a) =>
        void a.addEventListener('click', (e) => {
          if (!abandon()) e.preventDefault();
        }),
    );
    const dialog = root.querySelector('dialog');
    dialog.onclose = () => root.querySelector('[data-action="reset"]')?.focus();
    dialog.onclick = (e) => {
      if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
          dialog.close();
      }
    };
  }
  window.addEventListener('popstate', () => {
    message = '';
    render();
  });
  window.addEventListener('beforeunload', (e) => {
    if (dirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  media.addEventListener('change', apply);
  motion.addEventListener('change', apply);
  if (location.hash && modes.some((m) => `#${m.id}` === location.hash))
    editing = location.hash.slice(1);
  draft = { ...state.configs[editing] };
  render();
}
