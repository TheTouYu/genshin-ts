export const PHYSICS_CUSTOM_VARIABLES = {
  gravity: 'G',
  stiffness: 'S',
  inverseInertia: '1/I',
  damping: 'D',
  radius: 'R',
  friction: 'u',
  mass: 'm',
  motionEntityGuid: '运动实体guid',
  visualEntityGuid: '视觉实体guid',
  angularFriction: 'u_w',
  gravityForce: 'f_g',
  updateInterval: '更新间隔',
  physicsPrefabId: '物理计算元件id',
  contactGround: '接触地面'
} as const

export const PHYSICS_NODE_GRAPH_VARIABLES = {
  gravity: 'G',
  stiffness: 'S',
  inverseInertia: '1/I',
  damping: 'D',
  radius: 'R',
  friction: 'u',
  mass: 'm',
  motionEntity: '运动实体',
  visualEntity: '视觉实体',
  angularFriction: 'u_w',
  fixedAngularDamping: 'w固定衰减',
  gravityForce: 'f_g',
  deltaSeconds: 't',
  halfGravityDeltaSquared: '0.5gt',
  angularVelocity: 'w',
  velocity: 'v',
  force: 'F',
  impulse: 'J',
  extraPressure: '额外压力'
} as const
