function socialNavRead(request) {
  const params = (request && request.parameter) || {};
  try {
    switch (params.action || 'search') {
      case 'ping':
        return jsonOutput({ok: true, message: 'pong', version: 'archive-deletion-v1'});
      case 'publicUpdates':
        return jsonOutput(socialNavPublicUpdates_());
      case 'search': {
        const result = searchResources(params, false);
        const latestMemos = socialNavLatestPublicMemos_(result.results);
        return jsonOutput({...result, results: result.results.map(resource => ({
          ...socialNavPublicResource_(resource),
          supportNotes: String(resource.supportNotes || ''),
          latestUpdateMemo: latestMemos.get(String(resource.fileId)) || '',
        }))});
      }
      case 'detail': {
        const result = getResource(params.fileId);
        if (!result.ok || result.item?.deletionReason === 'intake') {
          return jsonOutput({ok: false, error: '資料が見つかりません。'});
        }
        const memoLogs = socialNavDeleted_(result.item) ? [] : socialNavPublicUpdates_(String(params.fileId)).entries
          .map(entry => ({logId: entry.updateId, memo: entry.message, createdAt: entry.publishedAt, createdBy: entry.displayName}));
        return jsonOutput({ok: true, item: socialNavPublicResource_(result.item), memoLogs});
      }
      case 'memoLogs':
        return jsonOutput({ok: false, error: 'Googleログインが必要です。'});
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
    const envelope = JSON.parse(request?.postData?.contents || '{}');
    const publicActions = ['saveMemo', 'updateResource', 'requestResourceChange'];
    const publicWrite = !envelope.signed && publicActions.includes(envelope.action);
    const verified = publicWrite
      ? {body: envelope, staff: {name: '一般利用者', role: 'public', publicDisplayName: '一般利用者'}}
      : socialNavVerifiedRequest_(envelope);
    if (!verified) return jsonOutput({ok: false, error: '管理者のGoogleアカウントでログインしてください。'});
    if (verified.enrollment) {
      return jsonOutput({ok: false, error: '初回登録が必要です。本人確認のため、管理者へこの登録IDを伝えてください。\n' + verified.enrollment});
    }
    const {body, staff} = verified;
    if (body.action === 'staff' && staff.role === 'admin') return jsonOutput({ok: true, staff});
    if (!publicWrite && staff.role !== 'admin') {
      return jsonOutput({ok: false, error: '管理者権限が必要です。'});
    }
    if (body.action === 'timeline') return jsonOutput(socialNavTimeline_(body.cursor));
    if (body.action === 'staffSearch') return jsonOutput(searchResources(body));
    if (body.action === 'staffDetail') {
      const result = getResource(body.fileId);
      return jsonOutput(result.item?.deletionReason === 'intake' ? {ok: false, error: '登録処理中です。'} : result);
    }
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      ensureHeader();
      switch (body.action) {
        case 'publishPublicUpdate':
          return jsonOutput(socialNavPublishUpdate_(body, staff));
        case 'hidePublicUpdate':
          return jsonOutput(socialNavHideUpdate_(body.updateId));
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
          const memo = String(body.memo || '').trim();
          if (!memo || memo.length > 2000) return jsonOutput({ok: false, error: '更新メモは2000文字以内で入力してください。'});
          const result = saveMemoLog(body.fileId, socialNavSheetText_(memo), staff.name);
          if (result.ok && result.logId) {
            socialNavRecordActivity_('memo', body.fileId, staff.name, result.logId, '', staff.publicDisplayName, memo);
          }
          return jsonOutput(publicWrite && result.ok ? {ok: true, logId: result.logId} : result);
        }
        case 'deleteMemoLog': {
          const result = deleteMemoLog(body.logId);
          if (result.ok) socialNavHideUpdate_('memo:' + body.logId);
          return jsonOutput(result);
        }
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
          if (String(body.renameDriveFile).toLowerCase() === 'true') {
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
          if (publicWrite) {
            for (const field of fields) {
              if (field === 'supportNotes') continue;
              if (!Object.prototype.hasOwnProperty.call(body, field)) body[field] = String(resource.item[field] || '');
            }
            if (fields.some(field => body[field] !== undefined &&
                (typeof body[field] !== 'string' || body[field].length > 2000))) {
              return jsonOutput({ok: false, error: '各項目は2000文字以内で入力してください。'});
            }
          }
          if (fields.some(field => /^\s*=/.test(String(body[field] || '')))) {
            return jsonOutput({ok: false, error: '基本情報の先頭に等号を入力できません。'});
          }
          if (publicWrite) {
            body.renameDriveFile = false;
            const existingNotes = String(resource.item.supportNotes || '').split('｜').map(note => note.trim()).filter(Boolean);
            const newNotes = String(body.supportNotes || '').split('｜').map(note => note.trim()).filter(Boolean);
            body.supportNotes = [...new Set([...existingNotes, ...newNotes])].join('｜');
          }
          const result = updateResource(body);
          if (result.ok) {
            const row = socialNavResourceRow_(body.fileId);
            if (row) row.sheet.getRange(row.number, 20).setValue(true);
            const previousNotes = new Set(String(resource.item.supportNotes || '').split('｜').map(note => note.trim()));
            const additions = [...new Set(String(body.supportNotes || '').split('｜').map(note => note.trim()))]
              .filter(note => note && !previousNotes.has(note));
            if (additions.length) socialNavRecordActivity_('support', body.fileId, staff.name, '', additions.join('\n'), staff.publicDisplayName);
          }
          return jsonOutput(publicWrite && result.ok ? {ok: true} : result);
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

function socialNavVerifiedRequest_(envelope) {
  const {signed, signature} = envelope || {};
  if (typeof signed !== 'string' || typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return null;
  const properties = PropertiesService.getScriptProperties();
  const key = properties.getProperty('SOCIAL_NAV_AUTH_SECRET');
  if (!key || key.length < 43) return null;
  const bytes = Utilities.computeHmacSha256Signature(signed, key, Utilities.Charset.UTF_8);
  const expected = bytes.map(byte => ('0' + (byte & 255).toString(16)).slice(-2)).join('');
  let differences = 0;
  for (let i = 0; i < expected.length; i++) differences |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  if (differences) return null;

  const {email, subject, googleHosted, name, issuedAt, payload} = JSON.parse(signed);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 60000) return null;
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+$/.test(email) || typeof payload?.action !== 'string') return null;
  if (typeof subject !== 'string' || !/^[0-9a-f]{64}$/.test(subject)) return null;
  const emailBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email, Utilities.Charset.UTF_8);
  const emailHash = emailBytes.map(byte => ('0' + (byte & 255).toString(16)).slice(-2)).join('');
  const defaults = JSON.parse(properties.getProperty('SOCIAL_NAV_STAFF_ROSTER') || '{}');
  const explicit = properties.getProperty('staff.google.' + email);
  const profile = explicit ? JSON.parse(explicit) : defaults[emailHash];
  if (!profile || profile.role === 'disabled') return null;
  if (profile.subject ? subject !== profile.subject : !googleHosted) {
    return !profile.subject && payload.action === 'staff' ? {enrollment: subject} : null;
  }
  const googleName = typeof name === 'string' ? name.replace(/[\r\n]+/g, ' ').trim().slice(0, 80) : '';
  const staff = socialNavStaffProfile_({...profile, name: profile.name || googleName || '資料担当'});
  return staff ? {staff, body: payload} : null;
}

function socialNavStaffProfile_(entry) {
  if (!entry || typeof entry.name !== 'string' || !entry.name.trim() || !['staff', 'admin'].includes(entry.role)) return null;
  const publicDisplayName = typeof entry.publicDisplayName === 'string'
    ? entry.publicDisplayName.replace(/[\r\n]+/g, ' ').trim().slice(0, 40)
    : '';
  return {name: entry.name.trim(), role: entry.role, publicDisplayName};
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

  const resourceRows = getSheet().getDataRange().getValues();
  const resources = new Map(resourceRows.slice(1).map(row => [String(row[0]), rowToObject(resourceRows[0], row)]));
  const pageSize = 20;
  const compare = (left, right) => right.time - left.time || right.logId.localeCompare(left.logId);
  const boundary = cursor && Number.isFinite(cursor.time) && typeof cursor.logId === 'string' ? cursor : null;
  const page = [];

  const collect = (source, width, convert) => {
    if (!source) return;
    for (let row = source.getLastRow(); row >= 2; row -= 500) {
      const first = Math.max(2, row - 499);
      const batch = source.getRange(first, 1, row - first + 1, width).getValues();
      for (const values of batch) {
        const entry = convert(values);
        if (!entry) continue;
        const {id, fileId, memo, createdAt, createdBy, type} = entry;
        const resource = resources.get(String(fileId));
        const time = new Date(createdAt).getTime();
        if (!id || !resource || socialNavDeleted_(resource) || !Number.isFinite(time)) continue;
        const logId = String(id);
        if (boundary && compare({time, logId}, boundary) <= 0) continue;
        const last = page[pageSize];
        if (last && compare({time, logId}, last) >= 0) continue;
        page.push({
          type, logId, fileId, memo, createdAt, createdBy, time,
          businessName: resource.businessName, area: resource.area, serviceType: resource.serviceType,
        });
        page.sort(compare);
        if (page.length > pageSize + 1) page.pop();
      }
    }
  };
  collect(logSheet, 5, ([id, fileId, memo, createdAt, createdBy]) =>
    ({id, fileId, memo, createdAt, createdBy, type: 'memo'}));
  const activitySheet = socialNavPublicUpdateSheet_(false);
  collect(activitySheet, 8, ([id, fileId, message, , createdAt, createdBy, , staffMessage]) => {
    const type = String(id).split(':')[0];
    if (!['support', 'registered', 'replaced'].includes(type)) return null;
    return {id, fileId, memo: staffMessage || message, createdAt, createdBy, type};
  });

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
    if (reason === 'archive' && !socialNavInFolder_(file)) {
      const archive = socialNavArchiveFolder_(false);
      if (!archive || !socialNavInFolder_(file, archive.getId())) {
        return {ok: false, error: 'PDFが削除済みPDFフォルダーにありません。'};
      }
      file.moveTo(DriveApp.getFolderById(FOLDER_ID));
    }
    if (!socialNavInFolder_(file)) {
      return {ok: false, error: 'PDFを検索用フォルダーに戻してから復元してください。'};
    }
    values[0] = false;
    values[1] = '';
    values[5] = '';
  } else if (body.mode === 'drive') {
    let destination = 'drive';
    if (!file.isTrashed()) {
      if (!socialNavInFolder_(file)) {
        const archive = socialNavArchiveFolder_(false);
        if (!archive || !socialNavInFolder_(file, archive.getId())) {
          return {ok: false, error: 'PDFが検索用フォルダーまたは削除済みPDFフォルダーにありません。'};
        }
        destination = 'archive';
      } else {
        try {
          file.setTrashed(true);
        } catch (trashError) {
          console.warn('Driveのゴミ箱へ移動できませんでした', trashError);
          if (!file.isTrashed()) {
            try {
              file.moveTo(socialNavArchiveFolder_(true));
              destination = 'archive';
            } catch (moveError) {
              console.error('削除済みPDFフォルダーへ移動できませんでした', moveError);
              return {ok: false, error: 'PDFをゴミ箱にも削除済みPDFフォルダーにも移せませんでした。Driveの移動権限を確認してください。'};
            }
          }
        }
      }
    }
    values[0] = true;
    values[1] = values[1] || new Date();
    values[5] = destination;
    range.setValues([values]);
    return {ok: true, destination};
  } else {
    return {ok: false, error: '削除方法を指定してください。'};
  }
  range.setValues([values]);
  return {ok: true};
}

function socialNavArchiveFolder_(create) {
  const parent = DriveApp.getFolderById(FOLDER_ID);
  const matches = parent.getFoldersByName('削除済みPDF');
  if (!matches.hasNext()) return create ? parent.createFolder('削除済みPDF') : null;
  const folder = matches.next();
  if (matches.hasNext()) throw Error('検索用フォルダー内に削除済みPDFフォルダーが複数あります。');
  return folder;
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
    socialNavRecordActivity_('replaced', row[1], staff.name, String(row[0]), '', staff.publicDisplayName);
  } else if (row[3] === 'delete' && ['search', 'drive'].includes(body.resolution)) {
    const result = socialNavChangeDeletion_({action:'deleteResource', fileId:row[1], mode:body.resolution});
    if (!result.ok) return result;
    status = body.resolution === 'search' ? 'hidden' : result.destination === 'archive' ? 'archived' : 'trashed';
  } else {
    return {ok:false, error:'この依頼に対して選べない操作です。'};
  }
  data.sheet.getRange(index + 2, 9, 1, 3).setValues([[status, socialNavSheetText_(staff.name), new Date()]]);
  return {ok:true, status};
}

const SOCIAL_NAV_PUBLIC_UPDATE_HEADERS = [
  'updateId', 'fileId', 'message', 'displayName', 'publishedAt', 'publishedBy', 'isHidden',
];

function socialNavPublicResource_(resource) {
  const publicResource = {...resource};
  delete publicResource.memo;
  delete publicResource.supportNotes;
  return publicResource;
}

function socialNavPublicUpdateSheet_(create) {
  const book = SpreadsheetApp.openById(SHEET_ID);
  let sheet = book.getSheetByName('public_updates');
  if (!sheet && create) {
    sheet = book.insertSheet('public_updates');
    sheet.appendRow(SOCIAL_NAV_PUBLIC_UPDATE_HEADERS);
  }
  if (!sheet) return null;
  const header = sheet.getRange(1, 1, 1, SOCIAL_NAV_PUBLIC_UPDATE_HEADERS.length).getValues()[0];
  if (SOCIAL_NAV_PUBLIC_UPDATE_HEADERS.some((value, index) => header[index] !== value)) {
    throw new Error('公開更新シートのヘッダーが一致しません。');
  }
  return sheet;
}

const SOCIAL_NAV_ACTIVITY_TEXT = {
  memo: '更新メモが追加されました。',
  support: '情報メモが追加されました。',
  registered: 'PDF資料が登録されました。',
  replaced: 'PDF資料が差し替えられました。',
};

function socialNavRecordActivity_(type, fileId, actor, sourceId, staffMessage, publicDisplayName, publicMemo) {
  const sheet = socialNavPublicUpdateSheet_(true);
  const id = type + ':' + (sourceId || Utilities.getUuid());
  const count = sheet.getLastRow() - 1;
  if (sourceId && count > 0 && sheet.getRange(2, 1, count, 1).createTextFinder(id)
      .matchEntireCell(true).matchCase(true).findNext()) return;
  const privateColumn = sheet.getRange(1, 8);
  const existingHeader = privateColumn.getValue();
  if (existingHeader && existingHeader !== 'staffMessage') throw Error('公開更新シートの追加列が使用されています。');
  if (!existingHeader) privateColumn.setValue('staffMessage');
  sheet.appendRow([
    id, String(fileId), socialNavSheetText_(publicMemo || SOCIAL_NAV_ACTIVITY_TEXT[type]),
    socialNavSheetText_(publicDisplayName || '資料担当'), new Date(),
    socialNavSheetText_(actor), false, socialNavSheetText_(staffMessage),
  ]);
}

function socialNavLatestPublicMemos_(resources) {
  const latest = new Map();
  const activeIds = new Set(resources.filter(item => !socialNavDeleted_(item)).map(item => String(item.fileId)));
  const sheet = activeIds.size && socialNavPublicUpdateSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return latest;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, SOCIAL_NAV_PUBLIC_UPDATE_HEADERS.length).getValues();
  for (const [updateId, fileId, message, , , , isHidden] of rows.reverse()) {
    const id = String(fileId);
    if (!activeIds.has(id) || latest.has(id) || !String(updateId).startsWith('memo:') ||
        String(isHidden).toLowerCase() === 'true' || !message) continue;
    latest.set(id, message);
  }
  return latest;
}

function socialNavPublicUpdates_(memoFileId) {
  const sheet = socialNavPublicUpdateSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return {ok: true, entries: []};
  const resources = getSheet().getDataRange().getValues();
  const byId = new Map(resources.slice(1).map(row => [String(row[0]), rowToObject(resources[0], row)]));
  const entries = [];
  const limit = memoFileId ? Infinity : 5;
  for (let end = sheet.getLastRow(); end >= 2 && entries.length < limit; end -= 100) {
    const start = Math.max(2, end - 99);
    const values = sheet.getRange(start, 1, end - start + 1, SOCIAL_NAV_PUBLIC_UPDATE_HEADERS.length).getValues();
    for (const [updateId, fileId, message, displayName, publishedAt, , isHidden] of values.reverse()) {
      const resource = byId.get(String(fileId));
      if (memoFileId && (String(fileId) !== memoFileId || !String(updateId).startsWith('memo:'))) continue;
      if (!updateId || !resource || socialNavDeleted_(resource) || String(isHidden).toLowerCase() === 'true') continue;
      entries.push({updateId, fileId, message, displayName, publishedAt, businessName: resource.businessName || resource.fileName});
      if (entries.length === limit) break;
    }
  }
  return {ok: true, entries};
}

function socialNavPublishUpdate_(body, staff) {
  const resource = getResource(body.fileId);
  if (!resource.ok || socialNavDeleted_(resource.item)) return {ok: false, error: '公開できる資料が見つかりません。'};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!message || message.length > 160 || !displayName || displayName.length > 40 || /[\r\n]/.test(displayName)) {
    return {ok: false, error: '公開文は160文字以内、公開表示名は40文字以内で入力してください。'};
  }
  const sheet = socialNavPublicUpdateSheet_(true);
  const last = sheet.getLastRow();
  if (last > 1) {
    const previous = sheet.getRange(last, 1, 1, SOCIAL_NAV_PUBLIC_UPDATE_HEADERS.length).getValues()[0];
    const [id, fileId, text, name, publishedAt, publishedBy, isHidden] = previous;
    if (id && String(fileId) === String(body.fileId) && text === message && name === displayName &&
        publishedBy === staff.name && String(isHidden).toLowerCase() !== 'true' &&
        Date.now() - new Date(publishedAt).getTime() < 60000) return {ok: true};
  }
  sheet.appendRow([
    Utilities.getUuid(), String(body.fileId), socialNavSheetText_(message), socialNavSheetText_(displayName),
    new Date(), socialNavSheetText_(staff.name), false,
  ]);
  return {ok: true};
}

function socialNavHideUpdate_(updateId) {
  const sheet = socialNavPublicUpdateSheet_(false);
  if (!sheet || sheet.getLastRow() < 2 || typeof updateId !== 'string' || !updateId.trim()) {
    return {ok: false, error: '公開更新が見つかりません。'};
  }
  const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1);
  const match = range.createTextFinder(updateId).matchEntireCell(true).matchCase(true).findNext();
  if (!match) return {ok: false, error: '公開更新が見つかりません。'};
  sheet.getRange(match.getRow(), 7).setValue(true);
  return {ok: true};
}
