--[[==========================================================================
 tests-lua/engine_shim.lua —— headless 假引擎（lua5.3，不依赖模拟器/node）
 ----------------------------------------------------------------------------
 干什么：把 `lua/main.lua` + `lua/tetris/*.lua` 原样加载进一个纯 Lua 环境，提供
         game/script/Enum/typeof/print/require 六个引擎面，让 tests/*.json 的
         log/control/tree/lua/audio 断言在 lua5.3 上秒级求值。
 为什么：模拟器跑一轮 70 用例 387s（每例新建 studio+fengari），复现一个 bug 代价太大。

 权威来源（改动前先读，别按记忆猜）：
   · 引擎实现：/home/h/miliastra-beyond-simulator/client/lua-runtime/src/{scene,runtime,enums}.js
   · 断言口径：/home/h/miliastra-beyond-simulator/studio/autotest/{assert,runner,format}.js
   · 画布/设备：/home/h/miliastra-beyond-simulator/studio/constants.js（CANVAS_PRESETS）
   · 用例驱动：tests-lua/run_cases.lua

 不可信边界（本 shim 证明不了的，见 run_cases 报告尾段）：
   ① 渲染/字体度量/裁剪（textbox 框高判据、文字是否真画出来）—— 只存字段，不排版；
   ② 音频时长/白名单/voice 抢占 —— 只记录 PlayAudio2D 的 id 序列；
   ③ 容器布局求解（Scroll/Grid 排版、localScale 变换下的可视裁剪）—— 只做 anchor/pivot 矩形；
   ④ 真机差异（模板 guid 重编号、SetVisible 不生效、Enum 键位形态）—— 本 shim 按**模拟器**语义；
   ⑤ Tween/动画/信号收发/自定义变量 —— 只留最小桩，未实现的调用会抛错且被 pcall 捕获。

 与仓库版源码的桥：`lua/main.lua` 与 `lua/tetris/config.lua` 里写的是 __GUID_CELL__ 这类
 占位符（qxqy/build.mjs 才替换成数字）。本 shim 在 load 前做同样 4 条替换，真值从
  tetris.save.json 的模板名取 ⇒ 跑的是**当前仓库 Lua**，行为与模拟器一致。
=========================================================================]]

local M = {}

--------------------------------------------------------------------------------
-- 1. 画布预设（照抄 studio/constants.js CANVAS_PRESETS）
--------------------------------------------------------------------------------
local CANVAS_PRESETS = {
  ['pc-16-9'] = { width = 1600, height = 900, device = 'KeyboardAndMouse', platform = 'KEYBOARD' },
  ['pc-21-9'] = { width = 2100, height = 900, device = 'KeyboardAndMouse', platform = 'KEYBOARD' },
  ['mobile-16-9'] = { width = 1280, height = 720, device = 'Mobile', platform = 'TOUCHSCREEN' },
  ['mobile-19.5-9'] = { width = 1560, height = 720, device = 'Mobile', platform = 'TOUCHSCREEN' },
  ['mobile-4-3'] = { width = 1280, height = 960, device = 'Mobile', platform = 'TOUCHSCREEN' },
}
M.CANVAS_PRESETS = CANVAS_PRESETS
M.DEFAULT_CANVAS = 'pc-16-9'

--------------------------------------------------------------------------------
-- 2. 枚举树（照抄 client/lua-runtime/src/enums.js GROUPS + keyEvents()）
--------------------------------------------------------------------------------
local ENUM_NAMES = {
  EaseType = {
    'Linear', 'InSine', 'OutSine', 'InOutSine', 'InQuad', 'OutQuad', 'InOutQuad',
    'InCubic', 'OutCubic', 'InOutCubic', 'InQuart', 'OutQuart', 'InOutQuart',
    'InQuint', 'OutQuint', 'InOutQuint', 'InExpo', 'OutExpo', 'InOutExpo',
    'InCirc', 'OutCirc', 'InOutCirc', 'InBack', 'OutBack', 'InOutBack',
    'InElastic', 'OutElastic', 'InOutElastic', 'InBounce', 'OutBounce', 'InOutBounce',
  },
  CustomVariableEntityType = { 'Level', 'PlayerSelf', 'AvatarSelf' },
  Device = { 'KeyboardAndMouse', 'Mobile', 'Controller', 'MobileController' },
  StageMode = { 'Beyond', 'Classic' },
  LanguageType = {
    'LanguageNone', 'LanguageEng', 'LanguageChs', 'LanguageCht', 'LanguageFra', 'LanguageDeu',
    'LanguageSpa', 'LanguagePor', 'LanguageRus', 'LanguageJpn', 'LanguageKor', 'LanguageTha',
    'LanguageVie', 'LanguageInd', 'LanguageTur', 'LanguageIta',
  },
  ParamType = {
    'Entity', 'EntityList', 'Int', 'IntList', 'Bool', 'BoolList', 'Float', 'FloatList',
    'String', 'StringList', 'Vector3', 'Vector3List', 'Guid', 'GuidList', 'ConfigId',
    'PrefabId', 'ConfigIdList', 'PrefabIdList',
  },
  CursorEventType = {
    'CursorDown', 'CursorUp', 'CursorEnter', 'CursorExit',
    'CursorDrag', 'CursorBeginDrag', 'CursorEndDrag', 'CursorClick',
  },
  ScrollDirection = { 'Horizontal', 'Vertical' },
  ScrollLayoutConstraint = { 'AutoWrap', 'Fixed' },
  ScrollAlignType = { 'Bottom', 'Center', 'Top' },
  ControllerNavigationDir = { 'Up', 'Down', 'Left', 'Right' },
  ControllerNavigationEventType = {
    'Confirm', 'Cancel', 'Focus', 'LostFocus',
    'RightStickUp', 'RightStickDown', 'RightStickRight', 'RightStickLeft',
    'LeftStickUp', 'LeftStickDown', 'LeftStickLeft', 'LeftStickRight',
  },
  ControllerNavigationMode = { 'None', 'NearestControl', 'Specified' },
  TextHorizontalAlignment = { 'Left', 'Middle', 'Right' },
  TextVerticalAlignment = { 'Top', 'Middle', 'Bottom' },
  ImageType = { 'Basic', 'Stretch' },
  ImageSource = {
    'StaticReference', 'Item', 'Equipment', 'Skill',
    'UnitStatus', 'Faction', 'Currency', 'Prefab',
  },
  ImageFillType = { 'Unused', 'Horizontal', 'Vertical', 'Radial90', 'Radial180', 'Radial360' },
  ImageFillHorizontalType = { 'Left', 'Right' },
  ImageFillVerticalType = { 'Bottom', 'Top' },
  ImageFillRadial90Type = { 'BottomLeft', 'TopLeft', 'TopRight', 'BottomRight' },
  ImageFillRadialType = { 'Bottom', 'Left', 'Top', 'Right' },
  ImageMaskSoftEdgeMode = { 'Percentage', 'Pixel' },
  UIAnimationLayer = { 'AboveAllControls', 'BelowAllControls' },
}

local KEYBOARD_NAMED = {
  'MoveForwardKey', 'MoveBackwardKey', 'MoveLeftKey', 'MoveRightKey',
  'SwitchToWalkOrRunKey', 'SprintKey', 'JumpKey', 'DropKey',
  'OpenShortcutWheelKey', 'InteractKey', 'NormalAttackKey',
  'CharacterSkill1Key', 'CharacterSkill2Key', 'CharacterSkill3Key', 'CharacterSkill4Key',
}
local CONTROLLER_NAMED = {
  'SprintKey', 'JumpKey', 'InteractKey', 'NormalAttackKey',
  'CharacterSkill1Key', 'CharacterSkill2Key', 'CharacterSkill3Key', 'CharacterSkill4Key',
  'MenuConfirmKey', 'MenuBackKey',
}

do
  local keyboard = {}
  for i = 1, 43 do keyboard[#keyboard + 1] = 'CraftspersonKey' .. i end
  for _, k in ipairs(KEYBOARD_NAMED) do keyboard[#keyboard + 1] = k end
  keyboard[#keyboard + 1] = 'None'
  ENUM_NAMES.KeyboardKeyCode = keyboard

  local controller = {}
  for i = 1, 14 do controller[#controller + 1] = 'CraftspersonKey' .. i end
  for _, k in ipairs(CONTROLLER_NAMED) do controller[#controller + 1] = k end
  controller[#controller + 1] = 'None'
  ENUM_NAMES.ControllerKeyCode = controller

  local keyEvents = {}
  for _, suffix in ipairs({ 'Down', 'Up' }) do
    for i = 1, 43 do keyEvents[#keyEvents + 1] = 'KeyboardCraftspersonKey' .. i .. suffix end
    for _, k in ipairs(KEYBOARD_NAMED) do keyEvents[#keyEvents + 1] = 'Keyboard' .. k .. suffix end
    for i = 1, 14 do keyEvents[#keyEvents + 1] = 'ControllerCraftspersonKey' .. i .. suffix end
    for _, k in ipairs(CONTROLLER_NAMED) do keyEvents[#keyEvents + 1] = 'Controller' .. k .. suffix end
  end
  ENUM_NAMES.KeyEventType = keyEvents
end

local function build_enums()
  local enums = {}
  for type_name, names in pairs(ENUM_NAMES) do
    local group = {}
    for _, name in ipairs(names) do
      group[name] = setmetatable({
        Name = name, FullName = 'Enum.' .. type_name .. '.' .. name, EnumType = type_name,
      }, { __tostring = function(item) return item.FullName end })
    end
    enums[type_name] = group
  end
  return enums
end

--------------------------------------------------------------------------------
-- 3. 控件模型（字段/方法白名单照抄 scene.js luaFieldAccess + BASE_METHODS）
--------------------------------------------------------------------------------
local TYPEOF = {
  container = 'ClientUIContainerControl',
  textbox = 'ClientUITextBoxControl',
  textwindow = 'ClientUITextWindowControl',
  image = 'ClientUIImageControl',
  button = 'ClientUIPresetButtonControl',
  cursor = 'ClientUICursorEventAreaControl',
  grid = 'ClientUIGridScrollerControl',
  keyhint = 'ClientUIKeyHintControl',
  animation = 'ClientUIAnimationControl',
  fullscreen = 'ClientUIFullscreenAnimationControl',
  reference = 'ClientUIReferenceControl',
}

local BASE_RO = { alive = true, Id = true, prefabIndex = true, active = true, activeInHierarchy = true, visible = true }
local BASE_RW = {
  name = true, parent = true,
  anchoredPositionX = true, anchoredPositionY = true, sizeDeltaX = true, sizeDeltaY = true,
  anchorMinX = true, anchorMinY = true, anchorMaxX = true, anchorMaxY = true, pivotX = true, pivotY = true,
  localScaleX = true, localScaleY = true, localScaleZ = true,
  localRotationX = true, localRotationY = true, localRotationZ = true, canControllerFocus = true,
}
local KIND_RO = {
  image = { imageSource = true, imageId = true },
  grid = { itemCount = true, scrollDirection = true, layoutConstraint = true, layoutConstraintFixedCount = true },
  reference = { referencedPrefabIndex = true },
}
local KIND_RW = {
  container = {
    isolateNavigation = true, disableKeyEventPassthrough = true,
    disableCursorEventPassthrough = true, showCursor = true,
  },
  textbox = {
    text = true, fontSize = true, fontColor = true, bgColor = true, enableOutline = true,
    outlineColor = true, horizontalAlignment = true, verticalAlignment = true,
    adaptiveFontSize = true, minimumFontSize = true,
  },
  textwindow = {
    interactable = true, showScrollBar = true, text = true, fontSize = true, fontColor = true,
    bgColor = true, enableOutline = true, outlineColor = true, horizontalAlignment = true,
    verticalAlignment = true, adaptiveFontSize = true, minimumFontSize = true,
  },
  image = {
    imageType = true, imageColor = true, enableMask = true, enableSoftEdge = true,
    softEdgeMode = true, softEdgeWidthX = true, softEdgeWidthY = true,
    horizontalSoftRange = true, verticalSoftRange = true, reverseMaskArea = true,
    fillType = true, fillHorizontalType = true, fillVerticalType = true,
    fillRadial90Type = true, fillRadialType = true, fillAmount = true,
  },
  button = { interactable = true, clickAudioId = true, raycastTarget = true },
  cursor = { raycastTarget = true },
  grid = { interactable = true, showScrollBar = true, scrollProgress = true },
  animation = { animationId = true, playSoundEffect = true, layer = true },
  fullscreen = { animationId = true, playSoundEffect = true },
}
local COLOR_FIELDS = { imageColor = true, fontColor = true, bgColor = true, outlineColor = true }
local ENUM_FIELDS = {
  horizontalAlignment = 'TextHorizontalAlignment',
  verticalAlignment = 'TextVerticalAlignment',
  imageSource = 'ImageSource',
  imageType = 'ImageType',
  fillType = 'ImageFillType',
  fillHorizontalType = 'ImageFillHorizontalType',
  fillVerticalType = 'ImageFillVerticalType',
  fillRadial90Type = 'ImageFillRadial90Type',
  fillRadialType = 'ImageFillRadialType',
  softEdgeMode = 'ImageMaskSoftEdgeMode',
  layer = 'UIAnimationLayer',
}
local INTEGER_FIELDS = {
  Id = true, prefabIndex = true, imageId = true, fontSize = true, minimumFontSize = true,
  clickAudioId = true, itemCount = true, itemPrefabIndex = true, animationId = true,
  referencedPrefabIndex = true,
}

-- 字段表放弱键注册表（控制代理本身保持空表 ⇒ 元方法能拦住所有读写，与真机 userdata 同语义）
local FIELD = setmetatable({}, { __mode = 'k' })

-- 颜色读回是有符号 int32（Fengari 整数 32 位；实测 C(255,252,253,255) 读回 -197121）
local function to_signed32(value)
  if type(value) ~= 'number' then return value end
  local i = math.floor(value) % 4294967296
  if i >= 2147483648 then i = i - 4294967296 end
  return i
end

local function kind_is(kind, list)
  for i = 1, #list do if list[i] == kind then return true end end
  return false
end

local function field_readable(kind, key)
  if BASE_RO[key] or BASE_RW[key] then return true end
  local ro, rw = KIND_RO[kind], KIND_RW[kind]
  return (ro and ro[key]) or (rw and rw[key]) or false
end

local function field_writable(kind, key)
  if BASE_RW[key] then return true end
  local rw = KIND_RW[kind]
  return (rw and rw[key]) or false
end

-- 方法实现：全部收 (self, ...)；按 kind 决定可见性（luaHasMethod / KIND_METHODS）
local METHODS = {}
local BASE_METHODS = {
  GetChildren = true, GetChild = true, FindChild = true,
  SetActive = true, SetVisible = true,
  GetSiblingIndex = true, SetSiblingIndex = true, SetAsFirstSibling = true, SetAsLastSibling = true,
  GetAnchoredPosition = true, SetAnchoredPosition = true, GetSizeDelta = true, SetSizeDelta = true,
  GetAnchorMin = true, SetAnchorMin = true, GetAnchorMax = true, SetAnchorMax = true,
  GetPivot = true, SetPivot = true, GetLocalScale = true, SetLocalScale = true,
  GetLocalRotation = true, SetLocalRotation = true,
  GetScriptByPath = true, GetScript = true, GetScripts = true,
  AddKeyEventListener = true, RemoveKeyEventListener = true,
  RemoveKeyEventListeners = true, RemoveAllKeyEventListeners = true,
}
local CURSOR_METHOD_KINDS = { button = true, cursor = true }
local KIND_METHODS = {
  image = {
    SetImage = true, SetSoftEdgeWidth = true, SetFillUnused = true, SetFillHorizontal = true,
    SetFillVertical = true, SetFillRadial90 = true, SetFillRadial180 = true, SetFillRadial360 = true,
  },
  cursor = {
    AddCursorEventListener = true, RemoveCursorEventListener = true,
    RemoveCursorEventListeners = true, RemoveAllCursorEventListeners = true, SimulateCursorClick = true,
  },
  button = {
    AddCursorEventListener = true, RemoveCursorEventListener = true,
    RemoveCursorEventListeners = true, RemoveAllCursorEventListeners = true, SimulateCursorClick = true,
  },
  animation = { PlayAnimation = true, StopAnimation = true },
  grid = {
    RefreshItems = true, GetItemIndex = true, GetItemSize = true, GetItemSpacing = true,
    GetPadding = true, ScrollToItemAt = true, GetContentLength = true,
  },
}

local function method_allowed(kind, key)
  if BASE_METHODS[key] then return true end
  local set = KIND_METHODS[kind]
  return (set and set[key]) or false
end

local function active_in_hierarchy(c)
  local f = FIELD[c]
  while f do
    if not f.active then return false end
    f = f.parent and FIELD[f.parent] or nil
  end
  return true
end

local function parent_children(f)
  local p = f.parent and FIELD[f.parent]
  return p and p.children or nil
end

local function remove_from_parent(c)
  local f = FIELD[c]
  local list = parent_children(f)
  if not list then f.parent = nil return end
  for i = 1, #list do
    if list[i] == c then table.remove(list, i) break end
  end
  f.parent = nil
end

local CONTROL_MT = {}

local function attach_child(parent, child)
  local pf, cf = FIELD[parent], FIELD[child]
  if not (pf and cf) then return end
  cf.parent = parent
  -- 编辑器树 first-sibling-on-top；Instantiate 走 SetAsLastSibling ⇒ 新实例插到数组头（最上层）
  if pf.children == nil then pf.children = {} end
  table.insert(pf.children, 1, child)
end

function CONTROL_MT.__index(c, key)
  local f = FIELD[c]
  if not f then return nil end
  if method_allowed(f.kind, key) and METHODS[key] then return METHODS[key] end
  if not field_readable(f.kind, key) then return nil end
  if key == 'activeInHierarchy' then return active_in_hierarchy(c) end
  if not f.alive and key ~= 'alive' then
    error(string.format("attempt to read '%s' of a destroyed control", tostring(key)), 2)
  end
  local value = f[key]
  if COLOR_FIELDS[key] then return to_signed32(value) end
  return value
end

function CONTROL_MT.__newindex(c, key, value)
  local f = FIELD[c]
  if not f then error('control proxy without field table', 2) end
  if not field_writable(f.kind, key) then
    error(string.format('cannot set %s, no such field', tostring(key)), 2)
  end
  if (key == 'fontSize' or key == 'minimumFontSize') then
    if type(value) ~= 'number' or value % 1 ~= 0 then
      local vt = value == nil and 'nil' or type(value)
      error(string.format("bad argument #2 to '%s' (integer expected, got %s)", key, vt), 2)
    end
  end
  if key == 'parent' then
    if f.parent then remove_from_parent(c) end
    if value ~= nil then attach_child(value, c) end
    return
  end
  if COLOR_FIELDS[key] then value = to_signed32(value) end
  local enum_type = ENUM_FIELDS[key]
  if enum_type and type(value) == 'string' then
    local group = ENUM_NAMES[enum_type]
    if group then
      for _, name in ipairs(group) do
        if name == value then
          value = { Name = name, FullName = 'Enum.' .. enum_type .. '.' .. name, EnumType = enum_type }
          break
        end
      end
    end
  end
  f[key] = value
end

function CONTROL_MT.__tostring(c)
  local f = FIELD[c]
  if not f then return 'ClientUIControl' end
  return string.format('ClientUIControl(%s,%s)', tostring(f.kind), tostring(f.name))
end

-- ===== 方法实现 =====
function METHODS.GetChildren(self)
  local f = FIELD[self]
  local out = {}
  for i = 1, #f.children do out[i] = f.children[i] end
  return out
end

function METHODS.GetChild(self, name)
  local f = FIELD[self]
  for i = 1, #f.children do
    if FIELD[f.children[i]].name == name then return f.children[i] end
  end
  return nil
end

function METHODS.FindChild(self, path)
  if not path then return nil end
  if not path:find('/', 1, true) then return METHODS.GetChild(self, path) end
  local cur = self
  for part in path:gmatch('[^/]+') do
    cur = METHODS.GetChild(cur, part)
    if not cur then return nil end
  end
  return cur
end

function METHODS.SetActive(self, v)
  FIELD[self].active = v and true or false
end

function METHODS.SetVisible(self, v)
  FIELD[self].visible = v and true or false
end

function METHODS.GetSiblingIndex(self)
  local f = FIELD[self]
  local list = parent_children(f)
  if not list then return -1 end
  for i = 1, #list do
    if list[i] == self then return #list - 1 - (i - 1) end
  end
  return -1
end

function METHODS.SetSiblingIndex(self, index)
  local f = FIELD[self]
  local list = parent_children(f)
  if not list then return false end
  local at
  for i = 1, #list do if list[i] == self then at = i break end end
  if not at then return false end
  local max = #list - 1
  if type(index) ~= 'number' or index % 1 ~= 0 or index < 0 or index > max then return false end
  table.remove(list, at)
  table.insert(list, max - index + 1, self)
  return true
end

function METHODS.SetAsFirstSibling(self) return METHODS.SetSiblingIndex(self, 0) end
function METHODS.SetAsLastSibling(self)
  local list = parent_children(FIELD[self])
  if not list then return false end
  return METHODS.SetSiblingIndex(self, #list - 1)
end

function METHODS.GetAnchoredPosition(self)
  local f = FIELD[self]
  return f.anchoredPositionX, f.anchoredPositionY
end

function METHODS.SetAnchoredPosition(self, x, y)
  local f = FIELD[self]
  f.anchoredPositionX, f.anchoredPositionY = x, y
end

function METHODS.GetSizeDelta(self)
  local f = FIELD[self]
  return f.sizeDeltaX, f.sizeDeltaY
end

function METHODS.SetSizeDelta(self, x, y)
  local f = FIELD[self]
  f.sizeDeltaX, f.sizeDeltaY = x, y
end

local function pair_setter(keyx, keyy)
  return function(self, x, y)
    local f = FIELD[self]
    f[keyx], f[keyy] = x, y
  end
end

local function pair_getter(keyx, keyy)
  return function(self)
    local f = FIELD[self]
    return f[keyx], f[keyy]
  end
end

METHODS.GetAnchorMin = pair_getter('anchorMinX', 'anchorMinY')
METHODS.SetAnchorMin = pair_setter('anchorMinX', 'anchorMinY')
METHODS.GetAnchorMax = pair_getter('anchorMaxX', 'anchorMaxY')
METHODS.SetAnchorMax = pair_setter('anchorMaxX', 'anchorMaxY')
METHODS.GetPivot = pair_getter('pivotX', 'pivotY')
METHODS.SetPivot = pair_setter('pivotX', 'pivotY')

function METHODS.GetLocalScale(self)
  local f = FIELD[self]
  return f.localScaleX, f.localScaleY, f.localScaleZ
end

function METHODS.SetLocalScale(self, x, y, z)
  local f = FIELD[self]
  f.localScaleX, f.localScaleY, f.localScaleZ = x, y, z
end

function METHODS.GetLocalRotation(self)
  local f = FIELD[self]
  return f.localRotationX, f.localRotationY, f.localRotationZ
end

function METHODS.SetLocalRotation(self, x, y, z)
  local f = FIELD[self]
  f.localRotationX, f.localRotationY, f.localRotationZ = x, y, z
end

function METHODS.GetScripts(self) return {} end
function METHODS.GetScriptByPath(self, path) return nil end
function METHODS.GetScript(self, id) return nil end

local function normalize_event_name(typeName)
  if type(typeName) == 'table' then return typeName.Name end
  return typeName
end

local function add_listener(store, typeName, fn)
  if type(fn) ~= 'function' then return end
  local name = normalize_event_name(typeName)
  if not name then return end
  store[name] = store[name] or {}
  local list = store[name]
  list[#list + 1] = fn
end

local function remove_listener(store, typeName, fn)
  local name = normalize_event_name(typeName)
  local list = name and store[name] or nil
  if not list then return end
  if fn == nil then store[name] = nil return end
  for i = #list, 1, -1 do
    if list[i] == fn then table.remove(list, i) end
  end
end

function METHODS.AddKeyEventListener(self, typeName, fn)
  add_listener(FIELD[self].key_listeners, typeName, fn)
end

function METHODS.RemoveKeyEventListener(self, typeName, fn)
  remove_listener(FIELD[self].key_listeners, typeName, fn)
end

function METHODS.RemoveKeyEventListeners(self, typeName)
  remove_listener(FIELD[self].key_listeners, typeName, nil)
end

function METHODS.RemoveAllKeyEventListeners(self)
  FIELD[self].key_listeners = {}
end

function METHODS.AddCursorEventListener(self, typeName, fn)
  add_listener(FIELD[self].cursor_listeners, typeName, fn)
end

function METHODS.RemoveCursorEventListener(self, typeName, fn)
  remove_listener(FIELD[self].cursor_listeners, typeName, fn)
end

function METHODS.RemoveCursorEventListeners(self, typeName)
  remove_listener(FIELD[self].cursor_listeners, typeName, nil)
end

function METHODS.RemoveAllCursorEventListeners(self)
  FIELD[self].cursor_listeners = {}
end

function METHODS.SimulateCursorClick(self)
  local engine = FIELD[self].engine
  if engine then
    engine:emit_cursor(self, 'CursorDown', engine:make_cursor_data(0, 0))
    engine:emit_cursor(self, 'CursorUp', engine:make_cursor_data(0, 0))
    engine:emit_cursor(self, 'CursorClick', engine:make_cursor_data(0, 0))
  end
end

function METHODS.SetImage(self, source, id)
  local f = FIELD[self]
  f.imageSource = source
  f.imageId = id or 0
  f.imageType = nil
end

function METHODS.SetSoftEdgeWidth(self, x, y)
  local f = FIELD[self]
  f.softEdgeWidthX, f.softEdgeWidthY = x, y
end

function METHODS.SetFillUnused(self)
  local f = FIELD[self]
  f.enableFill, f.fillType = false, 'Unused'
end

local function fill_setter(fill_type, horizontal, vertical)
  return function(self)
    local f = FIELD[self]
    f.enableFill = true
    f.fillType = fill_type
    if horizontal then f.fillHorizontalType = horizontal end
    if vertical then f.fillVerticalType = vertical end
  end
end

METHODS.SetFillHorizontal = fill_setter('Horizontal', 'Left', nil)
METHODS.SetFillVertical = fill_setter('Vertical', nil, 'Bottom')
METHODS.SetFillRadial90 = fill_setter('Radial90', nil, nil)
METHODS.SetFillRadial180 = fill_setter('Radial180', nil, nil)
METHODS.SetFillRadial360 = fill_setter('Radial360', nil, nil)

function METHODS.PlayAnimation(self) end
function METHODS.StopAnimation(self) end

function METHODS.GetItemIndex(self, control) return nil end
function METHODS.GetItemSize(self) return 50, 50 end
function METHODS.GetItemSpacing(self) return 8, 8 end
function METHODS.GetPadding(self) return 20, 20, 20, 20 end
function METHODS.GetContentLength(self) return 0 end
function METHODS.ScrollToItemAt(self) return false end
function METHODS.RefreshItems(self, count, cb) return 0 end

--------------------------------------------------------------------------------
-- 4. 存档 → 控件 spec（照抄 studio/play/compile.js compileControl 的字段映射）
--------------------------------------------------------------------------------
local KIND_MAP = {
  container = 'container',
  ['server-container'] = 'container',
  textbox = 'textbox',
  image = 'image',
  button = 'button',
  cursor = 'cursor',
  grid = 'grid',
  reference = 'reference',
  textwindow = 'textwindow',
  keyhint = 'keyhint',
  animation = 'animation',
  fullscreen = 'fullscreen',
}

local function transform_of(node, platform)
  local map = node.transformByPlatform or {}
  return map[platform] or map.KEYBOARD or {}
end

local function vec(t, name, axis, default)
  local v = t[name]
  if type(v) ~= 'table' then return default end
  local got = v[axis]
  if type(got) ~= 'number' then return default end
  return got
end

-- 把存档节点编译成运行时 spec（字段名与 compile.js 一致）
local function compile_node(node, platform)
  local kind = KIND_MAP[node.kind] or 'container'
  local t = transform_of(node, platform)
  local spec = {
    kind = kind,
    name = node.name or '',
    active = node.active ~= false,
    visible = node.visible ~= false,
    prefabIndex = node.guid or 0,
    authoringId = node.id,
    anchoredPositionX = vec(t, 'offset', 'x', 0),
    anchoredPositionY = vec(t, 'offset', 'y', 0),
    sizeDeltaX = vec(t, 'size', 'x', 0),
    sizeDeltaY = vec(t, 'size', 'y', 0),
    anchorMinX = vec(t, 'anchorMin', 'x', 0.5),
    anchorMinY = vec(t, 'anchorMin', 'y', 0.5),
    anchorMaxX = vec(t, 'anchorMax', 'x', 0.5),
    anchorMaxY = vec(t, 'anchorMax', 'y', 0.5),
    pivotX = vec(t, 'pivot', 'x', 0.5),
    pivotY = vec(t, 'pivot', 'y', 0.5),
    localScaleX = vec(t, 'scale', 'x', 1),
    localScaleY = vec(t, 'scale', 'y', 1),
    localScaleZ = vec(t, 'scale', 'z', 1),
    localRotationX = vec(t, 'rotation', 'x', 0),
    localRotationY = vec(t, 'rotation', 'y', 0),
    localRotationZ = vec(t, 'rotation', 'z', 0),
    canControllerFocus = node.canControllerFocus == true,
    children = {},
  }
  if kind == 'container' then
    spec.isolateNavigation = node.isolateNavigation == true
    spec.disableKeyEventPassthrough = node.disableKeyEventPassthrough == true
    spec.disableCursorEventPassthrough = node.disableCursorEventPassthrough == true
    spec.showCursor = node.showCursor == true
  elseif kind == 'textbox' or kind == 'textwindow' then
    spec.text = node.text or ''
    spec.fontSize = node.fontSize
    spec.adaptiveFontSize = node.adaptiveFontSize == true
    spec.minimumFontSize = node.minimumFontSize
    spec.fontColor = node.fontColor
    spec.bgColor = node.bgColor
    spec.enableOutline = node.enableOutline ~= false
    spec.outlineColor = node.outlineColor
    spec.horizontalAlignment = node.horizontalAlignment or 'Left'
    spec.verticalAlignment = node.verticalAlignment or 'Top'
    if kind == 'textwindow' then
      spec.interactable = node.interactable ~= false
      spec.showScrollBar = node.showScrollBar ~= false
    end
  elseif kind == 'image' then
    spec.imageSource = node.imageSource
    spec.imageType = node.imageType
    spec.imageId = node.imageId or 0
    spec.imageColor = node.imageColor
    spec.raycastTarget = node.raycastTarget == true
    spec.enableMask = node.enableMask == true
    spec.enableSoftEdge = node.enableSoftEdge == true
    spec.softEdgeMode = node.softEdgeMode
    spec.softEdgeWidthX = node.softEdgeWidthX
    spec.softEdgeWidthY = node.softEdgeWidthY
    spec.horizontalSoftRange = node.horizontalSoftRange
    spec.verticalSoftRange = node.verticalSoftRange
    spec.enableFill = node.enableFill == true
    spec.fillType = node.enableFill and node.fillType or 'Unused'
    spec.fillHorizontalType = node.fillHorizontalType
    spec.fillVerticalType = node.fillVerticalType
    spec.fillRadial90Type = node.fillRadial90Type
    spec.fillRadialType = node.fillRadialType
    spec.fillAmount = node.fillAmount
    spec.reverseMaskArea = node.reverseMaskArea == true
  elseif kind == 'button' then
    spec.raycastTarget = node.raycastTarget ~= false
    spec.interactable = node.interactable ~= false
    spec.clickAudioId = node.clickAudioId
  elseif kind == 'cursor' then
    spec.raycastTarget = node.raycastTarget ~= false
  end
  for _, child in ipairs(node.children or {}) do
    spec.children[#spec.children + 1] = compile_node(child, platform)
  end
  return spec
end

--------------------------------------------------------------------------------
-- 5. 假引擎
--------------------------------------------------------------------------------
-- 编译缓存：同一个进程里跑 70 个用例时，main.lua + 27 个模块的 load() 不必重复做
-- （每例 ~50ms × 70 ≈ 3.5s）。只缓存**编译产物**，每次调用前用 debug.setupvalue 重绑 _ENV，
-- 模块返回的表仍然每例重新执行得到（模块内状态不跨例共享，与模拟器每例新运行时一致）。
local CHUNK_CACHE = {}

local function compile_into(source, name, env)
  local entry = CHUNK_CACHE[name]
  if entry and entry.source == source then
    -- 用字节码重载：每次都能把 _ENV 绑到**本用例**的环境（复用同一个函数再
    -- debug.setupvalue 会漏掉 'b' 之外的情形，实测在 51/57 上产生跨例串味）
    local chunk = load(entry.bytecode, '@' .. name, 'b', env)
    if chunk then return chunk end
  end
  local chunk, err = load(source, '@' .. name, 't', env)
  if not chunk then return nil, err end
  local ok, bytecode = pcall(string.dump, chunk)
  if ok and type(bytecode) == 'string' then
    CHUNK_CACHE[name] = { source = source, bytecode = bytecode }
  end
  return chunk
end

M.reset_chunk_cache = function() CHUNK_CACHE = {} end

local function read_file(path)
  local fh = io.open(path, 'rb')
  if not fh then return nil, 'cannot open ' .. path end
  local text = fh:read('a')
  fh:close()
  if text and text:sub(1, 3) == '\239\187\191' then text = text:sub(4) end
  return text
end

local function dirname(path)
  return path:match('^(.*)/[^/]*$') or '.'
end
M.dirname = dirname

local function guid_map(save)
  local out = {}
  local function walk(node)
    if not node then return end
    if node.name and type(node.guid) == 'number' then out[node.name] = node.guid end
    for _, child in ipairs(node.children or {}) do walk(child) end
  end
  walk(save and save.assets and save.assets.client and save.assets.client.root)
  return out
end

local function substitute_guids(text, guids)
  local map = {
    { '__GUID_CELL__', guids.cell },
    { '__GUID_HIT__', guids.hit },
    { '__GUID_SETTLE__', guids.settle },
    { '__GUID_STEXT__', guids.stext },
  }
  for _, pair in ipairs(map) do
    if pair[2] then
      text = text:gsub(pair[1]:gsub('%W', '%%%0'), tostring(pair[2]))
    end
  end
  return text
end

local Engine = {}
Engine.__index = Engine

--[[ 新建一个假引擎。
     spec = { save = <已解析的 tetris.save.json>, canvas_id = 'mobile-16-9',
              project_root = '/path/to/tetris', main_script = 'lua/main.lua' } ]]
function M.new(spec)
  spec = spec or {}
  local canvas_id = spec.canvas_id or M.DEFAULT_CANVAS
  local preset = CANVAS_PRESETS[canvas_id]
  if not preset then
    error(string.format('engine_shim: unknown canvasId %q（支持：%s）', tostring(canvas_id),
      (function()
        local keys = {}
        for k in pairs(CANVAS_PRESETS) do keys[#keys + 1] = k end
        table.sort(keys)
        return table.concat(keys, ', ')
      end)()), 3)
  end
  local self = setmetatable({}, Engine)
  self.canvas_id = canvas_id
  self.canvas = { w = preset.width, h = preset.height }
  self.device = preset.device
  self.platform = preset.platform
  self.project_root = spec.project_root or '.'
  self.main_script = spec.main_script or 'lua/main.lua'
  self.save = spec.save
  self.guids = spec.save and guid_map(spec.save) or {}
  self.enums = build_enums()
  self.clock = { time = 0, frame = 0 }
  self.logs = {}
  self.log_texts = {}
  self.errors = {}
  self.error_seen = {}
  self.audio = {}
  self.outbound = {}
  self.inbound = {}
  self.stats = { created = 0, destroyed = 0, live = 0 }
  self.by_id = {}
  self.next_id = 1
  self.cursor = { x = 0, y = 0, press = nil, dragging = false, hover = nil, down = nil }
  self.focus = nil
  self.paused = false
  self.phase = 'idle'
  self.script_update = false
  self.require_cache = {}
  self.template_specs = {}
  self.warnings = {}

  if not self.save then
    error('engine_shim: spec.save 必须是已解析的 tetris.save.json（run_cases 会传）', 3)
  end

  -- 源码来源：repo = 仓库当前 lua/（默认，跟踪 lead 的重构）；save = 存档内嵌源码
  -- （= 模拟器实际运行的那一份，用来和 node qxqy/runner.mjs 做同源交叉对照）
  self.source_mode = spec.source_mode or 'repo'
  self.save_sources = {}
  if self.source_mode == 'save' then
    for _, script in ipairs((self.save.assets and self.save.assets.scripts) or {}) do
      local path = script.path or ''
      if script.source then
        self.save_sources[self:normalize_require_path(path)] = script.source
      end
    end
  end

  -- 模板表：guid → 编译后 spec（惰性？容器模板要深拷贝，这里先编译一次缓存）
  local client_root = self.save.assets and self.save.assets.client and self.save.assets.client.root
  if not client_root then error('engine_shim: save 缺 assets.client.root', 3) end
  for _, node in ipairs(client_root.children or {}) do
    if type(node.guid) == 'number' and node.guid > 0 then
      self.template_specs[node.guid] = compile_node(node, self.platform)
    end
  end

  -- 服务端控件树（脚本宿主 = 挂载点那条脚本记录的 controlId）
  local server_root = self.save.assets and self.save.assets.server and self.save.assets.server.root
  if not server_root then error('engine_shim: save 缺 assets.server.root', 3) end
  local mount_id = nil
  for _, script in ipairs((self.save.assets and self.save.assets.scripts) or {}) do
    if script.path == self.main_script and script.controlId and script.controlId ~= '' then
      mount_id = script.controlId
      break
    end
  end
  self.mount_id = mount_id
  local node_index = {}
  local function index_nodes(node)
    if not node then return end
    if node.id then node_index[node.id] = node end
    for _, child in ipairs(node.children or {}) do index_nodes(child) end
  end
  index_nodes(server_root)

  -- 先建环境/控件工厂（create_from_spec 依赖 self.new_control），再建树
  self:build_env()

  local root_spec = compile_node(server_root, self.platform)
  self.server_root = self:create_from_spec(root_spec, nil, 0)
  self.roots = { self.server_root }

  self.script_root = nil
  if mount_id then
    self.script_root = self:find_by_authoring_id(self.server_root, mount_id)
  end
  if not self.script_root then
    -- 兜底：第一个 container 子节点（n1）
    local first = FIELD[self.server_root].children[1]
    self.script_root = first or self.server_root
    self.warnings[#self.warnings + 1] =
      'save 里没有找到 ' .. self.main_script .. ' 的挂载控件（controlId），回退到首个子控件'
  end

  self.script.object = self.script_root   -- 树建好后回填宿主控件
  return self
end

function Engine:build_env()
  local self_ = self
  local enums = self.enums

  local function new_control(kind, spec, authoring_id)
    local c = setmetatable({}, CONTROL_MT)
    local f = {
      engine = self_,
      kind = kind,
      typeof = TYPEOF[kind] or TYPEOF.container,
      alive = true,
      Id = self_.next_id,
      prefabIndex = spec.prefabIndex or 0,
      authoringId = authoring_id or spec.authoringId,
      name = spec.name or '',
      active = spec.active ~= false,
      visible = spec.visible ~= false,
      parent = nil,
      children = {},
      key_listeners = {},
      cursor_listeners = {},
      scripts = {},
      anchoredPositionX = spec.anchoredPositionX or 0,
      anchoredPositionY = spec.anchoredPositionY or 0,
      sizeDeltaX = spec.sizeDeltaX or 0,
      sizeDeltaY = spec.sizeDeltaY or 0,
      anchorMinX = spec.anchorMinX or 0.5,
      anchorMinY = spec.anchorMinY or 0.5,
      anchorMaxX = spec.anchorMaxX or 0.5,
      anchorMaxY = spec.anchorMaxY or 0.5,
      pivotX = spec.pivotX or 0.5,
      pivotY = spec.pivotY or 0.5,
      localScaleX = spec.localScaleX or 1,
      localScaleY = spec.localScaleY or 1,
      localScaleZ = spec.localScaleZ or 1,
      localRotationX = spec.localRotationX or 0,
      localRotationY = spec.localRotationY or 0,
      localRotationZ = spec.localRotationZ or 0,
      canControllerFocus = spec.canControllerFocus == true,
    }
    if kind == 'container' then
      f.isolateNavigation = spec.isolateNavigation == true
      f.disableKeyEventPassthrough = spec.disableKeyEventPassthrough == true
      f.disableCursorEventPassthrough = spec.disableCursorEventPassthrough == true
      f.showCursor = spec.showCursor == true
    elseif kind == 'textbox' or kind == 'textwindow' then
      f.text = spec.text or ''
      f.fontSize = spec.fontSize or 20
      f.fontColor = to_signed32(spec.fontColor or 4294967295)
      f.bgColor = to_signed32(spec.bgColor or 0)
      f.enableOutline = spec.enableOutline ~= false
      f.outlineColor = to_signed32(spec.outlineColor or 0)
      f.horizontalAlignment = spec.horizontalAlignment or 'Left'
      f.verticalAlignment = spec.verticalAlignment or 'Top'
      f.adaptiveFontSize = spec.adaptiveFontSize == true
      f.minimumFontSize = spec.minimumFontSize or 10
      if kind == 'textwindow' then
        f.interactable = spec.interactable ~= false
        f.showScrollBar = spec.showScrollBar ~= false
      end
    elseif kind == 'image' then
      f.imageSource = spec.imageSource
      f.imageId = spec.imageId or 0
      f.imageColor = to_signed32(spec.imageColor or 4294967295)
      f.imageType = spec.imageType
      f.raycastTarget = spec.raycastTarget == true
      f.enableMask = spec.enableMask == true
      f.enableSoftEdge = spec.enableSoftEdge == true
      f.softEdgeMode = spec.softEdgeMode or 'Percentage'
      f.softEdgeWidthX = spec.softEdgeWidthX or 8
      f.softEdgeWidthY = spec.softEdgeWidthY or 8
      f.horizontalSoftRange = spec.horizontalSoftRange or 85
      f.verticalSoftRange = spec.verticalSoftRange or 85
      f.enableFill = spec.enableFill == true
      f.fillType = spec.fillType or 'Unused'
      f.fillHorizontalType = spec.fillHorizontalType or 'Left'
      f.fillVerticalType = spec.fillVerticalType or 'Bottom'
      f.fillRadial90Type = spec.fillRadial90Type or 'BottomLeft'
      f.fillRadialType = spec.fillRadialType or 'Bottom'
      f.reverseMaskArea = spec.reverseMaskArea == true
      f.fillAmount = spec.fillAmount or 1
    elseif kind == 'button' then
      f.interactable = spec.interactable ~= false
      f.raycastTarget = spec.raycastTarget ~= false
      f.clickAudioId = spec.clickAudioId or 0
      f.pressed = false
    elseif kind == 'cursor' then
      f.raycastTarget = spec.raycastTarget ~= false
    end
    FIELD[c] = f
    self_.next_id = self_.next_id + 1
    self_.by_id[f.Id] = c
    return c
  end

  self.new_control = new_control

  local function new_enum_item(type_name, name)
    local group = enums[type_name]
    return group and group[name] or nil
  end

  -- ===== game =====
  local game = {}
  function game.InstantiateClientUIControl(prefab_index, parent)
    local guid = tonumber(prefab_index)
    if not guid then return nil end
    local template = self.template_specs[guid]
    if not template then return nil end
    if self.phase == 'OnInit' or self.phase == 'OnDestroy' then return nil end
    if parent == nil then return nil end
    return self:create_from_spec(template, parent, 0)
  end

  function game.DestroyClientUIControl(control)
    self:destroy(control)
  end

  function game.GetClientUIControl(id)
    return self.by_id[tonumber(id) or -1]
  end

  function game.FindClientUIRoot(name)
    for _, root in ipairs(self.roots) do
      if FIELD[root].name == name then return root end
    end
    return nil
  end

  function game.GetClientUIRoots()
    local out = {}
    for i, root in ipairs(self.roots) do out[i] = root end
    return out
  end

  function game.GetUICanvasSize()
    -- 模拟器里 canvasWidth/Height 是 JS number ⇒ Lua 侧读到的是 **float**（tostring → "1600.0"）。
    -- 这里保持同形态：整数会改变 `tostring(W)` 类日志文本（main.lua 的 `canvas 1600.0x900.0`）。
    return self.canvas.w + 0.0, self.canvas.h + 0.0
  end

  function game.GetCursorUIPos()
    return self.cursor.x, self.cursor.y
  end

  function game.GetDevice()
    return new_enum_item('Device', self.device)
  end

  function game.SetControllerFocus(control)
    self.focus = control
  end

  function game.GetControllerFocus()
    return self.focus
  end

  function game.GetControllerLeftStickAxis()
    return 0, 0
  end

  function game.GetControllerRightStickAxis()
    return 0, 0
  end

  function game.ServerSignal(name)
    local signal_name = tostring(name)
    local signal = { name = signal_name, alive = true }
    local function note()
      self_.outbound[#self_.outbound + 1] = { name = signal_name, values = {} }
      return true
    end
    function signal:SendSignal() return note() end
    function signal:SendSend() return note() end
    return signal
  end

  function game.PlayAudio2D(audio_id)
    local id = tonumber(audio_id) or 0
    self.audio_seq = (self.audio_seq or 0) + 1
    self.audio[#self.audio + 1] = {
      audioId = id, startedAt = self.clock.time, alive = true, seq = self.audio_seq,
    }
    return id
  end

  function game.StopAudio(audio_id)
    local id = tonumber(audio_id)
    for i = #self.audio, 1, -1 do
      if self.audio[i].audioId == id then self.audio[i].alive = false end
    end
  end

  function game.IsAudioAlive(audio_id)
    local id = tonumber(audio_id)
    for _, row in ipairs(self.audio) do
      if row.audioId == id and row.alive then return true end
    end
    return false
  end

  function game.PauseLevelTime(v)
    self.paused = v and true or false
  end

  function game.IsLevelTimePaused()
    return self.paused
  end

  function game.GetGlobalCustomVariableValue(entity_type, name)
    return nil
  end

  function game.GetLanguageType()
    return new_enum_item('LanguageType', 'LanguageChs')
  end

  function game.GetStageMode()
    return new_enum_item('StageMode', 'Beyond')
  end

  function game.IsTestPlay()
    return true
  end

  function game.GetText(id)
    return tostring(id)
  end

  function game.PrintClientUITree()
    for _, root in ipairs(self.roots) do
      self:log('info', 'root ' .. tostring(FIELD[root].name))
    end
  end

  -- ===== script =====
  local script = {
    object = self.script_root,
    path = self.main_script,
    alive = true,
    enabled = true,
    scriptMappingId = 1,
  }
  function script:EnableUpdate(v)
    self_.script_update = v and true or false
  end

  function script:GetParam(name) return nil end

  -- ===== 环境 =====
  local env = setmetatable({}, { __index = _G })
  env._G = env
  env.game = game
  env.script = script
  env.Enum = enums
  env.typeof = function(v)
    if type(v) == 'table' then
      local f = FIELD[v]
      if f then return f.typeof end
    end
    return type(v)
  end
  env.print = function(...)
    local n = select('#', ...)
    local parts = {}
    for i = 1, n do
      local v = select(i, ...)
      parts[i] = tostring(v)
    end
    self:log('info', table.concat(parts, '\t'))
  end
  env.require = function(name) return self:require_script(name) end

  self.env = env
  self.game = game
  self.script = script
end

function Engine:create_from_spec(spec, parent, depth)
  local control = self.new_control(spec.kind or 'container', spec, depth == 0 and spec.authoringId or nil)
  if parent then attach_child(parent, control) end
  self.stats.created = self.stats.created + 1
  self.stats.live = self.stats.live + 1
  for _, child_spec in ipairs(spec.children or {}) do
    self:create_from_spec(child_spec, control, depth + 1)
  end
  return control
end

function Engine:destroy(control)
  if control == nil then return false end
  local f = FIELD[control]
  if not f or not f.alive then return false end
  local function kill(c)
    local cf = FIELD[c]
    if not cf or not cf.alive then return end
    for i = #cf.children, 1, -1 do kill(cf.children[i]) end
    cf.alive = false
    cf.children = {}
    cf.key_listeners = {}
    cf.cursor_listeners = {}
    self.by_id[cf.Id] = nil
    self.stats.destroyed = self.stats.destroyed + 1
    self.stats.live = self.stats.live - 1
  end
  remove_from_parent(control)
  kill(control)
  return true
end

function Engine:find_by_authoring_id(control, authoring_id)
  local f = FIELD[control]
  if f.authoringId == authoring_id then return control end
  for i = 1, #f.children do
    local hit = self:find_by_authoring_id(f.children[i], authoring_id)
    if hit then return hit end
  end
  return nil
end

-- 递归按 name 找控件（对应断言 findControl 的 walkTree）
function Engine:find(name, control)
  if control then
    local f = FIELD[control]
    if f.name == name then return control end
    for i = 1, #f.children do
      local hit = self:find(name, f.children[i])
      if hit then return hit end
    end
    return nil
  end
  for i = #self.roots, 1, -1 do
    local hit = self:find(name, self.roots[i])
    if hit then return hit end
  end
  return nil
end

function Engine:log(level, text)
  self.logs[#self.logs + 1] = { level = level, text = text, time = self.clock.time }
  self.log_texts[#self.log_texts + 1] = text
end

function Engine:record_error(where, err)
  local message = tostring(err)
  self.errors[#self.errors + 1] = { where = where, message = message, time = self.clock.time }
  if not self.error_seen[message] then
    self.error_seen[message] = true
    self:log('lua-error', where .. ': ' .. message)
  end
end

-- ===== require 映射（照抄 runtime.normalizeRequirePath + requireAliases） =====
function Engine:normalize_require_path(path)
  local p = tostring(path):gsub('\\', '/')
  if p:sub(-4) == '.lua' then p = p:sub(1, -5) end
  p = p:gsub('%.', '/')
  return p
end

function Engine:require_script(raw)
  local normalized = self:normalize_require_path(raw)
  local key = normalized
  if key:sub(1, 20) == 'default_import_file/' then key = key:sub(21) end
  local cached = self.require_cache[key]
  if cached ~= nil then return cached end

  local file, source
  if self.source_mode == 'save' then
    source = self.save_sources[key]
    if not source then
      error(string.format("failed to load script '%s'（存档 scripts[] 里没有这条）", tostring(raw)), 0)
    end
    file = key
  else
    local candidates = {
      self.project_root .. '/' .. key .. '.lua',
      self.project_root .. '/lua/tetris/' .. (key:match('([^/]+)$') or key) .. '.lua',
    }
    for _, path in ipairs(candidates) do
      local fh = io.open(path, 'rb')
      if fh then fh:close() file = path break end
    end
    if not file then
      error(string.format("failed to load script '%s'", tostring(raw)), 0)
    end
    source = read_file(file)
    if not source then error('read error: ' .. tostring(file), 0) end
  end
  source = substitute_guids(source, self.guids)
  -- 模块环境：有自己的全局表，读回落到引擎环境（沙箱里模块看不到 main 的全局）
  local module_env = setmetatable({}, { __index = self.env })
  module_env._G = module_env
  local chunk, compile_err = compile_into(source, file, module_env)
  if not chunk then
    error(string.format("failed to load script '%s': %s", tostring(raw), tostring(compile_err)), 0)
  end
  local ok, result = pcall(chunk)
  if not ok then
    error(string.format("failed to load script '%s': %s", tostring(raw), tostring(result)), 0)
  end
  if result == nil then result = true end
  self.require_cache[key] = result
  return result
end

-- ===== 生命周期 =====
function Engine:load_main()
  self.phase = 'OnInit'
  local source, read_err
  if self.source_mode == 'save' then
    source = self.save_sources[self:normalize_require_path(self.main_script)]
    if not source then return '存档里没有 ' .. self.main_script .. ' 的源码（scripts[] 缺这条）' end
  else
    source, read_err = read_file(self.project_root .. '/' .. self.main_script)
    if not source then return 'read error: ' .. tostring(read_err) end
  end
  source = substitute_guids(source, self.guids)
  local chunk, compile_err = compile_into(source, self.main_script, self.env)
  if not chunk then
    return 'compile error: ' .. tostring(compile_err)
      .. '（若大面积红：先跑 luac5.3 -p lua/main.lua，确认不是读到半写入的文件）'
  end
  local ok, chunk_err = pcall(chunk)
  if not ok then return 'chunk error: ' .. tostring(chunk_err) end

  local phases = { 'OnInit', 'OnEnable', 'OnStart' }
  for _, phase in ipairs(phases) do
    self.phase = phase
    local fn = self.env[phase]
    if type(fn) == 'function' then
      local okp, err = pcall(fn)
      if not okp then self:record_error(phase, err) end
    end
  end
  self.phase = 'running'
  return nil
end

function Engine:step(dt)
  self.clock.frame = self.clock.frame + 1
  self.clock.time = self.clock.time + dt
  local fn = self.env.OnUpdate
  if type(fn) == 'function' and self.script_update then
    local ok, err = pcall(fn, dt)
    if not ok then self:record_error('OnUpdate', err) end
  end
end

function Engine:destroy_script()
  self.phase = 'OnDestroy'
  local fn = self.env.OnDestroy
  if type(fn) == 'function' and self.script_update then
    local ok, err = pcall(fn)
    if not ok then self:record_error('OnDestroy', err) end
  end
  self.phase = 'idle'
end

-- ===== 输入 =====
local function dispatch_key(control, type_name)
  local f = FIELD[control]
  if not f or not f.alive or not active_in_hierarchy(control) then return false end
  local list = f.key_listeners and f.key_listeners[type_name]
  if list then
    for i = 1, #list do
      local ret = list[i]()
      if ret == true then return true end
    end
  end
  for i = 1, #f.children do
    if dispatch_key(f.children[i], type_name) then return true end
  end
  return false
end

function Engine:key(type_name)
  local name = normalize_event_name(type_name) or tostring(type_name)
  local known = self.enums.KeyEventType and self.enums.KeyEventType[name] ~= nil
  local handled = false
  for i = 1, #self.roots do
    if dispatch_key(self.roots[i], name) then handled = true break end
  end
  return handled, known
end

function Engine:make_cursor_data(x, y, opts)
  opts = opts or {}
  local press = opts.press or { x = x, y = y }
  local previous = opts.previous or { x = x, y = y }
  local data = {
    dragging = opts.dragging == true,
    touchId = 0,
  }
  function data:GetUIPos() return x, y end
  function data:GetPressUIPos() return press.x, press.y end
  function data:GetUIPosDelta() return x - previous.x, y - previous.y end
  return data
end

local function cursor_enabled(control)
  local cur = control
  while cur do
    local f = FIELD[cur]
    if not f then break end
    if f.kind == 'container' and f.showCursor == true then return true end
    cur = f.parent
  end
  return false
end

function Engine:emit_cursor(control, type_name, data)
  if not cursor_enabled(control) then return false end
  local f = FIELD[control]
  if not f or not f.alive then return false end
  local list = f.cursor_listeners and f.cursor_listeners[type_name]
  if not list or #list == 0 then return false end
  for i = 1, #list do list[i](data) end
  return true
end

-- 命中矩形：左=父左+anchorMin*父宽+offset−sizeDelta*pivot（同 studio/ui/layout.js computeRect，
-- 默认 anchor 0.5 / pivot 0.5）
local function control_box(control, parent_box)
  local f = FIELD[control]
  local pw, ph = parent_box.w, parent_box.h
  local size_x = f.sizeDeltaX or 0
  local size_y = f.sizeDeltaY or 0
  local width = ((f.anchorMaxX or 0.5) - (f.anchorMinX or 0.5)) * pw + size_x
  local height = ((f.anchorMaxY or 0.5) - (f.anchorMinY or 0.5)) * ph + size_y
  local left = parent_box.x + (f.anchorMinX or 0.5) * pw + (f.anchoredPositionX or 0)
    - size_x * (f.pivotX or 0.5)
  local bottom = parent_box.y + (f.anchorMinY or 0.5) * ph + (f.anchoredPositionY or 0)
    - size_y * (f.pivotY or 0.5)
  return { x = left, y = bottom, w = width, h = height }
end

local function accepts_pointer(control)
  local f = FIELD[control]
  if f.kind == 'button' then return f.raycastTarget ~= false and f.interactable ~= false end
  if f.kind == 'cursor' or f.kind == 'grid' then return f.raycastTarget ~= false end
  if f.kind == 'textwindow' then return f.interactable ~= false end
  return f.raycastTarget == true
end

local function recurses_into(control)
  local kind = FIELD[control].kind
  return kind == 'container' or kind == 'grid' or kind == 'textwindow'
    or kind == 'reference' or kind == 'button'
end

local function subtree_can_hit(control, memo)
  local hit = memo[control]
  if hit ~= nil then return hit end
  hit = accepts_pointer(control)
  if not hit and recurses_into(control) then
    for i = 1, #FIELD[control].children do
      if subtree_can_hit(FIELD[control].children[i], memo) then hit = true break end
    end
  end
  memo[control] = hit
  return hit
end

function Engine:hit_test(x, y)
  local memo = {}
  local function rec(control, parent_box, parent_active)
    local f = FIELD[control]
    if not parent_active or not f.active or not f.visible then return nil end
    if not subtree_can_hit(control, memo) then return nil end
    local box = control_box(control, parent_box)
    if x < box.x or x > box.x + box.w or y < box.y or y > box.y + box.h then return nil end
    if recurses_into(control) then
      for i = 1, #f.children do
        local hit = rec(f.children[i], box, true)
        if hit then return hit end
      end
    end
    if accepts_pointer(control) then return control end
    return nil
  end
  local canvas_box = { x = 0, y = 0, w = self.canvas.w, h = self.canvas.h }
  for i = #self.roots, 1, -1 do
    local hit = rec(self.roots[i], canvas_box, true)
    if hit then return hit end
  end
  return nil
end

function Engine:pointer(kind, x, y)
  self.cursor.x = x
  self.cursor.y = y
  if kind == 'down' then
    local hit = self:hit_test(x, y)
    self.cursor.down = hit
    self.cursor.press = { x = x, y = y }
    self.cursor.last = { x = x, y = y }
    self.cursor.dragging = false
    if hit then
      local f = FIELD[hit]
      if f.kind == 'button' then f.pressed = true end
      self:emit_cursor(hit, 'CursorDown', self:make_cursor_data(x, y))
    end
    return hit
  elseif kind == 'move' then
    local previous = self.cursor.last or { x = x, y = y }
    local hover = self:hit_test(x, y)
    local prev_hover = self.cursor.hover
    if prev_hover and prev_hover ~= hover then
      self:emit_cursor(prev_hover, 'CursorExit', self:make_cursor_data(x, y, { previous = previous }))
    end
    if hover and prev_hover ~= hover then
      self:emit_cursor(hover, 'CursorEnter', self:make_cursor_data(x, y, { previous = previous }))
    end
    self.cursor.hover = hover
    local down = self.cursor.down
    if down and FIELD[down].alive then
      local press = self.cursor.press or previous
      local moved = (x - press.x) * (x - press.x) + (y - press.y) * (y - press.y) > 25
      if not self.cursor.dragging and moved then
        self:emit_cursor(down, 'CursorBeginDrag', self:make_cursor_data(x, y, { press = press, previous = previous }))
        self.cursor.dragging = true
      end
      if self.cursor.dragging then
        self:emit_cursor(down, 'CursorDrag', self:make_cursor_data(x, y, { press = press, previous = previous, dragging = true }))
      end
    end
    self.cursor.last = { x = x, y = y }
    return hover
  elseif kind == 'up' then
    local down = self.cursor.down
    local hit = self:hit_test(x, y)
    if down and FIELD[down].alive then
      local data = self:make_cursor_data(x, y, {
        press = self.cursor.press, previous = self.cursor.last, dragging = self.cursor.dragging,
      })
      self:emit_cursor(down, 'CursorUp', data)
      if self.cursor.dragging then
        self:emit_cursor(down, 'CursorEndDrag', data)
      elseif hit == down then
        self:emit_cursor(down, 'CursorClick', data)
      end
      if FIELD[down].kind == 'button' then FIELD[down].pressed = false end
    end
    self.cursor.down = nil
    self.cursor.press = nil
    self.cursor.last = { x = x, y = y }
    self.cursor.dragging = false
    return hit
  end
  error('engine_shim: unknown pointer kind ' .. tostring(kind))
end

function Engine:click(name)
  local control = self:find(name)
  if control and accepts_pointer(control) then
    local kind = FIELD[control].kind
    if kind == 'button' or kind == 'cursor' then
      self:emit_cursor(control, 'CursorDown', self:make_cursor_data(0, 0))
      self:emit_cursor(control, 'CursorUp', self:make_cursor_data(0, 0))
      self:emit_cursor(control, 'CursorClick', self:make_cursor_data(0, 0))
      return true
    end
  end
  return false
end

-- ===== 断言取值（对应 studio/play/session.js controlSnapshot 的字段面）=====
local SNAPSHOT_FIELDS = {
  kind = true, typeofName = true, name = true, active = true, visible = true,
  activeInHierarchy = true, prefabId = true, authoringId = true,
  anchoredPositionX = true, anchoredPositionY = true, sizeDeltaX = true, sizeDeltaY = true,
  localScaleX = true, localScaleY = true, localScaleZ = true,
  localRotationX = true, localRotationY = true, localRotationZ = true,
  text = true, fontSize = true, fontColor = true, bgColor = true, enableOutline = true,
  outlineColor = true, adaptiveFontSize = true, minimumFontSize = true,
  imageId = true, imageSource = true, imageType = true, imageColor = true,
  enableMask = true, enableSoftEdge = true, softEdgeMode = true,
  softEdgeWidthX = true, softEdgeWidthY = true, horizontalSoftRange = true,
  verticalSoftRange = true, enableFill = true, fillType = true, fillHorizontalType = true,
  fillVerticalType = true, fillRadial90Type = true, fillRadialType = true, reverseMaskArea = true,
  fillAmount = true, interactable = true, raycastTarget = true, pressed = true,
}

-- 文字排版派生量：与引擎 studio/play/text-layout.js **同公式**（保守折行：多字节=1em、ASCII=0.55em）
-- 为什么在 shim 里算：模拟器把 textLayout 挂上了 play 树（2026-10-31），headless 若不算，
-- 同一批 `control field="textLayout.fits"` 断言在两条通道上就会分叉。
local function text_metrics(control)
  local f = FIELD[control]
  local text = tostring(f.text or '')
  local font = tonumber(f.fontSize) or 16
  local w = tonumber(f.sizeDeltaX) or 0
  local h = tonumber(f.sizeDeltaY) or 0
  local lines, cur = 1, 0
  local i = 1
  while i <= #text do
    local b = string.byte(text, i)
    local len = 1
    if b >= 0xF0 then len = 4 elseif b >= 0xE0 then len = 3 elseif b >= 0xC0 then len = 2 end
    local ch = string.sub(text, i, i + len - 1)
    if ch == '\n' then
      lines = lines + 1
      cur = 0
    else
      local adv = ((len > 1) and 1 or 0.55) * font
      if w > 0 and cur > 0 and cur + adv > w then
        lines = lines + 1
        cur = adv
      else
        cur = cur + adv
      end
    end
    i = i + len
  end
  local required = 1.2 * font * lines + (0.25 * font + 4)
  local fits = (w > 0) and (h >= required)
  return { fits = fits, requiredHeight = required, lines = lines,
    visibleLineCount = fits and lines or 0, width = w, height = h }
end

function Engine:field_of(control, key)
  local f = FIELD[control]
  if not f then return nil end
  if key == 'id' then return f.Id end
  if key == 'kind' then return f.kind end
  if key == 'typeofName' then return f.typeof end
  if key == 'prefabId' then return f.prefabIndex end
  if key == 'authoringId' then return f.authoringId end
  if key == 'activeInHierarchy' then return active_in_hierarchy(control) end
  -- textLayout / textLayout.<子字段>（模拟器 play 树自 2026-10-31 起平铺提供）
  if key == 'textLayout' or key:sub(1, 11) == 'textLayout.' then
    if f.kind ~= 'textbox' and f.kind ~= 'textwindow' then return nil end
    local tl = text_metrics(control)
    local sub = key:sub(12)
    if sub == '' then return tl end
    return tl[sub], tl[sub] == nil and 'unsupported-field' or nil
  end
  if not SNAPSHOT_FIELDS[key] then return nil, 'unsupported-field' end
  local value = f[key]
  if COLOR_FIELDS[key] then return to_signed32(value) end
  if key == 'fontSize' and f.kind ~= 'textbox' and f.kind ~= 'textwindow' then return nil end
  if key == 'text' and f.kind ~= 'textbox' and f.kind ~= 'textwindow' then return nil end
  return value
end

function Engine:audio_ids()
  local out = {}
  for i, row in ipairs(self.audio) do out[i] = row.audioId end
  return out
end

M.Engine = Engine
return M
