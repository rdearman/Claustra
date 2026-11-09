import type { Action } from '../engine/engine';
import type { BoardDefinition, Vertex } from '../engine/boards';

export type BoardPoint = { x: number; y: number };
export type Matrix2D = { a: number; b: number; c: number; d: number; e: number; f: number };
export type BoardGesture = {
  pointerId: number;
  vertex: Vertex;
  stoneId: string | null;
  origin: Vertex | null;
  start: BoardPoint;
  startScreen: BoardPoint;
  current: BoardPoint;
  dragging: boolean;
};

export function transformPoint(point: BoardPoint, matrix: Matrix2D): BoardPoint {
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f };
}

export function beginBoardGesture(pointerId: number, vertex: Vertex, point: BoardPoint, stoneId: string | null, origin: Vertex | null, screenPoint = point): BoardGesture {
  return { pointerId, vertex, stoneId, origin, start: point, startScreen: screenPoint, current: point, dragging: false };
}

export function moveBoardGesture(gesture: BoardGesture, pointerId: number, point: BoardPoint, threshold = 10, screenPoint = point): BoardGesture {
  if (gesture.pointerId !== pointerId) return gesture;
  const distance = Math.hypot(screenPoint.x - gesture.startScreen.x, screenPoint.y - gesture.startScreen.y);
  return { ...gesture, current: point, dragging: gesture.dragging || (gesture.stoneId !== null && distance >= threshold) };
}

/** Selects only among engine-authorized destinations. Equidistant hits are intentionally rejected. */
export function nearestLegalDestination(
  point: BoardPoint,
  legalDestinations: readonly Vertex[],
  coordinates: BoardDefinition['coordinates'],
  radius = 52,
): Vertex | null {
  const within = legalDestinations
    .map(vertex => ({ vertex, distance: Math.hypot(coordinates[vertex][0] - point.x, coordinates[vertex][1] - point.y) }))
    .filter(candidate => candidate.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
  if (!within.length) return null;
  if (within.length > 1 && Math.abs(within[0].distance - within[1].distance) < 2) return null;
  return within[0].vertex;
}

export function resolveDragAction(gesture: BoardGesture, point: BoardPoint, actions: readonly Action[], board: BoardDefinition): Extract<Action,{kind:'move'}> | null {
  if (!gesture.dragging || !gesture.stoneId) return null;
  const moves = actions.filter((action): action is Extract<Action,{kind:'move'}> => action.kind === 'move' && action.stoneId === gesture.stoneId);
  const destination = nearestLegalDestination(point, moves.map(move => move.to), board.coordinates);
  return destination ? moves.find(move => move.to === destination) ?? null : null;
}

export function resolveTapAction(vertex: Vertex, selectedStone: string | null, actions: readonly Action[]): Action | null {
  if (selectedStone) {
    const move = actions.find(action => action.kind === 'move' && action.stoneId === selectedStone && action.to === vertex);
    if (move) return move;
  }
  return actions.find(action => action.kind === 'return' && action.to === vertex) ?? null;
}

export function boardViewBox(board: BoardDefinition, margin = 46): [number, number, number, number] {
  const points = Object.values(board.coordinates);
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const left = Math.min(...xs) - margin;
  const top = Math.min(...ys) - margin;
  return [left, top, Math.max(...xs) - Math.min(...xs) + margin * 2, Math.max(...ys) - Math.min(...ys) + margin * 2];
}

export function trackSegment(board: BoardDefinition, from: Vertex, to: Vertex): Vertex[] | null {
  for (const track of board.tracks) {
    const start = track.indexOf(from);
    const end = track.indexOf(to);
    if (start < 0 || end < 0) continue;
    return track.slice(Math.min(start, end), Math.max(start, end) + 1);
  }
  return null;
}
