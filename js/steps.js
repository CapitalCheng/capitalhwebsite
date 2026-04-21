/**
 * Capital H — Steps Animation
 * Four unique mini-animations replacing the 01–04 step numbers.
 *
 * 01 Map    — moving gray dots, red key dots appear/pulse/fade/reposition
 * 02 Design — dots self-organise through circle→triangle→square, drifting between
 * 03 Implement — gray swarm at top, dots break off and snap into neat rows
 * 04 Embed  — drifting dots, organic wave converts gray→red from pulsing center
 *
 * FIX: Canvas now uses a guaranteed pixel size (fallback 72×72) and the
 * .step-num wrapper is forced to position:relative with explicit w/h so the
 * absolutely-positioned canvas has a real layout box to fill.
 */
(function () {

  const steps = document.querySelectorAll('.step');
  if (!steps.length) return;

  const LOW_END  = (navigator.hardwareConcurrency || 8) <= 4;
  const FRAME_MS = LOW_END ? 1000 / 30 : 0;
  const CTA  = [148, 52, 36];
  const GRAY = [118, 116, 114];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function lerpCol(a, b, t) {
    t = clamp(t, 0, 1);
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ];
  }

  /**
   * Inject a canvas into .step-num.
   * KEY FIX: We force the wrapper to a known pixel size before reading
   * offsetWidth/offsetHeight, so the canvas is never 0×0.
   */
  function injectCanvas(stepEl) {
    const numEl = stepEl.querySelector('.step-num');
    if (!numEl) return null;

    // Force the wrapper to be a positioned box with a guaranteed size
    const SIZE = 72; // px — adjust to match your CSS if needed
    numEl.style.position      = 'relative';
    numEl.style.display       = 'inline-flex';
    numEl.style.alignItems    = 'center';
    numEl.style.justifyContent = 'center';
    numEl.style.width         = SIZE + 'px';
    numEl.style.height        = SIZE + 'px';
    numEl.style.overflow      = 'visible';
    numEl.style.flexShrink    = '0';      // prevent squishing in flex rows
    numEl.style.marginRight   = '12px';   // buffer so canvas doesn't bleed into title text

    // Hide original text but keep the space
    numEl.style.color         = 'transparent';

    const canvas = document.createElement('canvas');
    canvas.style.cssText   = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    numEl.appendChild(canvas);

    const DPR = window.devicePixelRatio || 1;
    // Use the forced size — offsetWidth is reliable now
    const W   = numEl.offsetWidth  || SIZE;
    const H   = numEl.offsetHeight || SIZE;
    canvas.width  = W * DPR;
    canvas.height = H * DPR;
    const ctx = canvas.getContext('2d');
    ctx.scale(DPR, DPR);
    return { canvas, ctx, W, H };
  }

  // ── 01 MAP THE VALUE DRIVERS ────────────────────────────────────
  function initMap(stepEl) {
    const res = injectCanvas(stepEl);
    if (!res) return;
    const { ctx, W, H } = res;
    const N_GRAY = 30;

    const grays = Array.from({ length: N_GRAY }, () => ({
      x: rnd(3, W-3), y: rnd(3, H-3),
      vx: (Math.random()-0.5)*0.5, vy: (Math.random()-0.5)*0.5,
      r: rnd(1.1, 2.0), alpha: rnd(0.15, 0.35),
    }));

    const N_KEY = 5;
    const keys = Array.from({ length: N_KEY }, (_, i) => ({
      x: rnd(8, W-8), y: rnd(8, H-8),
      r: rnd(1.8, 2.6),
      life: 0, phaseOffset: i * 2.2,
      fadeIn: 0.6, hold: 2.2, fadeOut: 0.7,
      total: 0,
    }));
    keys.forEach(k => {
      k.total = k.fadeIn + k.hold + k.fadeOut + rnd(0.5, 2);
      k.life  = k.phaseOffset;
    });

    function reposition(k) {
      k.x = rnd(8, W-8); k.y = rnd(8, H-8);
      k.life = 0; k.total = k.fadeIn + k.hold + k.fadeOut + rnd(0.5, 2);
    }

    let lastTs = null, lastFrameTs = 0, visible = false, rafId = null;

    function tick(ts) {
      rafId = requestAnimationFrame(tick);
      if (!visible) return;
      if (FRAME_MS && ts - lastFrameTs < FRAME_MS) return;
      lastFrameTs = ts;
      const dt = Math.min((ts - (lastTs || ts)) / 1000, 0.05);
      lastTs = ts;
      ctx.clearRect(0, 0, W, H);

      grays.forEach(d => {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 2 || d.x > W-2) d.vx *= -1;
        if (d.y < 2 || d.y > H-2) d.vy *= -1;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(${GRAY[0]},${GRAY[1]},${GRAY[2]},${d.alpha})`;
        ctx.fill();
      });

      keys.forEach(k => {
        k.life += dt;
        if (k.life > k.total) { reposition(k); return; }
        let alpha = 0, pulse = 0;
        if (k.life < k.fadeIn) {
          alpha = k.life / k.fadeIn;
        } else if (k.life < k.fadeIn + k.hold) {
          alpha = 1;
          pulse = (Math.sin((k.life - k.fadeIn) * 3) + 1) * 0.5;
        } else {
          alpha = 1 - (k.life - k.fadeIn - k.hold) / k.fadeOut;
        }
        alpha = clamp(alpha, 0, 1);
        const radius = k.r * (1 + pulse * 0.5);
        if (pulse > 0.3) {
          ctx.beginPath(); ctx.arc(k.x, k.y, radius * 2.8, 0, Math.PI*2);
          ctx.strokeStyle = `rgba(${CTA[0]},${CTA[1]},${CTA[2]},${alpha*(pulse-0.3)*0.4})`;
          ctx.lineWidth = 0.7; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(k.x, k.y, radius, 0, Math.PI*2);
        ctx.fillStyle = `rgba(${CTA[0]},${CTA[1]},${CTA[2]},${alpha*0.9})`;
        ctx.fill();
      });
    }

    const io = new IntersectionObserver(e => {
      visible = e[0].isIntersecting;
      if (visible) { lastTs = null; if (!rafId) rafId = requestAnimationFrame(tick); }
    }, { threshold: 0 });
    io.observe(stepEl);
  }

  // ── 02 DESIGN THE SOLUTION ──────────────────────────────────────
  function initDesign(stepEl) {
    const res = injectCanvas(stepEl);
    if (!res) return;
    const { ctx, W, H } = res;
    const CX = W/2, CY = H/2, R = Math.min(W,H)*0.34, N = 20;

    function circlePos(i, n) {
      const a = (i/n)*Math.PI*2 - Math.PI/2;
      return { x: CX + Math.cos(a)*R, y: CY + Math.sin(a)*R };
    }
    function triPos(i, n) {
      const s = Math.floor(i/(n/3)), p = (i%(n/3))/(n/3);
      const pts = [
        { x: CX,           y: CY - R },
        { x: CX + R*0.87,  y: CY + R*0.5 },
        { x: CX - R*0.87,  y: CY + R*0.5 },
      ];
      const nx = pts[(s+1)%3];
      return { x: lerp(pts[s].x, nx.x, p), y: lerp(pts[s].y, nx.y, p) };
    }
    function sqPos(i, n) {
      const s = Math.floor(i/(n/4)), p = (i%(n/4))/(n/4), r = R*0.82;
      const pts = [
        { x: CX-r, y: CY-r }, { x: CX+r, y: CY-r },
        { x: CX+r, y: CY+r }, { x: CX-r, y: CY+r },
      ];
      const nx = pts[(s+1)%4];
      return { x: lerp(pts[s].x, nx.x, p), y: lerp(pts[s].y, nx.y, p) };
    }

    const shapes = [circlePos, triPos, sqPos];
    const HOLD = 2.2, TRANS = 1.0, CYCLE = HOLD + TRANS;
    const dots = Array.from({ length: N }, () => ({
      x: CX + (Math.random()-0.5)*20,
      y: CY + (Math.random()-0.5)*20,
      vx: (Math.random()-0.5)*0.3,
      vy: (Math.random()-0.5)*0.3,
      r: 2.2,
    }));

    let t = 0, lastTs = null, lastFrameTs = 0, visible = false, rafId = null;

    function tick(ts) {
      rafId = requestAnimationFrame(tick);
      if (!visible) return;
      if (FRAME_MS && ts - lastFrameTs < FRAME_MS) return;
      lastFrameTs = ts;
      const dt = Math.min((ts - (lastTs || ts)) / 1000, 0.05);
      lastTs = ts; t += dt;
      ctx.clearRect(0, 0, W, H);

      const cycleT   = t % CYCLE;
      const si       = Math.floor(t / CYCLE) % shapes.length;
      const ni       = (si + 1) % shapes.length;
      const progress = clamp((cycleT - HOLD) / TRANS, 0, 1);
      const ease     = progress < 0.5 ? 2*progress*progress : 1 - 2*(1-progress)*(1-progress);
      const inTrans  = progress > 0;

      dots.forEach((d, i) => {
        const cur = shapes[si](i, N), nxt = shapes[ni](i, N);
        const tx  = lerp(cur.x, nxt.x, ease), ty = lerp(cur.y, nxt.y, ease);
        if (inTrans) {
          d.vx += (Math.random()-0.5)*0.15; d.vy += (Math.random()-0.5)*0.15;
          d.vx *= 0.95; d.vy *= 0.95;
          d.x  += d.vx; d.y  += d.vy;
        } else {
          d.x += (tx - d.x)*0.06 + (Math.random()-0.5)*0.3;
          d.y += (ty - d.y)*0.06 + (Math.random()-0.5)*0.3;
        }
        const [r, g, b] = lerpCol(GRAY, CTA, clamp(1 - progress*2, 0, 1));
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(${r},${g},${b},0.88)`; ctx.fill();
      });
    }

    const io = new IntersectionObserver(e => {
      visible = e[0].isIntersecting;
      if (visible) { lastTs = null; if (!rafId) rafId = requestAnimationFrame(tick); }
    }, { threshold: 0 });
    io.observe(stepEl);
  }

  // ── 03 IMPLEMENT & CODIFY ───────────────────────────────────────
  function initImplement(stepEl) {
    const res = injectCanvas(stepEl);
    if (!res) return;
    const { ctx, W, H } = res;
    const COLS = 6, ROWS = 3, DOT = 3.4, GAP = 2.0, STEP = DOT + GAP;
    const ox     = (W - (COLS*STEP - GAP)) / 2;
    const swarmH = H * 0.48;
    const oy     = H - (ROWS*STEP - GAP) - 6;

    const N_SWARM = 18;
    const swarm = Array.from({ length: N_SWARM }, () => ({
      x: rnd(3, W-3), y: rnd(3, swarmH-3),
      vx: (Math.random()-0.5)*0.8, vy: (Math.random()-0.5)*0.8,
      r: rnd(1.3, 2.0), alpha: rnd(0.2, 0.42),
    }));

    const landed = [];
    let falling = null, nextCol = 0, nextRow = 0, resetTimer = 0;
    let lastTs = null, lastFrameTs = 0, visible = false, rafId = null;

    function spawnFalling() {
      if (nextRow >= ROWS) { resetTimer = 1.8; return; }
      const col = nextCol % COLS;
      falling = {
        x: rnd(4, W-4), y: rnd(4, swarmH*0.8),
        vx: rnd(-0.5, 0.5), vy: 0,
        tx: ox + col*STEP + DOT/2, ty: oy + nextRow*STEP + DOT/2,
        alpha: 0,
      };
      nextCol++;
      if (nextCol % COLS === 0) nextRow++;
    }
    spawnFalling();

    function tick(ts) {
      rafId = requestAnimationFrame(tick);
      if (!visible) return;
      if (FRAME_MS && ts - lastFrameTs < FRAME_MS) return;
      lastFrameTs = ts;
      const dt = Math.min((ts - (lastTs || ts)) / 1000, 0.05);
      lastTs = ts;
      ctx.clearRect(0, 0, W, H);

      swarm.forEach(d => {
        d.x += d.vx; d.y += d.vy;
        d.vx += (Math.random()-0.5)*0.06; d.vy += (Math.random()-0.5)*0.06;
        d.vx *= 0.97; d.vy *= 0.97;
        if (d.x < 2 || d.x > W-2) d.vx *= -1;
        if (d.y < 2 || d.y > swarmH-2) d.vy *= -1;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(${GRAY[0]},${GRAY[1]},${GRAY[2]},${d.alpha})`; ctx.fill();
      });

      if (resetTimer > 0) {
        resetTimer -= dt;
        if (resetTimer <= 0) {
          landed.length = 0; nextCol = 0; nextRow = 0; falling = null; spawnFalling();
        }
      }

      landed.forEach(d => {
        ctx.beginPath(); ctx.arc(d.x, d.y, DOT/2, 0, Math.PI*2);
        ctx.fillStyle = `rgba(${CTA[0]},${CTA[1]},${CTA[2]},0.9)`; ctx.fill();
      });

      if (falling) {
        falling.alpha = Math.min(falling.alpha + dt*5, 1);
        const dx = falling.tx - falling.x, dy = falling.ty - falling.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const chaos = clamp(dist/60, 0, 1);
        falling.vx += dx * lerp(0.10, 0.02, chaos) * 0.15 + (Math.random()-0.5)*chaos*0.7;
        falling.vy += dy * lerp(0.10, 0.02, chaos) * 0.15 + (Math.random()-0.5)*chaos*0.3;
        falling.vx *= 0.88; falling.vy *= 0.88;
        falling.x  += falling.vx; falling.y += falling.vy;
        const [r, g, b] = lerpCol(GRAY, CTA, 1 - chaos);
        ctx.beginPath(); ctx.arc(falling.x, falling.y, DOT/2, 0, Math.PI*2);
        ctx.fillStyle = `rgba(${r},${g},${b},${falling.alpha})`; ctx.fill();
        if (dist < 3) {
          landed.push({ x: falling.tx, y: falling.ty });
          falling = null;
          setTimeout(spawnFalling, 180);
        }
      }
    }

    const io = new IntersectionObserver(e => {
      visible = e[0].isIntersecting;
      if (visible) { lastTs = null; if (!rafId) rafId = requestAnimationFrame(tick); }
    }, { threshold: 0 });
    io.observe(stepEl);
  }

  // ── 04 EMBED & SCALE ────────────────────────────────────────────
  function initEmbed(stepEl) {
    const res = injectCanvas(stepEl);
    if (!res) return;
    const { ctx, W, H } = res;
    const CX = W/2, CY = H/2, N = 52;
    const maxDist = Math.min(W, H) * 0.46;

    const dots = Array.from({ length: N }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const dist  = i === 0 ? 0 : rnd(3, maxDist);
      return {
        x: CX + Math.cos(angle)*dist,
        y: CY + Math.sin(angle)*dist,
        vx: i === 0 ? 0 : (Math.random()-0.5)*0.25,
        vy: i === 0 ? 0 : (Math.random()-0.5)*0.25,
        r: i === 0 ? 2.6 : rnd(1.0, 1.9),
        baseAlpha: i === 0 ? 1 : rnd(0.25, 0.42),
        redness: i === 0 ? 1 : 0,
        dist,
        triggerOffset: (Math.random()-0.5) * maxDist * 0.4,
        isCenter: i === 0,
      };
    });
    dots[0].x = CX; dots[0].y = CY;

    let waveR = 0, t = 0, lastTs = null, lastFrameTs = 0, visible = false, rafId = null;

    function tick(ts) {
      rafId = requestAnimationFrame(tick);
      if (!visible) return;
      if (FRAME_MS && ts - lastFrameTs < FRAME_MS) return;
      lastFrameTs = ts;
      const dt = Math.min((ts - (lastTs || ts)) / 1000, 0.05);
      lastTs = ts; t += dt;
      waveR += dt * 14;
      if (waveR > maxDist + 20) waveR = 0;
      ctx.clearRect(0, 0, W, H);

      dots.forEach(d => {
        if (!d.isCenter) {
          d.vx += (Math.random()-0.5)*0.04; d.vy += (Math.random()-0.5)*0.04;
          d.vx *= 0.97; d.vy *= 0.97;
          d.x  += d.vx; d.y  += d.vy;
          if (d.x < 2 || d.x > W-2) d.vx *= -1;
          if (d.y < 2 || d.y > H-2) d.vy *= -1;
          d.dist = Math.sqrt((d.x - CX)**2 + (d.y - CY)**2);
        }
        const trigDist = d.dist + d.triggerOffset;
        if (waveR > trigDist)      d.redness = Math.min(d.redness + dt*3.0, 1);
        else if (waveR < trigDist - 6) d.redness = Math.max(d.redness - dt*1.5, 0);

        if (d.isCenter) {
          const pulse = (Math.sin(t*2.5)*0.5 + 0.5);
          ctx.beginPath(); ctx.arc(d.x, d.y, d.r*3 + pulse*3, 0, Math.PI*2);
          ctx.strokeStyle = `rgba(${CTA[0]},${CTA[1]},${CTA[2]},${0.15 + pulse*0.2})`;
          ctx.lineWidth = 0.8; ctx.stroke();
          ctx.beginPath(); ctx.arc(d.x, d.y, d.r*(1 + pulse*0.2), 0, Math.PI*2);
          ctx.fillStyle = `rgba(${CTA[0]},${CTA[1]},${CTA[2]},0.95)`; ctx.fill();
          return;
        }
        const [r, g, b] = lerpCol(GRAY, CTA, d.redness);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r*(1 + d.redness*0.2), 0, Math.PI*2);
        ctx.fillStyle = `rgba(${r},${g},${b},${d.baseAlpha + d.redness*0.5})`; ctx.fill();
      });
    }

    const io = new IntersectionObserver(e => {
      visible = e[0].isIntersecting;
      if (visible) { lastTs = null; if (!rafId) rafId = requestAnimationFrame(tick); }
    }, { threshold: 0 });
    io.observe(stepEl);
  }

  // ── Boot — one per step, after layout settles ─────────────────
  const inits = [initMap, initDesign, initImplement, initEmbed];
  setTimeout(() => {
    steps.forEach((stepEl, i) => {
      if (i > 3) return;
      inits[i](stepEl);
    });
  }, 200);

})();