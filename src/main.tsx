import React, { PointerEvent as ReactPointerEvent, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { applyAction, availableActions, createInitialState, GameSnapshot, GameState, legalActions, Vertex } from './engine/engine';
import { BOARD_DEFINITIONS, getBoard } from './engine/boards';
import { replaySnapshots } from './engine/replay';
import { firstLegalAction, Difficulty } from './ai/ai';
import { formatGameHistory, formatGameRecord, vertexToTDAN } from './notation/tdan';
import { BoardView, BoardFlight } from './ui/BoardView';
import { beginBoardGesture, BoardGesture, moveBoardGesture, resolveDragAction, resolveTapAction } from './ui/board-geometry';
import './styles.css';

type Mode = 'computer' | 'local';
type Screen = 'home' | 'setup' | 'play';
type Overlay = 'menu' | 'history' | 'rules' | 'settings' | 'inspector' | null;
type SaveShape = Partial<GameState> & { pieces?: GameState['pieces'] };
type MoveAction = Extract<ReturnType<typeof legalActions>[number], {kind:'move'}>;
type BootData = { state: GameState | null; preferences: { board: string; mode: Mode; human: 'white'|'black'; difficulty: Difficulty; labels: boolean } };

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

function loadBootData(): BootData {
  let state: GameState | null = null;
  try {
    const raw = localStorage.getItem('two-diamond-save');
    if (raw) {
      const saved = JSON.parse(raw) as SaveShape;
      if (saved.pieces && saved.turn && Array.isArray(saved.history)) {
        const boardId = getBoard(saved.boardId).id;
        const current = normalizeSnapshot(saved, boardId);
        const timeline = Array.isArray(saved.timeline) && saved.timeline.length
          ? saved.timeline.map(frame => normalizeSnapshot(frame, frame.boardId ?? boardId))
          : [current];
        state = {...current, timeline};
      }
    }
  } catch { state = null; }
  const preferences = { board: 'TD19', mode: 'computer' as Mode, human: 'white' as 'white'|'black', difficulty: 'medium' as Difficulty, labels: true };
  try {
    const savedPreferences = JSON.parse(localStorage.getItem('claustra-preferences') ?? '{}');
    if (BOARD_DEFINITIONS[savedPreferences.board]) preferences.board = savedPreferences.board;
    else {
      const oldBoard = localStorage.getItem('claustra-selected-board');
      if (oldBoard && BOARD_DEFINITIONS[oldBoard]) preferences.board = oldBoard;
      else if (state) preferences.board = state.boardId;
    }
    if (savedPreferences.mode === 'computer' || savedPreferences.mode === 'local') preferences.mode = savedPreferences.mode;
    if (savedPreferences.human === 'white' || savedPreferences.human === 'black') preferences.human = savedPreferences.human;
    if (['easy','medium','hard'].includes(savedPreferences.difficulty)) preferences.difficulty = savedPreferences.difficulty;
    if (typeof savedPreferences.labels === 'boolean') preferences.labels = savedPreferences.labels;
  } catch { /* use defaults */ }
  if (state && !BOARD_DEFINITIONS[preferences.board]) preferences.board = state.boardId;
  return {state, preferences};
}

function App() {
  const [boot] = useState<BootData>(loadBootData);
  const [state,setState] = useState<GameState>(()=>boot.state ?? createInitialState(boot.preferences.board));
  const [selectedBoard,setSelectedBoard] = useState(boot.preferences.board);
  const [human,setHuman] = useState<'white'|'black'>(boot.preferences.human);
  const [mode,setMode] = useState<Mode>(boot.preferences.mode);
  const [difficulty,setDifficulty] = useState<Difficulty>(boot.preferences.difficulty);
  const [showCoordinates,setShowCoordinates] = useState(boot.preferences.labels);
  const [screen,setScreen] = useState<Screen>('home');
  const [overlay,setOverlay] = useState<Overlay>(null);
  const [selected,setSelected] = useState<string|null>(null);
  const [gesture,setGesture] = useState<BoardGesture|null>(null);
  const [flight,setFlight] = useState<BoardFlight|null>(null);
  const [thinking,setThinking] = useState(false);
  const [replayIndex,setReplayIndex] = useState<number|null>(null);
  const [autoplay,setAutoplay] = useState(false);
  const [hasSavedGame,setHasSavedGame] = useState(boot.state !== null);

  const replayStates = useMemo(()=>replaySnapshots(state),[state]);
  const replaying = replayIndex !== null;
  const viewState:GameSnapshot = replaying ? (replayStates[replayIndex!] ?? replayStates[replayStates.length-1]) : state;
  const board = getBoard(viewState.boardId);
  const actions = useMemo(()=>viewState.pendingReturns?availableActions(viewState):legalActions(viewState),[viewState]);
  const computerTurn = screen==='play' && !replaying && mode==='computer' && state.turn!==human && !state.outcome;

  useEffect(()=>{if(screen==='play'){localStorage.setItem('two-diamond-save',JSON.stringify(state));setHasSavedGame(true);}},[state,screen]);
  useEffect(()=>{localStorage.setItem('claustra-preferences',JSON.stringify({board:selectedBoard,mode,human,difficulty,labels:showCoordinates}));},[selectedBoard,mode,human,difficulty,showCoordinates]);
  useEffect(()=>{
    if(!computerTurn)return;
    setThinking(true);
    const fallbackAction=firstLegalAction(state);
    let worker:Worker;
    try { worker=new Worker(new URL('./ai/worker.ts',import.meta.url),{type:'module'}); }
    catch { setState(current=>current===state?applyAction(current,fallbackAction):current);setThinking(false);return; }
    let finished=false;
    const fallback=()=>{
      if(finished)return;
      finished=true;window.clearTimeout(timeout);worker.terminate();
      setState(current=>current===state?applyAction(current,fallbackAction):current);setThinking(false);
    };
    const timeout=window.setTimeout(fallback,8000);
    worker.onmessage=event=>{
      if(finished)return;
      try {
        const next=applyAction(state,event.data);
        finished=true;window.clearTimeout(timeout);worker.terminate();
        setState(current=>current===state?next:current);setThinking(false);
      } catch { fallback(); }
    };
    worker.onerror=fallback;
    try { worker.postMessage({state,difficulty,seed:state.history.length}); } catch { fallback(); }
    return()=>{finished=true;window.clearTimeout(timeout);worker.terminate();setThinking(false);};
  },[computerTurn,state,difficulty]);
  useEffect(()=>{
    if(!autoplay)return;
    const timer=window.setInterval(()=>setReplayIndex(index=>{const next=(index??0)+1;if(next>=replayStates.length-1){setAutoplay(false);return replayStates.length-1;}return next;}),850);
    return()=>window.clearInterval(timer);
  },[autoplay,replayStates.length]);
  useEffect(()=>{
    const cancel=()=>{setGesture(null);setSelected(null);};
    const visibility=()=>{if(document.hidden)cancel();};
    window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',visibility);
    return()=>{window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  useEffect(()=>{if(!flight)return;const timer=window.setTimeout(()=>setFlight(null),220);return()=>window.clearTimeout(timer);},[flight]);

  const previousViewState=replayIndex!==null?replayStates[Math.max(0,replayIndex-1)]:replayStates[Math.max(0,replayStates.length-2)];
  const replayChanges=useMemo(()=>{
    const moved=new Set<Vertex>(),captured=new Set<Vertex>(),returned=new Set<Vertex>();
    if(previousViewState)for(const id of Object.keys(viewState.pieces) as Array<keyof typeof viewState.pieces>){
      const before=previousViewState.pieces[id]?.position,after=viewState.pieces[id]?.position;
      if(before===after)continue;if(before)moved.add(before);if(after){moved.add(after);if(!before)returned.add(after);}else if(before)captured.add(before);
    }
    return {moved,captured,returned};
  },[previousViewState,viewState]);
  const selectedPiece=selected?state.pieces[selected as keyof typeof state.pieces]:null;
  const lastPosition=viewState.lastMovedStone?viewState.pieces[viewState.lastMovedStone]?.position:null;
  const statusText=replaying?`Reviewing move ${replayIndex} of ${replayStates.length-1}`:viewState.pendingReturns?`${viewState.turn} chooses a return position`:thinking?'Computer is thinking…':state.outcome?state.outcome==='draw'?'Draw game':'Game complete':`${viewState.turn} to move`;
  const instruction=thinking?'The computer is choosing its move.':viewState.pendingReturns?'Move or tap a highlighted open starting post.':selectedPiece?`Move ${vertexToTDAN(selectedPiece.position!,board.id)}: drag to a highlighted point, or tap it.`:'Drag a stone to move. You can also tap a stone, then tap its destination.';

  function beginGesture(event:ReactPointerEvent<SVGSVGElement>,vertex:Vertex,point:{x:number;y:number},screenPoint:{x:number;y:number}) {
    if(screen!=='play'||replaying||thinking||state.outcome)return;
    const piece=Object.values(state.pieces).find(item=>item.position===vertex);
    const legalPiece=piece?.color===state.turn&&actions.some(action=>action.kind==='move'&&action.stoneId===piece.id);
    const stoneId=legalPiece?piece!.id:null;
    const origin=stoneId?piece!.position:null;
    if(stoneId){setSelected(stoneId);if(navigator.vibrate)navigator.vibrate(8);}
    setGesture(beginBoardGesture(event.pointerId,vertex,point,stoneId,origin,screenPoint));
  }
  function updateGesture(event:ReactPointerEvent<SVGSVGElement>,point:{x:number;y:number},screenPoint:{x:number;y:number}) {
    setGesture(current=>current?moveBoardGesture(current,event.pointerId,point,10,screenPoint):null);
  }
  function tapVertex(vertex:Vertex) {
    if(replaying||thinking||state.outcome||screen!=='play'||(mode==='computer'&&state.turn!==human))return;
    if(state.pendingReturns){const action=resolveTapAction(vertex,null,actions);if(action)setState(applyAction(state,action));return;}
    const piece=Object.values(state.pieces).find(item=>item.position===vertex);
    if(selected){
      const move=resolveTapAction(vertex,selected,actions);
      if(move?.kind==='move'){executeMove(move);return;}
    }
    if(piece?.color===state.turn&&actions.some(item=>item.kind==='move'&&item.stoneId===piece.id))setSelected(piece.id);
    else setSelected(null);
  }
  function finishGesture(event:ReactPointerEvent<SVGSVGElement>,point:{x:number;y:number}) {
    const active=gesture;if(!active||active.pointerId!==event.pointerId)return;
    if(active.dragging&&active.stoneId){
      const move=resolveDragAction(active,point,actions,getBoard(state.boardId));
      if(move)executeMove(move);else setSelected(null);
    }else tapVertex(active.vertex);
    setGesture(null);
  }
  function executeMove(action:MoveAction) {
    if(action.from){setFlight({stoneId:action.stoneId,color:state.pieces[action.stoneId].color,from:action.from,to:action.to});if(navigator.vibrate)navigator.vibrate(12);}
    setState(applyAction(state,action));setSelected(null);
  }
  function cancelGesture(pointerId?:number) {
    if(pointerId!==undefined&&gesture&&pointerId!==gesture.pointerId)return;
    if(gesture?.dragging)setSelected(null);
    setGesture(null);
  }
  function exportFile(name:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function startNewGame(){
    if(hasSavedGame&&state.history.length&&!state.outcome&&!window.confirm('Replace the unfinished saved game? Cancel and choose Continue to keep playing it.'))return;
    setState(createInitialState(selectedBoard));setSelected(null);setGesture(null);setReplayIndex(null);setAutoplay(false);setOverlay(null);setScreen('play');
  }
  function restartGame(){if(!window.confirm('Restart this game from its initial position?'))return;setState(createInitialState(state.boardId));setReplayIndex(null);setSelected(null);setOverlay(null);}
  function continueGame(){setScreen('play');setReplayIndex(null);setOverlay(null);}
  function startReview(){setReplayIndex(replayStates.length-1);setAutoplay(false);setOverlay(null);setScreen('play');}
  const header=<header className="app-header"><button className="wordmark" aria-label="Claustra home" onClick={()=>{setScreen('home');setOverlay(null);setReplayIndex(null);}}><span className="brand-mark" aria-hidden="true">C</span><span>CLAUSTRA</span></button><div className="header-board"><span>{getBoard(screen==='play'?state.boardId:selectedBoard).name}</span><small>{getBoard(screen==='play'?state.boardId:selectedBoard).vertices.length} vertices</small></div>{screen==='play'&&<button className="icon-button" aria-label="Open game menu" onClick={()=>setOverlay('menu')}><span>☰</span></button>}</header>;

  if(screen==='home')return <main className="app-shell screen-home">{header}<section className="home-content"><p className="eyebrow">ABSTRACT STRATEGY · OFFLINE PLAY</p><h1>Claustra</h1><p className="home-tagline">Two boards. Four stones each. Find the line that wins.</p><div className="home-actions">{hasSavedGame&&<button className="primary-button" onClick={continueGame}>{state.outcome?'Review last game':'Continue game'}<small>{getBoard(state.boardId).name}{state.outcome?` · ${state.outcome==='draw'?'Draw':`${state.outcome} won`}`:` · ${state.history.length} moves`}</small></button>}<button className={hasSavedGame?'secondary-button':'primary-button'} onClick={()=>setScreen('setup')}>New game</button><button className="quiet-button" onClick={()=>setOverlay('rules')}>How to play</button><button className="quiet-button" onClick={()=>setOverlay('settings')}>Settings</button></div><p className="home-footnote">Play against the computer or pass the phone for local two-player games.</p></section>{overlay&&renderOverlay()}</main>;

  if(screen==='setup')return <main className="app-shell screen-setup">{header}<button className="back-link" onClick={()=>setScreen('home')}>← Back</button><section className="setup-content"><div className="setup-fields"><p className="eyebrow">MATCH SETUP</p><h1>New game</h1><label>Board<select value={selectedBoard} onChange={event=>setSelectedBoard(event.target.value)}>{Object.values(BOARD_DEFINITIONS).map(item=><option value={item.id} key={item.id}>{item.name} · {item.vertices.length} vertices</option>)}</select></label><label>Opponent<select value={mode} onChange={event=>setMode(event.target.value as Mode)}><option value="computer">Computer</option><option value="local">Local two-player</option></select></label>{mode==='computer'&&<><label>Your colour<select value={human} onChange={event=>setHuman(event.target.value as 'white'|'black')}><option value="white">White — move first</option><option value="black">Black</option></select></label><label>Difficulty<select value={difficulty} onChange={event=>setDifficulty(event.target.value as Difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label></>}<button className="primary-button setup-start" onClick={startNewGame}>Start game</button></div><div className="board-preview"><BoardView board={getBoard(selectedBoard)} state={createInitialState(selectedBoard)} actions={[]} selectedStone={null} gesture={null} showCoordinates={false} interactive={false} onGestureStart={()=>{}} onGestureMove={()=>{}} onGestureEnd={()=>{}} onGestureCancel={()=>{}}/><p>{getBoard(selectedBoard).name} · White moves first · three target points win</p></div></section>{overlay&&renderOverlay()}</main>;

  const previousStatus=state.history.length?state.history[state.history.length-1]:null;
  const selectedDestinations=state.pendingReturns?actions.filter(action=>action.kind==='return').length:actions.filter(action=>action.kind==='move'&&(!selected||action.stoneId===selected)).length;
  const record=formatGameRecord(state.history,state.boardId,mode==='local'?'Human':'Human',mode==='local'?'Human':'Computer',state.outcome);
  return <main className="app-shell screen-play">
    {header}
    <section className="play-status" aria-live="polite"><span className={`turn-token ${viewState.turn}`}></span><div><strong>{statusText}</strong><small>{instruction}</small></div><span className="capture-count">W {Object.values(viewState.pieces).filter(piece=>piece.color==='white'&&piece.position===null).length} · B {Object.values(viewState.pieces).filter(piece=>piece.color==='black'&&piece.position===null).length}</span></section>
    <div className="game-layout"><div className="board-stage"><BoardView board={board} state={viewState} actions={actions} selectedStone={selected} gesture={gesture} showCoordinates={showCoordinates} replayMoved={replayChanges.moved} replayCaptured={replayChanges.captured} replayReturned={replayChanges.returned} flight={flight} interactive={!replaying&&!thinking&&!state.outcome&&(mode==='local'||state.turn===human)} onGestureStart={beginGesture} onGestureMove={updateGesture} onGestureEnd={finishGesture} onGestureCancel={cancelGesture} onFlightEnd={()=>setFlight(null)}/></div>
      <aside className="landscape-rail"><div className="rail-turn"><span className={`turn-token ${viewState.turn}`}></span><div><strong>{statusText}</strong><small>{selectedDestinations} legal option{selectedDestinations===1?'':'s'}</small></div></div><p>{instruction}</p><button onClick={()=>setOverlay('history')}>Move history</button><button onClick={()=>setOverlay('menu')}>Game menu</button>{actions.some(action=>action.kind==='pass')&&!state.outcome&&<button className="pass-button" disabled={thinking} onClick={()=>{const pass=actions.find(action=>action.kind==='pass');if(pass)setState(applyAction(state,pass));}}>Pass turn</button>}</aside>
    </div>
    <section className="bottom-dock"><div className="context-line"><span>{replaying?'Review mode':selectedPiece?`Selected ${vertexToTDAN(selectedPiece.position!,board.id)}`:lastPosition?`Last move ended ${vertexToTDAN(lastPosition,board.id)}`:board.name}</span>{previousStatus&&<span className="last-notation">{previousStatus}</span>}</div><div className="toolbar">{replaying?<><button onClick={()=>{setAutoplay(false);setReplayIndex(0);}}>⏮<span>First</span></button><button onClick={()=>{setAutoplay(false);setReplayIndex(index=>Math.max(0,(index??0)-1));}}>‹<span>Prev</span></button><button onClick={()=>setAutoplay(value=>!value)}>{autoplay?'Ⅱ':'▶'}<span>{autoplay?'Pause':'Play'}</span></button><button onClick={()=>{setAutoplay(false);setReplayIndex(index=>Math.min(replayStates.length-1,(index??0)+1));}}>›<span>Next</span></button><button onClick={()=>{setAutoplay(false);setReplayIndex(null);}}>×<span>Exit</span></button></>:<><button onClick={()=>setOverlay('history')}>≡<span>History</span></button>{actions.some(action=>action.kind==='pass')&&!state.outcome&&<button className="toolbar-pass" disabled={thinking} onClick={()=>{const pass=actions.find(action=>action.kind==='pass');if(pass)setState(applyAction(state,pass));}}>↷<span>Pass</span></button>}<button onClick={()=>setOverlay('menu')}>•••<span>Menu</span></button></>}</div></section>
    {overlay&&renderOverlay()}
    {state.outcome&&!replaying&&<div className="modal-backdrop game-result-backdrop"><section className="game-result" role="dialog" aria-modal="true" aria-labelledby="result-title"><p className="eyebrow">GAME OVER · {getBoard(state.boardId).name}</p><h2 id="result-title">{state.outcome==='draw'?'Draw':`${state.outcome==='white'?'White':'Black'} wins`}</h2><p>{state.outcome==='draw'?'Neither player has an eligible move.':`Three vertices of the opposing triangle are occupied.`}</p><small>{state.history.filter(item=>!['1-0','0-1','x-x'].includes(item)).length} moves · {state.outcome==='white'?'1-0':state.outcome==='black'?'0-1':'x-x'}</small><div className="dialog-actions"><button className="primary-button" onClick={()=>{setState(createInitialState(state.boardId));setReplayIndex(null);setSelected(null);}}>Rematch</button><button className="secondary-button" onClick={startReview}>Review game</button><button className="quiet-button" onClick={()=>{setScreen('home');setReplayIndex(null);}}>Home</button></div></section></div>}
  </main>;

  function renderOverlay(){
    const close=()=>setOverlay(null);
    const modal=(title:string,content:React.ReactNode,kind='')=><div className="modal-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)close();}}><section className={`modal-sheet ${kind}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="sheet-handle"/><div className="sheet-header"><h2 id="dialog-title">{title}</h2><button className="icon-button close-button" aria-label="Close" onClick={close}>×</button></div>{content}</section></div>;
    if(overlay==='menu')return modal('Game menu',<div className="menu-list"><button onClick={close}>Resume game</button><button onClick={()=>{setOverlay(null);setScreen('setup');}}>New game</button><button onClick={restartGame}>Restart this game</button><button onClick={()=>setOverlay('history')}>Move history & export</button><button onClick={()=>setOverlay('rules')}>How to play</button><button onClick={()=>setOverlay('settings')}>Settings</button><button onClick={()=>setOverlay('inspector')}>Advanced game information</button></div>);
    if(overlay==='history')return modal('Move history',<><div className="history-scroll"><ol className="history-list">{formatGameHistory(state.history,state.boardId).map((line,index)=><li key={`${index}-${line}`} className={index===formatGameHistory(state.history,state.boardId).length-1?'history-current':''}>{line}</li>)}</ol>{!state.history.length&&<p className="empty-note">Moves will appear here as the game progresses.</p>}</div><div className="history-meta">{getBoard(state.boardId).name} · {state.history.filter(move=>!['1-0','0-1','x-x'].includes(move)).length} actions{state.outcome?` · result ${state.outcome==='draw'?'x-x':state.outcome==='white'?'1-0':'0-1'}`:''}</div><div className="dialog-actions"><button className="primary-button" disabled={replayStates.length<2} onClick={startReview}>Review board states</button><button className="secondary-button" onClick={()=>exportFile(`claustra-${state.boardId}.tdan`,record,'text/plain')}>Export TDAN</button><button className="secondary-button" onClick={()=>exportFile(`claustra-${state.boardId}.json`,JSON.stringify(state,null,2),'application/json')}>Export JSON</button></div></>, 'history-sheet');
    if(overlay==='rules')return modal('How to play',<div className="rules-copy"><p>Move one stone along a straight, connected track. It may slide over empty intersections but cannot pass an occupied one or turn a corner.</p><p>Two of your stones can capture an opponent's stone by bracketing it on the same straight track. Empty points may lie between stones. The defender returns captured stones to any vacant starting point.</p><p>You cannot move the same stone on two consecutive turns of yours. If no eligible move exists, pass. If neither player can move, the game is drawn.</p><p>Win by occupying all three marked vertices of the opposing triangle. The shared center is not a target.</p><button className="primary-button" onClick={close}>Got it</button></div>);
    if(overlay==='settings')return modal('Settings',<div className="settings-content"><label className="switch-row"><span>Show board coordinates<small>Display TDAN labels at intersections</small></span><input type="checkbox" checked={showCoordinates} onChange={event=>setShowCoordinates(event.target.checked)}/></label><p>Preferences are saved on this device. Gameplay is available offline.</p><button className="primary-button" onClick={close}>Done</button></div>);
    if(overlay==='inspector')return modal('Game information',<div className="inspector-content"><p>Board definition <code>{viewState.boardId} v{viewState.boardDefinitionVersion}</code></p><p>Turn <code>{viewState.turn}</code></p><p>Previous stones <code>W:{viewState.lastVoluntaryMovedStone.white??'none'} B:{viewState.lastVoluntaryMovedStone.black??'none'}</code></p><p>Consecutive passes <code>{viewState.consecutivePasses}</code></p><p>Pending return <code>{viewState.pendingReturns?.stoneIds.length??'none'}</code></p><p>Position <code>{Object.values(viewState.pieces).filter(piece=>piece.position).map(piece=>`${piece.color[0].toUpperCase()}:${vertexToTDAN(piece.position!,viewState.boardId)}`).join(' ')}</code></p></div>);
    return null;
  }
}

class AppErrorBoundary extends React.Component<React.PropsWithChildren,{error:Error|null}>{state={error:null as Error|null};static getDerivedStateFromError(error:Error){return{error};}render(){return this.state.error?<main className="app-shell startup-error"><h1>Claustra could not start</h1><p>{this.state.error.message}</p><button onClick={()=>window.location.reload()}>Reload</button></main>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<AppErrorBoundary><App/></AppErrorBoundary>);
