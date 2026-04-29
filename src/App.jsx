import { useEffect, useMemo, useState } from 'react';
import logo from './assets/logo2.png';
import {
  Search,
  MapPin,
  FileText,
  ExternalLink,
  Loader2,
  RefreshCw,
  Save,
  FileSearch,
  FolderOpen,
  Edit3,
  History,
} from 'lucide-react';
import { searchResources,
  getResourceDetail,
  updateResource,
  saveMemo,
  deleteMemoLog, } from './api';
import './index.css';

const REGIONS = [
  'すべて',
  '旭区',
  '鶴見区',
  '東淀川区',
  '都島区',
  '守口市',
  '門真市',
  '寝屋川市',
  '大東市',
  '四條畷市',
  '四条畷市',
  '交野市',
  '枚方市',
  'それ以外',
];

const SERVICE_TYPES = [
  'すべて',
  '放課後等デイサービス',
  '児童発達',
  '居宅介護',
  '生活介護',
  '短期入所',
  'グループホーム',
  '入所施設',
  '就労継続支援A型',
  '就労継続支援B型',
  '就労移行',
  '就労選択',
  '自立訓練',
  '訪問看護',
  '医療',
  'その他',
];

const SUPPORT_FLAG_OPTIONS = [
  '送迎あり',
  '医療的ケア対応',
  '強度行動障害対応',
  '重度訪問介護',
  '重心対応',
  '行動援護',
  '同行援護',
];

export default function App() {
  const [hasSearched, setHasSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('すべて');
  const [selectedType, setSelectedType] = useState('すべて');
  const [onlyUnclassified, setOnlyUnclassified] = useState(false);

  const [resources, setResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);

  const [memo, setMemo] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editServiceType, setEditServiceType] = useState('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editTags, setEditTags] = useState('');

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingMemo, setSavingMemo] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState('');
  const [editSupportFlags, setEditSupportFlags] = useState('');

  const loadResources = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await searchResources({
        q: searchQuery,
        area: selectedRegion,
        serviceType: selectedType,
        onlyUnclassified,
      });
      setResources(data.results || []);
    } catch (err) {
      setError(err.message || '一覧取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const resultCountText = useMemo(() => `${resources.length} 件`, [resources.length]);

  const handleSearch = async () => {
  setHasSearched(true);
  await loadResources();
  setSelectedResource(null);
  setMemo('');
};

const handleReset = () => {
  setHasSearched(false);
  setResources([]);
  setSelectedResource(null);
  setMemo('');
  setError('');
};

  const syncEditForm = (detail) => {
  setEditArea(detail.area || '');
  setEditServiceType(detail.serviceType || '');
  setEditBusinessName(detail.businessName || '');
  setEditKeywords(detail.keywords || '');
  setEditTags(detail.tags || '');
  setEditSupportFlags(detail.supportFlags || '');
  setMemo('');
};

  const toggleTag = (tag) => {
  const currentTags = String(editTags || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const exists = currentTags.includes(tag);

  const nextTags = exists
    ? currentTags.filter(t => t !== tag)
    : [...currentTags, tag];

  setEditTags(nextTags.join(','));
};

const toggleSupportFlag = (flag) => {
  const currentFlags = String(editSupportFlags || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  const exists = currentFlags.includes(flag);

  const nextFlags = exists
    ? currentFlags.filter(v => v !== flag)
    : [...currentFlags, flag];

  setEditSupportFlags(nextFlags.join(','));
};

const buildMapUrl = (resource) => {
  const query = [resource?.businessName, resource?.area]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!query) return '';

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

  const handleOpenDetail = async (fileId) => {
    try {
      setDetailLoading(true);
      setError('');
      const detail = await getResourceDetail(fileId);
      setSelectedResource({
        ...detail.item,
        memoLogs: detail.memoLogs || []
      });

      syncEditForm(detail.item);
    } catch (err) {
      setError(err.message || '詳細取得に失敗しました');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveMemo = async () => {
    if (!selectedResource?.fileId) return;

    try {
      setSavingMemo(true);
      setError('');
      const result = await saveMemo(selectedResource.fileId, memo, 'admin');
      if (!result.ok) {
        throw new Error(result.error || 'メモ保存に失敗しました');
      }

      const refreshed = await getResourceDetail(selectedResource.fileId);
setSelectedResource({
  ...refreshed.item,
  memoLogs: refreshed.memoLogs || [],
});
syncEditForm(refreshed.item);
      await loadResources();
    } catch (err) {
      setError(err.message || 'メモ保存に失敗しました');
    } finally {
      setSavingMemo(false);
    }
  };

  async function handleDeleteMemoLog(logId) {
  const ok = window.confirm('この履歴メモを削除しますか？');
  if (!ok) return;

  try {
    const result = await deleteMemoLog(logId);

    if (!result.ok) {
      alert(result.error || '削除に失敗しました');
      return;
    }

    const detail = await getResourceDetail(result.fileId);

    setSelectedResource({
  ...detail.item,
  memoLogs: detail.memoLogs || [],
});
  } catch (error) {
    alert(error.message || '削除に失敗しました');
  }
}

  const handleSaveEdit = async () => {
    if (!selectedResource?.fileId) return;

    try {
      setSavingEdit(true);
      setError('');
      
     const result = await updateResource({
  fileId: selectedResource.fileId,
  area: editArea,
  serviceType: editServiceType,
  businessName: editBusinessName,
  keywords: editKeywords,
  tags: editTags,
  supportFlags: editSupportFlags,
});

      if (!result.ok) {
        throw new Error(result.error || '情報更新に失敗しました');
      }

      const refreshed = await getResourceDetail(selectedResource.fileId);
setSelectedResource({
  ...refreshed.item,
  memoLogs: refreshed.memoLogs || [],
});
syncEditForm(refreshed.item);

      await loadResources();
    } catch (err) {
      setError(err.message || '情報更新に失敗しました');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
  <img
    src={logo}
    alt="福祉ロゴ"
    className="h-12 w-12 object-contain"
  />

  <div>
    <h1 className="text-xl font-bold text-slate-900">
      社会資源パンフレット検索
    </h1>
    <p className="text-sm text-slate-500">
      GoogleDrive / GAS / PDFメモ管理
    </p>
  </div>
</div>

          <button
  onClick={handleReset}
  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
>
  <RefreshCw className="h-4 w-4" />
  リセット
</button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 xl:h-[calc(100vh-96px)] xl:grid-cols-[1.1fr_0.9fr]">
        <section className="flex min-h-0 flex-col gap-6 pr-2">
          <div className="rounded-[2rem] border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <Search className="h-5 w-5 text-slate-400" />
              <h2 className="text-lg font-black">検索</h2>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="地名、事業名、キーワード、メモで検索"
                className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-base outline-none focus:border-blue-500"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-bold text-slate-500">地域</p>
                  <div className="flex flex-wrap gap-2">
                    {REGIONS.map((region) => (
                      <button
                        key={region}
                        onClick={() => setSelectedRegion(region)}
                        className={`rounded-2xl px-3 py-2 text-sm font-bold ${
                          selectedRegion === region
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-bold text-slate-500">サービス種別</p>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() => setSelectedType(type)}
                        className={`rounded-2xl px-3 py-2 text-sm font-bold ${
                          selectedType === type
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={onlyUnclassified}
                  onChange={(e) => setOnlyUnclassified(e.target.checked)}
                />
                未分類・要修正のみ表示
              </label>

              <button
                onClick={handleSearch}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"
              >
                <Search className="h-4 w-4" />
                検索する
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border bg-white p-6 shadow-sm min-h-[600px] lg:min-h-0 lg:h-full lg:flex-1 lg:overflow-y-auto">
  <div className="mb-4 flex items-center justify-between">
    <h2 className="text-lg font-black">検索結果</h2>
    <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600">
      {resultCountText}
    </span>
  </div>

  {error && (
    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {error}
    </div>
  )}

  {loading ? (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  ) : !hasSearched ? (
    <div className="rounded-3xl border-2 border-dashed border-slate-200 px-6 py-16 text-center">
      <p className="text-lg font-black text-slate-400">まだ検索していません</p>
      <p className="mt-2 text-sm text-slate-500">
        条件を入れて「検索する」を押してください
      </p>
    </div>
  ) : resources.length === 0 ? (
    <div className="rounded-3xl border-2 border-dashed border-slate-200 px-6 py-16 text-center">
      <p className="text-lg font-black text-slate-400">該当データがありません</p>
      <p className="mt-2 text-sm text-slate-500">
        検索条件を変えて再検索してください
      </p>
    </div>
  ) : (
    <div className="space-y-4">
      {resources.map((res) => (
        <button
          key={res.fileId}
          onClick={() => handleOpenDetail(res.fileId)}
          className="block w-full rounded-[2rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-white">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-blue-600">
                {res.serviceType || '未分類'}
              </p>
              <h3 className="mt-1 text-lg font-black text-slate-800">
                {res.businessName || res.fileName}
              </h3>
            </div>
            <FileText className="h-5 w-5 text-slate-400" />
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {res.area || '地域未設定'}
            </span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
              {res.fileName}
            </span>
          </div>

          {res.memo && (
            <p className="mt-3 line-clamp-2 text-sm text-slate-500">
              最新メモ: {res.memo}
            </p>
          )}
        </button>
      ))}
    </div>
  )}
</div>
        </section>

        <section className="min-h-0 overflow-y-auto xl:pr-2">
          <div className="rounded-[2rem] border bg-white p-6 shadow-sm min-h-[600px] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <div className="mb-4 flex items-center gap-3">
              <FolderOpen className="h-5 w-5 text-slate-400" />
              <h2 className="text-lg font-black">詳細 / 管理</h2>
            </div>

            {detailLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : !selectedResource ? (
              <div className="py-16 text-center text-slate-400">
                左の検索結果からPDFを選択してください
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-blue-600">
                    {selectedResource.serviceType || '未分類'}
                  </p>
                  <h3 className="mt-1 text-2xl font-black leading-tight">
                    {selectedResource.businessName || selectedResource.fileName}
                  </h3>
                </div>

                <div className="rounded-3xl bg-slate-50 p-4">
  <div className="grid gap-3 text-sm">
    <div>
      <p className="font-bold text-slate-500">ファイル名</p>
      <p className="break-all text-slate-800">{selectedResource.fileName}</p>
    </div>
    <div>
      <p className="font-bold text-slate-500">地域</p>
      <p>{selectedResource.area || '未設定'}</p>
    </div>
    <div>
      <p className="font-bold text-slate-500">キーワード</p>
      <p>{selectedResource.keywords || '未設定'}</p>
    </div>
    <div>
      <p className="font-bold text-slate-500">必須情報</p>
      <p>{selectedResource?.supportFlags || '未設定'}</p>
      </div>
    <div>
      <p className="font-bold text-slate-500">タグ</p>
      <p>{selectedResource?.tags || '未設定'}</p>
    </div>
    <div>
      <p className="font-bold text-slate-500">更新日時</p>
      <p>{String(selectedResource.updatedAt || '')}</p>
    </div>
  </div>
</div>

<div className="flex flex-wrap gap-3">
  {selectedResource?.driveUrl ? (
    <a
      href={selectedResource.driveUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white"
    >
      PDFをGoogleドライブで開く
    </a>
  ) : (
    <div className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-bold text-slate-500">
      PDFリンク未設定
    </div>
  )}

  {buildMapUrl(selectedResource) ? (
    <a
      href={buildMapUrl(selectedResource)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
    >
      地図で見る
    </a>
  ) : (
    <div className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-bold text-slate-500">
      地図情報未設定
    </div>
  )}
</div>

                <div className="rounded-3xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Edit3 className="h-4 w-4 text-slate-500" />
                    <h4 className="font-black">基本情報の編集</h4>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-600">地域</label>
                      <input
                        value={editArea}
                        onChange={(e) => setEditArea(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-600">サービス種別</label>
                      <input
                        value={editServiceType}
                        onChange={(e) => setEditServiceType(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-600">事業所名</label>
                      <input
                        value={editBusinessName}
                        onChange={(e) => setEditBusinessName(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-600">キーワード</label>
                      <textarea
                        value={editKeywords}
                        onChange={(e) => setEditKeywords(e.target.value)}
                        rows={3}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-600">必須情報</label>
                      
                      <div className="mb-3 flex flex-wrap gap-2">
                        {SUPPORT_FLAG_OPTIONS.map((flag) => {
                          const selectedFlags = String(editSupportFlags || '')
                          .split(',')
                          .map(v => v.trim())
                          .filter(Boolean);
                          
                          const isActive = selectedFlags.includes(flag);
                          
                          return (
                          <button
                          key={flag}
                          type="button"
                          onClick={() => toggleSupportFlag(flag)}
                          className={`rounded-2xl px-3 py-2 text-sm font-bold ${
                            isActive
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                           }`}
                           >
                            {flag}
                            </button>
                            );
                            })}
                            </div>
                            
                            <input
                            value={editSupportFlags}
                            onChange={(e) => setEditSupportFlags(e.target.value)}
                            placeholder="例: 送迎あり,医療的ケア対応"
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                            />
                            <p className="mt-1 text-xs text-slate-400">カンマ区切りで手入力もできます</p>
                            </div>

                    <button
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {savingEdit ? '保存中...' : '基本情報を保存'}
                      </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-500" />
                    <h4 className="font-black">更新メモ</h4>
                  </div>

                  <div className="space-y-3">
                    <textarea
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      rows={5}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      placeholder="例: 2026/04/09 電話番号修正、対象地域を追記"
                    />

                    <button
                    onClick={handleSaveMemo}
                    disabled={savingMemo}
                    className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {savingMemo ? '保存中...' : 'メモを履歴保存'}
                      </button>

                    <div className="space-y-3 pt-2">
                      {(selectedResource.memoLogs || []).length === 0 ? (
                        <p className="text-sm text-slate-400">メモ履歴はまだありません</p>
                      ) : (
                        selectedResource.memoLogs.map((log) => (
  <div key={log.logId} className="rounded-2xl bg-slate-50 p-3 text-sm">
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="font-bold text-slate-600">
        {log.createdBy || 'manual'}
      </span>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">
          {String(log.createdAt || '')}
        </span>

        <button
  type="button"
  onClick={() => handleDeleteMemoLog(log.logId)}
  className="rounded-xl bg-white px-3 py-1 text-xs font-bold text-red-600 shadow-md ring-1 ring-red-100 transition hover:-translate-y-0.5 hover:bg-red-50 hover:shadow-lg active:translate-y-0 active:shadow-sm"
>
  削除
</button>
      </div>
    </div>

    <p className="whitespace-pre-wrap text-slate-700">{log.memo}</p>
  </div>
))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}