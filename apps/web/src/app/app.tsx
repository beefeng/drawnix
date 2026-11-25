import { Drawnix } from '@drawnix/drawnix';
import { useDrawnixBoardStore } from './board-store';
import { CanvasManager } from './canvas-manager';
import './chat-entry.scss';

export function App() {
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
    deleteBoard,
  } = useDrawnixBoardStore();

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
        agent
      />
      <CanvasManager
        boards={boards}
        activeBoardId={activeBoardId}
        activeBoard={activeBoard}
        onCreate={createBoard}
        onSelect={switchBoard}
        onRename={renameBoard}
        onDelete={deleteBoard}
      />
      <a className="chat-entry" href="#/chat">
        <span className="chat-entry__dot" />
        AI 对话
      </a>
    </>
  );
}

export default App;
