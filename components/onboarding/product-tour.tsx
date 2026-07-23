'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ACTIONS, EVENTS, Joyride, STATUS, type EventData, type Step } from 'react-joyride';

const ACTIVE_TOUR_USER_KEY = 'meliusai:product-tour:active-user';
export const PRODUCT_TOUR_CHANGE_EVENT_NAME = 'meliusai:product-tour:change';
export const PRODUCT_TOUR_COMPLETE_EVENT_NAME = 'meliusai:product-tour:complete';
const PRODUCT_TOUR_VERSION = 3;
const TOUR_STATE_PREFIX = 'meliusai:product-tour:state:';
const TOUR_COMPLETED_PREFIX = 'meliusai:product-tour:completed:';

export type ProductTourStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

type ProductTourJoyrideStep = Step & {
  /**
   * Documents action-only steps while `buttons: []` enforces the behavior in
   * the installed react-joyride version.
  */
  hideNextButton?: boolean;
  /** Legacy Joyride naming retained as a declarative step marker. */
  disableOverlay?: boolean;
  /** Legacy Joyride naming retained as a declarative step marker. */
  hideFooter?: boolean;
};

type StoredProductTourState = {
  version: typeof PRODUCT_TOUR_VERSION;
  userId: string;
  stepIndex: ProductTourStep;
  run: boolean;
  projectId: string | null;
};

type ProductTourProps = {
  isAuthenticated: boolean;
  isNewUser: boolean;
  userId: string | null;
};

function getTourStateKey(userId: string) {
  return `${TOUR_STATE_PREFIX}${userId}`;
}

function getTourCompletedKey(userId: string) {
  return `${TOUR_COMPLETED_PREFIX}${userId}`;
}

function emitTourChange() {
  window.dispatchEvent(new CustomEvent(PRODUCT_TOUR_CHANGE_EVENT_NAME));
}

function readTourStateForUser(userId: string): StoredProductTourState | null {
  try {
    const value = window.localStorage.getItem(getTourStateKey(userId));
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as Partial<Omit<StoredProductTourState, 'version'>> & {
      version?: number;
    };
    if (parsed.userId !== userId || typeof parsed.stepIndex !== 'number') {
      return null;
    }

    let migratedStepIndex: number;
    if (parsed.version === PRODUCT_TOUR_VERSION) {
      migratedStepIndex = parsed.stepIndex;
    } else if (parsed.version === 2) {
      migratedStepIndex = parsed.stepIndex + 1;
    } else {
      const expandedLegacyStep = parsed.stepIndex < 2
        ? parsed.stepIndex
        : parsed.stepIndex + 5;
      migratedStepIndex = expandedLegacyStep + 1;
    }

    if (migratedStepIndex < 0 || migratedStepIndex > 12) {
      return null;
    }

    return {
      version: PRODUCT_TOUR_VERSION,
      userId,
      stepIndex: migratedStepIndex as ProductTourStep,
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

export function hasActiveProductTour(userId: string | null | undefined) {
  if (typeof window === 'undefined' || !userId || hasCompletedProductTour(userId)) {
    return false;
  }

  return (
    window.localStorage.getItem(ACTIVE_TOUR_USER_KEY) === userId &&
    readTourStateForUser(userId) !== null
  );
}

export function startProductTour(userId: string) {
  if (typeof window === 'undefined' || !userId || hasCompletedProductTour(userId)) {
    return false;
  }

  const existingState = readTourStateForUser(userId);
  writeTourState(
    existingState
      ? { ...existingState, run: true }
      : {
          version: PRODUCT_TOUR_VERSION,
          userId,
          stepIndex: 0,
          run: true,
          projectId: null,
        }
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

export function resetProductTourStep(
  expectedSteps: readonly ProductTourStep[],
  resetStep: ProductTourStep
) {
  const currentState = readActiveTourState();
  if (!currentState || !expectedSteps.includes(currentState.stepIndex)) {
    return false;
  }

  writeTourState({
    ...currentState,
    stepIndex: resetStep,
    run: true,
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
  window.dispatchEvent(
    new CustomEvent(PRODUCT_TOUR_COMPLETE_EVENT_NAME, {
      detail: { userId: currentState.userId },
    })
  );
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

  if (matchingCard?.matches(`[data-tour="${targetName}"]`)) {
    return matchingCard;
  }

  return matchingCard?.querySelector<HTMLElement>(`[data-tour="${targetName}"]`) ?? null;
}

function ActionInstruction({ children }: { children: string }) {
  return (
    <div>
      <p className="m-0 text-sm leading-6">{children}</p>
      <p className="mb-0 mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
        Complete the highlighted action to continue
      </p>
    </div>
  );
}

function resolveTourTarget(step: Step | undefined) {
  if (!step || typeof document === 'undefined') {
    return null;
  }

  const { target } = step;
  if (typeof target === 'string') {
    const resolvedTarget = document.querySelector<HTMLElement>(target);
    return resolvedTarget?.isConnected ? resolvedTarget : null;
  }

  if (typeof target === 'function') {
    const resolvedTarget = target();
    return resolvedTarget instanceof HTMLElement && resolvedTarget.isConnected ? resolvedTarget : null;
  }

  if (target instanceof HTMLElement && target.isConnected) {
    return target;
  }

  if (target && typeof target === 'object' && 'current' in target) {
    const resolvedTarget = target.current;
    return resolvedTarget instanceof HTMLElement && resolvedTarget.isConnected ? resolvedTarget : null;
  }

  return null;
}

export function ProductTour({ isAuthenticated, isNewUser, userId }: ProductTourProps) {
  const pathname = usePathname();
  const [tourState, setTourState] = useState<StoredProductTourState | null>(null);
  const [targetReadyStep, setTargetReadyStep] = useState<ProductTourStep | null>(null);

  useEffect(() => {
    const syncTourState = () => setTourState(readActiveTourState());
    syncTourState();
    window.addEventListener(PRODUCT_TOUR_CHANGE_EVENT_NAME, syncTourState);
    window.addEventListener('storage', syncTourState);

    return () => {
      window.removeEventListener(PRODUCT_TOUR_CHANGE_EVENT_NAME, syncTourState);
      window.removeEventListener('storage', syncTourState);
    };
  }, []);

  useEffect(() => {
    if (
      pathname === '/resume' &&
      isAuthenticated &&
      isNewUser &&
      userId &&
      tourState?.userId === userId &&
      tourState.stepIndex === 2
    ) {
      advanceProductTour(2, 3);
    }
  }, [
    isAuthenticated,
    isNewUser,
    pathname,
    tourState?.stepIndex,
    tourState?.userId,
    userId,
  ]);

  const steps = useMemo<ProductTourJoyrideStep[]>(
    () => [
      {
        id: 'welcome',
        target: 'body',
        placement: 'center',
        title: (
          <div className="mb-2 text-3xl font-bold text-white">
            🚀 Welcome to MeliusAI
          </div>
        ),
        content: (
          <div className="py-4 text-lg leading-relaxed text-slate-300">
            Let&apos;s calibrate your workspace and get your first project audited. This will only
            take a minute.
          </div>
        ),
        locale: {
          next: 'Get Started →',
        },
        styles: {
          tooltip: {
            width: 500,
            padding: '30px',
          },
        },
        buttons: ['primary'],
      },
      {
        id: 'profile-setup',
        target: '[data-tour="edit-profile"]',
        title: 'Establish Your Identity',
        content: (
          <ActionInstruction>
            Set up your public MeliusAI profile so recruiters and peers know exactly who they are looking at.
          </ActionInstruction>
        ),
        placement: 'bottom-end',
        buttons: [],
      },
      {
        id: 'developer-profile',
        target: '[data-tour="developer-profile-nav"]',
        title: 'Calibrate the Engine',
        content: (
          <ActionInstruction>
            Define your tech stack and experience. This data tailors your architectural audits to your exact skill level.
          </ActionInstruction>
        ),
        placement: 'right',
        buttons: [],
      },
      {
        id: 'edit-metrics',
        target: '#tour-edit-metrics',
        title: 'Set Your Baseline',
        content: (
          <ActionInstruction>
            Define your core details. Let the engine know exactly who is behind the keyboard.
          </ActionInstruction>
        ),
        placement: 'left',
        hideNextButton: true,
        buttons: [],
      },
      {
        id: 'edit-qualifications',
        target: '#tour-edit-qualifications',
        title: 'Validate Your Foundation',
        content: (
          <ActionInstruction>
            Add your degrees and certifications to establish your academic bedrock.
          </ActionInstruction>
        ),
        placement: 'left',
        hideNextButton: true,
        buttons: [],
      },
      {
        id: 'edit-skills',
        target: '#tour-edit-skills',
        title: 'Load Your Arsenal',
        content: (
          <ActionInstruction>
            List your frameworks and languages. Show recruiters exactly what you can build.
          </ActionInstruction>
        ),
        placement: 'left',
        hideNextButton: true,
        buttons: [],
      },
      {
        id: 'edit-experience',
        target: '#tour-edit-experience',
        title: 'Map Your Journey',
        content: (
          <ActionInstruction>
            Log your past roles and projects. Prove your real-world battle scars.
          </ActionInstruction>
        ),
        placement: 'left',
        hideNextButton: true,
        buttons: [],
      },
      {
        id: 'edit-hobbies',
        target: '#tour-edit-hobbies',
        title: 'Humanize Your Code',
        content: (
          <ActionInstruction>
            What do you do away from the screen? Give your profile some personality.
          </ActionInstruction>
        ),
        placement: 'left',
        hideNextButton: true,
        buttons: [],
      },
      {
        id: 'project-upload',
        target: '[data-tour="project-upload"]',
        title: 'Initialize Your Baseline',
        content: (
          <ActionInstruction>
            Time to prove your skills. Drop your first repository here to run a deep architectural audit and generate your baseline score.
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
          </div>
        ),
        placement: 'top-end',
        disableOverlay: true,
        hideOverlay: true,
        hideFooter: true,
        buttons: [],
        styles: {
          tooltip: {
            backgroundColor: 'transparent',
            border: 'none',
            boxShadow: 'none',
            padding: 0,
          },
          tooltipContainer: {
            display: 'none',
          },
        },
      },
      {
        id: 'completion',
        target: 'body',
        placement: 'center',
        title: (
          <div className="mb-2 text-3xl font-bold text-white">
            🎉 Calibration Complete
          </div>
        ),
        content: (
          <div className="py-4 text-lg leading-relaxed text-slate-300">
            Thanks for providing your details. You can now use your MeliusAI cards to showcase your
            verified skills to the network.
          </div>
        ),
        locale: {
          last: 'Enter Workspace ✨',
        },
        styles: {
          tooltip: {
            width: 500,
            padding: '30px',
          },
        },
        buttons: ['primary'],
      },
    ],
    [tourState?.projectId]
  );

  const currentStep = tourState ? steps[tourState.stepIndex] : undefined;

  useEffect(() => {
    if (
      !isAuthenticated ||
      !isNewUser ||
      !userId ||
      tourState?.userId !== userId ||
      !tourState.run ||
      !currentStep
    ) {
      return;
    }

    const activeStepIndex = tourState.stepIndex;
    const syncTargetReadiness = () => {
      setTargetReadyStep(resolveTourTarget(currentStep) ? activeStepIndex : null);
    };

    syncTargetReadiness();
    const observer = new MutationObserver(syncTargetReadiness);
    observer.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [currentStep, isAuthenticated, isNewUser, tourState, userId]);

  const canRunTour = Boolean(
    isAuthenticated &&
      isNewUser &&
      userId &&
      tourState?.userId === userId &&
      tourState.run &&
      targetReadyStep === tourState.stepIndex
  );

  function handleTourEvent(event: EventData) {
    if (event.type === EVENTS.STEP_AFTER && event.action === ACTIONS.NEXT) {
      if (event.index === 0) {
        advanceProductTour(0, 1);
        return;
      }

      if (event.index === 12) {
        finishProductTour(12);
        return;
      }
    }

    if (
      event.type === EVENTS.TOUR_END &&
      (event.status === STATUS.FINISHED || event.status === STATUS.SKIPPED)
    ) {
      finishProductTour(event.status === STATUS.FINISHED ? 12 : undefined);
    }
  }

  if (!canRunTour) {
    return null;
  }

  return (
    <Joyride
      run={canRunTour}
      stepIndex={tourState?.stepIndex ?? 0}
      steps={steps}
      continuous={true}
      scrollToFirstStep
      onEvent={handleTourEvent}
      locale={{
        next: 'Next',
        last: 'Finish',
        skip: 'Skip',
      }}
      options={{
        arrowColor: '#0f172a',
        backgroundColor: '#0f172a',
        blockTargetInteraction: false,
        disableFocusTrap: true,
        dismissKeyAction: false,
        overlayClickAction: false,
        overlayColor: 'rgba(15, 23, 42, 0.6)',
        primaryColor: '#0070f3',
        showProgress: false,
        skipBeacon: true,
        spotlightPadding: 8,
        spotlightRadius: 12,
        targetWaitTimeout: 15000,
        textColor: '#ffffff',
        width: 380,
        zIndex: 12000,
      }}
      styles={{
        tooltip: {
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.62)',
          padding: '24px',
        },
        tooltipContainer: {
          textAlign: 'center',
        },
        tooltipTitle: {
          color: '#ffffff',
          fontSize: 17,
          fontWeight: 650,
          lineHeight: 1.35,
        },
        tooltipContent: {
          color: '#94a3b8',
        },
        tooltipFooter: {
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          margin: 0,
          padding: '14px 20px 18px',
        },
        buttonPrimary: {
          backgroundColor: '#0070f3',
          border: '1px solid rgba(96, 165, 250, 0.7)',
          borderRadius: 999,
          boxShadow: '0 10px 30px rgba(0, 112, 243, 0.32)',
          color: '#ffffff',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.01em',
          outline: 'none',
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
