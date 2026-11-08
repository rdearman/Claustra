import { chooseAction } from './ai';
self.onmessage = (event: MessageEvent) => { const { state, difficulty, seed } = event.data; self.postMessage(chooseAction(state, difficulty, seed)); };
