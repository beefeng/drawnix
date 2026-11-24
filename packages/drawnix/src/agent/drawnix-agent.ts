import {
  CoreTransforms,
  PlaitHistoryBoard,
  PlaitBoard,
  RectangleClient,
  Transforms,
  BoardTransforms,
  addSelectedElement,
  clearSelectedElement,
  clampZoomLevel,
  getSelectedElements,
  idCreator,
  type PlaitElement,
  type Point,
  type Viewport,
} from '@plait/core';
import {
  ArrowLineMarkerType,
  ArrowLineShape,
  BasicShapes,
  FlowchartSymbols,
  UMLSymbols,
  createArrowLineElement,
  createGeometryElement,
  createMultipleTextGeometryElement,
  createUMLClassOrInterfaceGeometryElement,
  type PlaitArrowLine,
  type PlaitGeometry,
} from '@plait/draw';
import { Alignment, buildText } from '@plait/common';
import { serializeAsJSON } from '../data/json';
import type {
  DrawnixAgent,
  DrawnixAgentArrowInput,
  DrawnixAgentDocument,
  DrawnixAgentElementInput,
  DrawnixAgentElementUpdate,
  DrawnixAgentEndpoint,
  DrawnixAgentInstallation,
  DrawnixAgentMarker,
  DrawnixAgentOperation,
  DrawnixAgentOperationResult,
  DrawnixAgentOptions,
  DrawnixAgentSelectionState,
  DrawnixAgentShapeInput,
  DrawnixAgentSide,
  DrawnixAgentViewportInput,
} from './types';

const DEFAULT_GLOBAL_NAME = 'drawnixAgent';

const SHAPE_VALUES = new Set<string>([
  ...Object.values(BasicShapes),
  ...Object.values(FlowchartSymbols),
  ...Object.values(UMLSymbols),
]);

const ARROW_SHAPE_VALUES = new Set<string>(Object.values(ArrowLineShape));

const SIDE_CONNECTIONS: Record<DrawnixAgentSide, Point> = {
  top: [0.5, 0],
  right: [1, 0.5],
  bottom: [0.5, 1],
  left: [0, 0.5],
};

const MARKER_VALUES = new Set<string>(Object.values(ArrowLineMarkerType));

const TEXT_ALIGNMENTS: Record<NonNullable<DrawnixAgentShapeInput['textAlign']>, Alignment> = {
  left: Alignment.left,
  center: Alignment.center,
  right: Alignment.right,
};

export class DrawnixAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawnixAgentError';
  }
}

const assertFiniteNumber = (value: unknown, name: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DrawnixAgentError(`${name} must be a finite number`);
  }
  return value;
};

const assertPositiveSize = (value: unknown, name: string): number => {
  const numberValue = assertFiniteNumber(value, name);
  if (numberValue <= 0) {
    throw new DrawnixAgentError(`${name} must be greater than 0`);
  }
  return numberValue;
};

const assertPoint = (point: unknown, name: string): Point => {
  if (!Array.isArray(point) || point.length !== 2) {
    throw new DrawnixAgentError(`${name} must be a [x, y] tuple`);
  }
  return [assertFiniteNumber(point[0], `${name}[0]`), assertFiniteNumber(point[1], `${name}[1]`)];
};

const cloneElement = <T extends PlaitElement>(element: T): T => {
  return structuredClone(element);
};

const cloneElements = (elements: PlaitElement[]): PlaitElement[] => {
  return elements.map((element) => cloneElement(element));
};

const cloneValue = <T>(value: T): T => {
  return structuredClone(value);
};

const isArrowInput = (element: DrawnixAgentElementInput): element is DrawnixAgentArrowInput => {
  return element.kind === 'arrow';
};

const getShapePoints = (input: DrawnixAgentShapeInput): [Point, Point] => {
  const x = assertFiniteNumber(input.x, 'x');
  const y = assertFiniteNumber(input.y, 'y');
  const width = assertPositiveSize(input.width, 'width');
  const height = assertPositiveSize(input.height, 'height');
  return [
    [x, y],
    [x + width, y + height],
  ];
};

const getRectangle = (element: PlaitElement): RectangleClient => {
  if (!element.points || element.points.length === 0) {
    throw new DrawnixAgentError(`Element ${element.id} does not have points`);
  }
  return RectangleClient.getRectangleByPoints(element.points);
};

const getSideConnection = (
  fromElement: PlaitElement,
  toElement: PlaitElement
): { source: DrawnixAgentSide; target: DrawnixAgentSide } => {
  const fromRectangle = getRectangle(fromElement);
  const toRectangle = getRectangle(toElement);
  const fromCenter = RectangleClient.getCenterPoint(fromRectangle);
  const toCenter = RectangleClient.getCenterPoint(toRectangle);
  const dx = toCenter[0] - fromCenter[0];
  const dy = toCenter[1] - fromCenter[1];

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' };
  }
  return dy >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' };
};

const getConnectionPoint = (element: PlaitElement, side: DrawnixAgentSide): Point => {
  const rectangle = getRectangle(element);
  return RectangleClient.getConnectionPoint(rectangle, SIDE_CONNECTIONS[side]);
};

const getSideTowardPoint = (element: PlaitElement, point: Point): DrawnixAgentSide => {
  const rectangle = getRectangle(element);
  const center = RectangleClient.getCenterPoint(rectangle);
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
};

const getMarker = (
  value: DrawnixAgentMarker | undefined,
  fallback: ArrowLineMarkerType
): ArrowLineMarkerType => {
  if (value === undefined) {
    return fallback;
  }
  if (!MARKER_VALUES.has(value)) {
    throw new DrawnixAgentError(`Unknown arrow marker: ${value}`);
  }
  return value as ArrowLineMarkerType;
};

const buildArrowTexts = (text: string | undefined, fontSize?: number) => {
  if (text === undefined) {
    return [];
  }
  return [
    {
      text: buildText(
        text,
        undefined,
        fontSize ? { 'font-size': `${fontSize}px` } : undefined
      ) as PlaitArrowLine['texts'][number]['text'],
      position: 0.5,
    },
  ];
};

const findElementById = (board: PlaitBoard, id: string): PlaitElement | undefined => {
  return board.children.find((element) => element.id === id);
};

const getElementIndex = (board: PlaitBoard, id: string): number => {
  return board.children.findIndex((element) => element.id === id);
};

const ensureUniqueId = (
  board: PlaitBoard,
  id: string | undefined,
  pendingIds: Set<string>,
  label: string
): string => {
  const nextId = id ?? idCreator();
  if (pendingIds.has(nextId) || findElementById(board, nextId)) {
    throw new DrawnixAgentError(`${label} id already exists: ${nextId}`);
  }
  pendingIds.add(nextId);
  return nextId;
};

const createShapeElement = (
  board: PlaitBoard,
  input: DrawnixAgentShapeInput,
  id: string
): PlaitGeometry => {
  if (!SHAPE_VALUES.has(input.shape)) {
    throw new DrawnixAgentError(`Unknown shape: ${input.shape}`);
  }
  const points = getShapePoints(input);
  const styleOptions = {
    ...(input.fill !== undefined ? { fill: input.fill } : {}),
    ...(input.strokeColor !== undefined ? { strokeColor: input.strokeColor } : {}),
    ...(input.strokeWidth !== undefined
      ? { strokeWidth: assertFiniteNumber(input.strokeWidth, 'strokeWidth') }
      : {}),
    ...(input.strokeStyle !== undefined
      ? { strokeStyle: input.strokeStyle as PlaitGeometry['strokeStyle'] }
      : {}),
    ...(input.fillStyle !== undefined
      ? { fillStyle: input.fillStyle as PlaitGeometry['fillStyle'] }
      : {}),
    ...(input.opacity !== undefined
      ? { opacity: assertFiniteNumber(input.opacity, 'opacity') }
      : {}),
    ...(input.angle !== undefined ? { angle: assertFiniteNumber(input.angle, 'angle') } : {}),
  };
  if (input.shape === UMLSymbols.class || input.shape === UMLSymbols.interface) {
    return {
      ...createUMLClassOrInterfaceGeometryElement(board, input.shape, points),
      ...styleOptions,
      id,
    } as PlaitGeometry;
  }
  if (input.shape === UMLSymbols.package || input.shape === UMLSymbols.combinedFragment) {
    const element = createMultipleTextGeometryElement(input.shape, points, styleOptions);
    if (input.text && element.texts.length > 0) {
      element.texts[0].text = buildText(input.text) as (typeof element.texts)[number]['text'];
    }
    return { ...element, id } as PlaitGeometry;
  }
  const element = createGeometryElement(input.shape, points, input.text ?? '', styleOptions, {
    ...(input.textAlign ? { align: TEXT_ALIGNMENTS[input.textAlign] } : {}),
    ...(input.fontSize ? { 'font-size': `${input.fontSize}px` } : {}),
  });
  return { ...element, id };
};

const resolveEndpoint = (
  endpoint: DrawnixAgentEndpoint,
  elements: Map<string, PlaitElement>,
  label: string
): { element?: PlaitElement; point: Point; side?: DrawnixAgentSide } => {
  if ('elementId' in endpoint) {
    const element = elements.get(endpoint.elementId);
    if (!element) {
      throw new DrawnixAgentError(`${label} references unknown element: ${endpoint.elementId}`);
    }
    return {
      element,
      point: endpoint.side ? getConnectionPoint(element, endpoint.side) : [0, 0],
      side: endpoint.side,
    };
  }
  if ('x' in endpoint) {
    return {
      point: [
        assertFiniteNumber(endpoint.x, `${label}.x`),
        assertFiniteNumber(endpoint.y, `${label}.y`),
      ],
    };
  }
  throw new DrawnixAgentError(`${label} must be either { elementId } or { x, y }`);
};

const createArrowElement = (
  input: DrawnixAgentArrowInput,
  id: string,
  elements: Map<string, PlaitElement>
): PlaitArrowLine => {
  const shape = (input.shape ?? ArrowLineShape.straight) as ArrowLineShape;
  if (!ARROW_SHAPE_VALUES.has(shape)) {
    throw new DrawnixAgentError(`Unknown arrow shape: ${shape}`);
  }

  let points: Point[];
  let sourceBoundId: string | undefined;
  let sourceConnection: Point | undefined;
  let targetBoundId: string | undefined;
  let targetConnection: Point | undefined;

  if (input.points) {
    if (input.points.length < 2) {
      throw new DrawnixAgentError('arrow.points must contain at least two points');
    }
    points = input.points.map((point, index) => assertPoint(point, `points[${index}]`));
  } else {
    if (!input.from || !input.to) {
      throw new DrawnixAgentError('arrow requires either points or both from and to');
    }
    const source = resolveEndpoint(input.from, elements, 'from');
    const target = resolveEndpoint(input.to, elements, 'to');

    if (source.element && target.element) {
      const sides = getSideConnection(source.element, target.element);
      const sourceSide = source.side ?? sides.source;
      const targetSide = target.side ?? sides.target;
      points = [
        getConnectionPoint(source.element, sourceSide),
        getConnectionPoint(target.element, targetSide),
      ];
      sourceBoundId = source.element.id;
      sourceConnection = SIDE_CONNECTIONS[sourceSide];
      targetBoundId = target.element.id;
      targetConnection = SIDE_CONNECTIONS[targetSide];
    } else {
      const sourceSide = source.element
        ? (source.side ?? getSideTowardPoint(source.element, target.point))
        : undefined;
      const targetSide = target.element
        ? (target.side ?? getSideTowardPoint(target.element, source.point))
        : undefined;
      const sourcePoint =
        source.element && sourceSide
          ? getConnectionPoint(source.element, sourceSide)
          : source.point;
      const targetPoint =
        target.element && targetSide
          ? getConnectionPoint(target.element, targetSide)
          : target.point;
      if (source.element && sourceSide) {
        sourceBoundId = source.element.id;
        sourceConnection = SIDE_CONNECTIONS[sourceSide];
      }
      if (target.element && targetSide) {
        targetBoundId = target.element.id;
        targetConnection = SIDE_CONNECTIONS[targetSide];
      }
      points = [sourcePoint, targetPoint];
    }
  }

  const element = createArrowLineElement(
    shape,
    [points[0], points[points.length - 1]],
    {
      ...(sourceBoundId ? { boundId: sourceBoundId } : {}),
      ...(sourceConnection ? { connection: sourceConnection } : {}),
      marker: getMarker(input.sourceMarker, ArrowLineMarkerType.none),
    },
    {
      ...(targetBoundId ? { boundId: targetBoundId } : {}),
      ...(targetConnection ? { connection: targetConnection } : {}),
      marker: getMarker(input.targetMarker, ArrowLineMarkerType.arrow),
    },
    buildArrowTexts(input.text, input.fontSize),
    {
      ...(input.strokeColor !== undefined ? { strokeColor: input.strokeColor } : {}),
      ...(input.strokeWidth !== undefined
        ? { strokeWidth: assertFiniteNumber(input.strokeWidth, 'strokeWidth') }
        : {}),
      ...(input.strokeStyle !== undefined
        ? { strokeStyle: input.strokeStyle as PlaitArrowLine['strokeStyle'] }
        : {}),
      ...(input.opacity !== undefined
        ? { opacity: assertFiniteNumber(input.opacity, 'opacity') }
        : {}),
    }
  );

  return {
    ...element,
    id,
    points,
  };
};

const applyShapeUpdate = (
  element: PlaitElement,
  update: DrawnixAgentElementUpdate
): PlaitElement => {
  const nextElement: PlaitElement = { ...element };
  let points = element.points;

  if (update.points) {
    points = update.points.map((point, index) => assertPoint(point, `points[${index}]`));
  } else if (element.points) {
    const rectangle = getRectangle(element);
    const x = update.x !== undefined ? assertFiniteNumber(update.x, 'x') : rectangle.x;
    const y = update.y !== undefined ? assertFiniteNumber(update.y, 'y') : rectangle.y;
    const width =
      update.width !== undefined ? assertPositiveSize(update.width, 'width') : rectangle.width;
    const height =
      update.height !== undefined ? assertPositiveSize(update.height, 'height') : rectangle.height;
    points = [
      [x, y],
      [x + width, y + height],
    ];
  }

  if (points) {
    nextElement.points = points;
  }
  if (update.text !== undefined) {
    nextElement.text = buildText(update.text, element.text?.align);
  }
  if (update.fill !== undefined) {
    nextElement.fill = update.fill;
  }
  if (update.strokeColor !== undefined) {
    nextElement.strokeColor = update.strokeColor;
  }
  if (update.strokeWidth !== undefined) {
    nextElement.strokeWidth = assertFiniteNumber(update.strokeWidth, 'strokeWidth');
  }
  if (update.strokeStyle !== undefined) {
    nextElement.strokeStyle = update.strokeStyle;
  }
  if (update.fillStyle !== undefined) {
    nextElement.fillStyle = update.fillStyle;
  }
  if (update.opacity !== undefined) {
    nextElement.opacity = assertFiniteNumber(update.opacity, 'opacity');
  }
  if (update.angle !== undefined) {
    nextElement.angle = assertFiniteNumber(update.angle, 'angle');
  }

  return nextElement;
};

const applyArrowUpdate = (
  element: PlaitArrowLine,
  update: DrawnixAgentElementUpdate
): PlaitArrowLine => {
  const nextElement: PlaitArrowLine = { ...element };
  if (update.points) {
    nextElement.points = update.points.map((point, index) =>
      assertPoint(point, `points[${index}]`)
    );
  } else if (
    update.x !== undefined ||
    update.y !== undefined ||
    update.width !== undefined ||
    update.height !== undefined
  ) {
    const rectangle = getRectangle(element);
    const x = update.x !== undefined ? assertFiniteNumber(update.x, 'x') : rectangle.x;
    const y = update.y !== undefined ? assertFiniteNumber(update.y, 'y') : rectangle.y;
    const width =
      update.width !== undefined ? assertPositiveSize(update.width, 'width') : rectangle.width;
    const height =
      update.height !== undefined ? assertPositiveSize(update.height, 'height') : rectangle.height;
    nextElement.points = element.points.map((point) => [
      x + ((point[0] - rectangle.x) / rectangle.width) * width,
      y + ((point[1] - rectangle.y) / rectangle.height) * height,
    ]);
  }
  if (update.text !== undefined) {
    nextElement.texts = buildArrowTexts(update.text);
  }
  if (update.strokeColor !== undefined) {
    nextElement.strokeColor = update.strokeColor;
  }
  if (update.strokeWidth !== undefined) {
    nextElement.strokeWidth = assertFiniteNumber(update.strokeWidth, 'strokeWidth');
  }
  if (update.strokeStyle !== undefined) {
    nextElement.strokeStyle = update.strokeStyle as PlaitArrowLine['strokeStyle'];
  }
  if (update.opacity !== undefined) {
    nextElement.opacity = assertFiniteNumber(update.opacity, 'opacity');
  }
  return nextElement;
};

const isArrowElement = (element: PlaitElement): element is PlaitArrowLine => {
  return element.type === 'arrow-line';
};

export class DrawnixAgentImpl implements DrawnixAgent {
  constructor(private readonly board: PlaitBoard) {
    this.getDocument = this.getDocument.bind(this);
    this.getElements = this.getElements.bind(this);
    this.getSelection = this.getSelection.bind(this);
    this.addElements = this.addElements.bind(this);
    this.updateElements = this.updateElements.bind(this);
    this.deleteElements = this.deleteElements.bind(this);
    this.clear = this.clear.bind(this);
    this.selectElements = this.selectElements.bind(this);
    this.setViewport = this.setViewport.bind(this);
    this.fitViewport = this.fitViewport.bind(this);
    this.undo = this.undo.bind(this);
    this.redo = this.redo.bind(this);
    this.exportJSON = this.exportJSON.bind(this);
    this.execute = this.execute.bind(this);
    this.dispose = this.dispose.bind(this);
    Object.defineProperty(this, 'board', { enumerable: false });
  }

  getDocument(): DrawnixAgentDocument {
    return {
      elements: this.getElements(),
      viewport: cloneValue(this.board.viewport),
      theme: this.board.theme.themeColorMode,
      selection: this.getSelection(),
    };
  }

  getElements(): PlaitElement[] {
    return cloneElements(this.board.children);
  }

  getSelection(): DrawnixAgentSelectionState {
    return {
      ids: [...new Set(getSelectedElements(this.board).map((element) => element.id))],
      rectangle: this.board.selection ? cloneValue(this.board.selection) : null,
    };
  }

  addElements(elements: DrawnixAgentElementInput[]): PlaitElement[] {
    if (!Array.isArray(elements)) {
      throw new DrawnixAgentError('elements must be an array');
    }

    const pendingIds = new Set<string>();
    const shapeInputs = elements.filter(
      (element): element is DrawnixAgentShapeInput => !isArrowInput(element)
    );
    const arrowInputs = elements.filter(isArrowInput);
    const createdShapes = shapeInputs.map((input) => {
      const id = ensureUniqueId(this.board, input.id, pendingIds, 'shape');
      return createShapeElement(this.board, input, id);
    });
    const createdElements: PlaitElement[] = [...createdShapes];
    const elementMap = new Map<string, PlaitElement>(
      this.board.children.map((element) => [element.id, element])
    );
    createdShapes.forEach((element) => elementMap.set(element.id, element));

    const createdArrows = arrowInputs.map((input) => {
      const id = ensureUniqueId(this.board, input.id, pendingIds, 'arrow');
      return createArrowElement(input, id, elementMap);
    });
    createdElements.push(...createdArrows);

    PlaitHistoryBoard.withNewBatch(this.board, () => {
      createdElements.forEach((element) => {
        Transforms.insertNode(this.board, element, [this.board.children.length]);
      });
    });

    return cloneElements(createdElements);
  }

  updateElements(updates: DrawnixAgentElementUpdate[]): PlaitElement[] {
    if (!Array.isArray(updates)) {
      throw new DrawnixAgentError('updates must be an array');
    }
    const updatedElements: PlaitElement[] = [];
    PlaitHistoryBoard.withNewBatch(this.board, () => {
      updates.forEach((update) => {
        if (!update || typeof update.id !== 'string' || !update.id) {
          throw new DrawnixAgentError('each update must include an id');
        }
        const index = getElementIndex(this.board, update.id);
        if (index === -1) {
          throw new DrawnixAgentError(`Element not found: ${update.id}`);
        }
        const element = this.board.children[index];
        const nextElement = isArrowElement(element)
          ? applyArrowUpdate(element, update)
          : applyShapeUpdate(element, update);
        Transforms.setNode(this.board, nextElement, [index]);
        updatedElements.push(nextElement);
      });
    });
    return cloneElements(updatedElements);
  }

  deleteElements(ids: string[]): string[] {
    if (!Array.isArray(ids)) {
      throw new DrawnixAgentError('ids must be an array');
    }
    const elements = ids
      .map((id) => findElementById(this.board, id))
      .filter((element): element is PlaitElement => Boolean(element));
    if (elements.length > 0) {
      PlaitHistoryBoard.withNewBatch(this.board, () => {
        CoreTransforms.removeElements(this.board, elements);
      });
    }
    return elements.map((element) => element.id);
  }

  clear(): void {
    clearSelectedElement(this.board);
    Transforms.setSelection(this.board, null);
    if (this.board.children.length > 0) {
      PlaitHistoryBoard.withNewBatch(this.board, () => {
        CoreTransforms.removeElements(this.board, [...this.board.children]);
      });
    }
  }

  selectElements(ids: string[]): DrawnixAgentSelectionState {
    if (!Array.isArray(ids)) {
      throw new DrawnixAgentError('ids must be an array');
    }
    const elements = ids.map((id) => {
      const element = findElementById(this.board, id);
      if (!element) {
        throw new DrawnixAgentError(`Element not found: ${id}`);
      }
      return element;
    });
    clearSelectedElement(this.board);
    const rectangles = elements
      .filter((element) => element.points && element.points.length > 0)
      .map((element) => RectangleClient.getRectangleByPoints(element.points!));
    const rectangle =
      rectangles.length > 0 ? RectangleClient.getBoundingRectangle(rectangles) : null;
    const selection = rectangle
      ? {
          anchor: [rectangle.x, rectangle.y] as Point,
          focus: [rectangle.x + rectangle.width, rectangle.y + rectangle.height] as Point,
        }
      : null;
    const applySelection = () => {
      try {
        if (elements.some((element) => !findElementById(this.board, element.id))) {
          return;
        }
        clearSelectedElement(this.board);
        addSelectedElement(this.board, elements);
        Transforms.setSelection(this.board, selection);
      } catch {
        // The board may have been destroyed before the deferred selection runs.
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(applySelection);
    } else {
      setTimeout(applySelection, 0);
    }
    return {
      ids: elements.map((element) => element.id),
      rectangle: selection,
    };
  }

  setViewport(viewport: DrawnixAgentViewportInput): Viewport {
    const current = this.board.viewport;
    const origination = viewport.origination
      ? assertPoint(viewport.origination, 'origination')
      : current.origination;
    const zoom = clampZoomLevel(
      viewport.zoom !== undefined ? assertFiniteNumber(viewport.zoom, 'zoom') : current.zoom
    );
    if (!origination) {
      throw new DrawnixAgentError('origination is required when the board has no viewport origin');
    }
    BoardTransforms.updateViewport(this.board, origination, zoom);
    return cloneValue(this.board.viewport);
  }

  fitViewport(): Viewport {
    BoardTransforms.fitViewport(this.board);
    return cloneValue(this.board.viewport);
  }

  undo(): void {
    this.board.undo();
  }

  redo(): void {
    this.board.redo();
  }

  exportJSON(): string {
    return serializeAsJSON(this.board);
  }

  execute(operation: DrawnixAgentOperation): DrawnixAgentOperationResult {
    try {
      switch (operation.action) {
        case 'getDocument':
          return { ok: true, result: this.getDocument() };
        case 'getElements':
          return { ok: true, result: this.getElements() };
        case 'getSelection':
          return { ok: true, result: this.getSelection() };
        case 'addElements':
          return { ok: true, result: this.addElements(operation.payload) };
        case 'updateElements':
          return { ok: true, result: this.updateElements(operation.payload) };
        case 'deleteElements':
          return { ok: true, result: this.deleteElements(operation.payload) };
        case 'clear':
          this.clear();
          return { ok: true, result: null };
        case 'selectElements':
          return { ok: true, result: this.selectElements(operation.payload) };
        case 'setViewport':
          return { ok: true, result: this.setViewport(operation.payload) };
        case 'fitViewport':
          return { ok: true, result: this.fitViewport() };
        case 'undo':
          this.undo();
          return { ok: true, result: null };
        case 'redo':
          this.redo();
          return { ok: true, result: null };
        case 'exportJSON':
          return { ok: true, result: this.exportJSON() };
        default:
          throw new DrawnixAgentError(
            `Unknown action: ${(operation as { action?: string }).action ?? '<empty>'}`
          );
      }
    } catch (error) {
      return {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'Error',
        },
      };
    }
  }

  dispose(): void {
    // The agent only holds a board reference, so there is nothing to clean up here.
  }
}

export const createDrawnixAgent = (board: PlaitBoard): DrawnixAgentImpl => {
  return new DrawnixAgentImpl(board);
};

export const installDrawnixAgent = (
  board: PlaitBoard,
  options: DrawnixAgentOptions = {}
): DrawnixAgentInstallation => {
  const agent = createDrawnixAgent(board);
  const target: Record<string, unknown> | undefined =
    options.target ??
    (typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : undefined);
  const globalName = options.globalName ?? DEFAULT_GLOBAL_NAME;

  if (!target) {
    return {
      agent,
      dispose: () => agent.dispose(),
    };
  }

  target[globalName] = agent;
  return {
    agent,
    dispose: () => {
      if (target[globalName] === agent) {
        delete target[globalName];
      }
      agent.dispose();
    },
  };
};
