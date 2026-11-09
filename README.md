# Claustra

An offline-first, touch-friendly implementation of Claustra. Two-Diamond (`TD19`) and Boxed Hexagram (`BH24`) share the same TypeScript rules engine, AI, notation and interface; Android is a Capacitor shell around the same built web app.

## Run locally

```bash
npm install
npm run dev
```

The development server is Vite. Gameplay state is saved in browser local storage and can be restored after a reload. The game has human-vs-computer and local human-vs-human modes, with Easy, Medium and Hard computer difficulty.

The complete move history remains available after a win or draw. Use the Replay controls to step through the recorded board states or play them automatically. Replay restores snapshots captured during play; it does not parse or re-run the move notation. The Board inspector shows the exact state at the selected replay position. TDAN and JSON export buttons are available below the history.

## Touch-first interface

The shared React interface is optimized for phone play: drag a stone to a highlighted legal destination, or tap a stone and then its destination. Gameplay stays within the visible screen, uses Android/browser safe-area insets, and rearranges the compact controls for landscape. Home, setup, history/replay, rules, settings and the board inspector are available from focused sheets rather than permanent side panels. Both board definitions use the same SVG renderer and engine-supplied legal actions.

Example responsive gameplay captures (Boxed Hexagram):

- [Portrait gameplay](screenshots/gameplay-portrait.png)
- [Landscape gameplay](screenshots/gameplay-landscape.png)

## Verify and build

```bash
npm run test       # Vitest rules-engine tests
npm run build      # production files in dist/
```

The pure engine is in `src/engine/engine.ts`; board data lives in `src/engine/boards.ts`. TD19 retains its original 19 vertices and 13 tracks. BH24 vertices and all 13 straight tracks load directly from `boxed_hexagram_graph.json`. Movement, per-player stone restrictions, captures, defender-selected returns, reserves, passes, draws and victory detection all use the selected board definition. `src/ai/ai.ts` scores target distance over the selected board graph and consumes only engine state transitions. The browser launches the same AI through `src/ai/worker.ts`, keeping search off the UI thread.

## Android

Install Android Studio, an Android SDK/platform and build tools, and ensure `JAVA_HOME` and the Android SDK are configured. Then:

```bash
npm run android:sync
npm run android:build
npm run android:bundle
```

These commands build the web app, synchronize it into Capacitor, then build a debug Android package at `android/app/build/outputs/apk/debug/app-debug.apk` or a signed release AAB at `android/app/build/outputs/bundle/release/app-release.aab`. Capacitor may create the `android/` project on first sync. Release signing reads the ignored local `android/signing.properties`; do not commit private keystores or passwords. The app requests no custom permissions and is designed for portrait operation.

The dedicated Claustra upload keystore is stored outside the repository at `/home/rick/.android/keystores/two-diamond-upload.jks`. Its local signing configuration is stored with restrictive permissions in `/home/rick/.android/keystores/two-diamond-signing.properties` and is mirrored to the ignored project file `android/signing.properties`. Back up both home-directory files securely; neither should be committed or shared publicly.

## Architecture and limitations

- `src/engine` has no browser or platform APIs and is deterministic for a given state/action sequence.
- User-facing coordinates and records use TDAN from `src/notation/tdan.ts`: for example, `B5-B4xD4 [D4@A4]`, `--`, `1-0`, `0-1`, and `x-x`. New exports are ASCII-only; legacy saved states retain their internal keys and old `½-½` imports are normalized to `x-x`.
- Custodial capture is long-range along an authoritative track: empty vertices may separate the moved attacker, defender and far attacker, but another occupied vertex interrupts the formation. Capture detection is anchored to the latest voluntary move, so pre-existing formations do not resolve by themselves.
- Victory uses only the three non-central vertices of the opponent's diamond: White targets `LL`, `LR`, `B`; Black targets `T`, `UL`, `UR`. The shared `C` remains playable but never counts toward victory.
- `src/ai` has a seeded easy choice, heuristic medium choice, and bounded depth-3 alpha-beta hard search with a transposition table. The hard search treats defender return choices as actual turns in the transition tree; it is intentionally bounded for mobile responsiveness.
- `src/main.tsx` is the shared responsive interface used by web and Capacitor Android.
- `src/ui/BoardView.tsx` renders both board definitions and handles pointer/touch gestures; `src/ui/board-geometry.ts` contains testable gesture, hit-testing and viewport geometry helpers.
- Game snapshots and replay frames store the board ID and definition version. Exports include `[Board "TD19"]` or `[Board "BH24"]`; legacy records without a board header import as TD19.
- `npm run simulate:bh24` runs eight seeded computer-vs-computer diagnostics. In the recorded check, White won game 1 after 124 plies and Black won game 4 after 217 plies; the remaining six hit the simulation's 600-ply diagnostic cutoff and are reported unresolved. That cutoff is only for simulation reporting and does not constrain gameplay.
- Save/restore uses local storage in the UI shell; normal gameplay needs no server or network.
- Google Fonts are a visual enhancement only; gameplay remains bundled/offline-capable once built.
