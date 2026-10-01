import React from "react";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
  variant?: "monochrome" | "accented";
}

/**
 * AssetHubBrandLogo:
 * Isotipo geométrico inspirado en los tres cubos interconectados con red de nodos.
 * Optimizado vectorialmente para integrarse con la estética minimalista y moderna de Lumen.
 */
export function AssetHubBrandLogo({
  size = 32,
  className = "",
  variant = "accented",
  ...props
}: LogoProps) {
  // Colores adaptables a dark/light mode con tokens CSS y acento sutil
  const cubeTopColor = variant === "accented" ? "currentColor" : "currentColor";
  const cubeLeftColor = variant === "accented" ? "#2563eb" : "currentColor"; // Azul profesional
  const cubeRightColor = variant === "accented" ? "#f97316" : "currentColor"; // Acento naranja sutil

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Red de conexiones y nodos entre cubos */}
      <g stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" opacity="0.45">
        <line x1="50" y1="28" x2="30" y2="48" />
        <line x1="50" y1="28" x2="70" y2="48" />
        <line x1="30" y1="48" x2="70" y2="48" />
        <line x1="30" y1="68" x2="50" y2="84" />
        <line x1="70" y1="68" x2="50" y2="84" />
        <line x1="18" y1="36" x2="50" y2="12" strokeDasharray="3 3" />
        <line x1="82" y1="36" x2="50" y2="12" strokeDasharray="3 3" />
        <line x1="18" y1="36" x2="30" y2="48" />
        <line x1="82" y1="36" x2="70" y2="48" />
      </g>

      {/* Nodos de red */}
      <circle cx="50" cy="84" r="3" fill="currentColor" opacity="0.8" />
      <circle cx="18" cy="36" r="2.5" fill="currentColor" opacity="0.6" />
      <circle cx="82" cy="36" r="2.5" fill="currentColor" opacity="0.6" />

      {/* CUBO 1: SUPERIOR (Gris/Grafito - Mando central) */}
      <g className="transition-transform duration-300">
        {/* Cara superior */}
        <polygon
          points="50,12 66,21 50,30 34,21"
          fill={cubeTopColor}
          opacity="0.85"
        />
        {/* Cara izquierda */}
        <polygon
          points="34,21 50,30 50,48 34,39"
          fill={cubeTopColor}
          opacity="0.65"
        />
        {/* Cara derecha */}
        <polygon
          points="50,30 66,21 66,39 50,48"
          fill={cubeTopColor}
          opacity="0.45"
        />
        {/* Nodo conector interno */}
        <circle cx="50" cy="30" r="2.2" fill="white" />
      </g>

      {/* CUBO 2: INFERIOR IZQUIERDO (Azul / Activos de infraestructura) */}
      <g className="transition-transform duration-300">
        {/* Cara superior */}
        <polygon
          points="30,48 46,57 30,66 14,57"
          fill={cubeLeftColor}
          opacity="0.9"
        />
        {/* Cara izquierda */}
        <polygon
          points="14,57 30,66 30,84 14,75"
          fill={cubeLeftColor}
          opacity="1"
        />
        {/* Cara derecha */}
        <polygon
          points="30,66 46,57 46,75 30,84"
          fill={cubeLeftColor}
          opacity="0.75"
        />
        {/* Nodo conector interno */}
        <circle cx="30" cy="66" r="2.2" fill="white" />
      </g>

      {/* CUBO 3: INFERIOR DERECHO (Acento cálido / Operaciones & Alertas) */}
      <g className="transition-transform duration-300">
        {/* Cara superior */}
        <polygon
          points="70,48 86,57 70,66 54,57"
          fill={cubeRightColor}
          opacity="0.9"
        />
        {/* Cara izquierda */}
        <polygon
          points="54,57 70,66 70,84 54,75"
          fill={cubeRightColor}
          opacity="0.8"
        />
        {/* Cara derecha */}
        <polygon
          points="70,66 86,57 86,75 70,84"
          fill={cubeRightColor}
          opacity="1"
        />
        {/* Nodo conector interno */}
        <circle cx="70" cy="66" r="2.2" fill="white" />
      </g>
    </svg>
  );
}

export function AssetHubLogoWithText({
  size = 28,
  className = "",
  showBadge = true,
}: {
  size?: number;
  className?: string;
  showBadge?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex items-center justify-center p-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/50 shadow-2xs">
        <AssetHubBrandLogo size={size} />
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className="font-extrabold text-base sm:text-lg tracking-tight text-foreground">
            Asset<span className="text-primary font-black">Hub</span>
          </span>
          {showBadge && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold border border-zinc-200 dark:border-zinc-700">
              PRO
            </span>
          )}
        </div>
        <span className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase mt-0.5">
          Operations
        </span>
      </div>
    </div>
  );
}
