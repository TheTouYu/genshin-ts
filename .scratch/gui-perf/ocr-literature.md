# 文献与工程做法速查（多帧共识底板 / 变化区域 OCR）——2026-10-19

> 目的：给 `cmd=ocr_plate` 的每一步找现成做法与参数。检索于 2026-10-19（web_search，读摘要+来源页），非全篇精读。

| 类别 | 做法（要点） | 是否适用 | 用在哪一步 | 参数建议 |
|---|---|---|---|---|
| **Temporal median background subtraction**（经典变化检测：多帧中值=背景，逐像素差>阈值=前景） | 多帧中值对**瞬时噪声/动画**最稳（比均值抗离群），是"静态底板"的标准做法（如 [背景估计综述](https://www2.isical.ac.in/~icvgip04/ICVGIP04.pdf)、[CMU 背景建模](http://www.cs.cmu.edu/~datong/background_v4_y1_w1.pdf)） | **适用** | 底板构建：N≥5 帧逐像素中值 → plate；逐像素偏差 → 动态掩码 | N=5–10；中值；动态判定=偏差>12 的帧占比>0.5 |
| **Screen content coding（HEVC/VVC SCC）**：调色板模式 + Intra Block Copy + 跳过平坦块 | 屏幕内容**大片平坦、重复块**，编码器正是靠"相似块直接拷贝"省算力——对应我们的"静态区直接复用文本"（[SCC 专利背景](https://patentimages.storage.googleapis.com/21/6f/70/6cf940c5217e1b/US10897629.pdf)） | **适用（思想）** | 静态区零重算的合法依据；也提示"先切平坦块再算" | 以 16×16 块为粒度判"同块"；平坦块（std<2）直接跳过 |
| **Video frame differencing / I-frame vs P-frame** | I 帧=全量、P 帧=只编码相对参考帧的变化；参考帧失效（场景切换）就插新 I 帧 | **适用** | 冷帧=建基线（I）；小操作=P 帧（只算变化区）；结构大改=重建（新 I） | 变化面积>40% → 重建 |
| **Perceptual hash / SSIM 阈值** | 逐字节比较对 JPEG 噪声过敏；感知哈希（pHash/dHash）或 SSIM 局部窗口更稳 | **适用** | "这块变没变"的判据（框级签名 / 底板比对） | 8×8 缩略签名平均绝对差 6/255；或 SSIM<0.95 判变 |
| **UI diffing / incremental screen understanding**（截图逐行比较、只处理变化行；桌面读屏工具的滚动像素差） | 有工程先例（如 [逐行像素比较的屏幕读屏](https://patentimages.storage.googleapis.com/35/56/67/97e588d0f43422/US11080548.pdf)、[dsh-screen-reader 的精确局部像素差](https://github.com/cbg33695/dsh-screen-reader)）；**没有**公开的"只 OCR 变化区域"标准做法，需自建 | **部分适用** | 变化区域 OCR 的调度（本仓 `cmd=ocr_plate`） | 变化区域连通域 + margin 48；旧文本一个不丢 |

## 结论（用于实现）
1. **底板 = 多帧逐像素中值**（N=5 起，10 更稳）；同时算**动态掩码**（多帧里持续变的像素）→ always-dynamic，查询时跳过；
2. **查询 = 相对底板的变化掩码** → 连通域 → 只对变化区域跑 det+rec；**底板文本按"未变化"复用**（框级签名为辅）；
3. **阈值**：像素差阈值 12（0–255）、框级 8×8 签名阈值 6、变化面积占比 >40% 视为换页→重建底板；
4. 底板 OCR **只做一次**（离线），查询路径不做整帧 det。
