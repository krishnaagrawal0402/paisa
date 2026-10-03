/**
 * Slow-drifting colour glows behind the glass. Purely decorative.
 * Radial gradients (not blurred circles) so edges fade out smoothly at any size.
 */
export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="animate-aurora absolute -top-1/3 -left-1/3 size-[80vmax] rounded-full bg-[radial-gradient(circle,rgb(167_139_250/0.16),transparent_60%)]" />
      <div className="animate-aurora absolute -right-1/3 -bottom-1/3 size-[75vmax] rounded-full bg-[radial-gradient(circle,rgb(34_211_238/0.12),transparent_60%)] [animation-delay:-8s]" />
      <div className="animate-aurora absolute top-1/4 left-1/3 size-[50vmax] rounded-full bg-[radial-gradient(circle,rgb(61_255_154/0.06),transparent_60%)] [animation-delay:-16s]" />
    </div>
  );
}
