import { StrictMode, useEffect, useState } from 'react';
import * as ReactDOM from 'react-dom/client';

import App from './app/app';
import ChatApp from './chat/chat';

const getRoute = () => (window.location.hash.startsWith('#/chat') ? 'chat' : 'board');

function Root() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    document.title = route === 'chat' ? 'AI 对话 - Drawnix' : 'Drawnix - 开源白板工具';
  }, [route]);

  return route === 'chat' ? <ChatApp /> : <App />;
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <StrictMode>
    <Root />
  </StrictMode>
);
