/**
 * Capital H — Pillars Animation
 * Rising gray dots converge and turn red, forming serif Roman numerals
 * I, II, III inside each .pillar card. Each pillar is fully isolated —
 * its own canvas, its own animation loop — so mobile single-column
 * layout works identically to desktop three-column.
 *
 * Expects:
 *   - .pillar          — the three pillar cards (3 total)
 *   - .pillar-num      — the existing 01/02/03 label (hidden at runtime)
 *
 * Load via: <script src="js/pillars.js"></script>
 */
(function () {

  const pillars = document.querySelectorAll('.pillar');
  if (!pillars.length) return;

  // ── Colours ───────────────────────────────────────────────────
  const CTA       = [148, 52, 36];
  const CHAOS_COL = [118, 116, 114];

  // ── Dot sizing ────────────────────────────────────────────────
  const DOT_R = 1.6;
  const GAP   = 1.6;
  const STEP  = DOT_R * 2 + GAP;

  // ── Serif numeral pixel grids ─────────────────────────────────
  // 9 rows: row 0 = top serif, rows 1-7 = stem, row 8 = bottom serif
  // Each bar unit = 3 cols wide (serif), 1 col wide (stem)
  // Bars separated by 2-col gap
  function makeNumeral(stems, serifRanges, totalCols) {
    const ROWS = 9;
    return Array.from({ length: ROWS }, (_, r) => {
      const row = new Array(totalCols).fill(0);
      if (r === 0 || r === ROWS - 1) {
        serifRanges.forEach(({ from, to }) => {
          for (let c = from; c <= to; c++) row[c] = 1;
        });
      } else {
        stems.forEach(c => { row[c] = 1; });
      }
      return row;
    });
  }

  const GLYPHS = [
    makeNumeral([1],    [{ from:0, to:2 }],                                  3),
    makeNumeral([1, 5], [{ from:0, to:2 }, { from:4, to:6 }],                7),
    makeNumeral([1, 5, 9], [{ from:0, to:2 }, { from:4, to:6 }, { from:8, to:10 }], 11),
  ];

  // ── Helpers ───────────────────────────────────────────────────
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

    // Hide existing 01/02/03 label — numeral is owned by canvas
    const numEl = pillarEl.querySelector('.pillar-num');
    if (numEl) numEl.style.visibility = 'hidden';

    // Inject canvas
    pillarEl.style.position = 'relative';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
    pillarEl.insertBefore(canvas, pillarEl.firstChild);

    const ctx     = canvas.getContext('2d');
    const DPR     = window.devicePixelRatio || 1;
    const glyph   = GLYPHS[glyphIdx];
    const gridRows = glyph.length;
    const gridCols = glyph[0].length;

    // Collect lit pixel positions
    const litPixels = [];
    for (let r = 0; r < gridRows; r++)
      for (let c = 0; c < gridCols; c++)
        if (glyph[r][c]) litPixels.push({ r, c });

    const EXTRA_CYCLERS = 10; // extra dots cycling to keep motion alive

    const RISING  = 0;
    const SEEKING = 1;
    const SETTLED = 2;
    const PEELING = 3;

    let W, H, targets = [], dots = [];
    let gT = 0, lastTs = null, running = false;

    function buildTargets() {
      const glyphW  = gridCols * STEP;
      // Position numeral in upper portion of card, matching where pillar-num was
      const originX = W / 2 - glyphW / 2 + DOT_R;
      const originY = 22;
      targets = litPixels.map(({ r, c }) => ({
        x: originX + c * STEP,
        y: originY + r * STEP,
        occupied: false,
      }));
    }

    function spawnDot(d, tidx) {
      // Spawn from random position at bottom of card, rise upward
      d.x  = 10 + Math.random() * (W - 20);
      d.y  = H + 6 + Math.random() * 16;
      d.vx = (Math.random() - 0.5) * 0.7;
      d.vy = -(1.0 + Math.random() * 1.6);

      d.baseAlpha     = 0.65 + Math.random() * 0.25;
      d.state         = RISING;
      d.order         = 0;
      d.life          = 0;
      d.riseTime      = 0.2 + Math.random() * 0.4;
      d.pull          = 0.14 + Math.random() * 0.08;
      d.phase         = Math.random() * Math.PI * 2;
      d.tidx          = tidx;
      d.target        = targets[tidx];
      d.settleTimer   = 0;
      d.maxSettleTime = 5 + Math.random() * 8;
      d.peelTimer     = 0;
      d.maxPeelTime   = 0.4 + Math.random() * 0.4;
    }

    function getFreeTidx() {
      const free = targets
        .map((_, i) => i)
        .filter(i => !targets[i].occupied);
      if (!free.length) return Math.floor(Math.random() * targets.length);
      return free[Math.floor(Math.random() * free.length)];
    }

    function resize() {
      const rect = pillarEl.getBoundingClientRect();
      W = rect.width;
      H = rect.height;

      canvas.width  = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(DPR, DPR);

      buildTargets();

      const total = targets.length + EXTRA_CYCLERS;
      dots = Array.from({ length: total }, (_, i) => {
        const tidx = i < targets.length ? i : getFreeTidx();
        const d = {};
        spawnDot(d, tidx);
        d.y -= i * 2.5; // stagger entry
        return d;
      });
    }

    function tick(ts) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      gT += dt;

      ctx.clearRect(0, 0, W, H);

      dots.forEach(d => {
        d.life += dt;

        if (d.state === RISING) {
          d.x += d.vx;
          d.y += d.vy;
          d.vy *= 0.985;
          d.vx *= 0.97;
          if (d.life > d.riseTime) d.state = SEEKING;

        } else if (d.state === SEEKING) {
          const tgt = d.target;
          const tx  = tgt.x - d.x, ty = tgt.y - d.y;
          const dist = Math.sqrt(tx * tx + ty * ty);
          const prox = clamp(1 - dist / 160, 0, 1);
          const pullStr = clamp(prox * 2.4 + 0.2, 0, 1);
          d.vx += tx * d.pull * pullStr;
          d.vy += ty * d.pull * pullStr;
          const s2 = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
          if (s2 < 0.4) { d.vx *= 0.4 / s2; d.vy *= 0.4 / s2; }
          d.vx *= 0.91; d.vy *= 0.91;
          d.x += d.vx; d.y += d.vy;
          d.order = clamp(d.order + prox * dt * 2.8, 0, 1);
          if (dist < DOT_R * 0.9) {
            d.state = SETTLED;
            d.x = tgt.x; d.y = tgt.y;
            d.order = 1;
            tgt.occupied = true;
          }

        } else if (d.state === SETTLED) {
          d.settleTimer += dt;
          const tgt = d.target;
          // Gentle shimmer
          d.x = tgt.x + Math.sin(gT * 0.7 + d.phase) * 0.3;
          d.y = tgt.y + Math.cos(gT * 0.5 + d.phase) * 0.3;
          d.order = 1;
          if (d.settleTimer > d.maxSettleTime) {
            // Free slot and peel off
            tgt.occupied = false;
            d.state = PEELING;
            d.peelTimer = 0;
            const angle = Math.random() * Math.PI * 2;
            d.vx = Math.cos(angle) * (0.5 + Math.random() * 0.8);
            d.vy = Math.sin(angle) * (0.5 + Math.random() * 0.8);
          }

        } else { // PEELING
          d.peelTimer += dt;
          d.vx += (Math.random() - 0.5) * 0.06;
          d.vy += (Math.random() - 0.5) * 0.06;
          d.x += d.vx; d.y += d.vy;
          d.vx *= 0.95; d.vy *= 0.95;
          d.order = clamp(d.order - dt * 3.0, 0, 1);
          if (d.peelTimer > d.maxPeelTime) {
            // Respawn as a fresh rising dot seeking a free target
            spawnDot(d, getFreeTidx());
          }
        }

        // ── Draw ─────────────────────────────────────────────────
        const [r, g, b] = lerpCol(CHAOS_COL, CTA, d.order);
        const alpha = d.baseAlpha * (
          d.state === RISING  ? clamp(d.life / d.riseTime, 0, 1) * 0.75 :
          d.state === PEELING ? 0.25 + d.order * 0.45 :
          0.5 + d.order * 0.5
        );
        const radius = DOT_R * (
          d.state === RISING  ? 0.7 :
          d.state === PEELING ? 0.5 + d.order * 0.4 :
          0.8 + d.order * 0.2
        );

        ctx.beginPath();
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      });

      requestAnimationFrame(tick);
    }

    // ── ResizeObserver — handles mobile layout & orientation ──────
    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        if (!running) { running = true; requestAnimationFrame(tick); }
      }, 80);
    });
    ro.observe(pillarEl);
  }

  // ── Boot each pillar independently ────────────────────────────
  pillars.forEach((pillarEl, i) => {
    if (i > 2) return; // only first three
    setTimeout(() => initPillar(pillarEl, i), i * 250);
  });

})();