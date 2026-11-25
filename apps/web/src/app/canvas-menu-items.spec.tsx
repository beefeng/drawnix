import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { CanvasMenuItems } from './canvas-menu-items';

describe('CanvasMenuItems', () => {
  it('creates a canvas and opens the canvas list from the app menu', () => {
    const onCreate = vi.fn();
    const onOpenList = vi.fn();
    render(
      <CanvasMenuItems activeBoardName="设计稿" onCreate={onCreate} onOpenList={onOpenList} />
    );

    fireEvent.click(screen.getByRole('button', { name: '新建画布' }));
    expect(onCreate).toHaveBeenCalledTimes(1);

    const listItem = screen.getByRole('button', { name: /画布列表/ });
    expect(listItem.textContent).toContain('设计稿');
    fireEvent.click(listItem);
    expect(onOpenList).toHaveBeenCalledTimes(1);
  });
});
