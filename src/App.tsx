import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react';
import { flushSync } from 'react-dom';
import { AGENT_PROMPT, APP_PATHS, TEXT, TIME_LIMITS } from './config';
import { InkFlowBackground } from './features/background/InkFlowBackground';
import { INK_PALETTES, type InkStep } from './features/background/ink-flow-config';
import {
  GlassIsland,
  GlassSurfaceLayer,
  StaticGlassIsland,
  useGlassCapabilities
} from './features/glass/GlassIsland';
import { SegmentedGlassControl } from './features/glass/SegmentedGlassControl';
import { useExpandableSections } from './lib/use-expandable-sections';
import {
  buildTimestamp,
  clearState,
  formatCurrentTime,
  formatDateTime,
  formatDateValue,
  getIdentityLabel,
  getTimeModeLabel,
  loadState,
  parseErrorMessage,
  persistState,
  sanitizeState,
  validateCourseUrl
} from './lib/wizard';
import type { Identity, ManualTime, QrResult, TimeMode, ToastState, WizardState } from './types';

let magicTreeStagePromise: Promise<typeof import('./features/qrcode/MagicTreeStage')> | null = null;
const preloadMagicTreeStage = () => {
  magicTreeStagePromise ??= import('./features/qrcode/MagicTreeStage');
  return magicTreeStagePromise;
};
const MagicTreeStage = lazy(() => preloadMagicTreeStage().then((module) => ({
  default: module.MagicTreeStage
})));

const scheduleMagicTreeStagePreload = () => {
  if (typeof window.requestIdleCallback === 'function') {
    const requestId = window.requestIdleCallback(() => void preloadMagicTreeStage(), { timeout: 1200 });
    return () => window.cancelIdleCallback(requestId);
  }
  const timerId = window.setTimeout(() => void preloadMagicTreeStage(), 280);
  return () => window.clearTimeout(timerId);
};

const NAVIGATION_EVENT = 'ccc:navigate';
const STEP_TRANSITION_DURATION = 520;
const TOAST_EXIT_DURATION = 220;

type StepDirection = 'forward' | 'backward';

type StepAccess =
  | { allowed: true }
  | { allowed: false; fallbackStep: InkStep; message: string };

type StateAction =
  | { type: 'patch'; patch: StatePatch }
  | { type: 'reset' };

type StatePatch = Partial<Omit<WizardState, 'manualTime'>> & { manualTime?: Partial<ManualTime> };

type IconName =
  | 'arrow-left'
  | 'arrow-right'
  | 'bot'
  | 'check'
  | 'copy'
  | 'rotate-ccw'
  | 'user'
  | 'x';

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className}`} aria-hidden="true" focusable="false">
      <use href={`/assets/icons/actions.svg#${name}`} />
    </svg>
  );
}

const stateReducer = (state: WizardState, action: StateAction): WizardState => {
  if (action.type === 'reset') return sanitizeState({});
  return sanitizeState({
    ...state,
    ...action.patch,
    manualTime: action.patch.manualTime
      ? { ...state.manualTime, ...action.patch.manualTime }
      : state.manualTime
  });
};

const readCurrentStep = (): InkStep => {
  const value = Number.parseInt(new URL(window.location.href).searchParams.get('step') ?? '1', 10);
  return value === 2 || value === 3 ? value : 1;
};

const getStepAccess = (state: WizardState, target: InkStep): StepAccess => {
  if (target === 1) return { allowed: true };
  if (!state.identity) {
    return { allowed: false, fallbackStep: 1, message: TEXT.errors.chooseIdentityFirst };
  }
  if (state.identity === 'agent') {
    return { allowed: false, fallbackStep: 1, message: TEXT.errors.agentContinuesLocally };
  }

  const urlValidation = validateCourseUrl(state.url);
  if (!urlValidation.valid) {
    return { allowed: false, fallbackStep: 1, message: urlValidation.message };
  }
  if (target === 2) return { allowed: true };

  try {
    buildTimestamp(state);
    return { allowed: true };
  } catch (error) {
    return {
      allowed: false,
      fallbackStep: 2,
      message: error instanceof Error ? error.message : TEXT.errors.invalidManualTime
    };
  }
};

const navigate = (path: string, message?: string) => {
  const url = new URL(path, window.location.href);
  if (message) {
    url.searchParams.set('message', message);
    url.searchParams.set('type', 'error');
  }
  window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
};

const redirect = (path: string, message?: string) => {
  const url = new URL(path, window.location.href);
  if (message) {
    url.searchParams.set('message', message);
    url.searchParams.set('type', 'error');
  }
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
};

const usePageMessage = (showToast: (message: string) => void) => {
  useEffect(() => {
    const consumeMessage = () => {
      const url = new URL(window.location.href);
      const message = url.searchParams.get('message');
      if (!message) return;
      showToast(message);
      url.searchParams.delete('message');
      url.searchParams.delete('type');
      window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
    };
    consumeMessage();
    window.addEventListener('popstate', consumeMessage);
    window.addEventListener(NAVIGATION_EVENT, consumeMessage);
    return () => {
      window.removeEventListener('popstate', consumeMessage);
      window.removeEventListener(NAVIGATION_EVENT, consumeMessage);
    };
  }, [showToast]);
};

const useCurrentStep = () => {
  const [currentStep, setCurrentStep] = useState<InkStep>(readCurrentStep);
  const currentStepRef = useRef(currentStep);
  const transitionRef = useRef<ViewTransition | null>(null);
  const cleanupTimerRef = useRef<number>(0);

  useEffect(() => {
    const clearTransitionState = () => {
      window.clearTimeout(cleanupTimerRef.current);
      document.documentElement.removeAttribute('data-step-direction');
      document.documentElement.removeAttribute('data-step-transition');
    };

    const syncStep = () => {
      const nextStep = readCurrentStep();
      const previousStep = currentStepRef.current;
      if (nextStep === previousStep) return;

      const direction: StepDirection = nextStep > previousStep ? 'forward' : 'backward';
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const commit = () => {
        flushSync(() => {
          currentStepRef.current = nextStep;
          setCurrentStep(nextStep);
        });
      };

      transitionRef.current?.skipTransition();
      clearTransitionState();
      document.documentElement.dataset.stepDirection = direction;

      if (reducedMotion) {
        commit();
        clearTransitionState();
        return;
      }

      if (typeof document.startViewTransition !== 'function') {
        document.documentElement.dataset.stepTransition = 'fallback';
        commit();
        cleanupTimerRef.current = window.setTimeout(clearTransitionState, STEP_TRANSITION_DURATION);
        return;
      }

      document.documentElement.dataset.stepTransition = 'native';
      const transition = document.startViewTransition(commit);
      transitionRef.current = transition;
      void transition.finished.catch(() => undefined).finally(() => {
        if (transitionRef.current !== transition) return;
        transitionRef.current = null;
        clearTransitionState();
      });
    };

    window.addEventListener('popstate', syncStep);
    window.addEventListener(NAVIGATION_EVENT, syncStep);
    return () => {
      window.removeEventListener('popstate', syncStep);
      window.removeEventListener(NAVIGATION_EVENT, syncStep);
      transitionRef.current?.skipTransition();
      transitionRef.current = null;
      clearTransitionState();
    };
  }, []);
  return currentStep;
};

function BootLoader() {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((value) => Math.min(96, value + Math.max(2, Math.round((100 - value) / 6))));
    }, 55);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="boot-loader" aria-label="正在加载">
      <div className="boot-loader__panel">
        <img src="/assets/images/ccc-small.webp" alt="CCC" className="boot-loader__logo" />
        <p>正在准备</p>
        <div
          className="boot-loader__progress"
          role="progressbar"
          aria-label="加载进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <span style={{ width: `${progress}%` }} />
        </div>
        <strong className="boot-loader__percent">{progress}%</strong>
        <div className="boot-loader__hints">
          <p className="boot-loader__hint boot-loader__hint--4">{TEXT.placeholders.bootSlow}</p>
          <p className="boot-loader__hint boot-loader__hint--15">{TEXT.placeholders.bootStalled}</p>
        </div>
      </div>
    </section>
  );
}

interface StepperProps {
  currentStep: InkStep;
  state: WizardState;
  onLocked: (message: string) => void;
}

const STEP_DATA = [
  { number: 1, title: '粘贴链接', description: '选择身份，并粘贴课程链接' },
  { number: 2, title: '确认时间', description: '选择模式，并确认时间' },
  { number: 3, title: '生成二维码', description: '查看结果' }
] as const;

const preloadImage = (src: string) => {
  const image = new Image();
  image.src = src;
  return image.decode?.() ?? Promise.resolve();
};

const preloadApplication = () => {
  const fonts = document.fonts?.ready ?? Promise.resolve();
  const images = [
    '/assets/images/ccc-small.webp',
    '/assets/icons/actions.svg'
  ].map(preloadImage);
  return Promise.allSettled([fonts, ...images]);
};

function StepNumber({ value }: { value: number | string }) {
  const label = typeof value === 'number' ? String(value).padStart(2, '0') : value;
  return (
    <StaticGlassIsland
      shape="panel"
      className="embedded-static-glass step-number"
    >
      <span className="step-number__label">{label}</span>
    </StaticGlassIsland>
  );
}

function Stepper({ currentStep, state: wizardState, onLocked }: StepperProps) {
  const capabilities = useGlassCapabilities();
  const activate = (target: InkStep) => {
    if (target === currentStep) return;
    const access = getStepAccess(wizardState, target);
    if (access.allowed) navigate(APP_PATHS.step(target));
    else onLocked(access.message);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, target: InkStep) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activate(target);
  };

  return (
    <StaticGlassIsland shape="panel" className="stepper-island">
      <section className="stepper" aria-label="步骤进度" data-current-step={currentStep}>
        <div className="stepper-active-indicator" aria-hidden="true">
          <GlassSurfaceLayer
            material={capabilities.material}
            opticsPreset="selectionLens"
            className="stepper-active-indicator__surface"
          />
        </div>
        {STEP_DATA.map((step) => {
          const state = step.number === currentStep ? 'active' : (step.number < currentStep ? 'done' : 'idle');
          const access = getStepAccess(wizardState, step.number);
          const isAvailable = step.number !== currentStep && access.allowed;
          const description = step.number < currentStep ? '已完成' : step.description;
          const card = (
            <article
              className={`step-card is-${state} ${isAvailable ? 'is-clickable-step' : ''} ${step.number !== currentStep && !access.allowed ? 'is-locked-step' : ''}`}
              data-step={step.number}
              aria-current={state === 'active' ? 'step' : undefined}
              aria-label={`跳转到第 ${step.number} 步`}
              role="button"
              tabIndex={0}
              onClick={() => activate(step.number)}
              onKeyDown={(event) => onKeyDown(event, step.number)}
            >
              <StepNumber value={step.number} />
              <span className="step-copy">
                <strong>{step.title}</strong>
                <small>{description}</small>
              </span>
            </article>
          );
          return <div key={step.number} className="step-card-slot">{card}</div>;
        })}
      </section>
    </StaticGlassIsland>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <p>
        本项目以
        <a href="https://github.com/byronwang2005/CCC-Attendance/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT License</a>
        开源，源代码见
        <a href="https://github.com/byronwang2005/CCC-Attendance" target="_blank" rel="noopener noreferrer">GitHub Repository</a>
        。
      </p>
    </footer>
  );
}

function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number>(0);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (toast) closeRef.current?.focus();
  }, [toast]);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  const requestClose = () => {
    if (isClosing) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, TOAST_EXIT_DURATION);
  };

  if (!toast || toast.type === 'success') return null;
  return (
    <div className={`toast ${toast.type} show${isClosing ? ' is-exiting' : ''}`} role="alertdialog" aria-live="assertive" aria-modal="true" onMouseDown={(event) => {
      if (event.target === event.currentTarget) requestClose();
    }}>
      <StaticGlassIsland shape="panel" className="toast-island">
        <div className="toast__window">
          <div className="toast__header">
            <div className="toast__label">提示</div>
            <GlassIsland
              variant="interactive"
              shape="capsule"
              opticsPreset="close"
              className="micro-action-island toast-close-island"
            >
              <button ref={closeRef} type="button" className="toast__close" aria-label="关闭提示" onClick={requestClose}>
                <Icon name="x" />
              </button>
            </GlassIsland>
          </div>
          <div className="toast__message">{toast.message}</div>
        </div>
      </StaticGlassIsland>
    </div>
  );
}

function PageShell({
  currentStep,
  state,
  onLocked,
  children
}: {
  currentStep: InkStep;
  state: WizardState;
  onLocked: (message: string) => void;
  children: ReactNode;
}) {
  const stageStyle = {
    '--ink-stage-background': INK_PALETTES[currentStep].backgroundHex
  } as CSSProperties;

  return (
    <div className="app-stage" data-step={currentStep} style={stageStyle}>
      <InkFlowBackground step={currentStep} />
      <div className="page-shell">
          <StaticGlassIsland shape="capsule" className="masthead-island">
            <header className="masthead" aria-label="站点抬头">
              <img src="/assets/images/ccc-small.webp" className="masthead__logo" alt="CCC" />
              <div className="masthead__copy">
                <h1 className="masthead__title">CCC Attendance</h1>
                <p className="masthead__summary">一个签到码，三步搞定</p>
              </div>
            </header>
          </StaticGlassIsland>
          <div className="workflow-frame">
            <Stepper currentStep={currentStep} state={state} onLocked={onLocked} />
            <main className="wizard-layout">
              <div key={currentStep} className="step-scene">{children}</div>
            </main>
            <Footer />
          </div>
      </div>
    </div>
  );
}

function IdentityStep({
  state,
  update,
  showToast
}: {
  state: WizardState;
  update: (patch: StatePatch) => void;
  showToast: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const humanContentRef = useRef<HTMLDivElement>(null);
  const agentContentRef = useRef<HTMLDivElement>(null);
  const initialIdentity = useRef(state.identity).current;
  const identitySectionRefs = useRef({
    human: humanContentRef,
    agent: agentContentRef
  }).current;
  useExpandableSections(identitySectionRefs, state.identity || null);

  const selectIdentity = (identity: Identity) => update({ identity });
  const copyAgentPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast(TEXT.errors.copyFailed);
    }
  };

  const goNext = () => {
    if (!state.identity) {
      showToast(TEXT.errors.chooseIdentityFirst);
      return;
    }
    if (state.identity !== 'human') return;
    const validation = validateCourseUrl(state.url);
    if (!validation.valid) {
      showToast(validation.message);
      inputRef.current?.focus();
      return;
    }
    update({ url: validation.normalizedUrl });
    persistState({ ...state, url: validation.normalizedUrl });
    navigate(APP_PATHS.time);
  };

  return (
    <>
      <StaticGlassIsland shape="panel" className="task-glass">
      <section className="panel identity-panel">
        <div className="identity-header">
          <h3>先告诉我，您是</h3>
          <SegmentedGlassControl
            selectedIndex={state.identity === 'human' ? 0 : state.identity === 'agent' ? 1 : -1}
            count={2}
            className="identity-buttons"
            role="group"
            ariaLabel="身份选择"
          >
            <button
              type="button"
              className={`identity-btn ${state.identity === 'human' ? 'active' : ''}`}
              aria-pressed={state.identity === 'human'}
              onClick={() => selectIdentity('human')}
            >
              <Icon name="user" />
              <span>人类</span>
            </button>
            <button
              type="button"
              className={`identity-btn ${state.identity === 'agent' ? 'active' : ''}`}
              aria-pressed={state.identity === 'agent'}
              onClick={() => selectIdentity('agent')}
            >
              <Icon name="bot" />
              <span>智能体</span>
            </button>
          </SegmentedGlassControl>
        </div>

        <div
          ref={humanContentRef}
          className={`identity-content expandable-section${initialIdentity === 'human' ? ' is-expanded' : ''}`}
          hidden={initialIdentity !== 'human'}
        >
          <div className="guide-list" role="list" aria-label="人工签到指引">
            <Guide index="01" title="卡准时间">
              最佳签到时间窗口是课程结束前10分钟到课程结束时刻，例如20:00下课时，可优先考虑19:50到20:00。
            </Guide>
            <Guide index="02" title="连接网络">
              网络环境需处于<InlineGlassCode>eduroam</InlineGlassCode>、<InlineGlassCode>UNNC-Living</InlineGlassCode>或<InlineGlassCode>UNNC_IPSec VPN</InlineGlassCode>等校园网络之一。
            </Guide>
            <Guide index="03" title="复制链接">
              用手机浏览器（如Safari）打开
              <a href="https://ccc.nottingham.edu.cn/study/" target="_blank" rel="noopener noreferrer">CCC课程页面</a>
              ，不要用微信内置浏览器。找到要签到的课程，长按“查看详情”，选择“复制链接”。
            </Guide>
            <Guide
              index="04"
              title="粘贴链接"
              extra={(
                <StaticGlassIsland
                  shape="panel"
                  className="embedded-static-glass course-link-input-island"
                >
                  <div className="course-link-input-wrap">
                    <input
                      ref={inputRef}
                      id="urlInput"
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      placeholder="https://ccc.nottingham.edu.cn/study/home/details?id="
                      aria-label="课程详情链接输入框"
                      value={state.url}
                      onChange={(event) => update({ url: event.target.value.trim() })}
                    />
                  </div>
                </StaticGlassIsland>
              )}
            >
              链接格式类似 <InlineGlassCode>https://ccc.nottingham.edu.cn/study/home/details?id=xxxx</InlineGlassCode>。把完整链接粘贴到下方输入框。
            </Guide>
          </div>
        </div>
        <div
          ref={agentContentRef}
          className={`identity-content agent-content expandable-section${initialIdentity === 'agent' ? ' is-expanded' : ''}`}
          hidden={initialIdentity !== 'agent'}
        >
          <p className="agent-hint">把这句话交给智能体，它会引导您在本地完成后续步骤。</p>
          <StaticGlassIsland
            shape="panel"
            className="embedded-static-glass agent-command-island"
          >
            <div className="agent-command">
              <span className="agent-text">{AGENT_PROMPT}</span>
              <GlassIsland
                variant="interactive"
                shape="capsule"
                disabled={copied}
                opticsPreset="action"
                className="action-island compact-action-island copy-action-island"
              >
                <button type="button" className="copy-btn" disabled={copied} onClick={copyAgentPrompt}>
                  <Icon name={copied ? 'check' : 'copy'} />
                  <span>{copied ? '已复制!' : '复制'}</span>
                </button>
              </GlassIsland>
            </div>
          </StaticGlassIsland>
        </div>
      </section>
      </StaticGlassIsland>
      <div className="actions actions-major">
        <GlassIsland
          variant="interactive"
          shape="capsule"
          disabled={state.identity !== 'human' || !state.url.trim()}
          opticsPreset="action"
          className="action-island"
        >
        <button
          type="button"
          className="button-primary"
          disabled={state.identity !== 'human' || !state.url.trim()}
          aria-disabled={state.identity !== 'human' || !state.url.trim()}
          onClick={goNext}
        >
          <span>下一步</span>
          <Icon name="arrow-right" />
        </button>
        </GlassIsland>
      </div>
    </>
  );
}

function Guide({
  index,
  title,
  children,
  extra
}: {
  index: string;
  title: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <article className="guide-card" role="listitem">
      <StepNumber value={index} />
      <div className="guide-card-body">
        <h3>{title}</h3>
        <div className="guide-card-description">{children}</div>
        {extra}
      </div>
    </article>
  );
}

function InlineGlassCode({ children }: { children: ReactNode }) {
  return (
    <StaticGlassIsland
      shape="capsule"
      className="embedded-static-glass inline-code-island"
    >
      <code>{children}</code>
    </StaticGlassIsland>
  );
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function createSelectableWindow() {
  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + TIME_LIMITS.manualWindowMs);
  if (windowStart.getSeconds() > 0 || windowStart.getMilliseconds() > 0) {
    windowStart.setMinutes(windowStart.getMinutes() + 1, 0, 0);
  }
  windowEnd.setSeconds(0, 0);
  return { windowStart, windowEnd };
}

function TimeStep({
  state,
  update,
  showToast
}: {
  state: WizardState;
  update: (patch: StatePatch) => void;
  showToast: (message: string) => void;
}) {
  const [now, setNow] = useState(new Date());
  const windowRange = useMemo(createSelectableWindow, []);
  const manualTimeRef = useRef<HTMLDivElement>(null);
  const initialTimeMode = useRef(state.timeMode).current;
  const timeSectionRefs = useRef({ manual: manualTimeRef }).current;
  useExpandableSections(timeSectionRefs, state.timeMode === 'manual' ? 'manual' : null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => scheduleMagicTreeStagePreload(), []);

  const dateOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    const cursor = new Date(windowRange.windowStart.getFullYear(), windowRange.windowStart.getMonth(), windowRange.windowStart.getDate());
    const end = formatDateValue(windowRange.windowEnd);
    while (formatDateValue(cursor) <= end) {
      const value = formatDateValue(cursor);
      let label = `${value} ${WEEKDAY_LABELS[cursor.getDay()]}`;
      if (value === formatDateValue(windowRange.windowStart)) label += '（今天）';
      else {
        const tomorrow = new Date(windowRange.windowStart);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (value === formatDateValue(tomorrow)) label += '（明天）';
      }
      options.push({ value, label });
      cursor.setDate(cursor.getDate() + 1);
    }
    return options;
  }, [windowRange]);

  const bounds = useMemo(() => {
    const dayStart = new Date(`${state.manualTime.date}T00:00:00`);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    return {
      min: new Date(Math.max(dayStart.getTime(), windowRange.windowStart.getTime())),
      max: new Date(Math.min(dayEnd.getTime(), windowRange.windowEnd.getTime()))
    };
  }, [state.manualTime.date, windowRange]);

  const hourOptions = Array.from({ length: Math.max(0, bounds.max.getHours() - bounds.min.getHours() + 1) }, (_, index) => bounds.min.getHours() + index);
  const selectedHour = Math.min(Math.max(Number.parseInt(state.manualTime.hour, 10) || bounds.min.getHours(), bounds.min.getHours()), bounds.max.getHours());
  const minMinute = selectedHour === bounds.min.getHours() ? bounds.min.getMinutes() : 0;
  const maxMinute = selectedHour === bounds.max.getHours() ? bounds.max.getMinutes() : 59;
  const selectedMinute = Math.min(
    Math.max(Number.parseInt(state.manualTime.minute, 10) || minMinute, minMinute),
    maxMinute
  );
  const minuteOptions = Array.from({ length: Math.max(0, maxMinute - minMinute + 1) }, (_, index) => minMinute + index);

  const updateManual = (patch: Partial<ManualTime>) => {
    const next = { ...state.manualTime, ...patch };
    if (patch.date) {
      const start = patch.date === formatDateValue(windowRange.windowStart) ? windowRange.windowStart : new Date(`${patch.date}T00:00:00`);
      next.hour = String(start.getHours());
      next.minute = String(start.getMinutes());
    } else if (patch.hour) {
      const hour = Number.parseInt(patch.hour, 10);
      const min = hour === bounds.min.getHours() ? bounds.min.getMinutes() : 0;
      const max = hour === bounds.max.getHours() ? bounds.max.getMinutes() : 59;
      next.minute = String(Math.min(Math.max(Number.parseInt(next.minute, 10) || 0, min), max));
    }
    update({ manualTime: next });
  };

  const setMode = (timeMode: TimeMode) => update(timeMode === 'manual'
    ? {
      timeMode,
      manualTime: {
        date: state.manualTime.date,
        hour: String(selectedHour),
        minute: String(selectedMinute)
      }
    }
    : { timeMode });

  const goNext = () => {
    try {
      buildTimestamp(state);
      persistState(state);
      navigate(APP_PATHS.qrcode);
    } catch (error) {
      showToast(error instanceof Error ? error.message : TEXT.errors.invalidManualTime);
      if (state.timeMode === 'manual') document.getElementById('date')?.focus();
    }
  };

  return (
    <>
      <StaticGlassIsland shape="panel" className="task-glass">
      <section className="panel time-panel">
        <div className="panel-header">
          <h3>再选择时间模式</h3>
          <p className="panel-current-time">当前时间 {formatCurrentTime(now)}</p>
        </div>
        <SegmentedGlassControl
          selectedIndex={state.timeMode === 'manual' ? 1 : 0}
          count={2}
          className="radio-grid"
          role="radiogroup"
          ariaLabel="时间模式选择"
        >
          <ChoiceCard selected={state.timeMode === 'auto'} value="auto" onSelect={setMode}>
            <strong>自动（推荐）</strong>
            <small>适合绝大多数情况。</small>
          </ChoiceCard>
          <ChoiceCard selected={state.timeMode === 'manual'} value="manual" onSelect={setMode}>
            <strong>手动</strong>
            <small>自定义签到时间，通常用于提前准备二维码。</small>
          </ChoiceCard>
        </SegmentedGlassControl>
        <div
          ref={manualTimeRef}
          id="manualTime"
          className={`time-grid-shell expandable-section${initialTimeMode === 'manual' ? ' is-expanded' : ''}`}
          hidden={initialTimeMode !== 'manual'}
        >
          <div className="time-grid">
            <div>
              <label htmlFor="date">日期</label>
              <select id="date" value={state.manualTime.date} onChange={(event) => updateManual({ date: event.target.value })}>
                {dateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="hour">时</label>
              <select id="hour" value={String(selectedHour)} onChange={(event) => updateManual({ hour: event.target.value })}>
                {hourOptions.map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="minute">分</label>
              <select id="minute" value={String(selectedMinute)} onChange={(event) => updateManual({ minute: event.target.value })}>
                {minuteOptions.map((minute) => <option key={minute} value={minute}>{String(minute).padStart(2, '0')}</option>)}
              </select>
            </div>
          </div>
        </div>
      </section>
      </StaticGlassIsland>
      <div className="actions">
        <GlassIsland variant="interactive" shape="capsule" opticsPreset="action" className="action-island">
        <button type="button" className="button-secondary" onClick={() => {
          persistState(state);
          navigate(APP_PATHS.index);
        }}>
          <Icon name="arrow-left" />
          <span>返回上一步</span>
        </button>
        </GlassIsland>
        <GlassIsland variant="interactive" shape="capsule" opticsPreset="action" className="action-island">
        <button
          type="button"
          className="button-primary"
          onPointerEnter={() => void preloadMagicTreeStage()}
          onFocus={() => void preloadMagicTreeStage()}
          onClick={goNext}
        >
          <span>下一步</span>
          <Icon name="arrow-right" />
        </button>
        </GlassIsland>
      </div>
    </>
  );
}

function ChoiceCard({
  selected,
  value,
  onSelect,
  children
}: {
  selected: boolean;
  value: TimeMode;
  onSelect: (value: TimeMode) => void;
  children: ReactNode;
}) {
  return (
    <div className="choice-island">
    <label className={`choice-card ${selected ? 'is-selected' : ''}`}>
      <input type="radio" name="mode" value={value} checked={selected} onChange={() => onSelect(value)} />
      <span>{children}</span>
    </label>
    </div>
  );
}

function QrcodeStep({
  state,
  showToast,
  startOver
}: {
  state: WizardState;
  showToast: (message: string) => void;
  startOver: () => void;
}) {
  const [result, setResult] = useState<QrResult>({});
  const validation = useMemo(() => validateCourseUrl(state.url), [state.url]);
  const identityLabel = getIdentityLabel(state.identity);
  const modeLabel = getTimeModeLabel(state);

  useEffect(() => {
    if (!validation.valid) return;
    let active = true;
    let objectUrl = '';

    const generate = async () => {
      let timestamp: number;
      try {
        timestamp = buildTimestamp(state);
      } catch (error) {
        redirect(APP_PATHS.time, error instanceof Error ? error.message : TEXT.errors.invalidManualTime);
        return;
      }

      try {
        const response = await fetch(APP_PATHS.generateApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: validation.normalizedUrl, timestamp })
        });
        if (!response.ok) throw new Error(parseErrorMessage(await response.text()));
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) {
          setResult({
            imageUrl: objectUrl,
            generatedTime: formatDateTime(Date.now()),
            validTime: formatDateTime(timestamp)
          });
        }
      } catch (error) {
        const message = error instanceof Error && error.message === 'Failed to fetch'
          ? TEXT.errors.networkError
          : (error instanceof Error ? error.message : TEXT.errors.qrCodeGenerationFallback);
        if (active) {
          setResult({ message });
          showToast(`二维码生成失败：${message}`);
        }
      }
    };

    void generate();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [state, validation, showToast]);

  return (
    <>
      <StaticGlassIsland shape="panel" className="task-glass receipt-glass">
      <section className="receipt-panel panel">
        <div className={`receipt-result-layout${result.imageUrl ? ' is-ready' : ' is-pending'}`}>
          <div id="qrcode" className="qrcode-stage" aria-label="二维码，就位">
            {result.imageUrl && validation.valid ? (
              <Suspense fallback={<div className="qrcode-placeholder">{TEXT.placeholders.receiptLoading}</div>}>
                <MagicTreeStage imageUrl={result.imageUrl} />
              </Suspense>
            ) : (
              <div className="qrcode-placeholder">
                <div>{result.message ? TEXT.errors.qrCodeGenerationFailed : TEXT.placeholders.qrCodeLoading}</div>
              </div>
            )}
          </div>
          {result.imageUrl && validation.valid && (
            <div className="receipt-summary-island">
              <aside className="receipt-result-summary" aria-live="polite">
                <div className="receipt-result-summary__copy">
                  <h3>{TEXT.status.qrCodeReady}</h3>
                  <p>{TEXT.status.qrCodeHint}</p>
                </div>
                <dl className="receipt-result-summary__details">
                  <div><dt>生成时间</dt><dd>{result.generatedTime}</dd></div>
                  <div><dt>模式</dt><dd>{modeLabel}</dd></div>
                  <div><dt>身份</dt><dd>{identityLabel}</dd></div>
                  <div><dt>课程ID</dt><dd>{validation.scheduleId}</dd></div>
                  <div><dt>有效时间</dt><dd>{result.validTime}</dd></div>
                </dl>
              </aside>
            </div>
          )}
        </div>
      </section>
      </StaticGlassIsland>
      <div className="actions">
        <GlassIsland variant="interactive" shape="capsule" opticsPreset="action" className="action-island">
        <button type="button" className="button-secondary" onClick={() => navigate(APP_PATHS.time)}>
          <Icon name="arrow-left" />
          <span>返回上一步</span>
        </button>
        </GlassIsland>
        <GlassIsland variant="interactive" shape="capsule" opticsPreset="action" className="action-island">
        <button type="button" className="button-secondary" onClick={startOver}>
          <Icon name="rotate-ccw" />
          <span>生成更多</span>
        </button>
        </GlassIsland>
      </div>
    </>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [state, dispatch] = useReducer(stateReducer, undefined, loadState);
  const [toast, setToast] = useState<ToastState | null>(null);
  const isStartingOverRef = useRef(false);
  const currentStep = useCurrentStep();
  const showToast = useCallback((message: string) => setToast({ message, type: 'error' }), []);

  usePageMessage(showToast);

  useEffect(() => {
    persistState(state);
  }, [state]);

  useEffect(() => {
    const delay = new Promise((resolve) => window.setTimeout(resolve, 520));
    void Promise.allSettled([preloadApplication(), delay]).then(() => setReady(true));
  }, []);

  useEffect(() => {
    const canonical = APP_PATHS.step(currentStep);
    const current = `${window.location.pathname}${window.location.search}`;
    if ((window.location.pathname.endsWith('/') || window.location.pathname.endsWith('/index.html')) && !current.includes('message=')) {
      window.history.replaceState({}, '', canonical);
    }
  }, [currentStep]);

  useEffect(() => {
    if (currentStep === 1) {
      isStartingOverRef.current = false;
      return;
    }
    if (isStartingOverRef.current) return;
    const access = getStepAccess(state, currentStep);
    if (!access.allowed) {
      redirect(APP_PATHS.step(access.fallbackStep), access.message);
    }
  }, [currentStep, state]);

  const update = (patch: StatePatch) => dispatch({ type: 'patch', patch });

  if (!ready) return <BootLoader />;

  return (
    <>
      <PageShell currentStep={currentStep} state={state} onLocked={showToast}>
        {currentStep === 1 && <IdentityStep state={state} update={update} showToast={showToast} />}
        {currentStep === 2 && <TimeStep state={state} update={update} showToast={showToast} />}
        {currentStep === 3 && (
          <QrcodeStep
            state={state}
            showToast={showToast}
            startOver={() => {
              isStartingOverRef.current = true;
              clearState();
              dispatch({ type: 'reset' });
              setToast(null);
              navigate(APP_PATHS.index);
            }}
          />
        )}
      </PageShell>
      <Toast key={toast ? `${toast.type}:${toast.message}` : 'none'} toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
