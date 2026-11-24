import { afterEach, describe, expect, it } from 'vitest';
import { withHistory } from '@plait/core';
import type { PlaitArrowLine, PlaitGeometry } from '@plait/draw';
import {
  ArrowLineMarkerType,
  ArrowLineShape,
  BasicShapes,
  FlowchartSymbols,
  UMLSymbols,
} from '@plait/draw';
import { setupDrawnixTestingBoard } from '../../testing';
import type { DrawnixTestingBoardFixture } from '../../testing';
import { createDrawnixAgent, installDrawnixAgent } from './drawnix-agent';

const getTextContent = (value: unknown): string | undefined => {
  const text = value as { children?: Array<{ text?: string }> } | undefined;
  return text?.children?.[0]?.text;
};

describe('drawnix agent', () => {
  let fixture: DrawnixTestingBoardFixture | undefined;

  afterEach(() => {
    fixture?.destroy();
    fixture = undefined;
  });

  const setupAgent = () => {
    fixture = setupDrawnixTestingBoard([withHistory], []);
    return createDrawnixAgent(fixture.board);
  };

  it('adds shapes and binds arrows between their edges', () => {
    const agent = setupAgent();

    agent.addElements([
      {
        id: 'source',
        shape: BasicShapes.rectangle,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Source',
      },
      {
        id: 'target',
        shape: BasicShapes.ellipse,
        x: 200,
        y: 0,
        width: 100,
        height: 50,
        text: 'Target',
      },
      {
        kind: 'arrow',
        id: 'arrow',
        from: { elementId: 'source' },
        to: { elementId: 'target' },
        text: 'calls',
      },
    ]);

    const elements = agent.getElements();
    expect(elements).toHaveLength(3);

    const source = elements.find((element) => element.id === 'source') as PlaitGeometry;
    expect(source.points).toEqual([
      [0, 0],
      [100, 50],
    ]);
    expect(getTextContent(source.text)).toBe('Source');

    const arrow = elements.find((element) => element.id === 'arrow') as PlaitArrowLine;
    expect(arrow.type).toBe('arrow-line');
    expect(arrow.shape).toBe(ArrowLineShape.straight);
    expect(arrow.source.boundId).toBe('source');
    expect(arrow.target.boundId).toBe('target');
    expect(arrow.source.marker).toBe(ArrowLineMarkerType.none);
    expect(arrow.target.marker).toBe(ArrowLineMarkerType.arrow);
    expect(arrow.points).toEqual([
      [100, 25],
      [200, 25],
    ]);
    expect(getTextContent(arrow.texts[0].text)).toBe('calls');
  });

  it('binds new arrows to elements that already exist on the board', () => {
    const agent = setupAgent();
    agent.addElements([
      {
        id: 'existing',
        shape: BasicShapes.rectangle,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      },
    ]);

    agent.addElements([
      {
        kind: 'arrow',
        id: 'link',
        from: { elementId: 'existing' },
        to: { x: 300, y: 25 },
      },
    ]);

    const arrow = agent.getElements().find((element) => element.id === 'link') as PlaitArrowLine;
    expect(arrow.source.boundId).toBe('existing');
    expect(arrow.target.boundId).toBeUndefined();
    expect(arrow.points).toEqual([
      [100, 25],
      [300, 25],
    ]);
  });

  it('creates flowchart and UML shapes with their native data structure', () => {
    const agent = setupAgent();
    agent.addElements([
      {
        id: 'decision',
        shape: FlowchartSymbols.decision,
        x: 0,
        y: 0,
        width: 120,
        height: 80,
        text: 'Is it valid?',
      },
      {
        id: 'class',
        shape: UMLSymbols.class,
        x: 0,
        y: 200,
        width: 180,
        height: 140,
      },
      {
        id: 'package',
        shape: UMLSymbols.package,
        x: 300,
        y: 200,
        width: 180,
        height: 120,
        text: 'Core',
      },
    ]);

    const elements = agent.getElements();
    const decision = elements.find((element) => element.id === 'decision') as PlaitGeometry;
    const umlClass = elements.find((element) => element.id === 'class') as PlaitGeometry;
    const umlPackage = elements.find((element) => element.id === 'package') as PlaitGeometry;

    expect(decision.shape).toBe(FlowchartSymbols.decision);
    expect(getTextContent(decision.text)).toBe('Is it valid?');
    expect(umlClass.cells).toHaveLength(3);
    expect(getTextContent(umlPackage.texts[0].text)).toBe('Core');
  });

  it('updates, selects, and deletes elements by id', () => {
    const agent = setupAgent();
    agent.addElements([
      {
        id: 'node',
        shape: BasicShapes.rectangle,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Before',
      },
    ]);

    const [updated] = agent.updateElements([
      {
        id: 'node',
        x: 20,
        y: 30,
        width: 160,
        height: 80,
        text: 'After',
        fill: '#e3f2fd',
      },
    ]);

    expect(updated.points).toEqual([
      [20, 30],
      [180, 110],
    ]);
    expect(getTextContent(updated.text)).toBe('After');
    expect(updated.fill).toBe('#e3f2fd');
    expect(agent.getSelection().ids).toEqual([]);

    const selection = agent.selectElements(['node']);
    expect(selection.ids).toEqual(['node']);
    expect(selection.rectangle).toEqual({
      anchor: [20, 30],
      focus: [180, 110],
    });

    expect(agent.deleteElements(['node'])).toEqual(['node']);
    expect(agent.deleteElements(['missing'])).toEqual([]);
    expect(agent.getElements()).toEqual([]);
  });

  it('returns deep copies of board data', () => {
    const agent = setupAgent();
    agent.addElements([
      {
        id: 'node',
        shape: BasicShapes.rectangle,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      },
    ]);

    const elements = agent.getElements();
    elements[0].points = [
      [999, 999],
      [1000, 1000],
    ];
    const document = agent.getDocument();
    document.viewport.zoom = 999;

    expect(agent.getElements()[0].points).toEqual([
      [0, 0],
      [100, 50],
    ]);
    expect(agent.getDocument().viewport.zoom).not.toBe(999);
  });

  it('keeps a batch in one undo step', () => {
    const agent = setupAgent();
    agent.addElements([
      {
        id: 'a',
        shape: BasicShapes.rectangle,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      },
      {
        id: 'b',
        shape: BasicShapes.rectangle,
        x: 200,
        y: 0,
        width: 100,
        height: 50,
      },
    ]);

    agent.undo();
    expect(agent.getElements()).toEqual([]);

    agent.redo();
    expect(agent.getElements().map((element) => element.id)).toEqual(['a', 'b']);
  });

  it('executes operations and reports errors without throwing', () => {
    const agent = setupAgent();

    const addResult = agent.execute({
      action: 'addElements',
      payload: [
        {
          id: 'node',
          shape: BasicShapes.diamond,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
        },
      ],
    });
    expect(addResult.ok).toBe(true);

    const duplicateResult = agent.execute({
      action: 'addElements',
      payload: [
        {
          id: 'node',
          shape: BasicShapes.rectangle,
          x: 0,
          y: 0,
          width: 100,
          height: 50,
        },
      ],
    });
    expect(duplicateResult.ok).toBe(false);
    if (!duplicateResult.ok) {
      expect(duplicateResult.error.message).toContain('already exists');
    }

    const unknownResult = agent.execute({ action: 'unknown' } as never);
    expect(unknownResult.ok).toBe(false);
    if (!unknownResult.ok) {
      expect(unknownResult.error.message).toContain('Unknown action');
    }
  });

  it('installs and removes the global agent', () => {
    fixture = setupDrawnixTestingBoard([], []);
    const target: Record<string, unknown> = {};
    const installation = installDrawnixAgent(fixture.board, {
      globalName: 'testAgent',
      target,
    });

    expect(target.testAgent).toBe(installation.agent);
    expect(
      (target.testAgent as ReturnType<typeof createDrawnixAgent>).execute({
        action: 'getElements',
      }).ok
    ).toBe(true);

    installation.dispose();
    expect(target.testAgent).toBeUndefined();
  });
});
