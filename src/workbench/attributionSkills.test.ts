import { expect, it } from 'vitest';
import { barrageAttributionState } from './fixtures/damageAttribution';
import { attributionSkillChoices, excludedAttributionGroups } from './attributionSkills';
import { setSkillRoutine } from './skillRoutine';
import { skillPlan } from './skillRecommendation';

it('keeps Barrage in analysis choices and routes it to compatible selected outputs without borrowing its supports', () => {
  const state = barrageAttributionState(), choices = attributionSkillChoices(state);
  expect(choices.map(choice => choice.name)).toEqual(['Twister', 'Whirling Slash', 'Explosive Spear', 'Barrage']);
  const barrage = choices.find(choice => choice.name === 'Barrage')!;
  expect(barrage.output).toBe(false);
  expect(choices.filter(choice => barrage.targets.includes(choice.key)).map(choice => choice.name)).toEqual(['Twister', 'Explosive Spear']);
  expect(barrage.supports.map(support => support.name)).toEqual(['Prolonged Duration II']);
  expect(skillPlan(state)?.supports.map(support => support.name)).not.toContain('Prolonged Duration II');
  expect(skillPlan(state)?.notes.join('')).toContain('弹幕强化下一次');
  expect(skillPlan(state)?.priorities.some(priority => priority.reason.includes('弹幕'))).toBe(false);
});

it('retains selected Barrage, excludes it when removed, and preserves unselected persistent buffs', () => {
  const state = barrageAttributionState(), target = state.goals.mainSkill!;
  expect(excludedAttributionGroups(state, target)).toEqual([6]);
  const without = setSkillRoutine(state, state.goals.skillBar!.filter(entry => entry.name !== 'Barrage'));
  expect(excludedAttributionGroups(without, target)).toEqual([4, 6]);
  expect(attributionSkillChoices(without).some(choice => choice.name === 'Barrage')).toBe(false);
  const retained = excludedAttributionGroups(without, target);
  expect(retained).not.toContain(5); // Wind Dancer is a saved persistent buff.
  expect(state.goals.skillBar).toHaveLength(4);
});

it('does not invent an independent Barrage DPS or a target outside the routine / weapon context', () => {
  const state = barrageAttributionState();
  const onlyUtility = setSkillRoutine(state, state.goals.skillBar!.filter(entry => ['Barrage', 'Whirling Slash'].includes(entry.name ?? '')));
  expect(attributionSkillChoices(onlyUtility).find(choice => choice.name === 'Barrage')?.targets).toEqual([]);
  const group = onlyUtility.source!.combat!.sets[0]!.groups.find(entry => entry.index === 4)!;
  group.gems[0]!.enabled = false;
  expect(attributionSkillChoices(onlyUtility).some(choice => choice.name === 'Barrage')).toBe(false);
});
