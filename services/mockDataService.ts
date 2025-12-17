
import { User, UserRole, DashboardStats, FMBRecord, KMLRecord, ARegisterFile, RecycleBinRecord, DynamicRecord, ModuleType, ARegisterSummary, AttendanceRecord } from '../types';
import { db, storage } from './firebase';
import { supabase, isSupabaseConfigured } from './supabase';
import { 
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, writeBatch, getDoc, onSnapshot 
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import axios from 'axios';
import { API_BASE } from '../config';

// --- INDEXED DB HELPER (Offline Fallback) ---
const DB_NAME = 'RythuPortalDB';
const DB_VERSION = 4;
const STORES = {
  FILES: 'files',
  RECORDS: 'records',
  FMB: 'fmb',
  KML: 'kml',
  RECYCLE_BIN: 'recycle_bin',
  SUMMARIES: 'summaries',
  ATTENDANCE: 'attendance'
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.FILES)) {
        const store = db.createObjectStore(STORES.FILES, { keyPath: 'id' });
        store.createIndex('module', 'module', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.RECORDS)) {
        const store = db.createObjectStore(STORES.RECORDS, { keyPath: 'id' });
        store.createIndex('fileId', 'fileId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.FMB)) db.createObjectStore(STORES.FMB, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.KML)) db.createObjectStore(STORES.KML, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.RECYCLE_BIN)) db.createObjectStore(STORES.RECYCLE_BIN, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.SUMMARIES)) db.createObjectStore(STORES.SUMMARIES, { keyPath: 'fileId' });
      if (!db.objectStoreNames.contains(STORES.ATTENDANCE)) {
          const store = db.createObjectStore(STORES.ATTENDANCE, { keyPath: 'id' });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('date', 'date', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const dbOp = async <T>(storeName: string, mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = callback(store);
        tx.oncomplete = () => { if (request && 'result' in request) resolve(request.result); else resolve(undefined as unknown as T); };
        tx.onerror = () => reject(tx.error);
        if (request) request.onerror = () => reject(request.error);
    });
};

const dbGetAll = async <T>(storeName: string): Promise<T[]> => {
    return dbOp<T[]>(storeName, 'readonly', store => store.getAll());
};

// --- HELPER: CALCULATE TOTAL EXTENT ---
const calculateARegisterTotal = (record: DynamicRecord): string => {
    const EXTENT_KEYS = [
        'Patta Dry', 'Patta Metta', 'Dry Patta', 'Metta', 'మెట్ట',
        'Patta Wet', 'Patta Tari', 'Wet Patta', 'Tari', 'తరి',
        'Inam Dry', 'Inam Metta', 'Inam Wet', 'Inam Tari',
        'Dotted Dry', 'Chukkala Metta', 'Dotted Wet', 'Chukkala Tari',
        'UAW', 'Unassessed', 'Poramboke', 'Govt', 'Government'
    ];
    let total = 0;
    Object.keys(record).forEach(key => {
        if(['id', 'fileId', 'is_new', 'is_updated', 'Total Extent'].includes(key)) return;
        if (EXTENT_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
            const val = record[key];
            if(val) {
                const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
                if(!isNaN(num)) total += num;
            }
        }
    });
    return total.toFixed(2);
};

// --- IMAGE UPLOAD HELPER ---
const uploadBase64ToStorage = async (base64String: string, path: string): Promise<string> => {
    if (!base64String || (!base64String.startsWith('data:image') && !base64String.startsWith('data:application'))) return base64String;
    if (isSupabaseConfigured() && supabase) { return base64String; }
    if (isOfflineMode || !storage) return base64String;
    try {
        const storageRef = ref(storage, path);
        await uploadString(storageRef, base64String, 'data_url');
        return await getDownloadURL(storageRef);
    } catch (e) {
        console.warn("Cloud Upload Failed (Offline Mode):", e);
        return base64String; 
    }
};

const validatePassword = (password: string): { isValid: boolean, message?: string } => {
  if (password.length < 8) return { isValid: false, message: "Password must be at least 8 characters long." };
  if (!/[A-Z]/.test(password)) return { isValid: false, message: "Password must contain at least one uppercase letter." };
  if (!/[a-z]/.test(password)) return { isValid: false, message: "Password must contain at least one lowercase letter." };
  if (!/\d/.test(password)) return { isValid: false, message: "Password must contain at least one digit." };
  if (!/[@$!%*?&]/.test(password)) return { isValid: false, message: "Password must contain at least one special character (@$!%*?&)." };
  return { isValid: true };
};

const chunkArray = <T>(array: T[], size: number): T[][] => {
    const chunked: T[][] = [];
    let index = 0;
    while (index < array.length) {
        chunked.push(array.slice(index, size + index));
        index += size;
    }
    return chunked;
};

// --- HYBRID DATA SERVICE CONFIGURATION ---
let isOfflineMode = !db && !isSupabaseConfigured();

const execute = async <T>(
    supabaseFn: () => Promise<T>,
    firebaseFn: () => Promise<T>,
    localFn: () => Promise<T>,
    apiFallbackFn?: () => Promise<T | null>
): Promise<T> => {
    if (isSupabaseConfigured()) {
        try {
            return await supabaseFn();
        } catch (e) {
            console.warn("Supabase Error, falling back...", e);
        }
    }
    if (db) {
        try {
            return await firebaseFn();
        } catch (error: any) {
            console.warn(`Firebase Error (${error.code}). Attempting Fallback.`);
        }
    }
    if (apiFallbackFn && API_BASE && !API_BASE.includes("localhost")) {
        try {
            const apiResult = await apiFallbackFn();
            if (apiResult !== null) return apiResult;
        } catch (e) {
            console.warn("API Sync Error:", e);
        }
    }
    return localFn();
};

export const DataService = {
  isOffline: () => isOfflineMode,

  initialize: async () => {
      if (isSupabaseConfigured() && supabase) {
          console.log("✅ Connected to Supabase");
          return;
      }
      if (!db) {
          console.log("Initializing Offline Mode (IndexedDB).");
          isOfflineMode = true;
          DataService.initializeLocal();
          return;
      }
      try {
          const usersRef = collection(db, 'users');
          const adminQ = query(usersRef, where('email', '==', 'sanju.pavan11@gmail.com'));
          const snapshot = await getDocs(adminQ);
          if (snapshot.empty) {
              const adminUser: User = { id: 'admin_1', name: 'Sanjeeva Naik', email: 'sanju.pavan11@gmail.com', mobile: '9999999999', role: UserRole.ADMIN, password: 'Sanju@12', createdDate: new Date().toISOString(), status: 'Active', dob: '1990-01-01' };
              await setDoc(doc(db, 'users', adminUser.id), adminUser);
          }
      } catch (e) {
          isOfflineMode = true;
          DataService.initializeLocal();
      }
  },

  initializeLocal: () => {
      const usersStr = localStorage.getItem('rythu_samachar_users');
      let users: User[] = usersStr ? JSON.parse(usersStr) : [];
      if (!users.find(u => u.email === 'sanju.pavan11@gmail.com')) {
          const adminUser: User = { id: 'admin_1', name: 'Sanjeeva Naik', email: 'sanju.pavan11@gmail.com', mobile: '9999999999', role: UserRole.ADMIN, password: 'Sanju@12', createdDate: new Date().toISOString(), status: 'Active' };
          users.push(adminUser);
          localStorage.setItem('rythu_samachar_users', JSON.stringify(users));
      }
  },

  getAppConfig: () => {
      const stored = localStorage.getItem('rythu_app_config');
      return stored ? JSON.parse(stored) : { logo: '/ryathu.jpg' };
  },

  // --- RECYCLE BIN & SOFT DELETE ---
  _moveToRecycleBin: async (item: any, sourceModule: string, deletedBy: string) => {
      const recycleRecord: RecycleBinRecord = {
          ...item,
          deletedAt: new Date().toISOString(),
          deletedBy,
          originalFileId: item.fileId || item.id,
          sourceModule,
          originalData: item
      };
      
      return execute(
          async () => { // Supabase
              try {
                  await supabase!.from('recycle_bin').insert({
                      id: recycleRecord.id,
                      source_module: sourceModule,
                      deleted_by: deletedBy,
                      deleted_at: recycleRecord.deletedAt,
                      data: item,
                      original_file_id: recycleRecord.originalFileId
                  });
              } catch(e) { console.warn("Recycle Bin Insert Failed", e); }
          },
          async () => { await setDoc(doc(db, 'recycle_bin', recycleRecord.id), recycleRecord); },
          async () => { await dbOp(STORES.RECYCLE_BIN, 'readwrite', s => s.put(recycleRecord)); }
      );
  },

  softDeleteRecord: async (module: ModuleType, id: string, by: string): Promise<boolean> => {
      try {
          const records = await DataService.getModuleRecords(module);
          const record = records.find(r => r.id === id);
          if (!record) return false;

          await DataService._moveToRecycleBin(record, module, by);

          return await execute(
              async () => { const { error } = await supabase!.from('records').delete().eq('id', id); return !error; },
              async () => { await deleteDoc(doc(db, 'records', id)); return true; },
              async () => { await dbOp(STORES.RECORDS, 'readwrite', s => s.delete(id)); return true; }
          );
      } catch (e) {
          console.error("Soft Delete Failed", e);
          return false;
      }
  },

  softDeleteModuleFile: async (module: ModuleType, id: string, by: string): Promise<boolean> => {
      try {
          const files = await DataService.getModuleFiles(module);
          const file = files.find(f => f.id === id);
          if (!file) return false;

          await DataService._moveToRecycleBin(file, `${module}_FILE`, by);

          return await execute(
              async () => { 
                  const { error } = await supabase!.from('files').delete().eq('id', id); 
                  return !error; 
              },
              async () => { 
                  await deleteDoc(doc(db, 'files', id));
                  const q = query(collection(db, 'records'), where('fileId', '==', id));
                  const snap = await getDocs(q);
                  const batch = writeBatch(db);
                  snap.docs.forEach(d => batch.delete(d.ref));
                  await batch.commit();
                  return true;
              },
              async () => {
                  await dbOp(STORES.FILES, 'readwrite', s => s.delete(id));
                  const allRecs = await dbGetAll<DynamicRecord>(STORES.RECORDS);
                  const toDelete = allRecs.filter(r => r.fileId === id);
                  const db = await openDB();
                  const tx = db.transaction(STORES.RECORDS, 'readwrite');
                  const store = tx.objectStore(STORES.RECORDS);
                  toDelete.forEach(r => store.delete(r.id));
                  return new Promise<boolean>(r => { tx.oncomplete = () => r(true); });
              }
          );
      } catch(e) { console.error("File Delete Failed", e); return false; }
  },

  getRecycleBin: async (): Promise<RecycleBinRecord[]> => {
      return execute(
          async () => { 
              try {
                  const { data } = await supabase!.from('recycle_bin').select('*').order('deleted_at', { ascending: false });
                  return data ? data.map((d: any) => ({ ...d.data, id: d.id, deletedAt: d.deleted_at, deletedBy: d.deleted_by, sourceModule: d.source_module, originalData: d.data })) : [];
              } catch { return []; }
          },
          async () => {
              const s = await getDocs(collection(db, 'recycle_bin'));
              return s.docs.map(d => d.data() as RecycleBinRecord).sort((a,b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
          },
          async () => {
              const all = await dbGetAll<RecycleBinRecord>(STORES.RECYCLE_BIN);
              return all.sort((a,b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
          }
      );
  },

  restoreRecycleBinRecord: async (id: string): Promise<boolean> => {
      const bin = await DataService.getRecycleBin();
      const item = bin.find(r => r.id === id);
      if (!item || !item.originalData) return false;

      const { sourceModule, originalData } = item;

      if (sourceModule === 'FMB') await DataService.saveFMB(originalData);
      else if (sourceModule === 'KML') await DataService.saveKML(originalData);
      else if (sourceModule.endsWith('_FILE')) {
          const mod = sourceModule.replace('_FILE', '') as ModuleType;
          await DataService.saveModuleFile(mod, originalData);
      } else {
          const mod = sourceModule as ModuleType;
          await DataService.saveModuleRecords(mod, [originalData]);
      }

      await DataService.permanentDeleteRecycleBinRecord(id);
      return true;
  },

  permanentDeleteRecycleBinRecord: async (id: string): Promise<boolean> => {
      return execute(
          async () => { await supabase!.from('recycle_bin').delete().eq('id', id); return true; },
          async () => { await deleteDoc(doc(db, 'recycle_bin', id)); return true; },
          async () => { await dbOp(STORES.RECYCLE_BIN, 'readwrite', s => s.delete(id)); return true; }
      );
  },

  emptyRecycleBin: async () => {
      return execute(
          async () => { await supabase!.from('recycle_bin').delete().neq('id', '0'); },
          async () => { 
              const s = await getDocs(collection(db, 'recycle_bin'));
              const batch = writeBatch(db);
              s.docs.forEach(d => batch.delete(d.ref));
              await batch.commit();
          },
          async () => { 
              const db = await openDB();
              const tx = db.transaction(STORES.RECYCLE_BIN, 'readwrite');
              tx.objectStore(STORES.RECYCLE_BIN).clear();
          }
      );
  },

  // --- ATTENDANCE ---
  markAttendance: async (r: AttendanceRecord) => {
      return execute(
          async () => { 
              const { error } = await supabase!.from('attendance').upsert({
                  id: r.id, user_id: r.userId, user_name: r.userName, date: r.date, timestamp: r.timestamp,
                  latitude: r.latitude, longitude: r.longitude, accuracy: r.accuracy, address: r.address,
                  selfie_url: r.selfieUrl, device_info: r.deviceInfo, browser: r.browser, jio_tag_status: r.jioTagStatus, map_url: r.mapUrl
              });
              if(error) throw error;
              return true;
          },
          async () => { await setDoc(doc(db, 'attendance', r.id), r); return true; },
          async () => { await dbOp(STORES.ATTENDANCE, 'readwrite', s => s.put(r)); return true; }
      );
  },

  getTodayAttendance: async (userId: string): Promise<boolean> => {
      // Use LOCAL date string YYYY-MM-DD for checking today
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      const today = new Date(now.getTime() - offset).toISOString().split('T')[0];

      return execute(
          async () => {
              const { data } = await supabase!.from('attendance').select('id').eq('user_id', userId).eq('date', today);
              return !!data && data.length > 0;
          },
          async () => {
              const q = query(collection(db, 'attendance'), where('userId', '==', userId), where('date', '==', today));
              const s = await getDocs(q);
              return !s.empty;
          },
          async () => {
              const all = await dbGetAll<AttendanceRecord>(STORES.ATTENDANCE);
              return all.some(r => r.userId === userId && r.date === today);
          }
      );
  },

  getAllAttendance: async (): Promise<AttendanceRecord[]> => {
      // Ensure we have users loaded to resolve names if missing in log
      let users: User[] = [];
      try { users = await DataService.getAllUsers(); } catch (e) { }
      const userMap = new Map(users.map(u => [u.id, u.name]));

      return execute(
          async () => {
              const { data, error } = await supabase!.from('attendance').select('*');
              if (error) throw error;
              return data ? data.map((d:any) => ({
                  id: d.id, 
                  userId: d.user_id, // Ensure correct mapping from DB snake_case to App camelCase
                  userName: d.user_name || userMap.get(d.user_id) || 'Unknown User', 
                  date: d.date, 
                  timestamp: d.timestamp,
                  latitude: d.latitude, 
                  longitude: d.longitude, 
                  accuracy: d.accuracy, 
                  address: d.address,
                  selfieUrl: d.selfie_url, 
                  deviceInfo: d.device_info, 
                  browser: d.browser, 
                  jioTagStatus: d.jio_tag_status, 
                  mapUrl: d.map_url
              })) : [];
          },
          async () => {
              const s = await getDocs(collection(db, 'attendance'));
              return s.docs.map(d => {
                  const data = d.data() as AttendanceRecord;
                  if (!data.userName) data.userName = userMap.get(data.userId) || 'Unknown User';
                  return data;
              });
          },
          async () => { 
              const records = await dbGetAll<AttendanceRecord>(STORES.ATTENDANCE);
              return records.map(r => ({
                  ...r,
                  userName: r.userName || userMap.get(r.userId) || 'Unknown User'
              }));
          }
      );
  },

  getStats: async (): Promise<DashboardStats> => {
      try {
          const [files, records, fmb] = await Promise.all([
              DataService.getModuleFiles('AREGISTER'),
              DataService.getModuleRecords('AREGISTER'),
              DataService.getFMB()
          ]);
          
          let totalAcres = 0;
          records.forEach(r => {
              if(r['Total Extent']) totalAcres += parseFloat(String(r['Total Extent']).replace(/[^0-9.]/g, '') || '0');
          });

          return {
              totalEntries: records.length,
              totalAcres: parseFloat(totalAcres.toFixed(2)),
              verifiedCount: records.filter(r => r.is_modified).length,
              teamDistribution: [],
              totalARegister: files.length,
              totalFMB: fmb.length,
              comparisonIssues: 0
          };
      } catch (e) {
          return {
              totalEntries: 0, totalAcres: 0, verifiedCount: 0, teamDistribution: [], totalARegister: 0, totalFMB: 0, comparisonIssues: 0
          };
      }
  },

  // --- MODULE RECORDS (Re-exporting existing implementation for context) ---
  getModuleFiles: async (module: ModuleType): Promise<ARegisterFile[]> => {
      return execute(
          async () => { 
              const { data } = await supabase!.from('files').select('*').eq('module', module).order('upload_date', { ascending: false });
              return data ? data.map((f: any) => ({ id: f.id, fileName: f.file_name, module: f.module, uploadDate: f.upload_date ? new Date(f.upload_date).toLocaleString() : '', rowCount: f.row_count, columns: f.columns, metadata: f.metadata })) : [];
          },
          async () => { 
              const q = query(collection(db, 'files'), where('module', '==', module));
              const snapshot = await getDocs(q);
              return snapshot.docs.map(d => d.data() as ARegisterFile).sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
          },
          async () => { 
              const allFiles = await dbGetAll<ARegisterFile>(STORES.FILES);
              return allFiles.filter(f => f.module === module).sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
          }
      );
  },

  saveModuleFile: async (module: ModuleType, file: ARegisterFile) => {
      return execute(
          async () => { await supabase!.from('files').upsert({ id: file.id, file_name: file.fileName, module, upload_date: new Date().toISOString(), row_count: file.rowCount, columns: file.columns, metadata: file.metadata }); },
          async () => { await setDoc(doc(db, 'files', file.id), { ...file, module }); },
          async () => { await dbOp(STORES.FILES, 'readwrite', store => store.put({ ...file, module })); }
      );
  },

  updateModuleFileColumns: async (module: ModuleType, fileId: string, newColumns: string[]) => {
      return execute(
          async () => { await supabase!.from('files').update({ columns: newColumns }).eq('id', fileId); },
          async () => { await updateDoc(doc(db, 'files', fileId), { columns: newColumns }); },
          async () => { const files = await dbGetAll<ARegisterFile>(STORES.FILES); const file = files.find(f => f.id === fileId); if (file) { file.columns = newColumns; await dbOp(STORES.FILES, 'readwrite', store => store.put(file)); } }
      );
  },

  getModuleRecords: async (module: ModuleType, fileId?: string): Promise<DynamicRecord[]> => {
      const process = (recs: DynamicRecord[]) => module === 'AREGISTER' ? recs.map(r => ({ ...r, 'Total Extent': calculateARegisterTotal(r) })) : recs;
      return execute(
          async () => {
              let query = supabase!.from('records').select('*').eq('module', module).limit(10000);
              if (fileId) query = query.eq('file_id', fileId);
              const { data } = await query;
              const records = data ? data.map((r: any) => ({ ...r.data, id: r.id, fileId: r.file_id, module: r.module, imageUrl: r.image_url, createdBy: r.created_by, updatedBy: r.updated_by, createdDate: r.created_at, updatedDate: r.updated_at, is_new: r.is_new, is_modified: r.is_modified, is_highlighted: r.is_highlighted })) : [];
              return process(records);
          },
          async () => {
              if (fileId) {
                  const q = query(collection(db, 'records'), where('fileId', '==', fileId));
                  const snapshot = await getDocs(q);
                  return process(snapshot.docs.map(d => d.data() as DynamicRecord));
              } else {
                  const q = query(collection(db, 'records'), where('module', '==', module));
                  const snapshot = await getDocs(q);
                  return process(snapshot.docs.map(d => d.data() as DynamicRecord));
              }
          },
          async () => {
              if (fileId) {
                  const db = await openDB();
                  const recs = await new Promise<DynamicRecord[]>((resolve) => { const tx = db.transaction(STORES.RECORDS, 'readonly'); const index = tx.objectStore(STORES.RECORDS).index('fileId'); index.getAll(fileId).onsuccess = (e: any) => resolve(e.target.result); });
                  return process(recs);
              } else {
                  const all = await dbGetAll<DynamicRecord>(STORES.RECORDS);
                  return process(all.filter(r => r.module === module));
              }
          }
      );
  },

  saveModuleRecords: async (module: ModuleType, newRecords: DynamicRecord[]) => {
      return execute(
          async () => {
              const recordsPayload = newRecords.map(r => {
                  const { id, fileId, module: m, imageUrl, createdBy, updatedBy, createdDate, updatedDate, is_new, is_modified, is_highlighted, ...jsonData } = r;
                  return { id, file_id: fileId, module, data: jsonData, image_url: imageUrl, created_by: createdBy, updated_by: updatedBy, created_at: createdDate ? new Date(createdDate).toISOString() : new Date().toISOString(), updated_at: updatedDate ? new Date(updatedDate).toISOString() : new Date().toISOString(), is_new: is_new||0, is_modified: is_modified||0, is_highlighted: is_highlighted||0 };
              });
              const chunks = chunkArray(recordsPayload, 100);
              for (const chunk of chunks) await supabase!.from('records').upsert(chunk);
          },
          async () => {
              const chunks = chunkArray(newRecords, 400);
              for (const chunk of chunks) {
                  const batch = writeBatch(db);
                  chunk.forEach(r => batch.set(doc(db, 'records', r.id), { ...r, module }, { merge: true }));
                  await batch.commit();
              }
          },
          async () => {
              const db = await openDB();
              const tx = db.transaction(STORES.RECORDS, 'readwrite');
              const store = tx.objectStore(STORES.RECORDS);
              newRecords.forEach(r => store.put({ ...r, module }));
              return new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
          }
      );
  },

  clearModuleModifiedFlags: async (module: ModuleType): Promise<boolean> => {
      return execute(
          async () => { await supabase!.from('records').update({ is_highlighted: 0, is_modified: 0 }).eq('module', module); return true; },
          async () => {
              const records = await DataService.getModuleRecords(module);
              const batch = writeBatch(db);
              records.forEach(r => batch.update(doc(db, 'records', r.id), { is_highlighted: 0, is_modified: 0 }));
              await batch.commit();
              return true;
          },
          async () => {
              const records = await DataService.getModuleRecords(module);
              const updated = records.map(r => ({ ...r, is_highlighted: 0, is_modified: 0 }));
              await DataService.saveModuleRecords(module, updated);
              return true;
          }
      );
  },

  subscribeToFiles: (module: ModuleType, callback: (files: ARegisterFile[]) => void) => {
      if (isSupabaseConfigured() && supabase) {
          const fetch = async () => {
              const { data } = await supabase.from('files').select('*').eq('module', module).order('upload_date', {ascending: false});
              if(data) callback(data.map((f: any) => ({ id: f.id, fileName: f.file_name, module: f.module, uploadDate: f.upload_date ? new Date(f.upload_date).toLocaleString() : '', rowCount: f.row_count, columns: f.columns, metadata: f.metadata })));
          };
          fetch();
          const channel = supabase.channel('realtime_files').on('postgres_changes', { event: '*', schema: 'public', table: 'files', filter: `module=eq.${module}` }, fetch).subscribe();
          return () => { supabase.removeChannel(channel); };
      }
      if(db) {
          const q = query(collection(db, 'files'), where('module', '==', module));
          return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as ARegisterFile).sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())));
      }
      const interval = setInterval(async () => { callback(await DataService.getModuleFiles(module)); }, 5000);
      DataService.getModuleFiles(module).then(callback);
      return () => clearInterval(interval);
  },

  subscribeToModuleRecords: (module: ModuleType, fileId: string | undefined, callback: (data: DynamicRecord[]) => void) => {
      if (isSupabaseConfigured() && supabase) {
          let query = supabase.from('records').select('*').eq('module', module).limit(10000);
          if (fileId) query = query.eq('file_id', fileId);
          const fetch = async () => {
              const { data } = await query;
              if (data) callback(data.map((r: any) => ({ ...r.data, id: r.id, fileId: r.file_id, imageUrl: r.image_url, ...r })));
          };
          fetch();
          const channel = supabase.channel('realtime_records').on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `module=eq.${module}` }, fetch).subscribe();
          return () => { supabase.removeChannel(channel); };
      }
      if (db) {
          let q = fileId ? query(collection(db, 'records'), where('fileId', '==', fileId)) : query(collection(db, 'records'), where('module', '==', module));
          return onSnapshot(q, (snap) => {
              let recs = snap.docs.map(d => d.data() as DynamicRecord);
              if (module === 'AREGISTER') recs = recs.map(r => ({ ...r, 'Total Extent': calculateARegisterTotal(r) }));
              callback(recs);
          });
      }
      const interval = setInterval(async () => { callback(await DataService.getModuleRecords(module, fileId)); }, 5000);
      DataService.getModuleRecords(module, fileId).then(callback);
      return () => clearInterval(interval);
  },

  // --- FMB, KML, USERS ---
  getFMB: async () => execute(
      async () => { 
          const { data } = await supabase!.from('fmb').select('*');
          return data ? data.map((d: any) => ({ id: d.id, surveyNo: d.survey_no, village: d.village, sketchUrl: d.sketch_url, lastUpdated: d.last_updated, fileType: d.file_type })) : [];
      },
      async () => { const s = await getDocs(collection(db, 'fmb')); return s.docs.map(d => d.data() as FMBRecord); },
      async () => { return dbGetAll<FMBRecord>(STORES.FMB); }
  ),

  saveFMB: async (r: FMBRecord) => execute(
      async () => { await supabase!.from('fmb').upsert({ id: r.id, survey_no: r.surveyNo, village: r.village, sketch_url: r.sketchUrl, last_updated: r.lastUpdated, file_type: r.fileType }); },
      async () => { await setDoc(doc(db, 'fmb', r.id), r); },
      async () => { await dbOp(STORES.FMB, 'readwrite', s => s.put(r)); }
  ),

  importFMB: async (records: FMBRecord[]) => execute(
      async () => { 
          const chunks = chunkArray(records.map(r => ({ id: r.id, survey_no: r.surveyNo, village: r.village, sketch_url: r.sketchUrl, last_updated: r.lastUpdated, file_type: r.fileType })), 100);
          for(const c of chunks) await supabase!.from('fmb').upsert(c);
      },
      async () => { const batch = writeBatch(db); records.forEach(r => batch.set(doc(db, 'fmb', r.id), r)); await batch.commit(); },
      async () => { const db = await openDB(); const tx = db.transaction(STORES.FMB, 'readwrite'); records.forEach(r => tx.objectStore(STORES.FMB).put(r)); }
  ),

  getKML: async () => execute(
      async () => { 
          const { data } = await supabase!.from('kml').select('*');
          return data ? data.map((d: any) => ({ id: d.id, fileName: d.file_name, uploadedBy: d.uploaded_by, uploadDate: d.upload_date, size: d.size, url: d.url, googleEarthLink: d.google_earth_link, latitude: d.latitude, longitude: d.longitude })) : [];
      },
      async () => { const s = await getDocs(collection(db, 'kml')); return s.docs.map(d => d.data() as KMLRecord); },
      async () => { return dbGetAll<KMLRecord>(STORES.KML); }
  ),

  saveKML: async (r: KMLRecord) => execute(
      async () => { await supabase!.from('kml').upsert({ id: r.id, file_name: r.fileName, uploaded_by: r.uploadedBy, upload_date: r.uploadDate, size: r.size, url: r.url, google_earth_link: r.googleEarthLink, latitude: r.latitude, longitude: r.longitude }); },
      async () => { await setDoc(doc(db, 'kml', r.id), r); },
      async () => { await dbOp(STORES.KML, 'readwrite', s => s.put(r)); }
  ),

  softDeleteFMB: async (id: string, by: string) => {
      try {
          const recs = await DataService.getFMB();
          const r = recs.find(d => d.id === id);
          if (!r) return false;
          await DataService._moveToRecycleBin(r, 'FMB', by);
          return await execute(
              async () => { const { error } = await supabase!.from('fmb').delete().eq('id', id); return !error; },
              async () => { await deleteDoc(doc(db, 'fmb', id)); return true; },
              async () => { await dbOp(STORES.FMB, 'readwrite', s => s.delete(id)); return true; }
          );
      } catch (e) { return false; }
  },

  softDeleteKML: async (id: string, by: string) => {
      try {
          const recs = await DataService.getKML();
          const r = recs.find(d => d.id === id);
          if (!r) return false;
          await DataService._moveToRecycleBin(r, 'KML', by);
          return await execute(
              async () => { const { error } = await supabase!.from('kml').delete().eq('id', id); return !error; },
              async () => { await deleteDoc(doc(db, 'kml', id)); return true; },
              async () => { await dbOp(STORES.KML, 'readwrite', s => s.delete(id)); return true; }
          );
      } catch (e) { return false; }
  },

  getARegisterSummary: async (fid: string): Promise<ARegisterSummary | undefined> => undefined,
  saveARegisterSummary: async (s: ARegisterSummary) => {},

  fetchUsers: async (): Promise<User[]> => execute(
      async () => { const { data } = await supabase!.from('users').select('*'); const u = data ? data.map((u: any) => ({ id: u.id, name: u.name, email: u.email, mobile: u.mobile, role: u.role, password: u.password, status: u.status, createdDate: u.created_at, lastLogin: u.last_login, is_new: u.is_new, is_updated: u.is_updated })) : []; localStorage.setItem('rythu_samachar_users', JSON.stringify(u)); return u; },
      async () => { const s = await getDocs(collection(db, 'users')); const u = s.docs.map(d => d.data() as User); localStorage.setItem('rythu_samachar_users', JSON.stringify(u)); return u; },
      async () => { return DataService.getAllUsers(); }
  ),
  getAllUsers: () => { const s = localStorage.getItem('rythu_samachar_users'); return s ? JSON.parse(s) : []; },
  addStaff: async (user: Partial<User>) => execute(
      async () => { const { error } = await supabase!.from('users').insert([{ id: 'staff_' + Date.now(), name: user.name, email: user.email, mobile: user.mobile, role: UserRole.USER, password: user.password, status: 'Active' }]); if(error) throw error; return { success: true, message: "Staff Added" }; },
      async () => { await setDoc(doc(db, 'users', 'staff_' + Date.now()), { ...user, id: 'staff_' + Date.now(), role: UserRole.USER, status: 'Active', createdDate: new Date().toISOString() }); return { success: true, message: "Staff Added" }; },
      async () => { const users = DataService.getAllUsers(); users.push({ ...user, id: 'staff_' + Date.now(), role: UserRole.USER, status: 'Active', createdDate: new Date().toISOString() } as User); localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); return { success: true, message: "Staff Added" }; }
  ),
  updateUserStatus: async (id: string, status: 'Active'|'Inactive') => execute(
      async () => { await supabase!.from('users').update({ status }).eq('id', id); return true; },
      async () => { await updateDoc(doc(db, 'users', id), { status }); return true; },
      async () => { const users = DataService.getAllUsers(); const u = users.find(u => u.id === id); if(u) { u.status = status; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); } return true; }
  ),
  deleteUser: async (id: string) => execute(
      async () => { await supabase!.from('users').delete().eq('id', id); },
      async () => { await deleteDoc(doc(db, 'users', id)); },
      async () => { const users = DataService.getAllUsers().filter(u => u.id !== id); localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); }
  ),
  changePassword: async (id: string, old: string, newP: string) => execute(
      async () => { await supabase!.from('users').update({ password: newP }).eq('id', id); return { success: true, message: "Changed" }; },
      async () => { await updateDoc(doc(db, 'users', id), { password: newP }); return { success: true, message: "Changed" }; },
      async () => { const users = DataService.getAllUsers(); const u = users.find(u => u.id === id); if(u) { u.password = newP; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); } return { success: true, message: "Changed" }; }
  ),
  login: async (e: string, p: string) => {
      const users = await DataService.fetchUsers();
      const u = users.find(u => u.email === e && u.password === p);
      if(u) { if(u.status === 'Inactive') return { success: false, message: "Inactive" }; return { success: true, user: u }; }
      return { success: false, message: "Invalid Credentials" };
  },
  sendOtp: async (e: string) => ({ success: true, otp: '123456', message: 'OTP Sent' }),
  verifyOtp: (e: string, o: string) => o === '123456',
  resetPassword: async (e: string, p: string) => execute(
      async () => { await supabase!.from('users').update({ password: p }).eq('email', e); return { success: true, message: 'Done' }; },
      async () => { const q = query(collection(db, 'users'), where('email', '==', e)); const s = await getDocs(q); if(!s.empty) await updateDoc(s.docs[0].ref, { password: p }); return { success: true, message: 'Done' }; },
      async () => { const users = DataService.getAllUsers(); const u = users.find(u => u.email === e); if(u) { u.password = p; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); } return { success: true, message: 'Done' }; }
  ),
  updateUserLoginTime: async (uid: string) => {
      const now = new Date().toISOString();
      execute(
          async () => { await supabase!.from('users').update({ last_login: now }).eq('id', uid); },
          async () => { await updateDoc(doc(db, 'users', uid), { lastLogin: now }); },
          async () => { const users = DataService.getAllUsers(); const u = users.find(u => u.id === uid); if(u) { u.lastLogin = now; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); } }
      );
  },
  updateUserProfile: async (u: User) => execute(
      async () => { await supabase!.from('users').update({ name: u.name, mobile: u.mobile, dob: u.dob }).eq('id', u.id); return { success: true, message: 'Profile Updated' }; },
      async () => { await updateDoc(doc(db, 'users', u.id), { name: u.name, mobile: u.mobile, dob: u.dob }); return { success: true, message: 'Profile Updated' }; },
      async () => { const users = DataService.getAllUsers(); const idx = users.findIndex(us => us.id === u.id); if(idx > -1) { users[idx] = { ...users[idx], ...u }; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); } return { success: true, message: 'Profile Updated' }; }
  ),
};

export const AuthService = { ...DataService };
DataService.initialize();
