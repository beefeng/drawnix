import type { Point, Selection, Viewport } from '@plait/core';
import type { PlaitElement } from '@plait/core';
import type { ArrowLineShape, BasicShapes, FlowchartSymbols, UMLSymbols } from '@plait/draw';

export type DrawnixAgentShape = BasicShapes | FlowchartSymbols | UMLSymbols;

export type DrawnixAgentArrowShape = `${ArrowLineShape}`;

export type DrawnixAgentMarker =
  | 'arrow'
  | 'none'
  | 'open-triangle'
  | 'solid-triangle'
  | 'sharp-arrow'
  | 'one-side-up'
  | 'one-side-down'
  | 'hollow-triangle'
  | 'single-slash';

export type DrawnixAgentSide = 'top' | 'right' | 'bottom' | 'left';

export type DrawnixAgentEndpoint =
  | {
      elementId: string;
      side?: DrawnixAgentSide;
    }
  | {
      x: number;
      y: number;
    };

export interface DrawnixAgentShapeInput {
  kind?: 'shape';
  id?: string;
  shape: DrawnixAgentShape;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
  textAlign?: 'left' | 'center' | 'right';
  fill?: string;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  fillStyle?: string;
  opacity?: number;
  angle?: number;
}

export interface DrawnixAgentArrowInput {
  kind: 'arrow';
  id?: string;
  shape?: DrawnixAgentArrowShape;
  from?: DrawnixAgentEndpoint;
  to?: DrawnixAgentEndpoint;
  points?: Point[];
  text?: string;
  fontSize?: number;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  opacity?: number;
  sourceMarker?: DrawnixAgentMarker;
  targetMarker?: DrawnixAgentMarker;
}

export type DrawnixAgentElementInput = DrawnixAgentShapeInput | DrawnixAgentArrowInput;

export interface DrawnixAgentElementUpdate {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  points?: Point[];
  text?: string;
  fill?: string;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  fillStyle?: string;
  opacity?: number;
  angle?: number;
}

export interface DrawnixAgentSelectionState {
  ids: string[];
  rectangle: Selection | null;
}

export interface DrawnixAgentDocument {
  elements: PlaitElement[];
  viewport: Viewport;
  theme: string;
  selection: DrawnixAgentSelectionState;
}

export interface DrawnixAgentViewportInput {
  origination?: Point;
  zoom?: number;
}

export type DrawnixAgentOperation =
  | { action: 'getDocument' }
  | { action: 'getElements' }
  | { action: 'getSelection' }
  | { action: 'addElements'; payload: DrawnixAgentElementInput[] }
  | { action: 'updateElements'; payload: DrawnixAgentElementUpdate[] }
  | { action: 'deleteElements'; payload: string[] }
  | { action: 'clear' }
  | { action: 'selectElements'; payload: string[] }
  | { action: 'setViewport'; payload: DrawnixAgentViewportInput }
  | { action: 'fitViewport' }
  | { action: 'undo' }
  | { action: 'redo' }
  | { action: 'exportJSON' };

export type DrawnixAgentOperationResult<T = unknown> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      error: {
        message: string;
        name: string;
      };
    };

export interface DrawnixAgentOptions {
  /**
   * Global variable name. Defaults to `drawnixAgent`.
   */
  globalName?: string;
  /**
   * Where the agent is installed. Defaults to `window`.
   */
  target?: Record<string, unknown>;
}

export interface DrawnixAgentInstallation {
  agent: DrawnixAgent;
  dispose: () => void;
}

export interface DrawnixAgent {
  getDocument(): DrawnixAgentDocument;
  getElements(): PlaitElement[];
  getSelection(): DrawnixAgentSelectionState;
  addElements(elements: DrawnixAgentElementInput[]): PlaitElement[];
  updateElements(updates: DrawnixAgentElementUpdate[]): PlaitElement[];
  deleteElements(ids: string[]): string[];
  clear(): void;
  selectElements(ids: string[]): DrawnixAgentSelectionState;
  setViewport(viewport: DrawnixAgentViewportInput): Viewport;
  fitViewport(): Viewport;
  undo(): void;
  redo(): void;
  exportJSON(): string;
  execute(operation: DrawnixAgentOperation): DrawnixAgentOperationResult;
  dispose(): void;
}

declare global {
  interface Window {
    drawnixAgent?: DrawnixAgent;
  }
}
