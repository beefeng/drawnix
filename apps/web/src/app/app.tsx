import { useDrawnixBoardStore } from './board-store';
import { CanvasWorkspace } from './canvas-workspace';
import './chat-entry.scss';

export function App() {
  const store = useDrawnixBoardStore();

  if (!store.loaded) {
    return null;
  }
  return (
    <>
      <CanvasWorkspace store={store} tutorial={store.tutorial} agent />
      <a className="chat-entry" href="#/chat">
        <span className="chat-entry__dot" />
        AI 对话
      </a>
    </>
  );
}

export default App;
