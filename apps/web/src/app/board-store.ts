import { useEffect, useState } from 'react';
import type { PlaitElement, PlaitTheme, Viewport } from '@plait/core';
import type { DrawnixToolState } from '@drawnix/drawnix';
import localforage from 'localforage';

export type AppValue = {
  children: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
};

export type Language = 'zh' | 'en' | 'ru' | 'ar' | 'vi';

export type MainBoardPreference = {
  language: Language;
  copyTransparent: boolean;
  exportTransparent: boolean;
};

export const MAIN_BOARD_CONTENT_KEY = 'main_board_content';
export const MAIN_BOARD_TOOL_STATE_KEY = 'main_board_tool_state';
export const MAIN_BOARD_PREFERENCE_KEY = 'main_board_preference';

localforage.config({
  name: 'Drawnix',
  storeName: 'drawnix_store',
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
});

export const useDrawnixBoardStore = () => {
  const [value, setValue] = useState<AppValue>({ children: [] });
  const [initialToolState, setInitialToolState] = useState<Partial<DrawnixToolState>>();
  const [preference, setPreference] = useState<MainBoardPreference>({
    language: 'zh',
    copyTransparent: false,
    exportTransparent: false,
  });
  const [loaded, setLoaded] = useState(false);
  const [tutorial, setTutorial] = useState(false);

  const updatePreference = (partialPreference: Partial<MainBoardPreference>) => {
    setPreference((currentPreference) => {
      const nextPreference = { ...currentPreference, ...partialPreference };
      localforage.setItem(MAIN_BOARD_PREFERENCE_KEY, nextPreference);
      return nextPreference;
    });
  };

  useEffect(() => {
    const loadData = async () => {
      const [storedData, storedToolState, storedPreference] = await Promise.all([
        localforage.getItem(MAIN_BOARD_CONTENT_KEY),
        localforage.getItem(MAIN_BOARD_TOOL_STATE_KEY),
        localforage.getItem(MAIN_BOARD_PREFERENCE_KEY),
      ]);
      if (storedData) {
        const appValue = storedData as AppValue;
        setValue(appValue);
        if (appValue.children && appValue.children.length === 0) {
          setTutorial(true);
        }
      } else {
        setTutorial(true);
      }
      if (storedToolState) {
        setInitialToolState(storedToolState as Partial<DrawnixToolState>);
      }
      if (storedPreference) {
        setPreference(storedPreference as MainBoardPreference);
      }
      setLoaded(true);
    };
    loadData();
  }, []);

  const handleChange = (nextValue: AppValue) => {
    localforage.setItem(MAIN_BOARD_CONTENT_KEY, nextValue);
    setValue(nextValue);
    if (nextValue.children && nextValue.children.length > 0) {
      setTutorial(false);
    }
  };

  const handleToolStateChange = (toolState: DrawnixToolState) => {
    localforage.setItem(MAIN_BOARD_TOOL_STATE_KEY, toolState);
  };

  return {
    loaded,
    value,
    initialToolState,
    preference,
    tutorial,
    setTutorial,
    updatePreference,
    handleChange,
    handleToolStateChange,
  };
};
