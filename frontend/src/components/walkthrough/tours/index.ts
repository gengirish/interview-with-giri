import type { Step } from "react-joyride";

export interface TourDefinition {
  id: string;
  route: string;
  steps: Step[];
  roles?: string[];
}

import { landingTour } from "./landing";
import { dashboardTour } from "./dashboard";
import { jobsTour } from "./jobs";
import { interviewsTour } from "./interviews";
import { interviewDetailTour } from "./interview-detail";
import { reportsTour } from "./reports";
import { compareTour } from "./compare";
import { analyticsTour } from "./analytics";
import { settingsTour } from "./settings";
import { teamTour } from "./team";
import { candidateInterviewTour } from "./candidate-interview";

export const allTours: TourDefinition[] = [
  landingTour,
  dashboardTour,
  jobsTour,
  interviewsTour,
  interviewDetailTour,
  reportsTour,
  compareTour,
  analyticsTour,
  settingsTour,
  teamTour,
  candidateInterviewTour,
];

export function getTourForRoute(
  pathname: string,
  userRole?: string | null
): TourDefinition | null {
  for (const tour of allTours) {
    const routePattern = tour.route;

    if (routePattern.endsWith("/*")) {
      const prefix = routePattern.slice(0, -2);
      if (!pathname.startsWith(prefix)) continue;
    } else if (routePattern.includes("[")) {
      const regex = new RegExp(
        "^" + routePattern.replace(/\[.*?\]/g, "[^/]+") + "$"
      );
      if (!regex.test(pathname)) continue;
    } else {
      if (pathname !== routePattern) continue;
    }

    if (tour.roles && userRole && !tour.roles.includes(userRole)) {
      return null;
    }

    return tour;
  }
  return null;
}
