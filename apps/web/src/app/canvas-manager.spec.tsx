import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import type { ComponentProps } from 'react';
import { CanvasManager } from './canvas-manager';
import type { BoardMeta } from './board-storage';

const boards: BoardMeta[] = [
  { id: 'one', name: '设计稿', createdAt: Date.now(), updatedAt: Date.now() },
  {
    id: 'two',
    name: '架构图',
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now() - 60_000,
  },
];

const renderManager = (overrides: Partial<ComponentProps<typeof CanvasManager>> = {}) => {
  const props = {
    boards,
    activeBoardId: 'one',
    activeBoard: boards[0],
    onCreate: vi.fn(async () => 'new-board'),
    onSelect: vi.fn(async () => undefined),
    onRename: vi.fn(),
    onDelete: vi.fn(async () => undefined),
    ...overrides,
  };
  render(<CanvasManager {...props} />);
  return props;
};

const openPanel = () => {
  fireEvent.click(screen.getByRole('button', { name: '打开画布列表' }));
};

describe('CanvasManager', () => {
  it('opens the board list and creates a board', async () => {
    const props = renderManager();
    openPanel();

    const panel = screen.getByRole('dialog', { name: '我的画布' });
    expect(screen.getByRole('heading', { name: '我的画布' })).toBeTruthy();
    expect(within(panel).getByText('设计稿')).toBeTruthy();
    expect(within(panel).getByText('架构图')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '新建画布' }));
    });
    expect(props.onCreate).toHaveBeenCalledTimes(1);
  });

  it('selects a board and closes the panel', () => {
    const props = renderManager();
    openPanel();

    fireEvent.click(
      within(screen.getByRole('dialog', { name: '我的画布' }))
        .getByText('架构图')
        .closest('button') as HTMLButtonElement
    );

    expect(props.onSelect).toHaveBeenCalledWith('two');
    expect(screen.queryByRole('heading', { name: '我的画布' })).toBeNull();
  });

  it('renames a board inline', () => {
    const props = renderManager();
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: '重命名画布 设计稿' }));
    const input = screen.getByRole('textbox', { name: '画布名称' });
    fireEvent.change(input, { target: { value: '新版设计稿' } });
    fireEvent.blur(input);

    expect(props.onRename).toHaveBeenCalledWith('one', '新版设计稿');
  });

  it('deletes a board after confirmation', async () => {
    const props = renderManager();
    openPanel();

    fireEvent.click(screen.getByRole('button', { name: '删除画布 设计稿' }));
    expect(screen.getByRole('heading', { name: '删除画布？' })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '删除' }));
    });
    expect(props.onDelete).toHaveBeenCalledWith('one');
  });
});
