# Rubik 3×3 auto-solver architecture: event-driven planner/executor split

solverPlan reads state, computes solveMask, appends macro to solveBuf, sends op6; solver drives op3 via timer chain, signals op5; turn/flow executes moves; flowAfterTurn publishes state.

<!-- CLAIM:START clm_696D6AFD6F5ADF3D690F3407FE -->

### Rubik 3×3 auto-solver is event-driven: planner computes next macro, executor steps op3, state published after each turn

Rubik 3x3 auto-solve uses a 4-chain event-driven design: solverPlan (plan graph) reads published state and computes solveMask per stage (0=center normalization with whole-turn macros, 1=cross, 2=first-layer corners, 3=E-layer edges), looks up policy macro tables indexed by mask*24+state via longListGetInt4, appends decoded move codes to solveBuf, and signals op6; solver (executor graph) advances one op3 step per preTick/emitTick/doneTick timer chain and signals op5 when the sequence completes; turn/flow applies the move (including negative moveId fold = 3 logic-only + 1 visual) and flowAfterTurn publishes solver_cp/co/ep/eo/ct to stHost 1077936201 which solverPlan re-reads on each replan.

#### 适用边界

Applies to genshin-ts rubik-3x3 auto-solve (stage 0..2 shipped, stage 3 E-layer planned); not a general rule.

<!-- CLAIM:END clm_696D6AFD6F5ADF3D690F3407FE -->
