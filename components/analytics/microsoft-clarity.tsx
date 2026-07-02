"use client";

import { useEffect } from "react";
import Clarity from "@microsoft/clarity";

let hasInitializedClarity = false;

export function MicrosoftClarity() {
  useEffect(() => {
    const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

    if (!projectId || hasInitializedClarity) {
      return;
    }

    // Microsoft Clarity is used for anonymous product analytics and session behavior tracking.
    Clarity.init(projectId);
    hasInitializedClarity = true;
  }, []);

  return null;
}
