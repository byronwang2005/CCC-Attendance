import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedGlassControl } from './SegmentedGlassControl';

afterEach(cleanup);
const options = [{ value: 'a', label: '自动' }, { value: 'disabled', label: '不可用', disabled: true }, { value: 'b', label: '手动' }];
function Control({ change }: { change: (value: string) => void }) {
  const [value, setValue] = useState('a');
  return <SegmentedGlassControl value={value} onValueChange={next => { setValue(next); change(next); }} options={options} ariaLabel="时间模式" />;
}
describe('controlled segmented interaction', () => {
  it('commits each changed selection once and ignores disabled or selected options', async () => {
    const change = vi.fn(), user = userEvent.setup();
    render(<Control change={change} />);
    await user.click(screen.getByRole('radio', { name: '不可用' }));
    await user.click(screen.getByRole('radio', { name: '自动' }));
    expect(change).not.toHaveBeenCalled();
    await user.click(screen.getByRole('radio', { name: '手动' }));
    expect(change).toHaveBeenCalledExactlyOnceWith('b');
    expect(screen.getByRole('radio', { name: '手动' })).toBeChecked();
  });
  it('supports arrow wrapping, Home/End, and roving focus while skipping disabled options', async () => {
    const user = userEvent.setup();
    render(<Control change={vi.fn()} />);
    const auto = screen.getByRole('radio', { name: '自动' }), manual = screen.getByRole('radio', { name: '手动' });
    auto.focus();
    await user.keyboard('{ArrowRight}');
    expect(manual).toHaveFocus(); expect(manual).toBeChecked();
    expect(auto).toHaveAttribute('tabindex', '-1');
    await user.keyboard('{ArrowRight}');
    expect(auto).toHaveFocus(); expect(auto).toBeChecked();
    await user.keyboard('{End}'); expect(manual).toHaveFocus();
    await user.keyboard('{Home}'); expect(auto).toHaveFocus();
  });
});
