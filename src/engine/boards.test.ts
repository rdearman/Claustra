import { describe, expect, it } from 'vitest';
import { BOARD_DEFINITIONS } from './boards';
import { applyAction, availableActions, checkVictory, createInitialState, legalActions, occupied, GameState } from './engine';
import { chooseAction, firstLegalAction } from '../ai/ai';

const bh=BOARD_DEFINITIONS.BH24;
const arrangeBH=(placement:Record<string,string>)=>{const base=createInitialState('BH24');const pieces=Object.fromEntries(Object.entries(base.pieces).map(([id,p])=>[id,{...p,position:placement[id]??null}]));return {...base,pieces,turn:'white'} as GameState;};
describe('Boxed Hexagram board definition and rules',()=>{
  it('matches the authoritative 24 vertices, 13 tracks, starts, protection and goals',()=>{
    expect(bh.vertices).toHaveLength(24);expect(bh.tracks).toHaveLength(13);
    expect(bh.vertices).toEqual(['B7','E7','H7','A5','B5','D5','F5','H5','I5','A4','B4','C4','G4','H4','I4','A3','B3','D3','F3','H3','I3','B1','E1','H1']);
    expect(bh.tracks).toEqual([
      ['B7','E7','H7'],['B1','E1','H1'],['B7','B5','B4','B3','B1'],['H7','H5','H4','H3','H1'],['A5','A4','A3'],['I5','I4','I3'],['A4','B4','C4','G4','H4','I4'],['B5','D5','F5','H5'],['B3','D3','F3','H3'],['E7','D5','C4','B3'],['E7','F5','G4','H3'],['B5','C4','D3','E1'],['H5','G4','F3','E1']
    ]);
    expect(bh.startingPositions).toEqual({white:['B1','H1','A3','I3'],black:['B7','H7','A5','I5']});
    expect(bh.protectedPositions).toEqual({white:['A3','I3'],black:['A5','I5']});
    expect(bh.victoryPositions).toEqual({white:['D5','E7','F5'],black:['D3','E1','F3']});
  });
  it('starts BH24 correctly and protects only opponent external posts',()=>{
    let s=createInitialState('BH24');expect(s.boardId).toBe('BH24');expect(Object.values(s.pieces).filter(p=>p.color==='white').map(p=>p.position)).toEqual(['B1','H1','A3','I3']);
    expect(legalActions(s).some(a=>a.kind==='move'&&a.to==='A5')).toBe(false);
    expect(legalActions(s).some(a=>a.kind==='move'&&a.to==='A4')).toBe(true);
  });
  it('slides along continuous tracks without turning at crossings',()=>{
    let s=createInitialState('BH24');
    const b1=s.pieces['white-1'];
    expect(legalActions(s).flatMap(a=>a.kind==='move'&&a.stoneId===b1.id?[a.to]:[])).toContain('E1');
    expect(legalActions(s).some(a=>a.kind==='move'&&a.stoneId==='white-1'&&a.to==='D3')).toBe(false);
  });
  it('uses BH24 victory targets and never substitutes starts or crossings',()=>{
    let s=createInitialState('BH24');
    const pieces={...s.pieces,'white-1':{...s.pieces['white-1'],position:'D5'},'white-2':{...s.pieces['white-2'],position:'E7'},'white-3':{...s.pieces['white-3'],position:'F5'}};
    expect(checkVictory({...s,pieces})).toBe('white');
    expect(checkVictory({...s,pieces:{...pieces,'white-3':{...pieces['white-3'],position:'C4'}}})).toBe(null);
  });
  it('resolves long-range captures and returns on the BH24 straight tracks',()=>{
    let s=arrangeBH({'white-1':'B5','white-2':'H5','black-1':'F5'});
    s=applyAction(s,{kind:'move',stoneId:'white-1',from:'B5',to:'D5'});
    expect(s.pendingReturns?.color).toBe('black');expect(s.pieces['black-1'].position).toBe(null);
    s=applyAction(s,{kind:'return',stoneId:'black-1',to:'A5'});
    expect(s.pieces['black-1'].position).toBe('A5');expect(s.boardId).toBe('BH24');
  });
  it('preserves each player movement restriction independently on BH24',()=>{
    let s=createInitialState('BH24');s=applyAction(s,{kind:'move',stoneId:'white-1',from:'B1',to:'E1'});s={...s,turn:'black'};s=applyAction(s,{kind:'move',stoneId:'black-1',from:'B7',to:'E7'});s={...s,turn:'white'};
    expect(legalActions(s).some(a=>a.kind==='move'&&a.stoneId==='white-1')).toBe(false);s={...s,turn:'black'};expect(legalActions(s).some(a=>a.kind==='move'&&a.stoneId==='black-1')).toBe(false);
  });
  it('uses the selected board for AI move generation and keeps states isolated',()=>{
    const td=createInitialState(),bhState=createInitialState('BH24');
    const tdAction=chooseAction(td,'easy',5),bhAction=chooseAction(bhState,'easy',5);
    expect(tdAction.kind).toBe('move');expect(bhAction.kind).toBe('move');
    const moved=applyAction(bhState,bhAction);
    expect(moved.boardId).toBe('BH24');expect(td.boardId).toBe('TD19');expect(Object.values(moved.pieces).filter(p=>p.position)).toHaveLength(8);
  });
  it('provides a fast legal recovery action for both boards when the AI worker fails',()=>{
    for(const boardId of ['TD19','BH24']){
      const state=createInitialState(boardId);
      const action=firstLegalAction(state);
      expect(availableActions(state)).toContainEqual(action);
      expect(()=>applyAction(state,action)).not.toThrow();
    }
  });
});
