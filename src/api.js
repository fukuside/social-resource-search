const EXPLICIT_GAS_URL = import.meta.env.VITE_GAS_URL;
const PRODUCTION_GAS_URL = 'https://script.google.com/macros/s/AKfycbw4n2PeyuQNU9UtdvwLx6E1DnC4VcgiSzKZ1PIKhS4tnblZkU5ZGn9M6hXTa050D2g41Q/exec';

const CONFIGURED_GAS_URL = EXPLICIT_GAS_URL
  || (window.location.hostname === 'social-resource-search.vercel.app' ? PRODUCTION_GAS_URL : '');
const GAS_URL = CONFIGURED_GAS_URL || PRODUCTION_GAS_URL;

async function request(action, params = {}, accessCode, publicWrite = false) {
  const url = new URL(accessCode === undefined ? GAS_URL : '/api/staff', window.location.origin);
  const options = { cache: 'no-store' };
  if (publicWrite && !accessCode) {
    options.method = 'POST';
    options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    options.body = JSON.stringify({ ...params, action });
  } else if (accessCode === undefined) {
    url.search = new URLSearchParams({ action, ...params });
  } else {
    if (!accessCode) throw new Error('Googleログインが必要です。');
    options.method = 'POST';
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify({ credential: accessCode, payload: { ...params, action } });
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
export const updateResource = (payload, accessCode) => request('updateResource', payload, accessCode || undefined, true);
export const saveMemo = (fileId, memo, accessCode) => request('saveMemo', { fileId, memo }, accessCode || undefined, true);
export const deleteMemoLog = (logId, accessCode) => request('deleteMemoLog', { logId }, accessCode);


export const deleteResource = (fileId, mode, accessCode) =>
  request('deleteResource', { fileId, mode }, accessCode);
export const restoreResource = (fileId, accessCode) =>
  request('restoreResource', { fileId }, accessCode);

export const getIntake = (accessCode, offset) => request('intakeList', { offset }, accessCode);
export const rereadIntake = (fileId, accessCode) => request('intakeReread', { fileId }, accessCode);
export const approveIntake = (fileId, data, accessCode) => request('intakeApprove', { fileId, data }, accessCode);

export const requestResourceChange = (fileId, fields, accessCode) =>
  request('requestResourceChange', { fileId, ...fields }, accessCode || undefined, true);
export const listResourceChangeRequests = (accessCode) =>
  request('listResourceChangeRequests', {}, accessCode);
export const resolveResourceChangeRequest = (requestId, resolution, accessCode) =>
  request('resolveResourceChangeRequest', { requestId, resolution }, accessCode);
