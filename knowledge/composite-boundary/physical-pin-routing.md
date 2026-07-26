# Physical pins and compositePins routing

Stable Composite boundary routing constraints after deletion tests.

No claims are created by the Blueprint structure Bundle.

<!-- CLAIM:START clm_01K13DM5F1F1F1F1F1F1F1F1F1 -->

### Composite boundary routes do not materialize pins

A `compositePins` entry is a route from an outer interface pin to an encoded inner node pin; it does not create that physical inner pin. Therefore any node family whose boundary route requires a physical InParam or OutParam must materialize that pin separately and keep kind/index alignment after node-index remapping.

#### 适用边界

Do not generalize this into “every compositePins route requires a physical pin.” Production integrity defaults allow intentional holes; strict physical-pin checks are enabled only for contracts that require complete pin sets.

<!-- CLAIM:END clm_01K13DM5F1F1F1F1F1F1F1F1F1 -->
