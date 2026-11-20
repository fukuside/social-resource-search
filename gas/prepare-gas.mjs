import { readFile, writeFile } from 'node:fs/promises';

const [sourcePath, outputPath, testSheetId, testFolderId] = process.argv.slice(2);
if (!sourcePath || !outputPath || !testSheetId || !testFolderId) {
  throw new Error('node prepare-gas.mjs <現行のコード.gs> <検証用のコード.gs> <検証用シートID> <検証用検索フォルダーID>');
}

let source = (await readFile(sourcePath, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
function change(before, after) {
  const index = source.indexOf(before);
  if (index === -1 || index !== source.lastIndexOf(before)) {
    throw new Error('提供された版と一致しません。出力は作成されていません: ' + before.split('\n')[0]);
  }
  source = source.slice(0, index) + after + source.slice(index + before.length);
}

const start = source.indexOf('function doGet(e) {');
const end = source.indexOf('function jsonOutput(data) {', start);
if (start < 0 || end < start || !source.slice(start, end).includes('function doPost(e) {')) {
  throw new Error('現行のウェブハンドラーが見つかりません。');
}
source = source.slice(0, start) + `function doGet(e) {
  return socialNavRead(e);
}

function doPost(e) {
  return socialNavWrite(e);
}

` + source.slice(end);

change("    'searchKeywords'\n  ];", "    'searchKeywords',\n    'deletionReason',\n    'manualOverride'\n  ];");
change("    const hasMismatch = expected.some", `    for (let i = 18; i < expected.length; i++) {
      if (current[i] && current[i] !== expected[i]) {
        throw new Error('追加列を作成できません。既存ヘッダーを確認してください。');
      }
    }
    const hasMismatch = expected.some`);
change('function syncDrivePdfs() {', `function syncDrivePdfs() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return syncDrivePdfsLocked_();
  } finally {
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
  }
}

function syncDrivePdfsLocked_() {`);
change("      searchKeywords: row[17] || ''", `      searchKeywords: row[17] || '',
      deletionReason: row[18] || '',
      manualOverride: String(row[19]).toLowerCase() === 'true'`);
change('    if (file.getMimeType() !== MimeType.PDF) continue;\n\n    const fileId = file.getId();\n    activeIds.add(fileId);', `    if (file.isTrashed() || file.getMimeType() !== MimeType.PDF) continue;

    const fileId = file.getId();
    activeIds.add(fileId);`);
change('      const existing = existingMap.get(fileId);\n      sheet.getRange', `      const existing = existingMap.get(fileId);
      if (['search', 'drive', 'intake'].includes(existing.deletionReason)) continue;
      sheet.getRange`);
for (const key of ['area', 'serviceType', 'businessName', 'keywords', 'tags']) {
  change('        existing.' + key + ' || parsed.' + key + ',', '        existing.manualOverride ? existing.' + key + ' : (existing.' + key + ' || parsed.' + key + '),');
}
change('for (const [fileId, existing] of existingMap.entries()) {\n', `for (const [fileId, existing] of existingMap.entries()) {
  if (['search', 'drive', 'intake'].includes(existing.deletionReason)) continue;
`);

change('      // 削除済みPDFは検索結果から除外', '      if (item.deletionReason === "intake") return false;\n      // 削除済みPDFは検索結果から除外');
change('function searchResources(params) {', 'function searchResources(params, includeStaffMemos = true) {');
change('  const memoLogMap = buildMemoLogMap();', '  const memoLogMap = includeStaffMemos ? buildMemoLogMap() : new Map();');
change('        item.memo,', '        includeStaffMemos ? item.memo : "",');

for (const [key, value] of [['SHEET_ID', testSheetId], ['FOLDER_ID', testFolderId]]) {
  if (!/^[A-Za-z0-9_-]{12,}$/.test(value)) throw new Error(key + ' の検証用IDを確認してください。');
  const original = source.match(new RegExp("const " + key + " = '[A-Za-z0-9_-]+';"))?.[0];
  if (!original || original.includes("'" + value + "'")) {
    throw new Error(key + ' には現行と異なる検証用IDが必要です。');
  }
  change(original, "const " + key + " = '" + value + "';");
}

await writeFile(outputPath, source, { encoding: 'utf8', flag: 'wx' });



