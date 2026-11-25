import { useCallback, useRef, useState } from 'react';
import { Drawnix, type DrawnixBoard, type DrawnixFileSaveResult } from '@drawnix/drawnix';
import { useDrawnixBoardStore } from './board-store';
import { getBoardNameAfterFileSave, getDefaultFileSaveName } from './board-storage';
import { CanvasMenuItems } from './canvas-menu-items';
import { CanvasManager } from './canvas-manager';
import { SaveBeforeCreate } from './save-before-create';
import './chat-entry.scss';

export function App() {
  const [canvasListOpen, setCanvasListOpen] = useState(false);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [savingBeforeCreate, setSavingBeforeCreate] = useState(false);
  const boardRef = useRef<DrawnixBoard | null>(null);
  const closeCanvasList = useCallback(() => setCanvasListOpen(false), []);
  const {
    boards,
    activeBoardId,
    activeBoard,
    loaded,
    value,
    initialToolState,
    preference,
    tutorial,
    updatePreference,
    handleChange,
    handleToolStateChange,
    createBoard,
    switchBoard,
    renameBoard,
    markBoardFileSaved,
    deleteBoard,
  } = useDrawnixBoardStore();

  const handleFileSaved = (result: DrawnixFileSaveResult) => {
    if (!result.fileName) {
      return;
    }
    if (activeBoard) {
      const nextName = getBoardNameAfterFileSave(
        activeBoard.name,
        result.fileName,
        result.isNewFile
      );
      if (nextName !== activeBoard.name) {
        renameBoard(activeBoardId, nextName);
      }
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

  const handleCancelSaveBeforeCreate = () => {
    if (!savingBeforeCreate) {
      setSavePromptOpen(false);
    }
  };

  const handleSkipSaveBeforeCreate = () => {
    setSavePromptOpen(false);
    void createBoard();
  };

  if (!loaded) {
    return null;
  }
  return (
    <>
      <Drawnix
        key={activeBoardId}
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
        onLanguageChange={(language) => updatePreference({ language })}
        onPreferenceChange={({ copyTransparent, exportTransparent }) => {
          updatePreference({ copyTransparent, exportTransparent });
        }}
        onChange={(nextValue) => {
          handleChange(nextValue as Parameters<typeof handleChange>[0]);
        }}
        onToolStateChange={handleToolStateChange}
        tutorial={tutorial}
        appMenuItems={
          <CanvasMenuItems
            activeBoardName={activeBoard?.name}
            onCreate={requestCreateBoard}
            onOpenList={() => setCanvasListOpen(true)}
          />
        }
        afterInit={(board) => {
          boardRef.current = board as DrawnixBoard;
        }}
        onFileSaved={handleFileSaved}
        agent
      />
      <CanvasManager
        open={canvasListOpen}
        onClose={closeCanvasList}
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
        onCancel={handleCancelSaveBeforeCreate}
        onSave={() => void handleSaveAndCreate()}
        onSkip={handleSkipSaveBeforeCreate}
      />
      <a className="chat-entry" href="#/chat">
        <span className="chat-entry__dot" />
        AI 对话
      </a>
    </>
  );
}

export default App;
