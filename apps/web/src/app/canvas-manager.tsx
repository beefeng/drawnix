import { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import type { BoardMeta } from './board-storage';
import './canvas-manager.scss';

type CanvasManagerProps = {
  boards: BoardMeta[];
  activeBoardId: string;
  activeBoard?: BoardMeta;
  onCreate: () => Promise<string>;
  onSelect: (boardId: string) => Promise<void>;
  onRename: (boardId: string, name: string) => void;
  onDelete: (boardId: string) => Promise<void>;
};

const formatBoardTime = (timestamp: number) => {
  const elapsed = Date.now() - timestamp;
  if (elapsed < 60 * 1000) {
    return '刚刚';
  }
  if (elapsed < 60 * 60 * 1000) {
    return `${Math.floor(elapsed / (60 * 1000))} 分钟前`;
  }
  if (elapsed < 24 * 60 * 60 * 1000) {
    return `${Math.floor(elapsed / (60 * 60 * 1000))} 小时前`;
  }
  return new Date(timestamp).toLocaleDateString('zh-CN');
};

const LayersIcon = () => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
    <path
      d="M10 2.6 2.8 6.3 10 10l7.2-3.7L10 2.6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="m3.4 10 6.6 3.4 6.6-3.4M3.4 13.7 10 17.1l6.6-3.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path
      d="m4 6 4 4 4-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path
      d="m4 4 8 8m0-8-8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const PencilIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path
      d="M9.8 3.2 12.8 6.2 5.6 13.4l-3.4.8.8-3.4 6.8-7.6Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="m8.6 4.4 3 3" fill="none" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path
      d="M3.6 4.8h8.8M6.4 4.8V3.2h3.2v1.6M4.8 4.8l.5 8h5.4l.5-8M6.8 7v3.6M9.2 7v3.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <path
      d="M8 3.2v9.6M3.2 8h9.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);

export const CanvasManager = ({
  boards,
  activeBoardId,
  activeBoard,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: CanvasManagerProps) => {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<BoardMeta | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelRenameRef = useRef(false);
  const [isMobileLayout] = useState(() => {
    return (
      typeof window !== 'undefined' &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent)
    );
  });

  useEffect(() => {
    if (!open) {
      setRenamingId(null);
      setDeleteTarget(null);
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (deleteTarget) {
        setDeleteTarget(null);
        return;
      }
      if (renamingId) {
        cancelRenameRef.current = true;
        setRenamingId(null);
        return;
      }
      setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, renamingId, deleteTarget]);

  useEffect(() => {
    if (renamingId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  const startRename = (board: BoardMeta) => {
    setDeleteTarget(null);
    cancelRenameRef.current = false;
    setRenamingId(board.id);
    setDraftName(board.name);
  };

  const commitRename = () => {
    if (!renamingId) {
      return;
    }
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      return;
    }
    onRename(renamingId, draftName);
    setRenamingId(null);
  };

  const handleCreate = async () => {
    if (creating) {
      return;
    }
    setCreating(true);
    try {
      await onCreate();
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    const boardId = deleteTarget.id;
    setDeleteTarget(null);
    await onDelete(boardId);
  };

  return (
    <>
      <button
        type="button"
        className={classNames('canvas-trigger', {
          'canvas-trigger--mobile': isMobileLayout,
        })}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="打开画布列表"
        aria-describedby="canvas-trigger-label"
        onClick={() => setOpen(true)}
      >
        <span className="canvas-trigger__icon">
          <LayersIcon />
        </span>
        <span id="canvas-trigger-label" className="canvas-trigger__label">
          {activeBoard?.name ?? '画布'}
        </span>
        <span className="canvas-trigger__count">{boards.length}</span>
        <span className="canvas-trigger__chevron">
          <ChevronIcon />
        </span>
      </button>

      {open && (
        <div
          className="canvas-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <aside
            className="canvas-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="canvas-panel-title"
          >
            <header className="canvas-panel__head">
              <div>
                <span className="canvas-panel__eyebrow">DRAWING BOARDS</span>
                <h2 id="canvas-panel-title">我的画布</h2>
              </div>
              <button
                type="button"
                className="canvas-panel__close"
                aria-label="关闭画布列表"
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </button>
            </header>

            <div className="canvas-panel__list">
              {boards.map((board) => {
                const isActive = board.id === activeBoardId;
                const isRenaming = board.id === renamingId;
                return (
                  <div
                    key={board.id}
                    className={classNames('canvas-item', {
                      'canvas-item--active': isActive,
                    })}
                  >
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        className="canvas-item__input"
                        value={draftName}
                        maxLength={60}
                        aria-label="画布名称"
                        onChange={(event) => setDraftName(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            cancelRenameRef.current = true;
                            setRenamingId(null);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="canvas-item__select"
                        aria-current={isActive ? 'true' : undefined}
                        onClick={() => {
                          setOpen(false);
                          void onSelect(board.id);
                        }}
                      >
                        <span className="canvas-item__name">{board.name}</span>
                        <span className="canvas-item__meta">
                          {formatBoardTime(board.updatedAt)}
                          {isActive && <span className="canvas-item__current">当前</span>}
                        </span>
                      </button>
                    )}

                    {!isRenaming && (
                      <div className="canvas-item__actions">
                        <button
                          type="button"
                          className="canvas-item__action"
                          aria-label={`重命名画布 ${board.name}`}
                          title="重命名"
                          onClick={() => startRename(board)}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className="canvas-item__action canvas-item__action--danger"
                          aria-label={`删除画布 ${board.name}`}
                          title="删除"
                          onClick={() => setDeleteTarget(board)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <footer className="canvas-panel__foot">
              <button
                type="button"
                className="canvas-panel__create"
                disabled={creating}
                onClick={() => void handleCreate()}
              >
                <PlusIcon />
                {creating ? '正在新建…' : '新建画布'}
              </button>
              <p className="canvas-panel__hint">画布自动保存在当前浏览器</p>
            </footer>

            {deleteTarget && (
              <div className="canvas-confirm" role="dialog" aria-modal="true">
                <div className="canvas-confirm__card">
                  <span className="canvas-confirm__eyebrow">DELETE BOARD</span>
                  <h3>删除画布？</h3>
                  <p>「{deleteTarget.name}」将从当前浏览器永久删除，此操作无法撤销。</p>
                  <div className="canvas-confirm__actions">
                    <button
                      type="button"
                      className="canvas-confirm__button"
                      autoFocus
                      onClick={() => setDeleteTarget(null)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="canvas-confirm__button canvas-confirm__button--danger"
                      onClick={() => void handleDelete()}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
};
