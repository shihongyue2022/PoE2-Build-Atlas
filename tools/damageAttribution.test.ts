import { describe, expect, it } from 'vitest';
import { attributionRequest } from './damageAttribution';
const valid = { xml: '<PathOfBuilding2><Build targetVersion="0_1"/></PathOfBuilding2>', itemSetId: '1', secondWeapons: false, skill: { setId: '1', group: 1, name: 'Fireball', id: '' }, excludedGroups: [2, 2] };
describe('native calculator request boundary', () => {
  it('accepts bounded native input and deduplicates excluded groups', () => { expect(attributionRequest(valid).excludedGroups).toEqual([2]); });
  it('rejects private import metadata, external XML declarations, paths, and malformed skill choices', () => {
    for (const value of [{ ...valid, xml: '<!DOCTYPE test>' + valid.xml }, { ...valid, xml: valid.xml.replace('<Build', '<Import/><Build') }, { ...valid, itemSetId: '../../Settings.xml' }, { ...valid, skill: { ...valid.skill, group: 0 } }, { ...valid, excludedGroups: [NaN] }, { ...valid, xml: valid.xml + ' '.repeat(3_000_000) }]) expect(() => attributionRequest(value)).toThrow();
  });
});
