"use client";

import { useEffect, useState } from "react";
import { DitherText } from "@/components/dither-text";

const BOOT_DURATION_MS = 420;

export function PageBootLoader(): React.ReactElement | null {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("mk-booting");

    const timer = window.setTimeout(() => {
      setVisible(false);
      root.classList.remove("mk-booting");
    }, BOOT_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
      root.classList.remove("mk-booting");
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="boot-overlay" aria-hidden="true">
      <div className="boot-chip">
        <div className="boot-line">
          <span className="stack-loading-dot" />
          <DitherText source="BOOTING MIMICKIT WORKSPACE" className="boot-text" />
        </div>
      </div>
    </div>
  );
}
