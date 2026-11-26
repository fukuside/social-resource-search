import { useState } from 'react';
import { listResourceChangeRequests, requestResourceChange, resolveResourceChangeRequest } from './api';

const buttonClass = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50';
const driveLink = (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
const replacementGuide = 'https://support.google.com/drive/answer/2409045?hl=ja';

export function ResourceChangeForm({ fileId, accessCode }) {
  const [kind, setKind] = useState('delete');
  const [reason, setReason] = useState('');
  const [replacementUrl, setReplacementUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await requestResourceChange(fileId, { kind, reason, replacementUrl }, accessCode);
      setReason('');
      setReplacementUrl('');
      setFailed(false);
      setMessage('管理者に依頼を送りました。');
    } catch (error) {
      setFailed(true);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-3xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-black">パンフレットの差し替え・削除を依頼</summary>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <label className="block text-sm font-bold">
          依頼の種類
          <select className="ml-2 rounded-lg border px-2 py-1" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="delete">削除依頼</option>
            <option value="replace">差し替え依頼</option>
          </select>
        </label>
        {kind === 'replace' && <label className="block text-sm font-bold">
          新しいPDFのGoogle Driveリンク
          <input type="url" required value={replacementUrl} onChange={(event) => setReplacementUrl(event.target.value)}
            className="mt-1 block w-full rounded-xl border p-2 font-normal" />
          <span className="font-normal text-slate-600">新しいPDFを検索用フォルダーの外に置き、管理者が閲覧できるようにしてください。</span>
        </label>}
        <label className="block text-sm font-bold">
          依頼理由
          <textarea rows={3} required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)}
            className="mt-1 block w-full rounded-xl border p-2 font-normal" />
        </label>
        <button type="submit" disabled={busy || !reason.trim()} className={buttonClass}>管理者に依頼を送る</button>
        {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'text-red-700' : 'text-green-800'}>{message}</p>}
      </form>
    </details>
  );
}

export function ResourceChangeQueue({ accessCode, onClose, onChanged }) {
  const [inbox, setInbox] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  async function run(entry, resolution, label) {
    if (entry && !window.confirm(`${entry.businessName}の依頼を「${label}」として処理しますか？${resolution === 'drive' ? '\nゴミ箱へ移せない場合は「削除済みPDF」に移します。' : ''}`)) return;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      if (entry) {
        const result = await resolveResourceChangeRequest(entry.requestId, resolution, accessCode);
        setInbox((current) => ({ entries: current.entries.filter((value) => value.requestId !== entry.requestId), total: current.total - 1 }));
        await onChanged?.();
        setMessage(result.status === 'archived' ? 'PDFを「削除済みPDF」に移し、検索から外しました。' : '依頼を処理しました。');
      }
      setInbox(await listResourceChangeRequests(accessCode));
    } catch (error) {
      setFailed(true);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-3 px-4 py-4" aria-label="資料変更依頼">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">資料変更依頼</h2>
        <button type="button" disabled={busy} onClick={() => run()} className={buttonClass}>未処理の依頼を表示</button>
        <button type="button" disabled={busy} onClick={onClose} className={buttonClass}>閉じる</button>
      </div>
      {busy && <p role="status">処理中…</p>}
      {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'text-red-700' : 'text-green-800'}>{message}</p>}
      {inbox && <p className="text-sm">未処理 {inbox.total} 件</p>}
      <ul className="space-y-2">
        {inbox?.entries.map((entry) => (
          <li key={entry.requestId} className="space-y-2 rounded-2xl border bg-white p-4">
            <h3 className="font-bold">{entry.businessName} ／ {entry.kind === 'replace' ? '差し替え依頼' : '削除依頼'}</h3>
            <p className="text-sm text-slate-600">{entry.requestedBy} ／ {new Date(entry.requestedAt).toLocaleString('ja-JP')}</p>
            <p className="whitespace-pre-wrap break-words">{entry.reason}</p>
            <div className="flex flex-wrap gap-3">
              <a href={driveLink(entry.fileId)} target="_blank" rel="noreferrer" className="text-blue-700 underline">対象PDFをDriveで開く</a>
              {entry.kind === 'replace' && <>
                <a href={driveLink(entry.replacementFileId)} target="_blank" rel="noreferrer" className="text-blue-700 underline">新しいPDFを開く</a>
                <a href={replacementGuide} target="_blank" rel="noreferrer" className="text-blue-700 underline">Driveで新しい版をアップロードする手順</a>
              </>}
            </div>
            {entry.kind === 'replace' && <p className="text-sm text-slate-600">対象PDFの「版を管理」から新しいPDFを登録し、開き直して内容を確認してから完了にしてください。</p>}
            <div className="flex flex-wrap gap-2">
              {(entry.kind === 'replace'
                ? [['replacementDone', 'Driveで差し替え済み']]
                : [['search', 'PDFを残して検索対象外'], ['drive', 'PDFも削除する']]
              ).concat([['reject', '却下']]).map(([resolution, label]) => (
                <button key={resolution} type="button" disabled={busy} onClick={() => run(entry, resolution, label)}
                  className={buttonClass}>{label}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
