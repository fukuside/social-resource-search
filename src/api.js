const GAS_URL = 'https://script.google.com/macros/s/AKfycbw4n2PeyuQNU9UtdvwLx6E1DnC4VcgiSzKZ1PIKhS4tnblZkU5ZGn9M6hXTa050D2g41Q/exec';
export async function searchResources({
  q = '',
  area = 'すべて',
  serviceType = 'すべて',
  onlyUnclassified = false,
}) {
  const url = new URL(GAS_URL);
  url.searchParams.set('action', 'search');
  url.searchParams.set('q', q);
  url.searchParams.set('area', area);
  url.searchParams.set('serviceType', serviceType);
  url.searchParams.set('onlyUnclassified', String(onlyUnclassified));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error('検索に失敗しました');
  }
  return res.json();
}

export async function getResourceDetail(fileId) {
  const url = new URL(GAS_URL);
  url.searchParams.set('action', 'detail');
  url.searchParams.set('fileId', fileId);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error('詳細取得に失敗しました');
  }
  return res.json();
}

export async function updateResource(payload) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'updateResource',
      ...payload,
    }),
  });

  if (!res.ok) {
    throw new Error('情報更新に失敗しました');
  }

  return res.json();
}

export async function saveMemo(fileId, memo, createdBy = 'manual') {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'saveMemo',
      fileId,
      memo,
      createdBy,
    }),
  });

  if (!res.ok) {
    throw new Error('メモ保存に失敗しました');
  }

  return res.json();
}