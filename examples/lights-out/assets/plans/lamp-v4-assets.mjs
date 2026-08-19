// 灯阵 v4 动态关卡资产（2026-08-16）
// 灯柱 L1/L2/L3（不同 prefab 挂不同关卡图）+ 灯头 + 管理台 + 引导牌
// 全部含 basicMotion（旋转庆祝前置）；灯柱含 tabBar（切换）
export default {
  assets: {
    staticAssemblies: [
      {
        "name": "灯柱L1",
        "prefabId": 1077936129,
        "templatePrefabId": 10009001,
        "templateInstanceId": 10009001,
        "templateName": "长方体",
        "position": [
          0,
          0.55,
          0
        ],
        "scale": [
          0.1,
          1.0,
          0.1
        ],
        "color": {
          "enabled": true,
          "rgb": 4868682,
          "opacity": 100,
          "overlay": "overwrite"
        },
        "components": [
          {
            "type": "tabBar",
            "regionName": "切换",
            "options": [
              "切换"
            ],
            "regionType": "sphere",
            "regionRadius": 1.0,
            "regionCenter": [
              0,
              1.3,
              0
            ]
          },
          {
            "type": "basicMotion",
            "preset": "default"
          }
        ],
        "items": [
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.49,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.5,
              0.12,
              0.5
            ],
            "color": {
              "enabled": true,
              "rgb": 3815994,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.4,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.32,
              0.05,
              0.32
            ],
            "color": {
              "enabled": true,
              "rgb": 4868682,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.14,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.18,
              0.05,
              0.18
            ],
            "color": {
              "enabled": true,
              "rgb": 13148746,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              0.21,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.18,
              0.05,
              0.18
            ],
            "color": {
              "enabled": true,
              "rgb": 13148746,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              0.53,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.3,
              0.06,
              0.3
            ],
            "color": {
              "enabled": true,
              "rgb": 3815994,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009005,
            "position": [
              0,
              0.79,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.42,
              0.4,
              0.42
            ],
            "color": {
              "enabled": true,
              "rgb": 16765562,
              "opacity": 45,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009002,
            "position": [
              0,
              1.01,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.1,
              0.1,
              0.1
            ],
            "color": {
              "enabled": true,
              "rgb": 13938487,
              "opacity": 100,
              "overlay": "overwrite"
            }
          }
        ],
        "definitionAuxiliaryIds": [
          1073741830,
          1073741831,
          1073741832,
          1073741833,
          1073741834,
          1073741835,
          1073741836
        ],
        "instanceAuxiliaryIds": [
          1073741837,
          1073741838,
          1073741839,
          1073741840,
          1073741841,
          1073741842,
          1073741843
        ]
      },
      {
        "name": "灯柱L2",
        "prefabId": 1077936133,
        "templatePrefabId": 10009001,
        "templateInstanceId": 10009001,
        "templateName": "长方体",
        "position": [
          0,
          0.55,
          0
        ],
        "scale": [
          0.1,
          1.0,
          0.1
        ],
        "color": {
          "enabled": true,
          "rgb": 4868682,
          "opacity": 100,
          "overlay": "overwrite"
        },
        "components": [
          {
            "type": "tabBar",
            "regionName": "切换",
            "options": [
              "切换"
            ],
            "regionType": "sphere",
            "regionRadius": 1.0,
            "regionCenter": [
              0,
              1.3,
              0
            ]
          },
          {
            "type": "basicMotion",
            "preset": "default"
          }
        ],
        "items": [
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.49,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.5,
              0.12,
              0.5
            ],
            "color": {
              "enabled": true,
              "rgb": 3815994,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.4,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.32,
              0.05,
              0.32
            ],
            "color": {
              "enabled": true,
              "rgb": 4868682,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.14,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.18,
              0.05,
              0.18
            ],
            "color": {
              "enabled": true,
              "rgb": 13148746,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              0.21,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.18,
              0.05,
              0.18
            ],
            "color": {
              "enabled": true,
              "rgb": 13148746,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              0.53,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.3,
              0.06,
              0.3
            ],
            "color": {
              "enabled": true,
              "rgb": 3815994,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009005,
            "position": [
              0,
              0.79,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.42,
              0.4,
              0.42
            ],
            "color": {
              "enabled": true,
              "rgb": 16765562,
              "opacity": 45,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009002,
            "position": [
              0,
              1.01,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.1,
              0.1,
              0.1
            ],
            "color": {
              "enabled": true,
              "rgb": 13938487,
              "opacity": 100,
              "overlay": "overwrite"
            }
          }
        ],
        "definitionAuxiliaryIds": [
          1073741921,
          1073741922,
          1073741923,
          1073741924,
          1073741925,
          1073741926,
          1073741927
        ],
        "instanceAuxiliaryIds": [
          1073741928,
          1073741929,
          1073741930,
          1073741931,
          1073741932,
          1073741933,
          1073741934
        ]
      },
      {
        "name": "灯柱L3",
        "prefabId": 1077936134,
        "templatePrefabId": 10009001,
        "templateInstanceId": 10009001,
        "templateName": "长方体",
        "position": [
          0,
          0.55,
          0
        ],
        "scale": [
          0.1,
          1.0,
          0.1
        ],
        "color": {
          "enabled": true,
          "rgb": 4868682,
          "opacity": 100,
          "overlay": "overwrite"
        },
        "components": [
          {
            "type": "tabBar",
            "regionName": "切换",
            "options": [
              "切换"
            ],
            "regionType": "sphere",
            "regionRadius": 1.0,
            "regionCenter": [
              0,
              1.3,
              0
            ]
          },
          {
            "type": "basicMotion",
            "preset": "default"
          }
        ],
        "items": [
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.49,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.5,
              0.12,
              0.5
            ],
            "color": {
              "enabled": true,
              "rgb": 3815994,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.4,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.32,
              0.05,
              0.32
            ],
            "color": {
              "enabled": true,
              "rgb": 4868682,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.14,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.18,
              0.05,
              0.18
            ],
            "color": {
              "enabled": true,
              "rgb": 13148746,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              0.21,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.18,
              0.05,
              0.18
            ],
            "color": {
              "enabled": true,
              "rgb": 13148746,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              0.53,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.3,
              0.06,
              0.3
            ],
            "color": {
              "enabled": true,
              "rgb": 3815994,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009005,
            "position": [
              0,
              0.79,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.42,
              0.4,
              0.42
            ],
            "color": {
              "enabled": true,
              "rgb": 16765562,
              "opacity": 45,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009002,
            "position": [
              0,
              1.01,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.1,
              0.1,
              0.1
            ],
            "color": {
              "enabled": true,
              "rgb": 13938487,
              "opacity": 100,
              "overlay": "overwrite"
            }
          }
        ],
        "definitionAuxiliaryIds": [
          1073741935,
          1073741936,
          1073741937,
          1073741938,
          1073741939,
          1073741940,
          1073741941
        ],
        "instanceAuxiliaryIds": [
          1073741942,
          1073741943,
          1073741944,
          1073741945,
          1073741946,
          1073741947,
          1073741948
        ]
      },
      {
        "name": "灯头",
        "prefabId": 1077936130,
        "templatePrefabId": 10009002,
        "templateInstanceId": 10009002,
        "templateName": "球体",
        "position": [
          0,
          0,
          0
        ],
        "scale": [
          0.3,
          0.3,
          0.3
        ],
        "color": {
          "enabled": true,
          "rgb": 16763972,
          "opacity": 100,
          "overlay": "overwrite"
        },
        "components": [
          {
            "type": "basicMotion",
            "preset": "default"
          }
        ],
        "items": [
          {
            "resourceId": 10009002,
            "position": [
              0,
              0.02,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.13,
              0.13,
              0.13
            ],
            "color": {
              "enabled": true,
              "rgb": 16774096,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.19,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.16,
              0.06,
              0.16
            ],
            "color": {
              "enabled": true,
              "rgb": 3815994,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009002,
            "position": [
              0,
              0.17,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.06,
              0.06,
              0.06
            ],
            "color": {
              "enabled": true,
              "rgb": 16771488,
              "opacity": 100,
              "overlay": "overwrite"
            }
          }
        ],
        "definitionAuxiliaryIds": [
          1073741844,
          1073741845,
          1073741846
        ],
        "instanceAuxiliaryIds": [
          1073741847,
          1073741848,
          1073741849
        ]
      },
      {
        "name": "管理台",
        "prefabId": 1077936131,
        "templatePrefabId": 10009001,
        "templateInstanceId": 10009001,
        "templateName": "长方体",
        "position": [
          0,
          0.35,
          0
        ],
        "scale": [
          0.3,
          0.6,
          0.3
        ],
        "color": {
          "enabled": true,
          "rgb": 5921370,
          "opacity": 100,
          "overlay": "overwrite"
        },
        "components": [
          {
            "type": "tabBar",
            "regionName": "灯阵",
            "options": [
              "开始游戏",
              "立即胜利"
            ],
            "regionType": "sphere",
            "regionRadius": 1.5,
            "regionCenter": [
              0,
              1.0,
              0
            ]
          },
          {
            "type": "basicMotion",
            "preset": "default"
          }
        ],
        "items": [
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.3,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.5,
              0.1,
              0.5
            ],
            "color": {
              "enabled": true,
              "rgb": 3815994,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009002,
            "position": [
              0,
              0.42,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.14,
              0.14,
              0.14
            ],
            "color": {
              "enabled": true,
              "rgb": 13938487,
              "opacity": 100,
              "overlay": "overwrite"
            }
          }
        ],
        "definitionAuxiliaryIds": [
          1073741913,
          1073741914
        ],
        "instanceAuxiliaryIds": [
          1073741915,
          1073741916
        ]
      },
      {
        "name": "引导牌",
        "prefabId": 1077936132,
        "templatePrefabId": 10009001,
        "templateInstanceId": 10009001,
        "templateName": "长方体",
        "position": [
          0,
          0.35,
          0
        ],
        "scale": [
          0.05,
          0.5,
          0.05
        ],
        "color": {
          "enabled": true,
          "rgb": 6969914,
          "opacity": 100,
          "overlay": "overwrite"
        },
        "components": [
          {
            "type": "tabBar",
            "regionName": "帮助",
            "options": [
              "点击灯柱翻转明暗",
              "点亮全部灯过关",
              "通关解锁下一关"
            ],
            "regionType": "sphere",
            "regionRadius": 1.5,
            "regionCenter": [
              0,
              0.8,
              0
            ]
          },
          {
            "type": "basicMotion",
            "preset": "default"
          }
        ],
        "items": [
          {
            "resourceId": 10009008,
            "position": [
              0,
              -0.32,
              0
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.3,
              0.08,
              0.3
            ],
            "color": {
              "enabled": true,
              "rgb": 4868682,
              "opacity": 100,
              "overlay": "overwrite"
            }
          },
          {
            "resourceId": 10009001,
            "position": [
              0,
              0.35,
              0.03
            ],
            "rotation": [
              0,
              0,
              0
            ],
            "scale": [
              0.4,
              0.45,
              0.03
            ],
            "color": {
              "enabled": true,
              "rgb": 14207395,
              "opacity": 100,
              "overlay": "overwrite"
            }
          }
        ],
        "definitionAuxiliaryIds": [
          1073741917,
          1073741918
        ],
        "instanceAuxiliaryIds": [
          1073741919,
          1073741920
        ]
      }
    ]
  }
}
