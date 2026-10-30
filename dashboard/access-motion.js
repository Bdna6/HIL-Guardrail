// Persistent groups fly into three rows. Their loop phase is never reset at arrival.
export function createComposition(root, copy) {
  const opening = root.querySelector('.opening');
  const intro = root.querySelector('.introduction');
  const logo = root.querySelector('.background-emblem');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const layer = document.createElement('div');
  layer.className = 'composition-text';
  layer.setAttribute('aria-hidden', 'true');
  root.querySelector('.access').append(layer);
  const rows = copy.sequence.map(() => ({ copies: [], phase: 0 }));
  const speeds = [52, 36, 24];
  const pauses = new Set();
  const duration = 2050;
  let geometry,
    progress = 0,
    flight,
    frame,
    last = performance.now();
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp = (t) => Math.min(1, Math.max(0, t));
  const cubic = (a, b, c, d, t) =>
    (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;

  function measure() {
    const oldHidden = [opening.hidden, intro.hidden];
    opening.hidden = false;
    intro.hidden = false;
    const transform = intro.style.transform;
    intro.style.transform = 'none';
    const lane = root.querySelector('.sequence-space').getBoundingClientRect();
    const starts = [...opening.querySelectorAll('h1 span')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, size: parseFloat(getComputedStyle(el).fontSize) };
    });
    const fonts = [
      Math.min(49.4, Math.max(28.8, innerWidth * 0.039)),
      Math.min(37.2, Math.max(19.2, innerWidth * 0.026)),
      Math.min(22.6, Math.max(12, innerWidth * 0.0156)),
    ];
    const canvas = document.createElement('canvas').getContext('2d');
    let y = lane.y + 10;
    const metrics = rows.map((row, i) => {
      const size = fonts[i];
      canvas.font = `700 ${size}px Arial`;
      const width =
        canvas.measureText(copy.sequence[i]).width -
        (copy.sequence[i].length - 1) * size * 0.025 +
        64;
      const count = Math.ceil(innerWidth / width) + 2;
      while (row.copies.length < count) {
        const el = document.createElement('span');
        layer.append(el);
        row.copies.push(el);
      }
      row.phase %= width;
      const result = { size, width, y };
      y += size * 1.12 + 15;
      return result;
    });
    // Read the untransformed logo geometry to preserve one persistent emblem.
    const oldLogoTransform = logo.style.transform;
    logo.style.transform = 'none';
    const emblem = logo.getBoundingClientRect();
    logo.style.transform = oldLogoTransform;
    geometry = { starts, metrics, emblem, centerY: (lane.y + y) / 2 };
    intro.style.transform = transform;
    [opening.hidden, intro.hidden] = oldHidden;
  }

  function draw() {
    const { starts, metrics, emblem, centerY } = geometry;
    rows.forEach((row, i) => {
      const start = starts[i],
        end = metrics[i];
      // Small formation stagger, with an identical landing time for all groups.
      const delay = i * 0.018,
        t = clamp((progress - delay) / (1 - delay));
      const endX = -row.phase;
      let x, y, scale, z;
      if (t < 0.25) {
        const u = smooth(t / 0.25);
        x = mix(start.x, start.x - innerWidth * 0.15, u);
        y = mix(start.y, start.y - 70, u);
        scale = mix(1, 0.34, u);
        z = mix(0, -200, u);
      } else if (t < 0.56) {
        const u = (t - 0.25) / 0.31;
        x = cubic(
          start.x - innerWidth * 0.15,
          -innerWidth * 0.12,
          innerWidth * 0.55,
          innerWidth + 80,
          u,
        );
        y = cubic(start.y - 70, -120, -150, 20 + i * 24, u);
        scale = mix(0.34, 2.35, smooth(u));
        z = mix(-200, 280, smooth(u));
      } else {
        const u = (t - 0.56) / 0.44;
        const tailSeconds = (duration * (1 - delay) * 0.44) / 1000;
        x = cubic(
          innerWidth + 80,
          innerWidth * 1.15,
          endX + (speeds[i] * tailSeconds) / 3,
          endX,
          u,
        );
        y = cubic(20 + i * 24, 30, end.y, end.y, u);
        scale = mix(2.35, end.size / start.size, smooth(u));
        z = mix(280, 0, smooth(u));
      }
      const closePass = Math.exp(-(((t - 0.55) / 0.065) ** 2));
      row.copies.forEach((span, k) => {
        const text = t < 0.55 ? copy.opening[i] : copy.sequence[i];
        if (span.textContent !== text) span.textContent = text;
        const spacing = mix(-0.055, -0.025, smooth(t));
        span.style.cssText = `font-size:${start.size}px;letter-spacing:${start.size * spacing}px;transform:translate3d(${x + k * end.width}px,${y}px,${z}px) scale(${scale}) rotateZ(${Math.sin(t * Math.PI) * (i - 1) * 2}deg);opacity:${k === 0 ? 1 : clamp((t - 0.65) / 0.2)};filter:blur(${closePass * 3}px);text-shadow:0 ${Math.sin(t * Math.PI) * 9}px ${Math.sin(t * Math.PI) * 20}px #00000020`;
      });
    });
    opening.style.opacity = String(1 - clamp(progress * 3));
    intro.style.opacity = String(clamp((progress - 0.7) / 0.3));
    intro.style.transform = `translateY(${(1 - smooth(progress)) * 70}px)`;
    // First descend at the original size; only then move to the right-edge background.
    const descent = smooth(clamp(progress / 0.32));
    const expand = smooth(clamp((progress - 0.32) / 0.68));
    const diameter = innerHeight * (innerWidth < 600 ? 0.85 : 1.05);
    const dx = innerWidth - emblem.x - emblem.width / 2;
    const dy = centerY - emblem.y - emblem.height / 2;
    const drop = innerHeight * 0.14;
    logo.style.transform = `translate(${dx * expand}px,${mix(drop * descent, dy, expand)}px) scale(${mix(1, diameter / emblem.width, expand)})`;
    logo.style.opacity = String(mix(1, 0.22, expand));
    logo.style.filter = `blur(${(expand * 10) / mix(1, diameter / emblem.width, expand)}px)`;
    layer.style.transform = `translateY(${-intro.scrollTop * progress}px)`;
  }
  function tick(now) {
    const dt = Math.min(50, now - last);
    last = now;
    if (flight) {
      const f = flight,
        u = clamp((now - f.start) / duration);
      progress = f.next ? u : 1 - u;
      if (u === 1) {
        flight = null;
        f.resolve();
      }
    } else if (progress === 1 && !pauses.size && !reduced.matches)
      rows.forEach(
        (row, i) => (row.phase = (row.phase + (dt * speeds[i]) / 1000) % geometry.metrics[i].width),
      );
    draw();
    frame =
      flight || (progress === 1 && !pauses.size && !reduced.matches)
        ? requestAnimationFrame(tick)
        : null;
  }
  function run() {
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  function resize() {
    measure();
    draw();
  }
  window.addEventListener('resize', resize);
  document.fonts?.ready.then(resize);
  intro.addEventListener('scroll', draw, { passive: true });
  reduced.addEventListener('change', () => {
    if (reduced.matches && flight) {
      progress = flight.next ? 1 : 0;
      flight.resolve();
      flight = null;
    }
    run();
  });
  measure();
  draw();
  return {
    pause(reason, paused) {
      paused ? pauses.add(reason) : pauses.delete(reason);
      run();
    },
    transition(next) {
      measure();
      if (reduced.matches) {
        progress = next ? 1 : 0;
        draw();
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        flight = { next, start: performance.now(), resolve };
        run();
      });
    },
  };
}
