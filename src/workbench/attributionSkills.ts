import type { LoadoutState } from './loadout';
import { routineSkillChoices, skillSelectionKey } from './skillRoutine';
import { skillPlan, type MainSkillSelection } from './skillRecommendation';
import { barrageCanEmpower } from './skillLinks';

/** The analysis selector mirrors the selected routine, including utility gems.
 * A non-damaging buff must be measured through a verified output target. */
export function attributionSkillChoices(state: LoadoutState) {
  const available = routineSkillChoices(state);
  const selected = (state.goals.skillBar ?? []).flatMap(selection => {
    const choice = available.find(entry => entry.key === skillSelectionKey(selection));
    return choice ? [{ ...choice, output: !!skillPlan({ ...state, goals: { ...state.goals, mainSkill: selection } }) }] : [];
  });
  return selected.map(choice => ({ ...choice, targets: choice.output ? [choice.key] : choice.name === 'Barrage'
    ? selected.filter(target => target.output && target.selection.setId === choice.selection.setId && barrageCanEmpower(target)).map(target => target.key) : [] }));
}

/** Exclude unselected active casts, including Barrage, while preserving passive
 * persistent buffs and each retained socket group's original support gems. */
export function excludedAttributionGroups(state: LoadoutState, target: MainSkillSelection): number[] {
  const available = routineSkillChoices(state);
  const selected = state.goals.skillBar ?? [];
  const groups = state.source?.combat?.sets.find(set => set.id === target.setId)?.groups ?? [];
  return groups.filter(group => group.index !== target.group
    && !selected.some(selection => selection.setId === target.setId && selection.group === group.index)
    && available.some(choice => choice.selection.setId === target.setId && choice.selection.group === group.index && !choice.tags.includes('persistent')))
    .map(group => group.index);
}
