import { parsePobXml, previewPob, pobImportSource } from '../pobImport';
import { emptyLoadout } from '../loadout';
import { applyPobLoadout } from '../loadoutIntegration';
import { routineSkillChoices, setSkillRoutine } from '../skillRoutine';
import { rememberCalculationSnapshot } from '../calculationSnapshot';
import { equipmentSignature } from '../resistanceModel';

/** Synthetic, versioned native-engine fixture; no account or personal build information. */
export const attributionXml = `<PathOfBuilding2><Build level="80" targetVersion="0_1" mainSocketGroup="1"/><Items activeItemSet="1">
<Item id="1">Rarity: Rare
Attribution Ring
Gold Ring
Item Level: 84
Implicits: 0
40% increased Fire Damage
20% increased Spell Damage
+80 to maximum Mana
+30% to Fire Resistance
This invented effect is unsupported</Item>
<Item id="2">Rarity: Rare
Attribution Loop
Gold Ring
Item Level: 84
Implicits: 0
10% increased Cast Speed
+50 to maximum Life</Item>
<Item id="3">Rarity: Rare
Attribution Spear
Grand Spear
Item Level: 84
Sockets: S
Rune: Iron Rune
Implicits: 1
{rune}16% increased Physical Damage
100% increased Physical Damage</Item>
<ItemSet id="1"><Slot name="Ring 1" itemId="1"/><Slot name="Ring 2" itemId="2"/><Slot name="Weapon 1" itemId="3"/></ItemSet></Items>
<Skills activeSkillSet="1"><SkillSet id="1"><Skill enabled="true" mainActiveSkill="1"><Gem nameSpec="Fireball" level="18" quality="0" enabled="true"/></Skill><Skill enabled="true" mainActiveSkill="1"><Gem nameSpec="Spark" level="18" quality="0" enabled="true"/></Skill></SkillSet></Skills></PathOfBuilding2>`;
export function attributionState() {
  const document = parsePobXml(attributionXml), preview = previewPob(document, '1', false);
  const source = pobImportSource(document, '1', false, preview.slots);
  const state = applyPobLoadout(emptyLoadout(), preview.slots, source);
  const choices = routineSkillChoices(state);
  return setSkillRoutine(state, choices.map((entry) => entry.selection), choices[0]?.selection);
}
export function rememberAttributionFixture() {
  const state = attributionState();
  rememberCalculationSnapshot(parsePobXml(attributionXml).calculationXml, state.source!, [equipmentSignature(state.slots)]);
  return state;
}

export const barrageAttributionXml = attributionXml.replace(/<Skills[\s\S]*<\/Skills>/, `<Skills activeSkillSet="1"><SkillSet id="1">
<Skill enabled="true" mainActiveSkill="1"><Gem nameSpec="Twister" level="18" quality="0" enabled="true"/></Skill>
<Skill enabled="true" mainActiveSkill="1"><Gem nameSpec="Whirling Slash" level="18" quality="0" enabled="true"/></Skill>
<Skill enabled="true" mainActiveSkill="1"><Gem nameSpec="Explosive Spear" level="18" quality="0" enabled="true"/></Skill>
<Skill enabled="true" mainActiveSkill="1"><Gem nameSpec="Barrage" level="18" quality="0" enabled="true"/><Gem nameSpec="Prolonged Duration II" level="1" quality="0" enabled="true"/></Skill>
<Skill enabled="true" mainActiveSkill="1"><Gem nameSpec="Wind Dancer" level="18" quality="0" enabled="true"/></Skill>
<Skill enabled="true" mainActiveSkill="1"><Gem nameSpec="Spark" level="18" quality="0" enabled="true"/></Skill>
</SkillSet></Skills>`);
export function barrageAttributionState() {
  const document = parsePobXml(barrageAttributionXml), preview = previewPob(document, '1', false);
  const source = pobImportSource(document, '1', false, preview.slots);
  const state = applyPobLoadout(emptyLoadout(), preview.slots, source);
  const choices = routineSkillChoices(state).filter(entry => ['Twister', 'Whirling Slash', 'Explosive Spear', 'Barrage'].includes(entry.name));
  return setSkillRoutine(state, choices.map(entry => entry.selection), choices[0]?.selection);
}
export function rememberBarrageAttributionFixture() {
  const state = barrageAttributionState();
  rememberCalculationSnapshot(parsePobXml(barrageAttributionXml).calculationXml, state.source!, [equipmentSignature(state.slots)]);
  return state;
}

/** Public tree-node IDs with synthetic jewels; the inactive spec deliberately swaps them. */
const jewelNodes = '60735,35901,63888,28050,60505,65009,29517,32701,21746,43691,24647,56045,61196,8975,53960,30555,4203,42736,60685,9485,56216,44871,32763,14262,41017,12253,14658,26598';
export const jewelAttributionXml = attributionXml.replace('</Items>', `<Item id="4">Rarity: Rare
Fixture Radius
Time-Lost Emerald
Item Level: 84
Implicits: 0
Small Passive Skills in Radius also grant 2% increased Damage with Spears
Notable Passive Skills in Radius also grant 2% increased Attack Speed
Notable Passive Skills in Radius also grant 2% increased Attack Speed with Spears</Item>
<Item id="5">Rarity: Rare
Fixture Diamond
Diamond
Item Level: 84
Implicits: 0
2% increased Attack Speed
20% increased Spell Damage</Item></Items>`).replace('<Skills', `<Tree activeSpec="2">
<Spec treeVersion="0_5" classId="1" ascendClassId="0" nodes="${jewelNodes}"><Sockets><Socket nodeId="60735" itemId="5"/><Socket nodeId="32763" itemId="4"/></Sockets></Spec>
<Spec treeVersion="0_5" classId="1" ascendClassId="0" nodes="${jewelNodes}"><Sockets><Socket nodeId="60735" itemId="4"/><Socket nodeId="32763" itemId="5"/></Sockets></Spec>
</Tree><Skills`);
export function rememberJewelAttributionFixture() {
  const state = attributionState();
  rememberCalculationSnapshot(parsePobXml(jewelAttributionXml).calculationXml, state.source!, [equipmentSignature(state.slots)]);
  return state;
}
