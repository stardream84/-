import { format } from 'date-fns';
import { 
  collection, 
  getDocs, 
  writeBatch, 
  doc, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';

export interface BackupDataPayload {
  version: string;
  backupTime: string;
  clinicName: string;
  exportedBy: string;
  counts: {
    inventory: number;
    transactions: number;
    inventoryChecks: number;
    users?: number;
  };
  data: {
    inventory: any[];
    transactions: any[];
    inventoryChecks: any[];
    users?: any[];
  };
}

export const CATEGORY_LABELS: Record<string, string> = {
  nursing: '護理衛材',
  aesthetic: '醫美大庫',
  skincare: '五六診庫存',
  'iv-drip': '點滴針劑',
  controlled: '管制藥物'
};

/**
 * 產生完整系統 JSON 備份內容字串
 */
export function generateFullBackupJson(data: {
  inventory: any[];
  transactions: any[];
  inventoryChecks: any[];
  users?: any[];
  operatorName?: string;
}): string {
  const payload: BackupDataPayload = {
    version: '1.0',
    backupTime: new Date().toISOString(),
    clinicName: '星幸福美學診所',
    exportedBy: data.operatorName || '系統管理者',
    counts: {
      inventory: data.inventory.length,
      transactions: data.transactions.length,
      inventoryChecks: data.inventoryChecks.length,
      users: data.users ? data.users.length : 0
    },
    data: {
      inventory: data.inventory.map(item => ({
        id: item.id,
        name: item.name || '',
        type: item.type || '',
        spec: item.spec || '',
        currentStock: item.currentStock ?? 0,
        safetyStock: item.safetyStock ?? 0,
        status: item.status || 'active',
        category: item.category || 'nursing',
        expiryDate: item.expiryDate || null,
        sortOrder: item.sortOrder ?? null,
        skincareGroup: item.skincareGroup ?? null,
        remark: item.remark || ''
      })),
      transactions: data.transactions.map(t => {
        let tsString = '';
        if (t.timestamp) {
          if (typeof t.timestamp.toDate === 'function') {
            tsString = t.timestamp.toDate().toISOString();
          } else if (t.timestamp instanceof Date) {
            tsString = t.timestamp.toISOString();
          } else if (typeof t.timestamp === 'string') {
            tsString = t.timestamp;
          }
        }
        return {
          id: t.id,
          type: t.type,
          itemId: t.itemId,
          itemName: t.itemName,
          quantity: t.quantity,
          spec: t.spec,
          date: t.date,
          category: t.category || 'nursing',
          expiryDate: t.expiryDate || null,
          operatorId: t.operatorId || '',
          operatorName: t.operatorName || '',
          customerInfo: t.customerInfo || null,
          doctor: t.doctor || null,
          remark: t.remark || null,
          checkId: t.checkId || null,
          timestamp: tsString || new Date().toISOString()
        };
      }),
      inventoryChecks: data.inventoryChecks.map(c => {
        let tsString = '';
        if (c.timestamp) {
          if (typeof c.timestamp.toDate === 'function') {
            tsString = c.timestamp.toDate().toISOString();
          } else if (c.timestamp instanceof Date) {
            tsString = c.timestamp.toISOString();
          } else if (typeof c.timestamp === 'string') {
            tsString = c.timestamp;
          }
        }
        return {
          id: c.id,
          checkTime: c.checkTime,
          adjustmentCount: c.adjustmentCount ?? 0,
          operatorId: c.operatorId || '',
          operatorName: c.operatorName || '',
          note: c.note || '',
          category: c.category || 'nursing',
          timestamp: tsString || new Date().toISOString()
        };
      }),
      users: data.users ? data.users.map(u => ({
        uid: u.uid,
        username: u.username,
        password: u.password || '',
        name: u.name,
        email: u.email || '',
        role: u.role,
        lastLogin: u.lastLogin || '',
        approved: u.approved !== false
      })) : []
    }
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * 觸發瀏覽器下載 Blob 檔案
 */
export function downloadFile(content: string, filename: string, mimeType: string = 'application/json;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 跳脫 CSV 單一欄位內容
 */
function escapeCsv(field: any): string {
  if (field === null || field === undefined) return '""';
  const str = String(field).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * 匯出庫存品項總表 CSV (含 UTF-8 BOM，防止 Excel 亂碼)
 */
export function exportInventoryToCsv(
  items: any[], 
  groupedInventory: any[], 
  categoryFilter?: string
): string {
  const filtered = items.filter(i => {
    if (!categoryFilter || categoryFilter === 'all') return true;
    return (i.category || 'nursing') === categoryFilter;
  });

  const headers = [
    '項次',
    '庫存位置',
    '品項名稱',
    '類型',
    '規格',
    '現有庫存量',
    '安全庫存量',
    '庫存警示狀態',
    '各批次效期及數量',
    '備註'
  ];

  const rows = filtered.map((item, idx) => {
    const grouped = groupedInventory.find(g => g.id === item.id);
    const totalStock = grouped ? grouped.totalStock : item.currentStock;
    const batches = grouped?.batches || [];
    const batchSummary = batches
      .map((b: any) => `效期:${b.expiryDate} (數量:${b.quantity}, 入庫:${b.latestInDate})`)
      .join('; ');

    let status = '正常';
    if (totalStock === 0) status = '缺貨中';
    else if (totalStock <= item.safetyStock) status = '低於安全庫存';

    return [
      idx + 1,
      CATEGORY_LABELS[item.category] || item.category || '護理衛材',
      item.name,
      item.type,
      item.spec,
      totalStock,
      item.safetyStock,
      status,
      batchSummary || '無批次紀錄',
      item.remark || ''
    ].map(escapeCsv).join(',');
  });

  // \uFEFF 是 UTF-8 的 BOM，能讓 Excel 正確識別繁體中文編碼
  return '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
}

/**
 * 匯出出入庫歷史明細 CSV
 */
export function exportTransactionsToCsv(transactions: any[], categoryFilter?: string): string {
  const filtered = transactions.filter(t => {
    if (!categoryFilter || categoryFilter === 'all') return true;
    return (t.category || 'nursing') === categoryFilter;
  });

  const headers = [
    '項次',
    '操作日期',
    '系統精確時間',
    '異動類型',
    '庫存位置',
    '品項名稱',
    '數量',
    '規格',
    '到期日/出庫效期',
    '負責醫師',
    '客編/顧客姓名',
    '經手人員',
    '備註'
  ];

  const rows = filtered.map((t, idx) => {
    let formattedTs = '-';
    if (t.timestamp) {
      try {
        if (typeof t.timestamp.toDate === 'function') {
          formattedTs = format(t.timestamp.toDate(), 'yyyy/MM/dd HH:mm:ss');
        } else if (t.timestamp instanceof Date) {
          formattedTs = format(t.timestamp, 'yyyy/MM/dd HH:mm:ss');
        } else if (typeof t.timestamp === 'string') {
          formattedTs = t.timestamp;
        }
      } catch (e) {
        formattedTs = String(t.timestamp);
      }
    }

    return [
      idx + 1,
      t.date || '-',
      formattedTs,
      t.type === 'in' ? '入庫' : '出庫',
      CATEGORY_LABELS[t.category] || t.category || '護理衛材',
      t.itemName,
      t.quantity,
      t.spec,
      t.expiryDate || '-',
      t.doctor || '-',
      t.customerInfo || '-',
      t.operatorName || '-',
      t.remark || '-'
    ].map(escapeCsv).join(',');
  });

  return '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
}

/**
 * 匯出盤點歷史紀錄 CSV
 */
export function exportChecksToCsv(checks: any[], transactions: any[] = []): string {
  const headers = [
    '項次',
    '盤點時間',
    '盤點類別',
    '盤點人員',
    '盤點調整品項數',
    '調整明細摘要',
    '盤點備註'
  ];

  const rows = checks.map((c, idx) => {
    const checkTxns = transactions.filter(t => t.checkId === c.id);
    const detailSummary = checkTxns.length > 0
      ? checkTxns.map(t => `${t.itemName} (${t.type === 'in' ? '+' : '-'}${t.quantity})`).join('; ')
      : '盤點完全相符，無庫存差異調整';

    return [
      idx + 1,
      c.checkTime,
      CATEGORY_LABELS[c.category] || c.category || '護理衛材',
      c.operatorName,
      c.adjustmentCount ?? checkTxns.length,
      detailSummary,
      c.note || '-'
    ].map(escapeCsv).join(',');
  });

  return '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
}

/**
 * 解析與驗證備份檔案
 */
export function validateAndParseBackup(jsonString: string): {
  valid: boolean;
  data?: BackupDataPayload;
  error?: string;
} {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: '檔案內容格式無效（非 JSON 物件）' };
    }

    if (!parsed.data || typeof parsed.data !== 'object') {
      return { valid: false, error: '備份檔缺少 data 核心資料區塊' };
    }

    const { inventory, transactions, inventoryChecks } = parsed.data;
    if (!Array.isArray(inventory) || !Array.isArray(transactions) || !Array.isArray(inventoryChecks)) {
      return { valid: false, error: '備份檔格式不正確，缺少品項、明細或盤點陣列' };
    }

    return { valid: true, data: parsed as BackupDataPayload };
  } catch (err: any) {
    return { valid: false, error: `JSON 解析失敗: ${err.message || '格式損毀'}` };
  }
}

/**
 * 執行資料庫還原操作
 */
export async function executeRestore(
  db: any,
  backupPayload: BackupDataPayload,
  mode: 'replace' | 'merge',
  onProgress?: (step: string) => void
) {
  const { inventory, transactions, inventoryChecks, users } = backupPayload.data;

  // 1. 若為覆蓋模式 (replace)，先清理現有資料集合
  if (mode === 'replace') {
    onProgress?.('正在清理原有舊資料集合...');
    const collectionsToClear = ['inventory', 'transactions', 'inventoryChecks'];
    
    for (const colName of collectionsToClear) {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        // Firestore batch max 500
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 400);
          chunk.forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
    }
  }

  // 2. 還原 inventory (庫存品項)
  onProgress?.(`正在還原 ${inventory.length} 筆庫存品項...`);
  for (let i = 0; i < inventory.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = inventory.slice(i, i + 400);
    chunk.forEach(item => {
      const itemRef = doc(db, 'inventory', item.id);
      batch.set(itemRef, {
        name: item.name || '',
        type: item.type || '',
        spec: item.spec || '',
        currentStock: Number(item.currentStock) || 0,
        safetyStock: Number(item.safetyStock) || 0,
        status: item.status || 'active',
        category: item.category || 'nursing',
        expiryDate: item.expiryDate || null,
        sortOrder: item.sortOrder ?? null,
        skincareGroup: item.skincareGroup ?? null,
        remark: item.remark || ''
      }, { merge: mode === 'merge' });
    });
    await batch.commit();
  }

  // 3. 還原 transactions (出入庫明細)
  onProgress?.(`正在還原 ${transactions.length} 筆出入庫明細...`);
  for (let i = 0; i < transactions.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = transactions.slice(i, i + 400);
    chunk.forEach(t => {
      const tRef = doc(db, 'transactions', t.id);
      let ts: any = serverTimestamp();
      if (t.timestamp) {
        try {
          const parsedDate = new Date(t.timestamp);
          if (!isNaN(parsedDate.getTime())) {
            ts = Timestamp.fromDate(parsedDate);
          }
        } catch (e) {
          ts = serverTimestamp();
        }
      }

      batch.set(tRef, {
        type: t.type,
        itemId: t.itemId,
        itemName: t.itemName,
        quantity: Number(t.quantity) || 1,
        spec: t.spec || '',
        date: t.date || format(new Date(), 'yyyy-MM-dd'),
        category: t.category || 'nursing',
        expiryDate: t.expiryDate || null,
        operatorId: t.operatorId || '',
        operatorName: t.operatorName || '',
        customerInfo: t.customerInfo || null,
        doctor: t.doctor || null,
        remark: t.remark || null,
        checkId: t.checkId || null,
        timestamp: ts
      }, { merge: mode === 'merge' });
    });
    await batch.commit();
  }

  // 4. 還原 inventoryChecks (盤點紀錄)
  onProgress?.(`正在還原 ${inventoryChecks.length} 筆盤點歷史紀錄...`);
  for (let i = 0; i < inventoryChecks.length; i += 400) {
    const batch = writeBatch(db);
    const chunk = inventoryChecks.slice(i, i + 400);
    chunk.forEach(c => {
      const cRef = doc(db, 'inventoryChecks', c.id);
      let ts: any = serverTimestamp();
      if (c.timestamp) {
        try {
          const parsedDate = new Date(c.timestamp);
          if (!isNaN(parsedDate.getTime())) {
            ts = Timestamp.fromDate(parsedDate);
          }
        } catch (e) {
          ts = serverTimestamp();
        }
      }

      batch.set(cRef, {
        checkTime: c.checkTime,
        adjustmentCount: Number(c.adjustmentCount) || 0,
        operatorId: c.operatorId || '',
        operatorName: c.operatorName || '',
        note: c.note || '',
        category: c.category || 'nursing',
        timestamp: ts
      }, { merge: mode === 'merge' });
    });
    await batch.commit();
  }

  // 5. 若包含 users 且為管理員可選擇性合併
  if (users && users.length > 0) {
    onProgress?.(`正在核對 ${users.length} 筆使用者帳號...`);
    for (let i = 0; i < users.length; i += 400) {
      const batch = writeBatch(db);
      const chunk = users.slice(i, i + 400);
      chunk.forEach(u => {
        const uRef = doc(db, 'users', u.uid);
        batch.set(uRef, {
          username: u.username,
          password: u.password || '111111',
          name: u.name,
          email: u.email || `${u.username}@clinic.local`,
          role: u.role || 'nurse',
          lastLogin: u.lastLogin || '',
          approved: u.approved !== false
        }, { merge: true });
      });
      await batch.commit();
    }
  }

  onProgress?.('還原完成！');
}
