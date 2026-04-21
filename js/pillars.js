/**
 * Capital H — Pillars Animation
 * Roman numerals I, II, III formed by dots rising from chaos.
 *
 * Optimisations:
 *  - Does NOT start until pillar scrolls into view (IntersectionObserver)
 *  - Pauses when card leaves viewport to save CPU/battery
 *  - Throttles to 30fps on low-end devices (hardwareConcurrency <= 4)
 *  - ResizeObserver handles mobile layout and orientation changes
 *
 * Expects:  .pillar cards with .pillar-num children
 * Load via: <script src="js/pillars.js"></script>
 */
(function () {

  const pillars = document.querySelectorAll('.pillar');
  if (!pillars.length) return;

  // ── Performance — shared across all pillars ───────────────────
  const LOW_END  = (navigator.hardwareConcurrency || 8) <= 4;
  const FRAME_MS = LOW_END ? 1000 / 30 : 0;

  const CTA   = [148, 52, 36];
  const CHAOS = [115, 113, 111];
  const DOT_R = 1.6;
  const GAP   = 1.6;
  const STEP  = DOT_R * 2 + GAP;

  // ── Serif numeral grids ───────────────────────────────────────
  function makeNumeral(stems, serifs, totalCols) {
    return Array.from({ length: 9 }, (_, r) => {
      const row = new Array(totalCols).fill(0);
      if (r === 0 || r === 8) {
        serifs.forEach(({ from, to }) => { for (let c = from; c <= to; c++) row[c] = 1; });
      } else {
        stems.forEach(c => { row[c] = 1; });
      }
      return row;
    });
  }

  const GLYPHS = [
    makeNumeral([1],       [{ from:0, to:2 }],                                       3),
    makeNumeral([1, 5],    [{ from:0, to:2 }, { from:4, to:6 }],                     7),
    makeNumeral([1, 5, 9], [{ from:0, to:2 }, { from:4, to:6 }, { from:8, to:10 }], 11),
  ];

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lerpCol(a, b, t) {
    t = clamp(t, 0, 1);
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  // ── Per-pillar initialiser ────────────────────────────────────
  function initPillar(pillarEl, glyphIdx) {

    const numEl = pillarEl.querySelector('.pillar-num');
    if (numEl) numEl.style.visibility = 'hidden';

    pillarEl.style.position = 'relative';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:hidden;';
    pillarEl.insertBefore(canvas, pillarEl.firstChild);

    const ctx   = canvas.getContext('2d');
    const DPR   = window.devicePixelRatio || 1;
    const glyph = GLYPHS[glyphIdx];

    const litPixels = [];
    for (let r = 0; r < glyph.length; r++)
      for (let c = 0; c < glyph[0].length; c++)
        if (glyph[r][c]) litPixels.push({ r, c });

    const BENCH   = 22;
    const RISING  = 0, SEEKING = 1, SETTLED = 2, PEELING = 3;

    let W, H, targets = [], dots = [];
    let gT = 0, lastTs = null;
    let running = false, started = false, visible = false;
    let lastFrameTs = 0;

    function buildTargets() {
      const gW = glyph[0].length * STEP;
      const ox = W / 2 - gW / 2 + DOT_R, oy = 22;
      targets = litPixels.map(({ r, c }) => ({
        x: ox + c * STEP, y: oy + r * STEP, occupied: false,
      }));
    }

    function getFreeTidx() {
      const free = targets.map((_, i) => i).filter(i => !targets[i].occupied);
      return free.length ? free[Math.floor(Math.random() * free.length)] : Math.floor(Math.random() * targets.length);
    }

    function spawnRiser(d, tidx) {
      d.x         = 8 + Math.random() * (W - 16);
      d.y         = H + 6 + Math.random() * 20;
      d.vx        = (Math.random() - 0.5) * 0.45;
      d.vy        = -(0.55 + Math.random() * 0.9);
      d.baseAlpha = 0.65 + Math.random() * 0.25;
      d.state     = RISING; d.order = 0; d.life = 0;
      d.riseTime  = 1.0 + Math.random() * 1.6;
      d.pull      = 0.13 + Math.random() * 0.09;
      d.phase     = Math.random() * Math.PI * 2;
      d.tidx      = tidx; d.target = targets[tidx];
      d.settleTimer    = 0;
      d.maxSettleTime  = 3 + Math.random() * 5;
      d.peelTimer      = 0;
      d.maxPeelTime    = 0.25 + Math.random() * 0.25;
    }

    function buildDots() {
      dots = Array.from({ length: targets.length + BENCH }, (_, i) => {
        const tidx = i < targets.length ? i : getFreeTidx();
        const d = {};
        spawnRiser(d, tidx);
        d.y = H + 6 + Math.random() * (H * 0.8);
        d.riseTime += i * 0.04;
        return d;
      });
    }

    function resize() {
      const rect = pillarEl.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width  = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(DPR, DPR);
      buildTargets();
      if (started) buildDots();
    }

    function start() {
      if (started) return;
      started = true;
      buildDots();
      if (!running) { running = true; requestAnimationFrame(tick); }
    }

    function tick(ts) {
      requestAnimationFrame(tick);

      // Pause when off-screen
      if (!visible) return;

      // Throttle on low-end
      if (FRAME_MS && ts - lastFrameTs < FRAME_MS) return;
      lastFrameTs = ts;

      if (!lastTs) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts; gT += dt;

      ctx.clearRect(0, 0, W, H);

      dots.forEach(d => {
        d.life += dt;

        if (d.state === RISING) {
          d.x += d.vx; d.y += d.vy;
          d.vy *= 0.993;
          d.vx += (Math.random() - 0.5) * 0.025; d.vx *= 0.98;
          if (d.x < 6) d.vx += 0.15; if (d.x > W-6) d.vx -= 0.15;
          if (d.life > d.riseTime) d.state = SEEKING;

        } else if (d.state === SEEKING) {
          const tgt = d.target;
          const tx = tgt.x - d.x, ty = tgt.y - d.y;
          const dist = Math.sqrt(tx*tx + ty*ty);
          const prox = clamp(1 - dist / 180, 0, 1);
          const pull = clamp(prox * 2.6 + 0.25, 0, 1);
          d.vx += tx * d.pull * pull; d.vy += ty * d.pull * pull;
          const s2 = Math.sqrt(d.vx*d.vx + d.vy*d.vy);
          if (s2 < 0.35) { d.vx *= 0.35/s2; d.vy *= 0.35/s2; }
          d.vx *= 0.90; d.vy *= 0.90;
          d.x += d.vx; d.y += d.vy;
          d.order = clamp(d.order + prox * dt * 3.0, 0, 1);
          if (dist < DOT_R * 0.85) {
            d.state = SETTLED; d.x = tgt.x; d.y = tgt.y; d.order = 1; tgt.occupied = true;
          }

        } else if (d.state === SETTLED) {
          d.settleTimer += dt;
          const tgt = d.target;
          d.x = tgt.x + Math.sin(gT * 0.7 + d.phase) * 0.3;
          d.y = tgt.y + Math.cos(gT * 0.5 + d.phase) * 0.3;
          d.order = 1;
          if (d.settleTimer > d.maxSettleTime) {
            tgt.occupied = false;
            d.state = PEELING; d.peelTimer = 0;
            const angle = Math.random() * Math.PI * 2;
            d.vx = Math.cos(angle) * (0.3 + Math.random() * 0.5);
            d.vy = Math.sin(angle) * (0.3 + Math.random() * 0.5);
          }

        } else {
          d.peelTimer += dt;
          d.x += d.vx; d.y += d.vy;
          d.vx *= 0.94; d.vy *= 0.94;
          d.order = clamp(d.order - dt * 5.0, 0, 1);
          if (d.peelTimer > d.maxPeelTime) spawnRiser(d, getFreeTidx());
        }

        const [r, g, b] = lerpCol(CHAOS, CTA, d.order);
        const alpha = d.baseAlpha * (
          d.state === RISING  ? clamp(d.life / 0.35, 0, 1) * 0.72 :
          d.state === PEELING ? 0.28 + d.order * 0.4 :
          0.5 + d.order * 0.5
        );
        const radius = DOT_R * (
          d.state === RISING  ? 0.68 :
          d.state === PEELING ? 0.5 + d.order * 0.4 :
          0.82 + d.order * 0.18
        );
        ctx.beginPath();
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      });
    }

    // ── ResizeObserver ────────────────────────────────────────────
    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 80);
    });
    ro.observe(pillarEl);

    // ── IntersectionObserver — start + pause/resume ───────────────
    const io = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) start();
    }, { threshold: 0.15 });
    io.observe(pillarEl);

    setTimeout(resize, 80);
  }

  pillars.forEach((pillarEl, i) => {
    if (i > 2) return;
    setTimeout(() => initPillar(pillarEl, i), i * 200);
  });

})();