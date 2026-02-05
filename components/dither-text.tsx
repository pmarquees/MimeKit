"use client";

import { useEffect, useMemo, useState } from "react";

type DitherTextProps = {
  source: string;
  active?: boolean;
  className?: string;
  intervalMs?: number;
};

const DITHER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@%*";

function buildDitherFrame(source: string, frame: number): string {
  return source
    .split("")
    .map((char, index) => {
      if (char === " ") return " ";
      const seed = (frame * 19 + index * 37) % 17;
      if (seed < 7) {
        return DITHER_ALPHABET[(frame * 13 + index * 11) % DITHER_ALPHABET.length];
      }
      return char;
    })
    .join("");
}

export function DitherText({
  source,
  active = true,
  className,
  intervalMs = 72
}: DitherTextProps): React.ReactElement {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }

    const timer = window.setInterval(() => {
      setFrame((value) => value + 1);
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [active, intervalMs]);

  const text = useMemo(() => {
    if (!active) return source;
    return buildDitherFrame(source, frame);
  }, [active, frame, source]);

  return <span className={className}>{text}</span>;
}
