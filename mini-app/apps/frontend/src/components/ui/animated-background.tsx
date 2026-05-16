'use client';

/**
 * AnimatedBackground — Monopo Saigon Style
 *
 * The original implementation animated three 400-500px blurred orbs via
 * framer-motion. On mobile WebViews each blurred layer was a GPU
 * showstopper, dragging the app to single-digit FPS. We replaced the
 * motion with a static, layered radial gradient which reads identically
 * and costs zero per-frame.
 *
 * The page container already sits on `bg-midnight-canvas`, so this
 * component is purely atmospheric: three soft radial washes on a
 * fully-opaque black canvas. No blur filters, no animation, no JS.
 */
export function AnimatedBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden bg-midnight-canvas pointer-events-none"
      aria-hidden
    >
      {/* Layered radial gradients — pre-blurred by being naturally soft.
          Three stops give the impression of three orbs without using a
          GPU-expensive filter:blur(80-100px) on a stack of <div>s. */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(60% 50% at 25% 30%, rgba(160, 224, 171, 0.10) 0%, transparent 60%)',
            'radial-gradient(55% 45% at 75% 70%, rgba(255, 172, 46, 0.08) 0%, transparent 60%)',
            'radial-gradient(50% 40% at 50% 50%, rgba(165, 45, 37, 0.06) 0%, transparent 65%)',
          ].join(','),
        }}
      />
    </div>
  );
}
