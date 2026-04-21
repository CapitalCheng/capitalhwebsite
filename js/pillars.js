/**
 * Capital H — Pillars Animation
 * High-resolution serif Roman numerals I, II, III formed by small red dots
 * rising from a continuous pool of gray chaos dots.
 *
 * Continuity fix: each dot's settleTimer is pre-offset on spawn so peels
 * are always rolling — never all dots settled simultaneously, so there is
 * always a subset rising from the bottom at any point in time.
 *
 * Optimisations:
 *  - Starts only when pillar scrolls into view (IntersectionObserver)
 *  - Pauses when card leaves viewport (CPU/battery)
 *  - Throttles to 30fps on low-end devices (hardwareConcurrency <= 4)
 *  - ResizeObserver handles mobile layout and orientation changes
 *
 * Expects:  .pillar cards with .pillar-num children
 * Load via: <script src="js/pillars.js"></script>
 */
(function () {

  const pillars = document.querySelectorAll('.pillar');
  if (!pillars.length) return;

  const LOW_END  = (navigator.hardwareConcurrency || 8) <= 4;
  const FRAME_MS = LOW_END ? 1000 / 30 : 0;

  const CTA          = [148, 52, 36];
  const CHAOS_COL    = [115, 113, 111];
  const NUMERAL_H    = 72;
  const NUMERAL_ROWS = 17;
  const DOT_R  = (NUMERAL_H / NUMERAL_ROWS) / 2 * 0.82;
  const GAP    = (NUMERAL_H / NUMERAL_ROWS) - DOT_R * 2;
  const STEP   = DOT_R * 2 + GAP;

  function makeNumeral(stemCols, serifRanges, totalCols) {
    return Array.from({ length: NUMERAL_ROWS }, (_, r) => {
      const row = new Array(totalCols).fill(0);
      const isSerif = r < 2 || r >= NUMERAL_ROWS - 2;
      if (isSerif) {
        serifRanges.forEach(({ from, to }) => {
          for (let c = from; c <= to; c++) row[c] = 1;
        });
      } else {
        stemCols.forEach(c => { row[c] = 1; });
      }
      return row;
    });
  }

  const GLYPHS = [
    makeNumeral([2, 3],             [{ from:0, to:5 }],                                            6),
    makeNumeral([2, 3, 9, 10],      [{ from:0, to:5 }, { from:7,  to:12 }],                       13),
    makeNumeral([2, 3, 9, 10, 16, 17], [{ from:0, to:5 }, { from:7, to:12 }, { from:14, to:19 }], 20),
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
    const cols  = glyph[0].length;

    const litPixels = [];
    for (let r = 0; r < glyph.length; r++)
      for (let c = 0; c < cols; c++)
        if (glyph[r][c]) litPixels.push({ r, c });

    // Extra dots beyond numeral targets — these also cycle through the
    // rise→seek→settle→peel loop, keeping additional gray dots visible
    const EXTRA = 20;

    const RISING  = 0, SEEKING = 1, SETTLED = 2, PEELING = 3;

    let W, H, targets = [], dots = [];
    let gT = 0, lastTs = null, lastFrameTs = 0;
    let running = false, started = false, visible = false;

    function buildTargets() {
      const gW = cols * STEP;
      const ox = W / 2 - gW / 2 + DOT_R, oy = 22;
      targets = litPixels.map(({ r, c }) => ({
        x: ox + c * STEP, y: oy + r * STEP, occupied: false,
      }));
    }

    function getFreeTidx() {
      const free = targets.map((_, i) => i).filter(i => !targets[i].occupied);
      return free.length
        ? free[Math.floor(Math.random() * free.length)]
        : Math.floor(Math.random() * targets.length);
    }

    function spawnRiser(d, tidx) {
      d.x         = 8 + Math.random() * (W - 16);
      d.y         = H + 4 + Math.random() * 16;
      d.vx        = (Math.random() - 0.5) * 0.4;
      d.vy        = -(0.45 + Math.random() * 0.8);
      d.baseAlpha = 0.6 + Math.random() * 0.3;
      d.state     = RISING; d.order = 0; d.life = 0;
      d.riseTime  = 1.2 + Math.random() * 2.0;
      d.pull      = 0.14 + Math.random() * 0.08;
      d.phase     = Math.random() * Math.PI * 2;
      d.tidx      = tidx;
      d.target    = targets[tidx];
      d.settleTimer    = 0;
      d.maxSettleTime  = 6 + Math.random() * 8;
      d.peelTimer      = 0;
      d.maxPeelTime    = 1.0 + Math.random() * 0.8;
    }

    function buildDots() {
      const total = targets.length + EXTRA;
      dots = Array.from({ length: total }, (_, i) => {
        const tidx = i < targets.length ? i : getFreeTidx();
        const d = {};
        spawnRiser(d, tidx);
        // Spread initial y so they don't all arrive at the same time
        d.y = H + 4 + Math.random() * (H * 0.8);
        d.riseTime += i * 0.025;

        // KEY FIX: pre-offset settleTimer randomly across the full window
        // so that at any given moment, dots are at different stages of their
        // cycle — some just arrived, some mid-settle, some about to peel.
        // This prevents the "all settled at once → all quiet" pause.
        d._settleOffset = Math.random() * (6 + Math.random() * 8);

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
      if (!visible) return;
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
          d.vy *= 0.994;
          d.vx += (Math.random() - 0.5) * 0.02; d.vx *= 0.98;
          if (d.x < 6)   d.vx += 0.12;
          if (d.x > W-6) d.vx -= 0.12;
          if (d.life > d.riseTime) d.state = SEEKING;

        } else if (d.state === SEEKING) {
          const tgt = d.target;
          const tx = tgt.x - d.x, ty = tgt.y - d.y;
          const dist = Math.sqrt(tx*tx + ty*ty);
          const prox = clamp(1 - dist / 160, 0, 1);
          const pull = clamp(prox * 2.8 + 0.3, 0, 1);
          d.vx += tx * d.pull * pull; d.vy += ty * d.pull * pull;
          const s2 = Math.sqrt(d.vx*d.vx + d.vy*d.vy);
          if (s2 < 0.3) { d.vx *= 0.3/s2; d.vy *= 0.3/s2; }
          d.vx *= 0.89; d.vy *= 0.89;
          d.x += d.vx; d.y += d.vy;
          d.order = clamp(d.order + prox * dt * 3.5, 0, 1);
          if (dist < DOT_R * 0.9) {
            d.state = SETTLED; d.x = tgt.x; d.y = tgt.y;
            d.order = 1; tgt.occupied = true;
            // Apply pre-offset so this dot peels at a staggered time
            d.settleTimer = d._settleOffset || 0;
          }

        } else if (d.state === SETTLED) {
          d.settleTimer += dt;
          d.x = d.target.x + Math.sin(gT * 0.6 + d.phase) * 0.2;
          d.y = d.target.y + Math.cos(gT * 0.5 + d.phase) * 0.2;
          d.order = 1;
          if (d.settleTimer > d.maxSettleTime) {
            d.target.occupied = false;
            d.state = PEELING; d.peelTimer = 0;
            const a = Math.random() * Math.PI * 2;
            d.vx = Math.cos(a) * (0.2 + Math.random() * 0.3);
            d.vy = Math.sin(a) * (0.2 + Math.random() * 0.3);
          }

        } else { // PEELING
          d.peelTimer += dt;
          d.x += d.vx; d.y += d.vy;
          d.vx *= 0.95; d.vy *= 0.95;
          d.order = clamp(1 - d.peelTimer / d.maxPeelTime, 0, 1);
          if (d.peelTimer > d.maxPeelTime) spawnRiser(d, d.tidx);
        }

        const [r, g, b] = lerpCol(CHAOS_COL, CTA, d.order);
        const alpha = d.baseAlpha * (
          d.state === RISING  ? clamp(d.life / 0.4, 0, 1) * 0.70 :
          d.state === PEELING ? 0.55 * d.order :
          0.55 + d.order * 0.45
        );
        const radius =
          d.state === SETTLED ? DOT_R :
          d.state === RISING  ? DOT_R * 0.75 :
          d.state === PEELING ? DOT_R * d.order :
          DOT_R * (0.55 + d.order * 0.35);

        ctx.beginPath();
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      });
    }

    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 80);
    });
    ro.observe(pillarEl);

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