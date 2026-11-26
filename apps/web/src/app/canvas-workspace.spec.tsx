import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import type { useDrawnixBoardStore } from './board-store';
import { CanvasWorkspace } from './canvas-workspace';

vi.mock('@drawnix/drawnix', () => ({
  Drawnix: ({ appMenuItems }: { appMenuItems?: ReactNode }) => (
    <div data-testid="drawnix">{appMenuItems}</div>
  ),
  MenuItem: ({
    children,
    onSelect,
  }: {
    children?: ReactNode;
    onSelect?: (event: Event) => void;
  }) => (
    <button type="button" onClick={() => onSelect?.(new Event('select'))}>
      {children}
    </button>
  ),
  MenuSeparator: () => <hr />,
}));

const createStore = () => {
  const board = {
    id: 'board-one',
    name: '设计稿',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return {
    boards: [board],
    activeBoard: board,
    activeBoardId: board.id,
    value: { children: [] },
    initialToolState: undefined,
    preference: {
      language: 'zh',
      copyTransparent: false,
      exportTransparent: false,
    },
    createBoard: vi.fn(async () => 'board-two'),
    switchBoard: vi.fn(async () => undefined),
    renameBoard: vi.fn(),
    markBoardFileSaved: vi.fn(),
    deleteBoard: vi.fn(async () => undefined),
    updatePreference: vi.fn(),
    handleChange: vi.fn(),
    handleToolStateChange: vi.fn(),
  } as unknown as ReturnType<typeof useDrawnixBoardStore>;
};

describe('CanvasWorkspace', () => {
  it('always renders the canvas management items', () => {
    const store = createStore();
    render(<CanvasWorkspace store={store} />);

    fireEvent.click(screen.getByRole('button', { name: '新建画布' }));
    expect(store.createBoard).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('button', { name: /画布列表/ })).toBeTruthy();
  });
});
