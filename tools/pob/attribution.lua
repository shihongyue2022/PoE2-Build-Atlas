-- PoB v0.23.1 isolated, read-only per-line counterfactual calculation.
package.path = './lua/?.lua;./lua/?/init.lua;' .. package.path
package.cpath = './?.dll;' .. package.cpath
arg = {}
local json = require('dkjson')
local originalOpen = io.open
local function read(path)
 local file = assert(originalOpen(path, 'rb'))
 local text = file:read('*a'); file:close(); return text
end
local request = assert(json.decode(read(WB_REQUEST)))
-- Never consult an installed user's settings, account responses, or shared items.
io.open = function(name, mode)
 local lower = name:lower()
 if lower:find('settings.xml',1,true) or lower:find('poe_api_response',1,true) then return nil,'disabled in isolated calculator' end
 return originalOpen(name,mode)
end
io.read = function() error('Headless startup failed') end
local wrapper = read(WB_WRAPPER):gsub('^#[^\n]*\n','')
local replacements
wrapper,replacements = wrapper:gsub('return PCall%(func, %.%.%.%)', [[
 local object = func(...)
 if fileName == 'Modules/Main.lua' then
  object.LoadSettings = function() end
  object.SaveSettings = function() end
  object.LoadSharedItems = function() end
  object.ChangeUserPath = function(self)
   self.userPath = WB_REQUEST:gsub(string.char(92),'/'):match('^(.*[/])')
   self.defaultBuildPath = self.userPath .. 'Builds/'
   self.buildPath = self.defaultBuildPath
  end
 end
 return nil, object
]])
assert(replacements == 1, 'Headless wrapper version mismatch')
assert(loadstring(wrapper,'OfficialHeadlessWrapper'))()
assert(build, 'PoB initialization failed')
loadBuildFromXML(request.xml)
assert(not launch.promptMsg, 'Native PoB could not load the supplied build')
assert(build.targetVersion == liveTargetVersion, 'Build requires conversion in PoB2 first')
local setId = tonumber(request.skill.setId)
assert(build.skillsTab.skillSets[setId], 'Skill set not found')
build.skillsTab:SetActiveSkillSet(setId,true)
local itemSet = tonumber(request.itemSetId)
assert(build.itemsTab.itemSets[itemSet], 'Equipment set not found')
build.itemsTab:SetActiveItemSet(itemSet,true)
build.itemsTab.activeItemSet.useSecondWeaponSet = request.secondWeapons == true
local group = assert(build.skillsTab.socketGroupList[request.skill.group], 'Skill group not found')
assert(group.enabled ~= false, 'Selected skill group is disabled')
local selectedGem
for _,gem in ipairs(group.gemList) do
 local effect = gem.grantedEffect or gem.gemData and gem.gemData.grantedEffect
 if effect and not effect.support then
  if gem.nameSpec == request.skill.name and (request.skill.id == '' or gem.gemData and gem.gemData.gameId == request.skill.id or gem.skillId == request.skill.id or effect.id == request.skill.id) then
   assert(gem.enabled ~= false, 'Selected gem is disabled')
   selectedGem = gem
  end
 end
end
assert(selectedGem, 'Exact selected gem not found')
for _,index in ipairs(request.excludedGroups or {}) do
 if index ~= request.skill.group and build.skillsTab.socketGroupList[index] then build.skillsTab.socketGroupList[index].enabled = false end
end
build.mainSocketGroup = request.skill.group
build.calcsTab:BuildOutput()
-- Preserve the saved component of a multi-effect gem. If another gem in the
-- same socket group was selected, use the native active-skill list to switch.
if build.calcsTab.mainEnv.player.mainSkill.activeEffect.srcInstance ~= selectedGem then
 local index,found = 0,false
 for _,active in ipairs(build.calcsTab.mainEnv.player.activeSkillList) do
  if active.socketGroup == group then
   index=index+1
   if active.activeEffect.srcInstance == selectedGem then group.mainActiveSkill=index; found=true; break end
  end
 end
 assert(found,'Selected gem is not active for this weapon set')
 build.calcsTab:BuildOutput()
end
local calcs = build.calcsTab.calcs
local metric
local function calculate(override)
 if wipeGlobalCache then wipeGlobalCache() end
 local env = calcs.initEnv(build,'CALCULATOR',override or {})
 calcs.perform(env)
 local actor = env.minion or env.player
 local out = actor.output
 local skill = actor.mainSkill
 local effect = skill and skill.activeEffect and skill.activeEffect.grantedEffect
 metric = metric or (type(out.CombinedDPS) == 'number' and 'CombinedDPS' or 'TotalDPS')
 local value = out[metric]
 assert(type(value) == 'number' and value == value and value >= 0 and value < 1e15, 'Invalid DPS result')
 return value,effect and effect.id or ''
end
local baseline,skillId = calculate()
assert(baseline > 0, 'Selected skill has no positive damage baseline')
local rows = {}
local itemTotals = {}
local groups = {'implicitModLines','explicitModLines','enchantModLines','runeModLines','buffModLines'}
local activeItems = build.calcsTab.mainEnv.player.itemList
local measured = {}
for _,slot in ipairs(build.itemsTab.orderedSlots) do
 local nativeName = slot.slotName
 local name = nativeName:gsub(' Swap$','')
 local item = activeItems[name]
 if item and (not slot.weaponSet or slot.weaponSet == (request.secondWeapons and 2 or 1)) and not measured[nativeName] then
  measured[nativeName] = true
  local controlOk,controlValue,controlSkill = pcall(function()
   local control = new('Item',item:BuildRaw()); control.id=item.id; control:BuildModList()
   return calculate({repSlotName=nativeName,repItem=control})
  end)
  local roundtrip = controlOk and controlSkill == skillId and math.abs(controlValue-baseline) <= math.max(1e-6,baseline*1e-7)
  for _,kind in ipairs(groups) do
   for index,line in ipairs(item[kind] or {}) do
    assert(#rows < 600, 'Too many item modifier lines')
    if item:CheckModLineVariant(line) then
     local label = itemLib.applyRange(line.line:gsub('\n',' '),line.range or 0.5,line.valueScalar or 1,line.corruptedRange)
     local row={id=nativeName..':'..kind..':'..index,slot=nativeName,item=item.name,line=label,placement=kind,status='pending'}
     if not line.modList or line.extra then row.reason='PoB does not fully parse this line'
     elseif not roundtrip then row.reason='Native item round-trip changes the baseline'
     else
      table.remove(item[kind],index)
      local ok,raw=pcall(item.BuildRaw,item)
      table.insert(item[kind],index,line)
      if ok then
       local success,value,afterSkill = pcall(function()
        local modified = new('Item',raw); modified.id=item.id; modified:BuildModList()
        -- Generated rune/buff lines are restored by parsing. Remove the exact parsed
        -- native mod line instead, keeping sockets and other coupled item facts fixed.
        if #(modified[kind] or {}) >= #(item[kind] or {}) then
         if (kind ~= 'runeModLines' and kind ~= 'buffModLines') or line.socketedAugmentTypeOverride or line.socketedSoulCoreType then error('Modifier cannot be isolated from generated item effects') end
         modified = new('Item',item:BuildRaw()); modified.id=item.id
         if not modified[kind][index] or modified[kind][index].line ~= line.line then error('Generated modifier identity changed') end
         table.remove(modified[kind],index); modified:BuildModList()
         if #(modified[kind] or {}) >= #(item[kind] or {}) then error('Generated modifier restored itself') end
        end
        return calculate({repSlotName=nativeName,repItem=modified})
       end)
       if success and afterSkill == skillId then row.status='calculated'; row.without=value; row.delta=baseline-value; row.lossPercent=100*(baseline-value)/baseline
       else row.reason=success and 'Removing this line changes or disables the selected skill' or 'This item effect cannot be independently recalculated' end
      else row.reason='Native item serialization failed' end
     end
     table.insert(rows,row)
    end
   end
  end
  -- A simultaneous removal is a separate native counterfactual, not a sum of
  -- overlapping per-line losses. Preserve the item base, quality and sockets.
  local total={id=nativeName,slot=nativeName,item=item.name,status='pending',pendingLines=0}
  for _,row in ipairs(rows) do
   if row.slot == nativeName and row.status == 'pending' then total.pendingLines=total.pendingLines+1 end
  end
  if not roundtrip then total.reason='Native item round-trip changes the baseline'
  else
   local success,value,afterSkill=pcall(function()
    local stripped=new('Item',item:BuildRaw()); stripped.id=item.id
    for _,kind in ipairs(groups) do stripped[kind]={} end
    stripped:BuildModList()
    for _,kind in ipairs(groups) do assert(#(stripped[kind] or {}) == 0,'Native item restored modifier lines') end
    return calculate({repSlotName=nativeName,repItem=stripped})
   end)
   if success and afterSkill == skillId then total.status='calculated'; total.without=value; total.delta=baseline-value; total.lossPercent=100*(baseline-value)/baseline
   else total.reason=success and 'Removing all item modifiers changes or disables the selected skill' or 'All item modifiers cannot be independently recalculated' end
  end
  table.insert(itemTotals,total)
 end
end
local restored,restoredSkill=calculate()
assert(restoredSkill == skillId and math.abs(restored-baseline)<=math.max(1e-6,baseline*1e-7),'Calculation mutated the baseline')
local response = {version=1,engine='PoB2 v0.23.1',metric=metric,baseline=baseline,skill=request.skill.name,rows=rows,items=itemTotals}
local file=assert(originalOpen(WB_RESPONSE,'wb')); file:write(assert(json.encode(response))); file:close()
