import type { TourDefinition } from "./index";

export const teamTour: TourDefinition = {
  id: "team-page",
  route: "/dashboard/team",
  roles: ["admin"],
  steps: [
    {
      target: '[data-tour="team-list"]',
      title: "Team Members",
      content:
        "View all members in your organization, their roles, and account status.",
      placement: "bottom",
      disableBeacon: true,
    },
    {
      target: '[data-tour="team-invite"]',
      title: "Invite Team Members",
      content:
        "Invite new team members by email. Assign them a role to control their access level.",
      placement: "bottom",
    },
    {
      target: '[data-tour="team-roles"]',
      title: "Role-Based Access",
      content:
        "Admins have full access. Hiring Managers can create jobs and view reports. Viewers have read-only access to interviews and reports.",
      placement: "left",
    },
  ],
};
