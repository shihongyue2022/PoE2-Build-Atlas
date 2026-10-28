import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import LanguageSelect from './LanguageSelect';
import { getUiLocale, setUiLocale, uiText, useUiLocale } from './uiLocale';

afterEach(() => {
  setUiLocale('zh-CN');
  window.history.replaceState(null, '', '/');
});

describe('workbench interface languages', () => {
  it('localizes dynamic portfolio screenshot captions and summaries', () => {
    for (const locale of ['en', 'ja'] as const) {
      setUiLocale(locale);
      for (const source of ['· 3 项正贡献 · 1 项待核对', '条正贡献', '· 基准', '底装已有 T1 · 已达标', '快照 3.166 神圣石／个', '路线 1', '+1.600 分']) {
        expect(uiText(source)).not.toBe(source);
      }
      expect(uiText('稀有金光戒指')).not.toContain('稀有');
    }
    setUiLocale('en');
    expect(uiText('· 3 项正贡献 · 1 项待核对')).toContain('positive contributions');
    expect(uiText('快照 3.166 神圣石／个')).toBe('Snapshot: 3.166 Divine Orb each');
  });
  it('switches live without remounting application state or touching raw text', () => {
    function Harness() {
      useUiLocale();
      const [draft, setDraft] = useState('Rarity: Rare\n原始物品文本');
      return <><LanguageSelect /><h1>{uiText('角色装备')}</h1><textarea aria-label="raw" value={draft} onChange={(event) => setDraft(event.target.value)} /></>;
    }
    render(<Harness />);
    const raw = screen.getByLabelText('raw');
    fireEvent.change(raw, { target: { value: 'Rarity: Rare\n手动输入的装备草稿' } });
    const language = screen.getByRole('combobox');
    fireEvent.change(language, { target: { value: 'en' } });
    expect(screen.getByRole('heading')).toHaveTextContent('Character equipment');
    expect(document.documentElement.lang).toBe('en');
    expect(new URL(window.location.href).searchParams.get('lang')).toBe('en');
    expect(raw).toHaveValue('Rarity: Rare\n手动输入的装备草稿');
    fireEvent.change(language, { target: { value: 'ja' } });
    expect(screen.getByRole('heading')).toHaveTextContent('キャラクター装備');
    expect(raw).toBe(screen.getByLabelText('raw'));
    fireEvent.change(language, { target: { value: 'zh-CN' } });
    expect(screen.getByRole('heading')).toHaveTextContent('角色装备');
    expect(raw).toHaveValue('Rarity: Rare\n手动输入的装备草稿');
  });

  it('persists the preference separately from equipment and crafting storage', () => {
    localStorage.setItem('poe2-workbench-v1', '{"baseName":"Amethyst Ring"}');
    setUiLocale('ja');
    expect(getUiLocale()).toBe('ja');
    expect(localStorage.getItem('poe2-workbench-ui-language-v1')).toBe('ja');
    expect(localStorage.getItem('poe2-workbench-v1')).toBe('{"baseName":"Amethyst Ring"}');
    expect(uiText('  角色装备  ')).toBe('  キャラクター装備  ');
    expect(uiText('Unknown native item name')).toBe('Unknown native item name');
    const result = { officialId: 'explicit.stat_123', amount: 20 };
    expect(uiText(result)).toBe(result);
  });

  it('localizes composed tier/threshold labels without changing numeric values', () => {
    setUiLocale('en');
    expect(uiText('T1 · 41–45 · 物等 82+')).toBe('T1 · 41–45 · Item level 82+');
    expect(uiText('+110最大生命 ≥ 110')).toBe('+110 to maximum Life ≥ 110');
    expect(uiText('药剂 2')).toBe('Flask 2');
    expect(uiText('核心属性')).toBe('Core stats');
    setUiLocale('ja');
    expect(uiText('药剂 2')).toBe('フラスコ 2');
    expect(uiText('核心属性')).toBe('主要ステータス');
    expect(document.title).toBe('PoE2 Build Atlas · 装備・クラフト工房');
  });

  it('uses PoE2DB Japanese game names and preserves canonical English names', () => {
    setUiLocale('ja');
    expect(uiText('崇高石')).toBe('高貴なオーブ');
    expect(uiText('高阶崇高石')).toBe('高貴なオーブ (上級)');
    expect(uiText('混沌石')).toBe('カオスオーブ');
    expect(uiText('Omen of Whittling')).toBe('削減のお告げ');
    expect(uiText('裂痕戒指')).toBe('ブリーチの指輪');
    expect(uiText('Twister')).toBe('ツイスター');
    expect(uiText('旋风')).toBe('ツイスター');
    expect(uiText('回旋斩')).toBe('ワーリングスラッシュ');
    expect(uiText('爆炸长矛')).toBe('エクスプローシブスピア');
    setUiLocale('en');
    expect(uiText('Twister')).toBe('Twister');
    expect(uiText('旋风')).toBe('Twister');
    expect(uiText('高阶崇高石')).toBe('Greater Exalted Orb');
    expect(uiText('裂痕戒指')).toBe('Breach Ring');
  });

  it('uses verified Japanese modifier templates without changing rolls or trade data', () => {
    const officialQuery = { id: 'explicit.stat_3299347043', value: { min: 42 } };
    setUiLocale('ja');
    expect(uiText('+110 to maximum Life')).toBe('最大ライフ +110');
    expect(uiText('+110最大生命')).toBe('最大ライフ +110');
    expect(uiText('+42% to Fire Resistance')).toBe('火耐性 +42%');
    expect(uiText('+42%火焰抗性')).toBe('火耐性 +42%');
    expect(uiText(officialQuery)).toBe(officialQuery);
    setUiLocale('en');
    expect(uiText('+110最大生命')).toBe('+110 to maximum Life');
    expect(uiText('+42% to Fire Resistance')).toBe('+42% to Fire Resistance');
  });

  it('localizes native equipment stats, bonded effects and item levels outside the crafting stat catalog', () => {
    const source = ['命定: +5%至全部技能的品质', '每个镶嵌的插槽使对你的击中减少23%暴击伤害加成', '+30护甲值'];
    setUiLocale('en');
    expect(source.map(uiText)).toEqual([
      'Bonded: +5% to Quality of all Skills',
      'Hits against you have 23% reduced Critical Damage Bonus per Socket filled',
      '+30 to Armour',
    ]);
    expect(uiText(' · 物等 84')).toBe(' · Item level 84');
    setUiLocale('ja');
    expect(source.map(uiText)).toEqual([
      '絆：全てのスキルの品質 +5%',
      '嵌められているソケットごとにプレイヤーに対するヒットのクリティカルダメージボーナスが23%減少する',
      'アーマー +30',
    ]);
    expect(uiText(' · 物等 84')).toBe(' · アイテムレベル 84');
    expect(uiText('Morior Invictus')).toBe('不屈なる者として死す');
    expect(uiText('Grand Regalia')).toBe('荘厳なレガリア');
    setUiLocale('zh-CN');
    expect(source.map(uiText)).toEqual(source);
  });
});
