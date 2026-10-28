import { uiText } from './uiLocale';
import type { EnginePlan } from '../lib/engineTypes';
import { blueprintActionMaterials, blueprintMaterialLabel } from './craftBlueprint';
import { translateCurrency, translateMod } from './localization';
import { englishPoe2dbUrl } from './poe2dbReference';
import OfficialCurrencyIcon from './OfficialCurrencyIcon';

/** A successful branch is a reference, never evidence that the player completed a step. */
export default function CraftRouteFlow({ routes, selected, onSelect }: { routes: readonly EnginePlan[]; selected: number; onSelect: (index: number) => void }) {
  const route = routes[selected] ?? routes[0];
  if (!route) return null;
  return <section className="cb-route-visual" aria-label={uiText("图示制作路线")}>
    <div className="wb-section-head"><h4>{uiText("制作路线 · 步骤图示")}</h4><label>{uiText("参考分支")}<select aria-label={uiText("选择图示路线")} value={routes[selected] ? selected : 0} onChange={event => onSelect(Number(event.target.value))}>{routes.map((_, index) => <option key={index} value={index}>{uiText("路线 ")}{uiText(index + 1)}</option>)}</select></label></div>
    <p className="wb-fine">{uiText("这是固定成功分支的顺序参考。预兆先激活，再用通货；每步完成后在本页粘贴实际结果并重算，未命中时不能照着下一张卡继续。")}</p>
    <ol className="cb-route-flow">{route.steps.map((step, index) => {
      const materials = blueprintActionMaterials(step.label);
      return <li className="cb-prep-step" key={`${index}:${step.label}`} aria-label={uiText(`路线步骤 ${index + 1}`)}>
        <header><span className="cb-prep-number">{uiText(index + 1)}</span><strong>{uiText(materials.map(blueprintMaterialLabel).join(' ＋ ') || translateCurrency(step.label))}</strong></header>
        <div className="cb-route-icons">{materials.map(name => <a key={name} href={englishPoe2dbUrl(name)} target="_blank" rel="noreferrer" className="cb-route-material"><OfficialCurrencyIcon materialName={name} label={uiText(blueprintMaterialLabel(name))} size="card" /><span>{uiText(blueprintMaterialLabel(name))} ↗</span></a>)}</div>
        <p className="cb-route-target">{uiText(translateMod(step.target))}</p>
      </li>;
    })}</ol>
  </section>;
}
