"use client";

import { useContext } from "react";
import { WalkthroughContext } from "@/components/walkthrough/walkthrough-provider";

export function useWalkthrough() {
  return useContext(WalkthroughContext);
}
