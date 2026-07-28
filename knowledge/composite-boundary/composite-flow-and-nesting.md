# Composite flow interfaces and nesting

Multi-InFlow/OutFlow, default continuation, nested calls, capture routing, and OutFlow promotion.


<!-- CLAIM:START clm_01KYH4ZH6A6ZYM43SZFPR5K30R -->

### Composite flow interfaces preserve declared indexes across default and explicit topology

Current gsts records named `inflowMarks`/`outflowMarks` into `CompositeDefIR` and preserves declared InFlow/OutFlow indexes through synthetic calls and impl `compositePins`. Single-exit execution can continue naturally; ordinary continuation after a multi-exit node or Composite selects `OutFlow[0]` and emits `GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION`, while exact fan-in/fan-out uses detached nodes plus explicit links. Nested Composite calls remain synthetic calls, retain child references, and can promote a selected child OutFlow as an outer OutFlow.

#### 适用边界与失效条件

This is current gsts runtime/Stage 3 behavior for the covered focused fixtures, not a universal editor topology rule. Loop-complete APIs and pure-data Composites have separate continuation semantics. Revalidate when capture flow marks, call lowering, continuation diagnostics, nested-call lowering, or backend selection changes.

<!-- CLAIM:END clm_01KYH4ZH6A6ZYM43SZFPR5K30R -->
