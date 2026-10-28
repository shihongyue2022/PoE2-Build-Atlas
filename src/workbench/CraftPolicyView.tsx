import { uiText } from './uiLocale';
import type { SolveResult } from '../lib/solve';
import type { EnginePolicyNode } from '../lib/engineTypes';
import { formatPercent } from './model';
import type { Engine } from '../lib/engine';
import CraftCostAmount from './CraftCostAmount';
import { translateCurrency, translateMod } from './localization';
import { getCurrencyImageIdForAction } from './currencyImages';
import OfficialCurrencyIcon from './OfficialCurrencyIcon';
import Icon from './WorkbenchIcon';
const RARITY_NAMES = { normal: '普通', magic: '魔法', rare: '稀有' };

export default function PolicyView({ node, result, onNode, prices, overrides }: { node: EnginePolicyNode; result: SolveResult; onNode: (key: string) => void; prices?: Engine['prices']; overrides?: Readonly<Record<string, number>> }) {
  const edges = result.markov.edges.filter((edge) => edge.from === node.key);
  return <div className="wb-policy"><div className="wb-section-head"><h3>{uiText(node.isStart ? '从当前状态开始' : node.isGoal ? '目标已达成' : '如果出现这个结果')}</h3>{!node.isStart && <button className="wb-text-button" onClick={() => onNode(result.markov.nodes.find((entry) => entry.isStart)?.key ?? '')}>{uiText("回到起点")}</button>}</div>
    <div className="wb-policy-state"><span>{uiText(RARITY_NAMES[node.rarity])}</span>{node.present.map((mod, index) => <span className="good" key={index}>{uiText(translateMod(mod.text))}{uiText(mod.tier ? ` · T${mod.tier}+` : '')}</span>)}{node.blocked.map((mod, index) => <span className="bad" key={index}>{uiText("待替换：")}{uiText(translateMod(mod.text))}</span>)}{node.junkPrefixes + node.junkSuffixes > 0 && <span>{uiText("其他词缀：")}{uiText(node.junkPrefixes)}{uiText(" 前 / ")}{uiText(node.junkSuffixes)}{uiText(" 后")}</span>}</div>
    <div className="wb-next-action"><span className="wb-next-icon">{node.isGoal ? <Icon name="check" size={22} /> : <OfficialCurrencyIcon currencyId={getCurrencyImageIdForAction(node.action ?? '')} label={uiText(translateCurrency(node.action ?? '下一步'))} fallback={<Icon name="hammer" size={22} />} />}</span><div><small>{uiText(node.isGoal ? '已满足所选条件' : '推荐下一步')}</small><strong>{uiText(node.isGoal ? '可以停止制作' : translateCurrency(node.action ?? '暂无可执行动作'))}</strong></div>{node.actionCost !== undefined && <span><CraftCostAmount value={node.actionCost} prices={prices} overrides={overrides} />{uiText(" / 次")}</span>}</div>
    {node.keepsOne && <p className="wb-fine">{uiText("这是提供多个选项后保留其一的操作；下方概率描述按策略选择后的结果。")}</p>}
    {edges.length > 0 && <><p className="wb-fine">{uiText("点击结果分支，查看后续建议。图中结果可能按等价状态合并。")}</p><div className="wb-branches">{edges.map((edge, index) => { const next = result.markov.nodes.find((entry) => entry.key === edge.to); return <button key={index} disabled={!next} onClick={() => onNode(edge.to)}><span className={edge.regress ? 'wb-branch-risk' : 'wb-branch-good'}>{uiText(formatPercent(edge.prob))}</span><div><strong>{uiText(next?.isGoal ? '达到目标' : next?.action ? `下一步：${translateCurrency(next.action)}` : '转到后续状态')}</strong><small>{uiText(next ? `${next.present.length} 项目标已达成 · ${next.blocked.length} 项需要替换${edge.regress ? ' · 进度回退' : ''}` : '该分支未在当前图中展开')}</small></div><Icon name="arrow" size={16} /></button>; })}</div></>}
  </div>;
}
