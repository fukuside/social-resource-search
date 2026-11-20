import { useMemo, useState } from 'react';
import logo from './assets/logo2.png';
import IntakePanel from './IntakePanel';
import GoogleStaffLogin from './GoogleStaffLogin';
import { ResourceChangeForm, ResourceChangeQueue } from './ResourceChange';
import { PublicUpdateFeed, PublicUpdateForm } from './PublicUpdates';
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
  getStaff,
  getTimeline,
  deleteResource,
  restoreResource,
  deleteMemoLog, } from './api';
import './App.css';


const MANUAL_URL = '/manual.pdf';

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
  '保育所等訪問支援',
  '居宅介護',
  '生活介護',
  '日中一時',
  '短期入所',
  'グループホーム',
  '入所施設',
  '就労継続支援A型',
  '就労継続支援B型',
  '就労移行支援',
  '就労選択支援',
  '自立訓練',
  '訪問看護',
  '医療',
  '介護タクシー',
  '相談',
];

const CONSULTATION_TAGS = [
  '権利擁護',
  '医療・保険',
  'お金',
  '住まい',
  '仕事',
  '教育',
  '居場所',
  'ボランティア',
  '触法',
  '他害関係',
  '当事者',
  '未分類',
];

const CONSULTATION_TYPES = [
  'すべて',
  ...CONSULTATION_TAGS,
];

const CONSULTATION_LABELS = {
  '住まい': '住まい（訪問美理容なども含む）',
  '触法': '触法（更生保護・司法関係）',
  '他害関係': '他害関係（他害行為のある人の相談）',
  '当事者': '当事者（本人の悩み・ピア相談）',
};

const getConsultationLabel = (value) => {
  return CONSULTATION_LABELS[value] || value;
};

const DEFAULT_SUPPORT_FLAG_OPTIONS = [
  '送迎あり',
  '医療的ケア対応',
  '強度行動障害対応',
  '重心対応',
];

const SUPPORT_OPTIONS_BY_TYPE = {
  放課後等デイサービス: [
    '送迎あり',
    '入浴あり',
    '医療的ケア対応',
    '重心対応',
    '強度行動障害対応',
  ],
  児童発達: [
    '送迎あり',
    '入浴あり',
    '医療的ケア対応',
    '重心対応',
    '強度行動障害対応',
  ],
  日中一時: [
    '送迎あり',
    '医療的ケア対応',
    '重心対応',
    '入浴あり',
  ],
  生活介護: [
    '送迎あり',
    '入浴あり',
    'リハあり',
    '強度行動障害対応',
    '医療的ケア対応',
    '重心対応',
  ],
  グループホーム: [
    '夜間支援',
    '医療連携',
    '男性',
    '女性',
    '空室あり',
  ],
  就労継続支援B型: [
    '昼食提供',
    '送迎あり',
    '工賃公開',
  ],
  訪問看護: [
    '24h体制',
    '介護',
    '障がい',
    'ST',
    'PT',
    'OT',
    '精神科',
    '小児',
  ],
  居宅介護: [
    '重度訪問介護対応',
    '行動援護対応',
    '同行援護対応',
    '移動支援',
    '医療的ケア対応',
    '重心対応',
  ],
  介護タクシー: [
  '車椅子対応',
  'ストレッチャー対応',
  '福祉輸送',
  '長距離対応'
],
};

const getSupportFlagOptionsByType = (serviceType) =>
  SUPPORT_OPTIONS_BY_TYPE[serviceType] || DEFAULT_SUPPORT_FLAG_OPTIONS;

const parseCommaValues = (value) =>
  String(value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const currentConsultationTag = (tags) =>
  parseCommaValues(tags).find((tag) => CONSULTATION_TAGS.includes(tag)) || '';

const memoAuthor = (value) => value && !['admin', 'manual'].includes(value) ? value : '不明';
const memoDate = (value) => value
  ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
  : '';

const parseSupportNotes = (value) =>
  String(value || '')
    .split('｜')
    .map((v) => v.trim())
    .filter(Boolean);

export default function App() {
  const [hasSearched, setHasSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegions, setSelectedRegions] = useState([]);
  const [selectedType, setSelectedType] = useState('すべて');
  const [selectedConsultationType, setSelectedConsultationType] = useState('すべて');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const [resources, setResources] = useState([]);
  const [selectedResource, setSelectedResource] = useState(null);

  const [memo, setMemo] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editServiceType, setEditServiceType] = useState('');
  const [editBusinessName, setEditBusinessName] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editTags, setEditTags] = useState('');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showChangeQueue, setShowChangeQueue] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [staff, setStaff] = useState(null);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [publicUpdateRevision, setPublicUpdateRevision] = useState(0);
  const [showIntake, setShowIntake] = useState(false);
  const [timelineEntries, setTimelineEntries] = useState([]);
  const [timelineCursor, setTimelineCursor] = useState(null);
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [changingDeletion, setChangingDeletion] = useState(false);
  const [renameDriveFile, setRenameDriveFile] = useState(false);

  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingMemo, setSavingMemo] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState('');
  const [editSupportFlags, setEditSupportFlags] = useState('');
  const [editSupportNotes, setEditSupportNotes] = useState(['', '', '', '', '']);

  const selectedEditServices = parseCommaValues(editServiceType);
  const editableServices = [...new Set([
    ...SERVICE_TYPES.filter((type) => type !== 'すべて'),
    ...selectedEditServices,
  ])];
  const supportOptions = selectedEditServices.length
    ? [...new Set(selectedEditServices.flatMap(getSupportFlagOptionsByType))]
    : DEFAULT_SUPPORT_FLAG_OPTIONS;
  const canRename = selectedEditServices.length === 1
    && SERVICE_TYPES.includes(selectedEditServices[0])
    && selectedEditServices[0] !== 'すべて';
  const resourceDeleted = String(selectedResource?.isDeleted || '').toLowerCase() === 'true';
  const filenameCategory = selectedEditServices[0] === '相談'
    ? currentConsultationTag(editTags) || '相談'
    : selectedEditServices[0];
  const nextFileName = [editArea, filenameCategory, editBusinessName]
    .filter(Boolean)
    .join('_') + '.pdf';

  const toggleEditService = (type) => {
    const next = selectedEditServices.includes(type)
      ? selectedEditServices.filter((service) => service !== type)
      : [...selectedEditServices, type];
    setEditServiceType(next.join(','));
    setRenameDriveFile(false);
  };

  const signIn = async (credential) => {
    if (staffBusy) return;
    setStaffBusy(true);
    setStaffError('');
    try {
      const result = await getStaff(credential);
      setAccessCode(credential);
      setStaff(result.staff);
      setShowStaffForm(false);
      if (selectedResource) await handleOpenDetail(selectedResource.fileId, credential);
    } catch (err) {
      setStaffError(err.message);
    } finally {
      setStaffBusy(false);
    }
  };

  const signOut = () => {
    setStaff(null);
    setAccessCode('');
    setIsAdminMode(false);
    setShowChangeQueue(false);
    setShowTimeline(false);
    setShowIntake(false);
    setTimelineEntries([]);
    setTimelineCursor(null);
    setStaffError('');
    setResources([]);
    setHasSearched(false);
    setSelectedResource(null);
    setMemo('');
  };

  const openTimeline = async (cursor) => {
    if (!staff) {
      setShowStaffForm(true);
      return;
    }
    setShowTimeline(true);
    setStaffBusy(true);
    setStaffError('');
    if (!cursor) {
      setTimelineEntries([]);
      setTimelineCursor(null);
    }
    try {
      const result = await getTimeline(accessCode, cursor);
      setTimelineEntries((entries) => cursor ? [...entries, ...result.entries] : result.entries);
      setTimelineCursor(result.nextCursor);
    } catch (err) {
      setStaffError(err.message);
    } finally {
      setStaffBusy(false);
    }
  };

  const loadResources = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await searchResources({
        q: searchQuery,
        area: selectedRegions.join(','),
        serviceType: selectedType,
        consultationType: selectedConsultationType,
        includeDeleted,
      }, staff ? accessCode : undefined);

      const results = data.results || [];
      const filteredResults = selectedConsultationType === 'すべて'
        ? results
        : results.filter((item) =>
            parseCommaValues(item.tags).includes(selectedConsultationType)
          );

      setResources(filteredResults);
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
  setIncludeDeleted(false);
  setSelectedConsultationType('すべて');
};

  const syncEditForm = (detail) => {
  setEditArea(detail.area || '');
  setEditServiceType(detail.serviceType || '');
  setEditBusinessName(detail.businessName || '');
  setEditKeywords(detail.searchKeywords || '');
  setEditPhone(detail.phone || '');
  setEditAddress(detail.address || '');
  setEditTags(detail.tags || '');
  setEditSupportFlags(detail.supportFlags || '');
  setRenameDriveFile(false);

  const notes = String(detail.supportNotes || '')
    .split('｜')
    .map(v => v.trim());

  setEditSupportNotes([
    notes[0] || '',
    notes[1] || '',
    notes[2] || '',
    notes[3] || '',
    notes[4] || '',
  ]);

  setMemo('');
};



const selectConsultationTag = (tag) => {
  const currentTags = String(editTags || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const otherTags = currentTags.filter(t => !CONSULTATION_TAGS.includes(t));
  const nextTags = tag ? [...otherTags, tag] : otherTags;

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
  const query = String(resource?.address || '').trim() ||
    [resource?.businessName, resource?.area]
      .filter(Boolean)
      .join(' ')
      .trim();

  if (!query) return '';

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

  const handleOpenDetail = async (fileId, code = staff ? accessCode : undefined) => {
    try {
      setDetailLoading(true);
      setError('');
      const detail = await getResourceDetail(fileId, code);
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

  const changeDeletion = async (mode) => {
    const fileId = selectedResource.fileId;
    const message = {
      search: 'PDFを残したまま検索対象から外しますか？',
      drive: 'PDFをGoogle Driveのゴミ箱に移動し、検索対象から外しますか？',
      restore: 'PDFと登録データを検索対象に戻しますか？',
    }[mode];
    if (!window.confirm(message)) return;
    setChangingDeletion(true);
    setError('');
    try {
      if (mode === 'restore') await restoreResource(fileId, accessCode);
      else await deleteResource(fileId, mode, accessCode);
      if (mode !== 'restore') {
        setTimelineEntries((entries) => entries.filter((entry) => entry.fileId !== fileId));
      }
      setPublicUpdateRevision((revision) => revision + 1);
      if (hasSearched) await loadResources();
      await handleOpenDetail(fileId);
    } catch (err) {
      setError(err.message);
    } finally {
      setChangingDeletion(false);
    }
  };

  const handleSaveMemo = async () => {
    if (!selectedResource?.fileId) return;

    try {
      setSavingMemo(true);
      setError('');
      const result = await saveMemo(selectedResource.fileId, memo, accessCode);
      if (!result.ok) {
        throw new Error(result.error || 'メモ保存に失敗しました');
      }
      setPublicUpdateRevision((revision) => revision + 1);

      const refreshed = await getResourceDetail(selectedResource.fileId, accessCode);
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
    const result = await deleteMemoLog(logId, accessCode);

    if (!result.ok) {
      alert(result.error || '削除に失敗しました');
      return;
    }

    const detail = await getResourceDetail(result.fileId, accessCode);

    setSelectedResource({
  ...detail.item,
  memoLogs: detail.memoLogs || [],
});
    setTimelineEntries((entries) => entries.filter((entry) => entry.logId !== logId));
    setPublicUpdateRevision((revision) => revision + 1);
  } catch (error) {
    alert(error.message || '削除に失敗しました');
  }
}

  const handleSaveEdit = async () => {
    if (!selectedResource?.fileId) return;

    if (renameDriveFile) {
      if (!canRename) {
        setError('PDF名を変更する場合は、サービス種別を1つ選択してください。');
        return;
      }
      const confirmed = window.confirm(
        `Google Drive上のPDF名を次の名前に変更します。\n\n${nextFileName}\n\nよろしいですか？`
      );
      if (!confirmed) return;
    }

    try {
      setSavingEdit(true);
      setError('');
      
     const result = await updateResource({
  fileId: selectedResource.fileId,
  area: editArea,
  serviceType: editServiceType,
  businessName: editBusinessName,
  searchKeywords: editKeywords,
  phone: editPhone,
  address: editAddress,
  renameDriveFile: isAdminMode && renameDriveFile,
  tags: editTags,
  supportFlags: editSupportFlags,
  supportNotes: editSupportNotes
  .map(v => v.trim())
  .filter(Boolean)
  .join('｜'),
}, accessCode);
      setPublicUpdateRevision((revision) => revision + 1);

      if (!result.ok) {
        throw new Error(result.error || '情報更新に失敗しました');
      }

      const refreshed = await getResourceDetail(selectedResource.fileId, accessCode);
setSelectedResource({
  ...refreshed.item,
  memoLogs: refreshed.memoLogs || [],
});
syncEditForm(refreshed.item);

      await loadResources();
      if (result.warning) setError(result.warning);
    } catch (err) {
      setError(err.message || '情報更新に失敗しました');
    } finally {
      setSavingEdit(false);
    }
  };

  const staffLoginForm = (
    <GoogleStaffLogin onCredential={signIn} busy={staffBusy} error={staffError} />
  );

  const openStaffLogin = () => {
    if (staff) {
      signOut();
    } else if (selectedResource && !resourceDeleted) {
      document.getElementById('staff-google-login')?.focus();
    } else {
      setShowStaffForm((visible) => !visible);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
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

          <div className="flex flex-wrap items-center gap-2">
  {(!import.meta.env.VITE_GAS_URL || import.meta.env.VITE_UPLOAD_FOLDER_URL) && <a
    href={import.meta.env.VITE_UPLOAD_FOLDER_URL || "https://drive.google.com/drive/folders/1blm-UZNHp0XccNfVY19WOvM4omWwrEmr"}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-lg active:translate-y-0 active:shadow-sm"
  >
    📁 PDFアップロード
      </a>}
    
      <a
        href={MANUAL_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-lg active:translate-y-0 active:shadow-sm"
      >
        <FileText className="h-4 w-4" />
        使い方マニュアル
      </a>
    
      {staff && <button
        type="button"
        onClick={() => showTimeline ? setShowTimeline(false) : openTimeline()}
        disabled={staffBusy}
        className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold"
      >
        職員タイムライン
      </button>}
      <button
        type="button"
        onClick={openStaffLogin}
        disabled={staffBusy || savingMemo || savingEdit}
        className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold"
      >
        {staff ? staff.name + '・ログアウト' : 'Googleで編集ログイン'}
      </button>
      {staff?.role === 'admin' && <button
        type="button"
        onClick={() => {
          setIsAdminMode((prev) => !prev);
          setShowIntake(false);
          setShowChangeQueue(false);
        }}
        className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-bold shadow-md transition ${
          isAdminMode
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
        }`}
      >
        <Edit3 className="h-4 w-4" />
        {isAdminMode ? '管理モード' : '利用モード'}
      </button>}
      {isAdminMode && <button type="button" onClick={() => setShowIntake(true)}
        className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold">
        AI受付
      </button>}
      {isAdminMode && <button type="button" onClick={() => setShowChangeQueue(true)}
        className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold">
        資料変更依頼
      </button>}

      <button
        onClick={handleReset}
        className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
      >
        <RefreshCw className="h-4 w-4" />
        リセット
      </button>
    </div>
        </div>
      </header>

      {showChangeQueue && isAdminMode && (
        <ResourceChangeQueue accessCode={accessCode} onClose={() => setShowChangeQueue(false)}
          onChanged={async () => {
            setPublicUpdateRevision((revision) => revision + 1);
            if (hasSearched) await loadResources();
            if (selectedResource) await handleOpenDetail(selectedResource.fileId);
          }} />
      )}

      {showIntake && isAdminMode && (
        <IntakePanel accessCode={accessCode} regions={REGIONS.filter((value) => value !== 'すべて')}
          services={SERVICE_TYPES.filter((value) => value !== 'すべて')} consultations={CONSULTATION_TAGS}
          supportOptions={(types) => [...new Set(types.flatMap(getSupportFlagOptionsByType))]}
          onClose={() => setShowIntake(false)} onRegistered={() => hasSearched && loadResources()} />
      )}

      {showStaffForm && !staff && (!selectedResource || resourceDeleted) && (
        <div className="mx-auto max-w-7xl px-4 py-3">{staffLoginForm}</div>
      )}

      {showTimeline && staff && (
        <section aria-labelledby="timeline-heading" className="mx-auto max-w-7xl space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="timeline-heading" className="text-xl font-bold">タイムライン</h2>
            <button type="button" disabled={staffBusy} onClick={() => openTimeline()} className="rounded-xl border px-3 py-1">
              最新を取得
            </button>
          </div>
          {staffError && <p role="alert" className="text-red-700">{staffError}</p>}
          {staffBusy && <p role="status">読み込み中…</p>}
          {!staffBusy && !staffError && timelineEntries.length === 0 && <p>更新メモはありません。</p>}
          <ol className="max-h-[60vh] space-y-3 overflow-y-auto">
            {timelineEntries.map((entry) => (
              <li key={entry.logId} className="rounded-2xl border bg-white p-4">
                <time dateTime={entry.createdAt} className="text-sm text-slate-600">{memoDate(entry.createdAt)}</time>
                <div>
                  <button type="button" className="font-bold text-blue-700 underline" onClick={() => {
                    setShowTimeline(false);
                    handleOpenDetail(entry.fileId);
                  }}>
                    {entry.businessName || '事業所詳細を開く'}
                  </button>
                </div>
                <p className="text-sm text-slate-600">{[entry.area, entry.serviceType].filter(Boolean).join('／')}</p>
                <p className="mt-2 text-xs font-bold text-slate-600">
                  {{ memo: '更新メモ', support: '情報メモ', registered: 'PDF登録', replaced: 'PDF差し替え' }[entry.type]}
                </p>
                <p className="mb-2 whitespace-pre-wrap break-words">{entry.memo}</p>
                <p className="text-sm">入力者：{memoAuthor(entry.createdBy)}</p>
              </li>
            ))}
          </ol>
          {timelineCursor && <button type="button" disabled={staffBusy} onClick={() => openTimeline(timelineCursor)} className="rounded-xl border px-4 py-2">
            さらに表示
          </button>}
        </section>
      )}

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 xl:h-[calc(100vh-96px)] xl:grid-cols-[0.85fr_1fr_1.05fr]">
  {/* 左：検索条件 */}
  <section className="flex min-h-0 flex-col gap-4 overflow-y-auto xl:pr-2">
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

        <div className="grid gap-4">
          <div>
            <p className="mb-2 text-sm font-bold text-slate-500">地域</p>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map((region) => {
                const selected = selectedRegions.includes(region);

                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => {
                      if (region === 'すべて') {
                        setSelectedRegions([]);
                        return;
                      }

                      setSelectedRegions((prev) =>
                        prev.includes(region)
                          ? prev.filter((v) => v !== region)
                          : [...prev, region]
                      );
                    }}
                    className={`rounded-2xl px-3 py-2 text-sm font-bold ${
                      region === 'すべて'
                        ? selectedRegions.length === 0
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                        : selected
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {region === 'すべて' ? 'すべて' : selected ? `✓ ${region}` : region}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-slate-500">サービス種別</p>
            <div className="flex flex-wrap gap-2">
              {SERVICE_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
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


          <div>
            <p className="mb-2 text-sm font-bold text-slate-500">相談別</p>
            <div className="flex flex-wrap gap-2">
              {CONSULTATION_TYPES.map((type) => (
                <button
                  key={getConsultationLabel(type)}
                  type="button"
                  onClick={() => setSelectedConsultationType(type)}
                  className={`rounded-2xl px-3 py-2 text-sm font-bold ${
                    selectedConsultationType === type
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {type === 'すべて'
                  ? 'すべて'
                  : selectedConsultationType === type
                  ? `✓ ${getConsultationLabel(type)}`
                  : getConsultationLabel(type)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              相談別は「基本情報の編集」で登録した分類から絞り込みます
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-bold text-red-600">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
          />
          削除済みも表示
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
    <div className="xl:order-first">
      <PublicUpdateFeed revision={publicUpdateRevision} adminCode={isAdminMode ? accessCode : ''}
        onOpenDetail={(fileId) => {
          handleOpenDetail(fileId);
          document.getElementById('resource-detail')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }} />
    </div>
  </section>

  {/* 中央：検索結果 */}
  <section className="min-h-0 overflow-y-auto xl:pr-2">
    <div className="rounded-[2rem] border bg-white p-6 shadow-sm min-h-[600px] xl:h-full xl:min-h-0 xl:overflow-y-auto">
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
              type="button"
              onClick={() => handleOpenDetail(res.fileId)}
              className="block w-full rounded-[2rem] border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-white"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-200">
                      {res.serviceType || '未分類'}
                    </span>

                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                      <MapPin className="h-3.5 w-3.5" />
                      {res.area || '地域未設定'}
                    </span>

                    {String(res.isDeleted || '').toLowerCase() === 'true' && (
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 ring-1 ring-red-200">
                        削除済み
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-black leading-snug text-slate-800">
                    {res.businessName || res.fileName}
                  </h3>

                  {String(res.isDeleted || '').toLowerCase() === 'true' && res.deletedAt && (
                    <p className="mt-1 text-xs font-bold text-red-500">
                      削除日：{new Date(res.deletedAt).toLocaleString('ja-JP')}
                    </p>
                  )}

                  {currentConsultationTag(res.tags) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800 shadow-sm ring-1 ring-purple-200">
                        相談別：{getConsultationLabel(currentConsultationTag(res.tags))}
                      </span>
                    </div>
                  )}

                  {(parseCommaValues(res.supportFlags).length > 0 || parseSupportNotes(res.supportNotes).length > 0) && (
                    <div className="mt-3 space-y-2">
                      {parseCommaValues(res.supportFlags).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {parseCommaValues(res.supportFlags).map((label) => (
                            <span
                              key={`flag-${label}`}
                              className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm ring-1 ring-emerald-200"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}

                      {parseSupportNotes(res.supportNotes).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {parseSupportNotes(res.supportNotes).map((label, index) => (
                            <span
                              key={`note-${index}-${label}`}
                              className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 shadow-sm ring-1 ring-amber-200"
                            >
                              メモ：{label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <FileText className="h-5 w-5 shrink-0 text-slate-400" />
              </div>

              {res.phone && (
                <div className="mt-3 rounded-2xl bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800 ring-1 ring-sky-200">
                  電話：{res.phone}
                </div>
              )}

              {staff && res.memo && (
                <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
                  <span className="font-black text-slate-500">最新メモ：</span>
                  <span className="whitespace-pre-wrap break-words">{res.memo}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  </section>
        
        <section id="resource-detail" className="min-h-0 scroll-mt-36 overflow-y-auto xl:pr-2">
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

                {(selectedResource.phone || selectedResource.address) && (
                  <div className="rounded-3xl border border-sky-200 bg-sky-50 p-4 text-sm">
                    {selectedResource.phone && (
                      <p className="font-bold text-sky-900">電話：{selectedResource.phone}</p>
                    )}
                    {selectedResource.address && (
                      <p className="mt-1 text-sky-800">住所：{selectedResource.address}</p>
                    )}
                  </div>
                )}

                {!resourceDeleted && (
                  <div className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <nav aria-label="詳細の項目" className="flex flex-wrap gap-4 text-sm font-bold text-blue-800">
                      <a className="underline" href="#resource-support">送迎・医療的ケア</a>
                      <a className="underline" href="#resource-memo">更新メモ</a>
                    </nav>
                    {!staff && <>
                      <p className="text-sm text-slate-700">基本情報の編集やメモの保存には、許可されたGoogleアカウントでログインしてください。</p>
                      {staffLoginForm}
                    </>}
                  </div>
                )}

                {isAdminMode && (
                  <div className="space-y-2 rounded-3xl border border-slate-200 p-4">
                    <h4 className="font-black">削除・復元</h4>
                    {resourceDeleted && <p className="text-sm">
                      {selectedResource.deletionReason === 'search' ? '検索対象外（PDFは保持）'
                        : selectedResource.deletionReason === 'drive' ? 'PDFをゴミ箱へ移動済み'
                          : '削除済み（同期で検出）'}
                    </p>}
                    <div className="flex flex-wrap gap-2">
                      {(resourceDeleted
                        ? [['restore', '検索対象に復元']]
                        : [['search', '検索対象から外す'], ['drive', 'PDFをゴミ箱に移動']]
                      ).map(([mode, label]) => (
                        <button key={mode} type="button" disabled={changingDeletion || savingEdit || savingMemo}
                          onClick={() => changeDeletion(mode)} className="rounded-xl border px-3 py-2 text-sm font-bold">
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {staff && !resourceDeleted && (
                  <ResourceChangeForm key={selectedResource.fileId} fileId={selectedResource.fileId} accessCode={accessCode} />
                )}

                {staff && !resourceDeleted && (
                  <PublicUpdateForm key={selectedResource.fileId} fileId={selectedResource.fileId} accessCode={accessCode}
                    onPublished={() => setPublicUpdateRevision((revision) => revision + 1)} />
                )}

                {!resourceDeleted && (
                <div className="rounded-3xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Edit3 className="h-4 w-4 text-slate-500" />
                    <h4 className="font-black">基本情報の編集</h4>
                  </div>

                  <fieldset disabled={!staff} className="min-w-0 space-y-3 disabled:opacity-75">
                    {isAdminMode && <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
                      <label className="flex items-start gap-2 text-sm font-black text-amber-900">
                        <input
                          type="checkbox"
                          checked={renameDriveFile}
                          disabled={!canRename}
                          onChange={(e) => setRenameDriveFile(e.target.checked)}
                          className="mt-1"
                        />
                        Google Drive上のPDF名も変更する
                      </label>
                      {renameDriveFile ? (
                        <>
                          <p className="mt-2 text-xs font-bold text-amber-800">変更後のPDFファイル名</p>
                          <p className="mt-1 break-all text-sm text-amber-800">
                            {nextFileName}
                          </p>
                          <p className="mt-2 text-xs text-amber-700">
                            チェック時だけDriveのPDF名を変更します。サービス種別は1つ選択してください。
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-amber-700">
                            {canRename
                              ? '通常の保存ではスプレッドシートの基本情報を更新します。'
                              : 'PDF名を変更するには、分類にあるサービス種別を1つ選択してください。'}
                        </p>
                      )}
                    </div>}

                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-600">地域</label>
                      <input
                        value={editArea}
                        onChange={(e) => setEditArea(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      />
                    </div>

                    <fieldset>
                      <legend className="mb-2 text-sm font-bold text-slate-600">サービス種別（複数選択可）</legend>
                      <p className="mb-2 text-xs text-slate-500">
                        {selectedEditServices.length ? selectedEditServices.join('、') : '未分類'}
                      </p>
                      <div className="grid max-h-48 gap-2 overflow-y-auto rounded-2xl border border-slate-200 p-3 sm:grid-cols-2">
                        {editableServices.map((type) => (
                          <label key={type} className="flex items-start gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={selectedEditServices.includes(type)}
                              onChange={() => toggleEditService(type)}
                              className="mt-1"
                            />
                            {type}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-600">事業所名</label>
                      <input
                        value={editBusinessName}
                        onChange={(e) => setEditBusinessName(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-600">電話番号</label>
                      <input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="例：06-1234-5678"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-600">住所</label>
                      <input
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        placeholder="例：大阪府守口市○○1-2-3"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-slate-400">入力がある場合、「地図で見る」は住所を優先します。</p>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-bold text-slate-600">検索キーワード</label>
                      <textarea
                        value={editKeywords}
                        onChange={(e) => setEditKeywords(e.target.value)}
                        rows={3}
                        placeholder="PDF名に含まれない検索語を入力"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-slate-600">相談別</label>
                      <div className="mb-3 flex flex-wrap gap-2">
                        {CONSULTATION_TAGS.map((tag) => {
                          const isActive = currentConsultationTag(editTags) === tag;

                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => selectConsultationTag(isActive ? '' : tag)}
                              className={`rounded-2xl px-3 py-2 text-sm font-bold ${
                                isActive
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {isActive ? `✓ ${getConsultationLabel(tag)}` : getConsultationLabel(tag)}
                            </button>
                          );
                        })}
                      </div>

                      <input
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                        placeholder="相談別などをカンマ区切りで保存"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        相談別は tags 列に保存します。既存のタグは消さずに残します。
                      </p>
                    </div>

                    <div id="resource-support" className="scroll-mt-36">
                      <h5 className="mb-2 text-sm font-bold text-slate-600">必須情報</h5>
                      
                      <p className="mb-2 text-xs font-bold text-slate-400">
                        {selectedEditServices.join('、') || '未分類'} 用の選択肢を表示中
                      </p>

                      <div className="mb-3 flex flex-wrap gap-2">
                        {supportOptions.map((flag) => {
                          const selectedFlags = String(editSupportFlags || '')
                          .split(',')
                          .map(v => v.trim())
                          .filter(Boolean);
                          
                          const isActive = selectedFlags.includes(flag);
                          
                          return (
                          <button
                          key={flag}
                          type="button"
                          aria-pressed={isActive}
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
                            placeholder="例: 送迎あり,医療的ケア対応 ※カンマ区切りで追加可"
                            className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                            />
                            <p className="mt-1 text-xs text-slate-400">カンマ区切りで手入力もできます</p>
                            </div>
                            <div className="mt-4">
  <label className="mb-2 block text-sm font-bold text-slate-600">
    必須情報メモ
  </label>

  <div className="space-y-2">
    {editSupportNotes.map((note, index) => (
      <input
        key={index}
        value={note}
        onChange={(e) => {
          const next = [...editSupportNotes];
          next[index] = e.target.value;
          setEditSupportNotes(next);
        }}
        placeholder={`短文メモ ${index + 1}`}
        className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
      />
    ))}
  </div>
</div>

                    <button
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {savingEdit ? '保存中...' : '基本情報を保存'}
                      </button>
                  </fieldset>
                </div>
                )}

                {!resourceDeleted && (
                <div id="resource-memo" className="scroll-mt-36 rounded-3xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <History className="h-4 w-4 text-slate-500" />
                    <h4 className="font-black">更新メモ</h4>
                  </div>

                  <fieldset disabled={!staff} className="min-w-0 space-y-3 disabled:opacity-75">
                    <textarea
                      aria-label="更新メモを入力"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      rows={5}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500"
                      placeholder="例: 2026/04/09 電話番号修正、対象地域を追記"
                    />
                    {staff && <p className="text-sm text-slate-600">保存した更新メモの本文は、公開画面の「最近の更新」に表示されます。</p>}

                    <button
                    onClick={handleSaveMemo}
                    disabled={savingMemo || !memo.trim()}
                    className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      {savingMemo ? '保存中...' : 'メモを履歴保存'}
                      </button>

                    {staff && <div className="space-y-3 pt-2">
                      {(selectedResource.memoLogs || []).length === 0 ? (
                        <p className="text-sm text-slate-400">メモ履歴はまだありません</p>
                      ) : (
                        selectedResource.memoLogs.map((log) => (
  <div key={log.logId} className="rounded-2xl bg-slate-50 p-3 text-sm">
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="font-bold text-slate-600">
        {memoAuthor(log.createdBy)}
      </span>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">
          {memoDate(log.createdAt)}
        </span>

        {isAdminMode && <button
  type="button"
  onClick={() => handleDeleteMemoLog(log.logId)}
  className="rounded-xl bg-white px-3 py-1 text-xs font-bold text-red-600 shadow-md ring-1 ring-red-100 transition hover:-translate-y-0.5 hover:bg-red-50 hover:shadow-lg active:translate-y-0 active:shadow-sm"
>
  削除
</button>}
      </div>
    </div>

    <p className="whitespace-pre-wrap text-slate-700">{log.memo}</p>
  </div>
))
                      )}
                    </div>}
                  </fieldset>
                </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
