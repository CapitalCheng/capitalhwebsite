/**
 * Capital H — Pillars Animation (v2)
 * Roman numerals I, II, III formed by red dots rising from chaos.
 *
 * Behaviour:
 *  - Animation does NOT start until the pillar card scrolls into view
 *  - On entry: dense wave of gray dots rise from the bottom simultaneously
 *  - Every dot has a fixed target position in the numeral — no wandering, no fading
 *  - Dots linger rising before being pulled in, then hold their position
 *  - Settled dots occasionally peel off and immediately respawn as fresh risers
 *    that snap back into place — numeral always fully legible
 *
 * Expects:  .pillar cards with .pillar-num children
 * Load via: <script src="js/pillars.js"></script>
 */
(function () {

  const pillars = document.querySelectorAll('.pillar');
  if (!pillars.length) return;

  const CTA       = [148, 52, 36];
  const CHAOS_COL = [115, 113, 111];
  const DOT_R     = 1.6;
  const GAP       = 1.6;
  const STEP      = DOT_R * 2 + GAP;

  // ── Serif numeral grids ───────────────────────────────────────
  // 9 rows: row 0 = top serif, rows 1–7 = stem, row 8 = bottom serif
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

  // ── Per-pillar init ───────────────────────────────────────────
  function initPillar(pillarEl, glyphIdx) {

    // Hide existing number label
    const numEl = pillarEl.querySelector('.pillar-num');
    if (numEl) numEl.style.visibility = 'hidden';

    // Inject canvas behind content
    pillarEl.style.position = 'relative';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:hidden;';
    pillarEl.insertBefore(canvas, pillarEl.firstChild);

    const ctx  = canvas.getContext('2d');
    const DPR  = window.devicePixelRatio || 1;
    const glyph    = GLYPHS[glyphIdx];
    const gridRows = glyph.length;
    const gridCols = glyph[0].length;

    const litPixels = [];
    for (let r = 0; r < gridRows; r++)
      for (let c = 0; c < gridCols; c++)
        if (glyph[r][c]) litPixels.push({ r, c });

    // Extra cycler dots — more than target count to ensure dense chaos visible
    // before enough dots reach their targets
    const EXTRA = 28;

    const RISING  = 0; // rising from bottom, not yet seeking
    const SEEKING = 1; // gravitating toward target
    const SETTLED = 2; // locked in position, shimmering
    const PEELING = 3; // briefly drifting before respawning

    let W, H, targets = [], dots = [];
    let gT = 0, lastTs = null, running = false, started = false;

    function buildTargets() {
      const glyphW  = gridCols * STEP;
      const originX = W / 2 - glyphW / 2 + DOT_R;
      const originY = 22; // top of card
      targets = litPixels.map(({ r, c }) => ({
        x: originX + c * STEP,
        y: originY + r * STEP,
        occupied: false,
      }));
    }

    function getFreeTidx() {
      const free = targets.map((_, i) => i).filter(i => !targets[i].occupied);
      if (!free.length) return Math.floor(Math.random() * targets.length);
      return free[Math.floor(Math.random() * free.length)];
    }

    // Spawn dot — rises from bottom, lingers before being pulled in
    function spawnDot(d, tidx) {
      // Stagger spawn x across full card width for visual spread
      d.x  = 8 + Math.random() * (W - 16);
      d.y  = H + 6 + Math.random() * 24;
      d.vx = (Math.random() - 0.5) * 0.5;
      d.vy = -(0.6 + Math.random() * 1.0); // gentler rise — lingers longer

      d.baseAlpha     = 0.65 + Math.random() * 0.25;
      d.state         = RISING;
      d.order         = 0;
      d.life          = 0;

      // How long it rises freely before seeking — longer = more chaos visible
      d.riseTime      = 0.8 + Math.random() * 1.4;

      d.pull          = 0.13 + Math.random() * 0.09;
      d.phase         = Math.random() * Math.PI * 2;
      d.tidx          = tidx;
      d.target        = targets[tidx];
      d.settleTimer   = 0;
      d.maxSettleTime = 5 + Math.random() * 7;
      d.peelTimer     = 0;
      d.maxPeelTime   = 0.3 + Math.random() * 0.3;
    }

    function buildDots() {
      const total = targets.length + EXTRA;
      dots = Array.from({ length: total }, (_, i) => {
        const tidx = i < targets.length ? i : getFreeTidx();
        const d = {};
        spawnDot(d, tidx);
        // Stagger initial y so they don't all appear at once
        d.y -= Math.random() * H * 0.6;
        return d;
      });
    }

    function resize() {
      const rect = pillarEl.getBoundingClientRect();
      W = rect.width; H = rect.height;
      canvas.width  = W * DPR; canvas.height = H * DPR;
      canvas.style.width  = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(DPR, DPR);
      buildTargets();
      if (!started) return; // don't build dots until scroll-triggered
      buildDots();
    }

    function start() {
      if (started) return;
      started = true;
      buildDots();
      if (!running) {
        running = true;
        requestAnimationFrame(tick);
      }
    }

    function tick(ts) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts; gT += dt;

      ctx.clearRect(0, 0, W, H);

      dots.forEach(d => {
        d.life += dt;

        if (d.state === RISING) {
          // Rise freely — gentle upward drift, slight horizontal wander
          d.x += d.vx;
          d.y += d.vy;
          d.vy *= 0.992; // slow deceleration so they float and linger
          d.vx += (Math.random() - 0.5) * 0.03;
          d.vx *= 0.98;
          // Soft horizontal walls
          if (d.x < 6)   { d.vx += 0.2; }
          if (d.x > W-6) { d.vx -= 0.2; }
          // Transition to seeking after riseTime
          if (d.life > d.riseTime) d.state = SEEKING;

        } else if (d.state === SEEKING) {
          const tgt = d.target;
          const tx  = tgt.x - d.x, ty = tgt.y - d.y;
          const dist = Math.sqrt(tx * tx + ty * ty);
          const prox = clamp(1 - dist / 180, 0, 1);
          const pullStr = clamp(prox * 2.6 + 0.25, 0, 1);
          d.vx += tx * d.pull * pullStr;
          d.vy += ty * d.pull * pullStr;
          const s2 = Math.sqrt(d.vx * d.vx + d.vy * d.vy);
          if (s2 < 0.35) { d.vx *= 0.35 / s2; d.vy *= 0.35 / s2; }
          d.vx *= 0.90; d.vy *= 0.90;
          d.x += d.vx; d.y += d.vy;
          d.order = clamp(d.order + prox * dt * 3.0, 0, 1);
          if (dist < DOT_R * 0.85) {
            d.state = SETTLED;
            d.x = tgt.x; d.y = tgt.y;
            d.order = 1;
            tgt.occupied = true;
          }

        } else if (d.state === SETTLED) {
          d.settleTimer += dt;
          const tgt = d.target;
          d.x = tgt.x + Math.sin(gT * 0.7 + d.phase) * 0.3;
          d.y = tgt.y + Math.cos(gT * 0.5 + d.phase) * 0.3;
          d.order = 1;
          if (d.settleTimer > d.maxSettleTime) {
            tgt.occupied = false;
            d.state = PEELING;
            d.peelTimer = 0;
            const angle = Math.random() * Math.PI * 2;
            d.vx = Math.cos(angle) * (0.4 + Math.random() * 0.6);
            d.vy = Math.sin(angle) * (0.4 + Math.random() * 0.6);
          }

        } else { // PEELING — very brief, then immediately respawns as riser
          d.peelTimer += dt;
          d.x += d.vx; d.y += d.vy;
          d.vx *= 0.94; d.vy *= 0.94;
          d.order = clamp(d.order - dt * 4.0, 0, 1);
          if (d.peelTimer > d.maxPeelTime) {
            spawnDot(d, getFreeTidx());
          }
        }

        // Draw
        const [r, g, b] = lerpCol(CHAOS_COL, CTA, d.order);
        const alpha = d.baseAlpha * (
          d.state === RISING  ? clamp(d.life / 0.3, 0, 1) * 0.75 :
          d.state === PEELING ? 0.3 + d.order * 0.4 :
          0.5 + d.order * 0.5
        );
        const radius = DOT_R * (
          d.state === RISING  ? 0.7 :
          d.state === PEELING ? 0.55 + d.order * 0.35 :
          0.8 + d.order * 0.2
        );

        ctx.beginPath();
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      });

      requestAnimationFrame(tick);
    }

    // ── ResizeObserver ────────────────────────────────────────────
    let resizeTimer = null;
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 80);
    });
    ro.observe(pillarEl);

    // ── IntersectionObserver — only start when scrolled into view ─
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          start();
          io.unobserve(pillarEl); // fire once
        }
      });
    }, { threshold: 0.15 });
    io.observe(pillarEl);

    // Initial size measurement (dots not built yet)
    setTimeout(resize, 80);
  }

  // Boot each pillar independently with a small stagger
  pillars.forEach((pillarEl, i) => {
    if (i > 2) return;
    setTimeout(() => initPillar(pillarEl, i), i * 200);
  });

})();