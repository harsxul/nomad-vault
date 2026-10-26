import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../paperplane.css';

// "Payments across borders": a paper plane flies from the treasury to each contractor tag on the hero map,
// drawing its dashed route, and the tag confirms with a "+amount" chip. Rendered into Landing's .lp-map
// at runtime so the landing files stay untouched. WAAPI only: no per-frame JavaScript, no React renders.

const TREASURY = [640 / 1280, 236 / 430]; // a central hub, as fractions of the 1280x430 map
const SCALE = 0.4;
const PLANE = { w: 134.82, h: 83.9, ax: 19.26, ay: 60.81 }; // SVG units; (ax, ay) = tail tip, where the trail starts
const NOSE = (PLANE.w - PLANE.ax - 4) * SCALE; // tail to nose tip, px
const TOP = 34; // keep the arc's peak this far below the map edge, so the plane never clips
const EASE_FLIGHT = 'cubic-bezier(0.77, 0, 0.175, 1)';
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

// Quadratic curve bowed upward, like a great-circle route on a flat map.
function arc(a, b, top = TOP) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = Math.hypot(dx, dy);
  const [nx, ny] = dx > 0 ? [dy / len, -dx / len] : [-dy / len, dx / len]; // the normal pointing up
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const c = [mid[0] + nx * len * 0.32, Math.max(mid[1] + ny * len * 0.32, 2 * top - mid[1])];
  const at = (t) => [0, 1].map((k) => (1 - t) ** 2 * a[k] + 2 * (1 - t) * t * c[k] + t ** 2 * b[k]);
  return { d: `M${a} Q${c} ${b}`, at };
}

// Where the plane's nose meets the tag: the tag side facing the treasury.
function landing(tag, a) {
  const { offsetLeft: x, offsetTop: y, offsetWidth: w, offsetHeight: h } = tag;
  if (a[0] < x) return [x - 6, y + h / 2];
  if (a[0] > x + w) return [x + w + 6, y + h / 2];
  return [x + w / 2, a[1] < y ? y - 6 : y + h + 6];
}

// City dots on the closing section's globe illustration (globe.webp is 1933x322).
const CITIES = [[660, 180], [717, 275], [995, 177], [1016, 257], [1266, 197], [1437, 288]].map(([x, y]) => [x / 1933, y / 322]);
const EASE_GLIDE = 'cubic-bezier(0.65, 0, 0.35, 1)'; // easeInOutCubic: calmer than the hero flights

// Two coins travel between the globe's cities, staggered; each arrival pulses the city's ring.
function GlobeCoins({ img }) {
  const ref = useRef(null);

  useEffect(() => {
    const layer = ref.current;
    const coins = [...layer.querySelectorAll('.pp-coin')];
    const rings = [...layer.querySelectorAll('.pp-ring')];
    const small = matchMedia('(max-width: 639px)');
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    const anims = new Set();
    let onScreen = false;

    // The image is not a positioned box, so the overlay copies its offsets (only when its size changes).
    const place = () =>
      Object.assign(layer.style, { top: `${img.offsetTop}px`, left: `${img.offsetLeft}px`, width: `${img.offsetWidth}px`, height: `${img.offsetHeight}px` });
    const track = (a) => {
      anims.add(a);
      a.finished.then(() => anims.delete(a), () => anims.delete(a));
      if (document.hidden || !onScreen) a.pause();
      return a;
    };
    const sync = () => anims.forEach((a) => (document.hidden || !onScreen ? a.pause() : a.play()));

    function trip(coin, from, rest) {
      let to = Math.floor(Math.random() * (CITIES.length - 1));
      if (to >= from) to++;
      const [W, H] = [layer.offsetWidth, layer.offsetHeight];
      const { at } = arc([CITIES[from][0] * W, CITIES[from][1] * H], [CITIES[to][0] * W, CITIES[to][1] * H], 12);
      const frames = Array.from({ length: 31 }, (_, n) => {
        const [x, y] = at(n / 30);
        return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` };
      });
      const D = 2200 + Math.random() * 600;
      coin.getAnimations().forEach((a) => a.cancel()); // the finished, still-filling previous trip
      const move = track(coin.animate(frames, { duration: D, delay: rest, easing: EASE_GLIDE, fill: 'both' }));
      track(coin.animate([{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.88 }, { opacity: 0 }], { duration: D, delay: rest, fill: 'both' }));
      track(
        rings[to].animate([{ opacity: 0.9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.4)' }], {
          duration: 450, delay: rest + D - 80, easing: EASE_OUT,
        }),
      );
      move.onfinish = () => trip(coin, to, 600 + Math.random() * 1000);
    }

    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    });
    const ro = new ResizeObserver(place);
    place();
    ro.observe(img);
    io.observe(img);
    if (!small.matches && !calm.matches) {
      trip(coins[0], 2, 300);
      trip(coins[1], 4, 1900);
    }
    document.addEventListener('visibilitychange', sync);
    return () => {
      anims.forEach((a) => a.cancel());
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [img]);

  return createPortal(
    <div className="pp-globe" ref={ref} aria-hidden="true">
      {CITIES.map(([x, y]) => (
        <span key={x} className="pp-ring" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      ))}
      <span className="pp-coin" />
      <span className="pp-coin" />
    </div>,
    img.parentElement,
  );
}

export default function PaperPlane() {
  const [globe, setGlobe] = useState(null);
  useEffect(() => setGlobe(document.querySelector('.lp-closing__globe')), []);
  return (
    <>
      <MapFlights />
      {globe && <GlobeCoins img={globe} />}
    </>
  );
}

function MapFlights() {
  const [map, setMap] = useState(null);
  const ref = useRef(null);

  useEffect(() => setMap(document.querySelector('.lp-map')), []);

  useEffect(() => {
    if (!map) return undefined;
    const layer = ref.current;
    const [svg, trail, reveal, plane, pulse, chip] = ['svg', '.pp-trail', '.pp-reveal', '.pp-plane', '.pp-pulse', '.pp-chip'].map(
      (s) => layer.querySelector(s),
    );
    const small = matchMedia('(max-width: 639px)');
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    let anims = [];
    let timer = 0;
    let onScreen = true;

    const tags = () => [...map.querySelectorAll('.lp-tag')].filter((t) => t.offsetParent);
    const frame = () => {
      const [W, H] = [map.clientWidth, map.clientHeight];
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      return [TREASURY[0] * W, TREASURY[1] * H];
    };
    const sync = () => anims.forEach((a) => (document.hidden || !onScreen ? a.pause() : a.play()));

    function fly(i) {
      const list = tags();
      if (!list.length) return;
      const tag = list[i % list.length];
      const a = frame();
      const { d, at } = arc(a, landing(tag, a));
      trail.setAttribute('d', d);
      reveal.setAttribute('d', d);
      const L = reveal.getTotalLength();
      reveal.setAttribute('stroke-dasharray', `${L} ${L}`);

      // Plane keyframes evenly spaced along the arc; the flight easing is applied once, to the whole effect.
      const steps = [];
      for (let t = 0; t <= 1.0001; t += 0.005) steps.push(at(t));
      const ls = steps.map((p, k) => (k ? Math.hypot(p[0] - steps[k - 1][0], p[1] - steps[k - 1][1]) : 0));
      ls.forEach((v, k) => k && (ls[k] += ls[k - 1]));
      const end = Math.max(L * 0.4, ls.at(-1) - NOSE); // stop with the nose at the tag
      const flip = steps.at(-1)[0] < a[0] ? -1 : 1; // mirror, not upside down, when flying west
      const frames = [];
      for (let n = 0, k = 1; n <= 48; n++) {
        const s = (end * n) / 48;
        while (k < ls.length - 1 && ls[k] < s) k++;
        const [p, q] = [steps[k - 1], steps[k]];
        const u = (s - ls[k - 1]) / (ls[k] - ls[k - 1] || 1);
        const h = Math.atan2(q[1] - p[1], q[0] - p[0]);
        const x = p[0] + (q[0] - p[0]) * u;
        const y = p[1] + (q[1] - p[1]) * u;
        frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${h.toFixed(4)}rad) scale(1, ${flip})` });
      }

      const D = 1600 + 600 * Math.min(1, L / 900);
      const total = D + 1700; // landing confirm, then a pause before the next payment
      const o = (ms) => Math.min(1, ms / total);
      const amount = tag.querySelector('.lp-tag__amount')?.textContent;
      chip.textContent = amount ? `+${amount}` : '';
      chip.style.left = `${tag.offsetLeft}px`;
      chip.style.top = tag.offsetTop > 34 ? `${tag.offsetTop - 30}px` : `${tag.offsetTop + tag.offsetHeight + 6}px`;

      const old = anims;
      anims = [
        trail.animate([{ opacity: 1 }, { opacity: 1, offset: o(D + 300) }, { opacity: 0, offset: o(D + 800) }, { opacity: 0 }], total),
        reveal.animate([{ strokeDashoffset: `${L}px` }, { strokeDashoffset: `${L - end}px` }], { duration: D, easing: EASE_FLIGHT, fill: 'forwards' }),
        plane.animate(frames, { duration: D, easing: EASE_FLIGHT, fill: 'forwards' }),
        plane.animate([{ opacity: 0 }, { opacity: 1, offset: o(200) }, { opacity: 1, offset: o(D) }, { opacity: 0, offset: o(D + 200) }, { opacity: 0 }], total),
        pulse.animate([{ opacity: 0.5, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.6)' }], { duration: 700, easing: EASE_OUT }),
        tag.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 260, delay: D, easing: EASE_OUT }),
        chip.animate(
          [
            { opacity: 0, transform: 'translateY(6px)' },
            { opacity: 1, transform: 'translateY(0)', offset: 0.25 },
            { opacity: 1, transform: 'translateY(-6px)', offset: 0.7 },
            { opacity: 0, transform: 'translateY(-12px)' },
          ],
          { duration: 1000, delay: D + 80, easing: EASE_OUT },
        ),
      ];
      old.forEach((x) => x.cancel());
      anims[0].onfinish = () => fly(i + 1);
      sync();
    }

    function start() {
      if (small.matches) return;
      if (!calm.matches) {
        timer = setTimeout(() => fly(0), 900); // after the tags have entered
        return;
      }
      // Reduced motion: every route drawn, nothing flies.
      const a = frame();
      trail.removeAttribute('mask');
      trail.setAttribute('d', tags().map((t) => arc(a, landing(t, a)).d).join(' '));
    }

    function stop() {
      clearTimeout(timer);
      anims.forEach((x) => x.cancel());
      anims = [];
      trail.setAttribute('mask', 'url(#pp-reveal-mask)');
      trail.removeAttribute('d');
    }

    const restart = () => {
      stop();
      start();
    };
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    });
    io.observe(map);
    start();
    small.addEventListener('change', restart);
    calm.addEventListener('change', restart);
    document.addEventListener('visibilitychange', sync);
    return () => {
      stop();
      io.disconnect();
      small.removeEventListener('change', restart);
      calm.removeEventListener('change', restart);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [map]);

  if (!map) return null;
  return createPortal(
    <div className="pp-map" ref={ref} aria-hidden="true">
      <svg className="pp-routes" preserveAspectRatio="none">
        <mask id="pp-reveal-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
          <path className="pp-reveal" />
        </mask>
        <path className="pp-trail" mask="url(#pp-reveal-mask)" />
      </svg>
      <span className="pp-treasury" style={{ left: `${TREASURY[0] * 100}%`, top: `${TREASURY[1] * 100}%` }}>
        <i><span className="pp-pulse" /></i>Treasury
      </span>
      <span className="pp-chip" />
      <img
        className="pp-plane"
        src={`${import.meta.env.BASE_URL}landing/plane.svg`}
        alt=""
        width={PLANE.w * SCALE}
        height={PLANE.h * SCALE}
        style={{
          marginLeft: -PLANE.ax * SCALE,
          marginTop: -PLANE.ay * SCALE,
          transformOrigin: `${PLANE.ax * SCALE}px ${PLANE.ay * SCALE}px`,
        }}
      />
    </div>,
    map,
  );
}
