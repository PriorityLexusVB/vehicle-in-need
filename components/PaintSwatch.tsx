import React from "react";
import { exteriorSwatch } from "../src/utils/colorReference";

/**
 * Small square paint chip shown before an exterior color name. Decorative:
 * the color name is always written next to it, so screen readers skip it.
 */
const PaintSwatch: React.FC<{ color: string | null | undefined }> = ({ color }) => {
  const hex = exteriorSwatch(color);
  if (!hex) return null;
  return (
    <span
      aria-hidden="true"
      data-testid="paint-swatch"
      className="mr-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/20 align-[-1px]"
      style={{ backgroundColor: hex }}
    />
  );
};

export default PaintSwatch;
