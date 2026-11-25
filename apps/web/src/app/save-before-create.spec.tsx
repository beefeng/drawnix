import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { ComponentProps } from 'react';
import { SaveBeforeCreate } from './save-before-create';

const renderDialog = (overrides: Partial<ComponentProps<typeof SaveBeforeCreate>> = {}) => {
  const props = {
    open: true,
    boardName: '未命名画布',
    saving: false,
    onCancel: vi.fn(),
    onSave: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
  render(<SaveBeforeCreate {...props} />);
  return props;
};

describe('SaveBeforeCreate', () => {
  it('asks whether to save the current canvas before creating another', () => {
    renderDialog();

    expect(screen.getByRole('heading', { name: '先保存当前画布？' })).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('未命名画布');
  });

  it('supports save, skip and cancel actions', () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: '保存并新建' }));
    fireEvent.click(screen.getByRole('button', { name: '不保存，直接新建' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(props.onSkip).toHaveBeenCalledTimes(1);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables actions while saving', () => {
    renderDialog({ saving: true });

    expect((screen.getByRole('button', { name: '正在保存…' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(
      (screen.getByRole('button', { name: '不保存，直接新建' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
