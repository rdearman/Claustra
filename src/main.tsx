import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyAction, availableActions, createInitialState, GameSnapshot, GameState, legalActions, Vertex } from './engine/engine';
import { BOARD_DEFINITIONS, getBoard } from './engine/boards';
import { replaySnapshots } from './engine/replay';
import { firstLegalAction, Difficulty } from './ai/ai';
import { formatGameHistory, formatGameRecord, vertexToTDAN } from './notation/tdan';
import './styles.css';

type Mode = 'computer' | 'local';
type SaveShape = Partial<GameState> & { pieces?: GameState['pieces'] };

function normalizeSnapshot(input: Partial<GameSnapshot>, forcedBoardId?: string): GameSnapshot {
  const boardId = getBoard(forcedBoardId ?? input.boardId).id;
  const valid = new Set(getBoard(boardId).vertices);
  const pieces = Object.fromEntries(Object.entries(input.pieces ?? {}).map(([id,piece]) => [id,{...piece,position:typeof piece.position==='string'&&valid.has(piece.position)?piece.position:null}])) as GameState['pieces'];
  const lastMovedStone = input.lastMovedStone && pieces[input.lastMovedStone] ? input.lastMovedStone : null;
  const tracked = input.lastVoluntaryMovedStone ?? {white:null,black:null};
  const lastVoluntaryMovedStone = {
    white: tracked.white && pieces[tracked.white] ? tracked.white : lastMovedStone && pieces[lastMovedStone]?.color === 'white' ? lastMovedStone : null,
    black: tracked.black && pieces[tracked.black] ? tracked.black : lastMovedStone && pieces[lastMovedStone]?.color === 'black' ? lastMovedStone : null,
  };
  return { ...input, boardId, boardDefinitionVersion: input.boardDefinitionVersion ?? getBoard(boardId).definitionVersion,
    pieces, turn: input.turn ?? 'white', lastMovedStone, lastVoluntaryMovedStone,
    consecutivePasses: input.consecutivePasses ?? 0, outcome: input.outcome ?? null,
    pendingReturns: input.pendingReturns ?? null, history: input.history ?? [] } as GameSnapshot;
}

function loadSavedState(): GameState {
  try {
    const raw = localStorage.getItem('two-diamond-save');
    if (!raw) return createInitialState();
    const saved = JSON.parse(raw) as SaveShape;
    if (!saved.pieces || !saved.turn || !Array.isArray(saved.history)) return createInitialState();
    const boardId = getBoard(saved.boardId).id;
    const current = normalizeSnapshot(saved, boardId);
    const timeline = Array.isArray(saved.timeline) && saved.timeline.length
      ? saved.timeline.map(frame => normalizeSnapshot(frame, frame.boardId ?? boardId))
      : [current];
    return {...current, timeline};
  } catch { return createInitialState(); }
}

function App() {
  const [state,setState] = useState<GameState>(loadSavedState);
  const [selectedBoard,setSelectedBoard] = useState(()=>{
    const stored=localStorage.getItem('claustra-selected-board');
    return stored && BOARD_DEFINITIONS[stored] ? stored : state.boardId;
  });
  const [human,setHuman] = useState<'white'|'black'>('white');
  const [mode,setMode] = useState<Mode>('computer');
  const [difficulty,setDifficulty] = useState<Difficulty>('medium');
  const [selected,setSelected] = useState<string|null>(null);
  const [thinking,setThinking] = useState(false);
  const [replayIndex,setReplayIndex] = useState<number|null>(null);
  const [autoplay,setAutoplay] = useState(false);

  const replayStates = useMemo(()=>replaySnapshots(state),[state]);
  const replaying = replayIndex !== null;
  const viewState:GameSnapshot = replaying ? (replayStates[replayIndex!] ?? replayStates[replayStates.length-1]) : state;
  const board = getBoard(viewState.boardId);
  useEffect(()=>{localStorage.setItem('two-diamond-save',JSON.stringify(state));},[state]);
  useEffect(()=>{localStorage.setItem('claustra-selected-board',selectedBoard);},[selectedBoard]);

  const computerTurn = !replaying && mode==='computer' && state.turn!==human && !state.outcome;
  useEffect(()=>{
    if(!computerTurn)return;
    setThinking(true);
    const fallbackAction=firstLegalAction(state);
    let worker:Worker;
    try { worker=new Worker(new URL('./ai/worker.ts',import.meta.url),{type:'module'}); }
    catch {
      setState(current=>current===state?applyAction(current,fallbackAction):current);
      setThinking(false);
      return;
    }
    let finished=false;
    const fallback=()=>{
      if(finished)return;
      finished=true;window.clearTimeout(timeout);worker.terminate();
      setState(current=>current===state?applyAction(current,fallbackAction):current);
      setThinking(false);
    };
    const timeout=window.setTimeout(fallback,8000);
    worker.onmessage=e=>{
      if(finished)return;
      try {
        const next=applyAction(state,e.data);
        finished=true;window.clearTimeout(timeout);worker.terminate();
        setState(current=>current===state?next:current);setThinking(false);
      } catch { fallback(); }
    };
    worker.onerror=fallback;
    try { worker.postMessage({state,difficulty,seed:state.history.length}); }
    catch { fallback(); }
    return()=>{finished=true;window.clearTimeout(timeout);worker.terminate();setThinking(false);};
  },[computerTurn,state,difficulty]);
  useEffect(()=>{if(!autoplay)return;const timer=window.setInterval(()=>setReplayIndex(i=>{const next=(i??0)+1;if(next>=replayStates.length-1){setAutoplay(false);return replayStates.length-1;}return next;}),900);return()=>window.clearInterval(timer);},[autoplay,replayStates.length]);

  const actions=useMemo(()=>viewState.pendingReturns?availableActions(viewState):legalActions(viewState),[viewState]);
  const destinations=new Set(actions.filter(a=>a.kind==='move'&&(!selected||a.stoneId===selected)).map(a=>(a as {to:Vertex}).to));
  const canInteract=!replaying&&!thinking&&!state.outcome&&(mode==='local'||state.turn===human);
  const lastPosition=viewState.lastMovedStone?viewState.pieces[viewState.lastMovedStone]?.position:null;
  const previousViewState=replayIndex!==null?replayStates[Math.max(0,replayIndex-1)]:replayStates[replayStates.length-2];
  const replayChanges=useMemo(()=>{
    const moved=new Set<Vertex>(),captured=new Set<Vertex>(),returned=new Set<Vertex>();
    if(previousViewState) for(const id of Object.keys(viewState.pieces) as Array<keyof typeof viewState.pieces>){
      const before=previousViewState.pieces[id]?.position,after=viewState.pieces[id]?.position;
      if(before===after)continue;
      if(before)moved.add(before);
      if(after){moved.add(after);if(!before)returned.add(after);}else if(before)captured.add(before);
    }
    return {moved,captured,returned};
  },[previousViewState,viewState]);

  function clickVertex(vertex:Vertex){
    if(!canInteract)return;
    if(state.pendingReturns){const action=actions.find(a=>a.kind==='return'&&a.to===vertex);if(action)setState(applyAction(state,action));return;}
    const piece=Object.values(state.pieces).find(p=>p.position===vertex);
    const restricted=state.lastVoluntaryMovedStone?.[state.turn]??(state.lastMovedStone&&state.pieces[state.lastMovedStone]?.color===state.turn?state.lastMovedStone:null);
    if(selected){const action=actions.find(a=>a.kind==='move'&&a.stoneId===selected&&a.to===vertex);if(action){setState(applyAction(state,action));setSelected(null);return;}}
    if(piece?.color===state.turn&&piece.id!==restricted&&actions.some(a=>a.kind==='move'&&a.stoneId===piece.id))setSelected(piece.id);else setSelected(null);
  }
  function exportFile(name:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url);}
  function startSelectedBoard(){
    if(state.history.length&&!state.outcome&&!window.confirm('Start a new game? The current unfinished game will remain saved only until the new game is saved. Export it first to keep a copy.'))return;
    setState(createInitialState(selectedBoard));setSelected(null);setReplayIndex(null);setAutoplay(false);
  }
  const targetSet=new Set<Vertex>([...board.victoryPositions.white,...board.victoryPositions.black]);
  const selectedMoves=actions.filter(a=>a.kind==='move'&&(!selected||a.stoneId===selected));
  const labelOffset=(vertex:string,x:number):[number,number]=>{
    const center=board.viewBox[0]+board.viewBox[2]/2;
    return [x<center?-27:vertex==='C'||vertex==='E7'||vertex==='E1'?0:12,vertex==='B'||vertex==='E1'||vertex==='B1'||vertex==='H1'?30:-12];
  };
  const svgRadius=board.id==='TD19'?18:17;
  const whiteName=mode==='local'?'Human':human==='white'?'Human':'Computer';
  const blackName=mode==='local'?'Human':human==='black'?'Human':'Computer';
  const record=formatGameRecord(state.history,state.boardId,whiteName,blackName,state.outcome);

  return <main className="shell">
    <header><div><p className="eyebrow">CLAUSTRA / ABSTRACT STRATEGY</p><h1>Claustra</h1><p className="subtitle">One game. Two boards. Every move matters.</p></div><button className="new" onClick={startSelectedBoard}>New game</button></header>
    <section className="layout"><div className={`board-card ${viewState.history[viewState.history.length-1]?.includes('captures')?'capture-event':''}`}>
      <div className="status"><div><span className="dot" data-color={viewState.turn}/><strong>{viewState.outcome?(viewState.outcome==='draw'?'Draw game (x-x)':`${viewState.outcome} wins (${viewState.outcome==='white'?'1-0':'0-1'})`):viewState.pendingReturns?`${viewState.turn} chooses a return`:`${viewState.turn} to move`}</strong><small>{replaying?`Replay ${replayIndex!} of ${replayStates.length-1}`:thinking?'Computer is thinking...':viewState.pendingReturns?'Choose a vacant home for the captured stone.':lastPosition?`Last moved: ${vertexToTDAN(lastPosition,board.id)}`:'White opens the game.'}</small></div><div className="pills"><span>White {Object.values(viewState.pieces).filter(p=>p.color==='white'&&p.position===null).length} reserve</span><span>Black {Object.values(viewState.pieces).filter(p=>p.color==='black'&&p.position===null).length} reserve</span></div></div>
      <svg className={`board board-${board.id.toLowerCase()}`} viewBox={board.viewBox.join(' ')} role="img" aria-label={`${board.name} game board`}>
        {board.tracks.map((track,i)=><polyline key={i} points={track.map(v=>board.coordinates[v].join(',')).join(' ')} />)}
        {board.vertices.map(vertex=>{
          const piece=Object.values(viewState.pieces).find(p=>p.position===vertex),isDest=destinations.has(vertex),isLast=piece?.id===viewState.lastMovedStone;
          const [x,y]=board.coordinates[vertex], [dx,dy]=labelOffset(vertex,x);
          return <g key={vertex} className={`vertex ${isDest?'destination':''} ${targetSet.has(vertex)?'victory-target':''} ${selected===piece?.id?'selected':''} ${replayChanges.moved.has(vertex)?'replay-moved':''} ${replayChanges.captured.has(vertex)?'replay-captured':''} ${replayChanges.returned.has(vertex)?'replay-returned':''}`} onClick={()=>clickVertex(vertex)}>
            <circle className="halo" cx={x} cy={y} r={isDest?svgRadius+3:svgRadius-3}/><circle className={`node ${piece?.color||''} ${isLast?'last':''}`} cx={x} cy={y} r={piece?svgRadius:svgRadius*.4}/>{isDest&&<circle className="target" cx={x} cy={y} r="4"/>}
            <text x={x+dx} y={y+dy}>{vertexToTDAN(vertex,board.id)}</text>
          </g>;
        })}
        <text className="board-caption" x={board.viewBox[0]+20} y={board.viewBox[1]+24}>{board.name.toUpperCase()} · {board.vertices.length} vertices</text>
      </svg>
      {actions.some(a=>a.kind==='pass')&&!viewState.outcome&&<button className="pass" onClick={()=>{const pass=actions.find(a=>a.kind==='pass');if(pass&&canInteract)setState(applyAction(state,pass));}}>Pass (no legal move)</button>}
      {replayStates.length>1&&<div className="replay-bar"><strong>Replay</strong><button onClick={()=>{setAutoplay(false);setReplayIndex(0);}}>First</button><button onClick={()=>{setAutoplay(false);setReplayIndex(i=>Math.max(0,(i??replayStates.length-1)-1));}}>Previous</button><button onClick={()=>{setAutoplay(false);setReplayIndex(i=>Math.min(replayStates.length-1,(i??-1)+1));}}>Next</button><button onClick={()=>{setAutoplay(false);setReplayIndex(replayStates.length-1);}}>Last</button><button onClick={()=>setAutoplay(v=>!v)}>{autoplay?'Pause':'Play'}</button><button onClick={()=>{setAutoplay(false);setReplayIndex(null);}}>Exit</button><span>{replaying?`${replayIndex} / ${replayStates.length-1}`:'Live game'}</span></div>}
    </div><aside>
      <div className="panel"><h2>Match setup</h2><label>Board<select value={selectedBoard} onChange={e=>setSelectedBoard(e.target.value)}>{Object.values(BOARD_DEFINITIONS).map(b=><option value={b.id} key={b.id}>{b.name} — {b.vertices.length} vertices</option>)}</select><small className="board-selection-note">Current game: {getBoard(state.boardId).name}</small></label><label>Play as<select value={human} onChange={e=>setHuman(e.target.value as 'white'|'black')}><option value="white">White</option><option value="black">Black</option></select></label><label>Mode<select value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="computer">Against computer</option><option value="local">Local two-player</option></select></label>{mode==='computer'&&<label>Computer difficulty<select value={difficulty} onChange={e=>setDifficulty(e.target.value as Difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>}</div>
      <div className="panel"><h2>How to play</h2><p>Select a stone, then a highlighted destination. Stones slide along one straight track and stop before occupied vertices.</p><p>Long-range captures can cross empty intersections, but another occupied stone interrupts the line. TDAN move history is preserved in full.</p>{viewState.pendingReturns&&<p className="notice">Capture resolved. {viewState.turn} must choose a vacant original home.</p>}</div>
      <div className="panel history"><h2>Move history · {board.id}</h2>{viewState.history.length?<ol>{formatGameHistory(viewState.history,board.id).map((h,i)=><li key={i}>{h}</li>)}</ol>:<p>No moves yet.</p>}<div className="export-actions"><button onClick={()=>exportFile(`claustra-${state.boardId}.tdan`,record,'text/plain')}>Export TDAN</button><button onClick={()=>exportFile(`claustra-${state.boardId}.json`,JSON.stringify(state,null,2),'application/json')}>Export JSON</button></div></div>
      <div className="panel inspector"><h2>Board inspector</h2><p>Board: <code>{board.id} v{viewState.boardDefinitionVersion}</code></p><p>Turn: <code>{viewState.turn}</code></p><p>Last stones: <code>W:{viewState.lastVoluntaryMovedStone.white??'none'} B:{viewState.lastVoluntaryMovedStone.black??'none'}</code></p><p>Forced passes: <code>{viewState.consecutivePasses}</code></p><p>Pending returns: <code>{viewState.pendingReturns?.stoneIds.length??0}</code></p><p>Board: <code>{Object.values(viewState.pieces).filter(p=>p.position).map(p=>`${p.color[0].toUpperCase()}:${vertexToTDAN(p.position!,board.id)}`).join(' ')||'empty'}</code></p></div>
    </aside></section><footer><span>Offline-ready · {board.vertices.length} vertices · White moves first</span><span>{lastPosition?`Last move: ${vertexToTDAN(lastPosition,board.id)}`:'Universal Game Notation'} · {selectedMoves.length} legal destination{selectedMoves.length===1?'':'s'}</span></footer>
  </main>;
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren,{error:Error|null}>{state={error:null as Error|null};static getDerivedStateFromError(error:Error){return{error};}render(){return this.state.error?<main className="shell"><section className="panel startup-error"><h1>Claustra could not start</h1><p>{this.state.error.message}</p><button className="new" onClick={()=>window.location.reload()}>Reload</button></section></main>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<AppErrorBoundary><App/></AppErrorBoundary>);
