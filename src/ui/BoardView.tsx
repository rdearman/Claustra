import React, { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Action, GameSnapshot, Vertex } from '../engine/engine';
import type { BoardDefinition } from '../engine/boards';
import { vertexToTDAN } from '../notation/tdan';
import type { BoardGesture } from './board-geometry';
import { boardViewBox, nearestLegalDestination, trackSegment, transformPoint } from './board-geometry';

export type BoardFlight = { stoneId: string; color: 'white' | 'black'; from: Vertex; to: Vertex };
type MoveAction = Extract<Action, {kind:'move'}>;
type Props = {
  board: BoardDefinition;
  state: GameSnapshot;
  actions: Action[];
  selectedStone: string | null;
  gesture: BoardGesture | null;
  showCoordinates: boolean;
  replayMoved?: ReadonlySet<Vertex>;
  replayCaptured?: ReadonlySet<Vertex>;
  replayReturned?: ReadonlySet<Vertex>;
  flight?: BoardFlight | null;
  interactive: boolean;
  onGestureStart: (event: ReactPointerEvent<SVGSVGElement>, vertex: Vertex, point: {x:number;y:number}, screenPoint:{x:number;y:number}) => void;
  onGestureMove: (event: ReactPointerEvent<SVGSVGElement>, point: {x:number;y:number}, screenPoint:{x:number;y:number}) => void;
  onGestureEnd: (event: ReactPointerEvent<SVGSVGElement>, point: {x:number;y:number}) => void;
  onGestureCancel: (pointerId?: number) => void;
  onFlightEnd?: () => void;
};

export function BoardView({ board, state, actions, selectedStone, gesture, showCoordinates, replayMoved = new Set(), replayCaptured = new Set(), replayReturned = new Set(), flight, interactive, onGestureStart, onGestureMove, onGestureEnd, onGestureCancel, onFlightEnd }: Props) {
  const svgRef: RefObject<SVGSVGElement> = React.useRef<SVGSVGElement>(null);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const moveActions = actions.filter((action): action is MoveAction => action.kind === 'move');
  const movingStone = gesture?.dragging ? gesture.stoneId : null;
  const currentPoint = gesture?.current;
  const dragCandidate = gesture?.dragging && currentPoint
    ? nearestLegalDestination(currentPoint, moveActions.filter(action => action.stoneId === gesture.stoneId).map(action => action.to), board.coordinates)
    : null;
  const selectedDestinations = state.pendingReturns
    ? actions.filter((action): action is Extract<Action, {kind:'return'}> => action.kind === 'return').map(action => action.to)
    : moveActions.filter(action => action.stoneId === (movingStone ?? selectedStone)).map(action => action.to);
  const sourceHighlights = new Set(moveActions.filter(action => action.from !== null).map(action => action.from!));
  const destinationHighlights = new Set(selectedDestinations);
  if (dragCandidate) destinationHighlights.add(dragCandidate);
  const targetSet = new Set([...board.victoryPositions.white, ...board.victoryPositions.black]);
  const track = gesture?.dragging && dragCandidate && gesture.origin ? trackSegment(board, gesture.origin, dragCandidate) : null;
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive || event.button !== 0) return;
    event.preventDefault();
    const point = screenPoint(event);
    if (!point) return;
    const vertex = nearestLegalDestination(point, board.vertices, board.coordinates);
    if (!vertex) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer capture may be unavailable in embedded browsers */ }
    onGestureStart(event, vertex, point, {x:event.clientX,y:event.clientY});
  };
  const screenPoint = (event: ReactPointerEvent<SVGSVGElement>) => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return null;
    try { return transformPoint({ x: event.clientX, y: event.clientY }, matrix.inverse()); }
    catch { return null; }
  };
  const handleMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    const point = screenPoint(event);
    if (point) onGestureMove(event, point, {x:event.clientX,y:event.clientY});
  };
  const handleEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault();
    const point = screenPoint(event);
    if (point) onGestureEnd(event, point);
  };
  const coordinates = board.vertices.map(vertex => board.coordinates[vertex]);
  const labelOffsets = (vertex: string, x: number): [number, number] => {
    const center = (Math.min(...coordinates.map(point=>point[0])) + Math.max(...coordinates.map(point=>point[0]))) / 2;
    return [x < center ? -25 : x > center ? 25 : 0, vertex.endsWith('1') || vertex.endsWith('7') ? 29 : -13];
  };

  return <svg ref={svgRef} className={`board-svg board-${board.id.toLowerCase()}`} viewBox={boardViewBox(board).join(' ')} preserveAspectRatio="xMidYMid meet" role="group" aria-label={`${board.name} board`} onPointerDown={pointerDown} onPointerMove={handleMove} onPointerUp={handleEnd} onPointerCancel={event=>onGestureCancel(event.pointerId)} onLostPointerCapture={event=>onGestureCancel(event.pointerId)}>
    {board.tracks.map((line,index)=><polyline key={`track-${index}`} className="board-track" points={line.map(vertex=>board.coordinates[vertex].join(',')).join(' ')}/>)}
    {track&&<polyline className="track-preview" points={track.map(vertex=>board.coordinates[vertex].join(',')).join(' ')}/>}
    {board.vertices.map(vertex=>{
      const piece=Object.values(state.pieces).find(item=>item.position===vertex);
      const isSelected=piece?.id===selectedStone||piece?.id===movingStone;
      const isHidden=(piece?.id===movingStone&&gesture?.dragging)||(piece?.id===flight?.stoneId);
      const [x,y]=board.coordinates[vertex];const [dx,dy]=labelOffsets(vertex,x);
      return <g key={vertex} data-vertex={vertex} className={`board-vertex ${sourceHighlights.has(vertex)?'can-move-from':''} ${destinationHighlights.has(vertex)?'can-move-to':''} ${targetSet.has(vertex)?'victory-target':''} ${isSelected?'is-selected':''} ${replayMoved.has(vertex)?'replay-moved':''} ${replayCaptured.has(vertex)?'replay-captured':''} ${replayReturned.has(vertex)?'replay-returned':''}`}>
        <circle className="touch-hit" cx={x} cy={y} r="52"/>
        <circle className="vertex-halo" cx={x} cy={y} r={destinationHighlights.has(vertex)?31:25}/>
        <circle className={`stone ${piece?.color??''} ${piece?.id===state.lastMovedStone?'stone-last':''} ${isHidden?'stone-hidden':''}`} cx={x} cy={y} r={piece?19:8}/>
        {destinationHighlights.has(vertex)&&<circle className="destination-dot" cx={x} cy={y} r="4"/>}
        {showCoordinates&&<text className="coordinate-label" x={x+dx} y={y+dy}>{vertexToTDAN(vertex,board.id)}</text>}
      </g>;
    })}
    {flight&&(()=>{const from=board.coordinates[flight.from],to=board.coordinates[flight.to];return <g className={`flight-piece ${flight.color}`} onAnimationEnd={onFlightEnd}><circle cx="0" cy="0" r="19"/><animateTransform attributeName="transform" type="translate" from={`${from[0]} ${from[1]}`} to={`${to[0]} ${to[1]}`} dur={reducedMotion?'1ms':'180ms'} fill="freeze"/></g>;})()}
    {gesture?.dragging&&currentPoint&&gesture.stoneId&&<g className={`drag-preview ${state.pieces[gesture.stoneId as keyof typeof state.pieces]?.color??''}`} transform={`translate(${currentPoint.x} ${currentPoint.y-22})`}><circle r="21"/><circle className="drag-preview-core" r="17"/></g>}
  </svg>;
}
