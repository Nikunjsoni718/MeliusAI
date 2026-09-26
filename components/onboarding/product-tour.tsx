'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  ACTIONS,
  EVENTS,
  Joyride,
  STATUS,
  type EventData,
  type Step,
  type TooltipRenderProps,
} from 'react-joyride';

const ACTIVE_TOUR_USER_KEY = 'meliusai:product-tour:active-user';
export const PRODUCT_TOUR_CHANGE_EVENT_NAME = 'meliusai:product-tour:change';
export const PRODUCT_TOUR_COMPLETE_EVENT_NAME = 'meliusai:product-tour:complete';
export const PRODUCT_TOUR_MOBILE_SIDEBAR_EVENT_NAME = 'meliusai:product-tour:mobile-sidebar';
const PRODUCT_TOUR_VERSION = 4;
const TOUR_STATE_PREFIX = 'meliusai:product-tour:state:';
const TOUR_COMPLETED_PREFIX = 'meliusai:product-tour:completed:';

export type ProductTourStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

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

function shiftForGitHubLinkStep(stepIndex: number) {
  return stepIndex >= 8 ? stepIndex + 1 : stepIndex;
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
    } else if (parsed.version === 3) {
      // Version 4 inserts the GitHub connection action immediately before the
      // former project-upload step. Preserve every completed prior action.
      migratedStepIndex = shiftForGitHubLinkStep(parsed.stepIndex);
    } else if (parsed.version === 2) {
      migratedStepIndex = shiftForGitHubLinkStep(parsed.stepIndex + 1);
    } else {
      const expandedLegacyStep = parsed.stepIndex < 2
        ? parsed.stepIndex
        : parsed.stepIndex + 5;
      migratedStepIndex = shiftForGitHubLinkStep(expandedLegacyStep + 1);
    }

    if (migratedStepIndex < 0 || migratedStepIndex > 13) {
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

export function isProductTourAtStep(
  userId: string | null | undefined,
  expectedStep: ProductTourStep
) {
  const currentState = readActiveTourState();
  return Boolean(
    currentState &&
      currentState.userId === userId &&
      currentState.stepIndex === expectedStep
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
    ? projectCards.find((element) => element.dataset.tourProjectId === projectId) ?? projectCards[0]
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

function GitHubLinkInstruction({ onSkip }: { onSkip: () => void }) {
  return (
    <div>
      <p className="m-0 text-sm leading-6">
        Link GitHub to connect the codebase you want MeliusAI to analyze.
      </p>
      <button
        type="button"
        onClick={onSkip}
        className="mt-3 text-sm font-semibold text-sky-300 underline decoration-sky-300/50 underline-offset-4 transition hover:text-sky-200"
      >
        Don&apos;t have GitHub? Skip
      </button>
      <p className="mb-0 mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">
        Complete the highlighted action to continue
      </p>
    </div>
  );
}

function ProductTourTooltip({
  backProps,
  index,
  isLastStep,
  primaryProps,
  skipProps,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  const { buttons, content, styles, title } = step;
  const showBackButton = buttons.includes('back') && index > 0;
  const showPrimaryButton = buttons.includes('primary');

  return (
    <div
      className="react-joyride__tooltip"
      data-joyride-step={index}
      {...(step.id && { 'data-joyride-id': step.id })}
      style={{ ...styles.tooltip, position: 'relative' }}
      {...tooltipProps}
      {...(title
        ? {
            'aria-labelledby': 'joyride-tooltip-title',
            'aria-describedby': 'joyride-tooltip-content',
          }
        : { 'aria-label': 'Product tour', 'aria-describedby': 'joyride-tooltip-content' })}
    >
      {!isLastStep ? (
        <button
          type="button"
          {...skipProps}
          className="absolute right-3 top-3 z-10 min-h-11 rounded-md px-2 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        />
      ) : null}
      <div
        style={{
          ...styles.tooltipContainer,
          ...(isLastStep ? {} : { paddingRight: 84 }),
        }}
      >
        {title ? (
          <h4 id="joyride-tooltip-title" style={styles.tooltipTitle}>
            {title}
          </h4>
        ) : null}
        <div id="joyride-tooltip-content" style={styles.tooltipContent}>
          {content}
        </div>
      </div>
      {showBackButton || showPrimaryButton ? (
        <div style={styles.tooltipFooter}>
          <div style={styles.tooltipFooterSpacer} />
          {showBackButton ? (
            <button type="button" style={styles.buttonBack} {...backProps} />
          ) : null}
          {showPrimaryButton ? (
            <button type="button" style={styles.buttonPrimary} {...primaryProps} />
          ) : null}
        </div>
      ) : null}
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
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [mobileSidebarReadyStep, setMobileSidebarReadyStep] = useState<ProductTourStep | null>(null);
  const mobileSidebarOpenedByTourRef = useRef(false);
  const centeredScrollRef = useRef<{ step: ProductTourStep; target: HTMLElement } | null>(null);

  useEffect(() => {
    const syncMobileViewport = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };

    window.addEventListener('resize', syncMobileViewport);
    return () => {
      window.removeEventListener('resize', syncMobileViewport);
    };
  }, []);

  useEffect(() => {
    // App Router navigation unmounts the previous route component. Rehydrate
    // from localStorage for the authenticated viewer instead of depending on
    // the prior route's React state.
    const syncTourState = () => {
      const activeTourState = readActiveTourState();
      setTourState(activeTourState?.userId === userId ? activeTourState : null);
    };

    syncTourState();
    window.addEventListener(PRODUCT_TOUR_CHANGE_EVENT_NAME, syncTourState);
    window.addEventListener('storage', syncTourState);

    return () => {
      window.removeEventListener(PRODUCT_TOUR_CHANGE_EVENT_NAME, syncTourState);
      window.removeEventListener('storage', syncTourState);
    };
  }, [userId]);

  const hasPersistedActiveTour = Boolean(
    isAuthenticated && userId && tourState?.userId === userId
  );
  const isTourEligible = isNewUser || hasPersistedActiveTour;

  useEffect(() => {
    if (
      pathname === '/resume' &&
      isAuthenticated &&
      hasPersistedActiveTour &&
      userId &&
      tourState?.userId === userId &&
      tourState.stepIndex === 2
    ) {
      advanceProductTour(2, 3);
    }
  }, [
    hasPersistedActiveTour,
    isAuthenticated,
    pathname,
    tourState?.stepIndex,
    tourState?.userId,
    userId,
  ]);

  const skipGitHubLinkStep = useCallback(() => {
    advanceProductTour(8, 9);
  }, []);

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
        id: 'github-link',
        target: '[data-tour="github-link"]',
        title: 'Connect Your Codebase',
        content: <GitHubLinkInstruction onSkip={skipGitHubLinkStep} />,
        placement: 'bottom-end',
        buttons: [],
      },
      {
        id: 'project-upload',
        target: '[data-tour="project-upload"]',
        title: 'Start an Engineering Audit',
        content: (
          <ActionInstruction>
            Add your first repository to run an evidence-based architectural audit with prioritized engineering findings.
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
        title: 'Share the Audit Report',
        content: (
          <div>
            <p className="m-0 text-sm leading-6 text-slate-200">
              Share the verified findings and engineering directives with your network.
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
    [skipGitHubLinkStep, tourState?.projectId]
  );

  const currentStep = tourState ? steps[tourState.stepIndex] : undefined;

  useEffect(() => {
    const shouldOpenMobileSidebar = Boolean(
      isMobileViewport &&
      isAuthenticated &&
      isTourEligible &&
      pathname !== '/resume' &&
      userId &&
      tourState?.userId === userId &&
      tourState.run &&
      tourState.stepIndex === 2
    );

    if (!shouldOpenMobileSidebar) {
      if (mobileSidebarOpenedByTourRef.current) {
        window.dispatchEvent(
          new CustomEvent(PRODUCT_TOUR_MOBILE_SIDEBAR_EVENT_NAME, { detail: { open: false } })
        );
        mobileSidebarOpenedByTourRef.current = false;
      }
      return;
    }

    const openTimer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(PRODUCT_TOUR_MOBILE_SIDEBAR_EVENT_NAME, { detail: { open: true } })
      );
      mobileSidebarOpenedByTourRef.current = true;
    }, 0);
    const readyTimer = window.setTimeout(() => {
      setMobileSidebarReadyStep(2);
    }, 320);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(readyTimer);
    };
  }, [isAuthenticated, isMobileViewport, isTourEligible, pathname, tourState, userId]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !isTourEligible ||
      !userId ||
      tourState?.userId !== userId ||
      !tourState.run ||
      !currentStep
    ) {
      return;
    }

    const activeStepIndex = tourState.stepIndex;
    const syncTargetReadiness = () => {
      const target = resolveTourTarget(currentStep);
      const isMobileSidebarStep = isMobileViewport && activeStepIndex === 2;
      const sidebarIsOpen =
        target?.closest<HTMLElement>('[data-tour-mobile-sidebar]')?.dataset.tourMobileSidebar === 'open';
      const isReady =
        Boolean(target) &&
        (!isMobileSidebarStep || (sidebarIsOpen && mobileSidebarReadyStep === activeStepIndex));
      setTargetReadyStep(isReady ? activeStepIndex : null);
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
  }, [currentStep, isAuthenticated, isMobileViewport, isTourEligible, mobileSidebarReadyStep, tourState, userId]);

  const activeTourStep = tourState?.stepIndex;
  const canRunTour = Boolean(
    isAuthenticated &&
      isTourEligible &&
      userId &&
      tourState?.userId === userId &&
      tourState.run &&
      (!isMobileViewport || activeTourStep !== 2 || mobileSidebarReadyStep === 2) &&
      targetReadyStep === activeTourStep
  );

  useEffect(() => {
    if (!canRunTour || activeTourStep === undefined || !currentStep) {
      return;
    }

    const target = resolveTourTarget(currentStep);
    // Welcome and completion cards intentionally target the document itself.
    // Scrolling those would unnecessarily reset the user's position.
    if (!target || target === document.body) {
      return;
    }

    const previousScroll = centeredScrollRef.current;
    if (previousScroll?.step === activeTourStep && previousScroll.target === target) {
      return;
    }

    // react-joyride's built-in scrolling is offset-from-top only. Wait for the
    // mounted tooltip and then center the highlighted control so its fields and
    // surrounding context remain visible above and below the tour card.
    const animationFrame = window.requestAnimationFrame(() => {
      if (!target.isConnected) {
        return;
      }

      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
      centeredScrollRef.current = { step: activeTourStep, target };
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [activeTourStep, canRunTour, currentStep]);

  function handleTourEvent(event: EventData) {
    if (event.type === EVENTS.STEP_AFTER && event.action === ACTIONS.NEXT) {
      if (event.index === 0) {
        advanceProductTour(0, 1);
        return;
      }

      if (event.index === 13) {
        finishProductTour(13);
        return;
      }
    }

    if (
      event.type === EVENTS.TOUR_END &&
      (event.status === STATUS.FINISHED || event.status === STATUS.SKIPPED)
    ) {
      finishProductTour(event.status === STATUS.FINISHED ? 13 : undefined);
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
      scrollToFirstStep={false}
      tooltipComponent={ProductTourTooltip}
      floatingOptions={{
        // Floating UI uses these paddings as the viewport boundary for flip
        // and shift, keeping the card fully visible near each screen edge.
        flipOptions: { padding: 24 },
        shiftOptions: { padding: 24 },
      }}
      onEvent={handleTourEvent}
      locale={{
        next: 'Next',
        last: 'Finish',
        skip: 'Skip Tour',
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
        // Centered native scrolling above replaces Joyride's top-aligned
        // scrollOffset behavior for every actionable tour stage.
        skipScroll: true,
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
