export function AssetGlassHeroCanvas() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none">
      <video
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover opacity-75 dark:opacity-85 dark:invert dark:hue-rotate-180"
      >
        <source src="/crystal-gears-3d.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background pointer-events-none" />
    </div>
  );
}
