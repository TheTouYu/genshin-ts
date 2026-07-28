# GIA analysis tool selection

Choose trace, decode, semantic diff, topology, layout, coverage, or raw-wire tools by question.


<!-- CLAIM:START clm_01KYH4ZJ0Q06EDE5T9ETYCAGK4 -->

### Choose the smallest GIA tool by the question and escalate only for missing evidence

Use execution tracing for control topology, dataflow tracing for value provenance, decode for field orientation, semantic compare/diff for bounded A/B structure, topology/coverage/gap tools for calls and classification, layout tools only for coordinates, and raw scanners/round-trip checks for presence or unknown-field questions. Start with the smallest tool output and exact graph scope rather than full decoded corpora.

#### 适用边界与失效条件

Tool output inherits its decoder and scope limits: trace type labels do not prove controls work, semantic diff does not prove wire presence, and layout output does not prove game behavior. Revalidate when tool CLI, output semantics, decoder, or documented selection table changes.

<!-- CLAIM:END clm_01KYH4ZJ0Q06EDE5T9ETYCAGK4 -->
