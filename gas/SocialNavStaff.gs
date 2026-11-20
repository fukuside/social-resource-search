function socialNavRead(request) {
  const params = (request && request.parameter) || {};
  try {
    switch (params.action || 'search') {
      case 'ping':
        return jsonOutput({ok: true, message: 'pong', version: 'staff-timeline-v1'});
      case 'search':
        return jsonOutput(searchResources(params));
      case 'detail': {
        const result = getResource(params.fileId);
        return jsonOutput(result.item?.deletionReason === 'intake' ? {ok: false, error: '登録処理中です。'} : result);
      }
      case 'memoLogs':
        return jsonOutput(getMemoLogs(params.fileId));
      default:
        return jsonOutput({ok: false, error: '利用できない操作です。'});
    }
  } catch (error) {
    console.error(error);
    return jsonOutput({ok: false, error: 'データを取得できませんでした。'});
  }
}

function socialNavWrite(request) {
  try {
    const body = JSON.parse((request && request.postData && request.postData.contents) || '{}');
    const staff = socialNavStaff_(body.accessCode);
    if (!staff) return jsonOutput({ok: false, error: '職員コードを確認してください。'});
    if (body.action === 'staff') return jsonOutput({ok: true, staff});
    if (body.action === 'timeline') return jsonOutput(socialNavTimeline_(body.cursor));
    const staffActions = ['saveMemo', 'updateResource', 'requestResourceChange'];
    if (staff.role !== 'admin' && !staffActions.includes(body.action)) {
      return jsonOutput({ok: false, error: '管理者権限が必要です。'});
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      ensureHeader();
      switch (body.action) {
        case 'requestResourceChange':
          return jsonOutput(socialNavRequestChange_(body, staff));
        case 'listResourceChangeRequests':
          return jsonOutput(socialNavListChangeRequests_());
        case 'resolveResourceChangeRequest':
          return jsonOutput(socialNavResolveChange_(body, staff));
        case 'saveMemo': {
          const resource = getResource(body.fileId);
          if (!resource.ok || socialNavDeleted_(resource.item)) {
            return jsonOutput({ok: false, error: '更新できる事業所が見つかりません。'});
          }
          return jsonOutput(saveMemoLog(body.fileId, socialNavSheetText_(body.memo), staff.name));
        }
        case 'deleteMemoLog':
          return jsonOutput(deleteMemoLog(body.logId));
        case 'intakeList':
          return jsonOutput(socialNavIntakeList_(body.offset));
        case 'intakeReread':
        case 'intakeApprove': {
          const config = socialNavIntakeConfig_();
          const queue = socialNavQueue_();
          const index = queue.data.findIndex(row => row[0] === body.fileId);
          if (index < 0) return jsonOutput({ok: false, error: '受付データが見つかりません。'});
          if (body.action === 'intakeReread') return jsonOutput(socialNavIntakeRead_(queue, index, config));
          try {
            return jsonOutput(socialNavApprove_(queue, index, config, body.data, staff));
          } catch (error) {
            queue.sheet.getRange(index + 2, 6).setValue(socialNavSheetText_(error.message));
            return jsonOutput({ok: false, error: '登録を完了できませんでした。受付画面で状態を確認してください。'});
          }
        }
        case 'deleteResource':
        case 'restoreResource':
          return jsonOutput(socialNavChangeDeletion_(body));
        case 'updateResource': {
          const resource = getResource(body.fileId);
          if (!resource.ok || socialNavDeleted_(resource.item)) {
            return jsonOutput({ok: false, error: '更新できる事業所が見つかりません。'});
          }
          if (String(body.renameDriveFile) === 'true') {
            if (staff.role !== 'admin') return jsonOutput({ok: false, error: 'PDF名の変更は管理者のみ行えます。'});
            const types = String(body.serviceType || '').split(',').map(value => value.trim()).filter(Boolean);
            if (types.length !== 1) return jsonOutput({ok: false, error: 'サービス種別を1つ選んでください。'});
            const fileName = buildManagedFileName(body.area, types[0], body.businessName, body.tags);
            const matches = DriveApp.getFolderById(FOLDER_ID).getFilesByName(fileName);
            while (matches.hasNext()) {
              if (matches.next().getId() !== String(body.fileId)) {
                return jsonOutput({ok: false, error: '同名のPDFがすでにあります。'});
              }
            }
          }
          const fields = ['area', 'serviceType', 'businessName', 'tags', 'supportFlags', 'supportNotes', 'phone', 'address', 'searchKeywords'];
          if (fields.some(field => /^\s*=/.test(String(body[field] || '')))) {
            return jsonOutput({ok: false, error: '基本情報の先頭に等号を入力できません。'});
          }
          const result = updateResource(body);
          if (result.ok) {
            const row = socialNavResourceRow_(body.fileId);
            if (row) row.sheet.getRange(row.number, 20).setValue(true);
          }
          return jsonOutput(result);
        }
        default:
          return jsonOutput({ok: false, error: '利用できない操作です。'});
      }
    } finally {
      try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
    }
  } catch (error) {
    console.error(error);
    return jsonOutput({ok: false, error: '処理できませんでした。時間をおいて再試行してください。'});
  }
}

// Register SHA-256 digests of randomly generated individual codes in Script Properties.
// Every entry has the form staff.<64 lowercase hex digits> = {"name":"職員名","role":"staff"}.
function socialNavStaff_(code) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(code)) return null;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, code, Utilities.Charset.UTF_8);
  const digest = bytes.map(byte => ('0' + (byte & 255).toString(16)).slice(-2)).join('');
  const value = PropertiesService.getScriptProperties().getProperty('staff.' + digest);
  if (!value) return null;
  const entry = JSON.parse(value);
  if (typeof entry.name !== 'string' || !entry.name.trim() || !['staff', 'admin'].includes(entry.role)) return null;
  return {name: entry.name.trim(), role: entry.role};
}

function socialNavDeleted_(item) {
  return String(item.isDeleted || '').toLowerCase() === 'true';
}

function socialNavSheetText_(value) {
  const text = String(value || '').trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function socialNavTimeline_(cursor) {
  const logSheet = getMemoLogSheet();
  const count = logSheet.getLastRow() - 1;
  if (count <= 0) return {ok: true, entries: [], nextCursor: null};

  const resourceRows = getSheet().getDataRange().getValues();
  const resources = new Map(resourceRows.slice(1).map(row => [String(row[0]), rowToObject(resourceRows[0], row)]));
  const pageSize = 20;
  const compare = (left, right) => right.time - left.time || right.logId.localeCompare(left.logId);
  const boundary = cursor && Number.isFinite(cursor.time) && typeof cursor.logId === 'string' ? cursor : null;
  const page = [];

  // Keep only the next page in memory. The cursor remains valid when a log is removed.
  for (let row = count + 1; row >= 2; row -= 500) {
    const first = Math.max(2, row - 499);
    const batch = logSheet.getRange(first, 1, row - first + 1, 5).getValues();
    for (const [id, fileId, memo, createdAt, createdBy] of batch) {
      const resource = resources.get(String(fileId));
      const time = new Date(createdAt).getTime();
      if (!id || !resource || socialNavDeleted_(resource) || !Number.isFinite(time)) continue;
      const logId = String(id);
      if (boundary && compare({time, logId}, boundary) <= 0) continue;
      const last = page[pageSize];
      if (last && compare({time, logId}, last) >= 0) continue;
      page.push({
        type: 'memo', logId, fileId, memo, createdAt, createdBy, time,
        businessName: resource.businessName, area: resource.area, serviceType: resource.serviceType,
      });
      page.sort(compare);
      if (page.length > pageSize + 1) page.pop();
    }
  }

  const entries = page.slice(0, pageSize);
  const lastEntry = entries[entries.length - 1];
  const nextCursor = page.length > pageSize ? {time: lastEntry.time, logId: lastEntry.logId} : null;
  return {ok: true, entries, nextCursor};
}


function socialNavResourceRow_(fileId) {
  const sheet = getSheet();
  const count = sheet.getLastRow() - 1;
  if (count <= 0 || !fileId) return null;
  const cells = sheet.getRange(2, 1, count, 1);
  const match = cells.createTextFinder(String(fileId)).matchEntireCell(true).matchCase(true).findNext();
  return match ? {sheet, number: match.getRow()} : null;
}

function socialNavChangeDeletion_(body) {
  const row = socialNavResourceRow_(body.fileId);
  if (!row) return {ok: false, error: '対象の登録が見つかりません。'};

  // N:S includes the existing deletion fields and the new deletion reason.
  const range = row.sheet.getRange(row.number, 14, 1, 6);
  const [values] = range.getValues();
  const deleted = String(values[0]).toLowerCase() === 'true';
  const reason = values[5];
  if (reason === 'intake') return {ok: false, error: 'AI受付画面で登録を再開してください。'};

  if (body.action === 'deleteResource' && body.mode === 'search') {
    if (deleted) return {ok: reason === 'search', error: 'すでに削除済みです。'};
    values[0] = true;
    values[1] = new Date();
    values[5] = 'search';
    range.setValues([values]);
    return {ok: true};
  }

  const file = socialNavFindPdf_(body.fileId);
  if (!file) return {ok: false, error: 'PDFを確認できません。完全削除済みか、アクセス権がありません。'};
  if (body.action === 'restoreResource') {
    if (!deleted) return {ok: true};
    if (file.isTrashed()) file.setTrashed(false);
    if (!socialNavInFolder_(file)) {
      return {ok: false, error: 'PDFを検索用フォルダーに戻してから復元してください。'};
    }
    values[0] = false;
    values[1] = '';
    values[5] = '';
  } else if (body.mode === 'drive') {
    if (deleted && reason && reason !== 'drive') {
      return {ok: false, error: 'いったん復元してからPDFを削除してください。'};
    }
    if (!file.isTrashed() && !socialNavInFolder_(file)) {
      return {ok: false, error: 'PDFが検索用フォルダーにありません。'};
    }
    if (!file.isTrashed()) file.setTrashed(true);
    values[0] = true;
    values[1] = values[1] || new Date();
    values[5] = 'drive';
  } else {
    return {ok: false, error: '削除方法を指定してください。'};
  }
  range.setValues([values]);
  return {ok: true};
}

function socialNavFindPdf_(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    return file.getMimeType() === MimeType.PDF ? file : null;
  } catch {
    return null;
  }
}

function socialNavInFolder_(file, folderId = FOLDER_ID) {
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) return true;
  }
  return false;
}





const SOCIAL_NAV_CHANGE_HEADERS = [
  'requestId', 'fileId', 'businessName', 'kind', 'replacementFileId', 'reason',
  'requestedBy', 'requestedAt', 'status', 'resolvedBy', 'resolvedAt',
];

function socialNavChangeSheet_() {
  const book = SpreadsheetApp.openById(SHEET_ID);
  const sheet = book.getSheetByName('resource_change_requests') || book.insertSheet('resource_change_requests');
  if (!sheet.getLastRow()) sheet.appendRow(SOCIAL_NAV_CHANGE_HEADERS);
  const values = sheet.getRange(1, 1, sheet.getLastRow(), SOCIAL_NAV_CHANGE_HEADERS.length).getValues();
  if (SOCIAL_NAV_CHANGE_HEADERS.some((value, index) => values[0][index] !== value)) {
    throw new Error('変更依頼シートのヘッダーが一致しません。');
  }
  return {sheet, rows: values.slice(1)};
}

function socialNavRequestChange_(body, staff) {
  const resource = getResource(body.fileId);
  if (!resource.ok || socialNavDeleted_(resource.item)) return {ok:false, error:'依頼できる資料が見つかりません。'};
  if (!['delete', 'replace'].includes(body.kind)) return {ok:false, error:'依頼の種類を指定してください。'};
  const reason = String(body.reason || '').trim();
  if (!reason || reason.length > 500) return {ok:false, error:'依頼理由を500文字以内で入力してください。'};
  let replacementFileId = '';
  if (body.kind === 'replace') {
    const link = String(body.replacementUrl || '').trim();
    const match = link.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]{10,})\/(?:view|preview)(?:[?#][^\s]*)?$/);
    if (!match || match[1] === String(body.fileId)) return {ok:false, error:'差し替え用の新しいPDFのGoogle Driveリンクを入力してください。'};
    replacementFileId = match[1];
  }
  const data = socialNavChangeSheet_();
  const pending = data.rows.some(row => row[1] === String(body.fileId) && row[3] === body.kind && row[8] === 'pending');
  if (pending) return {ok:false, error:'同じ資料に未処理の依頼があります。'};
  data.sheet.appendRow([
    Utilities.getUuid(), String(body.fileId), socialNavSheetText_(resource.item.businessName || resource.item.fileName),
    body.kind, replacementFileId, socialNavSheetText_(reason), socialNavSheetText_(staff.name), new Date(), 'pending', '', '',
  ]);
  return {ok:true};
}

function socialNavListChangeRequests_() {
  const data = socialNavChangeSheet_();
  const entries = data.rows.filter(row => row[8] === 'pending').map(row => rowToObject(SOCIAL_NAV_CHANGE_HEADERS, row));
  return {ok:true, entries:entries.slice(0, 100), total:entries.length};
}

function socialNavResolveChange_(body, staff) {
  const data = socialNavChangeSheet_();
  const index = data.rows.findIndex(row => row[0] === body.requestId);
  if (index < 0) return {ok:false, error:'依頼が見つかりません。'};
  const row = data.rows[index];
  if (row[8] !== 'pending') return {ok:false, error:'この依頼は処理済みです。'};
  let status;
  if (body.resolution === 'reject') {
    status = 'rejected';
  } else if (row[3] === 'replace' && body.resolution === 'replacementDone') {
    status = 'replaced';
  } else if (row[3] === 'delete' && ['search', 'drive'].includes(body.resolution)) {
    const result = socialNavChangeDeletion_({action:'deleteResource', fileId:row[1], mode:body.resolution});
    if (!result.ok) return result;
    status = body.resolution === 'search' ? 'hidden' : 'trashed';
  } else {
    return {ok:false, error:'この依頼に対して選べない操作です。'};
  }
  data.sheet.getRange(index + 2, 9, 1, 3).setValues([[status, socialNavSheetText_(staff.name), new Date()]]);
  return {ok:true};
}
