import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { FAREWELL_NOTICE, STORAGE_KEY, TEXT } from './config';

const approvedParagraphs = [
  '承蒙诸位一路相伴。据开源社区反馈，本项目现已失效。这一程，便在此收帆。',
  '网站仍将保留，留作这段同行岁月的纪念。来日或辟一面留言墙，容故人题字、过客留声；其余新意，且待来日。',
  '青山不改，绿水长流。诸位珍重，我们江湖再见。'
];

const findNotice = () => screen.findByRole('dialog', { name: '山水有相逢' }, { timeout: 2000 });

const setReducedMotion = (reduce: boolean) => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
};

describe('farewell notice', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/index.html?step=1');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('waits for the initial screen and presents the approved announcement with an accessible title and description', async () => {
    render(<App />);

    expect(screen.getByLabelText('正在加载')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const notice = await findNotice();
    expect(screen.queryByLabelText('正在加载')).not.toBeInTheDocument();
    expect(notice).toHaveAttribute('aria-modal', 'true');
    expect(notice).toHaveAccessibleName('山水有相逢');
    expect(notice).toHaveAccessibleDescription(approvedParagraphs.join(' '));
    expect(FAREWELL_NOTICE).toEqual({ title: '山水有相逢', message: approvedParagraphs.join('\n\n') });
    for (const paragraph of approvedParagraphs) {
      expect(notice).toHaveTextContent(paragraph);
    }
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('does not reopen when moving through the workflow after dismissal', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      identity: 'human',
      url: 'https://ccc.nottingham.edu.cn/study/home/details?id=1234',
      timeMode: 'auto'
    }));
    const user = userEvent.setup();
    render(<App />);
    const notice = await findNotice();

    await user.click(within(notice).getByRole('button', { name: '关闭提示' }));
    await user.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByRole('heading', { name: '再选择时间模式' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '返回上一步' }));
    expect(await screen.findByRole('heading', { name: '先告诉我，您是' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows again on a fresh mount without writing an announcement read flag to storage', async () => {
    const writeStorage = vi.spyOn(Storage.prototype, 'setItem');
    const firstVisit = render(<App />);
    const notice = await findNotice();
    const writesBeforeDismissal = writeStorage.mock.calls.length;

    fireEvent.click(within(notice).getByRole('button', { name: '关闭提示' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writeStorage).toHaveBeenCalledTimes(writesBeforeDismissal);
    firstVisit.unmount();

    render(<App />);
    expect(await findNotice()).toBeVisible();
    expect(writeStorage.mock.calls.every(([key]) => key === STORAGE_KEY)).toBe(true);
    expect(Object.keys(window.sessionStorage)).toEqual([STORAGE_KEY]);
  });

  it.each([
    {
      source: 'a startup URL message',
      path: `/index.html?step=1&message=${encodeURIComponent('请稍后重试')}&type=error`,
      message: '请稍后重试'
    },
    {
      source: 'a missing prerequisite on direct navigation',
      path: '/index.html?step=2',
      message: TEXT.errors.chooseIdentityFirst
    }
  ])('shows $source before the pending announcement', async ({ path, message }) => {
    window.history.replaceState({}, '', path);
    const user = userEvent.setup();
    render(<App />);

    const error = await screen.findByRole('alertdialog', {}, { timeout: 2000 });
    expect(error).toHaveAccessibleName('提示');
    expect(error).toHaveAccessibleDescription(message);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).toHaveLength(1);

    await user.click(within(error).getByRole('button', { name: '关闭提示' }));
    const notice = await findNotice();
    expect(notice).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).toHaveLength(1);
  });

  it('traps keyboard focus, keeps the workflow inert, and restores focus after Escape', async () => {
    const previousFocus = document.createElement('button');
    previousFocus.textContent = 'Previous focus';
    document.body.append(previousFocus);
    previousFocus.focus();
    const user = userEvent.setup();
    const view = render(<App />);

    try {
      const notice = await findNotice();
      const close = within(notice).getByRole('button', { name: '关闭提示' });
      const messageId = notice.getAttribute('aria-describedby');
      expect(messageId).not.toBeNull();
      const message = document.getElementById(messageId!);
      const stage = view.container.querySelector('.app-stage');
      expect(stage).toHaveAttribute('inert');
      expect(close).toHaveFocus();

      await user.tab();
      expect(message).toHaveFocus();
      await user.tab();
      expect(close).toHaveFocus();
      await user.tab({ shift: true });
      expect(message).toHaveFocus();
      await user.tab({ shift: true });
      expect(close).toHaveFocus();

      act(() => previousFocus.focus());
      expect(notice).toContainElement(document.activeElement as HTMLElement);
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(stage).not.toHaveAttribute('inert');
      expect(previousFocus).toHaveFocus();
    } finally {
      previousFocus.remove();
    }
  });

  it('closes from the backdrop without closing for clicks inside the announcement', async () => {
    const user = userEvent.setup();
    render(<App />);
    const notice = await findNotice();

    await user.click(within(notice).getByRole('heading', { name: '山水有相逢' }));
    expect(notice).toBeInTheDocument();
    await user.click(notice);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes immediately with reduced motion enabled', async () => {
    setReducedMotion(true);
    render(<App />);
    const notice = await findNotice();

    fireEvent.click(within(notice).getByRole('button', { name: '关闭提示' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CCC Attendance' })).toHaveFocus();
  });

  it('keeps the modal and inert workflow active for the full exit animation', async () => {
    setReducedMotion(false);
    render(<App />);
    const notice = await findNotice();
    const stage = document.querySelector('.app-stage');
    vi.useFakeTimers();

    fireEvent.click(within(notice).getByRole('button', { name: '关闭提示' }));
    expect(notice).toBeInTheDocument();
    expect(stage).toHaveAttribute('inert');
    await act(async () => { await vi.advanceTimersByTimeAsync(219); });
    expect(notice).toBeInTheDocument();
    expect(stage).toHaveAttribute('inert');
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stage).not.toHaveAttribute('inert');
  });
});
