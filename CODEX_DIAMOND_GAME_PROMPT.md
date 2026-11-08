# Codex task: Implement a two-player abstract strategy game for the web

## Two-Diamond Algebraic Notation (TDAN)

User-facing board labels and game records use ASCII TDAN coordinates. The internal graph IDs below remain the authoritative implementation keys, with this mapping: `NW=B5`, `T=C5`, `NE=D5`, `UL=B4`, `UR=D4`, `OLT=A4`, `OLM=A3`, `OLB=A2`, `LM=B3`, `C=C3`, `RM=D3`, `ORT=E4`, `ORM=E3`, `ORB=E2`, `LL=B2`, `LR=D2`, `SW=B1`, `B=C1`, `SE=D1`. Normal moves use `B5-B4`; captures append `xD4` (or comma-separated captured coordinates); returns use `[D4@A4]`; passes use `--`. Results are `1-0`, `0-1`, or `x-x`. New records are 7-bit ASCII; imported legacy `½-½` is normalized to `x-x`.

Build a complete, locally runnable, web-based implementation of the **Two-Diamond Strategy Game** described below. The human must be able to play **White** against a computer opponent playing **Black**. White moves first. Include an option to play as Black (computer White) and a human-v-human mode if straightforward, but prioritise a correct human-versus-computer game.

**Authoritative board illustration:** `diamond_board_final.png` (or the equivalent `diamond_board_final.svg`), supplied alongside this prompt. The graph description below is authoritative when implementing movement; do not approximate connectivity from pixel coordinates. The reference Python files from earlier experiments, if provided, are *non-authoritative* and contain legacy logic. Write a clean, testable rule engine.

## 1. Board

The board consists of a large square, an upper diamond, a lower diamond, a horizontal line through the centre, and two short vertical posts outside the square (one on either side). There are **19 playable vertices**. Pieces stand at vertices/intersections, not anywhere along an edge.

Vertex names:

- Outer square corners: `NW`, `NE`, `SW`, `SE`.
- Upper diamond: `T` (top point), `UL` (upper-left), `UR` (upper-right), `C` (shared centre).
- Lower diamond: `C` (shared centre), `LL` (lower-left), `LR` (lower-right), `B` (bottom point).
- Side midpoints on square: `LM`, `RM`.
- Left external post (top, middle, bottom): `OLT`, `OLM`, `OLB`.
- Right external post (top, middle, bottom): `ORT`, `ORM`, `ORB`.

**Straight-line tracks:** Each row is one continuous straight track. A stone can travel along any number of segments on ONE such track in a turn, if the path is clear. Turns at intersections are not allowed during a move.

```text
NW — T — NE
NW — UL — LM — LL — SW
NE — UR — RM — LR — SE
SW — B — SE
OLT — OLM — OLB
ORT — ORM — ORB
OLM — LM — C — RM — ORM
T — UL
T — UR
UL — C — LR
UR — C — LL
LL — B
LR — B
```

These tracks are also the definitive source for consecutive-node relationships used in capture detection. Draw the physical edges as straight segments between adjacent vertices; where tracks meet at named vertices, they connect. Do not create vertices at line crossings unless explicitly named above.

For layout, render a symmetric rectangle/square with `T` halfway along its top edge, `B` halfway along its bottom edge, `UL/UR` at the upper diamond's side vertices, `LL/LR` at the lower diamond's side vertices, and `C` at the exact middle. The two external posts connect horizontally to the centre through `OLM — LM — C — RM — ORM`. Render nodes and stones with SVG or HTML canvas, responsive to screen size.

## 2. Starting positions

- **White** begins with four identical white stones at `NW`, `NE`, `OLT`, `ORT` (the upper square corners and upper ends of both external posts).
- **Black** begins with four identical black stones at `SW`, `SE`, `OLB`, `ORB` (the lower square corners and lower ends of both external posts).
- **White always takes the first turn**, regardless of which side is human-controlled.
- There are four stones per player throughout the game. Captures displace stones rather than removing them permanently.
- Only the FOUR exterior endpoint positions are colour-restricted: `OLT` and `ORT` can be occupied only by White; `OLB` and `ORB` only by Black.
- **All vertices on or within the square, including the four square corner starting positions, are open to either colour.** `OLM` and `ORM` are shared too.
- A vacant restricted external endpoint may not be landed upon by the opposing colour.

## 3. Movement

- Players alternate turns. On a normal turn, move exactly one of your stones from its current vertex to a DIFFERENT, unoccupied vertex along one straight track.
- A stone may slide through any number of empty intermediate vertices on the same straight track in a single turn. It cannot pass through or land on an occupied vertex.
- It cannot change direction or join a different track during that move, even when crossing the shared centre.
- A colour-restricted vertex cannot be used as an opponent's destination.
- A player **may not voluntarily move the same physical stone on two consecutive turns of their own**. They must move a different one. Although stones are unmarked, the game UI can internally track the previous stone, or track the position of that stone consistently, and indicate its ineligibility to the player.
- Being captured and returned to a starting position does NOT count as a voluntary movement. A compulsory pass does NOT reset the last-stone restriction.
- If the current player has no legal move using an eligible stone, that player MUST pass. The opponent then takes their turn. A player may pass only when forced to do so.

## 4. Custodial capture and return

- Capturing is by **long-range sandwiching**: after a player voluntarily moves a stone, if the moved stone completes a straight arrangement of `attacker — defender — attacker` on one continuous track, the sandwiched enemy stone is captured. Empty intersections may occur between the three stones.
- Capture is triggered by the attacker's move, not merely by the continuing presence of an old formation. A player moving their own stone between two enemy stones does not self-capture.
- The attacking stones need not be immediately adjacent to the defender. For each side of the moved stone, scan to the first occupied vertex; a capture is valid when the opposing stone is bracketed by the moved stone and a friendly stone, with no additional occupied stone between them. A second opposing stone interrupts the formation.
- Multiple opposing stones may be captured by a single move if multiple sandwiches are completed.
- A captured stone is lifted from the board. The **captured player**, not the attacker, chooses any vacant position among their own FOUR original starting positions and returns the stone there, immediately and without spending a turn.
- White's return choices are `NW`, `NE`, `OLT`, `ORT`; Black's are `SW`, `SE`, `OLB`, `ORB`.
- A square-corner home may be occupied by the opposing colour; in that case it is unavailable as a return destination until vacated.
- If all four homes are occupied, place the captured stone in an off-board reserve. On a later turn, the owner may use their turn to redeploy one reserve stone to any unoccupied own starting position. This is the provisional agreed overflow rule. A reserve redeployment counts as that player's voluntary action for the consecutive-movement restriction. If there is no free home and no other eligible legal movement, the player passes. Preserve exactly four stones per colour across board and reserve.
- The defending player must select return locations whenever choices exist; the computer must evaluate these as defender choices, NOT attacker choices. Handle multiple captures and multiple returns correctly.

## 5. Victory, passing and draws

- **White wins** when White simultaneously occupies all THREE non-central vertices of the lower/Black diamond: `LL`, `LR`, and `B`.
- **Black wins** when Black simultaneously occupies all THREE non-central vertices of the upper/White diamond: `T`, `UL`, and `UR`.
- The shared centre `C` is a normal playable vertex for movement, blocking and custodial capture, but it never contributes directly to victory.
- Victory takes effect immediately when the winning configuration is reached, even if an opponent could otherwise respond or capture next turn.
- If one player cannot move legally, they pass; this is NOT an automatic loss or draw.
- If BOTH players have no eligible legal move and therefore would be forced to pass consecutively without any change of position, the game is a DRAW.
- Do not introduce a compulsory draw by a fixed move count, a threefold-repetition rule, or a swap/pie rule. Human players may voluntarily agree to a draw in an optional UI control. Simulations/AI can apply an internal search budget, but a budget exhaustion is NOT a game-rule draw.

## 6. Web game requirements

- Deliver a usable browser game, not a console-only game or a mocked-up board. Implement actual rules and legal-move validation in a separate deterministic game-engine module independent of UI.
- Make the diagram accurate and visually clear: white/black stones at the eight starting positions, unobstructed lines, intersections that can be clicked, and clear indication of whose turn it is. Scale to desktop and mobile.
- Human interaction: click/tap a stone to select it, highlight legal destinations, then click/tap a destination. Show which stone cannot move this turn because it was moved last turn. After a capture, prompt the defending human to select a vacant return home; for computer defenders the AI selects it.
- Support compulsory passing automatically and display the reason. Show captures, winning target vertices, win/draw status and move history; include New Game and Undo (for debugging and human-versus-computer play).
- Provide computer opponent difficulty settings (e.g. easy random-legal, medium heuristic, hard iterative-deepening minimax/alpha-beta with transposition table and a bounded think-time). The hard AI must search actual game transitions, including defender-selected returns, reserves, last-stone restrictions and forced passes. Avoid evaluating an illegal hypothetical move.
- Use deterministic seeded games for automated tests/reproducibility. Keep the implementation straightforward, responsive and maintainable. Choose a pragmatic front-end stack consistent with the existing repository; if none exists, prefer TypeScript with Vite and a lightweight UI framework (or plain TypeScript).
- Provide README with installation, local run instructions, rules and explanation of graph modelling; include a concise description of AI search and its limitations.

## 7. Tests / acceptance criteria

Implement automated tests demonstrating at least:

1. Exactly 19 vertices, with precisely the specified tracks and no phantom intersections.
2. Correct eight starting stone positions; White moves first.
3. White can occupy `SW/SE` and Black can occupy `NW/NE` when vacant; only the four appropriate external tips are restricted.
4. A stone can slide past multiple EMPTY intermediate nodes in a straight line, but cannot jump another stone or make a turn at an intersection.
5. Centre `C` is not reachable by White directly in the first move from the starting configuration.
6. A stone used on a player's preceding turn is unavailable for that player's next voluntary move, regardless of the opponent's intervening turn. Other stones may be used. A pass does not clear the restriction.
7. Long-range custodial capture occurs only when the moving player newly completes a collinear sandwich along an authoritative track. Empty intersections are allowed, intervening occupied stones block capture, and defensive moves into an existing sandwich do not self-capture.
8. Following capture, the defending player can choose among ALL vacant own starting positions, with no fixed stone/home identity. Captured stones cannot be permanently eliminated.
9. Multiple captures and occupied-home/reserve behaviour are correct; there is never more or fewer than four stones per side when reserves are included.
10. Captures and return placements do not incorrectly consume the defending player's normal turn.
11. Forced passes when no eligible legal move; two consecutive forced passes without a state change produce a draw.
12. Correct three-vertex opponent-diamond victory excluding the shared centre, with immediate detection.
13. AI never makes an illegal move and never treats an artificial search cut-off as an in-game draw.
14. Browser-based play works end-to-end: new game, white move, computer reply, capture/return selection, pass, win, draw and restart.

## 8. Delivery process

1. Inspect the working directory and existing project conventions.
2. Implement and test the pure rules engine FIRST, including legal moves, state transition, captures and terminal states.
3. Add and run the unit tests, then build the responsive UI.
4. Add the computer opponent and verify it uses exactly the same rules engine as the UI.
5. Execute tests/build and fix failures. Do not change the agreed rules to make tests pass.
6. Report exact commands to run, tests passed, any residual caveats, and the implemented feature set.

Treat this brief and the supplied diagram as the specification. Do not silently simplify or change the graph or game rules.
