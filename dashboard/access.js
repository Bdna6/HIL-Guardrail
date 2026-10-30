import { circularLogo } from './logo.js';
import { createComposition } from './access-motion.js';
export const copy = {
  name: 'Human in the loop',
  mark: 'HIL',
  opening: ['UNDERSTAND.', 'DECIDE.', 'STAY IN THE LOOP.'],
  heading: ['Let agents work.', 'Keep human judgment.'],
  eyebrow: 'YOUR AGENT WORKFLOW. YOUR BOUNDARIES.',
  description:
    'HIL runs locally in the background, supporting informed human–agent collaboration within your existing workflow.',
  support: 'Click to explore demo',
  sequence: [
    'YOUR AGENT WORKFLOW. YOUR BOUNDARIES. YOUR AI GUARDRAILS',
    'Delegate your works with all your decisions. Stay involved where it matters. Keep your thinking in the loop.',
    'MINDFUL DELEGATION / INFORMED COLLABORATION MODES / STAY IN THE LOOP',
  ],
};
export function mountAccess(root) {
  document.documentElement.lang = 'en';
  root.tabIndex = -1;
  root.innerHTML = `<main class="access"><header>${copy.name}<span class="header-emblem">${circularLogo('header-logo', false)}</span></header><section class="opening"><h1>${copy.opening.map((t) => `<span>${t}</span>`).join('')}</h1><p>LOCAL GUARDRAILS FOR HUMAN–AGENT COLLABORATION</p><button class="explore">SCROLL TO EXPLORE ↓</button></section><section class="introduction" hidden><div class="intro-content"><h2 class="sr-only">${copy.heading.join(' ')}</h2><div class="sequence-space"><span class="sr-only">${copy.sequence.map((text) => `<span>${text}</span>`).join('')}</span><button class="sequence-pause" aria-pressed="false">Pause motion</button></div><p class="access-description">${copy.description}</p><a class="access-support demo-entry" href="/demo/dashboard">${copy.support}</a><div class="access-actions"><button data-open="register">Get stared</button></div><small>Save your settings. Bring your boundaries across devices.</small></div></section><div class="background-emblem" aria-hidden="true">${circularLogo('background-logo', true)}</div></main><dialog class="access-dialog"><button class="dialog-close" aria-label="Close dialog">×</button><div id="access-form"></div></dialog>`;
  let second = false,
    busy = false,
    locked = 0,
    startY = 0,
    trigger;
  const intro = root.querySelector('.introduction'),
    opening = root.querySelector('.opening'),
    dialog = root.querySelector('dialog');
  const motion = createComposition(root, copy);
  async function transition(next) {
    if (busy || dialog.open || next === second || Date.now() < locked) return;
    busy = true;
    intro.hidden = false;
    opening.hidden = false;
    intro.inert = true;
    opening.inert = true;
    await motion.transition(next);
    second = next;
    opening.hidden = next;
    intro.hidden = !next;
    intro.inert = !next;
    opening.inert = next;
    busy = false;
    locked = Date.now() + 700;
  }
  const pauseButton = root.querySelector('.sequence-pause');
  pauseButton.onclick = () => {
    const paused = pauseButton.getAttribute('aria-pressed') !== 'true';
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.textContent = paused ? 'Resume motion' : 'Pause motion';
    motion.pause('user', paused);
  };
  root.querySelector('.sequence-space').onmouseenter = () => motion.pause('hover', true);
  root.querySelector('.sequence-space').onmouseleave = () => motion.pause('hover', false);
  root.querySelector('.explore').onclick = () => transition(true);
  root.querySelector('.access').addEventListener(
    'wheel',
    (e) => {
      if (dialog.open) return;
      if (!second || (e.deltaY < 0 && intro.scrollTop <= 0)) {
        e.preventDefault();
        if (Math.abs(e.deltaY) > 12) transition(e.deltaY > 0);
      }
    },
    { passive: false },
  );
  root.querySelector('.access').addEventListener(
    'touchstart',
    (e) => {
      startY = e.touches[0].clientY;
    },
    { passive: true },
  );
  root.querySelector('.access').addEventListener('touchend', (e) => {
    const d = startY - e.changedTouches[0].clientY;
    if (Math.abs(d) > 50 && (!second || (d < 0 && intro.scrollTop <= 0))) transition(d > 0);
  });
  root.onkeydown = (e) => {
    if (dialog.open) return;
    if (['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp'].includes(e.key)) {
      const next = ['ArrowDown', 'PageDown'].includes(e.key);
      if (!second || (!next && intro.scrollTop === 0)) {
        e.preventDefault();
        transition(next);
      }
    }
  };
  function form(register) {
    root.querySelector('#access-form').innerHTML =
      `<h2>${register ? 'Create your HIL account' : 'Welcome back'}</h2>${register ? '<p>Save your modes and boundaries across devices.</p>' : ''}<form><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<div class="password-field"><input name="password" type="password" minlength="8" autocomplete="${register ? 'new-password' : 'current-password'}" required><button type="button" data-show="password">Show</button></div></label>${register ? '<label>Confirm password<input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label>' : ''}<p role="alert" id="access-error"></p><button class="access-submit">${register ? 'Create account' : 'Log in'}</button></form><button class="switch-form">${register ? 'Already have an account? Log in' : 'New to HIL? Sign up'}</button>`;
    root.querySelector('.switch-form').onclick = () => {
      form(!register);
      root.querySelector('input').focus();
    };
    root.querySelector('[data-show]').onclick = (e) => {
      const field = root.querySelector('[name=password]');
      field.type = field.type === 'password' ? 'text' : 'password';
      const confirm = root.querySelector('[name=confirm]');
      if (confirm) confirm.type = field.type;
      e.target.textContent = field.type === 'password' ? 'Show' : 'Hide';
    };
    root.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      root.querySelector('#access-error').textContent =
        register && data.get('password') !== data.get('confirm')
          ? 'Passwords do not match.'
          : 'Authentication is not connected yet.';
    };
  }
  root.querySelectorAll('[data-open]').forEach(
    (b) =>
      (b.onclick = () => {
        trigger = b;
        form(b.dataset.open === 'register');
        intro.style.overflow = 'hidden';
        motion.pause('modal', true);
        dialog.showModal();
      }),
  );
  const close = () => dialog.close();
  root.querySelector('.dialog-close').onclick = close;
  dialog.onclick = (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        close();
    }
  };
  dialog.onclose = () => {
    intro.style.overflow = '';
    motion.pause('modal', false);
    trigger?.focus();
  };
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const fields = [...dialog.querySelectorAll('button, input')].filter((el) => !el.disabled);
    const first = fields[0],
      last = fields.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  root.focus({ preventScroll: true });
}
