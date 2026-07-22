'use client';

import { useEffect, useMemo, useState } from 'react';
import { EVENTS, Joyride, STATUS, type EventData, type Step } from 'react-joyride';

const ACTIVE_TOUR_USER_KEY = 'meliusai:product-tour:active-user';
const TOUR_EVENT_NAME = 'meliusai:product-tour:change';
const TOUR_STATE_PREFIX = 'meliusai:product-tour:state:';
const TOUR_COMPLETED_PREFIX = 'meliusai:product-tour:completed:';

export type ProductTourStep = 0 | 1 | 2 | 3 | 4 | 5;

type StoredProductTourState = {
  userId: string;
  stepIndex: ProductTourStep;
  run: boolean;
  projectId: string | null;
};

function getTourStateKey(userId: string) {
  return `${TOUR_STATE_PREFIX}${userId}`;
}

function getTourCompletedKey(userId: string) {
  return `${TOUR_COMPLETED_PREFIX}${userId}`;
}

function emitTourChange() {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT_NAME));
}

function readTourStateForUser(userId: string): StoredProductTourState | null {
  try {
    const value = window.localStorage.getItem(getTourStateKey(userId));
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as Partial<StoredProductTourState>;
    if (
      parsed.userId !== userId ||
      typeof parsed.stepIndex !== 'number' ||
      parsed.stepIndex < 0 ||
      parsed.stepIndex > 5
    ) {
      return null;
    }

    return {
      userId,
      stepIndex: parsed.stepIndex as ProductTourStep,
      run: Boolean(parsed.run),
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : null,
    };
  } catch {
    return null;
  }
}

function readActiveTourState(): StoredProductTourState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const activeUserId = window.localStorage.getItem(ACTIVE_TOUR_USER_KEY);
  if (!activeUserId || hasCompletedProductTour(activeUserId)) {
    return null;
  }

  return readTourStateForUser(activeUserId);
}

function writeTourState(state: StoredProductTourState) {
  window.localStorage.setItem(ACTIVE_TOUR_USER_KEY, state.userId);
  window.localStorage.setItem(getTourStateKey(state.userId), JSON.stringify(state));
  emitTourChange();
}

export function hasCompletedProductTour(userId: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(getTourCompletedKey(userId)) === 'true';
}

export function startProductTour(userId: string) {
  if (typeof window === 'undefined' || !userId || hasCompletedProductTour(userId)) {
    return false;
  }

  const existingState = readTourStateForUser(userId);
  writeTourState(
    existingState
      ? { ...existingState, run: true }
      : { userId, stepIndex: 0, run: true, projectId: null }
  );
  return true;
}

export function pauseProductTour(expectedStep: ProductTourStep) {
  const currentState = readActiveTourState();
  if (!currentState || currentState.stepIndex !== expectedStep) {
    return false;
  }

  writeTourState({ ...currentState, run: false });
  return true;
}

export function resumeProductTour(expectedStep: ProductTourStep) {
  const currentState = readActiveTourState();
  if (!currentState || currentState.stepIndex !== expectedStep) {
    return false;
  }

  writeTourState({ ...currentState, run: true });
  return true;
}

export function advanceProductTour(
  expectedStep: ProductTourStep,
  nextStep: ProductTourStep,
  projectId?: string | null
) {
  const currentState = readActiveTourState();
  if (!currentState || currentState.stepIndex !== expectedStep) {
    return false;
  }

  writeTourState({
    ...currentState,
    stepIndex: nextStep,
    run: true,
    projectId: projectId ?? currentState.projectId,
  });
  return true;
}

export function finishProductTour(expectedStep?: ProductTourStep) {
  const currentState = readActiveTourState();
  if (!currentState || (expectedStep !== undefined && currentState.stepIndex !== expectedStep)) {
    return false;
  }

  window.localStorage.setItem(getTourCompletedKey(currentState.userId), 'true');
  window.localStorage.removeItem(getTourStateKey(currentState.userId));
  window.localStorage.removeItem(ACTIVE_TOUR_USER_KEY);
  emitTourChange();
  return true;
}

function getProjectTourTarget(projectId: string | null, targetName: string) {
  if (typeof document === 'undefined') {
    return null;
  }

  const projectCards = Array.from(document.querySelectorAll<HTMLElement>('[data-tour-project-id]'));
  const matchingCard = projectId
    ? projectCards.find((element) => element.dataset.tourProjectId === projectId)
    : projectCards[0];

  return matchingCard?.querySelector<HTMLElement>(`[data-tour="${targetName}"]`) ?? null;
}

function ActionInstruction({ children }: { children: string }) {
  return (
    <div>
      <p className="m-0 text-sm leading-6 text-slate-200">{children}</p>
      <p className="mb-0 mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
        Complete the highlighted action to continue
      </p>
    </div>
  );
}

export function ProductTour() {
  const [tourState, setTourState] = useState<StoredProductTourState | null>(null);

  useEffect(() => {
    const syncTourState = () => setTourState(readActiveTourState());
    syncTourState();
    window.addEventListener(TOUR_EVENT_NAME, syncTourState);
    window.addEventListener('storage', syncTourState);

    return () => {
      window.removeEventListener(TOUR_EVENT_NAME, syncTourState);
      window.removeEventListener('storage', syncTourState);
    };
  }, []);

  const steps = useMemo<Step[]>(
    () => [
      {
        id: 'profile-setup',
        target: '[data-tour="edit-profile"]',
        title: "Let's setup your Melius Profile",
        content: (
          <ActionInstruction>
            Click here to add your username, display name, and bio. This makes your profile more searchable and interactive.
          </ActionInstruction>
        ),
        placement: 'bottom-end',
        buttons: [],
      },
      {
        id: 'developer-profile',
        target: '[data-tour="developer-profile-nav"]',
        title: 'Define your technical identity',
        content: (
          <ActionInstruction>
            Open this page and fill in your developer profile. This makes your profile detailed, dynamic, and understandable to recruiters and peers.
          </ActionInstruction>
        ),
        placement: 'right',
        buttons: [],
      },
      {
        id: 'project-upload',
        target: '[data-tour="project-upload"]',
        title: 'Initialize your Baseline',
        content: (
          <ActionInstruction>
            Upload your first project codebase here to get it audited by the MeliusAI engine.
          </ActionInstruction>
        ),
        placement: 'bottom-end',
        buttons: [],
      },
      {
        id: 'verification-trigger',
        target: () => getProjectTourTarget(tourState?.projectId ?? null, 'project-verify'),
        title: 'Run the Audit',
        content: (
          <ActionInstruction>
            Click this to run the deep architectural analysis on your code.
          </ActionInstruction>
        ),
        placement: 'top',
        buttons: [],
      },
      {
        id: 'report',
        target: () => getProjectTourTarget(tourState?.projectId ?? null, 'project-thumbnail'),
        title: 'View your Results',
        content: (
          <ActionInstruction>
            Click your project thumbnail to open and read your comprehensive audit report.
          </ActionInstruction>
        ),
        placement: 'top',
        buttons: [],
      },
      {
        id: 'share-score',
        target: '[data-tour="share-score"]',
        title: 'Show off your skills',
        content: (
          <div>
            <p className="m-0 text-sm leading-6 text-slate-200">
              Share your verified score to your network.
            </p>
            <p className="mb-0 mt-3 text-xs font-medium text-slate-400">
              Sharing is optional. Choose Skip to finish the tour without posting.
            </p>
          </div>
        ),
        placement: 'top-end',
        buttons: ['skip'],
      },
    ],
    [tourState?.projectId]
  );

  function handleTourEvent(event: EventData) {
    if (
      event.type === EVENTS.TOUR_END &&
      (event.status === STATUS.FINISHED || event.status === STATUS.SKIPPED)
    ) {
      finishProductTour(5);
    }
  }

  return (
    <Joyride
      run={Boolean(tourState?.run)}
      stepIndex={tourState?.stepIndex ?? 0}
      steps={steps}
      continuous
      scrollToFirstStep
      onEvent={handleTourEvent}
      locale={{
        next: 'Next',
        nextWithProgress: 'Next ({current} of {total})',
        skip: 'Skip',
      }}
      options={{
        arrowColor: '#0f172a',
        backgroundColor: '#0f172a',
        blockTargetInteraction: false,
        disableFocusTrap: true,
        dismissKeyAction: false,
        overlayClickAction: false,
        overlayColor: 'rgba(2, 6, 23, 0.78)',
        primaryColor: '#0ea5e9',
        showProgress: true,
        skipBeacon: true,
        spotlightPadding: 8,
        spotlightRadius: 12,
        targetWaitTimeout: 15000,
        textColor: '#f8fafc',
        width: 380,
        zIndex: 12000,
      }}
      styles={{
        tooltip: {
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.62)',
          padding: 0,
        },
        tooltipContainer: {
          textAlign: 'left',
        },
        tooltipTitle: {
          color: '#ffffff',
          fontSize: 17,
          fontWeight: 650,
          lineHeight: 1.35,
        },
        tooltipContent: {
          padding: '12px 20px 18px',
        },
        tooltipFooter: {
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          margin: 0,
          padding: '14px 20px 18px',
        },
        buttonPrimary: {
          backgroundColor: '#0ea5e9',
          borderRadius: 999,
          color: '#020617',
          fontSize: 13,
          fontWeight: 700,
          padding: '10px 18px',
        },
        buttonSkip: {
          backgroundColor: '#0ea5e9',
          border: '1px solid rgba(125, 211, 252, 0.9)',
          borderRadius: 999,
          boxShadow: '0 0 24px rgba(14, 165, 233, 0.35)',
          color: '#020617',
          fontSize: 13,
          fontWeight: 800,
          padding: '10px 20px',
        },
        spotlight: {
          stroke: 'rgba(56, 189, 248, 0.9)',
          strokeWidth: 2,
        },
      }}
    />
  );
}
