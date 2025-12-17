
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
    
    // Supabase Storage Logic (Simplified: returns base64 if not fully implemented)
    if (isSupabaseConfigured() && supabase) {
        // Implement Supabase Storage upload here if bucket exists
        // For now, return base64 or implement if bucket 'rythu_files' exists
        return base64String; 
    }

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
let isOfflineMode = !db && !isSupabaseConfigured();

// Robust Execution Strategy: Supabase -> Firebase -> REST API -> Local IndexedDB
const execute = async <T>(
    supabaseFn: () => Promise<T>,
    firebaseFn: () => Promise<T>,
    localFn: () => Promise<T>,
    apiFallbackFn?: () => Promise<T | null>
): Promise<T> => {
    // 1. Try Supabase (Highest Priority for SQL features)
    if (isSupabaseConfigured()) {
        try {
            return await supabaseFn();
        } catch (e) {
            console.warn("Supabase Error, falling back...", e);
        }
    }

    // 2. Try Firebase if configured
    if (db) {
        try {
            return await firebaseFn();
        } catch (error: any) {
            console.warn(`Firebase Error (${error.code}). Attempting Fallback.`);
        }
    }

    // 3. Try REST API if provided
    if (apiFallbackFn && API_BASE && !API_BASE.includes("localhost")) {
        try {
            const apiResult = await apiFallbackFn();
            if (apiResult !== null) return apiResult;
        } catch (e) {
            console.warn("API Sync Error:", e);
        }
    }

    // 4. Fallback to Local IndexedDB
    return localFn();
};

const otpStore: Record<string, { code: string, expires: number }> = {};

export const DataService = {
  isOffline: () => isOfflineMode,

  initialize: async () => {
      // 1. Check if Supabase Configured
      if (isSupabaseConfigured() && supabase) {
          console.log("✅ Connected to Supabase");
          
          // Check for Default Admin in Supabase
          try {
              const { data } = await supabase.from('users').select('*').eq('email', 'sanju.pavan11@gmail.com').single();
              if (!data) {
                  console.log("Creating Default Admin in Supabase...");
                  await supabase.from('users').insert([{
                      id: 'admin_1',
                      name: 'Sanjeeva Naik',
                      email: 'sanju.pavan11@gmail.com',
                      mobile: '9999999999',
                      role: UserRole.ADMIN,
                      password: 'Sanju@12',
                      status: 'Active',
                      created_at: new Date().toISOString(),
                      is_new: 0,
                      is_updated: 0
                  }]);
              }
          } catch(e) {
              console.error("Error seeding admin in Supabase:", e);
          }
          return;
      }

      // 2. Check Firebase
      if (!db) {
          console.log("Firebase/Supabase not configured. Initializing Offline Mode (IndexedDB).");
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

  // --- REAL-TIME SUBSCRIPTIONS ---
  subscribeToModuleRecords: (module: ModuleType, fileId: string | undefined, callback: (data: DynamicRecord[]) => void) => {
      // Supabase Subscription
      if (isSupabaseConfigured() && supabase) {
          let query = supabase.from('records').select('*').eq('module', module).limit(10000); // Increased Limit
          if (fileId) query = query.eq('file_id', fileId);
          
          // Initial Fetch
          query.then(({ data }) => {
              if (data) {
                  const records = data.map((r: any) => ({ ...r.data, id: r.id, fileId: r.file_id, imageUrl: r.image_url, ...r }));
                  callback(records);
              }
          });

          // Realtime Listener
          const channel = supabase.channel('realtime_records')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `module=eq.${module}` }, async (payload) => {
                  const { data } = await query;
                  if (data) {
                      const records = data.map((r: any) => ({ ...r.data, id: r.id, fileId: r.file_id, imageUrl: r.image_url, ...r }));
                      callback(records);
                  }
              })
              .subscribe();
          
          return () => { supabase.removeChannel(channel); };
      }

      if (db) {
          let q = fileId ? query(collection(db, 'records'), where('fileId', '==', fileId)) : query(collection(db, 'records'));
          const unsubscribe = onSnapshot(q, (snapshot) => {
              let records = snapshot.docs.map(d => d.data() as DynamicRecord);
              if (module === 'AREGISTER') {
                  records = records.map(r => ({ ...r, 'Total Extent': calculateARegisterTotal(r) }));
              }
              // If querying all module records without fileId in Firebase, we must filter client side for correct module if the index is weak
              if (!fileId) {
                  // Fallback: If 'module' field exists in docs, use it. If not, rely on file linkage (slower).
                  // Best effort: Assume 'records' collection is shared and filter by module field if present
                  records = records.filter(r => r.module === module || (r as any)._sourceModule === module);
              }
              callback(records);
          }, (error) => {
              console.warn("Firestore subscription failed", error);
          });
          return unsubscribe;
      } else {
          const interval = setInterval(async () => {
              const data = await DataService.getModuleRecords(module, fileId);
              callback(data);
          }, 5000); 
          DataService.getModuleRecords(module, fileId).then(callback);
          return () => clearInterval(interval);
      }
  },

  subscribeToFiles: (module: ModuleType, callback: (files: ARegisterFile[]) => void) => {
      // Supabase File Subscription
      if (isSupabaseConfigured() && supabase) {
          const fetchFiles = async () => {
              const { data } = await supabase.from('files').select('*').eq('module', module);
              if (data) {
                  const files = data.map((f: any) => ({ 
                      id: f.id, fileName: f.file_name, module: f.module, 
                      uploadDate: f.upload_date ? new Date(f.upload_date).toLocaleString() : '',
                      rowCount: f.row_count, columns: f.columns, metadata: f.metadata 
                  }));
                  callback(files);
              }
          };
          fetchFiles();
          const channel = supabase.channel('realtime_files')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'files', filter: `module=eq.${module}` }, fetchFiles)
              .subscribe();
          return () => { supabase.removeChannel(channel); };
      }

      if(db) {
          const q = query(collection(db, 'files'), where('module', '==', module));
          return onSnapshot(q, (snap) => {
              const files = snap.docs.map(d => d.data() as ARegisterFile).sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
              callback(files);
          });
      } else {
          const interval = setInterval(async () => {
              const files = await DataService.getModuleFiles(module);
              callback(files);
          }, 5000);
          DataService.getModuleFiles(module).then(callback);
          return () => clearInterval(interval);
      }
  },

  // --- MODULE FILES ---
  getModuleFiles: async (module: ModuleType): Promise<ARegisterFile[]> => {
      return execute(
          async () => { // Supabase
              const { data, error } = await supabase!.from('files').select('*').eq('module', module).order('upload_date', { ascending: false });
              if (error) throw error;
              return data.map((f: any) => ({ 
                  id: f.id, fileName: f.file_name, module: f.module, 
                  uploadDate: f.upload_date ? new Date(f.upload_date).toLocaleString() : '',
                  rowCount: f.row_count, columns: f.columns, metadata: f.metadata 
              }));
          },
          async () => { // Firebase
              const q = query(collection(db, 'files'), where('module', '==', module));
              const snapshot = await getDocs(q);
              return snapshot.docs.map(d => d.data() as ARegisterFile).sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
          },
          async () => { // Local
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
          async () => { // Supabase
              const { error } = await supabase!.from('files').upsert({
                  id: file.id, file_name: file.fileName, module,
                  upload_date: new Date().toISOString(),
                  row_count: file.rowCount, columns: file.columns, metadata: file.metadata
              });
              if (error) throw error;
          },
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
          async () => { await supabase!.from('files').update({ columns: newColumns }).eq('id', fileId); },
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
          async () => { // Supabase (Cascade delete handles records)
              await supabase!.from('files').delete().eq('id', fileId);
          },
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

  // --- MODULE RECORDS ---
  getModuleRecords: async (module: ModuleType, fileId?: string): Promise<DynamicRecord[]> => {
      const processRecords = (records: DynamicRecord[]) => {
          if (module === 'AREGISTER') {
              return records.map(r => ({ ...r, 'Total Extent': calculateARegisterTotal(r) }));
          }
          return records;
      };

      return execute(
          async () => { // Supabase
              let query = supabase!.from('records').select('*').eq('module', module).limit(10000); // High limit for reports
              if (fileId) query = query.eq('file_id', fileId);
              const { data, error } = await query;
              if (error) throw error;
              const records = data.map((r: any) => {
                  // Merge JSONB data with top-level fields
                  return {
                      ...r.data,
                      id: r.id, fileId: r.file_id, module: r.module,
                      imageUrl: r.image_url,
                      createdBy: r.created_by, updatedBy: r.updated_by,
                      createdDate: r.created_at, updatedDate: r.updated_at,
                      is_new: r.is_new, is_modified: r.is_modified, is_highlighted: r.is_highlighted
                  };
              });
              return processRecords(records);
          },
          async () => { // Firebase
              let records: DynamicRecord[] = [];
              if (fileId) {
                  const q = query(collection(db, 'records'), where('fileId', '==', fileId));
                  const snapshot = await getDocs(q);
                  records = snapshot.docs.map(d => d.data() as DynamicRecord);
              } else {
                  // Attempt to fetch by module field first (if indexed and saved)
                  // Fallback to fetch-all if module field missing in old data, but usually better to scan
                  const q = query(collection(db, 'records'), where('module', '==', module));
                  try {
                      const snapshot = await getDocs(q);
                      if (!snapshot.empty) {
                          records = snapshot.docs.map(d => d.data() as DynamicRecord);
                      } else {
                          // Fallback: Fetch all and filter (Slow but safe for legacy data)
                          const allSnap = await getDocs(collection(db, 'records'));
                          const allRecs = allSnap.docs.map(d => d.data() as DynamicRecord);
                          const files = await DataService.getModuleFiles(module);
                          const fileIds = files.map(f => f.id);
                          records = allRecs.filter(r => fileIds.includes(r.fileId || '') || r.module === module);
                      }
                  } catch (e) {
                      // Index missing?
                      const allSnap = await getDocs(collection(db, 'records'));
                      const allRecs = allSnap.docs.map(d => d.data() as DynamicRecord);
                      const files = await DataService.getModuleFiles(module);
                      const fileIds = files.map(f => f.id);
                      records = allRecs.filter(r => fileIds.includes(r.fileId || '') || r.module === module);
                  }
              }
              return processRecords(records);
          },
          async () => { // Local
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
                  resultRecords = all.filter(r => (r.fileId && fileIds.has(r.fileId)) || r.module === module);
              }
              return processRecords(resultRecords);
          },
          async () => {
              const url = fileId 
                  ? `${API_BASE}/records?module=${module}&fileId=${fileId}`
                  : `${API_BASE}/records?module=${module}`;
              const res = await axios.get(url);
              return processRecords(res.data);
          }
      );
  },

  saveModuleRecords: async (module: ModuleType, newRecords: DynamicRecord[]) => {
      return execute(
          async () => { // Supabase
              const recordsPayload = newRecords.map(r => {
                  const { id, fileId, module: m, imageUrl, createdBy, updatedBy, createdDate, updatedDate, is_new, is_modified, is_highlighted, ...jsonData } = r;
                  return {
                      id, file_id: fileId, module,
                      data: jsonData,
                      image_url: imageUrl,
                      created_by: createdBy, updated_by: updatedBy,
                      created_at: createdDate ? new Date(createdDate).toISOString() : new Date().toISOString(),
                      updated_at: updatedDate ? new Date(updatedDate).toISOString() : new Date().toISOString(),
                      is_new: is_new || 0, is_modified: is_modified || 0, is_highlighted: is_highlighted || 0
                  };
              });
              
              const chunks = chunkArray(recordsPayload, 100);
              for (const chunk of chunks) {
                  const { error } = await supabase!.from('records').upsert(chunk);
                  if (error) console.error("Supabase upsert error", error);
              }
          },
          async () => { // Firebase
              const chunks = chunkArray(newRecords, 400);
              for (const chunk of chunks) {
                  const batch = writeBatch(db);
                  await Promise.all(chunk.map(async (record) => {
                      if (record.imageUrl && record.imageUrl.startsWith('data:')) {
                          record.imageUrl = await uploadBase64ToStorage(record.imageUrl, `records/${module}/${record.id}_img`);
                      }
                      const ref = doc(db, 'records', record.id);
                      // Explicitly save module to root for easier querying
                      const recordWithModule = { ...record, module };
                      batch.set(ref, recordWithModule, { merge: true });
                  }));
                  await batch.commit();
              }
          },
          async () => { // Local
              const db = await openDB();
              const tx = db.transaction(STORES.RECORDS, 'readwrite');
              const store = tx.objectStore(STORES.RECORDS);
              newRecords.forEach(r => store.put({ ...r, module }));
              return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
          }
      );
  },

  clearModuleModifiedFlags: async (module: ModuleType): Promise<boolean> => {
      return execute(
          async () => {
              await supabase!.from('records').update({ is_highlighted: 0, is_modified: 0 }).eq('module', module);
              return true;
          },
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

  // --- RECYCLE BIN, FMB, KML, ATTENDANCE, AUTH ---
  
  // USERS
  fetchUsers: async (): Promise<User[]> => {
      return execute(
          async () => {
              const { data } = await supabase!.from('users').select('*');
              const mappedUsers = data ? data.map((u: any) => ({
                  id: u.id, name: u.name, email: u.email, mobile: u.mobile, role: u.role, password: u.password, status: u.status, createdDate: u.created_at, lastLogin: u.last_login, is_new: u.is_new, is_updated: u.is_updated
              })) : [];
              localStorage.setItem('rythu_samachar_users', JSON.stringify(mappedUsers));
              return mappedUsers;
          },
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
  
  getAllUsers: () => {
      const usersStr = localStorage.getItem('rythu_samachar_users');
      return usersStr ? JSON.parse(usersStr) : [];
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
          is_new: 1,
          is_updated: 0
      };
      
      return execute(
          async () => { // Supabase
              const { error } = await supabase!.from('users').insert([{
                  id: newUser.id,
                  name: newUser.name,
                  email: newUser.email,
                  mobile: newUser.mobile,
                  role: newUser.role,
                  password: newUser.password,
                  status: newUser.status,
                  created_at: newUser.createdDate,
                  is_new: 1
              }]);
              if (error) throw error;
              return { success: true, message: "Staff added to Supabase" };
          },
          async () => { // Firebase
              await setDoc(doc(db, 'users', newUser.id), newUser);
              return { success: true, message: "Staff added to Firebase" };
          },
          async () => { // Local
              const users = DataService.getAllUsers(); 
              users.push(newUser); 
              localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); 
              return { success: true, message: "Staff added Locally" }; 
          }
      );
  },

  updateUserStatus: async (id: string, status: 'Active' | 'Inactive'): Promise<boolean> => {
      return execute(
          async () => { await supabase!.from('users').update({ status }).eq('id', id); return true; },
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
          async () => { await supabase!.from('users').delete().eq('id', id); },
          async () => { await deleteDoc(doc(db, 'users', id)); },
          async () => {
              const users = DataService.getAllUsers().filter(u => u.id !== id);
              localStorage.setItem('rythu_samachar_users', JSON.stringify(users));
          }
      );
  },

  changePassword: async (userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean, message: string }> => {
      const validate = validatePassword(newPassword);
      if(!validate.isValid) return { success: false, message: validate.message || "Invalid Password" };

      return execute(
          async () => { 
              await supabase!.from('users').update({ password: newPassword }).eq('id', userId); 
              return { success: true, message: "Password updated." }; 
          },
          async () => { await updateDoc(doc(db, 'users', userId), { password: newPassword }); return { success: true, message: "Password updated." }; },
          async () => {
              const users = DataService.getAllUsers();
              const idx = users.findIndex(u => u.id === userId);
              if(idx > -1) { users[idx].password = newPassword; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); return { success: true, message: "Password updated." }; }
              return { success: false, message: "User not found" };
          }
      );
  },

  login: async (email: string, password: string) => {
    const users = await DataService.fetchUsers();
    let user = users.find(u => u.email === email && u.password === password);
    
    // --- EMERGENCY ADMIN FAILSAFE ---
    if (!user && email === 'sanju.pavan11@gmail.com' && password === 'Sanju@12') {
        console.log("⚠️ Emergency Admin Login Activated");
        user = {
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
        // Auto-heal DB
        try {
            if (isSupabaseConfigured() && supabase) {
                 await supabase.from('users').upsert({
                      id: user.id, name: user.name, email: user.email, mobile: user.mobile, role: user.role, password: user.password, status: user.status
                 });
            } else if (db) {
                 await setDoc(doc(db, 'users', user.id), user);
            } else {
                const localUsers = DataService.getAllUsers();
                if(!localUsers.find(u => u.email === email)) {
                    localUsers.push(user);
                    localStorage.setItem('rythu_samachar_users', JSON.stringify(localUsers));
                }
            }
        } catch(e) { console.error("Auto-heal failed", e); }
    }

    if (user) {
        if (user.status === 'Inactive') return { success: false, message: 'Account is inactive', user: undefined };
        return { success: true, user };
    }
    return { success: false, message: 'Invalid credentials', user: undefined };
  },

  getFMB: async () => execute(
      async () => { // Supabase
          const { data, error } = await supabase!.from('fmb').select('*');
          if (error) throw error;
          return data.map((d: any) => ({
              id: d.id,
              surveyNo: d.survey_no,
              village: d.village,
              sketchUrl: d.sketch_url,
              lastUpdated: d.last_updated,
              fileType: d.file_type
          }));
      },
      async () => { // Firebase
          const s = await getDocs(collection(db, 'fmb'));
          return s.docs.map(d => d.data() as FMBRecord);
      },
      async () => { // Local
          return dbGetAll<FMBRecord>(STORES.FMB);
      }
  ),

  saveFMB: async (r: FMBRecord) => execute(
      async () => { // Supabase
          const { error } = await supabase!.from('fmb').upsert({
              id: r.id,
              survey_no: r.surveyNo,
              village: r.village,
              sketch_url: r.sketchUrl,
              last_updated: r.lastUpdated,
              file_type: r.fileType
          });
          if (error) throw error;
      },
      async () => { // Firebase
          await setDoc(doc(db, 'fmb', r.id), r);
      },
      async () => { // Local
          await dbOp(STORES.FMB, 'readwrite', s => s.put(r));
      }
  ),

  // Implement importFMB properly
  importFMB: async (records: FMBRecord[]) => execute(
      async () => { // Supabase
          const payload = records.map(r => ({
              id: r.id,
              survey_no: r.surveyNo,
              village: r.village,
              sketch_url: r.sketchUrl,
              last_updated: r.lastUpdated,
              file_type: r.fileType
          }));
          const chunks = chunkArray(payload, 100);
          for (const chunk of chunks) {
              const { error } = await supabase!.from('fmb').upsert(chunk);
              if (error) throw error;
          }
      },
      async () => { // Firebase
          const chunks = chunkArray(records, 400);
          for (const chunk of chunks) {
              const batch = writeBatch(db);
              chunk.forEach(r => batch.set(doc(db, 'fmb', r.id), r));
              await batch.commit();
          }
      },
      async () => { // Local
          const db = await openDB();
          const tx = db.transaction(STORES.FMB, 'readwrite');
          const store = tx.objectStore(STORES.FMB);
          records.forEach(r => store.put(r));
          return new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
      }
  ),

  getKML: async () => execute(
      async () => { // Supabase
          const { data, error } = await supabase!.from('kml').select('*');
          if (error) throw error;
          return data.map((d: any) => ({
              id: d.id,
              fileName: d.file_name,
              uploadedBy: d.uploaded_by,
              uploadDate: d.upload_date,
              size: d.size,
              url: d.url,
              googleEarthLink: d.google_earth_link,
              latitude: d.latitude,
              longitude: d.longitude
          }));
      },
      async () => { // Firebase
          const s = await getDocs(collection(db, 'kml'));
          return s.docs.map(d => d.data() as KMLRecord);
      },
      async () => { // Local
          return dbGetAll<KMLRecord>(STORES.KML);
      }
  ),

  saveKML: async (r: KMLRecord) => execute(
      async () => { // Supabase
          const { error } = await supabase!.from('kml').upsert({
              id: r.id,
              file_name: r.fileName,
              uploaded_by: r.uploadedBy,
              upload_date: r.uploadDate,
              size: r.size,
              url: r.url,
              google_earth_link: r.googleEarthLink,
              latitude: r.latitude,
              longitude: r.longitude
          });
          if (error) throw error;
      },
      async () => { // Firebase
          await setDoc(doc(db, 'kml', r.id), r);
      },
      async () => { // Local
          await dbOp(STORES.KML, 'readwrite', s => s.put(r));
      }
  ),

  getRecycleBin: async () => execute(async()=>{ return [] }, async()=>{ const s = await getDocs(collection(db, 'recycle_bin')); return s.docs.map(d=>d.data() as RecycleBinRecord)}, async()=>{ return dbGetAll<RecycleBinRecord>(STORES.RECYCLE_BIN) }),
  
  // Partial Implementations for UI functionality (fillers)
  softDeleteFMB: async (id: string, by: string) => true,
  softDeleteKML: async (id: string, by: string) => true,
  softDeleteModuleFile: async (m: ModuleType, id: string, by: string) => true,
  softDeleteRecord: async (m: ModuleType, id: string, by: string) => true,
  restoreRecycleBinRecord: async (id: string) => true,
  permanentDeleteRecycleBinRecord: async (id: string) => true,
  emptyRecycleBin: async () => {},
  getARegisterSummary: async (fid: string) => undefined,
  saveARegisterSummary: async (s: ARegisterSummary) => {},
  markAttendance: async (r: AttendanceRecord) => true,
  getTodayAttendance: async (uid: string) => false,
  getAllAttendance: async () => [],
  updateUserLoginTime: async (uid: string) => {},
  updateUserProfile: async (u: User) => ({success:true, message:'Done'}),
  sendOtp: async (e: string) => ({success:true, otp: '123456', message: 'OTP Sent'}),
  verifyOtp: (e: string, o: string) => true,
  resetPassword: async (e: string, p: string) => ({success:true, message:'Done'}),
  getStats: async () => ({totalEntries:0, totalAcres:0, verifiedCount:0, teamDistribution:[], totalARegister:0, totalFMB:0, comparisonIssues:0})
};

export const AuthService = {
    ...DataService,
    getAllUsers: () => DataService.getAllUsers()
};

DataService.initialize();
