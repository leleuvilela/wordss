import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "mocha" | "latte";

/**
 * Terminal-prompt brand mark (Leleu Vilela design system).
 * Geometry baked from assets/mark.svg; colors resolve from the
 * Catppuccin tokens so the mark re-themes with the page. The
 * cursor blinks via the `lv-cursor` class (reduced-motion gated).
 */
function LvMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <rect
        x="4"
        y="4"
        width="88"
        height="88"
        rx="24"
        fill="var(--ctp-crust)"
        stroke="var(--ctp-surface1)"
        strokeWidth="1"
      />
      <g transform="translate(-5 2)">
        <path
          d="M24 37 L35 48 L24 59"
          stroke="var(--ctp-mauve)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M47 33 V57.5 Q47 63 52.5 63"
          stroke="var(--ctp-text)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M58 43 L65.5 63 L73 43"
          stroke="var(--ctp-text)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <rect
          className="lv-cursor"
          x="79"
          y="25"
          width="6"
          height="42"
          rx="2"
          fill="var(--ctp-green)"
        />
      </g>
    </svg>
  );
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem("theme") === "latte" ? "latte" : "mocha",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((t) => (t === "mocha" ? "latte" : "mocha")),
  };
}

export function Header() {
  const { theme, toggle } = useTheme();

  return (
    <header className="flex items-center gap-3 border-b border-surface0 bg-mantle px-6 py-3">
      <LvMark size={36} />
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-base font-semibold leading-none tracking-tight text-fg">
          word<span className="text-mauve">ss</span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-overlay1">
          caça-palavras infinito
        </span>
      </div>
      <Button
        onClick={toggle}
        size="icon"
        variant="ghost"
        className="ml-auto text-subtext0 hover:text-fg"
        aria-label={
          theme === "mocha" ? "mudar para tema claro" : "mudar para tema escuro"
        }
      >
        {theme === "mocha" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
      </Button>
    </header>
  );
}
