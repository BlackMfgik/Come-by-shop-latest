"use client";

import { useThemeStore } from "@/store/themeStore";
import { useHydrated } from "@/hooks/useHydrated";

type AnimationType =
  | "circle-spread"
  | "diag-down-right"
  | "diag-down-left"
  | "wipe-right"
  | "wipe-left"
  | "wipe-up"
  | "wipe-down";

interface ToggleThemeProps {
  duration?: number;
  animationType?: AnimationType;
  className?: string;
}

function getClipPath(
  type: AnimationType,
  expanding: boolean,
): [string, string] {
  switch (type) {
    case "circle-spread": {
      const small = "circle(0% at 50% 50%)";
      const full = "circle(150% at 50% 50%)";
      return expanding ? [small, full] : [full, small];
    }
    case "diag-down-right": {
      const start = "polygon(0 0, 0 0, 0 100%, 0 100%)";
      const end = "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
      return expanding ? [start, end] : [end, start];
    }
    case "diag-down-left": {
      const start = "polygon(100% 0, 100% 0, 100% 100%, 100% 100%)";
      const end = "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
      return expanding ? [start, end] : [end, start];
    }
    case "wipe-right": {
      const start = "inset(0 100% 0 0)";
      const end = "inset(0 0% 0 0)";
      return expanding ? [start, end] : [end, start];
    }
    case "wipe-left": {
      const start = "inset(0 0 0 100%)";
      const end = "inset(0 0 0 0%)";
      return expanding ? [start, end] : [end, start];
    }
    case "wipe-up": {
      const start = "inset(100% 0 0 0)";
      const end = "inset(0% 0 0 0)";
      return expanding ? [start, end] : [end, start];
    }
    case "wipe-down": {
      const start = "inset(0 0 100% 0)";
      const end = "inset(0 0 0% 0)";
      return expanding ? [start, end] : [end, start];
    }
    default:
      return ["circle(0% at 50% 50%)", "circle(150% at 50% 50%)"];
  }
}

export function ToggleTheme({
  duration = 600,
  animationType = "circle-spread",
  className = "",
}: ToggleThemeProps) {
  const { theme, toggle } = useThemeStore();
  const hydrated = useHydrated();
  const isDark = !hydrated || theme === "dark";

  async function handleToggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next = isDark ? "light" : "dark";

    const vt = (
      document as Document & {
        startViewTransition?: (cb: () => void) => Promise<void>;
      }
    ).startViewTransition?.bind(document);

    let originX = "50%";
    let originY = "50%";
    if (animationType === "circle-spread") {
      const rect = (
        e.currentTarget as HTMLButtonElement
      ).getBoundingClientRect();
      originX = `${rect.left + rect.width / 2}px`;
      originY = `${rect.top + rect.height / 2}px`;
    }

    const [from, to] = getClipPath(animationType, next === "dark");
    const circleFrom =
      animationType === "circle-spread"
        ? `circle(0% at ${originX} ${originY})`
        : from;
    const circleTo =
      animationType === "circle-spread"
        ? `circle(170% at ${originX} ${originY})`
        : to;

    const styleId = "__theme-toggle-vt-style";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      @keyframes tt-reveal { from { clip-path: ${circleFrom}; } to { clip-path: ${circleTo}; } }
      @keyframes tt-fade-out { from { opacity: 1; } to { opacity: 0; } }
      ::view-transition-new(root) { animation: tt-reveal ${duration}ms cubic-bezier(0.4,0,0.2,1) both; }
      ::view-transition-old(root) { animation: tt-fade-out ${duration}ms ease both; }
    `;

    if (vt) {
      // Атрибут ставимо синхронно, щоб View Transition зняв знімок нової теми
      await vt(() => {
        document.documentElement.setAttribute("data-theme", next);
        toggle();
      });
    } else {
      toggle();
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`theme-toggle-classic ${className}`}
      aria-label={isDark ? "Увімкнути світлу тему" : "Увімкнути темну тему"}
      title={isDark ? "Світла тема" : "Темна тема"}
    >
      {isDark ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="1em"
          height="1em"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="1em"
          height="1em"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      )}
    </button>
  );
}
