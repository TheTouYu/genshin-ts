# Composite identity and relatedIds

Definition IDs, cross-document remapping, definition reuse, nested references, and relatedIds integrity.


<!-- CLAIM:START clm_01KYH4ZHG20242R3TTYBWTJTXR -->

### 复合身份在 GIA 编码前必须作为闭合引用集重映射（Composite identity must be remapped as a closed reference set before GIA encoding）

当前 gsts 在 GIA 编码前跨 IR 文档分配与比较复合定义：等价定义可复用 ID、冲突定义获得新 ID，重映射会更新定义、root 调用、嵌套 impl 调用、元数据与持久化 IR。Stage 3 随后通过 graphId 与 relatedIds 记录 definition→impl 与 impl/root→被调定义关系；只改定义 ID 会留下悬空引用。

Current gsts allocates and compares Composite definitions across IR documents before GIA encoding: equivalent definitions may reuse an ID, conflicting definitions receive a new ID, and remapping updates definitions, root calls, nested impl calls, metadata, and persisted source IR. Stage 3 then records definition→impl and impl/root→called-definition relationships through `graphId` and `relatedIds`; changing only a definition ID leaves dangling references.

#### 适用边界

这是当前 gsts 合并/编码契约，不是编辑器通用 ID 分配算法；数字 ID 约定与顺序不是可移植证据。

This is the current gsts merge/encoding contract, not the editor's universal ID allocation algorithm. Numeric ID conventions and ordering are not portable evidence. Revalidate when IR merge timing, equality, ID allocation, call lowering, accessory identity, or `relatedIds` construction changes.

<!-- CLAIM:END clm_01KYH4ZHG20242R3TTYBWTJTXR -->
