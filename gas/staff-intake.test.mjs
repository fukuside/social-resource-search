import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const staffEmail = 'staff@example.com';
const adminEmail = 'admin@example.com';
const externalEmail = 'staff@outlook.example';
const subject = '0'.repeat(64);
const secret = 'test-key-'.repeat(6);
const sign = (signed) => createHmac('sha256', secret).update(signed).digest('hex');
const staffEntries = new Map([
  ['SOCIAL_NAV_AUTH_SECRET', secret],
  ['SOCIAL_NAV_STAFF_ROSTER', JSON.stringify({
    [createHash('sha256').update(externalEmail).digest('hex')]: { name: '外部メール職員', role: 'staff' },
  })],
  ['staff.google.' + staffEmail, JSON.stringify({ name: '閲覧担当', role: 'staff' })],
  ['staff.google.' + adminEmail, JSON.stringify({ name: '更新担当', role: 'admin' })],
]);
const fileId = 'demo-id';
const logs = Array.from({ length: 23 }, (_, i) => [
  'log-' + i, fileId, 'メモ' + i, new Date(Date.UTC(2026, 10, 20, 0, 0, i)), i ? '更新担当' : 'admin',
]);
logs.reverse();
const status = [false, '', '06-1234-5678', '守口市', '目的語', ''];
let memoAuthor = '';
let savedResource;
const changeRows = [];
let publicRows;
let generatedId = 0;
const publicSheet = () => ({
  getLastRow: () => publicRows.length,
  appendRow: (row) => publicRows.push(Array.from(row)),
  getRange: (row, column, height) => ({
    getValues: () => publicRows.slice(row - 1, row - 1 + height),
    getValue: () => publicRows[row - 1]?.[column - 1],
    setValue: (value) => { publicRows[row - 1][column - 1] = value; },
    createTextFinder: (id) => ({
      matchEntireCell() { return this; },
      matchCase() { return this; },
      findNext: () => {
        const index = publicRows.findIndex((entry) => entry[0] === id);
        return index < 1 ? null : { getRow: () => index + 1 };
      },
    }),
  }),
});
let isTrashed = false;
let trashDenied = false;
let archiveCreated = false;
const archiveFolder = { getId: () => 'archive-folder' };
let responseCount = 0;
let rowPresent = true;
const queue = { data: [[fileId, '未整理.pdf', 'review', 'digest', '{}', '', new Date(), 1, '']] };
let parentId = 'test-inbox';
let fileName = '未整理.pdf';
let resourceCreated = 0;
let shouldFailMove = false;
let rangeWrites = 0;
let existingSupportNotes = '以前の情報メモ';
const file = {
  isTrashed: () => isTrashed,
  setTrashed: (value) => { if (value && trashDenied) throw new Error('Drive access denied'); isTrashed = value; },
  getMimeType: () => 'pdf',
  getParents: () => iterator([{ getId: () => parentId }]),
  getName: () => fileName,
  setName: (name) => { fileName = name; },
  moveTo: (folder) => { if (shouldFailMove) throw new Error('一時失敗'); parentId = folder.getId(); },
};
const iterator = (items) => ({ hasNext: () => items.length > 0, next: () => items.shift() });
const rowRange = {
  getValues: () => [status.slice()],
  setValues: ([row]) => { status.splice(0, status.length, ...row); rangeWrites++; },
  setValue: () => {},
};
const sheet = {
  getLastRow: () => 2,
  getDataRange: () => ({ getValues: () => [['fileId', 'businessName', 'isDeleted'], [fileId, '操作例', status[0]]] }),
  getRange: (row, col) => col === 1 ? {
    createTextFinder: () => ({
      matchEntireCell() { return this; },
      matchCase() { return this; },
      findNext: () => rowPresent ? { getRow: () => 2 } : null,
    }),
  } : rowRange,
  appendRow: (row) => {
    rowPresent = true;
    resourceCreated++;
    status.splice(0, status.length, ...row.slice(13, 19));
  },
};
queue.sheet = { getRange: () => ({ setValues: () => {} }) };
const context = createContext({
  Date, console,
  FOLDER_ID: 'search-folder',
  SHEET_ID: 'test-sheet',
  MimeType: { PDF: 'pdf' },
  Utilities: {
    Charset: { UTF_8: 'utf8' },
    DigestAlgorithm: { SHA_256: 'sha256' },
    computeDigest: (algorithm, text) => [...createHash(algorithm).update(text).digest()],
    computeHmacSha256Signature: (signed) => [...Buffer.from(sign(signed), 'hex')],
    getUuid: () => 'test-id-' + (++generatedId),
  },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => staffEntries.get(key) }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  SpreadsheetApp: {
    flush() {},
    openById: () => ({
      insertSheet: () => { publicRows = []; return publicSheet(); },
      getSheetByName: (name) => name === 'public_updates'
        ? (publicRows ? publicSheet() : null)
        : ({
        getLastRow: () => changeRows.length,
        appendRow: (row) => changeRows.push(Array.from(row)),
        getRange: (row, column, height) => ({
          getValues: () => changeRows.slice(row - 1, row - 1 + height),
          setValues: ([values]) => changeRows[row - 1].splice(column - 1, values.length, ...values),
        }),
      }),
    }),
  },
  UrlFetchApp: { fetch() { responseCount++; throw new Error('Unexpected live request'); } },
  DriveApp: {
    getFileById: () => { if (parentId === 'unavailable') throw new Error('gone'); return file; },
    getFolderById: (id) => ({
      getId: () => id,
      getFilesByName: () => iterator([]),
      getFoldersByName: () => iterator(archiveCreated ? [archiveFolder] : []),
      createFolder: () => { archiveCreated = true; return archiveFolder; },
    }),
  },
  getSheet: () => sheet,
  getMemoLogSheet: () => ({
    getLastRow: () => logs.length + 1,
    getRange: (first, col, length) => ({ getValues: () => logs.slice(first - 2, first - 2 + length) }),
  }),
  rowToObject: (headers, row) => Object.fromEntries(headers.map((key, i) => [key, row[i]])),
  getResource: () => ({ ok: true, item: { isDeleted: status[0], memo: '内部メモ', supportNotes: existingSupportNotes, businessName: '操作例' }, memoLogs: logs }),
  searchResources: (params, includeStaffMemos = true) => ({
    ok: true, results: params.q && !includeStaffMemos ? [] : [{ fileId, memo: '内部メモ', supportNotes: '送迎は要相談' }],
  }),
  saveMemoLog: (id, memo, name) => { memoAuthor = name; return { ok: true, logId: 'memo-' + (++generatedId), item: { memoLogs: logs } }; },
  updateResource: (body) => { savedResource = body; return { ok: true, item: { memoLogs: logs } }; },
  buildManagedFileName: (area, service, name) => [area, service, name].join('_') + '.pdf',
  ensureHeader() {},
  jsonOutput: (value) => value,
});
for (const filename of ['Classification.gs', 'SocialNavStaff.gs', 'SocialNavIntake.gs']) {
  runInContext(readFileSync(new URL('./' + filename, import.meta.url), 'utf8'), context, { filename });
}
const publicWrite = (action, extras = {}) => write({ action, ...extras });
const write = (body) => context.socialNavWrite({ postData: { contents: JSON.stringify(body) } });
const request = (action, email, extras = {}, googleHosted = true) => {
  const signed = JSON.stringify({ email, subject, googleHosted, issuedAt: Date.now(), payload: { action, ...extras } });
  return write({ signed, signature: sign(signed) });
};
const signed = JSON.stringify({ email: staffEmail, issuedAt: Date.now(), payload: { action: 'staff' } });
assert.equal(write({ signed: signed.replace(staffEmail, adminEmail), signature: sign(signed) }).ok, false);
const expired = JSON.stringify({ email: staffEmail, issuedAt: Date.now() - 120000, payload: { action: 'staff' } });
assert.equal(write({ signed: expired, signature: sign(expired) }).ok, false);
assert.equal(write({ action: 'staff', accessCode: 'a'.repeat(40) }).ok, false);
assert.equal(request('staff', 'unapproved@example.com').ok, false);
const enrollment = request('staff', externalEmail, {}, false);
assert.equal(enrollment.ok, false);
assert(enrollment.error.endsWith(subject));
assert.equal(request('saveMemo', externalEmail, { fileId, memo: '拒否' }, false).ok, false);
staffEntries.set('staff.google.' + externalEmail, JSON.stringify({name: '確認済み', role: 'staff', subject}));
assert.equal(request('staff', externalEmail, {}, false).ok, false);
staffEntries.set('staff.google.' + externalEmail, JSON.stringify({role: 'staff', subject: '1'.repeat(64)}));
assert.equal(request('staff', externalEmail, {}, false).ok, false);
assert.equal(context.socialNavRead({ parameter: { action: 'sync' } }).ok, false);
assert.equal(context.socialNavRead({ parameter: { action: 'updateResource' } }).ok, false);
const read = (action, params = {}) => context.socialNavRead({ parameter: { action, ...params } });
assert.equal(read('memoLogs', { fileId }).ok, false);
assert.equal(read('detail', { fileId }).item.memo, undefined);
assert.equal(read('detail', { fileId }).memoLogs.length, 0);
assert.equal(read('search').results[0].memo, undefined);
assert.equal(read('search').results[0].supportNotes, '送迎は要相談');
assert.equal(read('search', { q: '内部メモ' }).results.length, 0);
assert.equal(request('staffSearch', adminEmail, { q: '内部メモ' }).results[0].memo, '内部メモ');
assert.equal(request('staffDetail', adminEmail, { fileId }).item.memo, '内部メモ');
assert.equal(read('publicUpdates').entries.length, 0);
assert.equal(publicRows, undefined);
assert.equal(request('publishPublicUpdate', 'wrong', { fileId, message: '新版です', displayName: '担当窓口' }).ok, false);
assert.equal(request('publishPublicUpdate', adminEmail, { fileId, message: '新版です' }).ok, false);
assert.equal(request('publishPublicUpdate', adminEmail, { fileId, message: '新版です', displayName: '担当窓口' }).ok, true);
assert.equal(request('publishPublicUpdate', adminEmail, { fileId, message: '新版です', displayName: '担当窓口' }).ok, true);
const feed = read('publicUpdates').entries;
assert.equal(feed.length, 1);
assert.equal(feed[0].displayName, '担当窓口');
assert.equal(feed[0].publishedBy, undefined);
assert.equal(publicRows[1][5], '更新担当');
assert.equal(request('hidePublicUpdate', staffEmail, { updateId: feed[0].updateId }).ok, false);
assert.equal(request('hidePublicUpdate', adminEmail, { updateId: feed[0].updateId }).ok, true);
assert.equal(read('publicUpdates').entries.length, 0);
assert.equal(request('deleteResource', 'wrong', { fileId, mode: 'search' }).ok, false);
assert.equal(request('deleteResource', staffEmail, { fileId, mode: 'search' }).ok, false);
assert.equal(rangeWrites, 0);
parentId = 'search-folder';
assert.equal(request('saveMemo', adminEmail, { fileId, memo: 'メモ', createdBy: '偽名' }).ok, true);
assert.equal(memoAuthor, '更新担当');
const latest = request('timeline', adminEmail);
assert.equal(latest.entries.length, 20);
assert.equal(latest.entries[0].logId, 'log-22');
logs.splice(logs.findIndex((row) => row[0] === latest.nextCursor.logId), 1);
assert.equal(request('timeline', adminEmail, { cursor: latest.nextCursor }).entries.length, 3);
assert.equal(request('deleteResource', adminEmail, { fileId, mode: 'search' }).ok, true);
assert.equal(isTrashed, false);
assert.equal(status[5], 'search');
assert.equal(request('timeline', adminEmail).entries.length, 0);
assert.equal(request('restoreResource', adminEmail, { fileId }).ok, true);
assert.equal(status[0], false);
assert.equal(request('deleteResource', adminEmail, { fileId, mode: 'drive' }).ok, true);
assert.equal(isTrashed, true);
assert.equal(status[5], 'drive');
parentId = 'unavailable';
assert.equal(request('restoreResource', adminEmail, { fileId }).ok, false);
assert.equal(status[0], true);
parentId = 'search-folder';
assert.equal(request('restoreResource', adminEmail, { fileId }).ok, true);
assert.equal(isTrashed, false);
assert.equal(status[0], false);

const publicMemo = publicWrite('saveMemo', { fileId, memo: '職員のメモ' });
assert.equal(publicMemo.ok, true);
assert.equal(publicMemo.item, undefined);
assert(read('detail', { fileId }).memoLogs.some(log => log.memo === '職員のメモ'));
assert.equal(read('search').results[0].latestUpdateMemo, '職員のメモ');
assert(!read('detail', { fileId }).memoLogs.some(log => log.memo === 'メモ0'));
assert.equal(publicWrite('deleteResource', { fileId, mode: 'search' }).ok, false);
assert.equal(publicWrite('deleteMemoLog', { logId: publicMemo.logId }).ok, false);
assert.equal(memoAuthor, '一般利用者');
const publicEdit = publicWrite('updateResource', { fileId, phone: '06-1234-0000', renameDriveFile: false });
assert.equal(publicEdit.ok, true);
assert.equal(publicEdit.item, undefined);
assert.equal(savedResource.supportNotes, '以前の情報メモ');
assert.equal(savedResource.phone, '06-1234-0000');
assert.equal(publicWrite('updateResource', { fileId, renameDriveFile: true }).ok, false);
assert.equal(publicWrite('updateResource', { fileId, renameDriveFile: 'TRUE' }).ok, false);
assert.equal(request('listResourceChangeRequests', staffEmail).ok, false);
assert.equal(publicWrite('requestResourceChange', { fileId, kind: 'delete', reason: '掲載終了' }).ok, true);
assert.equal(status[0], false);
assert.equal(publicWrite('requestResourceChange', { fileId, kind: 'delete', reason: '重複' }).ok, false);
const deletion = request('listResourceChangeRequests', adminEmail).entries[0];
assert.equal(deletion.requestedBy, '一般利用者');
assert.equal(request('resolveResourceChangeRequest', staffEmail, { requestId: deletion.requestId, resolution: 'search' }).ok, false);
trashDenied = true;
shouldFailMove = true;
const denied = request('resolveResourceChangeRequest', adminEmail, { requestId: deletion.requestId, resolution: 'drive' });
assert.equal(denied.ok, false);
assert.match(denied.error, /削除済みPDFフォルダーにも移せません/);
assert.equal(request('listResourceChangeRequests', adminEmail).total, 1);
assert.equal(isTrashed, false);
shouldFailMove = false;
assert.equal(request('deleteResource', adminEmail, { fileId, mode: 'search' }).ok, true);
assert.equal(request('resolveResourceChangeRequest', adminEmail, { requestId: deletion.requestId, resolution: 'drive' }).status, 'archived');
assert.equal(status[0], true);
assert.equal(status[5], 'archive');
assert.equal(parentId, 'archive-folder');
assert.equal(isTrashed, false);
trashDenied = false;
assert.equal(request('restoreResource', adminEmail, { fileId }).ok, true);
assert.equal(publicWrite('requestResourceChange', { fileId, kind: 'replace', reason: '新版', replacementUrl: 'https://example.com/demo.pdf' }).ok, false);
assert.equal(publicWrite('requestResourceChange', { fileId, kind: 'replace', reason: '新版', replacementUrl: 'https://drive.google.com/file/d/new-pdf-test123/view?usp=sharing' }).ok, true);
const replacement = request('listResourceChangeRequests', adminEmail).entries[0];
assert.equal(replacement.replacementFileId, 'new-pdf-test123');
assert.equal(request('resolveResourceChangeRequest', adminEmail, { requestId: replacement.requestId, resolution: 'drive' }).ok, false);
assert.equal(request('resolveResourceChangeRequest', adminEmail, { requestId: replacement.requestId, resolution: 'replacementDone' }).ok, true);
assert.equal(request('listResourceChangeRequests', adminEmail).total, 0);
assert.equal(status[0], false);
assert.equal(read('detail', { fileId }).item.supportNotes, '以前の情報メモ');
assert.equal(publicWrite('updateResource', { fileId, originalSupportNotes: '古い画面', supportNotes: '変更' }).ok, false);
assert.equal(publicWrite('updateResource', { fileId, originalSupportNotes: existingSupportNotes, supportNotes: '1｜2｜3｜4｜5｜6' }).ok, false);
existingSupportNotes = '1｜2｜3｜4｜5｜6';
assert.equal(publicWrite('updateResource', { fileId, originalSupportNotes: existingSupportNotes, supportNotes: '1｜2｜3｜4｜5｜修正' }).ok, true);
assert.equal(savedResource.supportNotes, '1｜2｜3｜4｜5｜修正');
assert.equal(publicWrite('updateResource', { fileId, originalSupportNotes: existingSupportNotes, supportNotes: '1｜2｜3｜4｜5｜6｜7' }).ok, false);
existingSupportNotes = '以前の情報メモ';
assert.equal(publicWrite('updateResource', { fileId, originalSupportNotes: '以前の情報メモ', supportNotes: '内部の新しい情報メモ' }).ok, true);
context.socialNavRecordActivity_('registered', fileId, '自動同期', fileId);
context.socialNavRecordActivity_('registered', fileId, '自動同期', fileId);
const automatic = read('publicUpdates').entries;
for (const label of ['職員のメモ', '情報メモが追加されました。', 'PDF資料が登録されました。', 'PDF資料が差し替えられました。']) {
  assert(automatic.some(entry => entry.message === label));
}
assert(!JSON.stringify(automatic).includes('内部の新しい情報メモ'));
assert(!JSON.stringify(automatic).includes('閲覧担当'));
assert.equal(publicRows.filter(row => row[0] === 'registered:' + fileId).length, 1);
assert(request('timeline', adminEmail).entries.some(entry => entry.type === 'support' && entry.memo === '内部の新しい情報メモ'));

assert.throws(() => context.socialNavReadPdf_({}, { enabled: false }), /無効/);
assert.equal(responseCount, 0);
parentId = 'test-inbox';
rowPresent = false;
shouldFailMove = true;
const draft = {
  area: '守口市', serviceType: '児童発達,放課後等デイサービス', businessName: '操作例', searchKeywords: 'ひらがな',
};
const config = { folderId: parentId };
assert.throws(() => context.socialNavApprove_(queue, 0, config, draft, { name: '更新担当' }), /一時失敗/);
assert.equal(status[5], 'intake');
assert.equal(resourceCreated, 1);
shouldFailMove = false;
assert.equal(context.socialNavApprove_(queue, 0, config, {}, { name: '更新担当' }).ok, true);
assert.equal(resourceCreated, 1);
assert.equal(status[5], '');
assert.equal(status[0], false);
assert.equal(parentId, 'search-folder');
assert.equal(fileName, '守口市_児童発達_操作例.pdf');
assert.equal(queue.data[0][2], 'registered');
console.log('PASS: GET write blocked, staff permissions, attribution, stable timeline, deletion/recovery, disabled AI, registration retry.');
