# Composite identity and relatedIds

Definition IDs, cross-document remapping, definition reuse, nested references, and relatedIds integrity.


<!-- CLAIM:START clm_01KYH4ZHG20242R3TTYBWTJTXR -->

### Composite identity must be remapped as a closed reference set before GIA encoding

Current gsts allocates and compares Composite definitions across IR documents before GIA encoding: equivalent definitions may reuse an ID, conflicting definitions receive a new ID, and remapping updates definitions, root calls, nested impl calls, metadata, and persisted source IR. Stage 3 then records definition→impl and impl/root→called-definition relationships through `graphId` and `relatedIds`; changing only a definition ID leaves dangling references.

#### 适用边界与失效条件

This is the current gsts merge/encoding contract, not the editor's universal ID allocation algorithm. Numeric ID conventions and ordering are not portable evidence. Revalidate when IR merge timing, equality, ID allocation, call lowering, accessory identity, or `relatedIds` construction changes.

<!-- CLAIM:END clm_01KYH4ZHG20242R3TTYBWTJTXR -->
