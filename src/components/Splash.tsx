/**
 * Server-rendered first paint while the app's JavaScript loads (the real screens need browser-only saved state).
 * Mirrors the start screen's top so nothing jumps: header space, the card-fan space (the cards deal in once the app
 * is live) and the title. "Imposter" is the brand in every language, so no translation is needed here.
 */
export function Splash() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-safe pb-safe" aria-busy="true">
      <div className="mb-6 h-13 short:mb-3 tiny:mb-1" />
      <div className="-mt-4 mb-2 text-center">
        <div className="h-36" />
        <p className="mt-3 text-5xl font-bold tracking-tight text-primary-ink">Imposter</p>
      </div>
    </main>
  );
}
