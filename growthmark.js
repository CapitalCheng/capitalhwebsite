/**
 * Capital H — Growthmark Animation
 * Chaos-to-order: dots spawn from canvas center, seek precise
 * grid positions forming a hockey-stick dot array anchored to
 * the red full stop in each .stat-card.
 *
 * Expects:
 *   - .stat-row          — the 2×2 grid container (canvas is injected here)
 *   - .stat-num span     — the red full stop in each card (4 total)
 *
 * The HTML spans are hidden via CSS; canvas owns the full stop rendering.
 *
 * Column heights [1, 2, 3, 5, 7] form a hockey stick growing
 * upward and to the right from each full stop anchor.
 */
(function () {

  const statRow = document.querySelector('.stat-row');
  if (!statRow) return;

  // ── Hide HTML full stops — canvas owns them ───────────────────
  document.querySelectorAll('.stat-num span').forEach(el => {
    el.style.visibility = 'hidden';
  });

  // ── Inject canvas over the stat-row ──────────────────────────
  statRow.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';
  statRow.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;

  // ── Colours ───────────────────────────────────────────────────
  const CTA       = [148, 52, 36];
  const CHAOS_COL = [120, 118, 116];
  const GRAY_DOT  = [130, 128, 126];

  // ── Hockey stick column heights ───────────────────────────────
  // Col 0 = static full stop (not animated)
  // Cols 1–5 = animated dots growing right and up
  const COL_HEIGHTS = [1, 2, 3, 5, 7];

  // ── State ─────────────────────────────────────────────────────
  let W, H, CX, CY;
  let DOT_R   = 3;
  let SPACING = 9;
  let anchors = [];   // [{x, y}] center of each full stop, one per card
  let dots    = [];
  let lastTs  = null;
  let gT      = 0;

  const CHAOS = 0, SEEKING = 1, SETTLED = 2;

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

  // ── Build target grid ─────────────────────────────────────────
  // Each card gets a hockey-stick dot grid anchored to its full stop
  function buildTargets() {
    const targets  = [];
    const rowRect  = statRow.getBoundingClientRect();
    anchors = [];

    document.querySelectorAll('.stat-num span').forEach(span => {
      const sr       = span.getBoundingClientRect();
      const fontSize = parseFloat(getComputedStyle(span).fontSize);

      // Dot radius matches the visual weight of the Cormorant period
      DOT_R   = Math.max(2.5, fontSize * 0.07);
      SPACING = DOT_R * 2 + 3;

      // Center of the period glyph
      const cx = sr.left + sr.width  * 0.5 - rowRect.left;
      const cy = sr.bottom - rowRect.top - fontSize * 0.18;

      anchors.push({ x: cx, y: cy });

      // Animated columns: offset by one SPACING step from the static dot
      COL_HEIGHTS.forEach((h, ci) => {
        for (let ri = 0; ri < h; ri++) {
          targets.push({
            x:   cx + (ci + 1) * SPACING,
            y:   cy - ri * SPACING,
            col: ci,
            row: ri,
          });
        }
      });
    });

    return targets;
  }

  // ── Dot lifecycle ─────────────────────────────────────────────
  function spawnDot(d, tidx, targets) {
    // All dots spawn from canvas center — chaos radiates outward
    d.x = CX + (Math.random() - 0.5) * 28;
    d.y = CY + (Math.random() - 0.5) * 28;

    const angle = Math.random() * Math.PI * 2;
    const spd   = 1.2 + Math.random() * 2.2;
    d.vx = Math.cos(angle) * spd;
    d.vy = Math.sin(angle) * spd;

    d.baseAlpha    = 0.75 + Math.random() * 0.2;
    d.state        = CHAOS;
    d.order        = 0;
    d.life         = 0;
    d.chaosTime    = 0.06 + Math.random() * 0.4;
    d.pull         = 0.10 + Math.random() * 0.07;
    d.phase        = Math.random() * Math.PI * 2;
    d.tidx         = tidx;
    d.target       = targets[tidx];
    d.settleTimer  = 0;
    d.maxSettleTime = 5.0 + Math.random() * 3.0;
  }

  // ── Initialise ────────────────────────────────────────────────
  function init() {
    const rect = statRow.getBoundingClientRect();
    W = rect.width;
    H = rect.height;

    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(DPR, DPR);

    CX = W / 2;
    CY = H / 2;

    const targets = buildTargets();
    const total   = targets.length;

    // Stagger spawn so shape builds left → right
    dots = targets.map((tgt, i) => {
      const colStagger = tgt.col / (COL_HEIGHTS.length - 1);
      const rowStagger = tgt.row / 7;
      const stagger    = (colStagger * 0.7 + rowStagger * 0.3) * 5;
      const d = { age: -stagger, _targets: targets };
      spawnDot(d, i, targets);
      d.age = -stagger;
      return d;
    });
  }

  // ── Render loop ───────────────────────────────────────────────
  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    gT += dt;

    ctx.clearRect(0, 0, W, H);

    // Draw static full stops — canvas owns these
    anchors.forEach(a => {
      ctx.beginPath();
      ctx.arc(a.x, a.y, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${CTA[0]},${CTA[1]},${CTA[2]})`;
      ctx.fill();
    });

    // Animate dots
    dots.forEach(d => {
      d.age += dt;
      if (d.age < 0) return;
      d.life += dt;

      if (d.state === CHAOS) {
        d.vx += (Math.random() - 0.5) * 0.16;
        d.vy += (Math.random() - 0.5) * 0.16;
        const spd = Math.sqrt(d.vx*d.vx + d.vy*d.vy);
        if (spd > 3.2) { d.vx *= 3.2/spd; d.vy *= 3.2/spd; }
        if (spd < 0.8) { d.vx *= 0.8/spd; d.vy *= 0.8/spd; }
        d.x += d.vx; d.y += d.vy;
        if (d.x < 4)   d.vx += 0.4;
        if (d.x > W-4) d.vx -= 0.4;
        if (d.y < 4)   d.vy += 0.4;
        if (d.y > H-4) d.vy -= 0.4;
        if (d.life > d.chaosTime) d.state = SEEKING;

      } else if (d.state === SEEKING) {
        const tgt  = d.target;
        const tx   = tgt.x - d.x, ty = tgt.y - d.y;
        const dist = Math.sqrt(tx*tx + ty*ty);
        const prox = clamp(1 - dist / 280, 0, 1);
        const pullStr = clamp(prox * 2.4 + 0.2, 0, 1);
        d.vx += tx * d.pull * pullStr;
        d.vy += ty * d.pull * pullStr;
        const s2 = Math.sqrt(d.vx*d.vx + d.vy*d.vy);
        if (s2 < 0.5) { d.vx *= 0.5/s2; d.vy *= 0.5/s2; }
        d.vx *= 0.93; d.vy *= 0.93;
        d.x += d.vx; d.y += d.vy;
        d.order = clamp(d.order + prox * dt * 2.0, 0, 1);
        if (dist < DOT_R * 0.8) {
          d.state = SETTLED;
          d.x = tgt.x; d.y = tgt.y;
          d.order = 1;
        }

      } else {
        d.settleTimer += dt;
        const tgt = d.target;
        // Tiny breathing shimmer when settled
        d.x = tgt.x + Math.sin(gT * 0.6 + d.phase) * 0.3;
        d.y = tgt.y + Math.cos(gT * 0.5 + d.phase) * 0.3;
        d.order = 1;
        if (d.settleTimer > d.maxSettleTime) {
          spawnDot(d, d.tidx, d._targets);
        }
      }

      const [r, g, b] = lerpCol(CHAOS_COL, CTA, d.order);
      const alpha  = d.baseAlpha * (d.state === CHAOS ? 0.5 : 0.4 + d.order * 0.6);
      const radius = DOT_R * (d.state === CHAOS ? 0.5 : 0.65 + d.order * 0.35);

      ctx.beginPath();
      ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
    });

    // Subtle gray pulsing source at center
    const pulse = (Math.sin(gT * 2.0) * 0.5 + 0.5);
    ctx.beginPath();
    ctx.arc(CX, CY, 1.8 + pulse * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${GRAY_DOT[0]},${GRAY_DOT[1]},${GRAY_DOT[2]},${0.25 + pulse * 0.25})`;
    ctx.fill();

    requestAnimationFrame(tick);
  }

  // ── Boot — wait for layout to settle ─────────────────────────
  setTimeout(() => {
    init();
    requestAnimationFrame(tick);
  }, 200);

})();