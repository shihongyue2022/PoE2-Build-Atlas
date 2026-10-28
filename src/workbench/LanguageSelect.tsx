import { setUiLocale, useUiLocale, type UiLocale } from './uiLocale';

export default function LanguageSelect() {
  const locale = useUiLocale();
  return <label className="wb-language">
    <span aria-hidden="true">🌐</span>
    <select aria-label="Interface language / 表示言語 / 界面语言" value={locale} onChange={(event) => setUiLocale(event.target.value as UiLocale)}>
      <option value="zh-CN" lang="zh-CN">简体中文</option>
      <option value="en" lang="en">English</option>
      <option value="ja" lang="ja">日本語</option>
    </select>
  </label>;
}
