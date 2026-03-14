"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Joyride, { ACTIONS, EVENTS, STATUS, type CallBackProps, type Step } from "react-joyride";

import { CustomTooltip } from "./custom-tooltip";
import { allTours, type TourDefinition } from "./tours";

const LS_KEY = "walkthrough_progress";
const SYNC_DEBOUNCE_MS = 2000;
const AUTO_START_DELAY_MS = 800;

interface WalkthroughState {
  completed: Record<string, boolean>;
  skipped: Record<string, boolean>;
  version: number;
}

interface WalkthroughContextValue {
  startTour: (tourId: string) => void;
  startTourIfNew: (tourId: string) => void;
  isCompleted: (tourId: string) => boolean;
  resetTour: (tourId: string) => void;
  resetAll: () => void;
  currentTourId: string | null;
  activeTour: TourDefinition | null;
}

export const WalkthroughContext = createContext<WalkthroughContextValue>({
  startTour: () => {},
  startTourIfNew: () => {},
  isCompleted: () => false,
  resetTour: () => {},
  resetAll: () => {},
  currentTourId: null,
  activeTour: null,
});

function readLocalState(): WalkthroughState {
  if (typeof window === "undefined") {
    return { completed: {}, skipped: {}, version: 1 };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        completed: parsed.completed || {},
        skipped: parsed.skipped || {},
        version: parsed.version || 1,
      };
    }
  } catch {
    // corrupted data
  }
  return { completed: {}, skipped: {}, version: 1 };
}

function writeLocalState(state: WalkthroughState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable
  }
}

interface WalkthroughProviderProps {
  children: React.ReactNode;
  syncToServer?: boolean;
}

export function WalkthroughProvider({
  children,
  syncToServer = false,
}: WalkthroughProviderProps) {
  const [state, setState] = useState<WalkthroughState>(readLocalState);
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [currentTourId, setCurrentTourId] = useState<string | null>(null);
  const [activeTour, setActiveTour] = useState<TourDefinition | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverSyncedRef = useRef(false);

  // Sync FROM server on mount (merge with localStorage)
  useEffect(() => {
    if (!syncToServer || serverSyncedRef.current) return;
    serverSyncedRef.current = true;

    const token = localStorage.getItem("token");
    if (!token) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
    fetch(`${apiUrl}/api/v1/users/me/walkthrough`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((serverState) => {
        if (!serverState) return;
        setState((local) => {
          const merged: WalkthroughState = {
            completed: { ...serverState.completed, ...local.completed },
            skipped: { ...serverState.skipped, ...local.skipped },
            version: 1,
          };
          writeLocalState(merged);
          return merged;
        });
      })
      .catch(() => {});
  }, [syncToServer]);

  // Debounced sync TO server
  const syncToServerDebounced = useCallback(
    (newState: WalkthroughState) => {
      if (!syncToServer) return;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);

      syncTimerRef.current = setTimeout(() => {
        const token = localStorage.getItem("token");
        if (!token) return;

        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";
        fetch(`${apiUrl}/api/v1/users/me/walkthrough`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            completed: newState.completed,
            skipped: newState.skipped,
          }),
        }).catch(() => {});
      }, SYNC_DEBOUNCE_MS);
    },
    [syncToServer]
  );

  const markCompleted = useCallback(
    (tourId: string) => {
      setState((prev) => {
        const next: WalkthroughState = {
          ...prev,
          completed: { ...prev.completed, [tourId]: true },
        };
        writeLocalState(next);
        syncToServerDebounced(next);
        return next;
      });
    },
    [syncToServerDebounced]
  );

  const markSkipped = useCallback(
    (tourId: string) => {
      setState((prev) => {
        const next: WalkthroughState = {
          ...prev,
          skipped: { ...prev.skipped, [tourId]: true },
        };
        writeLocalState(next);
        syncToServerDebounced(next);
        return next;
      });
    },
    [syncToServerDebounced]
  );

  const startTour = useCallback(
    (tourId: string) => {
      const role =
        typeof window !== "undefined" ? localStorage.getItem("role") : null;
      const tour = allTours.find((t) => t.id === tourId);
      if (!tour) return;
      if (tour.roles && role && !tour.roles.includes(role)) return;

      setCurrentTourId(tourId);
      setActiveTour(tour);
      setSteps(tour.steps);
      setRun(true);
    },
    []
  );

  const startTourIfNew = useCallback(
    (tourId: string) => {
      if (state.completed[tourId] || state.skipped[tourId]) return;
      if (currentTourId) return;

      setTimeout(() => {
        startTour(tourId);
      }, AUTO_START_DELAY_MS);
    },
    [state, currentTourId, startTour]
  );

  const isCompleted = useCallback(
    (tourId: string) => !!state.completed[tourId],
    [state]
  );

  const resetTour = useCallback(
    (tourId: string) => {
      setState((prev) => {
        const { [tourId]: _c, ...restCompleted } = prev.completed;
        const { [tourId]: _s, ...restSkipped } = prev.skipped;
        const next: WalkthroughState = {
          ...prev,
          completed: restCompleted,
          skipped: restSkipped,
        };
        writeLocalState(next);
        syncToServerDebounced(next);
        return next;
      });
    },
    [syncToServerDebounced]
  );

  const resetAll = useCallback(() => {
    const next: WalkthroughState = {
      completed: {},
      skipped: {},
      version: 1,
    };
    setState(next);
    writeLocalState(next);
    syncToServerDebounced(next);
  }, [syncToServerDebounced]);

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { status, action, type } = data;

      if (status === STATUS.FINISHED) {
        setRun(false);
        if (currentTourId) markCompleted(currentTourId);
        setCurrentTourId(null);
        setActiveTour(null);
      } else if (status === STATUS.SKIPPED) {
        setRun(false);
        if (currentTourId) markSkipped(currentTourId);
        setCurrentTourId(null);
        setActiveTour(null);
      } else if (type === EVENTS.STEP_AFTER && action === ACTIONS.CLOSE) {
        setRun(false);
        if (currentTourId) markSkipped(currentTourId);
        setCurrentTourId(null);
        setActiveTour(null);
      }
    },
    [currentTourId, markCompleted, markSkipped]
  );

  const contextValue = useMemo(
    () => ({
      startTour,
      startTourIfNew,
      isCompleted,
      resetTour,
      resetAll,
      currentTourId,
      activeTour,
    }),
    [
      startTour,
      startTourIfNew,
      isCompleted,
      resetTour,
      resetAll,
      currentTourId,
      activeTour,
    ]
  );

  return (
    <WalkthroughContext.Provider value={contextValue}>
      {children}
      <Joyride
        steps={steps}
        run={run}
        continuous
        showSkipButton
        showProgress
        scrollToFirstStep
        disableOverlayClose
        tooltipComponent={CustomTooltip}
        callback={handleJoyrideCallback}
        styles={{
          options: {
            zIndex: 10000,
            arrowColor: "#ffffff",
            overlayColor: "rgba(0, 0, 0, 0.4)",
          },
        }}
        locale={{
          back: "Back",
          close: "Close",
          last: "Done",
          next: "Next",
          skip: "Skip tour",
        }}
      />
    </WalkthroughContext.Provider>
  );
}
