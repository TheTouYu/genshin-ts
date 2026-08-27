# Autosolve error family: list materialization, read-write timing, budget, injection

Three repeating bug families: (A) DSL expression re-materialization causing stale reads; (B) int_list short-materialization and solveBuf residue; (C) frame/budget limits (<3000 frames, <=10 case multipleBranches).

<!-- CLAIM:START clm_3E358071795A329628DF8E6563 -->

### Autosolve bugs cluster into 3 reusable families: expression re-materialization, list materialization/residue, and frame/case budget

Rubik 3x3 autosolve bugs cluster into three families. (A) Read-write timing / expression re-materialization: branch checks must read the graph variable after it was written (getNodeGraphVariable), never reuse a pre-set expression — hits: emitTick lost step (ad81ea3), negDone -90deg (5766bcb). (B) int_list materialization: all-zero lists get short-materialized by the engine, so append a sentinel 1 at the tail (solver_eo 13th, solver_co 9th, blockOrient); and resetting a length counter is NOT clearing the array — solveBuf residue (abd3673) caused corner mask 2<->3 oscillation, fixed by clearing solveBuf 100 entries at every replan entry. (C) Budget: single event <3000 frames (negative moveId fold 3027 truncated, whole-turn 2889 truncated), root-graph multipleBranches <=10 named cases + 1 default (12 cases silently dropped branches 11/12).

#### 适用边界

Guard rules reusable across rubik-3x3 and similar event-driven node-graph logic; exact values (3000, 10) are engine limits confirmed on this map.

<!-- CLAIM:END clm_3E358071795A329628DF8E6563 -->
