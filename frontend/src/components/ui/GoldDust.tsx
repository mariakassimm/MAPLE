import { useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

/**
 * Fine champagne-gold dust drifting slowly upward and twinkling, like light catching particles in a studio.
 * One small canvas, ~30 fps, paused while off screen or in a hidden tab, fewer particles on phones, and not rendered at all
 * for visitors who prefer reduced motion.
 */
export function GoldDust({
  count = 40,
  className = '',
  tone = 'light',
}: {
  count?: number;
  className?: string;
  tone?: 'light' | 'warm';
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reduce) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const phone = window.innerWidth < 640;
    // Phones: 1x canvas and about half the particles. The dust is soft and blurry, so the lower resolution is not visible.
    const dpr = phone ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const n = phone ? Math.round(count * 0.45) : count;
    // One pre-drawn glow, stamped per particle. Creating a gradient per particle per frame is what made phones stutter.
    const [c1, c2] = tone === 'warm' ? ['176,128,44', '200,155,72'] : ['240,222,176', '214,184,130'];
    const SPRITE = 64;
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = SPRITE;
    const sctx = sprite.getContext('2d');
    if (!sctx) return;
    const sg = sctx.createRadialGradient(SPRITE / 2, SPRITE / 2, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
    sg.addColorStop(0, `rgba(${c1},1)`);
    sg.addColorStop(0.35, `rgba(${c2},0.35)`);
    sg.addColorStop(1, `rgba(${c2},0)`);
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, SPRITE, SPRITE);
    const parts = Array.from({ length: n }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.5 + Math.random() * 1.5,
      vy: 0.006 + Math.random() * 0.016,
      vx: (Math.random() - 0.5) * 0.006,
      ph: Math.random() * 6.28,
      sp: 0.5 + Math.random() * 1.1,
    }));
    let w = 0,
      h = 0,
      raf = 0,
      last = 0,
      visible = true;
    const size = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(tick);
    });
    io.observe(canvas);

    function tick(t: number) {
      raf = 0;
      if (!visible || document.hidden) return;
      raf = requestAnimationFrame(tick);
      if (t - last < 33) return;
      const dt = Math.min((t - last) / 1000, 0.1);
      last = t;
      ctx!.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= p.vy * dt;
        p.x += p.vx * dt;
        if (p.y < -0.02) {
          p.y = 1.02;
          p.x = Math.random();
        }
        if (p.x < -0.02) p.x = 1.02;
        else if (p.x > 1.02) p.x = -0.02;
        const a = 0.12 + 0.7 * Math.max(0, Math.sin((t / 1000) * p.sp + p.ph)) ** 2;
        const px = p.x * w,
          py = p.y * h,
          rad = p.r * 5;
        ctx!.globalAlpha = a;
        ctx!.drawImage(sprite, px - rad, py - rad, rad * 2, rad * 2);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [count, reduce, tone]);

  if (reduce) return null;
  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
