// 票 25-B v3 球与入口（2026-10-13，地图 1073741827「真实足球v3」）
// 照搬 donor 3231 球元件：几何/配色/组件参数逐项同值（结构见 ./v3-ball.structure.json，
// 由 donor export 逐 item 复制 222 条：10009004×120 白 / 10009001×90 深 / 10009005×12）。
// 组件三件（写在 structure JSON 顶层 components——structureFile 与内联 components 互斥）：basicMotion（飞行/滚动驱动）+ tabBar（9 选项，region 球体 r=5，与
// src-fb/fb-input.ts 的 tabId 1..8 KICK / 9 RESET 表一一对应）+ hitDetection（控球判定）。
// aux 段：def 1073744000..4221 / inst 1073744300..4521（v3 现占用 def ≤1073743197 /
// inst ≤1073743429，不重叠；def 页位/缩放与 donor 同值 → 世界直径 ≈0.494m ≈ 2×fb_p_ball_r）。
export default {
  assets: {
    staticAssemblies: [
      {
        name: '足球_1',
        prefabId: 1077936138,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [0, 0.47882080078125, -5.593648910522461],
        rotation: [0, 0, 0],
        scale: [0.25, 0.25, 0.25],
        definitionAuxiliaryIds: Array.from({ length: 222 }, (_, i) => 1073744000 + i),
        instanceAuxiliaryIds: Array.from({ length: 222 }, (_, i) => 1073744300 + i),
        structureFile: './v3-ball.structure.json'
      }
    ]
  }
}
