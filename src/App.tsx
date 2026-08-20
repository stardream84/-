/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  PlusCircle, 
  MinusCircle, 
  Package, 
  Settings, 
  History, 
  LogOut, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  X,
  User,
  UserPlus,
  Search,
  ChevronRight,
  Calendar,
  Key,
  Clock,
  LayoutDashboard,
  Monitor,
  AlertCircle,
  Star,
  Share2,
  PackageOpen,
  ClipboardList,
  RefreshCw,
  Database,
  Download,
  Upload,
  FileSpreadsheet
} from 'lucide-react';
import { BackupManager } from './components/BackupManager';
import { 
  exportInventoryToCsv, 
  exportTransactionsToCsv, 
  exportChecksToCsv, 
  downloadFile,
  CATEGORY_LABELS 
} from './utils/backupUtils';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  serverTimestamp, 
  where, 
  orderBy, 
  limit,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  deleteField
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { format, addMonths, isBefore, isAfter, parseISO } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { db, auth, handleFirestoreError, OperationType } from './firebase';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getCategoryFromView = (v: string): InventoryCategory => {
  if (v.includes('aesthetic')) return 'aesthetic';
  if (v.includes('skincare')) return 'skincare';
  if (v.includes('iv-drip')) return 'iv-drip';
  if (v.includes('controlled')) return 'controlled';
  return 'nursing';
};

// --- Types ---
type UserRole = 'admin' | 'nurse' | 'cs' | 'sales_lead';
type InventoryCategory = 'nursing' | 'aesthetic' | 'skincare' | 'iv-drip' | 'controlled';

interface UserProfile {
  uid: string;
  username: string;
  password?: string;
  name: string;
  email: string;
  role: UserRole;
  lastLogin: string;
  approved?: boolean;
}

interface InventoryItem {
  id: string;
  name: string;
  type: string;
  spec: string;
  currentStock: number;
  safetyStock: number;
  status: 'active' | 'inactive';
  category: InventoryCategory;
  expiryDate?: string;
  sortOrder?: number;
  skincareGroup?: number;
  remark?: string;
}

interface Transaction {
  id: string;
  type: 'in' | 'out';
  itemId: string;
  itemName: string;
  quantity: number;
  spec: string;
  date: string;
  category: InventoryCategory;
  expiryDate?: string;
  operatorId: string;
  operatorName: string;
  customerInfo?: string;
  doctor?: string;
  timestamp: any;
  remark?: string;
  checkId?: string; // Link to an inventory check
}

interface InventoryCheck {
  id: string;
  checkTime: string;
  adjustmentCount: number;
  operatorId: string;
  operatorName: string;
  note?: string;
  timestamp: any;
  category: InventoryCategory;
}

import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

// --- Constants ---
const DEFAULT_SORT_ORDER = [
  // Photo 47
  '1c.c. 螺旋有針', '3c.c. 螺旋有針', '5c.c. 螺旋有針', '10c.c. 螺旋有針', '20c.c. 螺旋有針', 
  '50c.c. 螺旋有針', '1c.c. 一般有針', '3c.c. 一般有針', '5c.c. 一般有針', '10c.c. 一般有針', 
  '20c.c. 一般有針', 'BD 針 0.3ML', 'BD 針 0.5ML', '蝴蝶針 22G', '蝴蝶針 24G', '18G 針頭', 
  '22G 針頭', '23G 針頭', '25G 針頭', '27G 1/2 針頭', '27G 3/4 針頭', '30G 針頭', 'IC 針 20 號', 
  'IC 針 22 號', 'IC 針 24 號', '普通 SET',
  // Photo 44
  '看護墊', '3-WAY 轉接頭', '延長管', 'T-接', '精密 bag', '克菌寧', 'EDS(5L/桶)', '電燒筆', '塑膠套', 
  '止血紗布 5*7.5cm', 'EU-TEK 1-0', 'EU-TEK 2-0', 'EU-TEK 3-0(VC243)', 'EU-TEK 3-0(VC193L)', 
  'EU-TEK 4-0', 'EU-TEK 5-0', 'VICRYL RAPIDE 5-0', 'Monosyn 5-0', '11 號刀片', '15 號刀片', 
  'OP-site (100 片/盒)', 'N/S 20ml', 'D/W 20ml',
  // Photo 45
  '6 吋彈繃', '未滅菌沖洗棉棒', '未滅菌六吋棉棒', '未滅菌 ENT 棉棒', '滅菌沖洗棉棒(5 入裝)', 
  '滅菌口腔棉棒(5 入裝)', '滅菌 6 吋棉棒(10 入裝)', '已滅菌 ENT 棉棒', '已滅菌 3x3 紗布(50 小包/袋)', 
  '未滅菌 3x3 紗布', '未滅菌 2x2 紗布', '中棉球', '75% 酒精', '拋棄式鴨嘴', '無菌單手手套', 
  '清潔手套 S 號', '清潔手套 M 號', '清潔手套 L 號', '無菌手套 6 號', '無菌手套 6.5 號', 
  '無菌手套 7 號', '無菌手套 7.5 號', '減敏 PVC 手套(6)', '髮帽', '腳套', '手術衣',
  // Photo 46
  '14Fr. 尿管', '尿袋', 'MARKING PEN', '菜瓜布', '導電片', '電極片', '刮刀', '3M 膠布(5cm)', 
  '3M 膠布(2.5cm)', '減敏膠布', 'PRP 採血管', '私密液尿酸', '刷手液', '產包', '滅菌指示帶', 
  '滅菌膠帶', '管袋 50MM', '管袋 100MM', '管袋 150MM', '酒精棉片(200 片/盒)', '壓舌板', 
  'Jelly(箱)', '包布、洞巾 10 條/包(可訂)', '手術巾 50*45cm(10 張/盒)', '免縫膠帶(12*10mm)'
];

const normalizeItemName = (name: string): string => {
  if (!name) return '';
  // Convert full-width to half-width characters
  const normalized = name.replace(/[\uFF01-\uFF5E]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
  }).replace(/　/g, ' ');

  return normalized
    .replace(/\s+/g, '')                      // Remove all whitespaces
    .replace(/c\.?c\.?/gi, 'cc')             // Standardize CC / C.C. / c.c. / cc
    .replace(/[\.\-\*\(\)\/（）]/g, '')        // Remove periods, hyphens, parentheses, slashes
    .toLowerCase();
};

const DEFAULT_SORT_ORDER_NORMALIZED = DEFAULT_SORT_ORDER.map(name => normalizeItemName(name));

const findDefaultIndex = (dbItem: string): number => {
  const normDb = normalizeItemName(dbItem);
  if (!normDb) return -1;

  // 1. Try exact match first
  const exactIdx = DEFAULT_SORT_ORDER_NORMALIZED.indexOf(normDb);
  if (exactIdx !== -1) return exactIdx;

  // 2. Try substring matching (longest match priority)
  let bestIdx = -1;
  let bestLen = 0;

  for (let i = 0; i < DEFAULT_SORT_ORDER_NORMALIZED.length; i++) {
    const normDef = DEFAULT_SORT_ORDER_NORMALIZED[i];
    if (normDef.length < 3) continue; // Skip too short sequences to avoid false positives

    if (normDb.includes(normDef) || normDef.includes(normDb)) {
      const overlap = Math.min(normDb.length, normDef.length);
      if (overlap > bestLen) {
        bestLen = overlap;
        bestIdx = i;
      }
    }
  }

  return bestIdx;
};

export interface SkincareGroupDef {
  key: string;
  title: string;
  badgeBg: string;
  borderColor: string;
  headerBg: string;
  items: string[];
}

export const SKINCARE_GROUPS: SkincareGroupDef[] = [
  {
    key: 'chan1',
    title: '產一',
    badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    borderColor: 'border-emerald-200',
    headerBg: 'bg-emerald-50/90 border-emerald-200 text-emerald-900',
    items: [
      'AHA10%', 'AHA20%', 'AHA30%', '冰晶', 'MEO B5沙貨', '澤芳HA', '澤芳水凝露', 
      '澤芳化妝水', '洗臉慕斯', '卸妝乳', '訊聯水凝膠', '多肽保濕', 'AHA 30ml', 'AHA 50ml禮盒'
    ]
  },
  {
    key: 'chan2',
    title: '產二',
    badgeBg: 'bg-blue-100 text-blue-800 border-blue-300',
    borderColor: 'border-blue-200',
    headerBg: 'bg-blue-50/90 border-blue-200 text-blue-900',
    items: [
      'DHEA塞劑', '優潔通', 'Leora乳', 'Leora化妝水', 'Leora防曬', 'MEO OK霜', 
      'MEO 神經醯胺', 'MEO 玻尿酸', '隔離霜 無色', '隔離霜 潤色', '真皮粉'
    ]
  },
  {
    key: 'chan3',
    title: '產三',
    badgeBg: 'bg-purple-100 text-purple-800 border-purple-300',
    borderColor: 'border-purple-200',
    headerBg: 'bg-purple-50/90 border-purple-200 text-purple-900',
    items: [
      'Leora面膜', 'MEO B5正貨', '訊聯EXOcake', '訊聯全效', '魔泌面膜', '蜂毒霜', 
      '植泌精華露', '植泌精華霜', '麗妍', '舒康2.0', '麗晶之家神經精純露', '麗晶之家玫瑰胎盤'
    ]
  },
  {
    key: 'small_and_injection',
    title: '小庫及針劑區',
    badgeBg: 'bg-amber-100 text-amber-800 border-amber-300',
    borderColor: 'border-amber-200',
    headerBg: 'bg-amber-50/90 border-amber-200 text-amber-900',
    items: [
      '愛的玻尿酸', '仙女玻尿酸', '新魅玻尿酸', '彈力針', 'GG', 'Volite', 'Botox', 
      'Letybo', '魚骨線', '鼻雕6.0', '鼻雕3.8', '魔速線', '水光針頭', '過濾器', 
      '喬雅露大分子', '喬雅露小分子', '精靈針'
    ]
  }
];

export const getSkincareGroupInfo = (item: any) => {
  if (typeof item === 'object' && item !== null) {
    if (typeof item.skincareGroup === 'number' && item.skincareGroup >= 0 && item.skincareGroup <= 4) {
      const g = item.skincareGroup;
      const groupTitle = g < SKINCARE_GROUPS.length ? SKINCARE_GROUPS[g].title : '其他未分類';
      return { groupIndex: g, itemIndex: 999, groupTitle };
    }
  }

  const dbItemName = typeof item === 'string' ? item : (item?.name || '');
  const normDb = normalizeItemName(dbItemName);
  if (!normDb) return { groupIndex: 4, itemIndex: 999, groupTitle: '其他未分類' };

  // 1. Exact normalized match
  for (let g = 0; g < SKINCARE_GROUPS.length; g++) {
    const group = SKINCARE_GROUPS[g];
    for (let i = 0; i < group.items.length; i++) {
      const normDef = normalizeItemName(group.items[i]);
      if (normDb === normDef) {
        return { groupIndex: g, itemIndex: i, groupTitle: group.title };
      }
    }
  }

  // 2. Substring / Fuzzy keyword matching (longest match priority)
  let bestGroupIdx = 4;
  let bestItemIdx = 999;
  let bestLen = 0;

  for (let g = 0; g < SKINCARE_GROUPS.length; g++) {
    const group = SKINCARE_GROUPS[g];
    for (let i = 0; i < group.items.length; i++) {
      const normDef = normalizeItemName(group.items[i]);
      if (normDef.length < 2) continue;

      if (normDb.includes(normDef) || normDef.includes(normDb)) {
        const overlap = Math.min(normDb.length, normDef.length);
        if (overlap > bestLen) {
          bestLen = overlap;
          bestGroupIdx = g;
          bestItemIdx = i;
        }
      }
    }
  }

  if (bestGroupIdx !== 4) {
    return { groupIndex: bestGroupIdx, itemIndex: bestItemIdx, groupTitle: SKINCARE_GROUPS[bestGroupIdx].title };
  }

  return { groupIndex: 4, itemIndex: 999, groupTitle: '其他未分類' };
};

const CATEGORY_TYPES: Record<InventoryCategory, string[]> = {
  nursing: ['空針', '針頭', '縫線', '棉棒', '紗布', '手套', '其他耗材'],
  aesthetic: ['填充物', '肉毒', '儀器探頭', '其他'],
  skincare: ['潔顏', '化妝水', '精華液', '乳液/霜', '面膜', '防曬', '線材', '口服保健品', '外泌體相關', '其他'],
  'iv-drip': ['生理食鹽水', '葡萄糖液', '美白針劑', '止痛針劑', '維他命針劑', '其他針劑'],
  controlled: ['無', '第一級管制', '第二級管制', '第三級管制', '第四級管制']
};

const NURSING_TYPE_ORDER = ['空針', '針頭', '縫線', '棉棒', '紗布', '手套', '其他耗材'];

// --- Components ---

const GroupHeaderRow = ({ groupDef, gIdx, count, isCheckMode }: any) => {
  const { setNodeRef } = useDroppable({ id: `group-${gIdx}` });
  return (
    <tr ref={setNodeRef} className={cn("border-t-2 font-bold select-none", groupDef.headerBg)}>
      <td colSpan={isCheckMode ? 10 : 9} className="py-2.5 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border shadow-2xs", groupDef.badgeBg)}>
              {groupDef.title}
            </span>
          </div>
          <span className="text-xs px-2.5 py-1 bg-white/90 rounded-full font-mono text-slate-600 border border-slate-200/80 shadow-2xs">
            共 {count} 項
          </span>
        </div>
      </td>
    </tr>
  );
};

const EmptyGroupRow = ({ gIdx, isCheckMode }: any) => {
  const { setNodeRef } = useDroppable({ id: `group-${gIdx}` });
  return (
    <tr ref={setNodeRef}>
      <td colSpan={isCheckMode ? 10 : 9} className="py-3 text-center text-xs text-slate-400 bg-slate-50/50">
        此群組暫無品項（可拖曳品項至此區）
      </td>
    </tr>
  );
};

const SortableRow = ({ item, isCheckMode, view, profile, checkCounts, setCheckCounts, setEditingItem, setIsAddItemModalOpen, handleDeleteItem, setEditingBatch, handleDeleteBatch, setSelectedCategoryInModal, setEditBatchNoExpiry }: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  const isLow = item.totalStock <= item.safetyStock && item.totalStock > 0;
  const isOut = item.totalStock === 0;

  return (
    <tr 
      ref={setNodeRef} 
      style={style} 
      className={cn("text-sm hover:bg-slate-50/50 transition-colors group", isDragging && "bg-white shadow-lg")}
    >
      <td className="py-4 px-2">
        <div className="flex items-center gap-2">
          {!isCheckMode && (
            profile?.role === 'admin' || 
            profile?.role === 'sales_lead' || 
            profile?.role === 'cs'
          ) && (
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-1">
              <GripVertical className="w-4 h-4" />
            </div>
          )}
          <div className="flex gap-1">
            {!isCheckMode && (
              profile?.role === 'admin' || 
              (profile?.role === 'sales_lead' && (view.includes('aesthetic') || view.includes('skincare')))
            ) && (
              <>
                <Button 
                  variant="ghost" 
                  className="p-1 px-2 text-blue-600 hover:bg-blue-50"
                  onClick={() => { 
                    const cat = item.category || getCategoryFromView(view);
                    setSelectedCategoryInModal(cat);
                    setEditingItem(item); 
                    setIsAddItemModalOpen(true); 
                  }}
                >
                  修改
                </Button>
                <Button 
                  variant="ghost" 
                  className="p-1 px-2 text-rose-600 hover:bg-rose-50"
                  onClick={() => handleDeleteItem(item.id)}
                >
                  刪除
                </Button>
              </>
            )}
            {isCheckMode && (
              <div className="flex items-center gap-2">
                {checkCounts[item.id] === item.totalStock ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                )}
                <span className={cn("text-[10px] font-bold whitespace-nowrap", checkCounts[item.id] === item.totalStock ? "text-emerald-600" : "text-amber-600")}>
                  {checkCounts[item.id] === item.totalStock ? "相符" : `差額: ${checkCounts[item.id] - item.totalStock}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="py-4 text-slate-500">{item.type}</td>
      <td className="py-4 font-medium text-slate-900">{item.name}</td>
      <td className="py-4 text-center">
        <span className={cn(
          "font-bold px-3 py-1 rounded-full",
          isOut ? "bg-rose-100 text-rose-700" : 
          isLow ? "bg-amber-100 text-amber-700" : 
          "bg-emerald-100 text-emerald-700"
        )}>
          {item.totalStock}
        </span>
      </td>
      {isCheckMode && (
        <td className="py-4 text-center bg-amber-50/30">
          <input 
            type="number" 
            className="w-20 p-1.5 border border-amber-200 rounded-lg text-center font-bold focus:ring-2 focus:ring-amber-500 outline-none bg-white shadow-sm"
            value={checkCounts[item.id] ?? 0}
            onChange={(e) => setCheckCounts({ ...checkCounts, [item.id]: parseInt(e.target.value) || 0 })}
          />
        </td>
      )}
      <td className="py-4 text-center text-slate-500">{item.safetyStock}</td>
      <td className="py-4 text-slate-500">{item.spec}</td>
      <td className="py-4 text-slate-500 max-w-[150px] truncate" title={item.remark || ''}>
        {item.remark || '-'}
      </td>
      <td className="py-4">
        <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
          {item.batches.map((batch: any, bIdx: number) => (
            <div key={bIdx} className="flex flex-col border-l-2 border-slate-100 pl-2 py-0.5">
              <div className="flex justify-between items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400">數量: {batch.quantity}</span>
                  <span className="text-[10px] text-slate-400">入庫: {batch.latestInDate}</span>
                </div>
                <div className="flex gap-1">
                  {(profile?.role === 'admin' || 
                    (profile?.role === 'sales_lead' && (view.includes('aesthetic') || view.includes('skincare'))) ||
                    (profile?.role === 'nurse' && (view.includes('nursing') || view.includes('iv-drip') || view.includes('controlled')))
                  ) && (
                    <>
                      <Button 
                        variant="ghost" 
                        className="p-0.5 h-auto text-blue-400 hover:text-blue-600 transition-colors"
                        onClick={() => {
                          setEditingBatch({ 
                            itemId: item.id, 
                            itemName: item.name, 
                            expiryDate: batch.expiryDate, 
                            originalExpiryDate: batch.expiryDate,
                            latestInDate: batch.latestInDate, 
                            originalLatestInDate: batch.latestInDate,
                            quantity: batch.quantity,
                            originalQuantity: batch.quantity
                          });
                          setEditBatchNoExpiry(batch.expiryDate === '-');
                        }}
                        title="修改此批次時間"
                      >
                        <Calendar className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-slate-500 font-medium">效期: {batch.expiryDate}</div>
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
};

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' }) => {
  const variants = {
    primary: 'bg-brand-primary text-white hover:bg-brand-secondary shadow-sm',
    secondary: 'bg-brand-accent text-brand-text hover:bg-brand-muted/20',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    ghost: 'hover:bg-brand-accent/30 text-brand-muted',
    outline: 'border border-brand-primary/30 hover:bg-brand-accent/20 text-brand-primary'
  };
  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, title, subtitle, extra, ...props }: { children: React.ReactNode, className?: string, title?: string, subtitle?: string, extra?: React.ReactNode, [key: string]: any }) => (
  <div className={cn('glass-card rounded-[2rem] overflow-hidden', className)} {...props}>
    {(title || subtitle || extra) && (
      <div className="px-8 py-6 border-b border-brand-accent/50 bg-brand-accent/10 flex justify-between items-center">
        <div>
          {title && <h3 className="text-xl font-serif font-semibold text-brand-text">{title}</h3>}
          {subtitle && <p className="text-sm text-brand-muted">{subtitle}</p>}
        </div>
        {extra && <div>{extra}</div>}
      </div>
    )}
    <div className="p-8">{children}</div>
  </div>
);

const Badge = ({ children, variant = 'info', className }: { children: React.ReactNode, variant?: 'success' | 'warning' | 'error' | 'info' | 'secondary', className?: string }) => {
  const variants = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    error: 'bg-rose-50 text-rose-700 border-rose-100',
    info: 'bg-brand-accent/30 text-brand-primary border-brand-accent/50',
    secondary: 'bg-brand-bg text-brand-muted border-brand-accent/30'
  };
  return (
    <span className={cn('px-3 py-1 rounded-full text-xs font-medium border', variants[variant], className)}>
      {children}
    </span>
  );
};

// 一個更流暢的日期輸入元件，避免在手機版 (iOS/Android) 滾動/打字時頻繁觸換整個 App 的 state 渲染導致 Picker 閃退/關閉
const SmoothDateInput = ({ 
  value, 
  onChange, 
  required, 
  className,
  disabled,
  name
}: { 
  value: string; 
  onChange: (val: string) => void; 
  required?: boolean; 
  className?: string;
  disabled?: boolean;
  name?: string;
}) => {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalVal(val);
    if (!val || val.length === 10) {
      onChange(val);
    }
  };

  const handleBlur = () => {
    onChange(localVal);
  };

  return (
    <input 
      type="date"
      required={required}
      disabled={disabled}
      name={name}
      className={cn(className, disabled && "bg-slate-200 text-slate-400 border-slate-200 cursor-not-allowed opacity-60")}
      value={localVal || ''}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<{ uid: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<'home' | 'in' | 'out' | 'admin-stock-nursing' | 'admin-stock-aesthetic' | 'admin-stock-skincare' | 'admin-transactions-nursing' | 'admin-transactions-aesthetic' | 'admin-transactions-skincare' | 'admin-transactions' | 'admin-users' | 'history' | 'admin-check-history' | 'admin-stock-iv-drip' | 'admin-stock-controlled' | 'admin-backup'>('home');
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isCheckMode, setIsCheckMode] = useState(false);
  const [selectedCheckForDetail, setSelectedCheckForDetail] = useState<InventoryCheck | null>(null);
  const [checkCounts, setCheckCounts] = useState<Record<string, number>>({});
  const [unlistedItemsNote, setUnlistedItemsNote] = useState('');
  const [selectedCategoryInModal, setSelectedCategoryInModal] = useState<InventoryCategory>('nursing');
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isSelfEditModalOpen, setIsSelfEditModalOpen] = useState(false);
  const [activeExpiryTooltip, setActiveExpiryTooltip] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingBatch, setEditingBatch] = useState<{ 
    itemId: string; 
    itemName: string; 
    expiryDate: string; 
    originalExpiryDate: string; 
    latestInDate: string; 
    originalLatestInDate: string; 
    quantity: number; 
    originalQuantity: number; 
  } | null>(null);
  const [editBatchNoExpiry, setEditBatchNoExpiry] = useState(false);
  const [editingCheck, setEditingCheck] = useState<InventoryCheck | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [txnFilter, setTxnFilter] = useState<'all' | 'in' | 'out'>('all');
  
  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  
  // Auth Form State
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Data State
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventoryChecks, setInventoryChecks] = useState<InventoryCheck[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  
  // Form States
  const [formData, setFormData] = useState({
    itemId: '',
    itemSearch: '',
    itemType: '',
    category: '', // 庫存位置 / 類別
    type: '', // 'in' or 'out'
    quantity: 1,
    spec: '',
    customerInfo: '',
    doctor: '',
    expiryDate: format(new Date(), 'yyyy-MM-dd'),
    date: format(new Date(), 'yyyy-MM-dd')
  });
  const [noExpiry, setNoExpiry] = useState(false);
  const [stockSearch, setStockSearch] = useState('');

  // Clear stock search query whenever view switches
  useEffect(() => {
    setStockSearch('');
  }, [view]);

  // Seed Admin and Check Session
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Seed Admin if not exists
        const adminRef = doc(db, 'users', 'admin_joy');
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            uid: 'admin_joy',
            username: 'H097',
            password: '111111',
            name: 'Joy',
            email: 'admin@clinic.local',
            role: 'admin',
            lastLogin: new Date().toISOString(),
            approved: true
          });
        }

        // Seed Nurse if not exists
        const nurseRef = doc(db, 'users', 'nurse_01');
        const nurseSnap = await getDoc(nurseRef);
        if (!nurseSnap.exists()) {
          await setDoc(nurseRef, {
            uid: 'nurse_01',
            username: 'nursing1',
            password: '111111',
            name: '護理師曉婷',
            email: 'nursing1@clinic.local',
            role: 'nurse',
            lastLogin: new Date().toISOString(),
            approved: true
          });
        }

        // Seed CS if not exists
        const csRef = doc(db, 'users', 'cs_01');
        const csSnap = await getDoc(csRef);
        if (!csSnap.exists()) {
          await setDoc(csRef, {
            uid: 'cs_01',
            username: 'cs1',
            password: '111111',
            name: '客服雅婷',
            email: 'cs1@clinic.local',
            role: 'cs',
            lastLogin: new Date().toISOString(),
            approved: true
          });
        }

        // Seed Sales Lead if not exists
        const salesRef = doc(db, 'users', 'sales_01');
        const salesSnap = await getDoc(salesRef);
        if (!salesSnap.exists()) {
          await setDoc(salesRef, {
            uid: 'sales_01',
            username: 'sales1',
            password: '111111',
            name: '業務組長家豪',
            email: 'sales1@clinic.local',
            role: 'sales_lead',
            lastLogin: new Date().toISOString(),
            approved: true
          });
        }

        // Programmatically search and delete user "Chu chung" if exists in the database
        const usersQuery = query(collection(db, 'users'));
        const usersSnap = await getDocs(usersQuery);
        for (const docSnap of usersSnap.docs) {
          const uData = docSnap.data();
          if (
            uData.name === 'Chu chung' || 
            uData.username === 'Chu chung' || 
            String(uData.name).toLowerCase().includes('chu chung') ||
            String(uData.username).toLowerCase().includes('chu chung') ||
            String(uData.email || '').toLowerCase().includes('chungchu250')
          ) {
            await deleteDoc(docSnap.ref);
            console.log(`Successfully deleted admin user Chu chung (ID: ${docSnap.id})`);
          }
        }

        // Check local storage for session
        const savedUid = localStorage.getItem('clinic_uid');
        if (savedUid) {
          setUser({ uid: savedUid });
        }
      } catch (error) {
        console.error("Auth init error:", error);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  // Real-time Profile Listener
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      } else {
        // If user document is gone, logout
        handleLogout();
      }
    }, (err) => {
      console.error("Profile listener error:", err);
      handleLogout();
    });

    return () => unsub();
  }, [user]);

  // Real-time Listeners
  useEffect(() => {
    if (!user) return;

    const qInventory = query(collection(db, 'inventory'), where('status', '==', 'active'));
    const unsubInventory = onSnapshot(qInventory, (snapshot) => {
      setInventory(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryItem)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inventory'));

    const qTransactions = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(500));
    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    const qChecks = query(collection(db, 'inventoryChecks'), orderBy('timestamp', 'desc'), limit(100));
    const unsubChecks = onSnapshot(qChecks, (snapshot) => {
      setInventoryChecks(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InventoryCheck)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'inventoryChecks'));

    if (profile?.role === 'admin') {
      const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setUsers(snapshot.docs.map(d => d.data() as UserProfile));
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
      return () => { unsubInventory(); unsubTransactions(); unsubChecks(); unsubUsers(); };
    }

    return () => { unsubInventory(); unsubTransactions(); unsubChecks(); };
  }, [user, profile]);

  // Derived Data
  const groupedInventory = useMemo(() => {
    const results: any[] = [];
    
    inventory.forEach(item => {
      const ins = transactions
        .filter(t => t.itemId === item.id && t.type === 'in')
        .sort((a, b) => {
          const ad = a.expiryDate || '9999-12-31';
          const bd = b.expiryDate || '9999-12-31';
          return ad.localeCompare(bd);
        });
      
      const totalOut = transactions
        .filter(t => t.itemId === item.id && t.type === 'out')
        .reduce((sum, t) => sum + t.quantity, 0);
      
      let remainingOut = totalOut;
      
      const batches = ins.reduce((acc: any[], t) => {
        const dateKey = t.expiryDate || '-';
        const existing = acc.find(b => b.expiryDate === dateKey);
        if (existing) {
          existing.quantity += t.quantity;
          if (t.date > existing.latestInDate) existing.latestInDate = t.date;
        } else {
          acc.push({
            expiryDate: dateKey,
            quantity: t.quantity,
            latestInDate: t.date
          });
        }
        return acc;
      }, []);

      const processedBatches = batches.map(batch => {
        const subtract = Math.min(batch.quantity, remainingOut);
        const finalQty = batch.quantity - subtract;
        remainingOut -= subtract;
        return { ...batch, quantity: finalQty };
      }).filter(b => b.quantity > 0);

      results.push({
        ...item,
        batches: processedBatches.length > 0 ? processedBatches : [{ expiryDate: '-', quantity: 0, latestInDate: '-' }],
        totalStock: processedBatches.reduce((sum, b) => sum + b.quantity, 0)
      });
    });
    
    return results.sort((a, b) => {
      const aCat = a.category || 'nursing';
      const bCat = b.category || 'nursing';

      // 1. Priority for 五六診 (skincare) Category Predefined Groups & Sequence
      if (aCat === 'skincare' && bCat === 'skincare') {
        const gA = getSkincareGroupInfo(a);
        const gB = getSkincareGroupInfo(b);

        if (gA.groupIndex !== gB.groupIndex) {
          return gA.groupIndex - gB.groupIndex;
        }

        if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        } else if (a.sortOrder !== undefined) {
          return -1;
        } else if (b.sortOrder !== undefined) {
          return 1;
        }

        if (gA.itemIndex !== gB.itemIndex) {
          return gA.itemIndex - gB.itemIndex;
        }
        return a.name.localeCompare(b.name, 'zh-Hant', { numeric: true, sensitivity: 'base' });
      }

      // 2. Priority: Manual Sort Order (Drag & Drop) for other categories
      if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      } else if (a.sortOrder !== undefined) {
        return -1;
      } else if (b.sortOrder !== undefined) {
        return 1;
      }

      // 3. Priority: Default Sort Order from images (for nursing/general)
      const aDefaultIdx = findDefaultIndex(a.name);
      const bDefaultIdx = findDefaultIndex(b.name);
      if (aDefaultIdx !== -1 && bDefaultIdx !== -1) return aDefaultIdx - bDefaultIdx;
      if (aDefaultIdx !== -1) return -1;
      if (bDefaultIdx !== -1) return 1;

      // 4. Default fallback sorting
      const aTypeIdx = NURSING_TYPE_ORDER.indexOf(a.type);
      const bTypeIdx = NURSING_TYPE_ORDER.indexOf(b.type);
      const aTypeVal = aTypeIdx === -1 ? 999 : aTypeIdx;
      const bTypeVal = bTypeIdx === -1 ? 999 : bTypeIdx;
      
      if (aTypeVal !== bTypeVal) return aTypeVal - bTypeVal;
      if (a.name.length !== b.name.length) return a.name.length - b.name.length;
      return a.name.localeCompare(b.name, 'zh-Hant', { numeric: true, sensitivity: 'base' });
    });
  }, [inventory, transactions, isCheckMode, view]);

  const inventoryStatus = useMemo(() => {
    const today = new Date();
    const threeMonthsFromNow = addMonths(today, 3);
    const alerts: any[] = [];

    // Filter categories based on user role
    const allowedCategories: InventoryCategory[] = profile?.role === 'admin' 
      ? ['nursing', 'aesthetic', 'skincare', 'iv-drip', 'controlled']
      : profile?.role === 'nurse'
      ? ['nursing', 'iv-drip', 'controlled']
      : profile?.role === 'sales_lead'
      ? ['aesthetic', 'skincare']
      : profile?.role === 'cs'
      ? ['skincare']
      : [];

    groupedInventory
      .filter(item => {
        if (profile?.role === 'admin') return true;
        const itemCategory = item.category || 'nursing';
        return allowedCategories.includes(itemCategory);
      })
      .forEach(item => {
        item.batches.forEach((batch: any) => {
          if (batch.expiryDate === '-') return;
          const expiry = parseISO(batch.expiryDate);
          let status: 'green' | 'yellow' | 'red' = 'green';
          if (isBefore(expiry, today)) {
            status = 'red';
          } else if (isBefore(expiry, threeMonthsFromNow)) {
            status = 'yellow';
          }
          
          if (status !== 'green') {
            alerts.push({ ...item, expiryDate: batch.expiryDate, currentStock: batch.quantity, expiryStatus: status });
          }
        });
      });
    return alerts;
  }, [groupedInventory, profile]);

  const myTransactions = useMemo(() => {
    return transactions
      .filter(t => t.operatorId === user?.uid)
      .filter(t => txnFilter === 'all' || t.type === txnFilter);
  }, [transactions, user, txnFilter]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => txnFilter === 'all' || t.type === txnFilter);
  }, [transactions, txnFilter]);

  const filteredItems = useMemo(() => {
    if (!formData.itemSearch) return [];
    const allowedCategories: InventoryCategory[] = profile?.role === 'admin' 
      ? ['nursing', 'aesthetic', 'skincare', 'iv-drip', 'controlled']
      : profile?.role === 'nurse'
      ? ['nursing', 'iv-drip', 'controlled']
      : profile?.role === 'sales_lead'
      ? ['aesthetic', 'skincare']
      : profile?.role === 'cs'
      ? ['skincare']
      : [];
    return groupedInventory.filter(i => {
      const itemCategory = i.category || 'nursing';
      const matchesAllowed = allowedCategories.includes(itemCategory);
      const matchesSelectedCategory = formData.category ? itemCategory === formData.category : true;
      return matchesAllowed && matchesSelectedCategory && 
        i.name.toLowerCase().includes(formData.itemSearch.toLowerCase());
    });
  }, [groupedInventory, formData.itemSearch, formData.category, profile]);

  const filteredInventoryChecks = useMemo(() => {
    const allowedCategories: InventoryCategory[] = profile?.role === 'admin' 
      ? ['nursing', 'aesthetic', 'skincare', 'iv-drip', 'controlled']
      : profile?.role === 'nurse'
      ? ['nursing', 'iv-drip', 'controlled']
      : profile?.role === 'sales_lead'
      ? ['aesthetic', 'skincare']
      : profile?.role === 'cs'
      ? ['skincare']
      : [];
    return inventoryChecks.filter(check => {
      const checkCategory = check.category || 'nursing';
      return allowedCategories.includes(checkCategory);
    });
  }, [inventoryChecks, profile]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent, itemsInCategory: any[]) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const category = getCategoryFromView(view);

    if (category === 'skincare') {
      const activeItem = itemsInCategory.find(i => i.id === active.id);
      if (!activeItem) return;

      let targetGroupIndex = -1;
      let overItemIndex = -1;

      const overItem = itemsInCategory.find(i => i.id === over.id);
      if (overItem) {
        targetGroupIndex = getSkincareGroupInfo(overItem).groupIndex;
        overItemIndex = itemsInCategory.findIndex(i => i.id === over.id);
      } else if (typeof over.id === 'string' && over.id.startsWith('group-')) {
        targetGroupIndex = parseInt(over.id.replace('group-', ''), 10);
      }

      if (targetGroupIndex < 0 || targetGroupIndex > 4) return;

      const oldIndex = itemsInCategory.findIndex(i => i.id === active.id);
      const updatedActiveItem = { ...activeItem, skincareGroup: targetGroupIndex };
      let reordered = [...itemsInCategory];
      reordered[oldIndex] = updatedActiveItem;

      if (overItemIndex !== -1) {
        reordered = arrayMove(reordered, oldIndex, overItemIndex);
      }

      try {
        const batch = writeBatch(db);
        reordered.forEach((item, index) => {
          const updateData: any = { sortOrder: index };
          if (item.id === activeItem.id) {
            updateData.skincareGroup = targetGroupIndex;
          }
          batch.update(doc(db, 'inventory', item.id), updateData);
        });
        await batch.commit();
      } catch (error) {
        console.error("Failed to update sort order and group:", error);
      }
      return;
    }

    const oldIndex = itemsInCategory.findIndex(i => i.id === active.id);
    const newIndex = itemsInCategory.findIndex(i => i.id === over.id);

    const reorderedItems = arrayMove(itemsInCategory, oldIndex, newIndex);
    
    // Update Firestore with new sort orders
    try {
      const batch = writeBatch(db);
      reorderedItems.forEach((item, index) => {
        batch.update(doc(db, 'inventory', item.id), { sortOrder: index });
      });
      await batch.commit();
    } catch (error) {
      console.error("Failed to update sort order:", error);
    }
  };

  const handleResetSortOrder = async () => {
    if (profile?.role !== 'admin' && profile?.role !== 'sales_lead') return;
    const category = getCategoryFromView(view);
    const itemsInCategory = inventory.filter(item => (item.category || 'nursing') === category);

    setConfirmModal({
      isOpen: true,
      title: '確認重設排序為相片順序',
      message: '您確定要將此類別的排列順序重設回相片預設順序嗎？這將會清除您目前此類別的所有自訂拖移排序，並自動重整！',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          setSubmitting(true);
          const batch = writeBatch(db);
          itemsInCategory.forEach((item) => {
            batch.update(doc(db, 'inventory', item.id), { 
              sortOrder: deleteField(),
              skincareGroup: deleteField()
            });
          });
          await batch.commit();
        } catch (error) {
          console.error("Failed to reset sort order:", error);
        } finally {
          setSubmitting(false);
        }
      }
    });
  };

  const handleInventoryCheckSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const batch = writeBatch(db);
      let adjustmentCount = 0;
      const category = getCategoryFromView(view);
      const checkRef = doc(collection(db, 'inventoryChecks'));
      const checkId = checkRef.id;

      for (const itemId in checkCounts) {
        const item = inventory.find(i => i.id === itemId);
        const groupedItem = groupedInventory.find(gi => gi.id === itemId);
        if (!item || !groupedItem) continue;
        
        const systemCount = groupedItem.totalStock;
        const actualCount = checkCounts[itemId] ?? 0;
        const diff = actualCount - systemCount;

        if (diff !== 0) {
          adjustmentCount++;
          const type = diff > 0 ? 'in' : 'out';
          const qty = Math.abs(diff);

          if (isNaN(qty)) continue;

          const txnRef = doc(collection(db, 'transactions'));
          batch.set(txnRef, {
            type,
            itemId: item.id,
            itemName: item.name,
            quantity: qty,
            spec: item.spec,
            date: format(new Date(), 'yyyy-MM-dd'),
            category: item.category || 'nursing',
            expiryDate: '-', 
            operatorId: profile?.uid || 'system',
            operatorName: profile?.name || '盤點人員',
            timestamp: serverTimestamp(),
            remark: '盤點調整',
            checkId
          });

          const itemRef = doc(db, 'inventory', item.id);
          batch.update(itemRef, {
            currentStock: actualCount 
          });
        }
      }

      // Always create a check record if we entered check mode and submitted
      batch.set(checkRef, {
        checkTime: format(new Date(), 'yyyy-MM-dd HH:mm'),
        adjustmentCount,
        operatorId: profile?.uid || 'system',
        operatorName: profile?.name || '盤點人員',
        note: unlistedItemsNote || '',
        timestamp: serverTimestamp(),
        category
      });

      await batch.commit();
      
      if (adjustmentCount > 0) {
        alert(`盤點完成！已自動產生 ${adjustmentCount} 筆調整紀錄。${unlistedItemsNote ? '\n\n備註：' + unlistedItemsNote : ''}`);
      } else {
        alert(`盤點完成！所有品項數量皆符，已記錄此次盤點時間。${unlistedItemsNote ? '\n\n備註：' + unlistedItemsNote : ''}`);
      }
      
      setIsCheckMode(false);
      setCheckCounts({});
      setUnlistedItemsNote('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatch) return;
    const target = e.target as any;
    const newDate = target.date.value;
    const newExpiryDate = target.expiryDate.value;
    const finalExpiryDate = editBatchNoExpiry ? '-' : (newExpiryDate || '-');
    const newQuantity = Number(target.quantity.value);
    const diff = newQuantity - editingBatch.originalQuantity;

    setSubmitting(true);
    try {
      const q = query(
        collection(db, 'transactions'), 
        where('itemId', '==', editingBatch.itemId),
        where('type', '==', 'in')
      );
      const snap = await getDocs(q);
      const targetDocs = snap.docs.filter(d => {
        const t = d.data() as Transaction;
        return (t.expiryDate || '-') === editingBatch.originalExpiryDate;
      });

      if (targetDocs.length > 0) {
        const batch = writeBatch(db);
        
        // 1. Update date and expiryDate on all matching docs in this batch
        targetDocs.forEach(d => {
          batch.update(d.ref, { 
            date: newDate, 
            expiryDate: finalExpiryDate
          });
        });

        // 2. If quantity is modified, apply difference to transaction records
        if (diff !== 0) {
          let remainingDiff = diff;
          // Sort or iterate through targetDocs to distribute the diff
          for (let i = 0; i < targetDocs.length; i++) {
            const docRef = targetDocs[i].ref;
            const tData = targetDocs[i].data() as Transaction;
            const originalQty = tData.quantity;
            if (remainingDiff === 0) break;

            if (remainingDiff > 0) {
              // Add difference to the first transaction document
              batch.update(docRef, { quantity: originalQty + remainingDiff });
              remainingDiff = 0;
            } else {
              // Subtract difference (remainingDiff is negative)
              const subtractAmount = Math.min(originalQty, Math.abs(remainingDiff));
              batch.update(docRef, { quantity: originalQty - subtractAmount });
              remainingDiff += subtractAmount;
            }
          }

          // 3. Update the stock on the inventory item
          const itemRef = doc(db, 'inventory', editingBatch.itemId);
          const itemSnap = await getDoc(itemRef);
          if (itemSnap.exists()) {
            const itemData = itemSnap.data() as InventoryItem;
            const newCurrentStock = (itemData.currentStock || 0) + diff;
            batch.update(itemRef, { currentStock: newCurrentStock });
          }
        }

        await batch.commit();
        alert("批次資訊與數量更新成功！");
      } else {
        alert("找不到對應的原始交易紀錄，無法修改。");
      }
      setEditingBatch(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCheck) return;
    const target = e.target as any;
    const note = target.note.value;

    try {
      await updateDoc(doc(db, 'inventoryChecks', editingCheck.id), { note });
      alert("盤點備註更新成功！");
      setEditingCheck(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventoryChecks');
    }
  };

  const handleDeleteCheck = async (checkId: string) => {
    setConfirmModal({
      isOpen: true,
      title: '確認刪除盤點紀錄',
      message: '確定要刪除此盤點紀錄嗎？相關的調整庫存紀錄也將一併刪除，這可能會使庫存數值與實際不符！',
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'inventoryChecks', checkId));
          
          const q = query(collection(db, 'transactions'), where('checkId', '==', checkId));
          const snap = await getDocs(q);
          
          for (const d of snap.docs) {
            const t = d.data() as Transaction;
            batch.delete(d.ref);
            
            const itemRef = doc(db, 'inventory', t.itemId);
            const itemSnap = await getDoc(itemRef);
            if (itemSnap.exists()) {
              const itemData = itemSnap.data() as InventoryItem;
              const adjustment = t.type === 'in' ? -t.quantity : t.quantity;
              batch.update(itemRef, {
                currentStock: itemData.currentStock + adjustment
              });
            }
          }
          
          await batch.commit();
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          alert("盤點紀錄及相關調整已刪除。");
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'inventoryChecks');
        }
      }
    });
  };

  // Handlers
  const handleLogout = () => {
    setUser(null);
    setProfile(null);
    localStorage.removeItem('clinic_uid');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const q = query(
        collection(db, 'users'), 
        where('password', '==', loginForm.password)
      );
      
      const querySnapshot = await getDocs(q);
      const matchedDoc = querySnapshot.docs.find(d => {
        const u = d.data() as UserProfile;
        return u.username.trim().toLowerCase() === loginForm.username.trim().toLowerCase();
      });
      
      if (matchedDoc) {
        const data = matchedDoc.data() as UserProfile;
        if (data.approved === false) {
          setLoginError('此帳號尚未核准啟用，審核中請聯絡管理者確認');
          return;
        }
        setUser({ uid: data.uid });
        setProfile(data);
        localStorage.setItem('clinic_uid', data.uid);
        await updateDoc(doc(db, 'users', data.uid), { 
          lastLogin: new Date().toISOString() 
        });
      } else {
        setLoginError('帳號或密碼錯誤');
      }
    } catch (error) {
      console.error("Login error:", error);
      setLoginError('登入失敗，請檢查網路連線或稍後再試');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    const target = e.target as any;
    const name = target.name.value;
    const username = target.username.value.trim();
    const password = target.password.value;

    try {
      // Check if username exists case-insensitively
      const allUsersSnap = await getDocs(collection(db, 'users'));
      const exists = allUsersSnap.docs.some(docSnap => {
        const u = docSnap.data() as UserProfile;
        return u.username.trim().toLowerCase() === username.toLowerCase();
      });
      if (exists) {
        setLoginError('此帳號已存在');
        return;
      }

      const newUserRef = doc(collection(db, 'users'));
      const newUser = {
        uid: newUserRef.id,
        username,
        password,
        name,
        email: `${username}@clinic.local`,
        role: 'operator' as UserRole,
        lastLogin: '',
        approved: false
      };

      await setDoc(newUserRef, newUser);
      alert("註冊申請已送出！已排入審核，請等待管理者核准後方可登入。");
      setIsRegistering(false);
    } catch (error: any) {
      console.error("Register error:", error);
      setLoginError(`註冊失敗: ${error.message || '請稍後再試'}`);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.role !== 'admin') return;
    const target = e.target as any;
    const name = target.name.value;
    const role = target.role.value;
    const password = target.password.value;

    try {
      if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.uid), { name, role, password });
        if (editingUser.uid === profile?.uid && password !== editingUser.password) {
          alert("密碼已更新，系統將會自動登出，請使用新密碼重新登入！");
          handleLogout();
          setIsUserModalOpen(false);
          setEditingUser(null);
          return;
        }
        alert("人員資訊更新成功！");
      } else {
        const username = target.username.value.trim();
        if (!username) {
          alert("請輸入帳號！");
          return;
        }

        // Check if username exists case-insensitively
        const allUsersSnap = await getDocs(collection(db, 'users'));
        const exists = allUsersSnap.docs.some(docSnap => {
          const u = docSnap.data() as UserProfile;
          return u.username.trim().toLowerCase() === username.toLowerCase();
        });
        if (exists) {
          alert('此帳號已存在！');
          return;
        }

        const newUserRef = doc(collection(db, 'users'));
        const newUser = {
          uid: newUserRef.id,
          username,
          password,
          name,
          email: `${username}@clinic.local`,
          role: role || 'nurse',
          lastLogin: '',
          approved: true
        };
        await setDoc(newUserRef, newUser);
        alert("人員創建成功！");
      }
      setIsUserModalOpen(false);
      setEditingUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const handleApproveUser = async (uid: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { approved: true });
      alert("人員帳號已成功核准啟用！");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const handleUpdateSelfProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const target = e.target as any;
    const name = target.selfName.value;
    const password = target.selfPassword.value;

    try {
      await updateDoc(doc(db, 'users', profile.uid), { name, password });
      
      if (password !== profile.password) {
        alert("密碼已更新，系統將會自動登出，請使用新密碼重新登入！");
        handleLogout();
        setIsSelfEditModalOpen(false);
        return;
      }
      
      alert("個人資料修改成功！");
      setIsSelfEditModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile) {
      alert("人員資訊遺失，請重新登入系統！");
      return;
    }

    if (submitting) return;
    
    // Explicit validation check
    if (!formData.itemId) {
      alert("請務必【點選】下拉選單中的品項名稱後再提交！");
      return;
    }

    const currentType = formData.type || view as any;
    if (currentType !== 'in' && currentType !== 'out') {
      alert("操作類型錯誤，請返回首頁重新進入");
      return;
    }

    const item = inventory.find(i => i.id === formData.itemId);
    if (!item) {
      alert("找不到指定的品項，請重新選擇！");
      return;
    }

    if (formData.quantity < 1) {
      alert("數量至少需為 1");
      return;
    }

    if (currentType === 'out' && item.category === 'skincare' && (!formData.doctor || !formData.doctor.trim())) {
      alert("五六診品項出庫，請務必填寫「自填醫師」！");
      return;
    }

    setSubmitting(true);

    try {
      const groupedItem = groupedInventory.find(gi => gi.id === item.id);
      let newCurrentStock = groupedItem ? (groupedItem.totalStock ?? 0) : (item.currentStock ?? 0);

      if (currentType === 'in') {
        newCurrentStock += formData.quantity;
      } else if (currentType === 'out') {
        if (newCurrentStock < formData.quantity) {
          alert(`出庫失敗：庫存不足！\n品項：${item.name}\n目前庫存：${newCurrentStock}\n欲出庫：${formData.quantity}`);
          setSubmitting(false);
          return;
        }
        newCurrentStock -= formData.quantity;
      }

      const batch = writeBatch(db);
      
      // 1. Add Transaction record
      const txnRef = doc(collection(db, 'transactions'));
      batch.set(txnRef, {
        type: currentType,
        itemId: item.id,
        itemName: item.name || '未命名品項',
        quantity: formData.quantity,
        spec: item.spec || '-',
        date: formData.date,
        category: item.category || 'nursing',
        expiryDate: noExpiry ? '-' : (formData.expiryDate || '-'),
        operatorId: profile.uid,
        operatorName: profile.name || '未知操作員',
        customerInfo: formData.customerInfo || '',
        doctor: formData.doctor || '',
        timestamp: serverTimestamp()
      });

      // 2. Update Inventory stock
      const itemRef = doc(db, 'inventory', item.id);
      batch.update(itemRef, {
        currentStock: newCurrentStock
      });

      await batch.commit();

      alert("🎉 操作成功！紀錄已寫入並更新庫存。");
      
      // Cleanup
      setView('home');
      setNoExpiry(false);
      setFormData({ 
        itemId: '', 
        itemSearch: '', 
        itemType: '',
        category: '',
        type: '', 
        quantity: 1, 
        spec: '',
        customerInfo: '',
        doctor: '',
        expiryDate: format(new Date(), 'yyyy-MM-dd'),
        date: format(new Date(), 'yyyy-MM-dd') 
      });
    } catch (error) {
      console.error("Transaction batch error:", error);
      alert("系統提交失敗：" + (error instanceof Error ? error.message : "請檢查網路連線後再試"));
      handleFirestoreError(error, OperationType.WRITE, 'transactions');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateOrUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.role !== 'admin' && profile?.role !== 'sales_lead') return;
    
    const target = e.target as any;
    const name = target.name.value;
    const type = target.type.value;
    const spec = target.spec.value;
    const category = target.category.value as InventoryCategory;
    const safetyStock = Number(target.safetyStock.value);
    const remark = target.remark?.value || '';

    try {
      if (editingItem) {
        await updateDoc(doc(db, 'inventory', editingItem.id), { 
          name, type, spec, category, safetyStock, remark
        });
        alert("品項更新成功！");
      } else {
        await addDoc(collection(db, 'inventory'), {
          name, type, spec, category, 
          currentStock: 0, 
          safetyStock, 
          status: 'active',
          remark
        });
        alert("品項建立成功！");
      }
      setIsAddItemModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleDeleteItem = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: '確認刪除品項',
      message: '確定要刪除此品項嗎？此操作將永久移除該品項及其所有出入庫紀錄！',
      onConfirm: async () => {
        try {
          // 1. Delete the item document
          await deleteDoc(doc(db, 'inventory', id));
          
          // 2. Delete all associated transactions
          const q = query(collection(db, 'transactions'), where('itemId', '==', id));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'inventory');
        }
      }
    });
  };

  const handleDeleteBatch = async (itemId: string, expiryDate: string) => {
    setConfirmModal({
      isOpen: true,
      title: '確認刪除批次',
      message: `確定要刪除此效期 (${expiryDate}) 的所有入庫紀錄嗎？這將會影響庫存數量！`,
      onConfirm: async () => {
        try {
          const q = query(
            collection(db, 'transactions'), 
            where('itemId', '==', itemId),
            where('type', '==', 'in')
          );
          const snap = await getDocs(q);
          const targetDocs = snap.docs.filter(d => {
            const t = d.data() as Transaction;
            return (t.expiryDate || '-') === expiryDate;
          });

          if (targetDocs.length > 0) {
            const batch = writeBatch(db);
            targetDocs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            alert("批次紀錄已刪除。");
          }
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          setEditingBatch(null); // Close modal if open
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'transactions');
        }
      }
    });
  };

  const handleDeleteUser = async (uid: string) => {
    setConfirmModal({
      isOpen: true,
      title: '確認刪除使用者',
      message: '確定要刪除此使用者嗎？此操作不可復原！',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', uid));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'users');
        }
      }
    });
  };

  const handleDeleteTransaction = async (id: string) => {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;

    setConfirmModal({
      isOpen: true,
      title: '確認刪除紀錄',
      message: `確定要刪除此筆${transaction.type === 'in' ? '入庫' : '出庫'}紀錄 (${transaction.itemName}) 嗎？這將會影響目前的庫存計算！`,
      onConfirm: async () => {
        try {
          // 1. Delete the transaction
          await deleteDoc(doc(db, 'transactions', id));
          
          // 2. Update the inventory currentStock to stay in sync
          const item = inventory.find(i => i.id === transaction.itemId);
          if (item) {
            const adjustment = transaction.type === 'in' ? -transaction.quantity : transaction.quantity;
            await updateDoc(doc(db, 'inventory', item.id), {
              currentStock: item.currentStock + adjustment
            });
          }

          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'transactions');
        }
      }
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-white border border-brand-accent flex items-center justify-center shadow-sm">
                <Package className="text-brand-primary w-10 h-10" />
              </div>
            </div>
            <h1 className="text-4xl font-serif font-light text-brand-primary mb-2 tracking-widest">遇見幸福</h1>
            <p className="text-brand-muted text-sm uppercase tracking-[0.3em] mb-12">Where Dreams Come True</p>
            
            <Card className="py-10 px-2 shadow-xl border-none bg-white/60 backdrop-blur-xl">
              <h2 className="text-xl font-serif text-brand-text mb-8">{isRegistering ? '建立人員帳號' : '庫存系統登入'}</h2>
              <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-6 text-left px-4">
                {isRegistering && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-brand-muted uppercase tracking-wider ml-1">姓名</label>
                    <input 
                      name="name"
                      required
                      className="w-full p-3 bg-white/50 border border-brand-accent rounded-xl focus:ring-1 focus:ring-brand-primary outline-none transition-all"
                      placeholder="請輸入真實姓名"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-brand-muted uppercase tracking-wider ml-1">帳號</label>
                  <input 
                    name="username"
                    required
                    className="w-full p-3 bg-white/50 border border-brand-accent rounded-xl focus:ring-1 focus:ring-brand-primary outline-none transition-all"
                    value={loginForm.username}
                    onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-brand-muted uppercase tracking-wider ml-1">密碼</label>
                  <input 
                    name="password"
                    type="password"
                    required
                    className="w-full p-3 bg-white/50 border border-brand-accent rounded-xl focus:ring-1 focus:ring-brand-primary outline-none transition-all"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  />
                </div>
                {loginError && <p className="text-xs text-rose-500 text-center font-medium">{loginError}</p>}
                <Button type="submit" className="w-full py-4 text-base tracking-widest mt-4 font-serif">
                  {isRegistering ? '確認建立' : '進入系統'}
                </Button>
                <button 
                  type="button"
                  className="w-full text-xs text-brand-muted hover:text-brand-primary transition-colors mt-4 uppercase tracking-widest"
                  onClick={() => { setIsRegistering(!isRegistering); setLoginError(''); }}
                >
                  {isRegistering ? '已有帳號？返回登入' : '沒有帳號？聯繫管理員建立'}
                </button>
              </form>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-md border-b border-brand-accent sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setView('home')}>
            <div className="bg-brand-primary p-2.5 rounded-xl shadow-md group-hover:scale-110 transition-transform">
              <Package className="text-white w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-2xl text-brand-primary tracking-wider leading-none">星幸福</span>
              <span className="text-[10px] text-brand-muted uppercase tracking-[0.2em]">Inventory System</span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            {(profile?.role === 'admin' || profile?.role === 'nurse' || profile?.role === 'cs' || profile?.role === 'sales_lead') && (
              <div 
                className="relative group py-4"
                onMouseEnter={() => setAdminMenuOpen(true)}
                onMouseLeave={() => setAdminMenuOpen(false)}
              >
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 hover:bg-brand-accent/20 text-brand-primary"
                >
                  <Settings className="w-5 h-5" />
                  <span className="font-serif tracking-wider">後台管理</span>
                </Button>
                
                {/* Invisible bridge to prevent menu from closing when moving cursor */}
                <div className="absolute top-full left-0 w-full h-2" />

                <div className={cn(
                  "absolute top-[calc(100%-8px)] right-0 w-64 bg-white/95 backdrop-blur-md border border-brand-accent rounded-2xl shadow-xl py-2 z-50 transition-all duration-200 origin-top-right",
                  adminMenuOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
                )}>
                  {(profile?.role === 'admin' || profile?.role === 'nurse') && (
                    <>
                      <button 
                        onClick={() => { setView('admin-stock-nursing'); setAdminMenuOpen(false); }}
                        className="w-full px-4 py-2.5 text-left text-sm text-brand-text hover:bg-brand-bg flex items-center gap-3 transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4 text-brand-primary" />
                        護理師衛材庫存表
                      </button>
                      <button 
                        onClick={() => { setView('admin-stock-iv-drip'); setAdminMenuOpen(false); }}
                        className="w-full px-4 py-2.5 text-left text-sm text-brand-text hover:bg-brand-bg flex items-center gap-3 transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4 text-blue-500" />
                        點滴針劑庫存表
                      </button>
                      <button 
                        onClick={() => { setView('admin-stock-controlled'); setAdminMenuOpen(false); }}
                        className="w-full px-4 py-2.5 text-left text-sm text-brand-text hover:bg-brand-bg flex items-center gap-3 transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4 text-purple-500" />
                        管制藥物庫存表
                      </button>
                    </>
                  )}
                  {(profile?.role === 'admin' || profile?.role === 'sales_lead') && (
                    <button 
                      onClick={() => { setView('admin-stock-aesthetic'); setAdminMenuOpen(false); }}
                      className="w-full px-4 py-2.5 text-left text-sm text-brand-text hover:bg-brand-bg flex items-center gap-3 transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4 text-emerald-500" />
                      醫美大庫庫存表
                    </button>
                  )}
                  {(profile?.role === 'admin' || profile?.role === 'cs' || profile?.role === 'sales_lead') && (
                    <button 
                      onClick={() => { setView('admin-stock-skincare'); setAdminMenuOpen(false); }}
                      className="w-full px-4 py-2.5 text-left text-sm text-brand-text hover:bg-brand-bg flex items-center gap-3 transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4 text-rose-500" />
                      五六診庫存表
                    </button>
                  )}
                  <div className="h-px bg-brand-accent/30 my-1 mx-2" />
                  <button 
                    onClick={() => { setView('admin-transactions'); setAdminMenuOpen(false); }}
                    className="w-full px-4 py-2.5 text-left text-sm text-brand-text hover:bg-brand-bg flex items-center gap-3 transition-colors"
                  >
                    <History className="w-4 h-4 text-cyan-500" />
                    完整出入庫明細
                  </button>
                  {profile?.role === 'admin' && (
                    <button 
                      onClick={() => { setView('admin-users'); setAdminMenuOpen(false); }}
                      className="w-full px-4 py-2.5 text-left text-sm text-brand-text hover:bg-brand-bg flex items-center gap-3 transition-colors"
                    >
                      <User className="w-4 h-4 text-amber-500" />
                      人員管理
                    </button>
                  )}
                  <button 
                    onClick={() => { setView('admin-check-history'); setAdminMenuOpen(false); }}
                    className="w-full px-4 py-2.5 text-left text-sm text-brand-text hover:bg-brand-bg flex items-center gap-3 transition-colors"
                  >
                    <ClipboardList className="w-4 h-4 text-amber-600" />
                    盤點歷史紀錄
                  </button>
                  {profile?.role === 'admin' && (
                    <>
                      <div className="h-px bg-brand-accent/30 my-1 mx-2" />
                      <button 
                        onClick={() => { setView('admin-backup'); setAdminMenuOpen(false); }}
                        className="w-full px-4 py-2.5 text-left text-sm text-brand-text hover:bg-brand-bg flex items-center gap-3 transition-colors font-medium"
                      >
                        <Database className="w-4 h-4 text-emerald-600" />
                        資料備份與還原
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div 
              onClick={() => setIsSelfEditModalOpen(true)}
              className="flex items-center gap-3 cursor-pointer hover:opacity-85 transition-all p-1 rounded-xl hover:bg-slate-50 border border-transparent hover:border-brand-accent/20"
              title="修改您的姓名與密碼"
            >
              <div className="hidden sm:flex flex-col items-end">
                <p className="text-sm font-serif font-semibold text-brand-text">{profile?.name || '載入中...'}</p>
                <p className="text-[9px] text-brand-muted uppercase tracking-widest bg-brand-accent/20 px-2 py-0.5 rounded-full">
                  {profile?.role === 'admin' ? 'Administrator' : 
                   profile?.role === 'nurse' ? 'Nurse' :
                   profile?.role === 'cs' ? 'Customer Service' :
                   profile?.role === 'sales_lead' ? 'Sales Lead' : 'Operator'}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-white border border-brand-accent flex items-center justify-center shadow-sm hover:scale-105 transition-transform">
                <User className="text-brand-primary w-5 h-5" />
              </div>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="p-2 hover:bg-rose-50 hover:text-rose-600 transition-colors">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {view === 'home' && (
          <div className="space-y-8">
            {/* Quick Actions */}
            <div className={cn("grid gap-6", profile?.role === 'cs' ? "grid-cols-1" : "grid-cols-2")}>
              {profile?.role !== 'cs' && (
                <Button 
                  variant="outline" 
                  className="h-40 flex-col gap-4 bg-white/50 border-brand-accent hover:border-brand-primary hover:bg-brand-accent/20 rounded-[2rem]"
                  onClick={() => { 
                    setAdminMenuOpen(false);
                    setView('in'); 
                    setNoExpiry(false);
                    setFormData({ 
                      itemId: '',
                      itemSearch: '',
                      itemType: '',
                      category: '',
                      type: 'in', 
                      quantity: 1,
                      spec: '',
                      customerInfo: '',
                      doctor: '',
                      expiryDate: format(new Date(), 'yyyy-MM-dd'),
                      date: format(new Date(), 'yyyy-MM-dd')
                    }); 
                  }}
                >
                  <div className="p-4 bg-emerald-50 rounded-2xl">
                    <PlusCircle className="w-8 h-8 text-emerald-600" />
                  </div>
                  <span className="font-serif text-lg tracking-wider">品項入庫</span>
                </Button>
              )}
              <Button 
                variant="outline" 
                className="h-40 flex-col gap-4 bg-white/50 border-brand-accent hover:border-brand-primary hover:bg-brand-accent/20 rounded-[2rem]"
                onClick={() => { 
                  setAdminMenuOpen(false);
                  setView('out'); 
                  setNoExpiry(false);
                  setFormData({ 
                    itemId: '',
                    itemSearch: '',
                    itemType: '',
                    category: '',
                    type: 'out', 
                    quantity: 1,
                    spec: '',
                    customerInfo: '',
                    doctor: '',
                    expiryDate: format(new Date(), 'yyyy-MM-dd'),
                    date: format(new Date(), 'yyyy-MM-dd')
                  }); 
                }}
              >
                <div className="p-4 bg-rose-50 rounded-2xl">
                  <MinusCircle className="w-8 h-8 text-rose-600" />
                </div>
                <span className="font-serif text-lg tracking-wider">品項出庫</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Expiry Status (Filtered) */}
              <div className="lg:col-span-3">
                <Card 
                  title="效期亮燈警示" 
                  subtitle="僅顯示已過期或三個月內即將到期之品項"
                  className="border-brand-accent/50"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {inventoryStatus.map((item, idx) => {
                      const itemKey = `${item.id}-${item.expiryDate}-${idx}`;
                      const isToolTipActive = activeExpiryTooltip === itemKey;
                      return (
                        <div 
                          key={itemKey} 
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveExpiryTooltip(activeExpiryTooltip === itemKey ? null : itemKey);
                          }}
                          className="group relative flex items-center justify-between p-4 bg-white rounded-lg border border-slate-100 shadow-sm hover:border-blue-200 transition-colors cursor-pointer select-none"
                        >
                          {/* Expiry Date Tooltip */}
                          <div className={cn(
                            "absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-1 rounded transition-opacity whitespace-nowrap z-10",
                            isToolTipActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 pointer-events-none"
                          )}>
                            到期日: {item.expiryDate}
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <AlertTriangle className={cn(
                              "w-5 h-5",
                              item.expiryStatus === 'red' ? "text-rose-500" : "text-amber-500"
                            )} />
                            <div>
                              <p className="font-semibold text-slate-900">{item.name}</p>
                              <p className="text-xs text-slate-500">{item.spec} | 數量: {item.currentStock}</p>
                            </div>
                          </div>
                          <Badge variant={item.expiryStatus === 'red' ? 'error' : 'warning'}>
                            {item.expiryStatus === 'red' ? '已過期' : '三個月內到期'}
                          </Badge>
                        </div>
                      );
                    })}
                    {inventoryStatus.length === 0 && (
                      <div className="col-span-full text-center py-12 text-slate-400">
                        <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-50" />
                        <p>目前無效期警示品項</p>
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Recent Activity */}
              <div className="lg:col-span-3">
                <Card 
                  title="我的最近操作" 
                  subtitle="您最近的出入庫明細"
                  extra={
                    <div className="flex gap-2">
                       <Button 
                         variant={txnFilter === 'all' ? 'primary' : 'outline'} 
                         className="h-8 text-xs px-3"
                         onClick={() => setTxnFilter('all')}
                       >全部</Button>
                       <Button 
                         variant={txnFilter === 'in' ? 'primary' : 'outline'} 
                         className="h-8 text-xs px-3"
                         onClick={() => setTxnFilter('in')}
                       >最近入庫</Button>
                       <Button 
                         variant={txnFilter === 'out' ? 'primary' : 'outline'} 
                         className="h-8 text-xs px-3"
                         onClick={() => setTxnFilter('out')}
                       >最近出庫</Button>
                    </div>
                  }
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-slate-500 text-sm border-b border-slate-100">
                          <th className="pb-3 font-medium">時間</th>
                          <th className="pb-3 font-medium">類型</th>
                          <th className="pb-3 font-medium">品項</th>
                          <th className="pb-3 font-medium">數量</th>
                          <th className="pb-3 font-medium">規格</th>
                          <th className="pb-3 font-medium text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {myTransactions.slice(0, 5).map(t => (
                          <tr key={t.id} className="text-sm group">
                            <td className="py-4 text-slate-500">
                              {t.timestamp ? format(t.timestamp.toDate(), 'MM/dd HH:mm') : t.date}
                            </td>
                            <td className="py-4">
                              <Badge variant={t.type === 'in' ? 'success' : 'error'}>
                                {t.type === 'in' ? '入庫' : '出庫'}
                              </Badge>
                            </td>
                            <td className="py-4">
                              <div>
                                <p className="font-medium text-slate-900">{t.itemName}</p>
                                {t.type === 'out' && (
                                  <p className="text-[10px] font-bold text-rose-500 flex items-center gap-1 mt-0.5">
                                    <Clock className="w-3 h-3" /> 出庫效期: {t.expiryDate || '未註記'}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="py-4 text-slate-600">{t.quantity}</td>
                            <td className="py-4 text-slate-500">{t.spec}</td>
                            <td className="py-4 text-right">
                              <button 
                                onClick={() => handleDeleteTransaction(t.id)}
                                className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                title="刪除紀錄"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {myTransactions.length === 0 && (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400">尚無操作紀錄</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {myTransactions.length > 5 && (
                    <Button variant="ghost" className="w-full mt-4 text-sm" onClick={() => setView('history')}>
                      查看更多紀錄 <ChevronRight className="w-4 h-4" />
                    </Button>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}

        {(view === 'in' || view === 'out') && (
          <div className="max-w-2xl mx-auto">
            <Card title={view === 'in' ? '品項入庫' : '品項出庫'}>
              <form onSubmit={handleTransaction} className="space-y-6" noValidate>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">庫存位置 (選擇後過濾產品)</label>
                  <select
                    value={formData.category}
                    onChange={(e) => {
                      setFormData({ 
                        ...formData, 
                        category: e.target.value,
                        itemId: '',
                        itemSearch: '',
                        itemType: '',
                        spec: ''
                      });
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">-- 請選擇庫存位置 --</option>
                    {(!profile || profile.role === 'admin') && (
                      <>
                        <option value="aesthetic">醫美大庫</option>
                        <option value="skincare">五六診庫存</option>
                        <option value="nursing">護理衛材</option>
                        <option value="iv-drip">點滴針劑</option>
                        <option value="controlled">管制藥物</option>
                      </>
                    )}
                    {profile?.role === 'nurse' && (
                      <>
                        <option value="nursing">護理衛材</option>
                        <option value="iv-drip">點滴針劑</option>
                        <option value="controlled">管制藥物</option>
                      </>
                    )}
                    {profile?.role === 'sales_lead' && (
                      <>
                        <option value="aesthetic">醫美大庫</option>
                        <option value="skincare">五六診庫存</option>
                      </>
                    )}
                    {profile?.role === 'cs' && (
                      <>
                        <option value="skincare">五六診庫存</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="space-y-2 relative">
                  <label className="text-sm font-medium text-slate-700">品項名稱 (可輸入關鍵字搜尋)</label>
                  <div className="relative">
                    <input 
                      type="text"
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="輸入品項名稱..."
                      value={formData.itemSearch}
                      onChange={(e) => setFormData({ ...formData, itemSearch: e.target.value, itemId: '' })}
                    />
                    {formData.itemSearch && !formData.itemId && filteredItems.length > 0 && (
                      <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl z-30 mt-1 max-h-60 overflow-y-auto">
                        {filteredItems.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            className="w-full px-4 py-3 text-left hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0 flex justify-between items-center"
                            onClick={() => {
                              const groupedItem = groupedInventory.find(gi => gi.id === item.id);
                              let defaultExpiry = formData.expiryDate;
                              let isNoExp = noExpiry;

                              if (view === 'out' && groupedItem) {
                                const activeBatches = groupedItem.batches?.filter((b: any) => b.quantity > 0) || [];
                                if (activeBatches.length > 0) {
                                  const firstBatch = activeBatches[0];
                                  if (firstBatch.expiryDate === '-') {
                                    defaultExpiry = '-';
                                    isNoExp = true;
                                  } else {
                                    defaultExpiry = firstBatch.expiryDate;
                                    isNoExp = false;
                                  }
                                } else {
                                  const anyBatch = groupedItem.batches?.[0];
                                  if (anyBatch) {
                                    if (anyBatch.expiryDate === '-') {
                                      defaultExpiry = '-';
                                      isNoExp = true;
                                    } else {
                                      defaultExpiry = anyBatch.expiryDate;
                                      isNoExp = false;
                                    }
                                  }
                                }
                              }

                              setFormData({ 
                                ...formData, 
                                itemId: item.id, 
                                itemSearch: item.name, 
                                spec: item.spec, 
                                itemType: item.type,
                                category: item.category || 'nursing',
                                expiryDate: defaultExpiry
                              });
                              if (view === 'out') {
                                setNoExpiry(isNoExp);
                              }
                            }}
                          >
                            <span className="font-medium">{item.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium scale-90 border border-slate-200">
                                {item.category === 'nursing' ? '護理衛材' :
                                 item.category === 'aesthetic' ? '醫美大庫' :
                                 item.category === 'skincare' ? '五六診庫存' :
                                 item.category === 'iv-drip' ? '點滴針劑' :
                                 item.category === 'controlled' ? '管制藥物' : item.category || '護理衛材'}
                              </span>
                              <span className="text-xs text-slate-400">{item.type} | {item.spec}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {formData.itemId && (
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                       <p className="text-xs text-slate-400 mb-1">目前庫存</p>
                       <p className="font-bold text-slate-700 font-mono">
                         {groupedInventory.find(i => i.id === formData.itemId)?.totalStock ?? 0} {formData.spec}
                       </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">類型</label>
                    <input 
                      type="text" 
                      readOnly
                      className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 outline-none"
                      value={formData.itemType || (inventory.find(i => i.id === formData.itemId)?.type || '')}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">數量 (1-100)</label>
                    <input 
                      type="number" 
                      min="1" 
                      required
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">規格</label>
                    <input 
                      type="text" 
                      readOnly
                      className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg text-slate-500 outline-none"
                      value={formData.spec}
                    />
                  </div>
                </div>

                {view === 'out' && formData.category === 'skincare' && (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">自填醫師 <span className="text-xs text-rose-500 font-normal">(必填)</span></label>
                      <input 
                        type="text"
                        required
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="請輸入醫師姓名..."
                        value={formData.doctor}
                        onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">客編(或姓名) <span className="text-xs text-slate-400 font-normal">(選填)</span></label>
                      <input 
                        type="text"
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="請輸入客編(或姓名)以供出庫紀錄對照..."
                        value={formData.customerInfo}
                        onChange={(e) => setFormData({ ...formData, customerInfo: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">{view === 'in' ? '入庫日期' : '出庫日期'}</label>
                  <div className="relative">
                    <SmoothDateInput 
                      required
                      disabled={noExpiry}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                      value={formData.date}
                      onChange={(val) => setFormData({ ...formData, date: val })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-slate-700">效期時間 (入庫必填 / 出庫選填)</label>
                    <button
                      type="button"
                      onClick={() => setNoExpiry(!noExpiry)}
                      className={cn(
                        "text-xs px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-all outline-none",
                        noExpiry 
                          ? "bg-slate-200 text-slate-600 border-slate-300" 
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <input 
                        type="checkbox" 
                        checked={noExpiry} 
                        onChange={() => {}} // Controlled by button trigger
                        className="rounded border-slate-300 text-brand-primary focus:ring-blue-500 cursor-pointer" 
                      />
                      <span>無效期</span>
                    </button>
                  </div>
                  {view === 'out' && formData.itemId && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {groupedInventory.find(i => i.id === formData.itemId)?.batches?.filter((b: any) => b.expiryDate !== '-').map((batch: any, idx: number) => (
                        <button
                          key={idx}
                          type="button"
                          className={cn(
                            "text-[10px] px-2 py-1 rounded-md border transition-all active:scale-90 font-mono",
                            formData.expiryDate === batch.expiryDate 
                              ? "bg-brand-primary text-white border-brand-primary" 
                              : "bg-white text-slate-600 border-slate-200 hover:border-brand-primary/50"
                          )}
                          onClick={() => {
                            if (!noExpiry) {
                              setFormData({ ...formData, expiryDate: batch.expiryDate });
                            }
                          }}
                        >
                          {batch.expiryDate} (餘: {batch.quantity})
                        </button>
                      ))}
                    </div>
                  )}
                  <SmoothDateInput 
                    required={view === 'in' && !noExpiry}
                    disabled={noExpiry}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    value={noExpiry ? '' : formData.expiryDate}
                    onChange={(val) => setFormData({ ...formData, expiryDate: val })}
                  />
                  <p className="text-[10px] text-slate-400 italic">提示：出庫時填寫(或點選上方)效期可方便日後追蹤消耗之批次</p>
                </div>

                <div className="flex gap-4 pt-8 border-t-2 border-slate-100 mt-8 w-full min-h-[80px] relative z-[60]">
                  <button 
                    type="button" 
                    className="flex-1 h-14 text-lg border-2 border-slate-300 bg-white hover:bg-slate-50 active:scale-95 transition-all text-slate-600 rounded-xl font-bold" 
                    onClick={() => setView('home')} 
                    disabled={submitting}
                  >
                    取消操作
                  </button>
                  <button 
                    type="submit" 
                    className={cn(
                      "flex-1 h-14 text-lg font-bold shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 rounded-xl text-white",
                      submitting ? "bg-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                    )}
                    disabled={submitting}
                  >
                    {submitting ? "正在處理..." : "確認提交紀錄"}
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {view.startsWith('admin-stock-') && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-slate-900">
                  {view === 'admin-stock-nursing' ? '護理師衛材相關庫存表' : 
                   view === 'admin-stock-aesthetic' ? '醫美大庫庫存表' : 
                   view === 'admin-stock-skincare' ? '五六診庫存表' :
                   view === 'admin-stock-iv-drip' ? '點滴針劑庫存表' :
                   view === 'admin-stock-controlled' ? '管制藥物庫存表' :
                   '庫存管理'}
                </h2>
                <div className="flex gap-2">
                  {(profile?.role === 'admin' || 
                    (profile?.role === 'sales_lead' && (view.includes('aesthetic') || view.includes('skincare')))
                  ) && (
                    <Button onClick={() => { 
                      const category = getCategoryFromView(view);
                      setSelectedCategoryInModal(category);
                      setEditingItem(null); 
                      setIsAddItemModalOpen(true); 
                    }}>
                      <PlusCircle className="w-4 h-4" /> 新增庫存品項
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => {
                    const category = getCategoryFromView(view);
                    setView(`admin-transactions-${category}` as any);
                  }}>
                    <History className="w-4 h-4" /> 出入庫明細
                  </Button>
                  {profile?.role === 'admin' && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        const category = getCategoryFromView(view);
                        const csvStr = exportInventoryToCsv(inventory, groupedInventory, category);
                        const nowStr = format(new Date(), 'yyyyMMdd_HHmm');
                        const catName = CATEGORY_LABELS[category] || category;
                        downloadFile(csvStr, `星幸福_${catName}_${nowStr}.csv`, 'text/csv;charset=utf-8');
                      }}
                      title="匯出此庫存表為 Excel / CSV 檔案"
                    >
                      <Download className="w-4 h-4" /> 匯出 CSV
                    </Button>
                  )}

                  {view.startsWith('admin-stock-') && (
                    <div className="flex gap-2">
                       <Button 
                         variant={isCheckMode ? "primary" : "outline"}
                         className={cn(isCheckMode ? "bg-amber-600 hover:bg-amber-700" : "")}
                         onClick={() => {
                           if (isCheckMode) {
                             handleInventoryCheckSubmit();
                           } else {
                             const category = getCategoryFromView(view);
                             const itemsInRange = groupedInventory.filter(item => (item.category || 'nursing') === category);
                             const initialCounts: Record<string, number> = {};
                             itemsInRange.forEach(i => { initialCounts[i.id] = i.totalStock; });
                             setCheckCounts(initialCounts);
                             setIsCheckMode(true);
                           }
                         }}
                       >
                         <ClipboardList className="w-4 h-4" /> {isCheckMode ? "確認提交盤點結果" : "進入盤點模式"}
                       </Button>
                       {isCheckMode && (
                         <Button variant="ghost" className="text-slate-500" onClick={() => setIsCheckMode(false)}>
                           取消
                         </Button>
                       )}
                    </div>
                  )}
                </div>
              </div>
              <Button variant="outline" onClick={() => { setView('home'); setIsCheckMode(false); }}>返回首頁</Button>
            </div>
            
            <Card>
              {/* 庫存表搜尋欄位與功能選項 */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="搜尋品項名稱、類型、規格、備註..."
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 hover:border-slate-300 outline-none transition-all placeholder:text-slate-400 text-slate-700 font-sans"
                  />
                  {stockSearch && (
                    <button
                      type="button"
                      onClick={() => setStockSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 outline-none transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {!isCheckMode && (profile?.role === 'admin' || profile?.role === 'sales_lead') && (
                  <Button 
                    variant="outline" 
                    className="text-slate-600 border-slate-200 hover:bg-slate-100 flex items-center gap-1.5"
                    onClick={handleResetSortOrder}
                  >
                    <RefreshCw className="w-4 h-4 text-slate-500" /> 重設為預設順序
                  </Button>
                )}
              </div>

              {isCheckMode && (
                <div className="mb-6 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <label className="text-sm font-bold text-amber-800 mb-2 block">
                    📝 盤點備註 (例如：發現不在系統中的品項、包裝損毀等)
                  </label>
                  <textarea 
                    className="w-full p-3 bg-white border border-amber-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 outline-none min-h-[80px]"
                    placeholder="請在此輸入備註資訊..."
                    value={unlistedItemsNote}
                    onChange={(e) => setUnlistedItemsNote(e.target.value)}
                  />
                  <p className="text-[10px] text-amber-600 mt-2">※ 備註資訊將在確認後由系統提示彈窗顯示，且不直接存入資料庫單一品項中。</p>
                </div>
              )}
              {getCategoryFromView(view) === 'skincare' ? (
                (() => {
                  const skincareItems = groupedInventory.filter(item => {
                    if ((item.category || 'nursing') !== 'skincare') return false;
                    if (stockSearch) {
                      const s = stockSearch.toLowerCase();
                      return (
                        (item.name || '').toLowerCase().includes(s) ||
                        (item.type || '').toLowerCase().includes(s) ||
                        (item.spec || '').toLowerCase().includes(s) ||
                        (item.remark || '').toLowerCase().includes(s)
                      );
                    }
                    return true;
                  });

                  const allGroups = [
                    ...SKINCARE_GROUPS,
                    {
                      key: 'unclassified',
                      title: '其他未分類',
                      badgeBg: 'bg-slate-200 text-slate-800 border-slate-300',
                      borderColor: 'border-slate-200',
                      headerBg: 'bg-slate-100/90 border-slate-200 text-slate-800',
                      items: []
                    }
                  ];

                  return (
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => {
                        handleDragEnd(event, skincareItems);
                      }}
                    >
                      <SortableContext items={skincareItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-xs bg-white">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="text-slate-500 text-xs border-b border-slate-200 bg-slate-50/90">
                                  <th className="py-3 font-medium px-2">操作</th>
                                  <th className="py-3 font-medium">類型</th>
                                  <th className="py-3 font-medium">品項名稱</th>
                                  <th className="py-3 font-medium text-center">{isCheckMode ? '系統庫存' : '現有數量'}</th>
                                  {isCheckMode && <th className="py-3 font-medium text-center bg-amber-50 rounded-t-lg">實盤數量</th>}
                                  <th className="py-3 font-medium text-center">安全庫存</th>
                                  <th className="py-3 font-medium">規格</th>
                                  <th className="py-3 font-medium">備註</th>
                                  <th className="py-3 font-medium">入庫時間 / 到期日</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {allGroups.map((groupDef, gIdx) => {
                                  const groupItems = skincareItems.filter(item => {
                                    const info = getSkincareGroupInfo(item);
                                    return info.groupIndex === gIdx;
                                  });

                                  if (groupItems.length === 0 && (stockSearch || gIdx === 4)) return null;

                                  return (
                                    <React.Fragment key={groupDef.key}>
                                      <GroupHeaderRow groupDef={groupDef} gIdx={gIdx} count={groupItems.length} isCheckMode={isCheckMode} />
                                      {groupItems.length === 0 ? (
                                        <EmptyGroupRow gIdx={gIdx} isCheckMode={isCheckMode} />
                                      ) : (
                                        groupItems.map((item) => (
                                          <SortableRow 
                                            key={item.id}
                                            item={item}
                                            isCheckMode={isCheckMode}
                                            view={view}
                                            profile={profile}
                                            checkCounts={checkCounts}
                                            setCheckCounts={setCheckCounts}
                                            setEditingItem={setEditingItem}
                                            setIsAddItemModalOpen={setIsAddItemModalOpen}
                                            handleDeleteItem={handleDeleteItem}
                                            setEditingBatch={setEditingBatch}
                                            handleDeleteBatch={handleDeleteBatch}
                                            setSelectedCategoryInModal={setSelectedCategoryInModal}
                                            setEditBatchNoExpiry={setEditBatchNoExpiry}
                                          />
                                        ))
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </SortableContext>
                    </DndContext>
                  );
                })()
              ) : (
                <div className="overflow-x-auto">
                  <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => {
                      const category = getCategoryFromView(view);
                      const itemsInCategory = groupedInventory.filter(item => (item.category || 'nursing') === category);
                      handleDragEnd(event, itemsInCategory);
                    }}
                  >
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-slate-500 text-sm border-b border-slate-100">
                          <th className="pb-3 font-medium px-2">操作</th>
                          <th className="pb-3 font-medium">類型</th>
                          <th className="pb-3 font-medium">品項名稱</th>
                          <th className="pb-3 font-medium text-center">{isCheckMode ? '系統庫存' : '現有數量'}</th>
                          {isCheckMode && <th className="pb-3 font-medium text-center bg-amber-50 rounded-t-lg">實盤數量</th>}
                          <th className="pb-3 font-medium text-center">安全庫存</th>
                          <th className="pb-3 font-medium">規格</th>
                          <th className="pb-3 font-medium">備註</th>
                          <th className="pb-3 font-medium">入庫時間 / 到期日</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        <SortableContext 
                          items={groupedInventory
                            .filter(item => {
                              const category = getCategoryFromView(view);
                              if ((item.category || 'nursing') !== category) return false;
                              if (stockSearch) {
                                const s = stockSearch.toLowerCase();
                                return (
                                  (item.name || '').toLowerCase().includes(s) ||
                                  (item.type || '').toLowerCase().includes(s) ||
                                  (item.spec || '').toLowerCase().includes(s) ||
                                  (item.remark || '').toLowerCase().includes(s)
                                );
                              }
                              return true;
                            })
                            .map(i => i.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {groupedInventory
                            .filter(item => {
                              const category = getCategoryFromView(view);
                              if ((item.category || 'nursing') !== category) return false;
                              if (stockSearch) {
                                const s = stockSearch.toLowerCase();
                                return (
                                  (item.name || '').toLowerCase().includes(s) ||
                                  (item.type || '').toLowerCase().includes(s) ||
                                  (item.spec || '').toLowerCase().includes(s) ||
                                  (item.remark || '').toLowerCase().includes(s)
                                );
                              }
                              return true;
                            })
                            .map((item) => (
                              <SortableRow 
                                key={item.id}
                                item={item}
                                isCheckMode={isCheckMode}
                                view={view}
                                profile={profile}
                                checkCounts={checkCounts}
                                setCheckCounts={setCheckCounts}
                                setEditingItem={setEditingItem}
                                setIsAddItemModalOpen={setIsAddItemModalOpen}
                                handleDeleteItem={handleDeleteItem}
                                setEditingBatch={setEditingBatch}
                                handleDeleteBatch={handleDeleteBatch}
                                setSelectedCategoryInModal={setSelectedCategoryInModal}
                                setEditBatchNoExpiry={setEditBatchNoExpiry}
                              />
                            ))}
                        </SortableContext>
                      </tbody>
                    </table>
                  </DndContext>
                </div>
              )}
            </Card>

            {/* Add/Edit Item Modal */}
            {isAddItemModalOpen && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="animate-in zoom-in-95 duration-200">
                  <Card title={editingItem ? "修改庫存品項" : "新增庫存品項"} className="w-full max-w-md shadow-2xl">
                    <form onSubmit={handleCreateOrUpdateItem} className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">品項名稱</label>
                        <input 
                          name="name" 
                          required 
                          defaultValue={editingItem?.name || ''}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">所屬類別</label>
                        <select 
                          name="category" 
                          defaultValue={editingItem?.category || (view.includes('aesthetic') ? 'aesthetic' : view.includes('skincare') ? 'skincare' : view.includes('iv-drip') ? 'iv-drip' : view.includes('controlled') ? 'controlled' : 'nursing')}
                          onChange={(e) => setSelectedCategoryInModal(e.target.value as InventoryCategory)}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="nursing">護理師衛材相關</option>
                          <option value="aesthetic">醫美大庫相關</option>
                          <option value="skincare">五六診相關</option>
                          <option value="iv-drip">點滴針劑相關</option>
                          <option value="controlled">管制藥物相關</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">類型</label>
                        <select 
                          name="type" 
                          key={`${selectedCategoryInModal}-${editingItem?.id || 'new'}`}
                          defaultValue={
                            (editingItem && editingItem.category === selectedCategoryInModal && (CATEGORY_TYPES[selectedCategoryInModal]?.includes(editingItem.type)))
                              ? editingItem.type 
                              : (CATEGORY_TYPES[selectedCategoryInModal] ? CATEGORY_TYPES[selectedCategoryInModal][0] : '')
                          }
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          {(CATEGORY_TYPES[selectedCategoryInModal] || []).map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">規格</label>
                        <input 
                          name="spec" 
                          required 
                          defaultValue={editingItem?.spec || ''}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                          placeholder="如: 500mg/顆" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">安全庫存量</label>
                        <input 
                          name="safetyStock" 
                          type="number" 
                          required 
                          defaultValue={editingItem?.safetyStock || 0}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">備註</label>
                        <textarea 
                          name="remark" 
                          defaultValue={editingItem?.remark || ''}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[70px] max-h-[120px]" 
                          placeholder="請輸入此品項的任何特殊備註資訊 (非必填)..." 
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button type="button" variant="outline" className="flex-1" onClick={() => { setIsAddItemModalOpen(false); setEditingItem(null); }}>取消</Button>
                        <Button type="submit" className="flex-1">{editingItem ? "更新品項" : "建立品項"}</Button>
                      </div>
                    </form>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}

        {view.startsWith('admin-transactions') && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">
                {view === 'admin-transactions-nursing' ? '護理師衛材相關出入庫明細' : 
                 view === 'admin-transactions-aesthetic' ? '醫美大庫相關出入庫明細' : 
                 view === 'admin-transactions-skincare' ? '五六診出入庫明細' : 
                 view === 'admin-transactions-iv-drip' ? '點滴針劑出入庫明細' :
                 view === 'admin-transactions-controlled' ? '管制藥物出入庫明細' :
                 '出入庫明細' }
              </h2>
              <div className="flex items-center gap-2">
                {profile?.role === 'admin' && (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      const category = view === 'admin-transactions' ? 'all' : getCategoryFromView(view);
                      const filtered = transactions.filter(t => category === 'all' ? true : (t.category || 'nursing') === category);
                      const csvStr = exportTransactionsToCsv(filtered, category);
                      const nowStr = format(new Date(), 'yyyyMMdd_HHmm');
                      const catName = category === 'all' ? '全部出入庫紀錄' : (CATEGORY_LABELS[category as InventoryCategory] || category);
                      downloadFile(csvStr, `星幸福_${catName}_${nowStr}.csv`, 'text/csv;charset=utf-8');
                    }}
                    title="匯出出入庫歷史紀錄為 CSV"
                  >
                    <Download className="w-4 h-4" /> 匯出 CSV
                  </Button>
                )}
                <Button variant="outline" onClick={() => {
                  const category = getCategoryFromView(view);
                  setView(`admin-stock-${category}` as any);
                }}>
                  返回{view.includes('-') ? '庫存表' : '首頁'}
                </Button>
              </div>
            </div>
            <Card 
              title={view === 'admin-transactions' ? '完整出入庫明細' : '分類出入庫明細'} 
              subtitle={view === 'admin-transactions' ? '所有人員的操作紀錄匯整' : '該類別的操作紀錄匯整'}
              extra={
                <div className="flex gap-2">
                   <Button 
                     variant={txnFilter === 'all' ? 'primary' : 'outline'} 
                     className="h-8 text-xs px-3"
                     onClick={() => setTxnFilter('all')}
                   >全部</Button>
                   <Button 
                     variant={txnFilter === 'in' ? 'primary' : 'outline'} 
                     className="h-8 text-xs px-3"
                     onClick={() => setTxnFilter('in')}
                   >最近入庫</Button>
                   <Button 
                     variant={txnFilter === 'out' ? 'primary' : 'outline'} 
                     className="h-8 text-xs px-3"
                     onClick={() => setTxnFilter('out')}
                   >最近出庫</Button>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 text-sm border-b border-slate-100">
                      <th className="pb-3 font-medium">操作</th>
                      <th className="pb-3 font-medium">時間</th>
                      <th className="pb-3 font-medium">類型</th>
                      <th className="pb-3 font-medium">品項</th>
                      <th className="pb-3 font-medium">數量</th>
                      <th className="pb-3 font-medium">經手人</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredTransactions
                      .filter(t => {
                        if (view === 'admin-transactions') return true;
                        const category = getCategoryFromView(view);
                        return (t.category || 'nursing') === category;
                      })
                      .map(t => (
                        <tr key={t.id} className="text-sm">
                          <td className="py-4">
                            <Button 
                              variant="ghost" 
                              className="p-1 text-rose-600 hover:bg-rose-50"
                              onClick={() => handleDeleteTransaction(t.id)}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </td>
                          <td className="py-4 text-slate-500">
                            {t.timestamp ? format(t.timestamp.toDate(), 'yyyy/MM/dd HH:mm') : '-'}
                          </td>
                          <td className="py-4">
                            <Badge variant={t.type === 'in' ? 'success' : 'error'}>
                              {t.type === 'in' ? '入庫' : '出庫'}
                            </Badge>
                          </td>
                          <td className="py-4">
                            <div>
                              <p className="font-medium text-slate-900">{t.itemName}</p>
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                {t.type === 'out' && (
                                  <p className="text-[10px] font-bold text-rose-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> 出庫效期: {t.expiryDate || '未註記'}
                                  </p>
                                )}
                                {t.customerInfo && (
                                  <p className="text-[10px] font-bold text-blue-500 flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" /> 客編/(姓名): {t.customerInfo}
                                  </p>
                                )}
                                {t.doctor && (
                                  <p className="text-[10px] font-bold text-purple-600 flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" /> 負責醫師: {t.doctor}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-4 text-slate-600">{t.quantity}</td>
                          <td className="py-4 text-slate-500">{t.operatorName}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {view === 'admin-check-history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">盤點歷史紀錄</h2>
              <div className="flex items-center gap-2">
                {profile?.role === 'admin' && (
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      const csvStr = exportChecksToCsv(inventoryChecks, transactions);
                      const nowStr = format(new Date(), 'yyyyMMdd_HHmm');
                      downloadFile(csvStr, `星幸福_盤點歷史紀錄_${nowStr}.csv`, 'text/csv;charset=utf-8');
                    }}
                    title="匯出盤點歷史紀錄為 CSV"
                  >
                    <Download className="w-4 h-4" /> 匯出 CSV
                  </Button>
                )}
                <Button variant="outline" onClick={() => setView('home')}>返回首頁</Button>
              </div>
            </div>
            <Card title="盤點紀錄一覽" subtitle="所有品項盤點調整紀錄">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 text-sm border-b border-slate-100">
                      <th className="pb-3 font-medium">操作</th>
                      <th className="pb-3 font-medium">盤點時間</th>
                      <th className="pb-3 font-medium">盤點類別</th>
                      <th className="pb-3 font-medium">盤點人員</th>
                      <th className="pb-3 font-medium">備註</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredInventoryChecks.map(check => (
                      <tr key={check.id} className="text-sm">
                        <td className="py-4">
                          <div className="flex gap-2">
                             <Button 
                               variant="ghost" 
                               className="p-1 px-2 text-blue-600 hover:bg-blue-50"
                               onClick={() => setSelectedCheckForDetail(check)}
                               title="查看盤點明細"
                             >
                               <ClipboardList className="w-4 h-4" />
                             </Button>
                             <Button 
                               variant="ghost" 
                               className="p-1 text-slate-400 hover:bg-slate-50"
                               onClick={() => setEditingCheck(check)}
                             >
                               <Settings className="w-4 h-4" />
                             </Button>
                             <Button 
                               variant="ghost" 
                               className="p-1 text-rose-600 hover:bg-rose-50"
                               onClick={() => handleDeleteCheck(check.id)}
                             >
                               <XCircle className="w-4 h-4" />
                             </Button>
                          </div>
                        </td>
                        <td className="py-4 font-medium text-slate-900">{check.checkTime}</td>
                        <td className="py-4">
                           <Badge variant="secondary">
                             {check.category === 'nursing' ? '護理衛材' :
                              check.category === 'aesthetic' ? '醫美大庫' :
                              check.category === 'skincare' ? '五六診庫存' :
                              check.category === 'iv-drip' ? '點滴針劑' :
                              check.category === 'controlled' ? '管制藥物' : check.category}
                           </Badge>
                        </td>
                        <td className="py-4 text-slate-500">{check.operatorName}</td>
                        <td className="py-4 text-slate-500 max-w-xs truncate">{check.note || '-'}</td>
                      </tr>
                    ))}
                    {filteredInventoryChecks.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400">尚無盤點紀錄</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {view === 'admin-users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">人員管理</h2>
              <div className="flex gap-2">
                <Button 
                  onClick={() => { setEditingUser(null); setIsUserModalOpen(true); }}
                  className="bg-brand-primary text-white hover:bg-brand-primary/95 font-sans text-sm py-2 px-3 flex items-center gap-1.5 shadow-sm rounded-xl"
                >
                  <UserPlus className="w-4 h-4" /> 新增人員
                </Button>
                <Button variant="outline" onClick={() => setView('home')}>返回首頁</Button>
              </div>
            </div>
            <Card title="系統使用者" subtitle="權限與登入狀態">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 text-sm border-b border-slate-100">
                      <th className="pb-3 font-medium">操作</th>
                      <th className="pb-3 font-medium">姓名</th>
                      <th className="pb-3 font-medium">角色</th>
                      <th className="pb-3 font-medium">最後登入</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {users.map(u => (
                      <tr key={u.uid} className="text-sm">
                        <td className="py-4">
                          <div className="flex gap-2">
                            <Button 
                              variant="ghost" 
                              className="p-1 text-blue-600 hover:bg-blue-50"
                              onClick={() => { setEditingUser(u); setIsUserModalOpen(true); }}
                              title="重設密碼 / 修改姓名"
                            >
                              <Key className="w-4 h-4" />
                            </Button>
                            {u.approved === false && (
                              <Button 
                                variant="ghost" 
                                className="p-1 text-emerald-600 hover:bg-emerald-50 animate-pulse"
                                onClick={() => handleApproveUser(u.uid)}
                                title="核准啟用帳號"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </Button>
                            )}
                            {u.uid !== profile?.uid && u.uid !== 'admin_joy' && (
                              <Button 
                                variant="ghost" 
                                className="p-1 text-rose-600 hover:bg-rose-50"
                                onClick={() => handleDeleteUser(u.uid)}
                                title="刪除本帳號"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                              <User className="w-4 h-4 text-slate-400" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-slate-900">{u.name}</p>
                                {u.approved === false && (
                                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-sans font-medium">
                                    待審核
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 font-mono">帳號: {u.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <Badge variant={u.role === 'admin' ? 'info' : u.role === 'nurse' ? 'success' : u.role === 'sales_lead' ? 'warning' : 'secondary'}>
                            {u.role === 'admin' ? '管理者' : 
                             u.role === 'nurse' ? '護理師' :
                             u.role === 'cs' ? '客服' :
                             u.role === 'sales_lead' ? '業務組長' : '操作員'}
                          </Badge>
                        </td>
                        <td className="py-4 text-slate-500">
                          {u.lastLogin ? format(parseISO(u.lastLogin), 'yyyy/MM/dd HH:mm') : '從未登入'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* User Edit / Add Modal */}
            {isUserModalOpen && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="animate-in zoom-in-95 duration-200 w-full max-w-md">
                  <Card title={editingUser ? "修改人員資訊" : "新增人員資訊"} className="shadow-2xl">
                    <form onSubmit={handleUpdateUser} className="space-y-4">
                      {!editingUser && (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-slate-700">帳號 (登入用)</label>
                          <input 
                            name="username"
                            required
                            placeholder="請輸入登入帳號"
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">姓名</label>
                        <input 
                          name="name"
                          required
                          placeholder="請輸入員工姓名"
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                          defaultValue={editingUser?.name || ''}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">角色</label>
                        <select 
                          name="role"
                          defaultValue={editingUser?.role || 'nurse'}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          <option value="admin">管理者</option>
                          <option value="nurse">護理師</option>
                          <option value="cs">客服</option>
                          <option value="sales_lead">業務組長</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          {editingUser ? "重設密碼" : "登入密碼"}
                        </label>
                        <input 
                          name="password"
                          type="text"
                          required
                          placeholder="請輸入密碼"
                          defaultValue={editingUser?.password || ''}
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button type="button" variant="outline" className="flex-1" onClick={() => { setIsUserModalOpen(false); setEditingUser(null); }}>取消</Button>
                        <Button type="submit" className="flex-1">
                          {editingUser ? "更新資訊" : "確認新增"}
                        </Button>
                      </div>
                    </form>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'history' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">我的完整操作紀錄</h2>
              <Button variant="outline" onClick={() => setView('home')}>返回首頁</Button>
            </div>
            <Card
              extra={
                <div className="flex gap-2">
                   <Button 
                     variant={txnFilter === 'all' ? 'primary' : 'outline'} 
                     className="h-8 text-xs px-3"
                     onClick={() => setTxnFilter('all')}
                   >全部</Button>
                   <Button 
                     variant={txnFilter === 'in' ? 'primary' : 'outline'} 
                     className="h-8 text-xs px-3"
                     onClick={() => setTxnFilter('in')}
                   >最近入庫</Button>
                   <Button 
                     variant={txnFilter === 'out' ? 'primary' : 'outline'} 
                     className="h-8 text-xs px-3"
                     onClick={() => setTxnFilter('out')}
                   >最近出庫</Button>
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-slate-500 text-sm border-b border-slate-100">
                      <th className="pb-3 font-medium">日期</th>
                      <th className="pb-3 font-medium">類型</th>
                      <th className="pb-3 font-medium">品項</th>
                      <th className="pb-3 font-medium">數量</th>
                      <th className="pb-3 font-medium">出庫效期</th>
                      <th className="pb-3 font-medium">系統時間</th>
                      <th className="pb-3 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {myTransactions.map(t => (
                      <tr key={t.id} className="text-sm group">
                        <td className="py-4 text-slate-600">{t.date}</td>
                        <td className="py-4">
                          <Badge variant={t.type === 'in' ? 'success' : 'error'}>
                            {t.type === 'in' ? '入庫' : '出庫'}
                          </Badge>
                        </td>
                        <td className="py-4">
                          <div>
                            <p className="font-medium text-slate-900">{t.itemName}</p>
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              {t.customerInfo && (
                                <p className="text-[10px] text-blue-500 font-bold">客編/(姓名): {t.customerInfo}</p>
                              )}
                              {t.doctor && (
                                <p className="text-[10px] text-purple-600 font-bold">負責醫師: {t.doctor}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 text-slate-600">{t.quantity}</td>
                        <td className={cn("py-4", t.type === 'out' ? "text-rose-600 font-bold" : "text-slate-500")}>
                          {t.type === 'out' ? (t.expiryDate || '-') : '-'}
                        </td>
                        <td className="py-4 text-slate-400">
                          {t.timestamp ? format(t.timestamp.toDate(), 'HH:mm:ss') : '-'}
                        </td>
                        <td className="py-4 text-right">
                          <button 
                            onClick={() => handleDeleteTransaction(t.id)}
                            className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="刪除紀錄"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {view === 'admin-backup' && profile?.role === 'admin' && (
          <BackupManager
            inventory={inventory}
            groupedInventory={groupedInventory}
            transactions={transactions}
            inventoryChecks={inventoryChecks}
            users={users}
            profile={profile}
            db={db}
            onClose={() => setView('home')}
          />
        )}
            {/* Edit Batch Modal */}
            {editingBatch && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                 <div className="animate-in zoom-in-95 duration-200">
                   <Card title="修改批次資訊" subtitle={editingBatch.itemName} className="w-full max-w-md shadow-2xl">
                     <form onSubmit={handleUpdateBatch} className="space-y-4">
                       <div className="space-y-2">
                         <label className="text-sm font-medium text-slate-700">入庫日期</label>
                         <SmoothDateInput 
                           name="date" 
                           required 
                           value={editingBatch.latestInDate === '-' ? format(new Date(), 'yyyy-MM-dd') : editingBatch.latestInDate}
                           onChange={(val) => setEditingBatch({ ...editingBatch, latestInDate: val })}
                           className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono" 
                         />
                       </div>
                       <div className="space-y-2">
                         <div className="flex justify-between items-center">
                           <label className="text-sm font-medium text-slate-700">到期日</label>
                           <button
                             type="button"
                             onClick={() => setEditBatchNoExpiry(!editBatchNoExpiry)}
                             className={cn(
                               "text-xs px-2.5 py-1.5 rounded-lg border font-medium flex items-center gap-1.5 transition-all outline-none",
                               editBatchNoExpiry 
                                 ? "bg-slate-200 text-slate-600 border-slate-300" 
                                 : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                             )}
                           >
                             <input 
                               type="checkbox" 
                               checked={editBatchNoExpiry} 
                               onChange={() => {}} // Controlled by button trigger
                               className="rounded border-slate-300 text-brand-primary focus:ring-blue-500 cursor-pointer" 
                             />
                             <span>無效期</span>
                           </button>
                         </div>
                         <SmoothDateInput 
                           name="expiryDate" 
                           required={!editBatchNoExpiry}
                           disabled={editBatchNoExpiry}
                           value={editBatchNoExpiry ? '' : (editingBatch.expiryDate === '-' ? '' : editingBatch.expiryDate)}
                           onChange={(val) => setEditingBatch({ ...editingBatch, expiryDate: val })}
                           className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono" 
                         />
                       </div>
                       <div className="space-y-2">
                         <label className="text-sm font-medium text-slate-700">批次剩餘數量</label>
                         <input 
                           name="quantity" 
                           type="number"
                           min="0"
                           required
                           value={editingBatch.quantity !== undefined ? editingBatch.quantity : 0}
                           onChange={(e) => setEditingBatch({ ...editingBatch, quantity: Math.max(0, Number(e.target.value)) })}
                           className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono" 
                         />
                       </div>
                       <div className="flex flex-col gap-3 pt-4 font-serif">
                         <div className="flex gap-4">
                           <Button type="button" variant="outline" className="flex-1 font-sans" onClick={() => setEditingBatch(null)}>取消</Button>
                           <Button type="submit" className="flex-1 whitespace-nowrap font-sans" disabled={submitting}>
                             {submitting ? "正在儲存..." : "確認修改"}
                           </Button>
                         </div>
                         <Button 
                           type="button" 
                           variant="outline" 
                           className="w-full text-rose-600 border-rose-200 hover:bg-rose-50 gap-2 font-sans"
                           onClick={() => handleDeleteBatch(editingBatch.itemId, editingBatch.originalExpiryDate)}
                         >
                           <X className="w-4 h-4" /> 刪除此批次
                         </Button>
                       </div>
                     </form>
                   </Card>
                 </div>
              </div>
            )}

            {/* Edit Check Note Modal */}
            {editingCheck && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                 <div className="animate-in zoom-in-95 duration-200">
                   <Card title="修改盤點備註" subtitle={editingCheck.checkTime} className="w-full max-w-md shadow-2xl">
                     <form onSubmit={handleUpdateCheck} className="space-y-4">
                       <div className="space-y-2">
                         <label className="text-sm font-medium text-slate-700">盤點備註</label>
                         <textarea 
                           name="note" 
                           required 
                           defaultValue={editingCheck.note || ''}
                           className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[120px]" 
                         />
                       </div>
                       <div className="flex gap-4 pt-4">
                         <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingCheck(null)}>取消</Button>
                         <Button type="submit" className="flex-1 whitespace-nowrap">確認修改</Button>
                       </div>
                     </form>
                   </Card>
                 </div>
              </div>
            )}

            {/* View Check Detail Modal */}
            {selectedCheckForDetail && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="animate-in zoom-in-95 duration-200 w-full max-w-4xl">
                  <Card 
                    title={`盤點明細 - ${selectedCheckForDetail.checkTime}`} 
                    subtitle={`盤點人員: ${selectedCheckForDetail.operatorName} | 類別: ${
                      selectedCheckForDetail.category === 'nursing' ? '護理衛材' :
                      selectedCheckForDetail.category === 'aesthetic' ? '醫美大庫' :
                      selectedCheckForDetail.category === 'skincare' ? '五六診庫存' :
                      selectedCheckForDetail.category === 'iv-drip' ? '點滴針劑' :
                      selectedCheckForDetail.category === 'controlled' ? '管制藥物' : selectedCheckForDetail.category
                    }`}
                    className="shadow-2xl max-h-[85vh] flex flex-col"
                  >
                    <div className="overflow-y-auto mb-6">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-slate-500 text-xs border-b border-slate-100">
                            <th className="pb-3 font-medium">品項名稱</th>
                            <th className="pb-3 font-medium">異動類型</th>
                            <th className="pb-3 font-medium text-center">調整數量</th>
                            <th className="pb-3 font-medium">備註</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {transactions
                            .filter(t => t.checkId === selectedCheckForDetail.id)
                            .map(t => (
                              <tr key={t.id} className="text-sm">
                                <td className="py-4">
                                  <p className="font-medium text-slate-900">{t.itemName}</p>
                                  <p className="text-[10px] text-slate-400">{t.spec}</p>
                                </td>
                                <td className="py-4">
                                  <Badge variant={t.type === 'in' ? 'success' : 'error'}>
                                    {t.type === 'in' ? '多出(盤盈)' : '缺少(盤虧)'}
                                  </Badge>
                                </td>
                                <td className="py-4 text-center font-bold">
                                  {t.type === 'in' ? `+${t.quantity}` : `-${t.quantity}`}
                                </td>
                                <td className="py-4 text-slate-500 text-xs">{t.remark}</td>
                              </tr>
                            ))}
                          {transactions.filter(t => t.checkId === selectedCheckForDetail.id).length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-12 text-center text-slate-400">
                                <div className="flex flex-col items-center gap-2">
                                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                                  <p>此次盤點所有品項皆相符，無庫存調整。</p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {selectedCheckForDetail.note && (
                      <div className="p-4 bg-slate-50 rounded-xl mb-6 border border-slate-100">
                        <p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">盤點總備註</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedCheckForDetail.note}</p>
                      </div>
                    )}
                    <div className="flex justify-end pt-4 border-t border-slate-100">
                      <Button onClick={() => setSelectedCheckForDetail(null)} className="px-12 font-serif tracking-widest">
                        關閉視窗
                      </Button>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {/* Self Edit Profile Modal */}
            {isSelfEditModalOpen && profile && (
              <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="animate-in zoom-in-95 duration-200 w-full max-w-md">
                  <Card title="修改個人名稱與密碼" subtitle="請更新您的姓名與登入密碼" className="shadow-2xl">
                    <form onSubmit={handleUpdateSelfProfile} className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">登入帳號 (不可修改)</label>
                        <input 
                          type="text"
                          disabled
                          value={profile.username}
                          className="w-full p-2.5 bg-slate-100 border border-slate-200 text-slate-400 rounded-lg outline-none cursor-not-allowed font-mono"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">姓名</label>
                        <input 
                          name="selfName"
                          type="text"
                          required
                          defaultValue={profile.name}
                          placeholder="請輸入姓名"
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">登入密碼</label>
                        <input 
                          name="selfPassword"
                          type="text"
                          required
                          defaultValue={profile.password || ''}
                          placeholder="請輸入登入新密碼"
                          className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button type="button" variant="outline" className="flex-1" onClick={() => setIsSelfEditModalOpen(false)}>取消</Button>
                        <Button type="submit" className="flex-1 bg-brand-primary text-white hover:bg-brand-primary/95">確認修改</Button>
                      </div>
                    </form>
                  </Card>
                </div>
              </div>
            )}

        {confirmModal.isOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 text-rose-600 mb-4">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-lg font-bold">{confirmModal.title}</h3>
              </div>
              <p className="text-slate-600 mb-6 leading-relaxed">
                {confirmModal.message}
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="ghost" 
                  className="flex-1" 
                  onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                >
                  取消
                </Button>
                <Button 
                  className="flex-1 bg-rose-600 hover:bg-rose-700" 
                  onClick={confirmModal.onConfirm}
                >
                  確認刪除
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white/50 border-t border-brand-accent py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-brand-muted text-[10px] uppercase tracking-[0.2em]">
          <p>© 2026 星幸福庫存管理系統 - 專業版</p>
        </div>
      </footer>
    </div>
  );
}
