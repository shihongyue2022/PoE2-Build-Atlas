import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import LanguageSelect from './LanguageSelect';
import PobImportPanel from './PobImportPanel';
import { setUiLocale, useUiLocale } from './uiLocale';

vi.mock('./workbenchRuntime', async (original) => ({
  ...await original<typeof import('./workbenchRuntime')>(),
  HOSTED_WORKBENCH: true,
}));

afterEach(() => { cleanup(); setUiLocale('zh-CN'); });

function Harness({ onImport = vi.fn() }) {
  useUiLocale();
  return <><LanguageSelect /><PobImportPanel onImport={onImport} /></>;
}

it('translates the expanded hosted import instructions and file captions when switching languages', () => {
  const { container } = render(<Harness />);
  const language = screen.getByRole('combobox');
  const draft = screen.getByRole('textbox');
  fireEvent.change(draft, { target: { value: 'Untranslated user draft 原文' } });
  fireEvent.change(language, { target: { value: 'en' } });
  const panel = container.querySelector('.lo-pob-import')!;
  const interfaceCopy = panel.cloneNode(true) as HTMLElement;
  interfaceCopy.querySelectorAll('textarea').forEach((element) => element.remove());
  expect(interfaceCopy.textContent).not.toMatch(/[\u3400-\u9fff]/);
  expect(panel).toHaveTextContent('The browser edition is not connected to local services.');
  expect(panel).toHaveTextContent('In PoB2, open Import/Export');
  expect(panel).toHaveTextContent('No file selected');
  const fileInput = screen.getByLabelText('PoB2 XML file');
  expect(fileInput).toHaveAttribute('hidden');
  expect(screen.getByRole('button', { name: 'Choose XML file' })).toBeEnabled();
  fireEvent.change(language, { target: { value: 'ja' } });
  expect(panel).toHaveTextContent('ブラウザー版はローカルサービスに接続していません。');
  expect(panel).toHaveTextContent('PoB2でImport/Exportを開き');
  expect(panel).toHaveTextContent('ファイル未選択');
  expect(panel).not.toHaveTextContent('浏览器版未连接');
  expect(panel).not.toHaveTextContent('在 Build Sharing 点击');
  expect(draft).toHaveValue('Untranslated user draft 原文');
  fireEvent.change(language, { target: { value: 'zh-CN' } });
  expect(screen.getByRole('button', { name: '选择 XML 文件' })).toBeEnabled();
  expect(panel).toHaveTextContent('未选择文件');
});

it('keeps XML preview and confirmation functional through the localized file picker', async () => {
  setUiLocale('en');
  const onImport = vi.fn();
  render(<Harness onImport={onImport} />);
  const file = new File(['xml'], 'Character.xml', { type: 'text/xml' });
  const xml = '<PathOfBuilding2><Items><Item id="1"><![CDATA[Rarity: NORMAL\nAmethyst Ring\nItem Level: 82\nImplicits: 1\n+12% to Chaos Resistance]]></Item><ItemSet id="1" title="Current"><Slot name="Ring 1" itemId="1" /></ItemSet></Items></PathOfBuilding2>';
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(xml) });
  const click = vi.spyOn(screen.getByLabelText('PoB2 XML file'), 'click');
  fireEvent.click(screen.getByRole('button', { name: 'Choose XML file' }));
  expect(click).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText('PoB2 XML file'), { target: { files: [file] } });
  const confirm = await screen.findByRole('button', { name: /Confirm loadout replacement/ });
  expect(onImport).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: /Interface language/ }), { target: { value: 'ja' } });
  expect(screen.getAllByText('Character.xml').length).toBeGreaterThan(0);
  expect(confirm).toHaveTextContent('装備一式の置き換えを確定');
  fireEvent.click(confirm);
  await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
  expect(onImport.mock.calls[0]![0].ring1).toContain('Amethyst Ring');
});
