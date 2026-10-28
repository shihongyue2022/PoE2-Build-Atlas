import { uiText } from './uiLocale';
import { useEffect, useState } from 'react';
import type { Engine } from '../lib/engine';
import { BREACH_GUIDE_SOURCES } from './craftReference';
import { blueprintMaterialLabel } from './craftBlueprint';
import { englishPoe2dbUrl } from './poe2dbReference';
import OfficialCurrencyIcon from './OfficialCurrencyIcon';
import { BUDGET_STORAGE, budgetNumber, emptyPreparationBudget, preparationCostRows, preparationCostTotal, preparationMaterialKey,
  preparationBaseCost, readPreparationProjects, mergePreparationMaterials, preparationMaterialName, CRAFT_LEDGER_TITLE, type PreparationBudget } from './preparationBudget';
import { convertCraftCost, COST_CURRENCY_LABELS, type CostCurrency, type CraftExchangeRates } from './craftExchange';
import { useCraftExchange } from './useCraftExchange';
import { HOSTED_WORKBENCH } from './workbenchRuntime';

const amount = (value: number) => value.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
function loadBudget(league: string, referenceRaw: string): PreparationBudget {
  try { return mergePreparationMaterials(readPreparationProjects(localStorage.getItem(BUDGET_STORAGE)).find(project => project.league === league && project.referenceRaw === referenceRaw)?.budget ?? emptyPreparationBudget()); }
  catch { return emptyPreparationBudget(); }
}

export default function CraftPreparationFlow({ preparation, engine, league, referenceRaw, routeMaterials = [], routeLabel = '当前路线' }: {
  preparation: { checkedAt?: string; steps: readonly { title: string; text: string; materials: readonly string[] }[] }; engine: Engine; league: string; referenceRaw: string; routeMaterials?: readonly string[]; routeLabel?: string;
}) {
  const [budget, setBudget] = useState(() => loadBudget(league, referenceRaw)), [saveIssue, setSaveIssue] = useState('');
  useEffect(() => {
    try {
      const projects = readPreparationProjects(localStorage.getItem(BUDGET_STORAGE)).filter(project => project.league !== league || project.referenceRaw !== referenceRaw);
      localStorage.setItem(BUDGET_STORAGE, JSON.stringify([...projects, { league, referenceRaw, budget }].slice(-8)));
    } catch { queueMicrotask(() => setSaveIssue('预算暂未保存到浏览器，当前页面仍可计算。')); }
  }, [budget, league, referenceRaw]);
  const market = useCraftExchange(engine, league);
  const manualRates = budget.manualRates;
  const manual = !!(manualRates?.divine.trim() || manualRates?.chaos.trim());
  const positive = (raw: string) => { const value = budgetNumber(raw); return value && value > 0 ? value : undefined; };
  const exchange: CraftExchangeRates = manual ? { league, source: '手填汇率', asOf: '', rates: { exalted: 1,
    divine: positive(manualRates?.divine ?? ''), chaos: positive(manualRates?.chaos ?? '') } } : market.exchange;
  const currency = budget.currency ?? 'divine', unit = COST_CURRENCY_LABELS[currency];
  const money = (value: number) => { const converted = convertCraftCost(value, 'exalted', currency, exchange); return converted === undefined ? '待补汇率' : `${amount(converted)} ${unit}`; };
  const recorded = Object.entries(budget.materials).flatMap(([key, entry]) => {
    const name = preparationMaterialName(key); return name ? [{ name, selected: entry.selected }] : [];
  });
  const currentNames = new Set(routeMaterials);
  const names = [...new Set([...routeMaterials, ...recorded.filter(entry => entry.selected).map(entry => entry.name)])];
  const additional = [...new Set([...preparation.steps.flatMap(step => step.materials), 'Divine Orb', 'Exalted Orb', 'Chaos Orb', 'Orb of Annulment', ...recorded.map(entry => entry.name)])].filter(name => !names.includes(name));
  const rows = preparationCostRows([{ title: CRAFT_LEDGER_TITLE, materials: names }], budget, engine, league, exchange), total = preparationCostTotal(rows);
  const baseCost = budget.baseCost ?? { included: false, amount: '', unit: 'divine' as const }, base = preparationBaseCost(budget, exchange);
  const combined = total.known + (base ?? 0), incomplete = !!total.missingPrice || !!total.missingQuantity || base === undefined;
  const updateBase = (patch: Partial<typeof baseCost>) => setBudget(old => ({ ...old, baseCost: { ...baseCost, ...patch } }));
  function updateMaterial(key: string, patch: Partial<PreparationBudget['materials'][string]>) {
    setBudget(old => ({ ...old, materials: { ...old.materials, [key]: { selected: false, quantity: '1', ...old.materials[key], ...patch } } }));
  }
  const sameLeague = !engine.prices.meta?.league || engine.prices.meta.league === league;
  return <section className="wb-panel cb-research cb-preparation" aria-label={uiText("攻略与制作准备")}>
    <div className="wb-section-head"><h3>{uiText("5 · 制作材料与总成本")}</h3><label className="cb-cost-unit">{uiText("统一币种")}<select aria-label={uiText("制作成本显示币种")} value={currency} onChange={event => setBudget(old => ({ ...old, currency: event.target.value as 'divine' | 'chaos' }))}><option value="divine">{uiText("神圣石")}</option><option value="chaos">{uiText("混沌石")}</option></select></label></div>
    <p className="wb-fine">{uiText("材料跟随上方所选路线；按实际消耗填写累计用量，核对和重算会保留记录。已含在底装买价里的准备无需重复计入。")}</p>
    <section className="cb-ledger" aria-label={uiText("当前路线材料")}>
      <div className="wb-section-head"><h4>{uiText(routeLabel)}{uiText(" · 制作耗材")}</h4><label className="cb-ledger-add">{uiText("补记耗材")}<select aria-label={uiText("补记其他耗材")} value="" onChange={event => { const name = event.target.value; if (additional.includes(name)) updateMaterial(preparationMaterialKey(CRAFT_LEDGER_TITLE, name), { selected: true }); }}><option value="">{uiText("选择准备或其他消耗…")}</option>{additional.map(name => <option key={name} value={name}>{uiText(blueprintMaterialLabel(name))}</option>)}</select></label></div>
      {!rows.length && <p className="wb-fine">{uiText("生成制作路线后显示所需材料；已完成的准备消耗可通过“补记耗材”录入。")}</p>}
      <div className="cb-ledger-rows">{rows.map(row => {
          const label = blueprintMaterialLabel(row.name), entry = budget.materials[row.key];
          const quantity = budgetNumber(entry?.quantity ?? '1', true);
          return <div className={`cb-prep-material cb-ledger-row${row.selected ? ' is-selected' : ''}`} key={row.key} role="group" aria-label={uiText(`材料：${label}`)}>
            <div className="cb-prep-material-head"><button type="button" className="cb-prep-art" aria-label={uiText(`使用材料：${label}`)} aria-pressed={row.selected} onClick={() => updateMaterial(row.key, { selected: !row.selected })}>
              <OfficialCurrencyIcon materialName={row.name} label={uiText(label)} size="card" />
              <span className="cb-prep-check" aria-hidden="true">{uiText(row.selected ? '✓' : '+')}</span>
            </button><div><a href={englishPoe2dbUrl(row.name)} target="_blank" rel="noreferrer" className="wb-link">{uiText(label)} ↗</a><small>{uiText(currentNames.has(row.name) ? '当前路线' : '补记／此前用量')}</small></div></div>
            <div className="cb-prep-quantity"><span>{uiText("数量")}</span><button type="button" aria-label={uiText(`减少数量：${label}`)} disabled={!row.selected || quantity === 0} onClick={() => updateMaterial(row.key, { quantity: String(Math.max(0, (quantity ?? 1) - 1)) })}>−</button>
              <input type="number" min="0" max="1000000" step="1" aria-label={uiText(`材料数量：${label}`)} placeholder={uiText("未选")} value={entry?.quantity ?? ''} onChange={event => updateMaterial(row.key, { selected: true, quantity: event.target.value })} />
              <button type="button" aria-label={uiText(`增加数量：${label}`)} disabled={row.selected && quantity === 1_000_000} onClick={() => updateMaterial(row.key, { selected: true, quantity: String(Math.min(1_000_000, row.selected ? (quantity ?? 0) + 1 : quantity ?? 1)) })}>＋</button>
            </div>
            <div className="cb-ledger-pricing"><div className="cb-prep-price"><span>{uiText(row.price === undefined ? '缺单价／汇率' : `${row.manual ? '手填' : ['Divine Orb', 'Chaos Orb'].includes(row.name) ? '汇率' : '快照'} ${money(row.price)}／个`)}</span></div>
            <details className="cb-prep-price-edit"><summary>{uiText("调整单价")}</summary><label>{uiText("单价")}<input type="number" min="0" max="1000000000000" step="any" aria-label={uiText(`材料单价：${label}`)} placeholder={uiText("填写单价")} value={budget.prices[row.name] ?? ''} onChange={event => setBudget(old => ({ ...old, prices: { ...old.prices, [row.name]: event.target.value } }))} />
              <select aria-label={uiText(`单价币种：${label}`)} value={budget.priceUnits?.[row.name] ?? 'exalted'} onChange={event => setBudget(old => ({ ...old, priceUnits: { ...old.priceUnits, [row.name]: event.target.value as CostCurrency } }))}>{Object.entries(COST_CURRENCY_LABELS).map(([id, name]) => <option key={id} value={id}>{uiText(name)}</option>)}</select></label><small>{uiText("留空使用参考价；手填金额保留原币种。")}</small></details></div>
            <output className="cb-ledger-subtotal" aria-label={uiText(`材料小计：${label}`)}>{uiText(!row.selected ? '未计入' : row.subtotal === undefined ? '待补齐' : money(row.subtotal))}</output>
          </div>;
        })}</div>
    </section>
    <div className="cb-prep-total" aria-live="polite"><output aria-label={uiText("准备材料预算")}>{uiText(!total.selected ? '选择材料并调整数量，即可计算预算' : `${total.total === undefined ? '已计价部分' : '材料预算'}：${money(total.total ?? total.known)}`)}</output>
      {!!total.selected && <span className="wb-fine">{uiText("已选 ")}{uiText(total.selected)}{uiText(" 种材料")}{uiText(total.missingQuantity ? ` · ${total.missingQuantity} 项待补有效数量` : '')}{uiText(total.missingPrice ? ` · ${total.missingPrice} 项待补单价` : '')}</span>}
      <button type="button" className="wb-text-button" onClick={() => setBudget(old => ({ ...old, materials: {}, prices: {}, priceUnits: {} }))}>{uiText("清空材料预算")}</button>
    </div>
    <p className="wb-fine">{uiText("用量由你填写，不自动叠加求解器期望。")}{uiText(sameLeague ? `材料参考价：${engine.prices.meta?.league ?? '本地价格表'} · ${engine.prices.meta?.updated ?? engine.prices.meta?.generated ?? '日期未知'}；刷新汇率不会更新这些材料报价。` : '材料价格表与所选赛季不同，需补填单价。')}</p>
    {saveIssue && <p className="wb-inline-warning" role="status">{uiText(saveIssue)}</p>}
    <section className="cb-cost-summary" aria-label={uiText("制作成本汇总")}>
      <div className="wb-section-head"><h4>{uiText("成本汇总 · ")}{uiText(unit)}</h4><button type="button" className="wb-button" disabled={HOSTED_WORKBENCH || market.loading} onClick={market.refresh}>{uiText(market.loading ? '正在查询汇率…' : '刷新汇率')}</button></div>
      <div className="cb-exchange-info"><span>{uiText(exchange.source)} · {uiText(league)}{uiText(exchange.asOf ? ` · ${new Date(exchange.asOf).toLocaleString('zh-CN')}` : '')}</span>
        {exchange.rates.divine && exchange.rates.chaos ? <strong>{uiText("1 神圣石 ≈ ")}{uiText(amount(exchange.rates.divine / exchange.rates.chaos))}{uiText(" 混沌石 ≈ ")}{uiText(amount(exchange.rates.divine))} Ex</strong> : <span>{uiText("汇率未补齐，无法完整换算")}</span>}{exchange.source === 'poe.ninja' && <span>{uiText("查询缓存 5 分钟")}</span>}</div>
      {market.error && <p role="status" className="wb-inline-warning">{uiText(market.error)}{uiText(" 当前使用")}{uiText(exchange.source)}。</p>}
      {HOSTED_WORKBENCH && <p className="wb-fine">{uiText("浏览器版使用内置快照；最新汇率可在本地版查询，或在下方手填。")}</p>}
      <details className="cb-exchange-edit"><summary>{uiText("手填／核对汇率")}</summary><div className="wb-actions">{(['divine', 'chaos'] as const).map(id => <label key={id}>1 {uiText(COST_CURRENCY_LABELS[id])}＝<input aria-label={uiText(`汇率：${COST_CURRENCY_LABELS[id]}兑Ex`)} type="number" min="0.00000001" step="any" placeholder={uiText(String(market.exchange.rates[id] ?? ''))} value={budget.manualRates?.[id] ?? ''} onChange={event => setBudget(old => ({ ...old, manualRates: { divine: '', chaos: '', ...old.manualRates, [id]: event.target.value } }))} /> Ex</label>)}
        <button type="button" className="wb-text-button" onClick={() => setBudget(old => ({ ...old, manualRates: undefined }))}>{uiText("恢复来源汇率")}</button><a href="https://poe.ninja/poe2/economy" target="_blank" rel="noreferrer" className="wb-link">{uiText("poe.ninja 汇率来源 ↗")}</a></div><p className="wb-fine">{uiText("手填时请补齐两项；仅用于本件预算换算，不改动路线求解器价格。")}</p></details>
      <div className="cb-base-cost"><label><input type="checkbox" checked={baseCost.included} onChange={event => updateBase({ included: event.target.checked })} />{uiText("计入底装买价")}</label><input type="number" min="0" step="any" disabled={!baseCost.included} aria-label={uiText("底装购买金额")} placeholder={uiText("实际支付金额")} value={baseCost.amount} onChange={event => updateBase({ amount: event.target.value })} /><select aria-label={uiText("底装买价币种")} disabled={!baseCost.included} value={baseCost.unit} onChange={event => updateBase({ unit: event.target.value as CostCurrency })}>{Object.entries(COST_CURRENCY_LABELS).map(([id, name]) => <option key={id} value={id}>{uiText(name)}</option>)}</select></div>
      <div className="cb-final-cost" aria-live="polite"><span>{uiText("材料 ")}{uiText(money(total.known))}{uiText(total.total === undefined && total.selected ? '（待补齐）' : '')}{uiText(" ＋ 底装 ")}{uiText(baseCost.included ? base === undefined ? '待补齐' : money(base) : '未计入')}</span>
        <output aria-label={uiText("制作总成本")}>{uiText(!total.selected && !baseCost.included ? '选择材料或填写底装买价' : `${incomplete ? '已计价合计' : '总成本'}：${money(combined)}`)}{uiText(incomplete ? ' · 待补齐' : '')}</output></div>
    </section>
    {!!preparation.steps.length && <details className="cb-prep-reference"><summary>{uiText("底座准备参考 · 通用攻略（按需查阅）")}</summary>
      <p className="wb-fine">{uiText("以下是从未准备底座开始的可能环节，请按实际底装已完成的准备选择查阅。参考实作为精制底座，此处按普通裂痕戒指整理，查阅日期 ")}{uiText(preparation.checkedAt ?? '未记录')}{uiText("。需要记账的额外消耗可通过“补记耗材”加入。")}</p>
      {preparation.steps.map(step => <details key={step.title}><summary>{uiText(step.title)}</summary><p className="wb-fine">{uiText(step.text)}</p><div className="cb-reference-materials">{step.materials.map(name => <a key={name} className="wb-link" href={englishPoe2dbUrl(name)} target="_blank" rel="noreferrer"><OfficialCurrencyIcon materialName={name} label={uiText(blueprintMaterialLabel(name))} />{uiText(blueprintMaterialLabel(name))} ↗</a>)}</div></details>)}
      <div>{BREACH_GUIDE_SOURCES.map(source => <p className="wb-fine" key={source.url}><a className="wb-link" href={source.url} target="_blank" rel="noreferrer">{uiText(source.kind === 'community' ? '社区实作' : '游戏数据')} · {uiText(source.label)} ↗</a></p>)}</div>
    </details>}
  </section>;
}
