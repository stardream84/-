import React, { useState, useRef } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  FileSpreadsheet, 
  FileJson, 
  Copy, 
  Check, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  ShieldCheck, 
  HardDrive, 
  Clock, 
  Package, 
  History, 
  ClipboardList, 
  Users,
  Info
} from 'lucide-react';
import { format } from 'date-fns';
import { 
  generateFullBackupJson, 
  downloadFile, 
  exportInventoryToCsv, 
  exportTransactionsToCsv, 
  exportChecksToCsv, 
  validateAndParseBackup, 
  executeRestore,
  CATEGORY_LABELS,
  BackupDataPayload
} from '../utils/backupUtils';

interface BackupManagerProps {
  inventory: any[];
  groupedInventory: any[];
  transactions: any[];
  inventoryChecks: any[];
  users: any[];
  profile: any;
  db: any;
  onRefreshData?: () => void;
  onClose?: () => void;
}

export const BackupManager: React.FC<BackupManagerProps> = ({
  inventory,
  groupedInventory,
  transactions,
  inventoryChecks,
  users,
  profile,
  db,
  onClose
}) => {
  if (profile?.role !== 'admin') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">資料備份與還原</h2>
          {onClose && (
            <button 
              onClick={onClose} 
              className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              返回首頁
            </button>
          )}
        </div>
        <div className="p-8 bg-amber-50 border border-amber-200 rounded-2xl text-center">
          <p className="text-amber-800 font-medium">權限不足：資料備份與還原功能僅限管理員使用。</p>
        </div>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState<'export' | 'csv' | 'restore'>('export');
  const [copied, setCopied] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [parsedBackup, setParsedBackup] = useState<BackupDataPayload | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<string>('');
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const nowStr = format(new Date(), 'yyyyMMdd_HHmm');

  // 1. 執行完整 JSON 備份下載
  const handleDownloadFullJson = () => {
    const jsonStr = generateFullBackupJson({
      inventory,
      transactions,
      inventoryChecks,
      users: profile?.role === 'admin' ? users : undefined,
      operatorName: profile?.name || '使用者'
    });

    const filename = `星幸福庫存系統_完整備份_${nowStr}.json`;
    downloadFile(jsonStr, filename, 'application/json;charset=utf-8');
  };

  // 2. 複製 JSON 到剪貼簿
  const handleCopyJson = async () => {
    try {
      const jsonStr = generateFullBackupJson({
        inventory,
        transactions,
        inventoryChecks,
        users: profile?.role === 'admin' ? users : undefined,
        operatorName: profile?.name || '使用者'
      });
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      alert('複製失敗，請直接點擊下載備份檔案');
    }
  };

  // 3. 匯出各類 CSV 表格
  const handleExportInventoryCsv = (category: string = 'all') => {
    const csvStr = exportInventoryToCsv(inventory, groupedInventory, category);
    const categoryName = category === 'all' ? '全院庫存總表' : (CATEGORY_LABELS[category] || category);
    const filename = `星幸福_${categoryName}_${nowStr}.csv`;
    downloadFile(csvStr, filename, 'text/csv;charset=utf-8');
  };

  const handleExportTransactionsCsv = (category: string = 'all') => {
    const csvStr = exportTransactionsToCsv(transactions, category);
    const categoryName = category === 'all' ? '完整出入庫歷史紀錄' : `${CATEGORY_LABELS[category] || category}_出入庫明細`;
    const filename = `星幸福_${categoryName}_${nowStr}.csv`;
    downloadFile(csvStr, filename, 'text/csv;charset=utf-8');
  };

  const handleExportChecksCsv = () => {
    const csvStr = exportChecksToCsv(inventoryChecks, transactions);
    const filename = `星幸福_盤點歷史明細紀錄_${nowStr}.csv`;
    downloadFile(csvStr, filename, 'text/csv;charset=utf-8');
  };

  // 4. 處理上傳檔案解析
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setRestoreSuccess(false);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setUploadError('請選取副檔名為 .json 的備份檔案');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const result = validateAndParseBackup(content);
      if (!result.valid || !result.data) {
        setUploadError(result.error || '檔案格式無效');
        setParsedBackup(null);
      } else {
        setParsedBackup(result.data);
      }
    };
    reader.onerror = () => {
      setUploadError('讀取檔案發生錯誤，請重試');
    };
    reader.readAsText(file);
  };

  // 5. 執行資料還原
  const handleStartRestore = async () => {
    if (!parsedBackup) return;
    setConfirmModalOpen(false);
    setIsRestoring(true);
    setRestoreProgress('準備開始還原作業...');
    setRestoreSuccess(false);

    try {
      await executeRestore(db, parsedBackup, restoreMode, (step) => {
        setRestoreProgress(step);
      });
      setIsRestoring(false);
      setRestoreSuccess(true);
      setParsedBackup(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setIsRestoring(false);
      alert(`還原過程中發生錯誤: ${err.message || err}`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-brand-accent/40">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-primary text-white rounded-2xl shadow-md">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-2">
              資料備份與還原中心
              <span className="text-xs font-sans font-normal px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                即時雲端安全
              </span>
            </h2>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              定期匯出系統資料備份，保障診所庫存帳目、出入庫明細與盤點紀錄萬無一失。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleDownloadFullJson}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-brand-primary hover:bg-brand-primary/95 text-white font-medium text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
            title="立即產生並下載最新的完整系統備份檔案"
          >
            <Download className="w-4 h-4" />
            <span>一鍵完整備份 (JSON)</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition-all"
            >
              返回
            </button>
          )}
        </div>
      </div>

      {/* Realtime Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="p-4 bg-white/80 backdrop-blur rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">庫存品項數</p>
            <p className="text-xl font-bold text-slate-800 font-mono">{inventory.length} <span className="text-xs font-normal text-slate-400">項</span></p>
          </div>
        </div>

        <div className="p-4 bg-white/80 backdrop-blur rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <History className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">出入庫明細</p>
            <p className="text-xl font-bold text-slate-800 font-mono">{transactions.length} <span className="text-xs font-normal text-slate-400">筆</span></p>
          </div>
        </div>

        <div className="p-4 bg-white/80 backdrop-blur rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">盤點歷史紀錄</p>
            <p className="text-xl font-bold text-slate-800 font-mono">{inventoryChecks.length} <span className="text-xs font-normal text-slate-400">次</span></p>
          </div>
        </div>

        <div className="p-4 bg-white/80 backdrop-blur rounded-2xl border border-slate-200/80 shadow-2xs flex items-center gap-3">
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">系統使用者</p>
            <p className="text-xl font-bold text-slate-800 font-mono">{users.length} <span className="text-xs font-normal text-slate-400">位</span></p>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('export')}
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'export'
              ? 'bg-brand-primary text-white shadow-sm'
              : 'bg-white/60 hover:bg-slate-100 text-slate-600'
          }`}
        >
          <FileJson className="w-4 h-4" />
          完整 JSON 備份
        </button>

        <button
          onClick={() => setActiveTab('csv')}
          className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
            activeTab === 'csv'
              ? 'bg-brand-primary text-white shadow-sm'
              : 'bg-white/60 hover:bg-slate-100 text-slate-600'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Excel / CSV 報表匯出
        </button>

        {profile?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('restore')}
            className={`px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all ${
              activeTab === 'restore'
                ? 'bg-brand-primary text-white shadow-sm'
                : 'bg-white/60 hover:bg-slate-100 text-slate-600'
            }`}
          >
            <Upload className="w-4 h-4" />
            備份檔匯入與還原
          </button>
        )}
      </div>

      {/* Tab 1: JSON Full Backup */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          <div className="bg-white/90 rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-serif font-bold text-slate-900 flex items-center gap-2">
                  <HardDrive className="w-5 h-5 text-brand-primary" />
                  完整資料庫快照備份 (JSON 格式)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  包含全院品項規格、目前庫存量、安全庫存、所有批次到期日、歷史出入庫交易與盤點紀錄，可作為離線封存或災難還原之用。
                </p>
              </div>

              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <button
                  onClick={handleCopyJson}
                  className="flex-1 md:flex-none px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                  <span>{copied ? '已複製內容！' : '複製 JSON 文字'}</span>
                </button>
                <button
                  onClick={handleDownloadFullJson}
                  className="flex-1 md:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>下載備份檔案 (.json)</span>
                </button>
              </div>
            </div>

            {/* Backup Contents Summary Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-brand-primary" />
                  備份檔案安全保障
                </p>
                <ul className="text-xs text-slate-600 space-y-1 pl-4 list-disc">
                  <li>自動記錄產出時間標記與操作經手人。</li>
                  <li>保留完整的唯一識別碼 (ID) 與關聯關聯鏈。</li>
                  <li>相容於本系統的「備份檔還原」模組。</li>
                  <li>純文字標準 JSON 格式，可使用任何編輯器檢視。</li>
                </ul>
              </div>

              <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200/80 space-y-2">
                <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-600" />
                  建議備份頻率
                </p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  建議每週五下班前或每月盤點結束後下載一份備份檔案，並存放於診所指定的安全電腦或專用隨身碟，以確保資料永久安心保存。
                </p>
              </div>
            </div>

            {/* Quick Preview Box */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">備份檔案資訊預覽</label>
              <div className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl overflow-x-auto max-h-48 shadow-inner border border-slate-800">
                <pre>
{`{
  "version": "1.0",
  "clinicName": "星幸福美學診所",
  "backupTime": "${new Date().toISOString()}",
  "exportedBy": "${profile?.name || '系統使用者'}",
  "counts": {
    "inventory": ${inventory.length},
    "transactions": ${transactions.length},
    "inventoryChecks": ${inventoryChecks.length},
    "users": ${users.length}
  }
}`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: CSV / Excel Export */}
      {activeTab === 'csv' && (
        <div className="space-y-6">
          <div className="bg-white/90 rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-serif font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                表格資料匯出 (Excel / Numbers / Google Sheets 支援)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                所有匯出之 CSV 檔案皆已內嵌繁體中文 UTF-8 BOM 編碼，使用微軟 Excel 開啟不會產生亂碼，方便製作報表與統計。
              </p>
            </div>

            {/* Group 1: Inventory Tables */}
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                庫存清冊總表匯出
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900">全院庫存品項總表</span>
                      <span className="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">{inventory.length} 項</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">包含所有庫存分類之完整品項、批次與規格明細。</p>
                  </div>
                  <button
                    onClick={() => handleExportInventoryCsv('all')}
                    className="w-full py-2 bg-white hover:bg-brand-primary hover:text-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> 匯出全院總表 (CSV)
                  </button>
                </div>

                <div className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900">護理師衛材庫存</span>
                      <span className="text-xs font-mono bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                        {inventory.filter(i => (i.category || 'nursing') === 'nursing').length} 項
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">空針、針頭、紗布、棉棒、手套等護理耗材。</p>
                  </div>
                  <button
                    onClick={() => handleExportInventoryCsv('nursing')}
                    className="w-full py-2 bg-white hover:bg-brand-primary hover:text-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> 匯出衛材庫存表 (CSV)
                  </button>
                </div>

                <div className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900">醫美大庫庫存</span>
                      <span className="text-xs font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        {inventory.filter(i => i.category === 'aesthetic').length} 項
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">填充物、肉毒、儀器探頭等醫美品項。</p>
                  </div>
                  <button
                    onClick={() => handleExportInventoryCsv('aesthetic')}
                    className="w-full py-2 bg-white hover:bg-emerald-600 hover:text-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> 匯出醫美大庫 (CSV)
                  </button>
                </div>

                <div className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900">五六診庫存</span>
                      <span className="text-xs font-mono bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full">
                        {inventory.filter(i => i.category === 'skincare').length} 項
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">產一、產二、產三、小庫及針劑區等品項。</p>
                  </div>
                  <button
                    onClick={() => handleExportInventoryCsv('skincare')}
                    className="w-full py-2 bg-white hover:bg-rose-600 hover:text-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> 匯出五六診庫存 (CSV)
                  </button>
                </div>

                <div className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900">點滴針劑庫存</span>
                      <span className="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        {inventory.filter(i => i.category === 'iv-drip').length} 項
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">生理食鹽水、葡萄糖液、各式針劑耗材。</p>
                  </div>
                  <button
                    onClick={() => handleExportInventoryCsv('iv-drip')}
                    className="w-full py-2 bg-white hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> 匯出點滴庫存 (CSV)
                  </button>
                </div>

                <div className="p-4 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-slate-900">管制藥物庫存</span>
                      <span className="text-xs font-mono bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                        {inventory.filter(i => i.category === 'controlled').length} 項
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">各級管制藥物庫存與追蹤報表。</p>
                  </div>
                  <button
                    onClick={() => handleExportInventoryCsv('controlled')}
                    className="w-full py-2 bg-white hover:bg-purple-600 hover:text-white text-slate-700 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> 匯出管制藥物 (CSV)
                  </button>
                </div>
              </div>
            </div>

            {/* Group 2: Transactions & Checks */}
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-600" />
                明細紀錄與盤點報表匯出
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900">全院完整出入庫歷史紀錄</span>
                      <span className="text-xs font-mono bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">{transactions.length} 筆紀錄</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">
                      包含日期、時間戳記、異動類型、品項名稱、數量、批次效期、自填醫師、客編及操作人員。
                    </p>
                  </div>
                  <button
                    onClick={() => handleExportTransactionsCsv('all')}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> 匯出完整出入庫明細 (CSV)
                  </button>
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900">盤點歷史明細與備註報表</span>
                      <span className="text-xs font-mono bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full">{inventoryChecks.length} 次盤點</span>
                    </div>
                    <p className="text-xs text-slate-500 mb-4">
                      包含歷次盤點時間、類別、盤點人員、盈虧調整品項摘要與詳細備註說明。
                    </p>
                  </div>
                  <button
                    onClick={handleExportChecksCsv}
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> 匯出盤點歷史紀錄 (CSV)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Backup Restore (Admin Only) */}
      {activeTab === 'restore' && profile?.role === 'admin' && (
        <div className="space-y-6">
          <div className="bg-white/90 rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-lg font-serif font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-brand-primary" />
                備份檔案匯入與系統還原
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                選取先前由系統產出的 <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">.json</code> 備份檔案，系統將自動解析校對內容並執行資料還原。
              </p>
            </div>

            {/* Upload Area */}
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-brand-primary/60 bg-slate-50/50 hover:bg-slate-50 rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3"
            >
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-primary">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">點擊選取或拖曳備份檔 (.json) 至此處</p>
                <p className="text-xs text-slate-400 mt-1">支援星幸福庫存管理系統所有版本的標準備份檔</p>
              </div>
            </div>

            {/* Error Display */}
            {uploadError && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-xs">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-500" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Success Display */}
            {restoreSuccess && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs font-medium">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                <span>資料庫還原作業已全數順利完成！現有資料已更新為備份檔內容。</span>
              </div>
            )}

            {/* Parsed Preview and Restore Options */}
            {parsedBackup && (
              <div className="space-y-4 p-5 bg-slate-50 rounded-2xl border border-slate-200 animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    備份檔案解析成功
                  </h4>
                  <span className="text-xs font-mono text-slate-500">備份時間: {parsedBackup.backupTime ? format(new Date(parsedBackup.backupTime), 'yyyy/MM/dd HH:mm') : '未註記'}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <p className="text-[11px] text-slate-400">品項數量</p>
                    <p className="text-lg font-bold text-slate-800 font-mono">{parsedBackup.data.inventory?.length || 0}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <p className="text-[11px] text-slate-400">出入庫明細</p>
                    <p className="text-lg font-bold text-slate-800 font-mono">{parsedBackup.data.transactions?.length || 0}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <p className="text-[11px] text-slate-400">盤點紀錄</p>
                    <p className="text-lg font-bold text-slate-800 font-mono">{parsedBackup.data.inventoryChecks?.length || 0}</p>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-slate-200">
                    <p className="text-[11px] text-slate-400">人員帳號</p>
                    <p className="text-lg font-bold text-slate-800 font-mono">{parsedBackup.data.users?.length || 0}</p>
                  </div>
                </div>

                {/* Mode Select */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-bold text-slate-700 block">請選擇還原模式：</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      restoreMode === 'merge' ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-400/20' : 'bg-white border-slate-200'
                    }`}>
                      <input
                        type="radio"
                        name="restoreMode"
                        value="merge"
                        checked={restoreMode === 'merge'}
                        onChange={() => setRestoreMode('merge')}
                        className="mt-0.5 text-brand-primary focus:ring-brand-primary"
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-800">安全合併模式 (推薦)</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">保留目前現有的品項與紀錄，將備份檔案內容更新及補足進資料庫。</p>
                      </div>
                    </label>

                    <label className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      restoreMode === 'replace' ? 'bg-rose-50/70 border-rose-400 ring-2 ring-rose-400/20' : 'bg-white border-slate-200'
                    }`}>
                      <input
                        type="radio"
                        name="restoreMode"
                        value="replace"
                        checked={restoreMode === 'replace'}
                        onChange={() => setRestoreMode('replace')}
                        className="mt-0.5 text-rose-600 focus:ring-rose-500"
                      />
                      <div>
                        <p className="text-xs font-bold text-rose-800">完全覆蓋模式 (謹慎使用)</p>
                        <p className="text-[11px] text-rose-600 mt-0.5">清空現有舊資料，將資料庫完全精確還原為此備份檔的狀態。</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setParsedBackup(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 text-xs font-medium rounded-xl transition-all"
                  >
                    取消選取
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmModalOpen(true)}
                    className="px-6 py-2.5 bg-brand-primary hover:bg-brand-primary/95 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
                  >
                    確認開始還原
                  </button>
                </div>
              </div>
            )}

            {/* Restoring Progress */}
            {isRestoring && (
              <div className="p-6 bg-slate-900 text-white rounded-2xl shadow-xl flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-sm font-bold">正在執行資料庫還原作業，請勿關閉視窗...</p>
                <p className="text-xs text-slate-400 font-mono">{restoreProgress}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-slate-900">確認執行資料庫還原</h3>
            </div>
            
            <div className="text-xs text-slate-600 space-y-2 leading-relaxed bg-amber-50 p-4 rounded-xl border border-amber-200">
              <p>
                您即將以 <strong className="text-slate-900">{restoreMode === 'replace' ? '【完全覆蓋模式】' : '【安全合併模式】'}</strong> 還原此備份檔案。
              </p>
              {restoreMode === 'replace' && (
                <p className="text-rose-600 font-bold">
                  ※ 警告：覆蓋模式將會清空目前的品項與明細紀錄，並將資料庫重設為備份檔內容，此動作無法復原！
                </p>
              )}
              <p>請確認您已備份目前的最新狀態，或確定要以此檔案進行覆蓋還原。</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleStartRestore}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"
              >
                確認執行還原
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
