import { Board, BoardChangeData, Wrapper } from '@plait-board/react-board';
import {
  PlaitBoard,
  PlaitBoardOptions,
  PlaitElement,
  PlaitPlugin,
  PlaitPointerType,
  PlaitOperation,
  PlaitTheme,
  BoardTransforms,
  Selection,
  ThemeColorMode,
  Viewport,
} from '@plait/core';
import React, { useState, useRef, useEffect } from 'react';
import { BoardCreationMode, setCreationMode, withGroup } from '@plait/common';
import { withDraw } from '@plait/draw';
import { MindThemeColors, withMind } from '@plait/mind';
import MobileDetect from 'mobile-detect';
import { withMindExtend } from './plugins/with-mind-extend';
import { withCommonPlugin } from './plugins/with-common';
import { CreationToolbar } from './components/toolbar/creation-toolbar';
import { ZoomToolbar } from './components/toolbar/zoom-toolbar';
import { PopupToolbar } from './components/toolbar/popup-toolbar/popup-toolbar';
import { AppToolbar } from './components/toolbar/app-toolbar/app-toolbar';
import classNames from 'classnames';
import './styles/index.scss';
import { buildDrawnixHotkeyPlugin } from './plugins/with-hotkey';
import { buildToolStateSyncPlugin } from './plugins/with-tool-state-sync';
import { withFreehand } from './plugins/freehand/with-freehand';
import { ThemeToolbar } from './components/toolbar/theme-toolbar';
import { buildPencilPlugin } from './plugins/with-pencil';
import {
  DrawnixBoard,
  DrawnixContext,
  DrawnixFileSaveOptions,
  DrawnixFileSaveResult,
  DrawnixToolState,
  mergeToolState,
  type DrawnixState,
} from './hooks/use-drawnix';
import { ClosePencilToolbar } from './components/toolbar/pencil-mode-toolbar';
import { TTDDialog } from './components/ttd-dialog/ttd-dialog';
import { CleanConfirm } from './components/clean-confirm/clean-confirm';
import { buildTextLinkPlugin } from './plugins/with-text-link';
import { LinkPopup } from './components/popup/link-popup/link-popup';
import { I18nProvider, i18nInsidePlaitHook, setBoardLanguage } from './i18n';
import type { Language } from './i18n/types';
import { Tutorial } from './components/tutorial';
import { LASER_POINTER_CLASS_NAME } from './utils/laser-pointer';
import { Toast, useToast } from './components/toast/toast';
import type { DrawnixAgentOptions } from './agent/types';
import { installDrawnixAgent } from './agent/drawnix-agent';
import { saveAsJSON, saveJSON, serializeAsJSON, type DrawnixFileHandle } from './data/json';

export type DrawnixProps = {
  value: PlaitElement[];
  viewport?: Viewport;
  theme?: PlaitTheme;
  initialToolState?: Partial<DrawnixToolState>;
  initialPreference?: {
    copyTransparent?: boolean;
    exportTransparent?: boolean;
  };
  initialLanguage?: Language;
  defaultFileName?: string;
  onChange?: (value: BoardChangeData) => void;
  onSelectionChange?: (selection: Selection | null) => void;
  onValueChange?: (value: PlaitElement[]) => void;
  onViewportChange?: (value: Viewport) => void;
  onThemeChange?: (value: ThemeColorMode) => void;
  onToolStateChange?: (toolState: DrawnixToolState) => void;
  onPreferenceChange?: (preference: {
    copyTransparent: boolean;
    exportTransparent: boolean;
  }) => void;
  onLanguageChange?: (language: Language) => void;
  onFileSaved?: (result: DrawnixFileSaveResult) => void;
  /**
   * Extra items rendered at the top of the application menu.
   */
  appMenuItems?: React.ReactNode;
  afterInit?: (board: PlaitBoard) => void;
  /**
   * Expose the board operation API for automation agents.
   * Pass `true` to install it on `window.drawnixAgent`, or customize the
   * global name.
   */
  agent?: boolean | DrawnixAgentOptions;
  tutorial?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export type {
  DrawnixBoard,
  DrawnixFileSaveOptions,
  DrawnixFileSaveResult,
  DrawnixToolState,
} from './hooks/use-drawnix';

const applyToolStateToBoard = (board: PlaitBoard, toolState: DrawnixToolState) => {
  BoardTransforms.updatePointerType(board, toolState.pointer);
  if (
    toolState.pointer !== PlaitPointerType.hand &&
    toolState.pointer !== PlaitPointerType.selection
  ) {
    setCreationMode(board, BoardCreationMode.drawing);
  }
};

export const Drawnix: React.FC<DrawnixProps> = ({
  value,
  viewport,
  theme,
  initialToolState,
  initialPreference,
  initialLanguage,
  defaultFileName,
  onChange,
  onSelectionChange,
  onViewportChange,
  onThemeChange,
  onValueChange,
  onToolStateChange,
  onPreferenceChange,
  onLanguageChange,
  onFileSaved,
  appMenuItems,
  afterInit,
  agent = false,
  tutorial = false,
}) => {
  const options: PlaitBoardOptions = {
    readonly: false,
    hideScrollbar: true,
    disabledScrollOnNonFocus: false,
    themeColors: MindThemeColors,
  };

  const [appState, setAppState] = useState<DrawnixState>(() => {
    const md = new MobileDetect(window.navigator.userAgent);
    return {
      toolState: mergeToolState(initialToolState),
      isMobile: md.mobile() !== null,
      isPencilMode: false,
      fileHandle: null,
      defaultFileName: defaultFileName ?? '未命名画布',
      openDialogType: null,
      openCleanConfirm: false,
      copyTransparent: initialPreference?.copyTransparent ?? false,
      exportTransparent: initialPreference?.exportTransparent ?? false,
    };
  });

  const [board, setBoard] = useState<DrawnixBoard | null>(null);
  const [themeColorMode, setThemeColorMode] = useState<ThemeColorMode>(
    theme?.themeColorMode || ThemeColorMode.default
  );
  const { toast, showToast } = useToast();
  const lastKnownLanguageRef = useRef<Language>(initialLanguage ?? 'zh');
  const fileDirtyRef = useRef(false);
  const saveFileRef = useRef<
    ((options?: DrawnixFileSaveOptions) => Promise<DrawnixFileSaveResult | null>) | null
  >(null);
  const serializedCacheRef = useRef<{
    revision: number;
    json: string;
    children: PlaitElement[];
  } | null>(null);
  const documentRevisionRef = useRef(0);
  const snapshotTimeoutRef = useRef<number | null>(null);
  const snapshotIdleRef = useRef<number | null>(null);

  const cancelScheduledSnapshot = () => {
    if (snapshotTimeoutRef.current !== null) {
      window.clearTimeout(snapshotTimeoutRef.current);
      snapshotTimeoutRef.current = null;
    }
    if (snapshotIdleRef.current !== null && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(snapshotIdleRef.current);
      snapshotIdleRef.current = null;
    }
  };

  const buildSerializedSnapshot = () => {
    if (!board) {
      return;
    }
    const revision = documentRevisionRef.current;
    const json = serializeAsJSON(board);
    if (revision !== documentRevisionRef.current) {
      return;
    }
    serializedCacheRef.current = { revision, json, children: board.children };
  };

  const scheduleSerializedSnapshot = () => {
    cancelScheduledSnapshot();
    snapshotTimeoutRef.current = window.setTimeout(() => {
      snapshotTimeoutRef.current = null;
      if ('requestIdleCallback' in window) {
        snapshotIdleRef.current = window.requestIdleCallback(
          () => {
            snapshotIdleRef.current = null;
            buildSerializedSnapshot();
          },
          { timeout: 2500 }
        );
      } else {
        buildSerializedSnapshot();
      }
    }, 600);
  };

  if (board) {
    board.appState = appState;
    board.showToast = showToast;
  }

  useEffect(() => {
    if (!board) {
      return;
    }
    setBoardLanguage(board, lastKnownLanguageRef.current);
  }, [board]);

  const hasMountedToolStateRef = useRef(false);
  const onToolStateChangeRef = useRef(onToolStateChange);
  onToolStateChangeRef.current = onToolStateChange;

  useEffect(() => {
    if (!hasMountedToolStateRef.current) {
      hasMountedToolStateRef.current = true;
      return;
    }
    onToolStateChangeRef.current?.(appState.toolState);
  }, [appState.toolState]);

  const hasMountedPreferenceRef = useRef(false);
  const onPreferenceChangeRef = useRef(onPreferenceChange);
  onPreferenceChangeRef.current = onPreferenceChange;

  useEffect(() => {
    if (!hasMountedPreferenceRef.current) {
      hasMountedPreferenceRef.current = true;
      return;
    }
    onPreferenceChangeRef.current?.({
      copyTransparent: appState.copyTransparent,
      exportTransparent: appState.exportTransparent,
    });
  }, [appState.copyTransparent, appState.exportTransparent]);

  useEffect(() => {
    if (theme?.themeColorMode) {
      setThemeColorMode(theme.themeColorMode);
    }
  }, [theme?.themeColorMode]);

  useEffect(() => {
    if (!defaultFileName) {
      return;
    }
    setAppState((currentAppState) => {
      if (currentAppState.defaultFileName === defaultFileName) {
        return currentAppState;
      }
      return { ...currentAppState, defaultFileName };
    });
  }, [defaultFileName]);

  useEffect(() => {
    if (!board) {
      return;
    }
    board.saveFile = (options) => saveFileRef.current?.(options) ?? Promise.resolve(null);
    board.isFileDirty = () => fileDirtyRef.current;
    scheduleSerializedSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  useEffect(() => {
    return () => {
      cancelScheduledSnapshot();
    };
  }, []);

  const agentEnabled = Boolean(agent);
  const agentGlobalName = typeof agent === 'object' ? agent.globalName : undefined;
  const agentTarget = typeof agent === 'object' ? agent.target : undefined;

  useEffect(() => {
    if (!board || !agentEnabled) {
      return;
    }
    const installation = installDrawnixAgent(board, {
      globalName: agentGlobalName,
      target: agentTarget,
    });
    return () => {
      installation.dispose();
    };
  }, [board, agentEnabled, agentGlobalName, agentTarget]);

  const updateAppState = (newAppState: Partial<DrawnixState>) => {
    setAppState((currentAppState) => ({
      ...currentAppState,
      ...newAppState,
    }));
  };

  const getFileNameFromHandle = (fileHandle: DrawnixFileHandle) => {
    if (!fileHandle || !('name' in fileHandle)) {
      return undefined;
    }
    const name = fileHandle.name.replace(/\.drawnix$/i, '').trim();
    return name || undefined;
  };

  const saveFile = async (options: DrawnixFileSaveOptions = {}) => {
    if (!board) {
      return null;
    }
    const currentAppState = board.appState;
    const shouldSaveAs = Boolean(options.saveAs) || !currentAppState.fileHandle;
    const requestedName =
      options.fileName?.trim() || currentAppState.defaultFileName || '未命名画布';
    const { t } = i18nInsidePlaitHook(board);
    const revision = documentRevisionRef.current;
    const saveChildren = board.children;
    const cachedSnapshot = serializedCacheRef.current;
    const cachedJson =
      cachedSnapshot &&
      cachedSnapshot.revision === revision &&
      cachedSnapshot.children === saveChildren
        ? cachedSnapshot.json
        : undefined;

    try {
      board.showToast?.({ type: 'info', message: t('toast.saving'), duration: 0 });
      const result = shouldSaveAs
        ? await saveAsJSON(board, requestedName, cachedJson)
        : await saveJSON(board, currentAppState.fileHandle, requestedName, cachedJson);
      const fileHandle = result.fileHandle ?? null;
      const fileName = getFileNameFromHandle(fileHandle) ?? requestedName;
      if (result.serialized) {
        serializedCacheRef.current = {
          revision,
          json: result.serialized,
          children: saveChildren,
        };
      }
      setAppState((currentState) => ({
        ...currentState,
        fileHandle,
        defaultFileName: fileName,
      }));
      fileDirtyRef.current = false;
      const saveResult: DrawnixFileSaveResult = {
        fileHandle,
        fileName,
        isNewFile: shouldSaveAs,
      };
      onFileSaved?.(saveResult);
      board.showToast?.({ type: 'success', message: t('toast.saved') });
      return saveResult;
    } catch {
      board.showToast?.({ type: 'info', message: t('toast.saveNotCompleted') });
      return null;
    }
  };
  saveFileRef.current = saveFile;

  const syncBoardPointerToToolState = (pointer: DrawnixToolState['pointer']) => {
    setAppState((currentAppState) => {
      if (currentAppState.toolState.pointer === pointer) {
        return currentAppState;
      }
      return {
        ...currentAppState,
        toolState: {
          ...currentAppState.toolState,
          pointer,
        },
      };
    });
  };

  const plugins: PlaitPlugin[] = [
    withDraw,
    withGroup,
    withMind,
    withMindExtend,
    withCommonPlugin,
    buildDrawnixHotkeyPlugin(updateAppState),
    withFreehand,
    buildPencilPlugin(updateAppState),
    buildTextLinkPlugin(updateAppState),
    buildToolStateSyncPlugin(syncBoardPointerToToolState),
  ];

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <I18nProvider
      initialLanguage={initialLanguage}
      onLanguageChange={(language) => {
        lastKnownLanguageRef.current = language;
        if (board) {
          setBoardLanguage(board, language);
        }
        onLanguageChange?.(language);
      }}
    >
      <DrawnixContext.Provider value={{ appState, setAppState, showToast }}>
        <div
          className={classNames('drawnix', {
            'drawnix--mobile': appState.isMobile,
            [`theme--${themeColorMode}`]: themeColorMode,
          })}
          ref={containerRef}
        >
          <Wrapper
            value={value}
            viewport={viewport}
            theme={theme}
            options={options}
            plugins={plugins}
            onChange={(data: BoardChangeData) => {
              const hasPersistedChange = data.operations.some(
                (operation) => !PlaitOperation.isSetSelectionOperation(operation)
              );
              if (hasPersistedChange) {
                documentRevisionRef.current += 1;
                scheduleSerializedSnapshot();
              }
              const hasDocumentChange = data.operations.some(
                (operation) =>
                  !PlaitOperation.isSetSelectionOperation(operation) &&
                  !PlaitOperation.isSetViewportOperation(operation)
              );
              if (hasDocumentChange) {
                fileDirtyRef.current = true;
              }
              onChange?.(data);
            }}
            onSelectionChange={onSelectionChange}
            onViewportChange={onViewportChange}
            onThemeChange={(value) => {
              setThemeColorMode(value);
              onThemeChange?.(value);
            }}
            onValueChange={onValueChange}
          >
            <Board
              afterInit={(board) => {
                const drawnixBoard = board as DrawnixBoard;
                applyToolStateToBoard(drawnixBoard, appState.toolState);
                setBoard(drawnixBoard);
                afterInit?.(board);
              }}
            >
              {tutorial && board && <Tutorial />}
            </Board>
            <AppToolbar appMenuItems={appMenuItems}></AppToolbar>
            <CreationToolbar></CreationToolbar>
            <ZoomToolbar></ZoomToolbar>
            <ThemeToolbar></ThemeToolbar>
            <PopupToolbar></PopupToolbar>
            <LinkPopup></LinkPopup>
            <ClosePencilToolbar></ClosePencilToolbar>
            <TTDDialog container={containerRef.current}></TTDDialog>
            <CleanConfirm container={containerRef.current}></CleanConfirm>
            <Toast toast={toast} container={containerRef.current}></Toast>
          </Wrapper>
          <canvas className={`${LASER_POINTER_CLASS_NAME} mouse-course-hidden`}></canvas>
        </div>
      </DrawnixContext.Provider>
    </I18nProvider>
  );
};
