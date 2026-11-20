import { useState } from 'react';
import { approveIntake, getIntake, rereadIntake } from './api';

const STATUS = { pending: '未処理', review: '要確認', error: '処理エラー', registering: '登録を再開できます' };
const TEXT_FIELDS = [
  ['businessName', '事業所名・機関名'], ['phone', '電話番号'], ['address', '住所'],
  ['searchKeywords', '検索キーワード'], ['targetAudience', '対象者'],
  ['serviceDescription', 'サービス内容'], ['additionalInfo', 'その他の検索情報'],
];
const split = (value) => String(value || '').split(',').map((part) => part.trim()).filter(Boolean);
const safePart = (value) => String(value || '').trim().replace(/[\\/:*?"<>|]/g, '')
  .replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
const button = 'rounded-xl border bg-white px-3 py-2 text-sm font-bold disabled:opacity-50';

function Choices({ label, value, options, onChange, disabled }) {
  const selected = split(value);
  return (
    <fieldset disabled={disabled} className="rounded-xl border p-3">
      <legend className="font-bold">{label}</legend>
      <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-sm">
            <input type="checkbox" checked={selected.includes(option)} onChange={(event) => {
              onChange((event.target.checked ? [...selected, option] : selected.filter((item) => item !== option)).join(','));
            }} />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function IntakePanel({ accessCode, regions, services, consultations, supportOptions, onClose, onRegistered }) {
  const [items, setItems] = useState(null);
  const [entryId, setEntryId] = useState('');
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [offset, setOffset] = useState(0);
  const entry = items?.entries.find((item) => item.fileId === entryId);
  const primary = split(draft.serviceType)[0];
  const parts = [split(draft.area)[0], primary === '相談' ? split(draft.tags)[0] : primary, draft.businessName].map(safePart);
  const filename = parts.every(Boolean) ? parts.join('_') + '.pdf' : '';
  const editable = entry?.status === 'review';

  async function run(action, page = offset) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (action === 'reread') await rereadIntake(entryId, accessCode);
      if (action === 'approve') {
        await approveIntake(entryId, draft, accessCode);
        setEntryId('');
        setNotice('登録しました。検索対象に追加されました。');
        await onRegistered();
      }
    } catch (problem) {
      setError(problem.message);
    }
    try {
      const next = await getIntake(accessCode, page);
      setItems(next);
      setOffset(next.offset);
      const selected = next.entries.find((item) => item.fileId === entryId);
      if (selected && action === 'reread') setDraft(selected.data);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-3 px-4 py-4" aria-labelledby="intake-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="intake-title" className="text-xl font-bold">AI受付・確認</h2>
        <button type="button" disabled={busy} onClick={() => run('list', 0)} className={button}>受付一覧を取得</button>
        <button type="button" disabled={busy} onClick={onClose} className={button}>閉じる</button>
      </div>
      {busy && <p role="status">処理中…</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {notice && <p role="status" className="text-green-800">{notice}</p>}
      {items && (
        <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <div>
            <p className="mb-2 text-sm">{items.total} 件が受付中{items.enabled ? '' : '／AI読み取りは停止中'}</p>
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {items.entries.map((item) => (
                <li key={item.fileId}>
                  <button type="button" disabled={busy} aria-pressed={item.fileId === entryId} className={button + ' w-full break-all text-left'}
                    onClick={() => { setEntryId(item.fileId); setDraft(item.data); setError(''); setNotice(''); }}>
                    {STATUS[item.status]} ／ {item.name}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              {offset > 0 && <button type="button" disabled={busy} className={button} onClick={() => run('list', Math.max(0, offset - 30))}>前へ</button>}
              {offset + 30 < items.total && <button type="button" disabled={busy} className={button} onClick={() => run('list', offset + 30)}>次へ</button>}
            </div>
          </div>
          {entry && (
            <div className="space-y-3 rounded-2xl border bg-white p-4">
              <p className="break-all">変更前：{entry.name}</p>
              <p className="break-all">変更後：{filename || '要確認'}</p>
              <a className="text-blue-700 underline" href={`https://drive.google.com/file/d/${encodeURIComponent(entry.fileId)}/view`}
                target="_blank" rel="noreferrer">元のPDFを開く</a>
              {entry.error && <p role="alert" className="text-red-700">{entry.error}</p>}
              {(editable || entry.status === 'registering') && (
                <div className="space-y-2">
                  {[
                    ['area', '地域', regions],
                    ['serviceType', 'サービス種別（先頭がファイル名の主分類）', services],
                    ['tags', '相談別', consultations],
                    ['supportFlags', '必須情報', supportOptions(split(draft.serviceType))],
                  ].map(([key, label, options]) => (
                    <Choices key={key} label={label} options={options} value={draft[key]} disabled={!editable || busy}
                      onChange={(value) => setDraft((current) => ({ ...current, [key]: value }))} />
                  ))}
                  {TEXT_FIELDS.map(([key, label]) => (
                    <label key={key} className="block text-sm font-bold">
                      {label}
                      <textarea rows={key === 'serviceDescription' ? 3 : 1} value={draft[key] || ''} disabled={!editable || busy}
                        className="block w-full rounded-xl border p-2 font-normal"
                        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {entry.status !== 'registering' && <button type="button" disabled={busy || !items.enabled} className={button}
                  onClick={() => run('reread')}>{entry.status === 'pending' ? '読み取る' : '再読み取り'}</button>}
                {(editable || entry.status === 'registering') && (
                  <button type="button" disabled={busy || !filename} className={button} onClick={() => {
                    if (window.confirm(filename + ' として検索に登録しますか？')) run('approve');
                  }}>{editable ? '承認して登録' : '登録を再開'}</button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
