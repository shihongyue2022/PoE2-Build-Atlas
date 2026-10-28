import { uiText } from './uiLocale';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Engine } from '../lib/engine';
import type { SolveProgress, SolveResult } from '../lib/solve';
import { craftBlueprint, blueprintBaseTrade, blueprintTargetTrade, blueprintActualBase, blueprintActionMaterials, blueprintMaterialLabel, EMPTY_BLUEPRINT_CHOICES, EMPTY_ACTUAL_CHOICES, actualPasteChoices, type ActualBaseChoices, type CraftBlueprintChoices, type CraftBlueprintGoal, type BlueprintBaseRarity } from './craftBlueprint';
import type { GearTrade } from '../lib/gearTrade';
import { EXAMPLE_RING, EXAMPLE_AMULET, parseWorkbenchItem } from './itemImport';
import { translateBase, translateCurrency, translateMod } from './localization';
import { computeWorkbench } from './compute';
import { makeSolveRequest, type CraftOptions } from './model';
import CraftCostAmount from './CraftCostAmount';
import { craftCostEvidence } from './craftAdvice';
import { englishPoe2dbUrl } from './poe2dbReference';
import { explainCraftReason } from './resultPresentation';
import OfficialItemArt from './OfficialItemArt';
import OfficialCurrencyIcon from './OfficialCurrencyIcon';
import { getCurrencyImageIdForAction } from './currencyImages';
import PolicyView from './CraftPolicyView';
import Icon from './WorkbenchIcon';
import { parseEquipment } from './genericEquipment';
import { readAffixReference, referenceLabel, type AffixReferenceResult } from './affixReference';
import { HOSTED_WORKBENCH } from './workbenchRuntime';
import { BREACH_RING_SAMPLE } from './fixtures/breachRing';
import { breachPreparation } from './craftReference';
import CraftPreparationFlow from './CraftPreparationFlow';
import CraftTargetEditor from './CraftTargetEditor';
import CraftBaseComparison from './CraftBaseComparison';
import CraftCheckpointPanel from './CraftCheckpointPanel';
import { evaluateCheckpoint, type CraftCheckpoint, type CheckpointReview } from './craftCheckpoint';
import CraftRouteFlow from './CraftRouteFlow';
import { CRAFT_AFFIX_CATEGORIES } from './craftAffixCategories';
import './craftBlueprint.css';

const STORAGE_KEY = 'poe2-workbench-craft-blueprint-v1';
interface BlueprintState extends CraftBlueprintChoices { raw: string; level: number; actualRaw: string; budgetBaseRaw?: string; actualChoices: ActualBaseChoices; baseRarity: BlueprintBaseRarity }
function readBlueprint(raw?: string): BlueprintState {
  const empty: BlueprintState = { ...EMPTY_BLUEPRINT_CHOICES, raw: raw ?? '', level: 0, actualRaw: '', actualChoices: EMPTY_ACTUAL_CHOICES, baseRarity: 'nonunique' };
  if (raw !== undefined) return empty;
  try {
    const input: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return empty;
    const value = input as Record<string, unknown>;
    if (typeof value.raw !== 'string' || value.raw.length > 64_000) return empty;
    const record = (input: unknown) => input && typeof input === 'object' && !Array.isArray(input) ? Object.entries(input).slice(0, 30) : [];
    const strings = (input: unknown) => Array.isArray(input) ? input.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 4000).slice(0, 30) : [];
    const modIds: Record<string, string> = {}, replacements: Record<string, string> = {}, tiers: Record<string, number> = {};
    const actualChoices: ActualBaseChoices = { modIds: {}, tiers: {}, split: [] };
    if (value.actualChoices && typeof value.actualChoices === 'object' && !Array.isArray(value.actualChoices)) {
      const input = value.actualChoices as Record<string, unknown>;
      for (const [key, entry] of record(input.modIds)) if (typeof entry === 'string' && entry.length < 300) actualChoices.modIds[key] = entry;
      for (const [key, entry] of record(input.tiers)) if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 1 && entry < 100) actualChoices.tiers[key] = entry;
      actualChoices.split = strings(input.split);
    }
    for (const [key, entry] of record(value.modIds)) if (typeof entry === 'string') modIds[key] = entry;
    for (const [key, entry] of record(value.replacements)) if (typeof entry === 'string' && entry.length < 300) replacements[key] = entry;
    for (const [key, entry] of record(value.tiers)) if (typeof entry === 'number' && Number.isInteger(entry) && entry > 0 && entry < 100) tiers[key] = entry;
    const extra = (Array.isArray(value.extra) ? value.extra as unknown[] : []).slice(0, 6).flatMap(input => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
      const entry = input as Record<string, unknown>;
      if (typeof entry.modId !== 'string' || entry.modId.length > 300 || typeof entry.tierDisplay !== 'number' || !Number.isInteger(entry.tierDisplay) || entry.tierDisplay < 1 || entry.tierDisplay > 99) return [];
      return [{ modId: entry.modId, tierDisplay: entry.tierDisplay }];
    });
    const seen = new Set<string>();
    const goals: CraftBlueprintGoal[] | undefined = Array.isArray(value.goals) ? value.goals.slice(0, 12).flatMap(input => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
      const entry = input as Record<string, unknown>;
      if (typeof entry.key !== 'string' || !entry.key || entry.key.length > 4000 || seen.has(entry.key) || !['prefix', 'suffix'].includes(String(entry.side))) return [];
      seen.add(entry.key);
      return [{ key: entry.key, side: entry.side as 'prefix' | 'suffix', enabled: entry.enabled !== false,
        ...(typeof entry.referenceKey === 'string' && entry.referenceKey.length <= 4000 ? { referenceKey: entry.referenceKey } : {}),
        ...(typeof entry.modId === 'string' && entry.modId.length <= 300 ? { modId: entry.modId } : {}),
        ...(typeof entry.tierDisplay === 'number' && Number.isInteger(entry.tierDisplay) && entry.tierDisplay >= 1 && entry.tierDisplay <= 99 ? { tierDisplay: entry.tierDisplay } : {}),
        ...(entry.category === 'all' || CRAFT_AFFIX_CATEGORIES.some(([id]) => id === entry.category) ? { category: String(entry.category) } : {}),
      }];
    }) : undefined;
    return { raw: value.raw, actualRaw: typeof value.actualRaw === 'string' && value.actualRaw.length <= 64_000 ? value.actualRaw : '',
      budgetBaseRaw: typeof value.budgetBaseRaw === 'string' && value.budgetBaseRaw.length <= 64_000 ? value.budgetBaseRaw : undefined,
      level: typeof value.level === 'number' && Number.isInteger(value.level) && value.level >= 0 && value.level <= 100 ? value.level : 0,
      baseRarity: ['nonunique', 'normal', 'magic', 'rare'].includes(String(value.baseRarity)) ? value.baseRarity as BlueprintBaseRarity : 'nonunique',
      modIds, tiers, replacements, extra, goals, actualChoices,
      split: strings(value.split), excluded: strings(value.excluded) };
  } catch { return empty; }
}

export default function CraftBlueprintPanel({ engine, league, overrides, initialRaw, tradeData }: {
  engine: Engine; league: string; overrides: Record<string, number>; initialRaw?: string; tradeData?: GearTrade | null;
}) {
  const [state, setState] = useState(() => readBlueprint(initialRaw)), [draft, setDraft] = useState(() => readBlueprint(initialRaw).raw);
  const [error, setError] = useState(''), [storageError, setStorageError] = useState('');
  const [confirmedRaw, setConfirmedRaw] = useState<string>(), [baseError, setBaseError] = useState('');
  const [importedRaw, setImportedRaw] = useState<string>();
  const [execution, setExecution] = useState<ReturnType<typeof blueprintActualBase>>();
  const [anchor, setAnchor] = useState<CraftCheckpoint | null>(null), [review, setReview] = useState<CheckpointReview | null>(null);
  const [effort, setEffort] = useState(15_000), [optionOverride, setOptionOverride] = useState<Partial<CraftOptions>>({});
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState<SolveProgress>();
  const [reference, setReference] = useState<AffixReferenceResult>(), [referenceError, setReferenceError] = useState('');
  const [stored, setStored] = useState<{ signature: string; result: SolveResult }>(), [nodeKey, setNodeKey] = useState('');
  const [routeIndex, setRouteIndex] = useState(0);
  const runner = useRef<ReturnType<typeof computeWorkbench> | null>(null), generation = useRef(0);
  const reading = useMemo(() => {
    if (!state.raw.trim()) return {};
    try { return { blueprint: craftBlueprint(engine, state.raw, state, state.level) }; }
    catch (reason) { return { failure: reason instanceof Error ? reason.message : '成品样例未能解析。' }; }
  }, [engine, state]);
  const blueprint = reading.blueprint, actualRaw = state.actualRaw;
  const actualSignature = JSON.stringify([actualRaw, state.actualChoices]);
  const actualReading = useMemo(() => importedRaw === actualRaw ? parseWorkbenchItem(engine.data, actualRaw, actualPasteChoices(state.actualChoices)) : null, [engine, importedRaw, actualRaw, state.actualChoices]);
  const options = useMemo(() => ({ ...blueprint?.options, ...optionOverride }) as CraftOptions, [blueprint?.options, optionOverride]);
  const actual = useMemo(() => {
    if (!blueprint || !confirmedRaw || confirmedRaw !== actualSignature) return {};
    try { return { start: blueprintActualBase(engine, blueprint, actualRaw, options, state.actualChoices) }; }
    catch (reason) { return { issue: reason instanceof Error ? reason.message : '实际底装未能核对，请重新复制。' }; }
  }, [engine, blueprint, confirmedRaw, actualRaw, actualSignature, options, state.actualChoices]);
  const purchase = useMemo(() => {
    if (!blueprint) return {};
    if (!tradeData) return { issue: '官方属性映射正在加载；仅按底座购买的入口仍可使用。' };
    try { return { market: blueprintTargetTrade(engine, blueprint, tradeData, league) }; }
    catch (reason) { return { issue: reason instanceof Error ? reason.message : '所选词缀的官方查询暂未生成。' }; }
  }, [engine, blueprint, tradeData, league]);
  const preparation = blueprint && breachPreparation(blueprint.base?.english, blueprint.reference.quality);
  const referenceItem = useMemo(() => { const item = parseEquipment(state.raw); return item?.rarity !== 'unique' ? item : null; }, [state.raw]);
  useEffect(() => {
    if (HOSTED_WORKBENCH || !referenceItem?.baseNameEnglish) return;
    const task = new AbortController();
    void readAffixReference(referenceItem, task.signal).then(value => { if (!task.signal.aborted) { setReference(value); setReferenceError(''); } })
      .catch(() => { if (!task.signal.aborted) setReferenceError('英文来源暂未读到，可打开底座原文核对。'); });
    return () => task.abort();
  }, [referenceItem]);
  const baseReference = reference?.name === blueprint?.base?.english ? reference : undefined;
  const signature = JSON.stringify([state, confirmedRaw, options, overrides, engine.data.patch, effort]);
  const currentSignature = useRef(signature); useEffect(() => { currentSignature.current = signature; });
  useEffect(() => () => { generation.current++; runner.current?.cancel(); }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { queueMicrotask(() => setStorageError('目标研究暂未保存到浏览器；页面内仍可继续。')); }
  }, [state]);
  const result = stored?.signature === signature ? stored.result : undefined;
  const evidence = result && craftCostEvidence(result);
  const currentNode = result?.markov.nodes.find(node => node.key === nodeKey) ?? result?.markov.nodes.find(node => node.isStart);
  const actions = [...new Set(result?.markov.nodes.flatMap(node => node.action ? [node.action] : []) ?? [])];
  const routes = result ? (result.kind === 'lab' ? result.result : result.plan).frontier : [];
  const selectedRoute = routes[routeIndex] ?? routes[0];
  const routeMaterials = (selectedRoute?.steps.map(step => step.label) ?? [result?.markov.nodes.find(node => node.isStart)?.action ?? '']).flatMap(blueprintActionMaterials);
  let market: ReturnType<typeof blueprintBaseTrade>, minimumMarket: ReturnType<typeof blueprintBaseTrade>, invalid = reading.failure ?? blueprint?.issues[0];
  if (blueprint && !invalid) {
    try {
      market = blueprintBaseTrade(blueprint, league, { rarity: state.baseRarity });
      if (blueprint.item.level > blueprint.minimumLevel) minimumMarket = blueprintBaseTrade(blueprint, league, { rarity: state.baseRarity, minimumLevel: blueprint.minimumLevel });
    } catch (reason) { invalid = reason instanceof Error ? reason.message : '请确认交易赛季。'; }
  }
  const calculationIssue = invalid ?? (blueprint?.researchOnly ? '此部位可调查成品、底座和词缀池；具体通货成本与逐步执行暂只支持戒指／项链，不套用其他部位的计算结果。' : undefined)
    ?? actual.issue ?? (!actual.start ? '请先粘贴实际底装并点击“核对底装”，再生成制作手顺。' : undefined);
  function cancel() { generation.current++; runner.current?.cancel(); runner.current = null; setBusy(false); }
  function resetExecution() { setExecution(undefined); setAnchor(null); setReview(null); }
  function change(patch: Partial<BlueprintState>) { cancel(); resetExecution(); setError(''); setBaseError(''); setState(old => ({ ...old, ...patch })); }
  function importReference(raw: string) {
    if (raw.length > 64_000) { setError('成品文本超过 64 KB，请只复制一件完整装备。'); return; }
    cancel(); setError(''); setConfirmedRaw(undefined); setBaseError(''); setOptionOverride({}); setStored(undefined); setDraft(raw);
    setImportedRaw(undefined); resetExecution();
    setState({ ...EMPTY_BLUEPRINT_CHOICES, raw, level: 0, actualRaw: '', actualChoices: EMPTY_ACTUAL_CHOICES, baseRarity: 'nonunique' });
  }
  function importBase() {
    cancel(); setError(''); setBaseError(''); setConfirmedRaw(undefined);
    const parsed = parseWorkbenchItem(engine.data, actualRaw, actualPasteChoices(state.actualChoices));
    if (!parsed) { setBaseError('未读到完整底装，请包含稀有度、底座与物品等级。'); return; }
    setImportedRaw(actualRaw);
    setState(old => ({ ...old, budgetBaseRaw: old.budgetBaseRaw ?? actualRaw }));
  }
  function confirmBase() {
    if (!blueprint || !actualRaw.trim()) return;
    cancel(); setError(''); setBaseError(''); setConfirmedRaw(undefined);
    try { blueprintActualBase(engine, blueprint, actualRaw, options, state.actualChoices); setConfirmedRaw(actualSignature); }
    catch (reason) { setBaseError(reason instanceof Error ? reason.message : '实际底装未能核对。'); }
  }
  async function calculate() {
    if (!blueprint || !actual.start || calculationIssue || busy) return;
    const token = ++generation.current, basis = signature;
    setBusy(true); setError(''); setProgress(undefined);
    try {
      const request = makeSolveRequest(engine, actual.start.item, actual.start.targets, blueprint.mods, actual.start.options, effort, 0, false);
      const job = computeWorkbench(request, overrides, value => { if (generation.current === token) setProgress(value); }); runner.current = job;
      const answer = await job.promise;
      if (generation.current === token && currentSignature.current === basis) { setStored({ signature: basis, result: answer }); setNodeKey(answer.markov.nodes.find(node => node.isStart)?.key ?? ''); setRouteIndex(0); }
    } catch (reason) { if (generation.current === token) setError(reason instanceof Error ? reason.message : '制作路线未能完成。'); }
    finally { if (generation.current === token) { setBusy(false); runner.current = null; } }
  }
  function checkStep(raw: string) {
    if (!anchor || !execution) return;
    cancel(); setStored(undefined);
    const parsed = raw.length <= 64_000 ? parseWorkbenchItem(engine.data, raw) : null;
    if (!parsed || !parsed.level || !parsed.baseId || parsed.rarity === 'unique' || parsed.craftingBlocked) {
      setReview({ status: 'unresolved', canContinue: false, title: '先核对操作后的装备文本', details: [parsed?.blockedReason ?? '请复制完整且可制作的同一件装备；当前底装与成本记录已保留。'] }); return;
    }
    const item = { baseId: parsed.baseId, level: parsed.level, rarity: parsed.rarity, prefixes: parsed.prefixes, suffixes: parsed.suffixes };
    const checked = evaluateCheckpoint(anchor, { item, baseName: parsed.baseNameEnglish ?? parsed.baseName, complete: parsed.complete });
    const fractureChanged = (['prefixes', 'suffixes'] as const).some(side => anchor.before[side].some(before => before.fractured
      && !item[side].some(after => after.modId === before.modId && after.fractured && after.tierDisplay === before.tierDisplay)));
    if (fractureChanged && !['mismatch', 'unresolved'].includes(checked.status)) {
      setReview({ status: 'mismatch', canContinue: false, title: '破裂锁定状态与操作前不一致', details: ['请重新复制并核对破裂标记、阶层和前后缀位置，尚未替换当前底装。'] }); return;
    }
    setReview(checked);
    if (['unresolved', 'mismatch'].includes(checked.status)) return;
    setState(old => ({ ...old, actualRaw: raw, budgetBaseRaw: old.budgetBaseRaw ?? old.actualRaw, actualChoices: EMPTY_ACTUAL_CHOICES }));
    setImportedRaw(raw); setConfirmedRaw(JSON.stringify([raw, EMPTY_ACTUAL_CHOICES])); setBaseError('');
    setExecution({ ...execution, item, raw, baseName: parsed.baseNameEnglish ?? parsed.baseName });
  }
  return <section className="cb-workflow" aria-label={uiText("成品目标制作规划")}>
    <header className="wb-panel"><div className="wb-section-head"><div><span className="wb-eyebrow">{uiText("成品样例 → 底装 → 词缀来源 → 制作手顺")}</span><h2>{uiText("我想做出这样的装备")}</h2></div><span className="wb-tag">{uiText("目标研究 · 不读取角色装备")}</span></div>
      <p className="wb-fine">{uiText("复制一件市场成品，先研究底座、词缀池与阶层上限，再调整想做的目标。已识别的装备均可调查；通货成本与逐步执行暂支持常规戒指和项链。")}</p>
      <details className="cb-reference" open={!state.raw}><summary>{uiText(state.raw ? '更换／查看成品样例原文' : '粘贴成品样例')}</summary><textarea className="cb-reference-input" aria-label={uiText("成品样例文本")} rows={6} value={draft} onChange={event => setDraft(event.target.value)} placeholder={uiText("粘贴游戏或官网复制的完整成品文本，建议使用高级复制。")} /><div className="wb-actions"><button type="button" className="wb-button primary" disabled={!draft.trim()} onClick={() => importReference(draft)}>{uiText("解析成品目标")}</button><button type="button" className="wb-button" onClick={() => importReference(EXAMPLE_RING)}>{uiText("戒指目标示例")}</button><button type="button" className="wb-button" onClick={() => importReference(BREACH_RING_SAMPLE)}>{uiText("60% 品质裂痕戒指")}</button><button type="button" className="wb-button" onClick={() => importReference(EXAMPLE_AMULET)}>{uiText("项链目标示例")}</button></div></details>
    </header>
    {(error || reading.failure || storageError) && <p className="wb-alert warning" role="alert">{uiText(error || reading.failure || storageError)}</p>}
    {blueprint && <>
      <section className="wb-panel cb-finished" aria-label={uiText("成品样例与可调目标")}><div className="wb-section-head"><h3>{uiText("成品参考 · ")}{uiText(translateBase(blueprint.parsed.baseName))}</h3><span className="wb-tag">{uiText("样例物等 ")}{uiText(blueprint.parsed.level ?? '未知')}{uiText(" · 目标可调整")}</span></div>
        <p className="wb-fine">{uiText(blueprint.reference.qualityLine ?? '未提供品质信息')}{uiText(" · 样例 ")}{uiText(blueprint.parsed.rows.filter(row => row.side === 'prefix').length)}{uiText(" 前缀 / ")}{uiText(blueprint.parsed.rows.filter(row => row.side === 'suffix').length)}{uiText(" 后缀")}</p>
        <div className="cb-finished-mods">{blueprint.referenceRows.map(row => <p key={row.key}><span className="wb-tag">{uiText(row.originalMod?.type === 'prefix' ? '前' : '后')}{uiText(row.referenceTier ? ` T${row.referenceTier}` : '')}{uiText(row.fractured ? ' · 破裂' : '')}{uiText(row.desecrated ? ' · 亵渎' : '')}</span> {uiText(translateMod(row.lines.join('；')))}{row.copied?.increase !== undefined && <small>{uiText("组头标注增加 ")}{uiText(row.copied.increase)}{uiText("%；品质与原始词池分开核对")}</small>}{row.tierConflict && <small>{uiText("复制标注 T")}{uiText(row.copied?.statedTier)}{uiText(" 与词池数值不符，请在下表确认目标。")}</small>}</p>)}</div>
      </section>
      <section className="wb-panel cb-base" aria-label={uiText("底装购买与来源")}><div className="wb-section-head"><h3>{uiText("1 · 调查底装")}</h3><span className="wb-tag">{uiText("不继承成品词缀")}</span></div>
        <div className="cb-base-heading"><OfficialItemArt baseName={blueprint.base?.english ?? blueprint.parsed.baseName} label={uiText(translateBase(blueprint.parsed.baseName))} fallback={<Icon name="ring" size={48} />} /><div><strong>{uiText(translateBase(blueprint.parsed.baseName))}</strong><p className="wb-fine">{uiText(blueprint.base?.english ?? '原生英文底座待核对')}{uiText(" · 目标所需物等至少 ")}{uiText(blueprint.minimumLevel)}</p>
          <div className="wb-actions"><label>{uiText("底装物等")}<select aria-label={uiText("规划底装物等")} value={state.level} onChange={event => change({ level: Number(event.target.value) })}><option value={0}>{uiText("按目标最低需求 · ")}{uiText(blueprint.minimumLevel)}+</option>{[60, 75, 80, 82, 84, 86].filter(level => level >= blueprint.minimumLevel).map(level => <option key={level} value={level}>{uiText("物等 ")}{uiText(level)}+</option>)}</select></label>
            <label>{uiText("稀有度")}<select aria-label={uiText("底材稀有度")} value={state.baseRarity} onChange={event => change({ baseRarity: event.target.value as BlueprintBaseRarity })}><option value="nonunique">{uiText("非传奇 · 白／蓝／黄")}</option><option value="normal">{uiText("普通 · 白装")}</option><option value="magic">{uiText("魔法 · 蓝装")}</option><option value="rare">{uiText("稀有 · 黄装")}</option></select></label></div></div></div>
        <div className="wb-actions">{market && <a className="wb-button primary" href={market.url} target="_blank" rel="noreferrer">{uiText("官网搜索底材 · 物等 ")}{uiText(blueprint.item.level)}+ ↗</a>}{minimumMarket && <a className="wb-link" href={minimumMarket.url} target="_blank" rel="noreferrer">{uiText("按目标最低物等 ")}{uiText(blueprint.minimumLevel)}{uiText("+ 搜 ↗")}</a>}{blueprint.base && <a className="wb-link" href={englishPoe2dbUrl(blueprint.base.english)} target="_blank" rel="noreferrer">{uiText("底座掉落／获取来源原文 ↗")}</a>}</div>
        <p className="wb-fine">{uiText("默认搜同底座的白／蓝／黄非传奇，未腐化、未复制，不要求成品词缀。带词缀底材需导入核对后按实际状态计算；资料读取仅核对底座与来源，当前赛季是否有挂牌以官网结果为准。")}</p>
        {baseReference && <details><summary>{uiText("已读取的底座资料 · ")}{uiText(baseReference.checkedAt.slice(0, 10))}</summary>{baseReference.baseDetails?.dropLevel !== undefined && <p className="wb-fine">{uiText("资料掉落等级：")}{uiText(baseReference.baseDetails.dropLevel)}{uiText("（不等于制作所需物等）。")}</p>}{baseReference.modifiers.filter(row => row.origin === 'implicit').map((row, index) => <p key={index} className="wb-fine" title={uiText(row.english)}>{uiText(referenceLabel(row))}</p>)}<p className="wb-fine">{uiText(baseReference.baseDetails?.acquisition.length ? baseReference.baseDetails.acquisition.join('；') : '页面未提供可核对的具体掉落地点；市场购买入口可直接使用，不自动指定刷图地点。')}</p></details>}
        {!baseReference && referenceError && <p className="wb-fine">{uiText(referenceError)}</p>}
      </section>
      <section className="wb-panel" aria-label={uiText("目标词缀来源调查")}><div className="wb-section-head"><h3>{uiText("2 · 调整成品目标与词缀池")}</h3><span className="wb-tag">{uiText("前缀 ")}{uiText(blueprint.slots.prefixes)}/{uiText(blueprint.limits.prefixes)}{uiText(" · 后缀 ")}{uiText(blueprint.slots.suffixes)}/{uiText(blueprint.limits.suffixes)}{uiText(" · 精华／合金 ")}{uiText(blueprint.slots.crafted)}/{uiText(blueprint.limits.crafted)}</span></div>
        <p className="wb-fine">{uiText("按前后缀、属性分类选择目标，再选阶层。这里显示原始词池范围，品质不改变阶层；样例原文保留在上方。")}</p>
        {!actualReading ? <CraftTargetEditor key={state.raw} blueprint={blueprint} choices={state} onChange={change} /> : <p className="wb-fine">{uiText("底装已导入，目标微调已移到第 3 步右侧，与此处的词缀池和购买条件同步。")}</p>}
        <div className="cb-purchase" role="group" aria-label={uiText("按目标购买底装")}>
          <div className="wb-actions"><strong>{uiText("购买底装")}</strong><span className="wb-fine">{uiText(blueprint.targets.length)}{uiText(" 条目标同时满足 · 物等 ≥ ")}{uiText(blueprint.item.level)}</span>
            {purchase.market ? <a className="wb-button primary" href={purchase.market.url} target="_blank" rel="noreferrer">{uiText("按已选词缀购买 ↗")}</a> : <button className="wb-button primary" type="button" disabled>{uiText("按已选词缀购买")}</button>}
            {market && <a className="wb-link" href={market.url} target="_blank" rel="noreferrer">{uiText("仅按底座购买 ↗")}</a>}
          </div>
          <p className="wb-fine">{uiText("按所选阶层的最低数值联合检索，同底座、未腐化、未复制，价格升序。只想买部分词缀底材时，取消其余目标；买到后粘贴实际底装再计算手顺。")}</p>
          {purchase.issue && <p className="wb-fine cb-purchase-issue" role="status">{uiText("联合购买链接未生成：")}{uiText(purchase.issue)}</p>}
          {purchase.market && <details><summary>{uiText("核对官网检索条件")}</summary><ul>{purchase.market.rows.map(row => <li key={row.key}>{uiText(row.label)}{uiText(row.min ? ` ≥ ${row.min}` : ' · 存在此属性')}</li>)}</ul><p className="wb-fine">{uiText("数值取原始词池下限，范围伤害按官网平均值检索。品质或其他增幅可能使较低阶层达到相同数值；结果仍需核对阶层、来源与空余词缀。")}</p></details>}
        </div>
        {!!blueprint.parsed.skipped.length && <details><summary>{uiText("固定／符文／附魔 · ")}{uiText(blueprint.parsed.skipped.length)}{uiText(" 组")}</summary><p className="wb-fine">{uiText("以下不属于普通显式词缀路线，需单独核对固定底座、符文、品质或最终处理；未声称能按下方手顺完整复刻这些效果。")}</p>{blueprint.parsed.skipped.map((row, index) => <p className="wb-fine" key={index}>{uiText(row.kind)} · {uiText(row.lines.join('；'))}</p>)}</details>}
        {!!blueprint.parsed.unmatchedLines.length && <p className="wb-inline-warning">{uiText("未识别原文：")}{uiText(blueprint.parsed.unmatchedLines.join('；'))}</p>}
        {blueprint.parsed.corrupted && <p className="wb-fine">{uiText("样例已腐化，仅用于研究目标；购买底装仍要求未腐化，腐化独有效果未纳入普通路线。")}</p>}
      </section>
      {!blueprint.researchOnly && <section className="wb-panel cb-actual-base" aria-label={uiText("实际底装核对")}><div className="wb-section-head"><h3>{uiText("3 · 导入底装并对照目标")}</h3><span className="wb-tag">{uiText(actual.start ? '已核对 · 用于下方计算' : actualReading ? '已导入 · 可微调目标' : '先导入，再对比')}</span></div>
        <p className="wb-fine">{uiText("先导入真正买到的底装，再左右对比已有词缀与目标，勾选本次要做的属性。目标冲突也能先导入；调整后核对通过才可计算。")}</p>
        <details open={!actualReading} className="cb-actual-source"><summary>{uiText("实际底装原文／重新导入")}</summary><textarea rows={4} maxLength={64_000} aria-label={uiText("实际购买底装文本")} value={actualRaw} onChange={event => { setImportedRaw(undefined); setConfirmedRaw(undefined); change({ actualRaw: event.target.value, budgetBaseRaw: undefined, actualChoices: EMPTY_ACTUAL_CHOICES }); }} placeholder={uiText("复制实际底装的完整文本；带已有词缀的底材也可以。")} />
          <button className="wb-button" type="button" disabled={!actualRaw.trim()} onClick={importBase}>{uiText("导入底装")}</button>
        </details>
        {actualReading && <CraftBaseComparison parsed={actualReading} blueprint={blueprint} choices={state} actualChoices={state.actualChoices} onGoalChange={change} onActualChange={choices => { setConfirmedRaw(undefined); change({ actualChoices: choices }); }} />}
        <div className="wb-actions"><button className="wb-button primary" type="button" disabled={!actualReading || !!invalid} onClick={confirmBase}>{uiText("核对底装")}</button>
          {actual.start && <span className="wb-fine" role="status">{uiText("已核对：")}{uiText(translateBase(actual.start.baseName))}{uiText(" · 物等 ")}{uiText(actual.start.item.level)} · {uiText(({ normal: '普通', magic: '魔法', rare: '稀有' } as const)[actual.start.item.rarity])}{uiText(" · 已有 ")}{uiText(actual.start.item.prefixes.length)}{uiText(" 前 / ")}{uiText(actual.start.item.suffixes.length)}{uiText(" 后 · ")}{uiText([...actual.start.item.prefixes, ...actual.start.item.suffixes].filter(entry => entry.fractured).length)}{uiText(" 条破裂锁定")}</span>}
        </div>
        {(baseError || actual.issue) && <p className="wb-inline-warning" role="alert">{uiText(baseError || actual.issue)}</p>}
      </section>}
      <section className="wb-panel cb-route" aria-label={uiText("从底装计算制作手顺")}><div className="wb-section-head"><h3>{uiText("4 · 计算具体通货与预兆手顺")}</h3><select aria-label={uiText("目标路线搜索精度")} value={effort} onChange={event => { cancel(); setEffort(Number(event.target.value)); }}><option value={5000}>{uiText("快速 · 约 5 秒")}</option><option value={15000}>{uiText("标准 · 约 15 秒")}</option><option value={60000}>{uiText("深入 · 约 60 秒")}</option></select></div>
        <p className="wb-fine">{uiText("从已核对的实际底装开始，按其真实物等、稀有度、已有词缀与破裂状态求解。自动比较普通／高阶／完美通货、预兆、精华、合金与亵渎。")}{uiText(preparation ? '计算只覆盖显式词缀阶段，不包含品质准备、破裂与催化消耗。' : '')}{uiText("目标是所选阶层或更好，不保证样例的具体 roll。")}</p>
        <details><summary>{uiText("可用机制与规则来源")}</summary><div className="wb-checks">{([['strengths', '高阶／完美通货'], ['omens', '预兆'], ['essences', '精华／合金'], ['desecration', '亵渎（含估计权重）']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={options[key] ?? false} onChange={event => { cancel(); setOptionOverride(old => ({ ...old, [key]: event.target.checked })); }} />{uiText(label)}</label>)}</div><a href={englishPoe2dbUrl('Crafting')} className="wb-link" target="_blank" rel="noreferrer">{uiText("通货、预兆与阶段限制原文 ↗")}</a><p className="wb-fine">{uiText("当前引擎规则 ")}{uiText(engine.data.patch)}{uiText("，与现行补丁差异仍需核对；未建模机制不保证可复刻。")}</p></details>
        {calculationIssue && <p role="status" className="wb-inline-warning">{uiText(calculationIssue)}</p>}
        <div className="wb-actions"><button className="wb-button primary" type="button" disabled={!!calculationIssue && !busy} onClick={() => busy ? cancel() : void calculate()}>{uiText(busy ? '停止计算' : '生成制作手顺')}</button>{busy && <span className="wb-fine">{uiText(Math.round((progress?.fraction ?? 0) * 100))}{uiText("% · 正在比较路线")}</span>}</div>
        {stored && !result && <p className="wb-fine">{uiText("底装、目标、机制或价格已变化，请重新计算手顺。")}</p>}
        {evidence && <><p className="cb-cost">{uiText("材料期望：")}{evidence.cost === undefined ? '尚无可用成本' : <CraftCostAmount value={evidence.cost} prices={engine.prices} overrides={overrides} />}{uiText(evidence.kind === 'upper' ? '（策略上界）' : evidence.kind === 'lower' ? '（成本下界）' : '')}{uiText(" · 未含底装买价")}</p>{evidence.reason && <p className="wb-inline-warning">{uiText(evidence.reason)}</p>}{evidence.assumedOdds && <p className="wb-inline-warning">{uiText("路线依赖尚未验证的权重，成本为快照参考。")}</p>}</>}
        {result?.markov.reason && <p className="wb-fine">{uiText(explainCraftReason(result.markov.reason).message)}</p>}
        {routes.length > 0 && <CraftRouteFlow routes={routes} selected={routeIndex} onSelect={setRouteIndex} />}
        {result && currentNode && evidence && ['exact', 'upper'].includes(evidence.kind) && <details className="cb-policy-details" open={!execution}><summary>{uiText("动态策略与结果分支")}</summary><div className="wb-actions cb-step-materials">{blueprintActionMaterials(currentNode.action ?? '').map(name => <a key={name} className="wb-link" href={englishPoe2dbUrl(name)} target="_blank" rel="noreferrer">{uiText(blueprintMaterialLabel(name))} ↗</a>)}</div><p className="wb-fine">{uiText("如本步列出预兆，先激活对应预兆，再使用本步通货；按实际结果选择后续分支。")}</p><PolicyView result={result} node={currentNode} onNode={setNodeKey} prices={engine.prices} overrides={overrides} /></details>}
        {!!actions.length && evidence && ['exact', 'upper'].includes(evidence.kind) && <details className="cb-materials"><summary>{uiText("路线涉及的通货／预兆 · ")}{uiText(actions.length)}{uiText(" 种操作")}</summary><p className="wb-fine">{uiText("不同分支按结果选择，不是依次把所有材料都用一遍。这里不预估固定购买数量。")}</p>{actions.map(action => <div key={action}><OfficialCurrencyIcon currencyId={getCurrencyImageIdForAction(action)} label={uiText(translateCurrency(action))} /><span>{uiText(blueprintActionMaterials(action).map(name => blueprintMaterialLabel(name)).join(' ＋ ') || translateCurrency(action))}<small>{uiText(action)}</small></span></div>)}</details>}
        {result && actual.start && !execution && <div className="wb-actions"><button className="wb-button primary" type="button" onClick={() => { setExecution(actual.start); setAnchor(null); setReview(null); }}>{uiText("在本页开始逐步核对")}</button><span className="wb-fine">{uiText("每步更新实际底装，下方材料用量和成本记录持续保留。")}</span></div>}
        {execution && <div className="cb-inline-checkpoint">
          <CraftCheckpointPanel item={execution.item} baseName={execution.baseName} targets={blueprint.targets} mods={blueprint.mods} anchor={anchor} review={review}
            suggestedAction={selectedRoute?.steps[0]?.label ?? result?.markov.nodes.find(node => node.isStart)?.action}
            onAnchor={value => { setAnchor(value); setReview(null); }} onCheckText={checkStep}
            onRecalculate={() => { if (busy) return; if (!actual.start || calculationIssue) { setBaseError(calculationIssue ?? '请先核对当前底装与目标。'); return; } setExecution(actual.start); setAnchor(null); setReview(null); void calculate(); }} />
        </div>}
      </section>
      {(actual.start || execution) && <CraftPreparationFlow key={JSON.stringify([state.raw, league, state.budgetBaseRaw ?? actualRaw])} preparation={preparation ?? { steps: [] }} engine={engine} league={league} referenceRaw={JSON.stringify([state.raw, state.budgetBaseRaw ?? actualRaw])} routeMaterials={routeMaterials} routeLabel={selectedRoute ? `路线 ${routes.indexOf(selectedRoute) + 1}` : result ? '当前建议步骤' : '已记录用量'} />}
    </>}
  </section>;
}
