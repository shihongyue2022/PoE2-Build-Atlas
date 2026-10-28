import { uiText } from './uiLocale';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  loadEngine, listMods, listPerfectEssences, listDesecrated, priceBasis,
  type Engine, type EngineMod, type ExistingItem, type ItemModInput, type TargetInput,
} from '../lib/engine';
import { modFamilies } from '../lib/engineTypes';
import type { SolveProgress, SolveResult } from '../lib/solve';
import { translateMod, translateModAtTier, translateCurrency, translateBase, searchText } from './localization';
import { parseWorkbenchItem, EXAMPLE_RING, EXAMPLE_AMULET } from './itemImport';
import { JEWELLERY_BASES, findJewelleryBase } from './catalog';
import { fetchTradeLeagues, loadGearTrade, type TradeLeague } from './market';
import type { GearTrade } from '../lib/gearTrade';
import { getCraftActions, simulateCraft } from './simulator';
import { computeWorkbench } from './compute';
import { DEFAULT_OPTIONS, formatCost, formatPercent, makeSolveRequest, validateCraft, targetAvailability, regularAlternative, type CraftOptions } from './model';
import { explainCraftReason, presentMarkovResult } from './resultPresentation';
import OfficialItemArt from './OfficialItemArt';
import OfficialCurrencyIcon from './OfficialCurrencyIcon';
import { getOfficialCurrencyImage, getCurrencyImageIdForAction } from './currencyImages';
import EquipmentTradePanel from './EquipmentTradePanel';
import TradeMemoryPanel from './TradeMemoryPanel';
import LoadoutPanel from './LoadoutPanel';
import { useSavedLoadout, writeSavedLoadout } from './loadoutStore';
import { chooseComparisonSlot, type LoadoutContext } from './loadoutIntegration';
import { resolveSkillAffixSearch, type SkillAffixSearch } from './skillAffixGuide';
import type { UpgradeCandidateInput, UpgradeSearchSnapshot, UpgradeMarketQuote } from './upgradeWorkflow';
import { rememberUpgradeCandidate } from './upgradePlanStore';
import { slotLabel, type LoadoutSlot } from './loadout';
import type { LoadoutQuote } from './loadoutQuotes';
import FinancePanel from './FinancePanel';
import { applyPobItemRepair } from './pobRepair';
import { parseEquipment } from './genericEquipment';
import CraftAdvisor from './CraftAdvisor';
import { recoverLegacyImport } from './legacyImport';
import { subscribeCompanion, publishCompanion, loadCompanionView, type CompanionPacket } from './companion';
import { evaluateCheckpoint, type CraftCheckpoint, type CheckpointReview } from './craftCheckpoint';
import { CraftCheckpointPanel } from './CraftCheckpointPanel';
import PolicyView from './CraftPolicyView';
import CraftCostAmount from './CraftCostAmount';
import CraftBlueprintPanel from './CraftBlueprintPanel';
import './workbench.css';
import './streamlined.css';
import Icon, { IconButton } from './WorkbenchIcon';
import { HOSTED_WORKBENCH, WORKBENCH_SOURCE } from './workbenchRuntime';
import LanguageSelect from './LanguageSelect';
import { useUiLocale } from './uiLocale';

type Tab = 'plan' | 'simulate' | 'trade' | 'gear' | 'finance' | 'settings';
interface Session {
  item: ExistingItem; baseName: string; targets: TargetInput[]; raw: string;
  league: string; overrides: Record<string, number>; options: CraftOptions; baseCost: number;
  reviewRequired?: boolean; craftingBlocked?: string; warnings?: string[];
  actualRollsInvalid?: boolean;
  checkpoint?: CraftCheckpoint | null;
  checkpointReview?: CheckpointReview | null;
}
const STORAGE_KEY = 'poe2-workbench-v1';
const INITIAL: Session = {
  item: { baseId: 'Rings', level: 82, rarity: 'normal', prefixes: [], suffixes: [] },
  // Verified against GGG's Forbidden Rites FAQ on 2026-10-22; never inferred from API ordering.
  baseName: 'Amethyst Ring', targets: [], raw: '', league: 'Forbidden Rites', overrides: {}, options: DEFAULT_OPTIONS, baseCost: 0,
};
function loadSession(): Session {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Session | null;
    const validEntry = (entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const row = entry as Record<string, unknown>;
      return typeof row.modId === 'string' && typeof row.tierDisplay === 'number' && Number.isInteger(row.tierDisplay) && row.tierDisplay > 0;
    };
    if (value && value.item && ['Rings', 'Amulets'].includes(value.item.baseId) && ['normal', 'magic', 'rare'].includes(value.item.rarity)
      && Array.isArray(value.item.prefixes) && Array.isArray(value.item.suffixes) && Array.isArray(value.targets)
      && value.item.prefixes.every(validEntry) && value.item.suffixes.every(validEntry) && value.targets.every(validEntry)
      && typeof value.baseName === 'string' && typeof value.item.level === 'number') {
      const safeOverrides = Object.fromEntries(Object.entries(value.overrides ?? {}).filter(([, price]) => typeof price === 'number' && Number.isFinite(price) && price > 0));
      return { ...INITIAL, ...value, raw: typeof value.raw === 'string' ? value.raw : '',
        league: typeof value.league === 'string' ? value.league : INITIAL.league,
        baseCost: Number.isFinite(value.baseCost) && value.baseCost >= 0 ? value.baseCost : 0,
        warnings: Array.isArray(value.warnings) ? value.warnings.filter((warning) => typeof warning === 'string') : [],
        craftingBlocked: typeof value.craftingBlocked === 'string' ? value.craftingBlocked : '',
        checkpoint: readCheckpoint(value.checkpoint), checkpointReview: readReview(value.checkpointReview),
        options: { ...DEFAULT_OPTIONS, ...value.options }, overrides: safeOverrides };
    }
  } catch { /* Storage may be disabled or contain an older session. */ }
  return INITIAL;
}
function readCheckpoint(value: unknown): CraftCheckpoint | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as CraftCheckpoint;
  const validMod = (entry: TargetInput) => entry && typeof entry.modId === 'string' && Number.isInteger(entry.tierDisplay) && entry.tierDisplay > 0;
  return typeof row.id === 'string' && typeof row.createdAt === 'string' && typeof row.action === 'string' && typeof row.baseName === 'string'
    && ['remove', 'add', 'goals'].includes(row.mode) && row.before && ['Rings', 'Amulets'].includes(row.before.baseId)
    && ['normal', 'magic', 'rare'].includes(row.before.rarity) && Number.isInteger(row.before.level) && row.before.level >= 1 && row.before.level <= 100
    && Array.isArray(row.before.prefixes) && row.before.prefixes.every(validMod) && Array.isArray(row.before.suffixes) && row.before.suffixes.every(validMod)
    && Array.isArray(row.targets) && row.targets.every(validMod) && Array.isArray(row.removeModIds) && row.removeModIds.every((id) => typeof id === 'string')
    && Array.isArray(row.preserveModIds) && row.preserveModIds.every((id) => typeof id === 'string') ? row : null;
}
function readReview(value: unknown): CheckpointReview | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as CheckpointReview;
  return ['met', 'missed', 'unchanged', 'mismatch', 'unresolved'].includes(row.status) && typeof row.title === 'string'
    && Array.isArray(row.details) && row.details.every((line) => typeof line === 'string')
    ? { ...row, canContinue: row.status === 'met' } : null;
}
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'gear', label: '角色装备', icon: 'equipment' },
  { id: 'trade', label: '官方查价', icon: 'search' },
  { id: 'plan', label: '制作策略', icon: 'route' },
  { id: 'finance', label: '交易追踪', icon: 'ledger' },
  { id: 'simulate', label: '自由模拟', icon: 'hammer' },
  { id: 'settings', label: '数据与价格', icon: 'sliders' },
];
const SOURCE_NAMES: Record<string, string> = { normal: '普通词缀', essence: '普通精华专属', perfect: '完美精华专属', alloy: '合金专属', desecrated: '亵渎专属', rune: '符文词缀' };
const RARITY_NAMES = { normal: '普通', magic: '魔法', rare: '稀有' };
const CURRENCY_LABELS: Record<string, string> = {
  transmute: '蜕变石', augment: '增幅石', regal: '富豪石', exalt: '崇高石', annul: '剥离石', chaos: '混沌石', alchemy: '点金石',
  transmute_greater: '高阶蜕变石', transmute_perfect: '完美蜕变石', augment_greater: '高阶增幅石', augment_perfect: '完美增幅石',
  regal_greater: '高阶富豪石', regal_perfect: '完美富豪石', exalt_greater: '高阶崇高石', exalt_perfect: '完美崇高石',
  chaos_greater: '高阶混沌石', chaos_perfect: '完美混沌石', divine: '神圣石', desecrate: '亵渎材料',
};

export default function WorkbenchApp() {
  useUiLocale();
  const [session, setSession] = useState<Session>(loadSession);
  const savedLoadout = useSavedLoadout();
  const [loadoutCandidate, setLoadoutCandidate] = useState<UpgradeCandidateInput>();
  const { item, targets, baseName, options, overrides, league } = session;
  const [engine, setEngine] = useState<Engine | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('gear');
  const [craftMode, setCraftMode] = useState<'blueprint' | 'execute'>('blueprint');
  const [blueprintReference, setBlueprintReference] = useState<{ id: string; raw: string }>();
  const planning = tab === 'plan' && craftMode === 'blueprint';
  const [search, setSearch] = useState('');
  const [side, setSide] = useState<'all' | 'prefix' | 'suffix'>('all');
  const [source, setSource] = useState<'all' | EngineMod['source']>('normal');
  const [pickerMode, setPickerMode] = useState<'target' | 'current'>('target');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteDraft, setPasteDraft] = useState(session.raw);
  const [notice, setNotice] = useState('');
  const [importWarnings, setImportWarnings] = useState<string[]>(session.warnings ?? []);
  const [needsReview, setNeedsReview] = useState(session.reviewRequired ?? Boolean(session.raw));
  const [blockedReason, setBlockedReason] = useState(session.craftingBlocked ?? '');
  const [result, setResult] = useState<SolveResult | null>(null);
  const [solvedSig, setSolvedSig] = useState('');
  const [solving, setSolving] = useState(false);
  const [advisorBusy, setAdvisorBusy] = useState(false);
  const [progress, setProgress] = useState<SolveProgress | null>(null);
  const [solveError, setSolveError] = useState('');
  const [effort, setEffort] = useState(15_000);
  const [playOut, setPlayOut] = useState(false);
  const [took, setTook] = useState(0);
  const [selectedNode, setSelectedNode] = useState('');
  const [leagues, setLeagues] = useState<TradeLeague[]>([]);
  const [leagueError, setLeagueError] = useState('');
  const [tradeData, setTradeData] = useState<GearTrade | null>(null);
  const [simulation, setSimulation] = useState<{ before: ExistingItem; after: ExistingItem; label: string; cost: number; priceKnown: boolean }[]>([]);
  const [historyAt, setHistoryAt] = useState(0);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(!session.targets.length);
  const [quickPrice, setQuickPrice] = useState<{ id: string; deliveryToken?: string; raw: string; item: ExistingItem; baseName: string; warnings: readonly string[]; complete: boolean } | null>(null);
  const [equipmentPrice, setEquipmentPrice] = useState<{ id: string; deliveryToken?: string; raw: string; source: 'hotkey' | 'paste' | 'loadout' | 'view'; intent: 'price' | 'upgrade' | 't1'; loadoutSlot?: LoadoutSlot; skillSearch?: SkillAffixSearch } | null>(null);
  const runner = useRef<ReturnType<typeof computeWorkbench> | null>(null);
  const lastSignature = useRef('');
  const companionHandler = useRef<(packet: CompanionPacket) => void>(() => {});
  const update = (patch: Partial<Session>) => setSession((old) => ({ ...old, ...patch }));

  const engineReady = useEffectEvent((value: Engine) => {
    setEngine(value);
    const recovered = recoverLegacyImport(value.data, session);
    if (!recovered) return;
    setSession((old) => ({ ...old, item: { ...old.item, prefixes: recovered.prefixes, suffixes: recovered.suffixes },
      reviewRequired: false, craftingBlocked: '', warnings: [], actualRollsInvalid: false }));
    setImportWarnings([]); setNeedsReview(false); setBlockedReason('');
    setNotice('已用原始文本重新识别旧会话中的亵渎／破裂词缀，并清除过期的导入警告。');
  });

  useEffect(() => { let active = true; loadEngine().then((value) => { if (active) engineReady(value); }).catch((error: unknown) => { if (active) setLoadError(String(error)); }); return () => { active = false; }; }, []);
  useEffect(() => subscribeCompanion((packet) => companionHandler.current(packet)), []);
  useEffect(() => {
    const controller = new AbortController();
    void loadCompanionView(window.location.search, controller.signal).then((packet) => {
      if (!packet || controller.signal.aborted) return;
      if (packet.mode === 'checkpoint') {
        setCraftMode('execute');
        setTab('plan');
        setNotice('已打开制作策略页，保留原锚点核对结果。此链接不会重复执行核对。');
      } else {
        openEquipmentPrice(packet.raw, 'view');
      }
    }).catch((error: unknown) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : '无法打开查价装备。'); });
    return () => controller.abort();
  }, []);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...session, reviewRequired: needsReview, craftingBlocked: blockedReason, warnings: importWarnings })); } catch { /* The session remains usable without storage. */ } }, [session, needsReview, blockedReason, importWarnings]);
  useEffect(() => () => runner.current?.cancel(), []);
  useEffect(() => {
    const controller = new AbortController();
    fetchTradeLeagues(controller.signal).then((rows) => {
      setLeagues(rows);
      // A league list has no guaranteed chronological ordering. Let the player choose explicitly.
    }).catch(() => { if (!controller.signal.aborted) setLeagueError('未能获取赛季列表，请填写官方交易页上的赛季名称。'); });
    loadGearTrade().then(setTradeData).catch(() => setLeagueError('交易属性映射加载失败，请刷新重试。'));
    return () => controller.abort();
  }, []);

  const effectiveEngine = useMemo(() => engine ? { ...engine, prices: { ...engine.prices, currency: { ...engine.prices.currency, ...overrides } } } : null, [engine, overrides]);
  const basis = engine ? priceBasis(engine) : null;
  const availableMods = useMemo(() => {
    if (!engine) return [];
    const normal = listMods(engine.data, item.baseId);
    return [...normal.prefixes, ...normal.suffixes, ...listPerfectEssences(engine.data, item.baseId), ...listDesecrated(engine.data, item.baseId)];
  }, [engine, item.baseId]);
  const modById = useMemo(() => new Map(availableMods.map((mod) => [mod.id, mod])), [availableMods]);
  const signature = JSON.stringify({ item, targets, options, overrides, baseName, blockedReason, needsReview, effort, playOut, baseCost: session.baseCost });
  const stale = Boolean(result && solvedSig !== signature);
  const baseInfo = findJewelleryBase(baseName);
  const restriction = blockedReason || (!baseInfo ? '尚未确认具体底座，请从列表选择正确底座并重新核对当前词缀。' : null)
    || (baseInfo && !baseInfo.supported ? baseInfo.unsupportedReason ?? '这个特殊底座的制作规则尚未支持。' : null)
    || (needsReview ? '导入内容需要核对，请补齐当前词缀后确认。' : null);
  const validation = restriction ?? validateCraft(item, targets, modById, options);

  useEffect(() => {
    lastSignature.current = signature;
    if (solving && solvedSig !== signature) runner.current?.cancel();
  }, [signature, solvedSig, solving]);

  const filteredMods = availableMods.filter((mod) => {
    if (side !== 'all' && mod.type !== side) return false;
    if (source !== 'all' && mod.source !== source && !(source === 'normal' && mod.source === 'rune')) return false;
    if (!mod.tiers.some((tier) => tier.ilvl <= item.level)) return false;
    return searchText(mod.text, translateMod(mod.text), mod.id, SOURCE_NAMES[mod.source] ?? '').includes(searchText(search));
  });
  const plan = result ? result.kind === 'item' ? result.plan : result.result : null;
  const markov = result?.markov;
  const resultView = markov ? presentMarkovResult(markov) : null;
  const currentNode = resultView?.hasCost ? markov?.nodes.find((node) => node.key === selectedNode) ?? markov?.nodes.find((node) => node.isStart) : undefined;
  const simActions = useMemo(() => effectiveEngine ? getCraftActions(effectiveEngine, item) : [], [effectiveEngine, item]);
  const simSpent = simulation.slice(0, historyAt).reduce((sum, entry) => sum + entry.cost, 0);
  const simUnpriced = simulation.slice(0, historyAt).filter((entry) => !entry.priceKnown).length;

  function setItem(next: ExistingItem, resetHistory = true) {
    update({ item: next, actualRollsInvalid: true });
    if (resetHistory) { setSimulation([]); setHistoryAt(0); }
  }
  function chooseBase(name: string) {
    const base = findJewelleryBase(name);
    if (!base) return;
    update({ baseName: base.english, item: { ...item, baseId: base.category, prefixes: [], suffixes: [], rarity: 'normal' }, targets: [], raw: '', actualRollsInvalid: false, checkpoint: null, checkpointReview: null });
    setBlockedReason(''); setNeedsReview(false); setImportWarnings([]); setSimulation([]); setHistoryAt(0); setNotice('');
  }
  function openEquipmentPrice(raw: string, source: 'hotkey' | 'paste' | 'loadout' | 'view', intent: 'price' | 'upgrade' | 't1' = 'price', packet?: CompanionPacket, loadoutSlot?: LoadoutSlot): boolean {
    const equipment = parseEquipment(raw);
    if (!equipment) { setNotice('没有识别到可查价的物品，请复制完整物品文本（包含稀有度和名称）。'); return false; }
    setEquipmentPrice({ id: packet?.id ?? crypto.randomUUID(), deliveryToken: packet?.deliveryToken, raw, source, intent, loadoutSlot });
    setQuickPrice(null); setTab('trade'); setPasteOpen(false);
    return true;
  }
  const loadoutContext: LoadoutContext | undefined = equipmentPrice?.loadoutSlot ? { state: savedLoadout.state, slot: equipmentPrice.loadoutSlot, raw: equipmentPrice.skillSearch ? savedLoadout.state.slots[equipmentPrice.loadoutSlot] ?? '' : equipmentPrice.raw } : undefined;
  function openSkillEquipmentSearch(request: SkillAffixSearch) {
    const target = resolveSkillAffixSearch(savedLoadout.state, request, engine?.data, tradeData);
    if (!target) { setNotice('技能或词池已变化，请返回技能增伤详情重新选择部位。'); return; }
    setEquipmentPrice({ id: crypto.randomUUID(), raw: target.raw, source: 'loadout', intent: 'upgrade', loadoutSlot: request.slot, skillSearch: request });
    setQuickPrice(null); setTab('trade'); setPasteOpen(false);
  }
  function compareWithLoadout(equipment: ReturnType<typeof parseEquipment>, search?: UpgradeSearchSnapshot, quote?: UpgradeMarketQuote) {
    if (!equipment) return;
    const slot = chooseComparisonSlot(savedLoadout.state, equipment, equipmentPrice?.loadoutSlot);
    if (!slot) { setNotice('这个物品暂无对应的角色装备栏位。'); return; }
    const id = crypto.randomUUID();
    const poolError = rememberUpgradeCandidate(savedLoadout.state, { id: `${quote?.id ?? id}:${slot}`, raw: equipment.raw, slot, quote });
    setLoadoutCandidate({ id, raw: equipment.raw, slot, search, quote }); setTab('gear');
    setNotice(`候选已送入${slotLabel(slot)}比较，尚未替换当前装备；${poolError || '已加入候选组合，可与其他部位一起核对。'}`);
  }
  function recordLoadoutQuote(quote: Omit<LoadoutQuote, 'itemText'>) {
    const context = loadoutContext;
    if (!context || context.state.slots[context.slot] !== context.raw || quote.league !== league || savedLoadout.error) {
      setNotice('角色装备或赛季已变化，请从当前装备栏重新查价后记录。'); return;
    }
    const error = writeSavedLoadout({ ...context.state, quotes: { ...context.state.quotes, [context.slot]: { ...quote, itemText: context.raw } } }, savedLoadout.raw);
    setNotice(error || `已记录${slotLabel(context.slot)}的挂牌参考，角色页和资产记录可复用；不代表实际成交价。`);
  }
  function importText(text = session.raw, purpose: 'auto' | 'checkpoint' | 'new-craft' = 'auto') {
    const general = purpose === 'auto' ? parseEquipment(text) : null;
    if (general && (!engine || general.rarity === 'unique' || !['accessory.ring', 'accessory.amulet'].includes(general.category))) {
      openEquipmentPrice(text, 'paste');
      setNotice(general.kind && general.kind !== 'equipment' ? '物品已送入全物品查价，可按阶级、等级和词缀调整搜索。' : '装备已送入全物品查价。角色装备栏可保存整套装备并比较换装。');
      return;
    }
    if (!engine) { setNotice('制作数据尚未就绪，请稍候再试；角色装备栏与全物品查价仍可使用。'); return; }
    const activeCheckpoint = purpose === 'new-craft' ? null : session.checkpoint;
    const rejectImport = (message: string) => {
      setNotice(message);
      if (!activeCheckpoint) return;
      const review: CheckpointReview = { status: 'unresolved', title: '本步结果尚未确认', details: [message, '已保留原制作状态，请重新复制完整装备文本。'], canContinue: false };
      update({ raw: text, checkpointReview: review });
      setPasteDraft(text);
      setPasteOpen(true);
      return review;
    };
    const parsed = parseWorkbenchItem(engine.data, text);
    if (purpose === 'auto' && (!parsed?.baseId || !['Rings', 'Amulets'].includes(parsed.baseId) || parsed.rarity === 'unique')) {
      if (openEquipmentPrice(text, 'paste')) {
        setNotice('装备已送入全物品查价。角色装备栏可保存整套装备并比较换装。');
        return;
      }
    }
    if (!parsed) return rejectImport('没有识别到装备，请粘贴游戏中复制的完整文本。');
    if (!parsed.baseId || !['Rings', 'Amulets'].includes(parsed.baseId)) return rejectImport(purpose === 'auto'
      ? '未能识别物品类别，请复制包含物品种类、稀有度、名称和底座的完整文本；其他装备、药剂与耗材可在官方查价中读取。'
      : '这件物品不适用于当前戒指／项链制作项目，请核对底座；其他物品可从官方查价读取。');
    if (parsed.rarity === 'unique') return rejectImport('传奇固定词缀不适用当前随机词缀制作规则，可在官方查价中读取。');
    const next: ExistingItem = {
      baseId: parsed.baseId, level: parsed.level ?? item.level, rarity: parsed.rarity,
      prefixes: parsed.prefixes, suffixes: parsed.suffixes,
    };
    const name = parsed.baseNameEnglish || parsed.baseName;
    const checkpointReview = activeCheckpoint ? evaluateCheckpoint(activeCheckpoint, { item: next, baseName: name, complete: parsed.complete }) : null;
    if (checkpointReview && ['mismatch', 'unresolved'].includes(checkpointReview.status)) {
      update({ raw: text, checkpointReview }); setPasteDraft(text); setPasteOpen(true);
      setNotice(checkpointReview.title); setImportWarnings([...parsed.warnings, ...parsed.unmatchedLines.map((line) => `未识别：${line}`)]);
      if (checkpointReview.status === 'unresolved') setNeedsReview(true);
      return checkpointReview;
    }
    update({ item: next, baseName: name, raw: text, actualRollsInvalid: false,
      ...(purpose === 'new-craft' ? { checkpoint: null, checkpointReview: null } : {}),
      ...(checkpointReview ? { checkpointReview } : {}),
      targets: purpose !== 'new-craft' && item.baseId === next.baseId && targets.length ? targets : [...next.prefixes, ...next.suffixes].map(({ modId, tierDisplay }) => ({ modId, tierDisplay })),
    });
    setPasteDraft(text);
    setBlockedReason(parsed.craftingBlocked ? parsed.blockedReason ?? '这件装备的状态不允许继续制作。' : '');
    setImportWarnings([...parsed.warnings, ...parsed.unmatchedLines.map((line) => `未识别：${line}`)]);
    setNeedsReview(!parsed.complete);
    setPasteOpen(!parsed.complete);
    setNotice(parsed.complete ? '装备已导入。选择目标后，就可以计算下一步。' : '已导入能确认的部分，请核对下方提示并补齐当前词缀。');
    setSimulation([]); setHistoryAt(0);
    return checkpointReview ?? undefined;
  }
  useEffect(() => { companionHandler.current = (packet) => {
    if (packet.mode === 'checkpoint') {
      if (!engine) {
        void publishCompanion(packet.id, { status: 'error', message: '制作数据尚未就绪，请打开工坊稍候再核对锚点。' }, packet.deliveryToken); return;
      }
      if (!session.checkpoint) {
        void publishCompanion(packet.id, { status: 'error', message: '请先在工坊设置本步制作锚点。', detail: 'Ctrl+Alt+G 用于核对操作后的结果。' }, packet.deliveryToken); return;
      }
      setTab('plan');
      setCraftMode('execute');
      const review = importText(packet.raw, 'checkpoint');
      void publishCompanion(packet.id, { status: review?.canContinue ? 'ready' : 'error', message: review?.title ?? '装备未能完整识别，请在工坊核对。', detail: review?.details.join('\n') ?? '已保留原制作状态，尚未批准下一步。' }, packet.deliveryToken);
      return;
    }
    const general = parseEquipment(packet.raw);
    if (general && (!engine || general.rarity === 'unique' || !['accessory.ring', 'accessory.amulet'].includes(general.category))) {
      openEquipmentPrice(packet.raw, 'hotkey', 'price', packet); return;
    }
    if (!engine) {
      void publishCompanion(packet.id, { status: 'error', message: '装备文本未识别，请复制完整物品信息并在工坊核对。' }, packet.deliveryToken); return;
    }
    const parsed = parseWorkbenchItem(engine.data, packet.raw);
    if (!parsed || !parsed.baseId || !['Rings', 'Amulets'].includes(parsed.baseId) || parsed.level === undefined || parsed.rarity === 'unique' || !parsed.complete) {
      if (!openEquipmentPrice(packet.raw, 'hotkey', 'price', packet)) void publishCompanion(packet.id, { status: 'error', message: '物品类别或文本未能识别，请在工坊核对。' }, packet.deliveryToken);
      return;
    }
    setEquipmentPrice(null);
    setQuickPrice({ id: packet.id, deliveryToken: packet.deliveryToken, raw: packet.raw,
      item: { baseId: parsed.baseId, level: parsed.level, rarity: parsed.rarity, prefixes: parsed.prefixes, suffixes: parsed.suffixes },
      baseName: parsed.baseNameEnglish ?? parsed.baseName, complete: parsed.complete,
      warnings: [...parsed.warnings, ...parsed.unmatchedLines.map((line) => `未识别：${line}`)] });
    setTab('trade');
    if (!parsed.complete) void publishCompanion(packet.id, { status: 'error', message: '部分装备内容需要核对，已在工坊展示。', detail: parsed.warnings.join('\n') }, packet.deliveryToken);
  }; });
  function addMod(mod: EngineMod) {
    const tier = mod.tiers.find((candidate) => candidate.ilvl <= item.level
      && (pickerMode === 'current' || targetAvailability(item, mod, candidate.display, options).allowed));
    if (!tier) {
      const first = mod.tiers.find((candidate) => candidate.ilvl <= item.level);
      setNotice(first ? targetAvailability(item, mod, first.display, options).reason ?? '当前状态无法添加这个目标。' : '物品等级不足，无法选择这个词缀。');
      return;
    }
    const isCrafted = (source: string) => ['essence', 'perfect', 'alloy'].includes(source);
    const entries = pickerMode === 'target' ? targets : [...item.prefixes, ...item.suffixes];
    if (isCrafted(mod.source) && entries.some((entry) => isCrafted(modById.get(entry.modId)?.source ?? ''))) {
      setNotice('当前规则只允许一条精华／合金制作词缀，请先移除已有制作词缀。'); return;
    }
    if (pickerMode === 'target') {
      if (targets.some((entry) => entry.modId === mod.id)) return;
      const families = new Set(targets.flatMap((entry) => modFamilies(modById.get(entry.modId))));
      if (modFamilies(mod).some((family) => families.has(family))) { setNotice('目标中已经有同组词缀，请先移除冲突词缀。'); return; }
      if (targets.filter((entry) => modById.get(entry.modId)?.type === mod.type).length >= 3) { setNotice('每侧最多选择三条目标词缀。'); return; }
      update({ targets: [...targets, { modId: mod.id, tierDisplay: tier.display }] });
    } else {
      const all = [...item.prefixes, ...item.suffixes];
      const families = new Set(all.flatMap((entry) => modFamilies(modById.get(entry.modId))));
      if (modFamilies(mod).some((family) => families.has(family))) { setNotice('当前装备已有同组词缀。'); return; }
      const field = mod.type === 'prefix' ? 'prefixes' : 'suffixes';
      const cap = item.rarity === 'magic' ? 1 : 3;
      if (item[field].length >= cap) { setNotice('这一侧的词缀槽位已满。'); return; }
      setItem({ ...item, rarity: item.rarity === 'normal' ? 'rare' : item.rarity, [field]: [...item[field], { modId: mod.id, tierDisplay: tier.display }] });
    }
    setNotice('');
  }
  function quickTarget() {
    const ids = item.baseId === 'Rings' ? ['Rings/IncreasedLife', 'Rings/FireResistance', 'Rings/ColdResistance']
      : ['Amulets/IncreasedLife', 'Amulets/BaseSpirit', 'Amulets/AllAttributes'];
    const next = ids.flatMap((id) => {
      const mod = modById.get(id);
      const tier = mod?.tiers.find((entry) => entry.display >= 3 && entry.ilvl <= item.level) ?? mod?.tiers.find((entry) => entry.ilvl <= item.level);
      return tier ? [{ modId: id, tierDisplay: tier.display }] : [];
    });
    update({ targets: next }); setNotice('已载入可编辑的目标示例；这不是盈利推荐。');
  }
  async function calculate() {
    if (!engine || validation || advisorBusy) return;
    const start = performance.now();
    setSolveError(''); setProgress(null); setSolving(true); setSolvedSig(signature); setResult(null);
    try {
      const request = makeSolveRequest(engine, item, targets, modById, options, effort, session.baseCost, playOut);
      const job = computeWorkbench(request, overrides, setProgress);
      runner.current = job;
      const answer = await job.promise;
      if (lastSignature.current !== signature) return;
      setResult(answer); setSelectedNode(answer.markov.nodes.find((node) => node.isStart)?.key ?? '');
      setTook((performance.now() - start) / 1000);
    } catch (error) { setSolveError(error instanceof Error ? error.message : String(error)); }
    finally { setSolving(false); runner.current = null; }
  }
  function adoptAdvice(nextTargets: readonly TargetInput[], answer?: SolveResult, seconds?: number) {
    if (solving) return;
    const next = [...nextTargets];
    update({ targets: next });
    if (answer) {
      setResult(answer);
      setSolvedSig(JSON.stringify({ item, targets: next, options, overrides, baseName, blockedReason, needsReview, effort, playOut, baseCost: session.baseCost }));
      setSelectedNode(answer.markov.nodes.find((node) => node.isStart)?.key ?? '');
      setTook(seconds ?? 0); setSolveError('');
      setNotice('已载入评估方案的目标与通货顺序。请按每次游戏结果重新导入装备。');
      window.setTimeout(() => document.querySelector('.wb-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } else setNotice('已采用建议目标，可在下方调整并计算制作策略。');
  }
  function simulate(action: string) {
    if (!effectiveEngine || restriction) return;
    try {
      const outcome = simulateCraft(effectiveEngine, item, action);
      const log = [...simulation.slice(0, historyAt), { before: item, after: outcome.item, label: outcome.description, cost: outcome.cost, priceKnown: outcome.priceKnown }];
      setSimulation(log); setHistoryAt(log.length); setItem(outcome.item, false); setNotice(outcome.description);
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  }
  function undo() {
    const entry = simulation[historyAt - 1];
    if (entry) { setItem(entry.before, false); setHistoryAt(historyAt - 1); }
  }
  function redo() {
    const entry = simulation[historyAt];
    if (entry) { setItem(entry.after, false); setHistoryAt(historyAt + 1); }
  }
  function editCurrent(entry: ItemModInput, patch: Partial<ItemModInput>) {
    setItem({ ...item, prefixes: item.prefixes.map((mod) => mod === entry ? { ...mod, ...patch } : mod), suffixes: item.suffixes.map((mod) => mod === entry ? { ...mod, ...patch } : mod) });
  }
  function removeCurrent(entry: ItemModInput) {
    setItem({ ...item, prefixes: item.prefixes.filter((mod) => mod !== entry), suffixes: item.suffixes.filter((mod) => mod !== entry) });
  }
  function replacementFor(mod: EngineMod, entry: ItemModInput) {
    const alternative = regularAlternative(mod, modById);
    if (!alternative || targets.some((target) => target.modId === alternative.id)) return null;
    const originalTier = mod.tiers.find((tier) => tier.display === entry.tierDisplay);
    const legal = alternative.tiers.filter((tier) => tier.ilvl <= item.level && targetAvailability(item, alternative, tier.display, options).allowed);
    // Match the actual range when possible; display the new range explicitly if it differs.
    const tier = legal.find((candidate) => candidate.values.join('|') === originalTier?.values.join('|')) ?? legal[0];
    return tier ? { mod: alternative, tier } : null;
  }
  function replaceWithNormal(entry: ItemModInput, replacement: NonNullable<ReturnType<typeof replacementFor>>) {
    update({ targets: targets.map((target) => target.modId === entry.modId
      ? { modId: replacement.mod.id, tierDisplay: replacement.tier.display } : target) });
    setNotice(`已改选普通来源：${translateModAtTier(replacement.mod, replacement.tier.display)}。请核对目标阶级与数值范围；装备本身没有改变。`);
  }
  function renderMod(entry: ItemModInput, target: boolean) {
    const mod = modById.get(entry.modId);
    if (!mod) return <div className="wb-mod" key={entry.modId}>{uiText("无法识别：")}{uiText(entry.modId)}<button onClick={() => target ? update({ targets: targets.filter((row) => row.modId !== entry.modId) }) : removeCurrent(entry)}>{uiText("移除")}</button></div>;
    const availability = target ? targetAvailability(item, mod, entry.tierDisplay, options) : null;
    const displaySource = !target && entry.desecrated ? 'desecrated' : mod.source;
    const replacement = target && availability && !availability.allowed ? replacementFor(mod, entry) : null;
    return <div key={entry.modId} className="wb-mod-entry" data-mod-id={mod.id}><div className={`wb-mod ${mod.type}`}>
      <span className="wb-mod-side">{uiText(mod.type === 'prefix' ? '前' : '后')}</span>
      <div className="wb-mod-text">{target ? <><strong>{uiText(translateModAtTier(mod, entry.tierDisplay))}</strong><span className={`wb-source-badge source-${displaySource}`}>{uiText(SOURCE_NAMES[displaySource])}</span><small title={uiText(mod.text)}>{uiText(mod.text)}</small></>
        : <details className="wb-current-mod-detail"><summary title={uiText(`${translateModAtTier(mod, entry.tierDisplay)} · 点击展开英文原文`)}><strong>{uiText(translateModAtTier(mod, entry.tierDisplay))}</strong><span className={`wb-source-badge source-${displaySource}`}>{uiText(entry.desecrated ? '已亵渎' : SOURCE_NAMES[displaySource])}</span></summary><small>{uiText(mod.text)}</small></details>}
      </div>
      <select aria-label={uiText(`${target ? '目标' : '当前'}${translateMod(mod.text)}阶级`)} value={entry.tierDisplay} onChange={(event) => {
        const tierDisplay = Number(event.target.value);
        if (target) update({ targets: targets.map((row) => row.modId === entry.modId ? { ...row, tierDisplay } : row) });
        else editCurrent(entry, { tierDisplay });
      }}>{mod.tiers.filter((tier) => tier.ilvl <= item.level || tier.display === entry.tierDisplay).map((tier) => <option key={tier.display} value={tier.display}>T{uiText(tier.display)} · {uiText(tier.range || tier.name)}{uiText(tier.ilvl > item.level ? '（物等不足）' : '')}</option>)}</select>
      {!target && <label className="wb-current-lock" title={uiText(entry.fractured ? '已锁定／破裂 · 点击解除' : '锁定／破裂词缀')}><input aria-label={uiText("已锁定／破裂")} type="checkbox" checked={entry.fractured ?? false} onChange={(event) => editCurrent(entry, { fractured: event.target.checked })} /><Icon name="lock" size={12} /></label>}
      <button className="wb-remove" aria-label={uiText(`移除${target ? '目标' : '当前'}${translateMod(mod.text)}`)} onClick={() => target ? update({ targets: targets.filter((row) => row.modId !== entry.modId) }) : removeCurrent(entry)}>×</button>
    </div>{availability && !availability.allowed && <div className="wb-target-issue" role="status"><p>{uiText(availability.reason)}</p>{replacement && <button className="wb-button" onClick={() => replaceWithNormal(entry, replacement)}>{uiText("改选普通词缀 · T")}{uiText(replacement.tier.display)} · {uiText(replacement.tier.range || replacement.tier.name)}</button>}</div>}</div>;
  }

  return <div className="wb-app">
    <div className="wb-shell">
      <header className="wb-header"><div><span className="wb-eyebrow">PATH OF EXILE 2 · PERSONAL WORKBENCH</span><h1>{uiText("制作工坊 ")}<span>BUILD ATLAS</span></h1></div>
        <div className="wb-header-meta"><LanguageSelect /><span className="wb-local"><i />{uiText(" 本地计算")}</span><span className="wb-chip">{uiText("国际服 · 简体界面")}</span><a href="https://www.pathofexile.com/trade2" target="_blank" rel="noreferrer">{uiText("官方交易 ")}<Icon name="external" size={14} /></a></div>
      </header>
      {HOSTED_WORKBENCH && <div className="wb-alert"><div><strong>{uiText("浏览器版 · 实际工坊")}</strong><p>{uiText("可上传 PoB2 XML／分享代码、定义技能组、比较装备、生成官网检索并计算制作路线。自动读档、日志、快捷键、后台挂牌读取与成交同步请用本地版。记录保存在当前浏览器，不会同步到你的本地工坊。")}</p><a className="wb-link" href={WORKBENCH_SOURCE + '#启动'} target="_blank" rel="noreferrer">{uiText("获取本地版 ↗")}</a></div></div>}
      <div className="wb-command-bar"><nav className="wb-tabs" aria-label={uiText("工作区域")}>{TABS.filter((entry) => entry.id !== 'simulate' && entry.id !== 'settings').map((entry) => <button key={entry.id} onClick={() => setTab(entry.id)} aria-current={tab === entry.id ? 'page' : undefined} className={tab === entry.id ? 'active' : ''}><Icon name={entry.icon} size={19} />{uiText(entry.label)}</button>)}</nav>
        <div className="wb-command-actions"><button className="wb-button primary" onClick={() => { if (planning) { const panel = document.querySelector<HTMLDetailsElement>('.cb-reference'); if (panel) panel.open = true; document.querySelector<HTMLTextAreaElement>('.cb-reference-input')?.focus(); return; } if (!pasteOpen) setPasteDraft(session.raw); setPasteOpen(!pasteOpen); }} aria-expanded={!planning && pasteOpen}><Icon name="paste" /> {uiText(planning ? '粘贴成品样例' : pasteOpen ? '收起导入' : '粘贴游戏物品')}</button><IconButton icon="hammer" label={uiText("自由模拟")} aria-pressed={tab === 'simulate'} onClick={() => setTab('simulate')} /><IconButton icon="sliders" label={uiText("数据与价格")} aria-pressed={tab === 'settings'} onClick={() => setTab('settings')} /></div>
      </div>
      {tab === 'plan' && <div className="wb-compact-basis">{uiText("规则 ")}{uiText(engine?.data.patch ?? '加载中')}{uiText(" · 与 0.5.5e 差异待核验 · 价格 ")}{uiText(basis?.asOf?.slice(0, 10) ?? '加载中')}<button className="wb-text-button" onClick={() => setTab('settings')}>{uiText("查看来源")}</button></div>}
      {loadError && <div role="alert" className="wb-alert error">{uiText("数据加载失败：")}{uiText(loadError)}<button onClick={() => window.location.reload()}>{uiText("重新加载")}</button></div>}
      {notice && <div className="wb-alert" role="status">{uiText(notice)}<button aria-label={uiText("关闭提示")} onClick={() => setNotice('')}>×</button></div>}
      {pasteOpen && !planning && <section className="wb-panel wb-paste"><div className="wb-section-head"><h3>{uiText("导入游戏物品")}</h3><span>{uiText("支持繁体中文、简体中文与英文；无法确认的词缀会保留提示。")}</span></div>
        <textarea aria-label={uiText("游戏物品文本")} placeholder={uiText('在游戏中复制装备、地图、宝石、通货或材料，将完整物品文本粘贴到这里。整套装备可在“角色装备”按槽位保存。')} value={pasteDraft} onChange={(event) => setPasteDraft(event.target.value)} />
        <div className="wb-actions"><button className="wb-button primary" disabled={!pasteDraft.trim()} onClick={() => importText(pasteDraft)}>{uiText("识别并导入 ")}<Icon name="arrow" size={16} /></button><button className="wb-button" onClick={() => { setTab('gear'); setPasteOpen(false); }}>{uiText("打开全身装备栏")}</button><button className="wb-button" disabled={!engine} onClick={() => importText(EXAMPLE_RING)}>{uiText("试用戒指示例")}</button><button className="wb-button" disabled={!engine} onClick={() => importText(EXAMPLE_AMULET)}>{uiText("试用项链示例")}</button></div>
      </section>}
      {importWarnings.length > 0 && !planning && <div className="wb-alert warning"><div><strong>{uiText("导入核对")}</strong><ul>{importWarnings.map((warning, index) => <li key={index}>{uiText(warning)}</li>)}</ul><div className="wb-actions"><button className="wb-button" disabled={!engine || !session.raw.trim()} onClick={() => importText()}>{uiText("重新识别当前原文")}</button>{needsReview && !blockedReason && <button className="wb-button" onClick={() => { setNeedsReview(false); setImportWarnings([]); setNotice('已使用你人工核对后的当前词缀。'); }}>{uiText("我已补齐并核对当前词缀")}</button>}</div></div></div>}
      {tab === 'plan' && <div className="wb-actions cb-mode"><button className="wb-text-button" aria-pressed={craftMode === 'blueprint'} onClick={() => { runner.current?.cancel(); setCraftMode('blueprint'); }}>{uiText("成品目标规划")}</button>{(session.raw || session.checkpoint) && <button className="wb-text-button" aria-pressed={craftMode === 'execute'} onClick={() => setCraftMode('execute')}>{uiText("制作中 · 继续核对底装")}</button>}</div>}
      <div className={`wb-layout${planning || tab === 'gear' || tab === 'finance' || tab === 'settings' || tab === 'trade' ? ' is-equipment' : ''}`}>
        <aside className="wb-item-column">
          <section className="wb-panel"><div className="wb-section-head"><h3>{uiText("当前装备")}</h3><span className="wb-tag">{uiText("起点")}</span></div>
            <div className={`wb-item-card ${item.rarity}`}><OfficialItemArt baseName={baseName} label={uiText(baseInfo?.simplified ?? translateBase(baseName))} fallback={<Icon name="ring" size={74} />} /><small>{uiText(RARITY_NAMES[item.rarity])} · {uiText(item.baseId === 'Rings' ? '戒指' : '项链')}</small><h3>{uiText(baseInfo?.simplified ?? translateBase(baseName))}</h3><p>{uiText(baseName)}</p><div className="wb-item-stats"><span>{uiText("物品等级 ")}<b>{uiText(item.level)}</b></span><span>{uiText("前缀 ")}<b>{uiText(item.prefixes.length)}/3</b></span><span>{uiText("后缀 ")}<b>{uiText(item.suffixes.length)}/3</b></span></div></div>
            <details className="wb-fold"><summary>{uiText("修改底座、稀有度与物等")}</summary><div className="wb-fields"><label>{uiText("装备类型")}<select aria-label={uiText("装备类型")} value={item.baseId} onChange={(event) => chooseBase(event.target.value === 'Rings' ? 'Amethyst Ring' : 'Stellar Amulet')}><option value="Rings">{uiText("戒指")}</option><option value="Amulets">{uiText("项链")}</option></select></label>
              <label>{uiText("物品等级")}<input aria-label={uiText("物品等级")} type="number" min="1" max="100" value={item.level} onChange={(event) => setItem({ ...item, level: Number(event.target.value) })} /></label>
              <label className="wide">{uiText("装备底座")}<select aria-label={uiText("装备底座")} value={baseName} onChange={(event) => chooseBase(event.target.value)}>{JEWELLERY_BASES.filter((base) => base.category === item.baseId).map((base) => <option key={base.english} value={base.english}>{uiText(base.simplified)} · {uiText(base.english)}{uiText(base.supported ? '' : '（特殊规则未支持）')}</option>)}</select></label>
              <label className="wide">{uiText("当前稀有度")}<select aria-label={uiText("当前稀有度")} value={item.rarity} onChange={(event) => setItem({ ...item, rarity: event.target.value as ExistingItem['rarity'] })}><option value="normal">{uiText("普通 · 从空白底座开始")}</option><option value="magic">{uiText("魔法 · 已有装备")}</option><option value="rare">{uiText("稀有 · 已有装备")}</option></select></label>
            </div></details>
            {[...item.prefixes, ...item.suffixes].length ? <div className="wb-current-mods">{uiText([...item.prefixes, ...item.suffixes].map((entry) => renderMod(entry, false)))}</div> : <p className="wb-empty-small">{uiText("目前没有显式词缀。可以粘贴装备，或从词缀库手动补充。")}</p>}
            <button className="wb-text-button" onClick={() => { setPickerMode('current'); setLibraryOpen(true); setTab('plan'); }}>{uiText("手动编辑当前词缀 ")}<Icon name="plus" size={14} /></button>
            {restriction && <p className="wb-inline-warning">{uiText(restriction)}</p>}
          </section>
          {tab === 'plan' && !planning && <section className="wb-panel wb-notebook"><span className="wb-eyebrow">{uiText("使用方式")}</span><h3>{uiText("每做一步，更新一次。")}</h3><p>{uiText("在游戏里使用通货后，重新复制装备。目标会保留，系统从新的状态计算。")}</p><button className="wb-text-button" onClick={() => setPasteOpen(true)}>{uiText("更新装备状态 ")}<Icon name="arrow" size={14} /></button></section>}
          <div className="wb-attribution">{uiText("基于 ")}<a href="https://github.com/Dboire9/POE2_HTC" target="_blank" rel="noreferrer">POE2_HTC</a> · AGPL-3.0<br />{uiText("词缀参考 PoE2DB / PoE2 Wiki")}<br />{uiText("本工具为个人制作辅助，价格并非成交保证。")}</div>
        </aside>
        <main className="wb-main">
          <div className="wb-loadout-host" hidden={tab !== 'gear'}><LoadoutPanel active={tab === 'gear'} recommendationData={engine?.data} recommendationTrade={tradeData} key={loadoutCandidate?.id ?? 'loadout'} candidate={loadoutCandidate} league={league} onSkillSearch={openSkillEquipmentSearch} onPrice={(raw, intent, slot) => { openEquipmentPrice(raw, 'loadout', intent, undefined, slot); }} onCraft={(raw) => { setQuickPrice(null); setEquipmentPrice(null); setBlueprintReference({ id: crypto.randomUUID(), raw }); setCraftMode('blueprint'); setTab('plan'); }} /></div>
          <div className="wb-finance-view" hidden={tab !== 'finance'}><FinancePanel league={league} active={tab === 'finance'} /></div>
          {planning && engine && <CraftBlueprintPanel key={blueprintReference?.id ?? 'craft-blueprint'} engine={effectiveEngine ?? engine} league={league} overrides={overrides} initialRaw={blueprintReference?.raw} tradeData={tradeData} />}
          {tab === 'plan' && !planning && engine && <CraftCheckpointPanel item={item} baseName={baseName} targets={targets} mods={modById} anchor={session.checkpoint ?? null} review={session.checkpointReview ?? null} suggestedAction={currentNode?.action} onAnchor={(checkpoint) => update({ checkpoint, checkpointReview: null })} onCheckText={(raw) => { importText(raw, 'checkpoint'); }} onRecalculate={() => { if (!validation && !advisorBusy && !solving) void calculate(); else document.querySelector('.wb-compute')?.scrollIntoView({ behavior: 'smooth' }); }} />}
          {engine && tab === 'plan' && !planning && <CraftAdvisor engine={engine} mods={modById} item={item} targets={targets} baseName={baseName} options={options} overrides={overrides} restriction={restriction} league={league} tradeData={tradeData} effort={effort} baseCost={session.baseCost} playOut={playOut} currentResult={stale ? null : result} mainSolving={solving} onBusyChange={setAdvisorBusy} onAdopt={adoptAdvice} />}
          {tab === 'plan' && !planning && <>
            <section className="wb-panel wb-goals"><div className="wb-section-head"><div><span className="wb-eyebrow">01 / DEFINE YOUR TARGET</span><h3>{uiText("你想把它做成什么？")}</h3></div><button className="wb-text-button" onClick={quickTarget} disabled={!engine}>{uiText("载入目标示例 ")}<Icon name="arrow" size={14} /></button></div>
              {targets.length ? <div className="wb-targets">{uiText(targets.map((entry) => renderMod(entry, true)))}</div> : <div className="wb-goal-empty"><Icon name="plus" size={24} /><div><strong>{uiText("从下方词缀库添加目标")}</strong><p>{uiText("按物等筛选可用阶级，T1 为最高阶；其他词缀允许保留。")}</p></div></div>}
              <div className="wb-goal-footer"><span>{uiText(targets.filter((entry) => modById.get(entry.modId)?.type === 'prefix').length)}{uiText("/3 前缀 ")}<i /> {uiText(targets.filter((entry) => modById.get(entry.modId)?.type === 'suffix').length)}{uiText("/3 后缀 · 稀有成品")}</span><div><button className="wb-text-button" onClick={() => update({ targets: [...item.prefixes, ...item.suffixes].map(({ modId, tierDisplay }) => ({ modId, tierDisplay })) })} disabled={!item.prefixes.length && !item.suffixes.length}>{uiText("以当前词缀为目标")}</button><button className="wb-text-button muted" onClick={() => update({ targets: [] })}>{uiText("清空")}</button></div></div>
            </section>
            <details className="wb-panel wb-library" open={libraryOpen} onToggle={(event) => setLibraryOpen(event.currentTarget.open)}><summary>{uiText("编辑目标词缀 · 底座词缀库 ")}<span className="wb-count">{uiText(filteredMods.length)}</span></summary><div className="wb-section-head"><div><span className="wb-eyebrow">AFFIX LIBRARY</span><h3>{uiText("底座词缀库 ")}<span className="wb-count">{uiText(filteredMods.length)}</span></h3></div><div className="wb-segment"><button className={pickerMode === 'target' ? 'active' : ''} onClick={() => setPickerMode('target')}>{uiText("添加到目标")}</button><button className={pickerMode === 'current' ? 'active' : ''} onClick={() => setPickerMode('current')}>{uiText("添加到当前")}</button></div></div>
              <div className="wb-library-controls"><label className="wb-search"><Icon name="search" size={16} /><input aria-label={uiText("搜索词缀")} placeholder={uiText("搜索生命、抗性、施法速度…")} value={search} onChange={(event) => setSearch(event.target.value)} /></label><select aria-label={uiText("词缀类型")} value={side} onChange={(event) => setSide(event.target.value as typeof side)}><option value="all">{uiText("全部词缀")}</option><option value="prefix">{uiText("仅前缀")}</option><option value="suffix">{uiText("仅后缀")}</option></select><select aria-label={uiText("词缀来源")} value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="normal">{uiText("普通词缀")}</option><option value="all">{uiText("所有来源")}</option><option value="essence">{uiText("普通精华专属")}</option><option value="perfect">{uiText("完美精华专属")}</option><option value="alloy">{uiText("合金专属")}</option><option value="desecrated">{uiText("亵渎专属")}</option></select></div>
              <div className="wb-pool-head"><span>{uiText("词缀 / 来源")}</span><span>{uiText("最高可用阶级")}</span><span /></div><div className="wb-pool-list">{filteredMods.map((mod) => {
                const best = mod.tiers.find((tier) => tier.ilvl <= item.level)!;
                const selected = (pickerMode === 'target' ? targets : [...item.prefixes, ...item.suffixes]).some((entry) => entry.modId === mod.id);
                const usableTier = pickerMode === 'target' ? mod.tiers.find((tier) => tier.ilvl <= item.level && targetAvailability(item, mod, tier.display, options).allowed) : best;
                const issue = !usableTier ? targetAvailability(item, mod, best.display, options).reason : undefined;
                return <div className="wb-pool-row" key={mod.id} data-mod-id={mod.id}><span className={`wb-dot ${mod.type}`} /><div><strong>{uiText(translateMod(mod.text))} <span className={`wb-source-badge source-${mod.source}`}>{uiText(SOURCE_NAMES[mod.source])}</span></strong><small>{uiText(mod.type === 'prefix' ? '前缀' : '后缀')}<span title={uiText(mod.text)}> · {uiText(mod.text)}</span></small>{issue && <p className="wb-pool-issue">{uiText(issue)}</p>}</div><span className="wb-tier">T{uiText((usableTier ?? best).display)}<small>{uiText("物等 ")}{uiText((usableTier ?? best).ilvl)}+</small></span><button title={uiText(selected ? '已添加' : issue ?? `添加${translateMod(mod.text)}`)} aria-label={uiText(`添加${SOURCE_NAMES[mod.source]}：${translateMod(mod.text)}`)} disabled={selected || Boolean(issue)} onClick={() => addMod(mod)}>{selected ? <Icon name="check" size={16} /> : <Icon name="plus" size={17} />}</button></div>;
              })}{!filteredMods.length && <p className="wb-empty-small">{uiText(engine ? '没有匹配词缀，试试其他关键词或检查物品等级。' : '正在读取本地词缀数据…')}</p>}</div>
              <div className="wb-library-note">{uiText("默认展示普通词缀。精华、完美精华与亵渎为不同来源；普通精华需要魔法装备，不能在稀有装备上新增其专属词缀。")}</div>
            </details>
            <section className="wb-panel wb-compute"><div className="wb-section-head"><div><span className="wb-eyebrow">02 / FIND A CRAFTING POLICY</span><h3>{uiText("计算通货顺序")}</h3></div><select aria-label={uiText("搜索精度")} value={effort} onChange={(event) => setEffort(Number(event.target.value))}><option value={5_000}>{uiText("快速 · 约 5 秒")}</option><option value={15_000}>{uiText("标准 · 约 15 秒")}</option><option value={60_000}>{uiText("深入 · 约 60 秒")}</option></select></div>
              <details className="wb-fold"><summary>{uiText("通货范围与计算选项")}</summary><div className="wb-checks">{([['strengths', '高阶／完美通货'], ['omens', '预兆'], ['essences', '精华／合金'], ['desecration', '亵渎（含估计权重）']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={options[key]} onChange={(event) => update({ options: { ...options, [key]: event.target.checked } })} />{uiText(label)}</label>)}</div>
              <label className="wb-check"><input type="checkbox" checked={playOut} onChange={(event) => setPlayOut(event.target.checked)} />{uiText(" 同时抽样验证成本分布与材料消耗（额外计算时间）")}</label>
              {[...item.prefixes, ...item.suffixes].some((entry) => entry.fractured) && <p className="wb-fine">{uiText("已有破裂词缀会自动作为保留条件加入求解，并占用对应槽位。计算不会假设能移除它们。")}</p>}
              {item.rarity === 'normal' && <label className="wb-inline-field">{uiText("每次重新购买底座的成本")}<input aria-label={uiText("底座成本")} type="number" min="0" step="0.1" value={session.baseCost} onChange={(event) => update({ baseCost: Math.max(0, Number(event.target.value)) })} /><span>{uiText("Ex · 当前默认不计底座成本")}</span></label>}
              </details><div className="wb-compute-bottom"><p>{uiText(advisorBusy ? '正在比较建议方案的成本；完成或停止评估后，可计算自定目标。' : validation ?? (item.rarity === 'normal' ? '从空白底座开始；可按所填成本更换底座重试。' : '从当前装备继续；策略不假设可以免费重置回原装备。'))}</p><button className={`wb-button ${solving ? '' : 'primary'}`} disabled={!engine || (!solving && (Boolean(validation) || advisorBusy))} onClick={() => solving ? runner.current?.cancel() : void calculate()}>{uiText(solving ? '取消计算' : '计算制作策略')}{!solving && <Icon name="arrow" />}</button></div>
              {solving && <div className="wb-progress" role="status"><div><span>{uiText("正在")}{uiText(progress?.phase === 'plan' ? '搜索制作路线' : progress?.phase === 'playout' ? '验证成本分布' : '求解后续决策')}…</span><span>{uiText(Math.round((progress?.fraction ?? 0) * 100))}%</span></div><progress max={1} value={progress?.fraction ?? 0} /></div>}
              {solveError && <CraftReason reason={solveError} engine={engine} />}
            </section>
            {result && <section className={`wb-panel wb-results ${stale ? 'is-stale' : ''}`}><div className="wb-section-head"><div><span className="wb-eyebrow">CRAFTING POLICY</span><h3>{uiText("你的制作方案")}</h3></div><span className="wb-tag">{uiText(took.toFixed(1))}{uiText(" 秒")}</span></div>
              {stale && <div className="wb-alert warning">{uiText("装备、目标或价格已更改，下方为上一次结果，请重新计算。")}</div>}
              <div className="wb-metrics"><div><small>{uiText("后续期望成本")}</small><strong>{resultView?.hasCost && markov ? <>{uiText(markov.bound === 'lower' ? '≥ ' : markov.bound === 'upper' ? '≤ ' : '')}<CraftCostAmount value={markov.expectedCost} prices={engine?.prices} overrides={overrides} /></> : resultView?.costText ?? '暂无结果'}</strong><span>{uiText(resultView?.statusText ?? '尚未获得有效结果')}</span></div><div><small>{uiText("下一步建议")}</small><strong className="wb-action-name">{uiText(currentNode?.action ? translateCurrency(currentNode.action) : currentNode?.isGoal ? '目标已达成' : resultView?.nextText ?? '查看下方说明')}</strong><span>{uiText(item.rarity === 'normal' ? '包含允许的重试策略' : '从当前装备状态继续')}</span></div><div><small>{uiText("规则与价格口径")}</small><strong className="wb-action-name">{uiText(markov?.assumedOdds ? '含假设权重' : '快照权重计算')}</strong><span>{uiText(basis?.league)} · {uiText(Object.keys(overrides).length ? '含手动价格' : basis?.asOf?.slice(0, 10))}</span></div></div>
              {markov?.reason && <CraftReason reason={markov.reason} engine={engine} />}
              {markov?.assumedOdds && <p className="wb-inline-warning">{uiText("本方案含亵渎或其他未验证权重，概率和成本均依赖该假设。")}</p>}
              {currentNode && <PolicyView node={currentNode} result={result} onNode={setSelectedNode} prices={engine?.prices} overrides={overrides} />}
              {currentNode?.action && <button className="wb-text-button" onClick={() => document.querySelector('.wb-checkpoint')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{uiText("设置这一步的制作锚点 ↑")}</button>}
              {plan && <details className="wb-details" open={!currentNode}><summary>{uiText("固定制作路线对照 · ")}{uiText(plan.frontier.length)}{uiText(" 条")}</summary><p>{uiText("以下是固定分支路线。现有装备的“重置后重试”成本不用于上方期望成本，请优先参考动态策略。")}</p>{plan.reason && <CraftReason reason={plan.reason} engine={engine} />}{plan.truncated && <p className="wb-inline-warning">{uiText("路线搜索达到上限，可以提高搜索精度重算。")}</p>}{plan.frontier.slice(0, 5).map((route, routeIndex) => <div className="wb-route" key={routeIndex}><div className="wb-route-title"><strong>{uiText("路线 ")}{uiText(routeIndex + 1)}</strong><span>{uiText("单次分支命中 ")}{uiText(formatPercent(route.probability))}{uiText(" · 单次材料 ")}<CraftCostAmount value={route.perAttempt} prices={engine?.prices} overrides={overrides} /></span></div>{route.steps.map((step) => <div className="wb-step" key={step.n}><b>{uiText(String(step.n).padStart(2, '0'))}</b><div><strong className="wb-currency-label"><OfficialCurrencyIcon currencyId={getCurrencyImageIdForAction(step.label)} label={uiText(translateCurrency(step.label))} />{uiText(translateCurrency(step.label))}</strong><span>{uiText(translateMod(step.target))}</span></div><span>{uiText(formatPercent(step.prob))}</span></div>)}</div>)}</details>}
              {markov?.replay && <details className="wb-details"><summary>{uiText("抽样校验与材料消耗")}</summary><div className="wb-section-head"><h3>{uiText("策略抽样验证")}</h3><span>{uiText(markov.replay.runs.toLocaleString())}{uiText(" 次完整运行")}</span></div><div className="wb-percentiles">{[50, 75, 90, 95].map((p) => <div key={p}><small>P{uiText(p)}{uiText(" 成本")}</small><strong><CraftCostAmount value={markov.replay!.costPercentiles[p] ?? 0} prices={engine?.prices} overrides={overrides} /></strong></div>)}</div><p className="wb-fine">{uiText("抽样均值 ")}<CraftCostAmount value={markov.replay.meanCost} prices={engine?.prices} overrides={overrides} />{uiText("；标准误差 ")}<CraftCostAmount value={markov.replay.stdErr} prices={engine?.prices} overrides={overrides} />{uiText("。分位数来自抽样，不是精确概率。")}</p><div className="wb-resource-table">{markov.replay.spendByMove.map((move) => <div key={move.label}><span>{uiText(translateCurrency(move.label))}</span><span>{uiText("平均 ")}{uiText(formatCost(move.count))}{uiText(" 次")}</span><b><CraftCostAmount value={move.spent} prices={engine?.prices} overrides={overrides} /></b></div>)}</div></details>}
              {markov?.replayReason && <CraftReason reason={markov.replayReason} engine={engine} />}
            </section>}
          </>}
          {tab === 'simulate' && <section className="wb-panel"><div className="wb-section-head"><div><span className="wb-eyebrow">CRAFTING SANDBOX</span><h3>{uiText("花虚拟通货，试真实规则。")}</h3></div><span className="wb-tag">{uiText("模拟操作")}</span></div><p className="wb-description">{uiText("操作会更新左侧装备。首版模拟词缀与阶级，左侧显示阶级数值范围；不生成范围内的具体数值。完成后可切回制作策略，计算下一步。")}</p>
            {restriction && <p className="wb-inline-warning">{uiText(restriction)}</p>}
            <div className="wb-sim-toolbar"><span>{uiText(simUnpriced ? '已知模拟消耗' : '本次模拟消耗')} <b><CraftCostAmount value={simSpent} prices={engine?.prices} overrides={overrides} /></b>{simUnpriced > 0 && <small>{uiText(" · 另有 ")}{uiText(simUnpriced)}{uiText(" 次材料价格缺失")}</small>}</span><div><button className="wb-button" disabled={historyAt === 0} onClick={undo}><Icon name="undo" size={14} />{uiText("撤销")}</button><button className="wb-button" disabled={historyAt >= simulation.length} onClick={redo}>{uiText("重做")}</button></div></div>
            <details className="wb-currency-sources"><summary>{uiText("GGG 官方通货图标 · 查看来源")}</summary><p>{uiText("部分阶位在官方数据中共用图标，请以通货名称区分。")}</p><div>{simActions.map((action) => {
              const image = getOfficialCurrencyImage(action.id);
              return image ? <a key={action.id} href={image.sourceUrl} target="_blank" rel="noreferrer">{uiText(CURRENCY_LABELS[action.id] ?? action.label)} ↗</a> : null;
            })}</div></details>
            <label className="wb-check wb-sim-visibility"><input type="checkbox" checked={showUnavailable} onChange={(event) => setShowUnavailable(event.target.checked)} />{uiText("显示当前不可用的通货")}</label><div className="wb-currency-grid wb-compact-currencies">{simActions.filter((action) => showUnavailable || action.feasible).map((action) => <button key={action.id} className="wb-currency" disabled={!action.feasible || Boolean(restriction)} title={uiText(action.reason ?? action.description)} onClick={() => simulate(action.id)}><OfficialCurrencyIcon currencyId={action.id} label={uiText(CURRENCY_LABELS[action.id] ?? translateCurrency(action.label))} size="card" /><strong>{uiText(CURRENCY_LABELS[action.id] ?? translateCurrency(action.label))}</strong><small>{uiText(action.description)}</small><b>{action.priceKnown ? <CraftCostAmount value={action.cost} prices={engine?.prices} overrides={overrides} /> : '价格缺失'}</b>{!action.feasible && <span className="wb-disabled-reason">{uiText(action.reason)}</span>}</button>)}</div>
            <div className="wb-section-head"><h3>{uiText("操作记录")}</h3><span>{uiText("仅保留当前会话")}</span></div>{simulation.length ? <div className="wb-history">{simulation.map((entry, index) => <div className={index >= historyAt ? 'undone' : ''} key={index}><b>{uiText(String(index + 1).padStart(2, '0'))}</b><span>{uiText(translateCurrency(entry.label))}</span><small>{entry.priceKnown ? <CraftCostAmount value={entry.cost} prices={engine?.prices} overrides={overrides} /> : '价格缺失'}</small></div>)}</div> : <div className="wb-empty-state"><Icon name="hammer" size={32} /><h3>{uiText("从第一步开始试做")}</h3><p>{uiText("上方会根据当前稀有度、槽位与物等启用可用通货。")}</p></div>}
          </section>}
          {tab === 'trade' && <section className="wb-panel">
            <div className="wb-trade-route"><button className="wb-text-button" onClick={() => setTab('gear')}>{uiText("← 角色装备")}</button><button className="wb-text-button" onClick={() => { setPasteDraft(''); setPasteOpen(true); }}>{uiText("粘贴其他物品")}</button></div>
            {loadoutContext && <p className="wb-fine" role="note">{uiText("当前查价关联")}{uiText(slotLabel(loadoutContext.slot))}{uiText("；核对结果后点击“记录到套装汇总”。")}<button type="button" className="wb-text-button" onClick={() => setTab('gear')}>{uiText("查看套装汇总")}</button></p>}
            {equipmentPrice ? <EquipmentTradePanel t1Data={engine?.data} t1Trade={tradeData} key={`${equipmentPrice.id}:${equipmentPrice.deliveryToken ?? ''}:${equipmentPrice.intent}:${equipmentPrice.intent === 'upgrade' ? JSON.stringify(savedLoadout.state.goals) : ''}`} raw={equipmentPrice.raw} league={league} onLeague={(value) => update({ league: value })} leagues={leagues} leagueError={leagueError} intent={equipmentPrice.intent}
              loadoutContext={loadoutContext} skillSearch={equipmentPrice.skillSearch} onCompare={compareWithLoadout} onRecordQuote={loadoutContext ? recordLoadoutQuote : undefined}
              onRepairItem={loadoutContext ? (expectedRaw, repairedRaw) => {
                const context = loadoutContext;
                if (savedLoadout.error || context.raw !== expectedRaw || context.state.slots[context.slot] !== expectedRaw) throw new Error('来源装备已变化，请从角色装备页重新打开此栏搜索。');
                const next = applyPobItemRepair(context.state, context.slot, expectedRaw, repairedRaw);
                const error = writeSavedLoadout(next, savedLoadout.raw);
                if (error) throw new Error(error);
                setEquipmentPrice((old) => old?.raw === expectedRaw ? { ...old, raw: repairedRaw } : old);
                setNotice('已从原始 PoB2 重新识别本栏装备。其他栏位、BD 目标和账本未更改；仍待核对的效果会继续保留提示。');
              } : undefined}
              autoEstimate={equipmentPrice.source === 'hotkey' || equipmentPrice.source === 'view' || equipmentPrice.source === 'loadout' && equipmentPrice.intent === 'price'} onEstimate={equipmentPrice.source === 'hotkey' ? (summary) => { void publishCompanion(equipmentPrice.id, { ...summary, status: summary.status ?? 'ready' }, equipmentPrice.deliveryToken); } : undefined} />
              : !quickPrice && session.actualRollsInvalid ? <p className="wb-inline-warning">{uiText("当前物品经过模拟，需粘贴游戏中的实际装备再检索。")}</p>
              : <EquipmentTradePanel key={quickPrice?.id ?? session.raw} raw={quickPrice?.raw ?? session.raw} t1Data={engine?.data} t1Trade={tradeData} league={league} onLeague={(value) => update({ league: value })} leagues={leagues} leagueError={leagueError} onCompare={compareWithLoadout} autoEstimate={quickPrice?.complete === true} onEstimate={quickPrice ? (summary) => { void publishCompanion(quickPrice.id, { ...summary, status: summary.status ?? 'ready' }, quickPrice.deliveryToken); } : undefined} />}
            <TradeMemoryPanel league={league} onOpenItem={(raw) => { openEquipmentPrice(raw, 'paste'); }} />
          </section>}
          {tab === 'settings' && <section className="wb-panel"><div className="wb-section-head"><div><span className="wb-eyebrow">DATA & PRICING</span><h3>{uiText("每个数字，都有来处。")}</h3></div><span className="wb-tag">{uiText("本地价格覆盖")}</span></div><div className="wb-source-grid"><div><small>{uiText("制作规则快照")}</small><strong>{uiText(engine?.data.patch ?? '—')}</strong><p>{uiText("来自 POE2_HTC，普通词缀权重为 PoE2DB 社区数据。版本号不代表已自动匹配最新游戏补丁。")}</p></div><div><small>{uiText("内置材料价格")}</small><strong>{uiText(basis?.asOf?.slice(0, 10) ?? '—')}</strong><p>{uiText(basis?.league ?? '—')}{uiText(" · poe.ninja 价格快照；部分材料可能包含估计值。")}</p></div></div>
            <div className="wb-advisor-verdict"><strong>{uiText("游戏内快捷查价与步骤校验")}</strong><p>{uiText("用 start-workbench.cmd 启动时会同时打开快捷键助手。鼠标停在游戏装备上，按 Alt + E 查价；执行通货后按 Ctrl + Alt + G 校验已锁定的制作锚点。请保持工坊网页打开，使用窗口化或无边框模式查看置顶结果。Esc 收起助手面板，托盘菜单可退出。也可单独运行 start-hotkeys.cmd。")}</p></div>
            <div className="wb-source-links"><a href="https://www.poe2wiki.net/wiki/List_of_modifiers_for_rings" target="_blank" rel="noreferrer">{uiText("戒指 Wiki ")}<Icon name="external" size={13} /></a><a href="https://www.poe2wiki.net/wiki/List_of_modifiers_for_amulets" target="_blank" rel="noreferrer">{uiText("项链 Wiki ")}<Icon name="external" size={13} /></a><a href="https://poe2db.tw/us/Modifiers" target="_blank" rel="noreferrer">{uiText("PoE2DB 词缀 ")}<Icon name="external" size={13} /></a><a href="https://poe.ninja/poe2/economy" target="_blank" rel="noreferrer">{uiText("材料市场 ")}<Icon name="external" size={13} /></a></div>
            <details className="wb-fold"><summary>{uiText("自定义材料价格 · ")}{uiText(Object.keys(overrides).length)}{uiText(" 项覆盖")}</summary><p className="wb-description">{uiText("填写每单位材料折合多少崇高石（Ex），会同步影响制作策略与模拟成本。清空输入即可恢复内置价格；不会覆盖原始数据文件。")}</p>
            <div className="wb-price-table"><div className="wb-price-head"><span>{uiText("材料")}</span><span>{uiText("内置价 / Ex")}</span><span>{uiText("你的价格 / Ex")}</span></div>{engine && Object.keys(CURRENCY_LABELS).filter((key) => engine.prices.currency[key] !== undefined).map((key) => <div key={key}><label className="wb-price-material" htmlFor={`price-${key}`}><OfficialCurrencyIcon currencyId={key} label={uiText(CURRENCY_LABELS[key]!)} />{uiText(CURRENCY_LABELS[key])}</label><span>{uiText(formatCost(engine.prices.currency[key]!))}</span><input id={`price-${key}`} type="number" min="0.000001" step="any" placeholder={uiText("使用内置价")} value={overrides[key] ?? ''} onChange={(event) => { const value = Number(event.target.value); const next = { ...overrides }; if (!event.target.value) delete next[key]; else if (Number.isFinite(value) && value > 0) next[key] = value; update({ overrides: next }); }} /></div>)}</div>
            <div className="wb-actions"><button className="wb-button" onClick={() => update({ overrides: {} })} disabled={!Object.keys(overrides).length}>{uiText("恢复全部内置价格")}</button></div>
            </details><p className="wb-fine">{uiText("保存范围：装备、目标、赛季、制作选项与价格覆盖保存在当前浏览器。模拟操作记录与价格情景仅保留在当前页面。")}</p>
          </section>}
        </main>
      </div>
      <footer className="wb-footer"><span>POE2 CRAFT LAB <i />{uiText(" 把每一步做明白。")}</span><span>{uiText("个人本地工坊")}</span></footer>
    </div>
  </div>;
}

function CraftReason({ reason, engine }: { reason: string; engine: Engine | null }) {
  const explanation = explainCraftReason(reason, engine?.data.mods);
  return <div className="wb-alert warning wb-reason" role="status"><div><p>{uiText(explanation.message)}</p>{explanation.diagnostic && <details className="wb-diagnostic"><summary>{uiText("原始诊断信息")}</summary><pre>{explanation.diagnostic}</pre></details>}</div></div>;
}
