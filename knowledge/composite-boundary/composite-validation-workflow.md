# Composite bug analysis and validation workflow

Navigation for isomorphic reproduction, impact survey, root comparison, red/green regression, backend coverage, and evidence separation.

No claims are created by this structure Bundle.

<!-- CLAIM:START clm_01KYH07BXVXF15V0QZKK1E37KB -->

### Composite boundary fixes require an isomorphic red-to-green evidence chain

A Composite/GIA boundary bug is analyzed by preserving the reference, decoding interface/impl/routes and raw wire when needed, creating a minimal isomorphic reproduction, confirming the failure before production edits, surveying affected node families, comparing the same nodes in the root graph, writing a focused red regression, applying the smallest seam-local fix, and validating adjacent nested/capture/sparse/root-impl and shared/legacy paths as applicable.

#### 适用边界

Reports must keep current source behavior, automatic regression, real GIA observation, editor import, injection/writeback, and game behavior as separate evidence levels. A generated or structurally valid GIA does not by itself prove editor or game behavior.

<!-- CLAIM:END clm_01KYH07BXVXF15V0QZKK1E37KB -->
