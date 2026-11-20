import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const staffCode = 'a'.repeat(40);
const adminCode = 'b'.repeat(40);
const digest = (code) => createHash('sha256').update(code).digest('hex');
const staffEntries = new Map([
  ['staff.' + digest(staffCode), JSON.stringify({ name: '閲覧担当', role: 'staff' })],
  ['staff.' + digest(adminCode), JSON.stringify({ name: '更新担当', role: 'admin' })],
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
let responseCount = 0;
let rowPresent = true;
const queue = { data: [[fileId, '未整理.pdf', 'review', 'digest', '{}', '', new Date(), 1, '']] };
let parentId = 'test-inbox';
let fileName = '未整理.pdf';
let resourceCreated = 0;
let shouldFailMove = false;
let rangeWrites = 0;
const file = {
  isTrashed: () => isTrashed,
  setTrashed: (value) => { isTrashed = value; },
  getMimeType: () => 'pdf',
  getParents: () => iterator([{ getId: () => parentId }]),
  getName: () => fileName,
  setName: (name) => { fileName = name; },
  moveTo: () => { if (shouldFailMove) throw new Error('一時失敗'); parentId = 'search-folder'; },
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
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (algorithm, code) => [...Buffer.from(digest(code), 'hex')],
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
    getFolderById: () => ({ getFilesByName: () => iterator([]) }),
  },
  getSheet: () => sheet,
  getMemoLogSheet: () => ({
    getLastRow: () => logs.length + 1,
    getRange: (first, col, length) => ({ getValues: () => logs.slice(first - 2, first - 2 + length) }),
  }),
  rowToObject: (headers, row) => Object.fromEntries(headers.map((key, i) => [key, row[i]])),
  getResource: () => ({ ok: true, item: { isDeleted: status[0], memo: '内部メモ', businessName: '操作例' }, memoLogs: logs }),
  searchResources: (params, includeStaffMemos = true) => ({
    ok: true, results: params.q && !includeStaffMemos ? [] : [{ fileId, memo: '内部メモ' }],
  }),
  saveMemoLog: (id, memo, name) => { memoAuthor = name; return { ok: true }; },
  updateResource: (body) => { savedResource = body; return { ok: true }; },
  buildManagedFileName: (area, service, name) => [area, service, name].join('_') + '.pdf',
  ensureHeader() {},
  jsonOutput: (value) => value,
});
for (const filename of ['Classification.gs', 'SocialNavStaff.gs', 'SocialNavIntake.gs']) {
  runInContext(readFileSync(new URL('./' + filename, import.meta.url), 'utf8'), context, { filename });
}
const request = (action, accessCode, extras = {}) => context.socialNavWrite({
  postData: { contents: JSON.stringify({ action, accessCode, ...extras }) },
});
assert.equal(context.socialNavRead({ parameter: { action: 'sync' } }).ok, false);
assert.equal(context.socialNavRead({ parameter: { action: 'updateResource' } }).ok, false);
const read = (action, params = {}) => context.socialNavRead({ parameter: { action, ...params } });
assert.equal(read('memoLogs', { fileId }).ok, false);
assert.equal(read('detail', { fileId }).item.memo, undefined);
assert.equal(read('detail', { fileId }).memoLogs, undefined);
assert.equal(read('search').results[0].memo, undefined);
assert.equal(read('search', { q: '内部メモ' }).results.length, 0);
assert.equal(request('staffSearch', staffCode, { q: '内部メモ' }).results[0].memo, '内部メモ');
assert.equal(request('staffDetail', staffCode, { fileId }).item.memo, '内部メモ');
assert.equal(read('publicUpdates').entries.length, 0);
assert.equal(publicRows, undefined);
assert.equal(request('publishPublicUpdate', 'wrong', { fileId, message: '新版です', displayName: '担当窓口' }).ok, false);
assert.equal(request('publishPublicUpdate', staffCode, { fileId, message: '新版です' }).ok, false);
assert.equal(request('publishPublicUpdate', staffCode, { fileId, message: '新版です', displayName: '担当窓口' }).ok, true);
assert.equal(request('publishPublicUpdate', staffCode, { fileId, message: '新版です', displayName: '担当窓口' }).ok, true);
const feed = read('publicUpdates').entries;
assert.equal(feed.length, 1);
assert.equal(feed[0].displayName, '担当窓口');
assert.equal(feed[0].publishedBy, undefined);
assert.equal(publicRows[1][5], '閲覧担当');
assert.equal(request('hidePublicUpdate', staffCode, { updateId: feed[0].updateId }).ok, false);
assert.equal(request('hidePublicUpdate', adminCode, { updateId: feed[0].updateId }).ok, true);
assert.equal(read('publicUpdates').entries.length, 0);
assert.equal(request('deleteResource', 'wrong', { fileId, mode: 'search' }).ok, false);
assert.equal(request('deleteResource', staffCode, { fileId, mode: 'search' }).ok, false);
assert.equal(rangeWrites, 0);
parentId = 'search-folder';
assert.equal(request('saveMemo', adminCode, { fileId, memo: 'メモ', createdBy: '偽名' }).ok, true);
assert.equal(memoAuthor, '更新担当');
const latest = request('timeline', staffCode);
assert.equal(latest.entries.length, 20);
assert.equal(latest.entries[0].logId, 'log-22');
logs.splice(logs.findIndex((row) => row[0] === latest.nextCursor.logId), 1);
assert.equal(request('timeline', staffCode, { cursor: latest.nextCursor }).entries.length, 3);
assert.equal(request('deleteResource', adminCode, { fileId, mode: 'search' }).ok, true);
assert.equal(isTrashed, false);
assert.equal(status[5], 'search');
assert.equal(request('timeline', staffCode).entries.length, 0);
assert.equal(request('restoreResource', adminCode, { fileId }).ok, true);
assert.equal(status[0], false);
assert.equal(request('deleteResource', adminCode, { fileId, mode: 'drive' }).ok, true);
assert.equal(isTrashed, true);
assert.equal(status[5], 'drive');
parentId = 'unavailable';
assert.equal(request('restoreResource', adminCode, { fileId }).ok, false);
assert.equal(status[0], true);
parentId = 'search-folder';
assert.equal(request('restoreResource', adminCode, { fileId }).ok, true);
assert.equal(isTrashed, false);
assert.equal(status[0], false);

assert.equal(request('saveMemo', staffCode, { fileId, memo: '職員のメモ' }).ok, true);
assert.equal(memoAuthor, '閲覧担当');
assert.equal(request('updateResource', staffCode, { fileId, phone: '06-1234-0000', renameDriveFile: false }).ok, true);
assert.equal(savedResource.phone, '06-1234-0000');
assert.equal(request('updateResource', staffCode, { fileId, renameDriveFile: true }).ok, false);
assert.equal(request('listResourceChangeRequests', staffCode).ok, false);
assert.equal(request('requestResourceChange', staffCode, { fileId, kind: 'delete', reason: '掲載終了' }).ok, true);
assert.equal(status[0], false);
assert.equal(request('requestResourceChange', staffCode, { fileId, kind: 'delete', reason: '重複' }).ok, false);
const deletion = request('listResourceChangeRequests', adminCode).entries[0];
assert.equal(deletion.requestedBy, '閲覧担当');
assert.equal(request('resolveResourceChangeRequest', staffCode, { requestId: deletion.requestId, resolution: 'search' }).ok, false);
assert.equal(request('resolveResourceChangeRequest', adminCode, { requestId: deletion.requestId, resolution: 'search' }).ok, true);
assert.equal(status[0], true);
assert.equal(request('restoreResource', adminCode, { fileId }).ok, true);
assert.equal(request('requestResourceChange', staffCode, { fileId, kind: 'replace', reason: '新版', replacementUrl: 'https://example.com/demo.pdf' }).ok, false);
assert.equal(request('requestResourceChange', staffCode, { fileId, kind: 'replace', reason: '新版', replacementUrl: 'https://drive.google.com/file/d/new-pdf-test123/view?usp=sharing' }).ok, true);
const replacement = request('listResourceChangeRequests', adminCode).entries[0];
assert.equal(replacement.replacementFileId, 'new-pdf-test123');
assert.equal(request('resolveResourceChangeRequest', adminCode, { requestId: replacement.requestId, resolution: 'drive' }).ok, false);
assert.equal(request('resolveResourceChangeRequest', adminCode, { requestId: replacement.requestId, resolution: 'replacementDone' }).ok, true);
assert.equal(request('listResourceChangeRequests', adminCode).total, 0);
assert.equal(status[0], false);

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
