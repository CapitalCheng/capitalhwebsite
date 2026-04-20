/**
 * Capital H — Hero Animation
 * Chaos-to-clarity: dots spawn in chaos (left-biased),
 * converge onto a J-curve, and accelerate up the rise.
 *
 * Expects <canvas id="hero-canvas"> in the DOM.
 */
(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const DPR = window.devicePixelRatio || 1;
  const W = 680, H = 400;

  canvas.width  = W * DPR;
  canvas.height = H * DPR;
  canvas.style.height = H + 'px';
  ctx.scale(DPR, DPR);

  // ── Colours ──────────────────────────────────────────────────
  const CTA       = [148, 52, 36];   // brand maroon
  const CHAOS_COL = [105, 103, 101]; // dark gray

  // ── Bezier J-curve ───────────────────────────────────────────
  // Flat section left → smooth elbow → sharp vertical rise right
  const P0 = { x: 82,  y: 338 };
  const P1 = { x: 390, y: 344 };
  const P2 = { x: 516, y: 328 };
  const P3 = { x: 598, y: 68  };

  function bezier(t) {
    const m = 1 - t;
    return {
      x: m*m*m*P0.x + 3*m*m*t*P1.x + 3*m*t*t*P2.x + t*t*t*P3.x,
      y: m*m*m*P0.y + 3*m*m*t*P1.y + 3*m*t*t*P2.y + t*t*t*P3.y,
    };
  }

  // Arc-length reparameterisation so dots move at perceptual even speed
  const RAW = 800;
  const rawPts = Array.from({ length: RAW + 1 }, (_, i) => bezier(i / RAW));
  const arcLen = [0];
  for (let i = 1; i <= RAW; i++) {
    const dx = rawPts[i].x - rawPts[i-1].x;
    const dy = rawPts[i].y - rawPts[i-1].y;
    arcLen.push(arcLen[i-1] + Math.sqrt(dx*dx + dy*dy));
  }
  const totalLen = arcLen[RAW];

  function curvePt(s) {
    const tgt = s * totalLen;
    let lo = 0, hi = RAW;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (arcLen[mid] < tgt) lo = mid; else hi = mid;
    }
    const f = (tgt - arcLen[lo]) / (arcLen[hi] - arcLen[lo] + 1e-9);
    return {
      x: rawPts[lo].x + (rawPts[hi].x - rawPts[lo].x) * f,
      y: rawPts[lo].y + (rawPts[hi].y - rawPts[lo].y) * f,
    };
  }

  // Dense LUT for nearest-point search
  const NL = 500;
  const lut = Array.from({ length: NL + 1 }, (_, i) => curvePt(i / NL));

  function curveTangent(s) {
    const i = Math.round(s * NL);
    const a = lut[Math.max(0, i - 4)];
    const b = lut[Math.min(NL, i + 4)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  // ── Weighted snap distribution ────────────────────────────────
  // ~85% of dots land in the first 25% of the curve (bottom of J)
  function weightedSnapS() {
    return Math.min(-Math.log(1 - Math.random() * 0.985) * 0.11, 0.88);
  }

  function snapPoint(targetS) {
    const i = Math.round(clamp(targetS, 0, 1) * NL);
    return lut[clamp(i, 0, NL)];
  }

  // ── Slide speed ───────────────────────────────────────────────
  // Crawls on flat, rockets on the rise
  function slideSpeed(s) {
    if (s < 0.55) return 0.08 + s * 0.12;
    const r = (s - 0.55) / 0.45;
    return 0.18 + r * r * 2.2;
  }

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

  // ── Dot states ────────────────────────────────────────────────
  const CHAOS = 0, SEEKING = 1, ONPATH = 2;

  function respawn(d) {
    // 70% left half, 18% bottom strip, 12% anywhere
    const r = Math.random();
    if (r < 0.70) {
      d.x = 82  + Math.random() * 240;
      d.y = 55  + Math.random() * 320;
    } else if (r < 0.88) {
      d.x = 90  + Math.random() * 500;
      d.y = 240 + Math.random() * 130;
    } else {
      d.x = 90  + Math.random() * 500;
      d.y = 55  + Math.random() * 310;
    }

    const angle = Math.random() * Math.PI * 2;
    const spd   = 1.6 + Math.random() * 2.8;
    d.vx = Math.cos(angle) * spd;
    d.vy = Math.sin(angle) * spd;

    d.r         = 1.5 + Math.random() * 2.0;
    d.baseAlpha = 0.55 + Math.random() * 0.38;
    d.state     = CHAOS;
    d.order     = 0;
    d.s         = 0;
    d.life      = 0;
    d.chaosTime = 0.05 + Math.random() * 0.35; // short chaos — seeks quickly
    d.pull      = 0.12 + Math.random() * 0.10;
    d.phase     = Math.random() * Math.PI * 2;
    d.snapS     = weightedSnapS();
    d.snapPt    = snapPoint(d.snapS);
  }

  // ── Initialise dots ───────────────────────────────────────────
  const NDOTS = 110;
  const dots  = Array.from({ length: NDOTS }, (_, i) => {
    const d = {};
    respawn(d);

    // Pre-place ~40% of dots already on the curve so action starts immediately
    const headStart = i / NDOTS;
    if (headStart < 0.4) {
      d.state = ONPATH;
      d.s     = headStart * 0.55; // spread across flat section
      const pt = curvePt(d.s);
      d.x     = pt.x;
      d.y     = pt.y;
      d.order = 0.6 + headStart * 0.4;
    }

    d.age = 0;
    return d;
  });

  // ── Render loop ───────────────────────────────────────────────
  let lastTs = null, gT = 0;

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    gT += dt;

    ctx.clearRect(0, 0, W, H);

    dots.forEach(d => {
      d.age  += dt;
      if (d.age < 0) return;
      d.life += dt;

      // ── CHAOS ─────────────────────────────────────────────────
      if (d.state === CHAOS) {
        d.vx += (Math.random() - 0.5) * 0.22;
        d.vy += (Math.random() - 0.5) * 0.22;

        const spd = Math.sqrt(d.vx*d.vx + d.vy*d.vy);
        const minS = 1.4, maxS = 3.8;
        if (spd < minS) { d.vx *= minS / spd; d.vy *= minS / spd; }
        if (spd > maxS) { d.vx *= maxS / spd; d.vy *= maxS / spd; }

        d.x += d.vx; d.y += d.vy;
        if (d.x < 82)  d.vx =  Math.abs(d.vx) + 0.4;
        if (d.x > 602) d.vx = -Math.abs(d.vx) - 0.4;
        if (d.y < 52)  d.vy =  Math.abs(d.vy) + 0.4;
        if (d.y > 368) d.vy = -Math.abs(d.vy) - 0.4;

        if (d.life > d.chaosTime) d.state = SEEKING;

      // ── SEEKING ───────────────────────────────────────────────
      } else if (d.state === SEEKING) {
        const tx   = d.snapPt.x - d.x;
        const ty   = d.snapPt.y - d.y;
        const dist = Math.sqrt(tx*tx + ty*ty);
        const prox = clamp(1 - dist / 240, 0, 1);

        const tang      = curveTangent(d.snapS);
        const spd       = Math.sqrt(d.vx*d.vx + d.vy*d.vy) || 1;
        const alignStr  = clamp((1 - prox) * 1.1, 0, 1);
        const pullStr   = clamp(prox * 2.2 + 0.15, 0, 1); // floor ensures arrival

        d.vx += (tang.x * spd - d.vx) * alignStr * dt * 4.5;
        d.vy += (tang.y * spd - d.vy) * alignStr * dt * 4.5;
        d.vx += tx * d.pull * pullStr;
        d.vy += ty * d.pull * pullStr;

        const s2 = Math.sqrt(d.vx*d.vx + d.vy*d.vy);
        if (s2 < 1.0) { d.vx *= 1.0 / s2; d.vy *= 1.0 / s2; }
        d.vx *= 0.95; d.vy *= 0.95;

        if (d.x < 82)  d.vx += 0.2;
        if (d.x > 602) d.vx -= 0.2;
        if (d.y < 52)  d.vy += 0.2;
        if (d.y > 368) d.vy -= 0.2;

        d.x += d.vx; d.y += d.vy;

        // Track alignment with tangent to drive order
        const cA = Math.atan2(d.vy, d.vx);
        const tA = Math.atan2(tang.y, tang.x);
        let dA = Math.abs(cA - tA);
        if (dA > Math.PI) dA = Math.PI * 2 - dA;
        d.order = clamp(d.order + (1 - dA / Math.PI) * prox * dt * 2.2, 0, 0.88);

        if (dist < 7) {
          d.state  = ONPATH;
          d.s      = d.snapS;
          d.x      = d.snapPt.x;
          d.y      = d.snapPt.y;
        }

      // ── ON PATH ───────────────────────────────────────────────
      } else {
        d.s += dt * slideSpeed(d.s);
        if (d.s >= 1) { respawn(d); return; }

        const pt      = curvePt(d.s);
        const shimmer = (1 - d.s) * 0.7;
        d.x = pt.x + Math.sin(gT * 1.2 + d.phase) * shimmer;
        d.y = pt.y + Math.cos(gT * 0.9 + d.phase) * shimmer;
        d.order = clamp(d.order + dt * 2.5, 0, 1);
      }

      // ── Draw dot ───────────────────────────────────────────────
      const [r, g, b] = lerpCol(CHAOS_COL, CTA, d.order);

      let alpha;
      if (d.state === ONPATH) {
        // Fade in along the curve — near-transparent at bottom, solid at top
        alpha = d.baseAlpha * (0.07 + Math.pow(d.s, 0.45) * 0.93);
      } else {
        alpha = d.baseAlpha * (0.82 + d.order * 0.18);
      }

      const riseSwell = d.state === ONPATH
        ? clamp((d.s - 0.50) / 0.50, 0, 1) * 1.1
        : 0;
      const radius = d.r * (0.65 + d.order * 0.5) + riseSwell;

      ctx.beginPath();
      ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
    });

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();