import { useRef, useState } from 'react';
import {
  Drawnix,
  type DrawnixBoard,
  type DrawnixFileSaveResult,
  type DrawnixProps,
} from '@drawnix/drawnix';
import type { useDrawnixBoardStore } from './board-store';
import { getBoardNameAfterFileSave, getDefaultFileSaveName } from './board-storage';
import { CanvasMenuItems } from './canvas-menu-items';
import { CanvasManager } from './canvas-manager';
import { SaveBeforeCreate } from './save-before-create';

type BoardStore = ReturnType<typeof useDrawnixBoardStore>;

type CanvasWorkspaceProps = Omit<
  DrawnixProps,
  | 'value'
  | 'viewport'
  | 'theme'
  | 'initialToolState'
  | 'initialLanguage'
  | 'defaultFileName'
  | 'initialPreference'
  | 'onChange'
  | 'onLanguageChange'
  | 'onPreferenceChange'
  | 'onToolStateChange'
  | 'onFileSaved'
  | 'appMenuItems'
  | 'afterInit'
> & {
  store: BoardStore;
  boardWrapperClassName?: string;
  onBoardReady?: (board: DrawnixBoard) => void;
};

export const CanvasWorkspace = ({
  store,
  boardWrapperClassName,
  onBoardReady,
  ...drawnixProps
}: CanvasWorkspaceProps) => {
  const [canvasListOpen, setCanvasListOpen] = useState(false);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [savingBeforeCreate, setSavingBeforeCreate] = useState(false);
  const boardRef = useRef<DrawnixBoard | null>(null);
  const {
    boards,
    activeBoard,
    activeBoardId,
    value,
    initialToolState,
    preference,
    createBoard,
    switchBoard,
    renameBoard,
    markBoardFileSaved,
    deleteBoard,
  } = store;

  const handleFileSaved = (result: DrawnixFileSaveResult) => {
    if (!result.fileName || !activeBoard) {
      return;
    }
    const nextName = getBoardNameAfterFileSave(activeBoard.name, result.fileName, result.isNewFile);
    if (nextName !== activeBoard.name) {
      renameBoard(activeBoardId, nextName);
    }
    markBoardFileSaved(activeBoardId, result.fileName);
  };

  const requestCreateBoard = () => {
    const hasContent = value.children.length > 0;
    const hasUnsavedChanges = boardRef.current?.isFileDirty?.() ?? false;
    const neverSavedToFile = !activeBoard?.fileName;
    if (hasContent && (hasUnsavedChanges || neverSavedToFile)) {
      setSavePromptOpen(true);
      return;
    }
    return createBoard().then(() => undefined);
  };

  const handleSaveAndCreate = async () => {
    if (savingBeforeCreate) {
      return;
    }
    setSavingBeforeCreate(true);
    try {
      const saveFileName = activeBoard
        ? getDefaultFileSaveName(activeBoard, preference.language)
        : undefined;
      const result = await boardRef.current?.saveFile?.({ fileName: saveFileName });
      if (!result) {
        return;
      }
      setSavePromptOpen(false);
      await createBoard();
    } finally {
      setSavingBeforeCreate(false);
    }
  };

  const board = (
    <Drawnix
      key={activeBoardId}
      {...drawnixProps}
      value={value.children}
      viewport={value.viewport}
      theme={value.theme}
      initialToolState={initialToolState}
      initialLanguage={preference.language}
      defaultFileName={
        activeBoard ? getDefaultFileSaveName(activeBoard, preference.language) : undefined
      }
      initialPreference={{
        copyTransparent: preference.copyTransparent,
        exportTransparent: preference.exportTransparent,
      }}
      onLanguageChange={(language) => store.updatePreference({ language })}
      onPreferenceChange={({ copyTransparent, exportTransparent }) => {
        store.updatePreference({ copyTransparent, exportTransparent });
      }}
      onChange={(nextValue) => {
        store.handleChange(nextValue as Parameters<typeof store.handleChange>[0]);
      }}
      onToolStateChange={store.handleToolStateChange}
      appMenuItems={
        <CanvasMenuItems
          activeBoardName={activeBoard?.name}
          onCreate={requestCreateBoard}
          onOpenList={() => setCanvasListOpen(true)}
        />
      }
      onFileSaved={handleFileSaved}
      afterInit={(board) => {
        const drawnixBoard = board as DrawnixBoard;
        boardRef.current = drawnixBoard;
        onBoardReady?.(drawnixBoard);
      }}
    />
  );

  return (
    <>
      {boardWrapperClassName ? <div className={boardWrapperClassName}>{board}</div> : board}
      <CanvasManager
        open={canvasListOpen}
        onClose={() => setCanvasListOpen(false)}
        boards={boards}
        activeBoardId={activeBoardId}
        onCreate={requestCreateBoard}
        onSelect={switchBoard}
        onRename={renameBoard}
        onDelete={deleteBoard}
      />
      <SaveBeforeCreate
        open={savePromptOpen}
        boardName={activeBoard?.name ?? '未命名画布'}
        saving={savingBeforeCreate}
        onCancel={() => {
          if (!savingBeforeCreate) {
            setSavePromptOpen(false);
          }
        }}
        onSave={() => void handleSaveAndCreate()}
        onSkip={() => {
          setSavePromptOpen(false);
          void createBoard();
        }}
      />
    </>
  );
};
