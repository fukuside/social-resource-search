const EXPLICIT_GAS_URL = import.meta.env.VITE_GAS_URL;
const PRODUCTION_GAS_URL = 'https://script.google.com/macros/s/AKfycbw4n2PeyuQNU9UtdvwLx6E1DnC4VcgiSzKZ1PIKhS4tnblZkU5ZGn9M6hXTa050D2g41Q/exec';

const CONFIGURED_GAS_URL = EXPLICIT_GAS_URL
  || (window.location.hostname === 'social-resource-search.vercel.app' ? PRODUCTION_GAS_URL : '');
const GAS_URL = CONFIGURED_GAS_URL || PRODUCTION_GAS_URL;

async function request(action, params = {}, accessCode) {
  const url = new URL(GAS_URL);
  const options = { cache: 'no-store' };
  if (accessCode === undefined) {
    url.search = new URLSearchParams({ action, ...params });
  } else {
    if (!CONFIGURED_GAS_URL) throw new Error('職員機能の接続先が設定されていません。');
    if (!accessCode) throw new Error('職員コードを入力してください。');
    options.method = 'POST';
    options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    options.body = JSON.stringify({ ...params, action, accessCode });
  }
  const response = await fetch(url, options).catch(() => {
    throw new Error('GASに接続できませんでした。接続先URLとアクセス設定を確認してください。');
  });
  if (!response.ok) throw new Error(`通信に失敗しました（HTTP ${response.status}）。`);
  const data = await response.json().catch(() => {
    throw new Error('サーバーの応答を読み取れませんでした。');
  });
  if (!data.ok) throw new Error(data.error || '処理に失敗しました。');
  return data;
}

export const searchResources = (params, accessCode) =>
  request(accessCode ? 'staffSearch' : 'search', params, accessCode || undefined);
export const getResourceDetail = (fileId, accessCode) =>
  request(accessCode ? 'staffDetail' : 'detail', { fileId }, accessCode || undefined);
export const getPublicUpdates = () => request('publicUpdates');
export const publishPublicUpdate = (fileId, fields, accessCode) =>
  request('publishPublicUpdate', { fileId, ...fields }, accessCode);
export const hidePublicUpdate = (updateId, accessCode) =>
  request('hidePublicUpdate', { updateId }, accessCode);
export const getStaff = (accessCode) => request('staff', {}, accessCode);
export const getTimeline = (accessCode, cursor) => request('timeline', { cursor }, accessCode);
export const updateResource = (payload, accessCode) => request('updateResource', payload, accessCode);
export const saveMemo = (fileId, memo, accessCode) => request('saveMemo', { fileId, memo }, accessCode);
export const deleteMemoLog = (logId, accessCode) => request('deleteMemoLog', { logId }, accessCode);


export const deleteResource = (fileId, mode, accessCode) =>
  request('deleteResource', { fileId, mode }, accessCode);
export const restoreResource = (fileId, accessCode) =>
  request('restoreResource', { fileId }, accessCode);

export const getIntake = (accessCode, offset) => request('intakeList', { offset }, accessCode);
export const rereadIntake = (fileId, accessCode) => request('intakeReread', { fileId }, accessCode);
export const approveIntake = (fileId, data, accessCode) => request('intakeApprove', { fileId, data }, accessCode);

export const requestResourceChange = (fileId, fields, accessCode) =>
  request('requestResourceChange', { fileId, ...fields }, accessCode);
export const listResourceChangeRequests = (accessCode) =>
  request('listResourceChangeRequests', {}, accessCode);
export const resolveResourceChangeRequest = (requestId, resolution, accessCode) =>
  request('resolveResourceChangeRequest', { requestId, resolution }, accessCode);
