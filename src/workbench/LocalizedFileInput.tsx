import { useRef, useState, type InputHTMLAttributes } from 'react';
import { uiText, useUiLocale } from './uiLocale';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> & { label: string };

/** Native file captions follow the browser language, so render our own localized controls. */
export default function LocalizedFileInput({ label, onChange, disabled, ...props }: Props) {
  useUiLocale();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  return <span className="wb-file-picker">
    <button type="button" className="wb-button" disabled={disabled} onClick={() => input.current?.click()}>{label}</button>
    <span className="lo-footnote" role="status">{fileName || uiText('未选择文件')}</span>
    <input {...props} ref={input} type="file" hidden disabled={disabled} onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) setFileName(file.name);
      onChange?.(event);
    }} />
  </span>;
}
