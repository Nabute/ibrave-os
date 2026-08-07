// First-run product tour (driver.js). Completion is stored per VERSION so a
// future release can bump CURRENT_ONBOARDING_VERSION and re-run the tour for
// everyone; completing or skipping the current version silences it.
import { driver, type Config, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

export const CURRENT_ONBOARDING_VERSION = 1;
const STORAGE_KEY = "onboarding_version";

export function hasSeenCurrentTour(): boolean {
  return Number(localStorage.getItem(STORAGE_KEY)) >= CURRENT_ONBOARDING_VERSION;
}

export function markTourSeen(): void {
  localStorage.setItem(STORAGE_KEY, String(CURRENT_ONBOARDING_VERSION));
}

export function resetTour(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Steps target stable data-tour attributes, never CSS structure. */
const STEPS: DriveStep[] = [
  {
    element: '[data-tour="my-day-header"]',
    popover: {
      title: "Welcome to ibrave OS",
      description:
        "My Day is your landing page. Everything shown here needs your action or decision, an empty screen means you're done for the day.",
    },
  },
  {
    element: '[data-tour="my-day-cards"]',
    popover: {
      title: "Your action cards",
      description:
        "Cards match your roles: timesheet status, approvals waiting on you, invoices, sales tasks. Each one links straight to the work.",
    },
  },
  {
    element: '[data-tour="nav"]',
    popover: {
      title: "Navigation",
      description:
        "The sidebar shows only what your roles allow. If a section is missing, that's permissions, not a bug.",
      side: "right",
    },
  },
  {
    element: '[data-tour="timesheet-link"]',
    popover: {
      title: "Your timesheet",
      description:
        "Log hours in 0.25h steps and submit your week. Approved hours flow into invoices, payouts and margin, logging on time keeps everything downstream honest.",
      side: "right",
    },
  },
  {
    element: '[data-tour="preferences-link"]',
    popover: {
      title: "Preferences",
      description:
        "Your account, password, two-factor authentication, theme, and email notification settings live here.",
      side: "right",
    },
  },
  {
    element: '[data-tour="collapse"]',
    popover: {
      title: "More room to work",
      description:
        "Collapse the sidebar to an icon rail whenever you want the whole screen. That's it, enjoy!",
      side: "bottom",
    },
  },
];

/** True once every step's target exists in the DOM. */
export function tourTargetsReady(): boolean {
  return STEPS.every(
    (s) => typeof s.element !== "string" || document.querySelector(s.element)
  );
}

// Single-flight guard: React StrictMode double-fires effects in dev, and two
// concurrent driver instances corrupt each other's (module-level) state.
let activeTour: ReturnType<typeof driver> | null = null;

export function startTour(): void {
  if (activeTour?.isActive()) return;

  // Never present steps whose target didn't render (e.g. slow data): filter,
  // don't fail.
  const steps = STEPS.filter(
    (s) => typeof s.element !== "string" || document.querySelector(s.element)
  );
  if (steps.length === 0) return;

  const finish = () => {
    // Completing OR skipping counts as seen for this version. Marked
    // explicitly in the button handlers, driver's destroy hooks are not
    // reliable across re-mounts.
    markTourSeen();
    tour.destroy();
    activeTour = null;
  };

  const config: Config = {
    steps,
    showProgress: true,
    nextBtnText: "Next",
    prevBtnText: "Previous",
    doneBtnText: "Done",
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 8,
    popoverClass: "ledger-tour",
    onNextClick: () => {
      if (tour.isLastStep()) finish();
      else tour.moveNext();
    },
    onPopoverRender: (popover, { state }) => {
      const isLast =
        state.activeIndex != null && state.activeIndex === steps.length - 1;
      if (isLast) return;
      const skip = document.createElement("button");
      skip.innerText = "Skip";
      skip.className = "driver-popover-skip-btn";
      skip.onclick = finish;
      popover.footerButtons.prepend(skip);
    },
  };

  const tour = driver(config);
  activeTour = tour;
  tour.drive();
}
