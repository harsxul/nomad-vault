import { useEffect, useRef } from 'react';
import '../paperplane.css';

// The "cursor" roaming the page: short curved glides that enter from a viewport edge and land in a side gutter,
// towing its dashed trail and three tumbling coins. On landing a spark pops and the formation fades out, so it
// never sits still. Flights are precomputed WAAPI keyframes: no per-frame JavaScript, no React renders.

// Sizes in SVG units from public/landing/*.svg; SCALE maps them to CSS pixels.
const SCALE = 0.5;
const PLANE = { w: 134.82, h: 83.9, ax: 19.26, ay: 60.81 }; // (ax, ay) = tail tip, where the trail starts
const SPARK = { w: 33.02, h: 39.41, x: 132.63, y: 15.73 };
const COINS = [
  { name: 'coin-usd', w: 71.82, h: 75.88, behind: 53.8, side: 20, drag: 1 },
  { name: 'coin-eur', w: 64.77, h: 59.62, behind: 114.2, side: -50.7, drag: 1.25 },
  { name: 'coin-usd-small', w: 50.13, h: 47.72, behind: 172.6, side: 34.6, drag: 1.5 },
];
const DASHES = 12;
const px = (v) => v * SCALE;
const DASH_GAP = px(14.6);
const SPEED = 220; // average px/s
const LAND = (62 * Math.PI) / 180; // resting climb angle: steep, so the formation stays in the margin
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

function polyline(points) {
  const ls = [0];
  for (let i = 1; i < points.length; i++) ls.push(ls[i - 1] + dist(points[i - 1], points[i]));
  return { points, ls, length: ls[ls.length - 1] };
}

function pointAt({ points, ls, length }, s) {
  s = Math.min(Math.max(s, 0), length);
  let lo = 0;
  let hi = ls.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ls[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - ls[lo]) / (ls[hi] - ls[lo] || 1);
  return [points[lo][0] + (points[hi][0] - points[lo][0]) * t, points[lo][1] + (points[hi][1] - points[lo][1]) * t];
}

function headingAt(track, s) {
  const [x0, y0] = pointAt(track, s - 3);
  const [x1, y1] = pointAt(track, s + 3);
  return Math.atan2(y1 - y0, x1 - x0);
}

// Cubic Hermite curve through the points, with explicit end tangents so takeoff continues the resting heading.
function hermite(ps, t0, t1) {
  const ts = ps.map((p, i) =>
    i === 0 ? t0 : i === ps.length - 1 ? t1 : [(ps[i + 1][0] - ps[i - 1][0]) / 2, (ps[i + 1][1] - ps[i - 1][1]) / 2],
  );
  const out = [];
  for (let i = 0; i < ps.length - 1; i++) {
    const [p0, p1, m0, m1] = [ps[i], ps[i + 1], ts[i], ts[i + 1]];
    const n = Math.max(8, Math.ceil(dist(p0, p1) / 4));
    for (let j = 1; j <= n; j++) {
      const u = j / n;
      const [a, b, c, d] = [2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, 3 * u ** 2 - 2 * u ** 3, u ** 3 - u ** 2];
      out.push([0, 1].map((k) => a * p0[k] + b * m0[k] + c * p1[k] + d * m1[k]));
    }
  }
  return out;
}

// Text and controls in view: never park on any of them, never cross a heading or a button.
function obstacles() {
  const range = document.createRange();
  const rest = [];
  const cross = [];
  for (const el of document.querySelectorAll('h1, h2, h3, p, li, a, button, input, select, img')) {
    let r = el.getBoundingClientRect();
    if (/^(H\d|P)$/.test(el.tagName)) {
      range.selectNodeContents(el);
      r = range.getBoundingClientRect(); // tight to the text, not the full-width block
    }
    if (!r.width || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    rest.push(r);
    if (el.matches('h1, h2, h3, a, button')) cross.push(r);
  }
  return { rest, cross };
}

const hits = (x, y, r, rects) => rects.some((b) => x > b.left - r && x < b.right + r && y > b.top - r && y < b.bottom + r);

// Position and rotation (radians) of every dash, coin and the plane, with the plane's tail at track distance s.
function pose(track, s, odo, stretch, roll) {
  const out = [];
  for (let i = 0; i < DASHES; i++) {
    const d = s - (i + 0.5) * DASH_GAP * stretch;
    out.push([...pointAt(track, d), headingAt(track, d)]);
  }
  for (const c of COINS) {
    const d = s - px(c.behind) * (1 + (stretch - 1) * c.drag); // coins lag further behind at speed
    const [x, y] = pointAt(track, d);
    const h = headingAt(track, d);
    const o = odo + d; // tumble is driven by distance flown, so it settles when the plane lands
    const side = px(c.side) + 4 * Math.sin(o / 26 + c.drag * 3);
    out.push([x - Math.sin(h) * side, y + Math.cos(h) * side, 0.21 * Math.sin(o / 38 + c.drag * 5)]);
  }
  out.push([...pointAt(track, s), headingAt(track, s), roll]);
  return out;
}

const transform = ([x, y, a, roll]) =>
  `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${a.toFixed(4)}rad)` + (roll === undefined ? '' : ` scale(1, ${roll.toFixed(3)})`);

export default function RoamingPlane() {
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = layerRef.current;
    const els = [...layer.children];
    const spark = layer.querySelector('.rp-spark');
    const small = matchMedia('(max-width: 639px)');
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    let anims = [];

    // Each flight enters from just outside an edge, glides along a side gutter and lands there; best of a few routes.
    function plan() {
      const { rest, cross } = obstacles();
      const [vw, vh] = [innerWidth, innerHeight];
      let best = null;
      for (let i = 0; i < 40; i++) {
        const right = Math.random() < 0.5;
        const band = (lo, hi) => vw * (right ? 1 - rand(lo, hi) : rand(lo, hi));
        const B = [band(0.05, 0.12), vh * rand(0.25, 0.85)];
        const dir = [right ? Math.cos(LAND) : -Math.cos(LAND), -Math.sin(LAND)];
        const e = Math.floor(Math.random() * 3); // side, bottom or top edge
        const A = e === 0 ? [right ? vw + 60 : -60, vh * rand(0.2, 0.9)] : [band(0.02, 0.2), e === 1 ? vh + 60 : -60];
        const hA = e === 0 ? (right ? Math.PI : 0) + rand(-0.5, 0.5) : (e === 1 ? -1 : 1) * (Math.PI / 2) + rand(-0.4, 0.4);
        const [k, j] = [rand(120, 200), rand(-30, 30)];
        const W2 = [B[0] - dir[0] * k - dir[1] * j, B[1] - dir[1] * k + dir[0] * j];
        const W1 = [band(0.03, 0.18), vh * rand(0.15, 0.85)];
        const reach = Math.min(0.9 * dist(A, W1), 220);
        const route = hermite([A, W1, W2, B], [Math.cos(hA) * reach, Math.sin(hA) * reach], dir.map((v) => v * dist(W2, B)));
        const track = polyline([[A[0] - Math.cos(hA) * 300, A[1] - Math.sin(hA) * 300], A, ...route]); // trail starts offscreen

        let score = 0;
        for (const [x, y] of route) if (hits(x, y, 14, cross)) score += 20;
        const end = pose(track, track.length, 0, 1, 1);
        const nose = px(PLANE.w / 2 - PLANE.ax);
        const blobs = COINS.map((c, n) => [end[DASHES + n][0], end[DASHES + n][1], px(c.w) / 2]);
        blobs.push([B[0] + dir[0] * nose, B[1] + dir[1] * nose, px(PLANE.w) * 0.45]); // plane body, last
        for (const [x, y, r] of blobs) {
          if (hits(x, y, r, rest)) score += 50;
          if (x < r || x > vw - r || y < r || y > vh - r) score += 50;
        }
        if (!best || score < best.score) best = { score, track, sA: 300, center: blobs.at(-1) };
      }
      return best;
    }

    function fly() {
      const p = plan();
      const L = p.track.length - p.sA;
      const T = Math.min(5000, Math.max(2600, (L / SPEED) * 1000));
      const total = T + 650 + rand(1500, 3000); // land, spark, fade out, then 1.5-3 s invisible
      const odo = rand(0, 1000);
      const frames = els.map(() => []);
      const prev = [];
      let target = Math.cos(headingAt(p.track, p.sA)) < 0 ? -1 : 1;
      let roll = target;
      const push = (pts, offset) =>
        pts.forEach((pt, k) => {
          if (prev[k] !== undefined) pt[2] += Math.round((prev[k] - pt[2]) / (2 * Math.PI)) * 2 * Math.PI; // no spins at ±180°
          prev[k] = pt[2];
          frames[k].push({ offset, transform: transform(pt) });
        });

      const n = Math.ceil(T / 40);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const s = p.sA + L * Math.sin((Math.PI * u) / 2); // ease-out sine: enters already moving, settles to land
        const v = (Math.PI / 2) * Math.cos((Math.PI * u) / 2) * (L / (T / 1000));
        const c = Math.cos(headingAt(p.track, s));
        if (c > 0.3) target = 1;
        else if (c < -0.3) target = -1; // roll over when heading left, so the plane never flies upside down
        roll += (target - roll) * (1 - Math.exp(-T / n / 90));
        push(pose(p.track, s, odo, 1 + v / 600, roll), (u * T) / total);
      }
      push(pose(p.track, p.track.length, odo, 1, target), Math.min(1, (T + 250) / total));
      frames.forEach((f) => f.push({ ...f.at(-1), offset: 1 }));

      const at = (ms) => (T + ms) / total;
      const sparkFrames = [
        { offset: 0, opacity: 0, transform: 'scale(0.7)' },
        { offset: at(0), opacity: 0, transform: 'scale(0.7)', easing: EASE_OUT },
        { offset: at(250), opacity: 1, transform: 'scale(1)' },
        { offset: 1, opacity: 1, transform: 'scale(1)' },
      ];
      // The whole formation fades in while entering, and shrinks slightly towards the plane as it fades out.
      const layerFrames = [
        { offset: 0, opacity: 0, transform: 'scale(1)' },
        { offset: 200 / total, opacity: 1, transform: 'scale(1)' },
        { offset: at(400), opacity: 1, transform: 'scale(1)', easing: EASE_OUT },
        { offset: at(650), opacity: 0, transform: 'scale(0.96)' },
        { offset: 1, opacity: 0, transform: 'scale(0.96)' },
      ];
      layer.style.transformOrigin = `${p.center[0]}px ${p.center[1]}px`;

      const old = anims;
      anims = els.map((el, k) => el.animate(frames[k], { duration: total, fill: 'forwards' }));
      anims.push(spark.animate(sparkFrames, { duration: total, fill: 'forwards' }));
      anims.unshift(layer.animate(layerFrames, { duration: total, fill: 'forwards' }));
      old.forEach((a) => a.cancel());
      anims[0].onfinish = fly;
      sync();
    }

    function sync() {
      anims.forEach((a) => (document.hidden ? a.pause() : a.play()));
    }

    function start() {
      if (small.matches || calm.matches) return; // reduced motion: no roaming plane
      layer.classList.add('is-on');
      fly();
    }

    function stop() {
      anims.forEach((a) => a.cancel());
      anims = [];
      layer.classList.remove('is-on');
    }

    const restart = () => {
      stop();
      start();
    };
    start();
    small.addEventListener('change', restart);
    calm.addEventListener('change', restart);
    document.addEventListener('visibilitychange', sync);
    return () => {
      stop();
      small.removeEventListener('change', restart);
      calm.removeEventListener('change', restart);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return (
    <div className="rp-layer" ref={layerRef} aria-hidden="true">
      {Array.from({ length: DASHES }, (_, i) => (
        <span key={i} className="rp-dash" style={{ opacity: Math.min(1, (DASHES - i) / 4) }} />
      ))}
      {COINS.map((c) => (
        <img
          key={c.name}
          className="rp-coin"
          src={`/landing/${c.name}.svg`}
          alt=""
          width={px(c.w)}
          height={px(c.h)}
          style={{ marginLeft: -px(c.w) / 2, marginTop: -px(c.h) / 2 }}
        />
      ))}
      <div
        className="rp-plane"
        style={{
          width: px(PLANE.w),
          height: px(PLANE.h),
          marginLeft: -px(PLANE.ax),
          marginTop: -px(PLANE.ay),
          transformOrigin: `${px(PLANE.ax)}px ${px(PLANE.ay)}px`,
        }}
      >
        <img src="/landing/plane.svg" alt="" width={px(PLANE.w)} height={px(PLANE.h)} />
        <img
          className="rp-spark"
          src="/landing/spark.svg"
          alt=""
          width={px(SPARK.w)}
          height={px(SPARK.h)}
          style={{ left: px(SPARK.x), top: px(SPARK.y) }}
        />
      </div>
    </div>
  );
}
