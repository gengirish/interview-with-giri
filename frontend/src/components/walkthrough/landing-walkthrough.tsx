"use client";

import { useEffect } from "react";
import { WalkthroughProvider } from "./walkthrough-provider";
import { HelpButton } from "./help-button";
import { useWalkthrough } from "@/hooks/use-walkthrough";

function LandingTourTrigger() {
  const { startTourIfNew } = useWalkthrough();

  useEffect(() => {
    startTourIfNew("landing-overview");
  }, [startTourIfNew]);

  return null;
}

export function LandingWalkthrough() {
  return (
    <WalkthroughProvider>
      <LandingTourTrigger />
      <HelpButton />
    </WalkthroughProvider>
  );
}
