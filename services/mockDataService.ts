import { User, UserRole, DashboardStats, FMBRecord, KMLRecord, ARegisterFile, RecycleBinRecord, DynamicRecord, ModuleType, ARegisterSummary, AttendanceRecord } from '../types';
import { db, storage } from './firebase';
import { 
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, writeBatch, getDoc 
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
    
    // Fallback: If offline or no storage config, return base64
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
let isOfflineMode = !db;

// Robust Execution Strategy: Firebase -> REST API -> Local IndexedDB
const execute = async <T>(
    firebaseFn: () => Promise<T>,
    localFn: () => Promise<T>,
    apiFallbackFn?: () => Promise<T | null>
): Promise<T> => {
    // 1. Try Firebase if configured
    if (db) {
        try {
            return await firebaseFn();
        } catch (error: any) {
            console.warn(`Firebase Error (${error.code}). Attempting Fallback.`);
            // Fallthrough to API/Local
        }
    }

    // 2. Try REST API if provided
    if (apiFallbackFn && API_BASE && !API_BASE.includes("localhost")) {
        try {
            const apiResult = await apiFallbackFn();
            if (apiResult !== null) return apiResult;
        } catch (e) {
            console.warn("API Sync Error:", e);
        }
    }

    // 3. Fallback to Local IndexedDB
    return localFn();
};

const otpStore: Record<string, { code: string, expires: number }> = {};

export const DataService = {
  isOffline: () => isOfflineMode,

  initialize: async () => {
      if (!db) {
          console.log("Firebase not configured. Initializing Offline Mode (IndexedDB).");
          isOfflineMode = true;
          DataService.initializeLocal();
          return;
      }

      try {
          // Attempt Cloud Connection
          const usersRef = collection(db, 'users');
          const adminQ = query(usersRef, where('email', '==', 'sanju.pavan11@gmail.com'));
          const snapshot = await getDocs(adminQ);
          
          if (snapshot.empty) {
              const adminUser: User = {
                id: 'admin_1',
                name: 'Sanjeeva Naik',
                email: 'sanju.pavan11@gmail.com',
                mobile: '9999999999',
                role: UserRole.ADMIN,
                password: 'Sanju@12', 
                createdDate: new Date().toISOString(),
                status: 'Active',
                dob: '1990-01-01'
              };
              await setDoc(doc(db, 'users', adminUser.id), adminUser);
          }
          await DataService.fetchUsers();
      } catch (e) {
          console.log("Initializing Offline Mode due to Cloud Error:", e);
          isOfflineMode = true;
          DataService.initializeLocal();
      }
  },

  initializeLocal: () => {
      const usersStr = localStorage.getItem('rythu_samachar_users');
      let users: User[] = usersStr ? JSON.parse(usersStr) : [];
      if (!users.find(u => u.email === 'sanju.pavan11@gmail.com')) {
          const adminUser: User = {
              id: 'admin_1',
              name: 'Sanjeeva Naik',
              email: 'sanju.pavan11@gmail.com',
              mobile: '9999999999',
              role: UserRole.ADMIN,
              password: 'Sanju@12', 
              createdDate: new Date().toISOString(),
              status: 'Active',
              dob: '1990-01-01'
          };
          users.push(adminUser);
          localStorage.setItem('rythu_samachar_users', JSON.stringify(users));
      }
  },

  getAppConfig: () => {
      const stored = localStorage.getItem('rythu_app_config');
      return stored ? JSON.parse(stored) : { logo: '/ryathu.jpg' };
  },

  updateAppLogo: (logoBase64: string) => {
      const config = { logo: logoBase64 };
      localStorage.setItem('rythu_app_config', JSON.stringify(config));
      window.dispatchEvent(new Event('appConfigUpdated'));
      return { success: true };
  },

  // --- MODULE FILES ---
  getModuleFiles: async (module: ModuleType): Promise<ARegisterFile[]> => {
      return execute(
          async () => {
              const q = query(collection(db, 'files'), where('module', '==', module));
              const snapshot = await getDocs(q);
              return snapshot.docs.map(d => d.data() as ARegisterFile).sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
          },
          async () => {
              const allFiles = await dbGetAll<ARegisterFile>(STORES.FILES);
              return allFiles.filter(f => f.module === module).sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
          },
          async () => {
              const res = await axios.get(`${API_BASE}/files?module=${module}`);
              return res.data;
          }
      );
  },

  saveModuleFile: async (module: ModuleType, file: ARegisterFile) => {
      return execute(
          async () => {
              const fileWithModule = { ...file, module };
              await setDoc(doc(db, 'files', file.id), fileWithModule);
          },
          async () => {
              const fileWithModule = { ...file, module };
              await dbOp(STORES.FILES, 'readwrite', store => store.put(fileWithModule));
          }
      );
  },

  updateModuleFileColumns: async (module: ModuleType, fileId: string, newColumns: string[]) => {
      return execute(
          async () => { await updateDoc(doc(db, 'files', fileId), { columns: newColumns }); },
          async () => {
              const files = await dbGetAll<ARegisterFile>(STORES.FILES);
              const file = files.find(f => f.id === fileId);
              if (file) { file.columns = newColumns; await dbOp(STORES.FILES, 'readwrite', store => store.put(file)); }
          }
      );
  },

  deleteModuleFile: async (module: ModuleType, fileId: string) => {
      return execute(
          async () => {
              await deleteDoc(doc(db, 'files', fileId));
              const q = query(collection(db, 'records'), where('fileId', '==', fileId));
              const snapshot = await getDocs(q);
              const batchChunks = chunkArray(snapshot.docs, 400);
              for (const chunk of batchChunks) {
                  const batch = writeBatch(db);
                  chunk.forEach((d: any) => batch.delete(d.ref));
                  await batch.commit();
              }
          },
          async () => {
              await dbOp(STORES.FILES, 'readwrite', store => store.delete(fileId));
              const db = await openDB();
              const tx = db.transaction(STORES.RECORDS, 'readwrite');
              const store = tx.objectStore(STORES.RECORDS);
              const index = store.index('fileId');
              const request = index.getAllKeys(fileId);
              request.onsuccess = () => { request.result.forEach(key => store.delete(key)); };
              return new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
          }
      );
  },

  softDeleteModuleFile: async (module: ModuleType, fileId: string, deletedBy: string): Promise<boolean> => {
      return execute(
          async () => {
              const q = query(collection(db, 'files'), where('id', '==', fileId));
              const snap = await getDocs(q);
              if (snap.empty) return false;
              const fileData = snap.docs[0].data() as ARegisterFile;
              const binItem: RecycleBinRecord = {
                  id: fileId, fileId, deletedAt: new Date().toISOString(), deletedBy, originalFileId: fileId, sourceModule: `${module}_FILE`, originalData: fileData, fileName: fileData.fileName
              };
              const batch = writeBatch(db);
              batch.set(doc(db, 'recycle_bin', fileId), binItem);
              batch.delete(doc(db, 'files', fileId));
              await batch.commit();
              return true;
          },
          async () => {
              const file = await dbOp<ARegisterFile>(STORES.FILES, 'readonly', store => store.get(fileId));
              if (!file) return false;
              const binItem: RecycleBinRecord = {
                  id: file.id, fileId: file.id, deletedAt: new Date().toISOString(), deletedBy, originalFileId: file.id, sourceModule: `${module}_FILE`, originalData: file, fileName: file.fileName
              };
              await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.put(binItem));
              await dbOp(STORES.FILES, 'readwrite', store => store.delete(fileId));
              return true;
          }
      );
  },

  // --- MODULE RECORDS ---
  getModuleRecords: async (module: ModuleType, fileId?: string): Promise<DynamicRecord[]> => {
      const processRecords = (records: DynamicRecord[]) => {
          if (module === 'AREGISTER') {
              return records.map(r => ({ ...r, 'Total Extent': calculateARegisterTotal(r) }));
          }
          return records;
      };

      return execute(
          async () => {
              let q = fileId ? query(collection(db, 'records'), where('fileId', '==', fileId)) : query(collection(db, 'records')); // Simplified query to allow client filtering if needed or index issues
              // Optimization: if no fileId, try to filter by module if possible, but schema is flat. 
              // Better to fetch all and filter in memory if volume permits, or rely on fileId.
              const snapshot = await getDocs(q);
              let records = snapshot.docs.map(d => d.data() as DynamicRecord);
              
              if (!fileId) {
                  // Filter by Module Association via File
                  const files = await DataService.getModuleFiles(module);
                  const fileIds = files.map(f => f.id);
                  records = records.filter(r => fileIds.includes(r.fileId || ''));
              }
              return processRecords(records);
          },
          async () => {
              let resultRecords: DynamicRecord[] = [];
              if (fileId) {
                  const db = await openDB();
                  resultRecords = await new Promise((resolve) => {
                      const tx = db.transaction(STORES.RECORDS, 'readonly');
                      const index = tx.objectStore(STORES.RECORDS).index('fileId');
                      index.getAll(fileId).onsuccess = (e: any) => resolve(e.target.result);
                  });
              } else {
                  const files = await DataService.getModuleFiles(module);
                  const fileIds = new Set(files.map(f => f.id));
                  const all = await dbGetAll<DynamicRecord>(STORES.RECORDS);
                  resultRecords = all.filter(r => r.fileId && fileIds.has(r.fileId));
              }
              return processRecords(resultRecords);
          },
          async () => {
              // REST API Fallback
              const url = fileId 
                  ? `${API_BASE}/records?module=${module}&fileId=${fileId}`
                  : `${API_BASE}/records?module=${module}`;
              const res = await axios.get(url);
              return processRecords(res.data);
          }
      );
  },

  saveModuleRecords: async (module: ModuleType, newRecords: DynamicRecord[]) => {
      // 1. Sync to API (Fire and Forget)
      if (API_BASE && !API_BASE.includes("localhost") && newRecords.length > 0) {
          axios.post(`${API_BASE}/records/batch`, {
              module,
              records: newRecords,
              timestamp: new Date().toISOString()
          }).catch(err => console.warn("Background API Sync Failed:", err));
      }

      // 2. Persist to Storage
      return execute(
          async () => {
              const chunks = chunkArray(newRecords, 400);
              for (const chunk of chunks) {
                  const batch = writeBatch(db);
                  await Promise.all(chunk.map(async (record) => {
                      if (record.imageUrl && record.imageUrl.startsWith('data:')) {
                          record.imageUrl = await uploadBase64ToStorage(record.imageUrl, `records/${module}/${record.id}_img`);
                      }
                      for (const key of Object.keys(record)) {
                          const val = record[key];
                          if (typeof val === 'string' && val.startsWith('data:image')) {
                              record[key] = await uploadBase64ToStorage(val, `records/${module}/${record.id}_${key}`);
                          }
                      }
                      const ref = doc(db, 'records', record.id);
                      batch.set(ref, record, { merge: true });
                  }));
                  await batch.commit();
              }
          },
          async () => {
              const db = await openDB();
              const tx = db.transaction(STORES.RECORDS, 'readwrite');
              const store = tx.objectStore(STORES.RECORDS);
              newRecords.forEach(r => store.put(r));
              return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
          }
      );
  },

  clearModuleModifiedFlags: async (module: ModuleType): Promise<boolean> => {
      return execute(
          async () => {
              const records = await DataService.getModuleRecords(module);
              const chunks = chunkArray(records, 400);
              for (const chunk of chunks) {
                  const batch = writeBatch(db);
                  chunk.forEach(r => {
                      const ref = doc(db, 'records', r.id);
                      batch.update(ref, { is_highlighted: 0, is_modified: 0 });
                  });
                  await batch.commit();
              }
              return true;
          },
          async () => {
              const records = await DataService.getModuleRecords(module);
              const updatedRecords = records.map(r => ({ ...r, is_highlighted: 0, is_modified: 0 }));
              await DataService.saveModuleRecords(module, updatedRecords);
              return true;
          }
      );
  },

  getARegisterSummary: async (fileId: string): Promise<ARegisterSummary | undefined> => {
      return execute(
          async () => {
              const snap = await getDocs(query(collection(db, 'summaries'), where('fileId', '==', fileId)));
              return !snap.empty ? snap.docs[0].data() as ARegisterSummary : undefined;
          },
          async () => {
              return dbOp<ARegisterSummary>(STORES.SUMMARIES, 'readonly', store => store.get(fileId));
          }
      );
  },

  saveARegisterSummary: async (summary: ARegisterSummary) => {
      return execute(
          async () => { await setDoc(doc(db, 'summaries', summary.fileId), summary); },
          async () => { await dbOp(STORES.SUMMARIES, 'readwrite', store => store.put(summary)); }
      );
  },

  // --- RECYCLE BIN ---
  getRecycleBin: async (): Promise<RecycleBinRecord[]> => {
      return execute(
          async () => {
              const snap = await getDocs(collection(db, 'recycle_bin'));
              return snap.docs.map(d => d.data() as RecycleBinRecord);
          },
          async () => { return dbGetAll<RecycleBinRecord>(STORES.RECYCLE_BIN); }
      );
  },

  emptyRecycleBin: async () => {
      return execute(
          async () => {
              const snap = await getDocs(collection(db, 'recycle_bin'));
              const chunks = chunkArray(snap.docs, 400);
              for (const chunk of chunks) {
                  const batch = writeBatch(db);
                  chunk.forEach((d: any) => batch.delete(d.ref));
                  await batch.commit();
              }
          },
          async () => { await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.clear()); }
      );
  },

  softDeleteRecord: async (module: ModuleType, id: string, deletedBy: string): Promise<boolean> => {
      return execute(
          async () => {
              const snap = await getDocs(query(collection(db, 'records'), where('id', '==', id)));
              if (snap.empty) return false;
              const record = snap.docs[0].data() as DynamicRecord;
              const binItem: RecycleBinRecord = { ...record, deletedAt: new Date().toISOString(), deletedBy, originalFileId: record.fileId || 'unknown', sourceModule: `${module}_ROW`, originalData: record };
              const batch = writeBatch(db);
              batch.set(doc(db, 'recycle_bin', id), binItem);
              batch.delete(doc(db, 'records', id));
              await batch.commit();
              return true;
          },
          async () => {
              const record = await dbOp<DynamicRecord>(STORES.RECORDS, 'readonly', store => store.get(id));
              if (!record) return false;
              const binItem: RecycleBinRecord = { ...record, deletedAt: new Date().toISOString(), deletedBy, originalFileId: record.fileId || 'unknown', sourceModule: `${module}_ROW`, originalData: record };
              await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.put(binItem));
              await dbOp(STORES.RECORDS, 'readwrite', store => store.delete(id));
              return true;
          }
      );
  },

  softDeleteFMB: async (id: string, deletedBy: string): Promise<boolean> => {
      const doSoftDelete = async (getter: () => Promise<any>, saver: (item: any) => Promise<void>, deleter: (id: string) => Promise<void>) => {
          const record = await getter();
          if(!record) return false;
          const binItem = { ...record, deletedAt: new Date().toISOString(), deletedBy, originalFileId: 'N/A', sourceModule: 'FMB', originalData: record };
          await saver(binItem);
          await deleter(id);
          return true;
      };

      return execute(
          async () => doSoftDelete(
              async () => { const s = await getDocs(query(collection(db, 'fmb'), where('id', '==', id))); return s.empty ? null : s.docs[0].data(); },
              async (item) => { await setDoc(doc(db, 'recycle_bin', id), item); },
              async (id) => { await deleteDoc(doc(db, 'fmb', id)); }
          ),
          async () => doSoftDelete(
              async () => dbOp(STORES.FMB, 'readonly', s => s.get(id)),
              async (item) => { await dbOp(STORES.RECYCLE_BIN, 'readwrite', s => s.put(item)); },
              async (id) => { await dbOp(STORES.FMB, 'readwrite', s => s.delete(id)); }
          )
      );
  },

  softDeleteKML: async (id: string, deletedBy: string): Promise<boolean> => {
      const doSoftDelete = async (getter: () => Promise<any>, saver: (item: any) => Promise<void>, deleter: (id: string) => Promise<void>) => {
          const record = await getter();
          if(!record) return false;
          const binItem = { ...record, deletedAt: new Date().toISOString(), deletedBy, originalFileId: 'N/A', sourceModule: 'KML', originalData: record };
          await saver(binItem);
          await deleter(id);
          return true;
      };

      return execute(
          async () => doSoftDelete(
              async () => { const s = await getDocs(query(collection(db, 'kml'), where('id', '==', id))); return s.empty ? null : s.docs[0].data(); },
              async (item) => { await setDoc(doc(db, 'recycle_bin', id), item); },
              async (id) => { await deleteDoc(doc(db, 'kml', id)); }
          ),
          async () => doSoftDelete(
              async () => dbOp(STORES.KML, 'readonly', s => s.get(id)),
              async (item) => { await dbOp(STORES.RECYCLE_BIN, 'readwrite', s => s.put(item)); },
              async (id) => { await dbOp(STORES.KML, 'readwrite', s => s.delete(id)); }
          )
      );
  },

  restoreRecycleBinRecord: async (id: string): Promise<boolean> => {
      const handleRestore = async (record: RecycleBinRecord, saver: (col: string, item: any) => Promise<void>, deleter: (id: string) => Promise<void>) => {
          const { deletedAt, deletedBy, originalFileId, sourceModule, originalData, ...cleanData } = record;
          const dataToRestore = originalData || cleanData;
          let target = 'records';
          if (sourceModule === 'FMB') target = 'fmb';
          if (sourceModule === 'KML') target = 'kml';
          if (sourceModule && sourceModule.endsWith('_FILE')) target = 'files';
          
          let localTarget = STORES.RECORDS;
          if (sourceModule === 'FMB') localTarget = STORES.FMB;
          if (sourceModule === 'KML') localTarget = STORES.KML;
          if (sourceModule?.endsWith('_FILE')) localTarget = STORES.FILES;

          if (isOfflineMode) {
              await dbOp(localTarget, 'readwrite', s => s.put(dataToRestore));
          } else {
              await saver(target, dataToRestore);
          }
          await deleter(id);
          return true;
      };

      return execute(
          async () => {
              const snap = await getDocs(query(collection(db, 'recycle_bin'), where('id', '==', id)));
              if (snap.empty) return false;
              const record = snap.docs[0].data() as RecycleBinRecord;
              return handleRestore(
                  record,
                  async (col, item) => { await setDoc(doc(db, col, id), item); },
                  async (id) => { await deleteDoc(doc(db, 'recycle_bin', id)); }
              );
          },
          async () => {
              const record = await dbOp<RecycleBinRecord>(STORES.RECYCLE_BIN, 'readonly', s => s.get(id));
              if (!record) return false;
              return handleRestore(
                  record,
                  async () => {}, // Handled inside logic
                  async (id) => { await dbOp(STORES.RECYCLE_BIN, 'readwrite', s => s.delete(id)); }
              );
          }
      );
  },

  permanentDeleteRecycleBinRecord: async (id: string): Promise<boolean> => {
      return execute(
          async () => { await deleteDoc(doc(db, 'recycle_bin', id)); return true; },
          async () => { await dbOp(STORES.RECYCLE_BIN, 'readwrite', s => s.delete(id)); return true; }
      );
  },

  // --- FMB & KML ---
  getFMB: async (): Promise<FMBRecord[]> => {
      return execute(
          async () => { const s = await getDocs(collection(db, 'fmb')); return s.docs.map(d => d.data() as FMBRecord); },
          async () => { return dbGetAll<FMBRecord>(STORES.FMB); }
      );
  },
  saveFMB: async (record: FMBRecord) => {
      return execute(
          async () => {
              if (record.sketchUrl && record.sketchUrl.startsWith('data:')) {
                  record.sketchUrl = await uploadBase64ToStorage(record.sketchUrl, `fmb/${record.id}`);
              }
              await setDoc(doc(db, 'fmb', record.id), record);
          },
          async () => { await dbOp(STORES.FMB, 'readwrite', s => s.put(record)); }
      );
  },
  importFMB: async (newRecords: FMBRecord[]) => {
      return execute(
          async () => {
              const chunks = chunkArray(newRecords, 100);
              for (const chunk of chunks) {
                  const batch = writeBatch(db);
                  await Promise.all(chunk.map(async (r) => {
                      if (r.sketchUrl && r.sketchUrl.startsWith('data:')) {
                          r.sketchUrl = await uploadBase64ToStorage(r.sketchUrl, `fmb/${r.id}`);
                      }
                      batch.set(doc(db, 'fmb', r.id), r);
                  }));
                  await batch.commit();
              }
          },
          async () => {
              const db = await openDB();
              const tx = db.transaction(STORES.FMB, 'readwrite');
              const store = tx.objectStore(STORES.FMB);
              newRecords.forEach(r => store.put(r));
              return new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
          }
      );
  },

  getKML: async (): Promise<KMLRecord[]> => {
      return execute(
          async () => { const s = await getDocs(collection(db, 'kml')); return s.docs.map(d => d.data() as KMLRecord); },
          async () => { return dbGetAll<KMLRecord>(STORES.KML); }
      );
  },
  saveKML: async (record: KMLRecord) => {
      return execute(
          async () => {
              if (record.url && record.url.startsWith('data:')) {
                  record.url = await uploadBase64ToStorage(record.url, `kml/${record.id}`);
              }
              await setDoc(doc(db, 'kml', record.id), record);
          },
          async () => { await dbOp(STORES.KML, 'readwrite', s => s.put(record)); }
      );
  },

  // --- ATTENDANCE ---
  markAttendance: async (record: AttendanceRecord): Promise<boolean> => {
      return execute(
          async () => {
              if (record.selfieUrl.startsWith('data:')) {
                  record.selfieUrl = await uploadBase64ToStorage(record.selfieUrl, `attendance/${record.id}_selfie.jpg`);
              }
              await setDoc(doc(db, 'attendance', record.id), record);
              return true;
          },
          async () => {
              await dbOp(STORES.ATTENDANCE, 'readwrite', s => s.put(record));
              return true;
          }
      );
  },
  
  getTodayAttendance: async (userId: string): Promise<boolean> => {
      const today = new Date().toISOString().split('T')[0];
      return execute(
          async () => {
              const q = query(collection(db, 'attendance'), where('userId', '==', userId), where('date', '==', today));
              const snap = await getDocs(q);
              return !snap.empty;
          },
          async () => {
              const db = await openDB();
              return new Promise((resolve) => {
                  const tx = db.transaction(STORES.ATTENDANCE, 'readonly');
                  const store = tx.objectStore(STORES.ATTENDANCE);
                  const index = store.index('userId');
                  const request = index.getAll(userId);
                  request.onsuccess = () => {
                      const records = request.result as AttendanceRecord[];
                      resolve(records.some(r => r.date === today));
                  };
              });
          }
      );
  },
  
  getAllAttendance: async (): Promise<AttendanceRecord[]> => {
      return execute(
          async () => { const s = await getDocs(collection(db, 'attendance')); return s.docs.map(d => d.data() as AttendanceRecord); },
          async () => { return dbGetAll<AttendanceRecord>(STORES.ATTENDANCE); },
          async () => {
              const res = await axios.get(`${API_BASE}/attendance`);
              return res.data;
          }
      );
  },

  // --- STATS ---
  getStats: async (): Promise<DashboardStats> => {
      const recs = await DataService.getModuleRecords('AREGISTER'); 
      const fmb = await DataService.getFMB();
      let totalAcres = 0;
      recs.forEach(r => {
          const val = r['Extent'] || r['Acres'] || r['extent'] || r['acres'] || 0;
          const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
          if(!isNaN(num)) totalAcres += num;
      });
      return {
          totalEntries: recs.length,
          totalAcres: parseFloat(totalAcres.toFixed(2)),
          verifiedCount: 0,
          teamDistribution: [],
          totalARegister: recs.length,
          totalFMB: fmb.length,
          comparisonIssues: 0
      };
  },

  // --- AUTH ---
  getAllUsers: () => {
      const usersStr = localStorage.getItem('rythu_samachar_users');
      return usersStr ? JSON.parse(usersStr) : [];
  },
  
  fetchUsers: async (): Promise<User[]> => {
      return execute(
          async () => {
              const snap = await getDocs(collection(db, 'users'));
              const users = snap.docs.map(d => d.data() as User);
              localStorage.setItem('rythu_samachar_users', JSON.stringify(users));
              return users;
          },
          async () => { return DataService.getAllUsers(); },
          async () => {
              const res = await axios.get(`${API_BASE}/users`);
              if(res.data) localStorage.setItem('rythu_samachar_users', JSON.stringify(res.data));
              return res.data;
          }
      );
  },

  login: async (email: string, password: string): Promise<{ success: boolean, user?: User, message?: string }> => {
      const localLogin = () => {
          const users = DataService.getAllUsers();
          const user = users.find(u => u.email === email && u.password === password);
          if (user) {
              if (user.status === 'Inactive') return { success: false, message: "Account Deactivated." };
              return { success: true, user };
          }
          return { success: false, message: "Invalid Email or Password" };
      };

      return execute(
          async () => {
              const q = query(collection(db, 'users'), where('email', '==', email), where('password', '==', password));
              const snap = await getDocs(q);
              if (!snap.empty) {
                  const user = snap.docs[0].data() as User;
                  if (user.status === 'Inactive') return { success: false, message: "Account Deactivated." };
                  return { success: true, user };
              }
              return { success: false, message: "Invalid Email or Password" };
          },
          async () => localLogin()
      );
  },
  
  updateUserLoginTime: async (userId: string) => {
      execute(
          async () => { await updateDoc(doc(db, 'users', userId), { lastLogin: new Date().toISOString() }); },
          async () => {
              const users = DataService.getAllUsers();
              const u = users.find(u => u.id === userId);
              if(u) { u.lastLogin = new Date().toISOString(); localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); }
          }
      );
  },

  changePassword: async (userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean, message: string }> => {
      const validate = validatePassword(newPassword);
      if(!validate.isValid) return { success: false, message: validate.message || "Invalid Password" };

      return execute(
          async () => { await updateDoc(doc(db, 'users', userId), { password: newPassword }); return { success: true, message: "Password updated." }; },
          async () => {
              const users = DataService.getAllUsers();
              const idx = users.findIndex(u => u.id === userId);
              if(idx > -1) { users[idx].password = newPassword; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); return { success: true, message: "Password updated." }; }
              return { success: false, message: "User not found" };
          }
      );
  },

  addStaff: async (user: Partial<User>): Promise<{ success: boolean, message: string }> => {
      if(!user.password) return { success: false, message: "Password required" };
      const validation = validatePassword(user.password);
      if(!validation.isValid) return { success: false, message: validation.message || 'Invalid Password' };

      const checkEmail = async () => {
          const users = await DataService.fetchUsers();
          return users.some(u => u.email === user.email);
      };

      if(await checkEmail()) return { success: false, message: "Email already exists" };

      const newUser: User = {
          id: 'staff_' + Date.now(),
          name: user.name || 'Staff',
          email: user.email || '',
          mobile: user.mobile || '',
          role: UserRole.USER,
          password: user.password,
          createdDate: new Date().toISOString(),
          status: 'Active',
          is_new: 1
      };
      
      return execute(
          async () => { await setDoc(doc(db, 'users', newUser.id), newUser); return { success: true, message: "Staff added" }; },
          async () => { 
              const users = DataService.getAllUsers(); 
              users.push(newUser); 
              localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); 
              return { success: true, message: "Staff added" }; 
          }
      );
  },

  updateUserProfile: async (user: User): Promise<{ success: boolean, message: string }> => {
      return execute(
          async () => { await updateDoc(doc(db, 'users', user.id), { ...user, is_updated: 1 }); return { success: true, message: "Profile updated" }; },
          async () => {
              const users = DataService.getAllUsers();
              const idx = users.findIndex(u => u.id === user.id);
              if(idx > -1) { users[idx] = { ...users[idx], ...user, is_updated: 1 }; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); }
              return { success: true, message: "Profile updated" };
          }
      );
  },

  updateUserStatus: async (id: string, status: 'Active' | 'Inactive'): Promise<boolean> => {
      return execute(
          async () => { await updateDoc(doc(db, 'users', id), { status }); return true; },
          async () => {
              const users = DataService.getAllUsers();
              const u = users.find(u => u.id === id);
              if(u) { u.status = status; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); }
              return true;
          }
      );
  },

  deleteUser: async (id: string) => {
      return execute(
          async () => { await deleteDoc(doc(db, 'users', id)); },
          async () => {
              const users = DataService.getAllUsers().filter(u => u.id !== id);
              localStorage.setItem('rythu_samachar_users', JSON.stringify(users));
          }
      );
  },
  
  sendOtp: async (email: string): Promise<{ success: boolean, otp?: string, message?: string }> => {
      // Mock OTP logic works same for both
      const users = await DataService.fetchUsers();
      const user = users.find(u => u.email === email);
      if (!user) return { success: false, message: "Email not registered." };
      
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore[email] = { code: otp, expires: Date.now() + 180000 };
      return { success: true, otp };
  },

  verifyOtp: (email: string, otp: string): boolean => {
      const record = otpStore[email];
      if (!record || Date.now() > record.expires || record.code !== otp) return false;
      delete otpStore[email];
      return true;
  },

  resetPassword: async (email: string, pass: string) => {
      const users = await DataService.fetchUsers();
      const user = users.find(u => u.email === email);
      if (!user) return { success: false, message: 'User not found' };
      
      return execute(
          async () => { await updateDoc(doc(db, 'users', user.id), { password: pass }); return { success: true, message: "Password Reset" }; },
          async () => {
              const localUsers = DataService.getAllUsers();
              const idx = localUsers.findIndex(u => u.id === user.id);
              if(idx > -1) { localUsers[idx].password = pass; localStorage.setItem('rythu_samachar_users', JSON.stringify(localUsers)); }
              return { success: true, message: "Password Reset" };
          }
      );
  }
};

export const AuthService = {
    ...DataService,
    getAllUsers: () => DataService.getAllUsers()
};

DataService.initialize();