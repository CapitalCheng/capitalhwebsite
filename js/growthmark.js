/**
 * Capital H — Growthmark Animation
 * Hockey-stick dot array anchored to the red full stop in each .stat-card.
 *
 * Optimisations:
 *  - Only starts when .stat-row scrolls into view (IntersectionObserver)
 *  - Pauses when off-screen to save CPU/battery
 *  - Throttles to 30fps on low-end devices (hardwareConcurrency <= 4)
 *  - ResizeObserver reinitialises on layout change (mobile, orientation)
 *
 * Expects:  .stat-row, .stat-num span
 * Load via: <script src="js/growthmark.js"></script>
 */
(function () {

  const statRow = document.querySelector('.stat-row');
  if (!statRow) return;

  document.querySelectorAll('.stat-num span').forEach(el => {
    el.style.visibility = 'hidden';
  });

  statRow.style.position = 'relative';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:hidden;';
  statRow.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;

  // ── Performance ───────────────────────────────────────────────
  const LOW_END  = (navigator.hardwareConcurrency || 8) <= 4;
  const FRAME_MS = LOW_END ? 1000 / 30 : 0;
  let visible    = false;
  let started    = false;
  let running    = false;
  let lastFrameTs = 0;

  // ── Colours ───────────────────────────────────────────────────
  const CTA       = [148, 52, 36];
  const CHAOS_COL = [120, 118, 116];
  const GRAY_DOT  = [130, 128, 126];
  const COL_HEIGHTS = [1, 2, 3, 5, 7];

  let W, H, CX, CY;
  let DOT_R = 3, SPACING = 9;
  let anchors = [], dots = [];
  let lastTs = null, gT = 0;

  const CHAOS = 0, SEEKING = 1, SETTLED = 2;

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lerpCol(a, b, t) {
    t = clamp(t, 0, 1);
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  function buildTargets() {
    const targets = [];
    const rowRect = statRow.getBoundingClientRect();
    anchors = [];
    const tileW = rowRect.width / 2;

    document.querySelectorAll('.stat-num span').forEach(span => {
      const sr       = span.getBoundingClientRect();
      const fontSize = parseFloat(getComputedStyle(span).fontSize);
      const maxR     = tileW / 60;
      DOT_R   = clamp(fontSize * 0.07, 2.0, maxR);
      SPACING = DOT_R * 2 + 2;

      const cx = sr.left + sr.width  * 0.5 - rowRect.left;
      const cy = sr.bottom - rowRect.top - fontSize * 0.18;
      anchors.push({ x: cx, y: cy });

      const maxX = (Math.floor(sr.left / tileW) + 1) * tileW - rowRect.left - 8;
      COL_HEIGHTS.forEach((h, ci) => {
        const colX = cx + (ci + 1) * SPACING;
        if (colX > maxX) return;
        for (let ri = 0; ri < h; ri++) {
          targets.push({ x: colX, y: cy - ri * SPACING, col: ci, row: ri });
        }
      });
    });
    return targets;
  }

  function spawnDot(d, tidx, targets) {
    d.x = CX + (Math.random() - 0.5) * 28;
    d.y = CY + (Math.random() - 0.5) * 28;
    const angle = Math.random() * Math.PI * 2, spd = 1.2 + Math.random() * 2.2;
    d.vx = Math.cos(angle) * spd; d.vy = Math.sin(angle) * spd;
    d.baseAlpha    = 0.75 + Math.random() * 0.2;
    d.state        = CHAOS; d.order = 0; d.life = 0;
    d.chaosTime    = 0.06 + Math.random() * 0.4;
    d.pull         = 0.10 + Math.random() * 0.07;
    d.phase        = Math.random() * Math.PI * 2;
    d.tidx         = tidx;
    d.target       = targets[tidx];
    d.settleTimer  = 0;
    d.maxSettleTime = 5.0 + Math.random() * 3.0;
  }

  function init() {
    const rect = statRow.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width  = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(DPR, DPR);
    CX = W / 2; CY = H / 2;

    const targets = buildTargets();
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

  function tick(ts) {
    requestAnimationFrame(tick);
    if (!visible) return;
    if (FRAME_MS && ts - lastFrameTs < FRAME_MS) return;
    lastFrameTs = ts;

    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts; gT += dt;

    ctx.clearRect(0, 0, W, H);

    anchors.forEach(a => {
      ctx.beginPath();
      ctx.arc(a.x, a.y, DOT_R, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${CTA[0]},${CTA[1]},${CTA[2]})`;
      ctx.fill();
    });

    dots.forEach(d => {
      d.age += dt;
      if (d.age < 0) return;
      d.life += dt;

      if (d.state === CHAOS) {
        d.vx += (Math.random() - 0.5) * 0.16; d.vy += (Math.random() - 0.5) * 0.16;
        const spd = Math.sqrt(d.vx*d.vx + d.vy*d.vy);
        if (spd > 3.2) { d.vx *= 3.2/spd; d.vy *= 3.2/spd; }
        if (spd < 0.8) { d.vx *= 0.8/spd; d.vy *= 0.8/spd; }
        d.x += d.vx; d.y += d.vy;
        if (d.x < 4)   d.vx += 0.4; if (d.x > W-4) d.vx -= 0.4;
        if (d.y < 4)   d.vy += 0.4; if (d.y > H-4) d.vy -= 0.4;
        if (d.life > d.chaosTime) d.state = SEEKING;

      } else if (d.state === SEEKING) {
        const tgt = d.target;
        const tx = tgt.x - d.x, ty = tgt.y - d.y;
        const dist = Math.sqrt(tx*tx + ty*ty);
        const prox = clamp(1 - dist / 280, 0, 1);
        const pullStr = clamp(prox * 2.4 + 0.2, 0, 1);
        d.vx += tx * d.pull * pullStr; d.vy += ty * d.pull * pullStr;
        const s2 = Math.sqrt(d.vx*d.vx + d.vy*d.vy);
        if (s2 < 0.5) { d.vx *= 0.5/s2; d.vy *= 0.5/s2; }
        d.vx *= 0.93; d.vy *= 0.93;
        d.x += d.vx; d.y += d.vy;
        d.order = clamp(d.order + prox * dt * 2.0, 0, 1);
        if (dist < DOT_R * 0.8) {
          d.state = SETTLED; d.x = tgt.x; d.y = tgt.y; d.order = 1;
        }

      } else {
        d.settleTimer += dt;
        const tgt = d.target;
        d.x = tgt.x + Math.sin(gT * 0.6 + d.phase) * 0.3;
        d.y = tgt.y + Math.cos(gT * 0.5 + d.phase) * 0.3;
        d.order = 1;
        if (d.settleTimer > d.maxSettleTime) spawnDot(d, d.tidx, d._targets);
      }

      const [r, g, b] = lerpCol(CHAOS_COL, CTA, d.order);
      const alpha  = d.baseAlpha * (d.state === CHAOS ? 0.5 : 0.4 + d.order * 0.6);
      const radius = DOT_R * (d.state === CHAOS ? 0.5 : 0.65 + d.order * 0.35);
      ctx.beginPath();
      ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
    });

    const pulse = (Math.sin(gT * 2.0) * 0.5 + 0.5);
    ctx.beginPath();
    ctx.arc(CX, CY, 1.8 + pulse * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${GRAY_DOT[0]},${GRAY_DOT[1]},${GRAY_DOT[2]},${0.25 + pulse * 0.25})`;
    ctx.fill();
  }

  // ── ResizeObserver ────────────────────────────────────────────
  let resizeTimer = null;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      init();
      if (!running) { running = true; requestAnimationFrame(tick); }
    }, 120);
  });
  ro.observe(statRow);

  // ── IntersectionObserver — start + pause/resume ───────────────
  const io = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible && !started) {
      started = true;
      setTimeout(() => { init(); if (!running) { running = true; requestAnimationFrame(tick); } }, 200);
    }
  }, { threshold: 0 });
  io.observe(statRow);

})();