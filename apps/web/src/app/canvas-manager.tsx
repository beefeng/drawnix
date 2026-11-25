import { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import type { BoardMeta } from './board-storage';
import { CloseIcon, PencilIcon, PlusIcon, TrashIcon } from './canvas-icons';
import './canvas-manager.scss';

type CanvasManagerProps = {
  open: boolean;
  onClose: () => void;
  boards: BoardMeta[];
  activeBoardId: string;
  onCreate: () => void | Promise<unknown>;
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

export const CanvasManager = ({
  open,
  onClose,
  boards,
  activeBoardId,
  onCreate,
  onSelect,
  onRename,
  onDelete,
}: CanvasManagerProps) => {
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<BoardMeta | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelRenameRef = useRef(false);

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
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, renamingId, deleteTarget, onClose]);

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
      onClose();
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
      {open && (
        <div
          className="canvas-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              onClose();
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
                onClick={onClose}
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
                          onClose();
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
