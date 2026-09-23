import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { STORAGE_KEY, TEXT } from './config';
import { EXPAND_DURATION } from './lib/expandable-section';

const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
const originalStartViewTransition = Object.getOwnPropertyDescriptor(document, 'startViewTransition');

const installViewTransitionMock = () => {
  const transitions: Array<{
    resolve: () => void;
    skipTransition: ReturnType<typeof vi.fn>;
  }> = [];
  const startViewTransition = vi.fn((update: ViewTransitionUpdateCallback) => {
    let resolve = () => {};
    const finished = new Promise<void>((done) => {
      resolve = done;
    });
    update();
    const skipTransition = vi.fn(() => resolve());
    transitions.push({ resolve, skipTransition });
    return {
      finished,
      ready: Promise.resolve(),
      skipTransition,
      updateCallbackDone: Promise.resolve()
    } as unknown as ViewTransition;
  });
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: startViewTransition
  });
  return { startViewTransition, transitions };
};

const validWizardState = {
  identity: 'human',
  url: 'https://ccc.nottingham.edu.cn/study/home/details?id=1234',
  timeMode: 'auto'
};

const morphPath = (root: Element | null) => {
  const path = root?.querySelector<SVGPathElement>('svg.morph-icon path');
  expect(path).toBeInTheDocument();
  return path!;
};

describe('CCC Attendance first step', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalAnimate) {
      Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
    if (originalStartViewTransition) {
      Object.defineProperty(document, 'startViewTransition', originalStartViewTransition);
    } else {
      Reflect.deleteProperty(document, 'startViewTransition');
    }
    document.documentElement.removeAttribute('data-step-direction');
    document.documentElement.removeAttribute('data-step-transition');
  });

  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/index.html?step=1');
  });

  it('renders the global boot loader without glass material', () => {
    render(<App />);

    const loader = screen.getByLabelText('正在加载');
    expect(loader.querySelector('.boot-loader__panel')).not.toBeNull();
    expect(loader.querySelector('.glass-island')).toBeNull();
  });

  it('places the open-source metadata in the workflow with safe external links', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();

    const footer = screen.getByRole('contentinfo');
    const workflow = document.querySelector('.workflow-frame');
    const licenseLink = screen.getByRole('link', { name: 'MIT License' });
    const repositoryLink = screen.getByRole('link', { name: 'GitHub Repository' });

    expect(workflow).toContainElement(footer);
    expect(footer.querySelector('.glass-island')).toBeNull();
    expect(licenseLink).toHaveAttribute('href', 'https://github.com/byronwang2005/CCC-Attendance/blob/main/LICENSE');
    expect(repositoryLink).toHaveAttribute('href', 'https://github.com/byronwang2005/CCC-Attendance');
    for (const link of [licenseLink, repositoryLink]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('preserves the identity flow and enables the next action for a course link', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '人类' }));

    const input = screen.getByRole('textbox', { name: '课程详情链接输入框' });
    await user.type(input, 'https://ccc.nottingham.edu.cn/study/home/details?id=1234');

    expect(screen.getByRole('button', { name: '下一步' })).toBeEnabled();
    expect(screen.getByRole('heading', { name: '卡准时间' })).toBeVisible();
  });

  it('switches steps without remounting the global loader', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '人类' }));
    await user.type(
      screen.getByRole('textbox', { name: '课程详情链接输入框' }),
      'https://ccc.nottingham.edu.cn/study/home/details?id=1234'
    );
    await user.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByRole('heading', { name: '再选择时间模式' })).toBeVisible();
    expect(window.location.search).toBe('?step=2');
    expect(screen.queryByLabelText('正在加载')).not.toBeInTheDocument();
  });

  it('keeps the stage fallback background synchronized with every ink palette', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    const stage = document.querySelector<HTMLElement>('.app-stage');
    expect(stage?.style.getPropertyValue('--ink-stage-background')).toBe('#f0f3f4');

    await user.click(screen.getByRole('button', { name: '人类' }));
    await user.type(
      screen.getByRole('textbox', { name: '课程详情链接输入框' }),
      'https://ccc.nottingham.edu.cn/study/home/details?id=1234'
    );
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByRole('heading', { name: '再选择时间模式' })).toBeVisible();
    expect(stage?.style.getPropertyValue('--ink-stage-background')).toBe('#f1f4f1');

    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByRole('button', { name: '生成更多' })).toBeVisible();
    expect(stage?.style.getPropertyValue('--ink-stage-background')).toBe('#f4f2ec');
  });

  it('coordinates forward and backward navigation with one native view transition at a time', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const { startViewTransition, transitions } = installViewTransitionMock();
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    expect(document.querySelector('.stepper')).toHaveAttribute('data-current-step', '1');
    expect(document.querySelectorAll('.stepper-active-indicator')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByRole('heading', { name: '再选择时间模式' })).toBeVisible();
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(document.documentElement).toHaveAttribute('data-step-direction', 'forward');
    expect(document.documentElement).toHaveAttribute('data-step-transition', 'native');
    expect(document.querySelector('.stepper')).toHaveAttribute('data-current-step', '2');

    await user.click(screen.getByRole('button', { name: '返回上一步' }));
    expect(await screen.findByRole('heading', { name: '先告诉我，您是' })).toBeVisible();
    expect(startViewTransition).toHaveBeenCalledTimes(2);
    expect(transitions[0].skipTransition).toHaveBeenCalledOnce();
    expect(document.documentElement).toHaveAttribute('data-step-direction', 'backward');
    expect(document.querySelector('.stepper')).toHaveAttribute('data-current-step', '1');

    await act(async () => transitions[1].resolve());
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute('data-step-direction');
      expect(document.documentElement).not.toHaveAttribute('data-step-transition');
    });
  });

  it('uses the same directional transition for browser history navigation', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    window.history.replaceState({}, '', '/index.html?step=2');
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const { startViewTransition, transitions } = installViewTransitionMock();
    render(<App />);

    expect(await screen.findByRole('heading', { name: '再选择时间模式' }, { timeout: 2000 })).toBeVisible();
    window.history.pushState({}, '', '/index.html?step=1');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(await screen.findByRole('heading', { name: '先告诉我，您是' })).toBeVisible();
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(document.documentElement).toHaveAttribute('data-step-direction', 'backward');
    await act(async () => transitions[0].resolve());
  });

  it('allows the stepper to revisit later steps when the current form state is valid', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    window.history.replaceState({}, '', '/index.html?step=2');
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const { startViewTransition } = installViewTransitionMock();
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: '再选择时间模式' }, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '返回上一步' }));
    expect(await screen.findByRole('heading', { name: '先告诉我，您是' })).toBeVisible();
    expect(startViewTransition).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '跳转到第 2 步' }));
    expect(await screen.findByRole('heading', { name: '再选择时间模式' })).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(startViewTransition).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: '返回上一步' }));
    expect(startViewTransition).toHaveBeenCalledTimes(3);
    await user.click(screen.getByRole('button', { name: '跳转到第 3 步' }));
    expect(await screen.findByRole('button', { name: '生成更多' })).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(startViewTransition).toHaveBeenCalledTimes(4);
  });

  it('allows history navigation to a later step when the current form state is valid', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '人类' }));
    await user.type(
      screen.getByRole('textbox', { name: '课程详情链接输入框' }),
      validWizardState.url
    );

    window.history.pushState({}, '', '/index.html?step=3');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(await screen.findByRole('button', { name: '生成更多' })).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it.each([
    {
      name: 'a missing identity',
      step: 2,
      storedState: undefined,
      fallbackHeading: '先告诉我，您是',
      message: TEXT.errors.chooseIdentityFirst
    },
    {
      name: 'the agent identity',
      step: 2,
      storedState: { identity: 'agent', url: '', timeMode: 'auto' },
      fallbackHeading: '先告诉我，您是',
      message: TEXT.errors.agentContinuesLocally
    },
    {
      name: 'an invalid course URL',
      step: 3,
      storedState: { identity: 'human', url: 'https://example.com/study?id=1234', timeMode: 'auto' },
      fallbackHeading: '先告诉我，您是',
      message: TEXT.errors.invalidCourseUrlDomain
    },
    {
      name: 'an expired manual time',
      step: 3,
      storedState: {
        ...validWizardState,
        timeMode: 'manual',
        manualTime: { date: '2000-01-01', hour: '0', minute: '0' }
      },
      fallbackHeading: '再选择时间模式',
      message: TEXT.errors.manualTimeOutOfRange
    }
  ])('redirects direct navigation with $name to the failing prerequisite', async ({ step, storedState, fallbackHeading, message }) => {
    if (storedState) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));
    window.history.replaceState({}, '', `/index.html?step=${step}`);
    render(<App />);

    expect(await screen.findByRole('heading', { name: fallbackHeading }, { timeout: 2000 })).toBeVisible();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(message);
    expect(window.location.search).toBe(step === 3 && fallbackHeading === '再选择时间模式' ? '?step=2' : '?step=1');
  });

  it('rejects invalid browser history navigation once without looping', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();

    window.history.pushState({}, '', '/index.html?step=2');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(TEXT.errors.chooseIdentityFirst);
    await waitFor(() => expect(window.location.search).toBe('?step=1'));
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
  });

  it('changes steps immediately when reduced motion is enabled', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    const { startViewTransition } = installViewTransitionMock();
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByRole('heading', { name: '再选择时间模式' })).toBeVisible();
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(document.documentElement).not.toHaveAttribute('data-step-direction');
    expect(document.documentElement).not.toHaveAttribute('data-step-transition');
  });

  it('does not restart QR generation when the native step transition settles', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    window.history.replaceState({}, '', '/index.html?step=2');
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    const { transitions } = installViewTransitionMock();
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: '再选择时间模式' }, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '下一步' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await act(async () => transitions[0].resolve());
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('starts over from the QR step without showing a missing-prerequisite error', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    window.history.replaceState({}, '', '/index.html?step=3');
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    let commitTransition = () => {};
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: vi.fn((update: ViewTransitionUpdateCallback) => {
        commitTransition = update;
        return {
          finished: Promise.resolve(),
          ready: Promise.resolve(),
          skipTransition: vi.fn(),
          updateCallbackDone: Promise.resolve()
        } as unknown as ViewTransition;
      })
    });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('button', { name: '生成更多' }, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '生成更多' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await act(async () => commitTransition());

    expect(await screen.findByRole('heading', { name: '先告诉我，您是' })).toBeVisible();
    expect(window.location.search).toBe('?step=1');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
  });

  it('preserves the agent prompt and keeps the next action unavailable', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '智能体' }));

    const prompt = await screen.findByText(/Please read the instruction/);
    const hint = screen.getByText('把这句话交给智能体，它会引导您在本地完成后续步骤。');
    expect(prompt).toBeVisible();
    expect(hint.nextElementSibling).toHaveClass('agent-command-island');
    expect(prompt.closest('.agent-command-island')).toHaveAttribute('data-glass-material');
    const copyIsland = screen.getByRole('button', { name: '复制' }).closest('.copy-action-island');
    expect(copyIsland).toHaveAttribute('data-glass-material');
    expect(copyIsland).toHaveClass('action-island', 'compact-action-island');
    expect(copyIsland).not.toHaveClass('micro-action-island');
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
  });

  it('uses glass material for guide indexes, inline emphasis, and the course link input', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '人类' }));

    const guideNumbers = document.querySelectorAll('.guide-card > .step-number');
    const stepperNumbers = document.querySelectorAll('.step-card > .step-number');
    const inlineCodeIslands = document.querySelectorAll('.inline-code-island[data-glass-material]');
    expect(guideNumbers).toHaveLength(4);
    expect(stepperNumbers).toHaveLength(3);
    expect(document.querySelector('.guide-index-island')).not.toBeInTheDocument();
    expect(inlineCodeIslands).toHaveLength(4);
    expect(screen.getByText('eduroam').closest('.inline-code-island')).toHaveAttribute('data-glass-material');
    expect(screen.getByText('https://ccc.nottingham.edu.cn/study/home/details?id=xxxx').closest('.inline-code-island')).toHaveAttribute('data-glass-material');
    expect(screen.getByRole('textbox', { name: '课程详情链接输入框' }).closest('.course-link-input-island')).toHaveAttribute('data-glass-material');

    for (const island of [
      ...guideNumbers,
      ...stepperNumbers,
      ...inlineCodeIslands,
      document.querySelector('.course-link-input-island'),
      document.querySelector('.agent-command-island')
    ]) {
      expect(island).not.toBeNull();
      expect(island).toHaveClass('glass-island', 'glass-island--content', 'static-glass-island');
      expect(island).not.toHaveClass('layered-glass-island');
      expect(island?.querySelectorAll(':scope > .glass-surface-layer')).toHaveLength(1);
    }

    for (const selector of ['.masthead-island', '.stepper-island', '.task-glass']) {
      expect(document.querySelector(selector)).toHaveClass('static-glass-island', 'glass-island--content');
    }
    expect(document.querySelectorAll('.segmented-glass__rail-surface.static-glass-surface')).toHaveLength(1);
    expect(document.querySelectorAll('.stepper-active-indicator__surface')).toHaveLength(1);
  });

  it('keeps an error toast mounted until its exit animation completes', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '跳转到第 2 步' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).not.toHaveClass('is-exiting');

    await user.click(screen.getByRole('button', { name: '关闭提示' }));
    expect(dialog).toHaveClass('is-exiting');
    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('keeps both identity sections mounted while switching their expandable state', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    const humanGuide = screen.getByRole('heading', { name: '卡准时间', hidden: true });
    const agentPrompt = screen.getByText(/Please read the instruction/);
    expect(humanGuide).not.toBeVisible();
    expect(agentPrompt).not.toBeVisible();

    await user.click(screen.getByRole('button', { name: '人类' }));
    expect(humanGuide).toBeVisible();
    expect(agentPrompt).not.toBeVisible();

    await user.click(screen.getByRole('button', { name: '智能体' }));
    expect(humanGuide).not.toBeVisible();
    expect(agentPrompt).toBeVisible();

    await user.click(screen.getByRole('button', { name: '人类' }));
    expect(humanGuide).toBeVisible();
    expect(agentPrompt).not.toBeVisible();
  });

  it('settles on the latest identity when a switch interrupts an active expansion', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const pendingAnimations: Array<{
      animation: Animation & { cancel: ReturnType<typeof vi.fn> };
      resolve: () => void;
    }> = [];
    const animate = vi.fn(() => {
      let resolve = () => {};
      const finished = new Promise<void>((finish) => {
        resolve = finish;
      });
      const animation = {
        cancel: vi.fn(),
        finished
      } as unknown as Animation & { cancel: ReturnType<typeof vi.fn> };
      pendingAnimations.push({ animation, resolve });
      return animation;
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate
    });

    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '人类' }));
    await waitFor(() => expect(pendingAnimations).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: '智能体' }));
    await waitFor(() => expect(pendingAnimations).toHaveLength(4));
    expect(pendingAnimations[0].animation.cancel).toHaveBeenCalledOnce();
    expect(pendingAnimations[1].animation.cancel).toHaveBeenCalledOnce();

    pendingAnimations[2].resolve();
    pendingAnimations[3].resolve();
    await waitFor(() => expect(pendingAnimations).toHaveLength(6));
    pendingAnimations[4].resolve();
    pendingAnimations[5].resolve();

    await waitFor(() => {
      expect(screen.getByText(/Please read the instruction/)).toBeVisible();
      expect(screen.getByRole('heading', { name: '卡准时间', hidden: true })).not.toBeVisible();
    });
  });

  it('uses the shared expandable state for automatic and manual time modes', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      identity: 'human',
      url: 'https://ccc.nottingham.edu.cn/study/home/details?id=1234',
      timeMode: 'auto'
    }));
    window.history.replaceState({}, '', '/index.html?step=2');
    render(<App />);

    expect(await screen.findByRole('heading', { name: '再选择时间模式' }, { timeout: 2000 })).toBeVisible();
    const dateSelect = document.getElementById('date');
    expect(dateSelect).toBeInstanceOf(HTMLSelectElement);
    expect(dateSelect).not.toBeVisible();

    await user.click(screen.getByText('手动', { selector: 'strong' }));
    expect(dateSelect).toBeVisible();

    await user.click(screen.getByText('自动（推荐）', { selector: 'strong' }));
    expect(dateSelect).not.toBeVisible();
  });

  it('settles on the latest time mode when switches interrupt active animations', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const pendingAnimations: Array<{
      animation: Animation & { cancel: ReturnType<typeof vi.fn> };
      resolve: () => void;
    }> = [];
    const animate = vi.fn(() => {
      let resolve = () => {};
      const finished = new Promise<void>((finish) => {
        resolve = finish;
      });
      const animation = {
        cancel: vi.fn(),
        finished
      } as unknown as Animation & { cancel: ReturnType<typeof vi.fn> };
      pendingAnimations.push({ animation, resolve });
      return animation;
    });
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate
    });
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    window.history.replaceState({}, '', '/index.html?step=2');
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('heading', { name: '再选择时间模式' }, { timeout: 2000 })).toBeVisible();
    const manualTime = document.getElementById('manualTime');
    expect(manualTime).not.toBeNull();
    if (!manualTime) return;

    await user.click(screen.getByRole('radio', { name: /^手动/ }));
    await waitFor(() => expect(pendingAnimations).toHaveLength(2));
    await user.click(screen.getByRole('radio', { name: /^自动/ }));
    await waitFor(() => expect(pendingAnimations).toHaveLength(4));
    expect(pendingAnimations[0].animation.cancel).toHaveBeenCalledOnce();
    expect(pendingAnimations[1].animation.cancel).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('radio', { name: /^手动/ }));
    await waitFor(() => expect(pendingAnimations).toHaveLength(6));
    expect(pendingAnimations[2].animation.cancel).toHaveBeenCalledOnce();
    expect(pendingAnimations[3].animation.cancel).toHaveBeenCalledOnce();
    pendingAnimations[4].resolve();
    pendingAnimations[5].resolve();

    await waitFor(() => expect(manualTime).toHaveClass('is-expanded'));
    expect(screen.getByRole('radio', { name: /^手动/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^自动/ })).not.toBeChecked();
  });

  it('reveals every manual time control when browser animations never finish', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    const stalled = new Promise<void>(() => {});
    const animate = vi.fn(() => ({
      cancel: vi.fn(),
      finished: stalled
    }) as unknown as Animation);
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate
    });
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    window.history.replaceState({}, '', '/index.html?step=2');
    render(<App />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(520);
    });
    expect(screen.getByRole('heading', { name: '再选择时间模式' })).toBeVisible();

    const panel = document.querySelector<HTMLElement>('.time-panel');
    const manualTime = document.getElementById('manualTime');
    expect(panel).not.toBeNull();
    expect(manualTime).not.toBeNull();
    if (!panel || !manualTime) return;

    Object.defineProperties(panel, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 24, writable: true }
    });
    Object.defineProperty(manualTime, 'offsetTop', { configurable: true, value: 360 });
    const scrollTo = vi.fn();
    panel.scrollTo = scrollTo;

    await act(async () => {
      fireEvent.click(screen.getByText('手动', { selector: 'strong' }));
      await Promise.resolve();
    });
    expect(animate).toHaveBeenCalledTimes(2);
    expect(manualTime.style.height).toBe('0px');
    expect(manualTime.style.overflow).toBe('clip');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPAND_DURATION + 100);
    });

    expect(manualTime).toHaveClass('is-expanded');
    expect(manualTime.style.height).toBe('');
    expect(manualTime.style.overflow).toBe('');
    expect(screen.getByRole('combobox', { name: '日期' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '时' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '分' })).toBeVisible();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(panel.scrollTop).toBe(24);
  });

  it('leaves constrained task panel scrolling under user control', async () => {
    const user = userEvent.setup();
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    window.history.replaceState({}, '', '/index.html?step=2');
    render(<App />);

    expect(await screen.findByRole('heading', { name: '再选择时间模式' }, { timeout: 2000 })).toBeVisible();
    const panel = document.querySelector<HTMLElement>('.time-panel');
    const manualTime = document.getElementById('manualTime');
    expect(panel).not.toBeNull();
    expect(manualTime).not.toBeNull();
    if (!panel || !manualTime) return;

    Object.defineProperties(panel, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 24, writable: true }
    });
    Object.defineProperty(manualTime, 'offsetTop', { configurable: true, value: 360 });
    const scrollTo = vi.fn();
    panel.scrollTo = scrollTo;

    await user.click(screen.getByText('手动', { selector: 'strong' }));
    expect(document.getElementById('date')).toBeVisible();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(panel.scrollTop).toBe(24);

    await user.click(screen.getByText('自动（推荐）', { selector: 'strong' }));
    expect(document.getElementById('date')).not.toBeVisible();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(panel.scrollTop).toBe(24);
  });

  it('morphs identity icons and copy feedback in place', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();

    const human = screen.getByRole('button', { name: '人类' });
    const agent = screen.getByRole('button', { name: '智能体' });
    const humanPath = morphPath(human);
    const agentPath = morphPath(agent);
    const initialHuman = humanPath.getAttribute('d');
    const initialAgent = agentPath.getAttribute('d');

    await user.click(human);
    await waitFor(() => expect(humanPath.getAttribute('d')).not.toBe(initialHuman));
    expect(morphPath(human)).toBe(humanPath);
    await user.click(agent);
    await waitFor(() => expect(humanPath.getAttribute('d')).toBe(initialHuman));
    expect(agentPath.getAttribute('d')).not.toBe(initialAgent);

    const copyButton = screen.getByRole('button', { name: '复制' });
    const copyPath = morphPath(copyButton);
    const initialCopy = copyPath.getAttribute('d');
    await user.click(copyButton);
    expect(screen.getByRole('button', { name: '已复制!' })).toBeDisabled();
    await waitFor(() => expect(copyPath.getAttribute('d')).not.toBe(initialCopy));
    expect(morphPath(screen.getByRole('button', { name: '已复制!' }))).toBe(copyPath);
    await waitFor(() => expect(copyPath.getAttribute('d')).toBe(initialCopy), { timeout: 2500 });
    expect(screen.getByRole('button', { name: '复制' })).toBeEnabled();
  });

  it('morphs time-mode icons while keeping the native radios usable', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    window.history.replaceState({}, '', '/index.html?step=2');
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: '再选择时间模式' }, { timeout: 2000 })).toBeVisible();

    const auto = screen.getByRole('radio', { name: /^自动/ });
    const manual = screen.getByRole('radio', { name: /^手动/ });
    const autoPath = morphPath(auto.closest('label'));
    const manualPath = morphPath(manual.closest('label'));
    const initialAuto = autoPath.getAttribute('d');
    const initialManual = manualPath.getAttribute('d');

    await user.click(manual);
    expect(manual).toBeChecked();
    await waitFor(() => expect(manualPath.getAttribute('d')).not.toBe(initialManual));
    expect(autoPath.getAttribute('d')).not.toBe(initialAuto);
    await user.click(auto);
    expect(auto).toBeChecked();
    await waitFor(() => expect(autoPath.getAttribute('d')).toBe(initialAuto));
    expect(manualPath.getAttribute('d')).toBe(initialManual);
    expect(morphPath(auto.closest('label'))).toBe(autoPath);
    expect(morphPath(manual.closest('label'))).toBe(manualPath);

    manual.focus();
    expect(manual).toHaveFocus();
    await user.keyboard(' ');
    expect(manual).toBeChecked();
  });

  it('keeps one step icon mounted through forward and backward navigation', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();

    const stepPath = morphPath(document.querySelector('.masthead__summary'));
    const firstStep = stepPath.getAttribute('d');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByRole('heading', { name: '再选择时间模式' })).toBeVisible();
    await waitFor(() => expect(stepPath.getAttribute('d')).not.toBe(firstStep));
    const secondStep = stepPath.getAttribute('d');
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByRole('button', { name: '生成更多' })).toBeVisible();
    await waitFor(() => expect(stepPath.getAttribute('d')).not.toBe(secondStep));
    await user.click(screen.getByRole('button', { name: '返回上一步' }));
    await waitFor(() => expect(stepPath.getAttribute('d')).toBe(secondStep));
    expect(morphPath(document.querySelector('.masthead__summary'))).toBe(stepPath);
  });

  it.each(['success', 'error'] as const)('morphs QR status from pending to %s', async (outcome) => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    window.history.replaceState({}, '', '/index.html?step=3');
    let finishFetch: (response: Response) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => {
      finishFetch = resolve;
    }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-qr');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    render(<App />);

    expect(await screen.findByRole('button', { name: '生成更多' }, { timeout: 2000 })).toBeVisible();
    const statusPath = morphPath(document.querySelector('.qr-status-mark'));
    const pending = statusPath.getAttribute('d');
    await act(async () => {
      finishFetch(outcome === 'success'
        ? new Response(new Blob(['qr']), { status: 200 })
        : new Response('generation failed', { status: 500 }));
    });
    await waitFor(() => expect(statusPath.getAttribute('d')).not.toBe(pending));
    expect(morphPath(document.querySelector('.qr-status-mark'))).toBe(statusPath);
    if (outcome === 'success') {
      expect(screen.getByText(TEXT.status.qrCodeReady)).toBeVisible();
    } else {
      expect(screen.getByRole('alertdialog')).toHaveTextContent('二维码生成失败');
    }
  });

  it.each([1, 2, 3])('does not render step artwork on step %i', async (step) => {
    if (step > 1) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(validWizardState));
    }
    if (step === 3) {
      vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    }
    window.history.replaceState({}, '', `/index.html?step=${step}`);
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'CCC Attendance' }, { timeout: 2000 })).toBeVisible();
    expect(document.querySelector('.step-artwork')).not.toBeInTheDocument();
    expect(document.querySelector('img[src*="/assets/images/steps/"]')).not.toBeInTheDocument();
  });
});
