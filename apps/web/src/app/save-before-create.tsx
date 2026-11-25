import { useEffect } from 'react';
import './save-before-create.scss';

type SaveBeforeCreateProps = {
  open: boolean;
  boardName: string;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onSkip: () => void;
};

export const SaveBeforeCreate = ({
  open,
  boardName,
  saving,
  onCancel,
  onSave,
  onSkip,
}: SaveBeforeCreateProps) => {
  useEffect(() => {
    if (!open || saving) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, saving, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="save-before-create"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-before-create-title"
    >
      <div className="save-before-create__card">
        <span className="save-before-create__eyebrow">UNSAVED CANVAS</span>
        <h2 id="save-before-create-title">先保存当前画布？</h2>
        <p>「{boardName}」有尚未保存到文件的更改。新建画布前，是否先保存当前画布？</p>
        <div className="save-before-create__actions">
          <button
            type="button"
            className="save-before-create__button"
            disabled={saving}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="save-before-create__button"
            disabled={saving}
            onClick={onSkip}
          >
            不保存，直接新建
          </button>
          <button
            type="button"
            className="save-before-create__button save-before-create__button--primary"
            disabled={saving}
            autoFocus
            onClick={onSave}
          >
            {saving ? '正在保存…' : '保存并新建'}
          </button>
        </div>
      </div>
    </div>
  );
};
