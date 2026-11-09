import { describe, expect, it } from 'vitest';
import { BOARD_DEFINITIONS } from '../engine/boards';
import { applyAction, createInitialState, legalActions } from '../engine/engine';
import { boardViewBox, beginBoardGesture, moveBoardGesture, nearestLegalDestination, resolveDragAction, resolveTapAction, trackSegment, transformPoint } from './board-geometry';

describe('responsive board and pointer geometry', () => {
  it('keeps pointer conversion correct after CSS scaling and pan transforms', () => {
    const inverseTransform = { a: 0.5, b: 0, c: 0, d: 0.5, e: -40, f: 15 };
    expect(transformPoint({ x: 300, y: 250 }, inverseTransform)).toEqual({ x: 110, y: 140 });
  });

  it('fits all board vertices inside a padded responsive view box', () => {
    for (const board of Object.values(BOARD_DEFINITIONS)) {
      const [left, top, width, height] = boardViewBox(board);
      for (const [x, y] of Object.values(board.coordinates)) {
        expect(x).toBeGreaterThan(left);
        expect(x).toBeLessThan(left + width);
        expect(y).toBeGreaterThan(top);
        expect(y).toBeLessThan(top + height);
      }
    }
  });

  it('snaps only to legal destinations and cancels ambiguous or outside drops', () => {
    const board = BOARD_DEFINITIONS.TD19;
    const point = (vertex: string) => ({ x: board.coordinates[vertex][0], y: board.coordinates[vertex][1] });
    expect(nearestLegalDestination(point('T'), ['T'], board.coordinates)).toBe('T');
    expect(nearestLegalDestination(point('T'), [], board.coordinates)).toBeNull();
    expect(nearestLegalDestination({ x: 900, y: 900 }, ['T'], board.coordinates)).toBeNull();
    const hex = BOARD_DEFINITIONS.BH24;
    const midpoint = { x: (hex.coordinates.B4[0] + hex.coordinates.C4[0]) / 2, y: (hex.coordinates.B4[1] + hex.coordinates.C4[1]) / 2 };
    expect(nearestLegalDestination(midpoint, ['B4', 'C4'], hex.coordinates, 40)).toBeNull();
  });

  it('distinguishes a tap from a drag and ignores unrelated pointer ids', () => {
    const start = beginBoardGesture(8, 'NW', { x: 10, y: 10 }, 'white-1', 'NW');
    expect(moveBoardGesture(start, 9, { x: 90, y: 90 }).dragging).toBe(false);
    expect(moveBoardGesture(start, 8, { x: 13, y: 13 }).dragging).toBe(false);
    expect(moveBoardGesture(start, 8, { x: 20, y: 10 }).dragging).toBe(true);
  });

  it('highlights actual connected track segments, not geometric shortcuts', () => {
    const board = BOARD_DEFINITIONS.BH24;
    expect(trackSegment(board, 'B7', 'B1')).toEqual(['B7', 'B5', 'B4', 'B3', 'B1']);
    expect(trackSegment(board, 'A3', 'H1')).toBeNull();
  });

  it('commits exactly one engine action for a legal drag and leaves state unchanged for invalid drops', () => {
    const state = createInitialState('BH24');
    const action = legalActions(state).find(item => item.kind === 'move')!;
    if (action.kind !== 'move' || !action.from) throw new Error('Expected a board move');
    const point = (vertex: string) => ({x:BOARD_DEFINITIONS.BH24.coordinates[vertex][0],y:BOARD_DEFINITIONS.BH24.coordinates[vertex][1]});
    const gesture = moveBoardGesture(beginBoardGesture(1, action.from, point(action.from), action.stoneId, action.from), 1, point(action.to));
    expect(gesture.dragging).toBe(true);
    expect(resolveDragAction(gesture, point(action.to), legalActions(state), BOARD_DEFINITIONS.BH24)).toEqual(action);
    const after = applyAction(state, resolveDragAction(gesture, point(action.to), legalActions(state), BOARD_DEFINITIONS.BH24)!);
    expect(after.history).toHaveLength(state.history.length + 1);
    expect(after.turn).not.toBe(state.turn);
    expect(resolveDragAction(gesture, {x:-1000,y:-1000}, legalActions(state), BOARD_DEFINITIONS.BH24)).toBeNull();
    expect(state.history).toHaveLength(0);
  });

  it('supports tap-to-select/tap-to-move and never resolves an occupied point as a destination', () => {
    const state=createInitialState();const actions=legalActions(state);
    const move=actions.find(action=>action.kind==='move')!;
    if(move.kind!=='move')throw new Error('Expected move action');
    expect(resolveTapAction(move.to,move.stoneId,actions)).toEqual(move);
    const occupied=Object.values(state.pieces).find(piece=>piece.position)?.position!;
    expect(resolveTapAction(occupied,move.stoneId,actions)).toBeNull();
  });
});
