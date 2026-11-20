import { useEffect, useState } from 'react';
import { getPublicUpdates, hidePublicUpdate, publishPublicUpdate } from './api';

export function PublicUpdateFeed({ revision, onOpenDetail, adminCode }) {
  const [result, setResult] = useState({ entries: [], loading: true, error: '' });
  const [refresh, setRefresh] = useState(0);
  const [actionError, setActionError] = useState('');
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    let active = true;
    getPublicUpdates().then(({ entries }) => {
      if (active) setResult({ entries, loading: false, error: '' });
    }).catch(() => {
      if (active) setResult({ entries: [], loading: false, error: '最近の更新を読み込めませんでした。' });
    });
    return () => { active = false; };
  }, [revision, refresh]);

  async function hide(updateId) {
    if (!window.confirm('この更新の公開を取り消しますか？')) return;
    setHiding(true);
    setActionError('');
    try {
      await hidePublicUpdate(updateId, adminCode);
      setRefresh((value) => value + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setHiding(false);
    }
  }

  const entries = (
    <>
      {result.loading && <p className="text-sm text-slate-500">読み込み中…</p>}
      {(result.error || actionError) && <p role="status" className="text-sm text-red-700">{actionError || result.error}</p>}
      {!result.loading && !result.error && !result.entries.length && <p className="text-sm text-slate-500">公開中の更新はありません。</p>}
      <ul className="space-y-2">
        {result.entries.map((entry) => (
          <li key={entry.updateId} className="border-b border-slate-100 pb-2 last:border-0">
            <button className="block text-left text-sm font-bold text-blue-800 hover:underline" type="button"
              onClick={() => onOpenDetail(entry.fileId)}>
              {entry.businessName}
            </button>
            <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{entry.message}</p>
            <p className="break-words text-xs text-slate-600">
              {new Date(entry.publishedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })} ／ 更新者 {entry.displayName}
            </p>
            {adminCode && <button type="button" disabled={hiding} onClick={() => hide(entry.updateId)}
              className="mt-1 text-xs font-semibold text-red-700 underline">公開を取り消す</button>}
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div className="rounded-3xl border bg-white p-4 shadow-sm">
      <section className="hidden xl:block" aria-label="最近の更新">
        <h2 className="mb-2 font-black">最近の更新</h2>
        <div className="max-h-56 overflow-y-auto">{entries}</div>
      </section>
      <details className="xl:hidden">
        <summary className="cursor-pointer font-black">最近の更新</summary>
        <div className="mt-3">{entries}</div>
      </details>
    </div>
  );
}

export function PublicUpdateForm({ fileId, accessCode, onPublished }) {
  const [message, setMessage] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function publish(event) {
    event.preventDefault();
    if (!window.confirm('この更新文と表示名を、公開アプリを開いたすべての人に表示しますか？')) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await publishPublicUpdate(fileId, { message, displayName }, accessCode);
      setMessage('');
      setNotice('最近の更新に掲載しました。');
      onPublished();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-3xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-black">最近の更新に掲載する</summary>
      <form className="mt-3 space-y-3" onSubmit={publish}>
        <p className="text-sm text-slate-600">公開してよいお知らせだけを入力してください。公開画面に更新文と表示名が載ります。</p>
        <label className="block text-sm font-bold">
          公開する更新文
          <textarea rows={3} required maxLength={160} value={message} onChange={(event) => setMessage(event.target.value)}
            placeholder="例：パンフレットを最新版に更新しました。"
            className="mt-1 block w-full rounded-xl border p-2 font-normal" />
        </label>
        <label className="block text-sm font-bold">
          公開する更新者名
          <input required maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)}
            placeholder="例：守口担当・田中"
            className="mt-1 block w-full rounded-xl border p-2 font-normal" />
        </label>
        <button type="submit" disabled={busy || !message.trim() || !displayName.trim()}
          className="rounded-xl bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">公開する</button>
        {notice && <p role="status" className="text-sm text-green-800">{notice}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </form>
    </details>
  );
}
