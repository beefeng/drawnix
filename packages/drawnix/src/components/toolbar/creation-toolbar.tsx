import classNames from 'classnames';
import { Island } from '../island';
import Stack from '../stack';
import { ToolButton } from '../tool-button';
import {
  HandIcon,
  MindIcon,
  SelectionIcon,
  ShapeIcon,
  TextIcon,
  StraightArrowLineIcon,
  FeltTipPenIcon,
  ImageIcon,
  ExtraToolsIcon,
} from '../icons';
import { useBoard } from '@plait-board/react-board';
import {
  ATTACHED_ELEMENT_CLASS_NAME,
  BoardTransforms,
  PlaitBoard,
  PlaitPointerType,
} from '@plait/core';
import { MindPointerType } from '@plait/mind';
import { BoardCreationMode, setCreationMode } from '@plait/common';
import { ArrowLineShape, BasicShapes, DrawPointerType, FlowchartSymbols } from '@plait/draw';
import { FreehandPanel } from './freehand-panel/freehand-panel';
import { ShapePicker, SHAPES } from '../shape-picker';
import { ArrowPicker, ARROWS } from '../arrow-picker';
import { useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../popover/popover';
import { FreehandShape } from '../../plugins/freehand/type';
import {
  DrawnixFreehandPointer,
  DrawnixPointerType,
  DrawnixToolState,
  useDrawnix,
} from '../../hooks/use-drawnix';
import { ExtraToolsButton } from './extra-tools/extra-tools-button';
import { addImage } from '../../utils/image';
import { Translations, useI18n } from '../../i18n';
import { FREEHANDS } from '../../constants/freehand';

export enum PopupKey {
  'shape' = 'shape',
  'arrow' = 'arrow',
  'freehand' = 'freehand',
}

type AppToolButtonProps = {
  titleKey?: keyof Translations;
  name?: string;
  icon: React.ReactNode;
  pointer?: DrawnixPointerType;
  key?: PopupKey | 'image' | 'extra-tools';
  keyBinding?: string;
};

const isBasicPointer = (pointer: string) => {
  return pointer === PlaitPointerType.hand || pointer === PlaitPointerType.selection;
};

const HOVER_CLOSE_DELAY = 140;

const SHAPE_KEY_BINDINGS: Partial<Record<string, string>> = {
  [BasicShapes.rectangle]: 'R',
  [BasicShapes.ellipse]: 'O',
};

const FREEHAND_KEY_BINDINGS: Partial<Record<string, string>> = {
  [FreehandShape.feltTipPen]: 'P',
  [FreehandShape.eraser]: 'E',
};

export const BUTTONS: AppToolButtonProps[] = [
  {
    icon: HandIcon,
    pointer: PlaitPointerType.hand,
    titleKey: 'toolbar.hand',
    keyBinding: 'H',
  },
  {
    icon: SelectionIcon,
    pointer: PlaitPointerType.selection,
    titleKey: 'toolbar.selection',
    keyBinding: 'V',
  },
  {
    icon: MindIcon,
    pointer: MindPointerType.mind,
    titleKey: 'toolbar.mind',
    keyBinding: 'M',
  },
  {
    icon: TextIcon,
    pointer: BasicShapes.text,
    titleKey: 'toolbar.text',
    keyBinding: 'T',
  },
  {
    icon: FeltTipPenIcon,
    pointer: FreehandShape.feltTipPen,
    titleKey: 'toolbar.pen',
    key: PopupKey.freehand,
    keyBinding: 'P',
  },
  {
    icon: StraightArrowLineIcon,
    titleKey: 'toolbar.arrow',
    keyBinding: 'A',
    key: PopupKey.arrow,
    pointer: ArrowLineShape.straight,
  },
  {
    icon: ShapeIcon,
    titleKey: 'toolbar.shape',
    key: PopupKey.shape,
    pointer: BasicShapes.rectangle,
  },
  {
    icon: ImageIcon,
    titleKey: 'toolbar.image',
    key: 'image',
    keyBinding: '⌘U',
  },
  {
    icon: ExtraToolsIcon,
    titleKey: 'toolbar.extraTools',
    key: 'extra-tools',
  },
];

// TODO provider by plait/draw
export const isArrowLinePointer = (board: PlaitBoard) => {
  return isArrowLinePointerType(board.pointer);
};

export const isShapePointer = (board: PlaitBoard) => {
  return isShapePointerType(board.pointer);
};

const isArrowLinePointerType = (pointer?: string) => {
  return Object.values(ArrowLineShape).includes(pointer as ArrowLineShape);
};

const isShapePointerType = (pointer?: string) => {
  return (
    Object.values(BasicShapes).includes(pointer as BasicShapes) ||
    Object.values(FlowchartSymbols).includes(pointer as FlowchartSymbols)
  );
};

const isShapeMenuPointer = (pointer?: string) => {
  return pointer !== BasicShapes.text && isShapePointerType(pointer);
};

const isFreehandPointer = (pointer?: string) => {
  return pointer === FreehandShape.feltTipPen || pointer === FreehandShape.eraser;
};

export const CreationToolbar = () => {
  const board = useBoard();
  const { appState, setAppState } = useDrawnix();
  const toolState = appState.toolState;
  const { t } = useI18n();
  const container = PlaitBoard.getBoardContainer(board) ?? null;

  const [freehandOpen, setFreehandOpen] = useState(false);
  const [arrowOpen, setArrowOpen] = useState(false);
  const [shapeOpen, setShapeOpen] = useState(false);
  const lastFreehandButton: AppToolButtonProps =
    FREEHANDS.find((freehand) => freehand.pointer === toolState.lastFreehandPointer) ||
    BUTTONS.find((button) => button.key === PopupKey.freehand) ||
    BUTTONS[4];
  const currentShapePointer = isShapeMenuPointer(toolState.pointer)
    ? toolState.pointer
    : toolState.lastShapePointer;
  const currentArrowPointer = isArrowLinePointerType(toolState.pointer)
    ? toolState.pointer
    : toolState.lastArrowPointer;
  const lastShapeButton = SHAPES.find((shape) => shape.pointer === currentShapePointer);
  const lastArrowButton = ARROWS.find((arrow) => arrow.pointer === currentArrowPointer);
  const freehandKeyBinding = FREEHAND_KEY_BINDINGS[lastFreehandButton.pointer ?? ''];
  const shapeKeyBinding = SHAPE_KEY_BINDINGS[currentShapePointer];

  const hoverCloseTimeoutRef = useRef<number | null>(null);

  const cancelHoverClose = () => {
    if (hoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  };

  const scheduleHoverClose = (closeMenu: () => void) => {
    cancelHoverClose();
    hoverCloseTimeoutRef.current = window.setTimeout(() => {
      hoverCloseTimeoutRef.current = null;
      closeMenu();
    }, HOVER_CLOSE_DELAY);
  };

  const openShapeMenu = () => {
    setArrowOpen(false);
    setFreehandOpen(false);
    setShapeOpen(true);
  };

  const openArrowMenu = () => {
    setShapeOpen(false);
    setFreehandOpen(false);
    setArrowOpen(true);
  };

  useEffect(() => {
    return cancelHoverClose;
  }, []);

  const shapeHoverHandlers = appState.isMobile
    ? {}
    : {
        onMouseEnter: () => {
          cancelHoverClose();
          openShapeMenu();
        },
        onMouseLeave: () => {
          scheduleHoverClose(() => setShapeOpen(false));
        },
      };
  const arrowHoverHandlers = appState.isMobile
    ? {}
    : {
        onMouseEnter: () => {
          cancelHoverClose();
          openArrowMenu();
        },
        onMouseLeave: () => {
          scheduleHoverClose(() => setArrowOpen(false));
        },
      };
  const shapeContentHoverHandlers = {
    onMouseEnter: () => {
      cancelHoverClose();
      setShapeOpen(true);
    },
    onMouseLeave: () => {
      scheduleHoverClose(() => setShapeOpen(false));
    },
  };
  const arrowContentHoverHandlers = {
    onMouseEnter: () => {
      cancelHoverClose();
      setArrowOpen(true);
    },
    onMouseLeave: () => {
      scheduleHoverClose(() => setArrowOpen(false));
    },
  };

  const updateToolState = (nextToolState: Partial<DrawnixToolState>) => {
    setAppState((currentAppState) => ({
      ...currentAppState,
      toolState: {
        ...currentAppState.toolState,
        ...nextToolState,
      },
    }));
  };

  useEffect(() => {
    if (!container) {
      return;
    }
    if (isFreehandPointer(toolState.pointer)) {
      setFreehandOpen(true);
      setArrowOpen(false);
      setShapeOpen(false);
      return;
    }
    setFreehandOpen(false);
    if (!isArrowLinePointerType(toolState.pointer)) {
      setArrowOpen(false);
    }
    if (!isShapeMenuPointer(toolState.pointer)) {
      setShapeOpen(false);
    }
  }, [container, toolState.pointer]);

  const onPointerDown = (pointer: DrawnixPointerType) => {
    setCreationMode(board, BoardCreationMode.dnd);
    BoardTransforms.updatePointerType(board, pointer);
    updateToolState({ pointer });
  };

  const onPointerUp = () => {
    setCreationMode(board, BoardCreationMode.drawing);
  };

  const isChecked = (button: AppToolButtonProps) => {
    return PlaitBoard.isPointer(board, button.pointer) && !arrowOpen && !shapeOpen && !freehandOpen;
  };

  const checkCurrentPointerIsFreehand = (board: PlaitBoard) => {
    return isFreehandPointer(board.pointer);
  };

  const updateFreehandSettings = (
    presetIndex: number,
    nextSettings: Partial<(typeof toolState)['freehandPresets'][number]>
  ) => {
    setAppState((currentAppState) => ({
      ...currentAppState,
      toolState: {
        ...currentAppState.toolState,
        freehandPresets: currentAppState.toolState.freehandPresets.map((preset, index) => {
          if (index !== presetIndex) {
            return preset;
          }
          return {
            ...preset,
            ...nextSettings,
          };
        }),
      },
    }));
  };

  return (
    <Island padding={1} className={classNames('draw-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}>
      <Stack.Row gap={1}>
        {BUTTONS.map((button, index) => {
          if (appState.isMobile && button.pointer === PlaitPointerType.hand) {
            return null;
          }
          if (button.key === PopupKey.freehand) {
            return (
              <Popover
                key={index}
                open={freehandOpen || checkCurrentPointerIsFreehand(board)}
                sideOffset={12}
                onOpenChange={(open) => {
                  setFreehandOpen(open);
                }}
              >
                <PopoverTrigger asChild>
                  <ToolButton
                    type="icon"
                    visible={true}
                    selected={freehandOpen || checkCurrentPointerIsFreehand(board)}
                    icon={lastFreehandButton.icon}
                    keyBindingLabel={freehandKeyBinding}
                    title={
                      lastFreehandButton.titleKey ? t(lastFreehandButton.titleKey) : 'Freehand'
                    }
                    aria-label={
                      lastFreehandButton.titleKey ? t(lastFreehandButton.titleKey) : 'Freehand'
                    }
                    onPointerDown={() => {
                      setFreehandOpen(!freehandOpen);
                      if (lastFreehandButton.pointer) {
                        onPointerDown(lastFreehandButton.pointer);
                      }
                    }}
                    onPointerUp={() => {
                      onPointerUp();
                    }}
                  />
                </PopoverTrigger>
                <PopoverContent container={container} initialFocus={-1}>
                  <FreehandPanel
                    freehandPresets={toolState.freehandPresets}
                    activePresetIndex={toolState.activeFreehandPresetIndex}
                    onPresetSelect={(presetIndex: number) => {
                      updateToolState({
                        activeFreehandPresetIndex: presetIndex,
                      });
                    }}
                    onStrokeColorSelect={(presetIndex: number, strokeColor?: string) => {
                      updateFreehandSettings(presetIndex, {
                        strokeColor,
                      });
                    }}
                    onStrokeWidthSelect={(presetIndex: number, strokeWidth: number) => {
                      updateFreehandSettings(presetIndex, {
                        strokeWidth,
                      });
                    }}
                    onPointerUp={(pointer: DrawnixPointerType) => {
                      updateToolState({
                        pointer,
                        lastFreehandPointer: pointer as DrawnixFreehandPointer,
                      });
                    }}
                  ></FreehandPanel>
                </PopoverContent>
              </Popover>
            );
          }
          if (button.key === PopupKey.shape) {
            return (
              <Popover
                key={index}
                open={shapeOpen}
                sideOffset={12}
                onOpenChange={(open) => {
                  setShapeOpen(open);
                }}
              >
                <PopoverTrigger asChild>
                  <ToolButton
                    type="icon"
                    visible={true}
                    selected={
                      shapeOpen ||
                      (isShapePointer(board) && !PlaitBoard.isPointer(board, BasicShapes.text))
                    }
                    icon={lastShapeButton?.icon || button.icon}
                    keyBindingLabel={shapeKeyBinding}
                    title={button.titleKey ? t(button.titleKey) : 'Shape'}
                    aria-label={button.titleKey ? t(button.titleKey) : 'Shape'}
                    {...shapeHoverHandlers}
                    onPointerDown={({ pointerType }) => {
                      if (pointerType === 'touch' && shapeOpen) {
                        setShapeOpen(false);
                      } else {
                        openShapeMenu();
                      }
                      if (isShapePointer(board)) {
                        BoardTransforms.updatePointerType(board, board.pointer);
                      } else {
                        updateToolState({
                          pointer: toolState.lastShapePointer,
                        });
                        setCreationMode(board, BoardCreationMode.drawing);
                        BoardTransforms.updatePointerType(board, toolState.lastShapePointer);
                      }
                    }}
                  />
                </PopoverTrigger>
                <PopoverContent
                  container={container}
                  initialFocus={-1}
                  {...shapeContentHoverHandlers}
                >
                  <ShapePicker
                    onPointerUp={(pointer: DrawPointerType) => {
                      setShapeOpen(false);
                      updateToolState({
                        pointer,
                        lastShapePointer: pointer,
                      });
                    }}
                  ></ShapePicker>
                </PopoverContent>
              </Popover>
            );
          }
          if (button.key === PopupKey.arrow) {
            return (
              <Popover
                key={index}
                open={arrowOpen}
                sideOffset={12}
                onOpenChange={(open) => {
                  setArrowOpen(open);
                }}
              >
                <PopoverTrigger asChild>
                  <ToolButton
                    type="icon"
                    visible={true}
                    selected={arrowOpen || isArrowLinePointer(board)}
                    icon={lastArrowButton?.icon || button.icon}
                    keyBindingLabel={button.keyBinding}
                    title={button.titleKey ? t(button.titleKey) : ''}
                    aria-label={button.titleKey ? t(button.titleKey) : ''}
                    {...arrowHoverHandlers}
                    onPointerDown={({ pointerType }) => {
                      if (pointerType === 'touch' && arrowOpen) {
                        setArrowOpen(false);
                      } else {
                        openArrowMenu();
                      }
                      if (isArrowLinePointer(board)) {
                        BoardTransforms.updatePointerType(board, board.pointer);
                      } else {
                        setCreationMode(board, BoardCreationMode.drawing);
                        BoardTransforms.updatePointerType(board, toolState.lastArrowPointer);
                        updateToolState({
                          pointer: toolState.lastArrowPointer,
                        });
                      }
                    }}
                  />
                </PopoverTrigger>
                <PopoverContent
                  container={container}
                  initialFocus={-1}
                  {...arrowContentHoverHandlers}
                >
                  <ArrowPicker
                    onPointerUp={(pointer: DrawPointerType) => {
                      setArrowOpen(false);
                      updateToolState({
                        pointer,
                        lastArrowPointer: pointer as ArrowLineShape,
                      });
                    }}
                  ></ArrowPicker>
                </PopoverContent>
              </Popover>
            );
          }
          if (button.key === 'extra-tools') {
            return <ExtraToolsButton key={index}></ExtraToolsButton>;
          }
          return (
            <ToolButton
              key={index}
              type="radio"
              icon={button.icon}
              checked={isChecked(button)}
              keyBindingLabel={button.keyBinding}
              title={button.titleKey ? t(button.titleKey) : ''}
              aria-label={button.titleKey ? t(button.titleKey) : ''}
              onPointerDown={() => {
                if (button.pointer && !isBasicPointer(button.pointer)) {
                  onPointerDown(button.pointer);
                }
              }}
              onPointerUp={() => {
                if (button.pointer && !isBasicPointer(button.pointer)) {
                  onPointerUp();
                } else if (button.pointer && isBasicPointer(button.pointer)) {
                  BoardTransforms.updatePointerType(board, button.pointer);
                  updateToolState({ pointer: button.pointer });
                }
                if (button.key === 'image') {
                  addImage(board);
                }
              }}
            />
          );
        })}
      </Stack.Row>
    </Island>
  );
};
