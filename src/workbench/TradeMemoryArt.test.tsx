import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import TradeMemoryArt from './TradeMemoryArt';
import { parseEquipment } from './genericEquipment';
import type { TradeMemoryEntry } from './tradeMemory';
import { buildEquipmentTrade } from './genericEquipmentTrade';
import { BOOTS_SAMPLE } from './fixtures/fullGear';

const query = buildEquipmentTrade({ equipment: parseEquipment(BOOTS_SAMPLE)!, league: 'Test', rows: [] }).query;
const entry: TradeMemoryEntry = { id: 'legacy', league: 'Test', title: '物品', saved: true, folder: '', updatedAt: new Date().toISOString(), query };
describe('history art identity', () => {
  it('uses the unique image instead of its base and preserves canonical art for a renamed bookmark', () => {
    const raw = 'Item Class: Rings\nRarity: Unique\nDeath Rush\nEmerald Ring\n--------';
    const unique = parseEquipment(raw)!;
    expect(unique.nameEnglish).toBe('Death Rush');
    expect(unique.icon).toBeTruthy();
    render(<TradeMemoryArt entry={{ ...entry, title: '我的收藏', raw }} onOpen={() => {}} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', unique.icon);
  });
  it('uses exact canonical query type for records without raw and leaves unknown art empty', () => {
    const { rerender } = render(<TradeMemoryArt entry={{ ...entry, query: { ...query, query: { ...query.query, type: 'Ruby Ring' } } }} onOpen={() => {}} />);
    expect(screen.getByRole('img').getAttribute('src')).toContain('RubyRing.png');
    rerender(<TradeMemoryArt entry={{ ...entry, query: { ...query, query: { ...query.query, type: 'Invented Ring' } } }} onOpen={() => {}} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByLabelText('暂无对应物品图片')).toBeInTheDocument();
  });
});
