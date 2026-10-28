import { uiText } from './uiLocale';
import { METRICS, emptyLoadout, type LoadoutState } from './loadout';
import { loadoutChanges, sourceIsCurrent } from './loadoutIntegration';
import { translatePobLabel } from './localization';
import { equipmentDisplayName } from './genericEquipment';
import { activeWeaponSet } from './weaponSets';

export function LoadoutChangePreview({ before, after }: { before: LoadoutState; after: LoadoutState }) {
  const change = loadoutChanges(before, after);
  const statusLabels = { added: '新增装备', removed: '移除装备', modified: '数值／词缀变化', 'newly-read': '新增读取 · 无旧快照', information: '读取信息补齐', unchanged: '未变化' };
  const actual = change.slots.filter((slot) => ['added', 'removed', 'modified'].includes(slot.revision.status)).length;
  return <section className="lo-import-diff" aria-label={uiText("整套装备更新对照")}>
    <p>{uiText(actual ? `${actual} 个栏位发生装备或数值变化` : '装备栏位没有实际数值变化')}{uiText(change.slots.length > actual ? ` · ${change.slots.length - actual} 个栏位补齐读取信息` : '')}{uiText(change.formatOnly ? ` · ${change.formatOnly} 个栏位仅格式变化，已忽略` : '')}。</p>
    {change.slots.map((slot) => {
      const oldItem = slot.revision.before, newItem = slot.revision.after;
      const a = oldItem ? equipmentDisplayName(oldItem) : slot.beforeKnown ? '未装备' : '未读取';
      const b = newItem ? equipmentDisplayName(newItem) : slot.afterKnown ? '未装备' : '本次未读取';
      return <article className="lo-revision-card" aria-label={uiText(`${slot.label}更新详情`)} key={slot.key}>
        <details open={actual <= 4}><summary><strong>{uiText(slot.label)}：{uiText(a === b ? a : `${a} → ${b}`)}</strong><span>{uiText(statusLabels[slot.revision.status])}</span></summary>
          <div className="lo-table-scroll"><table className="lo-deltas lo-revision-lines"><thead><tr><th>{uiText("变化项目")}</th><th>{uiText("更新前")}</th><th>{uiText("更新后")}</th><th>{uiText("数值差")}</th></tr></thead><tbody>{slot.revision.lines.map((line) => <tr key={line.key}><th>{uiText(line.label)}{uiText(line.information ? '（记录补齐）' : '')}</th><td>{uiText(line.before)}</td><td>{uiText(line.after)}</td><td>{uiText(line.delta === undefined ? '—' : `${line.delta > 0 ? '+' : ''}${Number(line.delta.toFixed(3))}`)}</td></tr>)}</tbody></table></div>
          {!!slot.metrics.length && <div className="lo-table-scroll"><table className="lo-deltas"><thead><tr><th>{uiText("本件可计算属性")}</th><th>{uiText("更新前")}</th><th>{uiText("更新后")}</th><th>{uiText("变化")}</th></tr></thead><tbody>{slot.metrics.map((metric) => <tr key={metric.key}><th>{uiText(metric.label)}</th><td>{uiText(metric.before.toLocaleString('zh-CN'))}{uiText(metric.unit)}</td><td>{uiText(metric.after.toLocaleString('zh-CN'))}{uiText(metric.unit)}</td><td>{uiText(metric.delta > 0 ? '+' : '')}{uiText(Number(metric.delta.toFixed(3)))}{uiText(metric.unit)}</td></tr>)}</tbody></table></div>}
          <details><summary>{uiText("原始装备文字对照")}</summary><div className="lo-revision-raw"><pre>{slot.beforeRaw ?? (slot.beforeKnown ? '未装备' : '未读取')}</pre><pre>{slot.afterRaw ?? (slot.afterKnown ? '未装备' : '本次未读取')}</pre></div></details>
        </details>
      </article>;
    })}
    {!change.sameWeaponSet && <p className="lo-footnote">{uiText("启用武器组发生切换；两组分别对照，不把切组当作购买或升级，也不跨组汇总属性差值。")}</p>}
    {!!change.metrics.length && <details><summary>{uiText("当前武器组装备贡献合计差值")}</summary><div className="lo-table-scroll"><table className="lo-deltas"><thead><tr><th>{uiText("装备贡献")}</th><th>{uiText("更新前")}</th><th>{uiText("更新后")}</th><th>{uiText("变化")}</th></tr></thead><tbody>{change.metrics.map((metric) => <tr key={metric.key}><th>{uiText(metric.label)}</th><td>{uiText(metric.before.toLocaleString('zh-CN'))}{uiText(metric.unit)}</td><td>{uiText(metric.after.toLocaleString('zh-CN'))}{uiText(metric.unit)}</td><td className={metric.delta > 0 ? 'positive' : 'negative'}>{uiText(metric.delta > 0 ? '+' : '')}{uiText(Number(metric.delta.toFixed(2)))}{uiText(metric.unit)}</td></tr>)}</tbody></table></div></details>}
    {!!change.slots.length && <p className="lo-footnote">{uiText("逐件列出实际数值、增删词缀、机制及状态变化。武器 DPS 是物品面板数值，词缀差值不是主技能 DPS；缺失数据不按零收益判断。")}</p>}
  </section>;
}
export default function LoadoutSourcePanel({ state }: { state: LoadoutState }) {
  const source = state.source, current = sourceIsCurrent(state);
  return <>
    {source && <section className="lo-summary" aria-label={uiText("角色数据来源")}>
      <h3>{uiText("PoB2 装备方案 · ")}{uiText(source.fileName ?? source.setTitle)}</h3>
      <p className="lo-footnote">{uiText([source.level ? `等级 ${source.level}` : '', source.className ? translatePobLabel(source.className) : '', source.ascendancy ? translatePobLabel(source.ascendancy) : '', source.version ? `版本 ${source.version}` : '', translatePobLabel(source.setTitle), source.secondWeapons ? '第二套武器' : '第一套武器'].filter(Boolean).join(' · '))}</p>
      {state.weaponSets && <p className="lo-footnote">{uiText("当前查看武器组 ")}{uiText(activeWeaponSet(state) === 1 ? 'I' : 'II')}{uiText("；PoB2 保存面板对应武器组 ")}{uiText(source.secondWeapons ? 'II' : 'I')}{uiText("，两者不同则不沿用伤害和角色总值。")}</p>}
      <p className="lo-footnote">{uiText("导入：")}{uiText(new Date(source.importedAt).toLocaleString('zh-CN'))}{uiText(source.savedAt ? ` · 文件保存：${new Date(source.savedAt).toLocaleString('zh-CN')}` : '')} · {uiText(current ? '对应当前装备快照' : '装备已手动变更，PoB2 快照需更新')}</p>
      {!!source.warnings?.length && <details><summary>{uiText("导入核对记录 · ")}{uiText(source.warnings.length)}{uiText(" 项")}</summary><p className="lo-footnote">{uiText("未导入栏位和未知效果可能影响完整方案；PoB2 面板参考保留其原方案配置。")}</p><ul className="lo-warnings">{source.warnings.map((warning, index) => <li key={index}>{uiText(warning)}</li>)}</ul></details>}
      {source.reference && <details><summary>{uiText("PoB2 保存时面板参考")}{uiText(!current ? '（已过期）' : '')}</summary>
        <p className="lo-footnote">{uiText("这些是 PoB2 保存时的计算结果，受其天赋、技能和配置影响；不是游戏实测面板，也不会随工坊换装自动重算。换装判断仍使用装备差值与单独录入的游戏面板。")}</p>
        <div className="lo-total-grid">{METRICS.filter((metric) => source.reference!.values[metric.key] !== undefined).map((metric) => <div key={metric.key}><span>{uiText(metric.label)}{uiText(metric.key.endsWith('Resistance') ? '未封顶总值' : '')}</span><strong>{uiText(source.reference!.values[metric.key]!.toLocaleString('zh-CN'))}{uiText(metric.unit)}</strong></div>)}</div>
        {Object.entries(source.reference.effective ?? {}).map(([key, value]) => <p className="lo-footnote" key={key}>{uiText(METRICS.find((metric) => metric.key === key)?.label)}{uiText("有效值（PoB2）：")}{uiText(value)}{uiText("%（与未封顶总值分开显示）")}</p>)}
        {source.reference.fullDps !== undefined && <p className="lo-footnote">{uiText("保存时 PoB2 全技能汇总：")}{uiText(source.reference.fullDps > 0 ? Math.round(source.reference.fullDps).toLocaleString('zh-CN') : '未计入汇总（不表示角色伤害为零）')}{uiText("。保存时主技能及命中／持续伤害见“输出技能组 → 来源与校验 → PoB 原始快照与装备构成”。")}</p>}
      </details>}
    </section>}
    {state.lastImport && <p className="lo-footnote" role="status">{uiText("本次读取：")}{uiText(new Date(state.lastImport.at).toLocaleString('zh-CN'))} · {uiText(state.lastImport.equipmentChanges ? `${state.lastImport.equipmentChanges} 个栏位变化` : `无实际装备变化${state.lastImport.formatOnly ? `，忽略 ${state.lastImport.formatOnly} 项格式差异` : ''}${state.previous ? '；保留上次有变化的对照' : ''}`)}{uiText(state.lastImport.newlyRead ? ` · 新增读取 ${state.lastImport.newlyRead} 个栏位` : '')}</p>}
    {state.previous && <details className="lo-backup"><summary>{uiText("最近一次整套更新对照")}</summary><p className="lo-footnote">{uiText("记录于 ")}{uiText(new Date(state.previous.replacedAt).toLocaleString('zh-CN'))}{uiText(" · 重复读取相同装备不会清空此对照。")}</p>{!state.previous.after && <p className="lo-footnote">{uiText("旧记录仅保留更新前快照，以下与当前装备对照；今后的更新会保存前后双方快照。")}</p>}<LoadoutChangePreview before={{ ...emptyLoadout(), slots: state.previous.slots, weaponSets: state.previous.weaponSets, source: state.previous.source }} after={state.previous.after ? { ...emptyLoadout(), ...state.previous.after, source: state.source } : state} /></details>}
  </>;
}
