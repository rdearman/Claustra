import { describe, expect, it } from 'vitest';
import { applyAction, createInitialState } from './engine';
import { replaySnapshots } from './replay';

describe('recorded replay', () => {
  it('restores stored snapshots without recalculating moves', () => {
    let state = createInitialState();
    state = applyAction(state, { kind: 'move', stoneId: 'white-1', from: 'NW', to: 'T' });

    const recorded = replaySnapshots(state);
    expect(recorded).toHaveLength(2);
    expect(recorded[0].pieces['white-1'].position).toBe('NW');
    expect(recorded[1].pieces['white-1'].position).toBe('T');
    expect(recorded[1].lastMovedStone).toBe('white-1');
    expect(recorded[1].turn).toBe('black');

    // The replay result is detached from the live state and contains no timeline
    // to accidentally recurse or be rebuilt from TDAN notation.
    expect('timeline' in recorded[1]).toBe(false);
    state.pieces['white-1'].position = 'NE';
    expect(recorded[1].pieces['white-1'].position).toBe('T');
  });

  it('records capture and defender-return actions as separate exact states', () => {
    let state = createInitialState();
    state = {
      ...state,
      pieces: {
        ...state.pieces,
        'white-1': { ...state.pieces['white-1'], position: 'UL' },
        'white-2': { ...state.pieces['white-2'], position: 'LL' },
        'black-1': { ...state.pieces['black-1'], position: 'LM' },
      },
    };
    state = applyAction(state, { kind: 'move', stoneId: 'white-1', from: 'UL', to: 'NW' });
    state = applyAction(state, { kind: 'return', stoneId: 'black-1', to: 'SW' });

    const recorded = replaySnapshots(state);
    expect(recorded).toHaveLength(3);
    expect(recorded[1].pieces['black-1'].position).toBe(null);
    expect(recorded[1].pendingReturns?.stoneIds).toEqual(['black-1']);
    expect(recorded[2].pieces['black-1'].position).toBe('SW');
    expect(recorded[2].pendingReturns).toBe(null);
  });
  it('retains the selected board in saved replay frames',()=>{
    let state=createInitialState('BH24');state=applyAction(state,{kind:'move',stoneId:'white-1',from:'B1',to:'E1'});
    const frames=replaySnapshots(JSON.parse(JSON.stringify(state)));
    expect(frames.every(frame=>frame.boardId==='BH24'&&frame.boardDefinitionVersion===1)).toBe(true);
    expect(frames[0].pieces['white-1'].position).toBe('B1');expect(frames[1].pieces['white-1'].position).toBe('E1');
  });
});
