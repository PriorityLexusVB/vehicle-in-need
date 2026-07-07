export type ChipTone = "neutral" | "brand" | "success" | "warning" | "danger";
export type ChipSize = "sm" | "md";

const toneClasses: Record<ChipTone, { active: string; idle: string }> = {
  neutral: {
    active: "border-stone-900 bg-stone-900 text-white shadow-sm",
    idle: "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50",
  },
  brand: {
    active: "border-stone-950 bg-stone-950 text-white shadow-sm",
    idle: "border-stone-200 bg-white text-stone-700 hover:border-stone-400 hover:bg-stone-50",
  },
  success: {
    active: "border-emerald-700 bg-emerald-700 text-white shadow-sm",
    idle: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100",
  },
  warning: {
    active: "border-amber-600 bg-amber-500 text-stone-950 shadow-sm",
    idle: "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100",
  },
  danger: {
    active: "border-red-700 bg-red-700 text-white shadow-sm",
    idle: "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100",
  },
};

const sizeClasses: Record<ChipSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export function chipClasses({
  active = false,
  tone = "neutral",
  size = "sm",
  className = "",
}: {
  active?: boolean;
  tone?: ChipTone;
  size?: ChipSize;
  className?: string;
} = {}) {
  return [
    "inline-flex items-center justify-center gap-1.5 rounded-full border font-semibold transition-colors",
    sizeClasses[size],
    active ? toneClasses[tone].active : toneClasses[tone].idle,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
