import { User, UserRole, DashboardStats, FMBRecord, KMLRecord, ARegisterFile, RecycleBinRecord, DynamicRecord, ModuleType, ARegisterSummary, AttendanceRecord } from '../types';

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

// --- IMAGE UPLOAD HELPER (OFFLINE MOCK) ---
const uploadBase64ToStorage = async (base64String: string, path: string): Promise<string> => {
    // In Offline Mode, we just return the Base64 string to be stored directly in IndexedDB
    return base64String;
};

const validatePassword = (password: string): { isValid: boolean, message?: string } => {
  if (password.length < 8) return { isValid: false, message: "Password must be at least 8 characters long." };
  if (!/[A-Z]/.test(password)) return { isValid: false, message: "Password must contain at least one uppercase letter." };
  if (!/[a-z]/.test(password)) return { isValid: false, message: "Password must contain at least one lowercase letter." };
  if (!/\d/.test(password)) return { isValid: false, message: "Password must contain at least one digit." };
  if (!/[@$!%*?&]/.test(password)) return { isValid: false, message: "Password must contain at least one special character (@$!%*?&)." };
  return { isValid: true };
};

const otpStore: Record<string, { code: string, expires: number }> = {};

export const DataService = {
  initialize: async () => {
      // Force initialization of local mode
      console.log("Initializing Offline Mode (IndexedDB).");
      DataService.initializeLocal();
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
      const allFiles = await dbGetAll<ARegisterFile>(STORES.FILES);
      return allFiles.filter(f => f.module === module).sort((a,b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
  },

  saveModuleFile: async (module: ModuleType, file: ARegisterFile) => {
      const fileWithModule = { ...file, module };
      await dbOp(STORES.FILES, 'readwrite', store => store.put(fileWithModule));
  },

  updateModuleFileColumns: async (module: ModuleType, fileId: string, newColumns: string[]) => {
      const files = await dbGetAll<ARegisterFile>(STORES.FILES);
      const file = files.find(f => f.id === fileId);
      if (file) { file.columns = newColumns; await dbOp(STORES.FILES, 'readwrite', store => store.put(file)); }
  },

  deleteModuleFile: async (module: ModuleType, fileId: string) => {
      await dbOp(STORES.FILES, 'readwrite', store => store.delete(fileId));
      const db = await openDB();
      const tx = db.transaction(STORES.RECORDS, 'readwrite');
      const store = tx.objectStore(STORES.RECORDS);
      const index = store.index('fileId');
      const request = index.getAllKeys(fileId);
      request.onsuccess = () => { request.result.forEach(key => store.delete(key)); };
      return new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  },

  softDeleteModuleFile: async (module: ModuleType, fileId: string, deletedBy: string): Promise<boolean> => {
      const file = await dbOp<ARegisterFile>(STORES.FILES, 'readonly', store => store.get(fileId));
      if (!file) return false;
      const binItem: RecycleBinRecord = {
          id: file.id, fileId: file.id, deletedAt: new Date().toISOString(), deletedBy, originalFileId: file.id, sourceModule: `${module}_FILE`, originalData: file, fileName: file.fileName
      };
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.put(binItem));
      await dbOp(STORES.FILES, 'readwrite', store => store.delete(fileId));
      return true;
  },

  // --- MODULE RECORDS ---
  getModuleRecords: async (module: ModuleType, fileId?: string): Promise<DynamicRecord[]> => {
      const processRecords = (records: DynamicRecord[]) => {
          if (module === 'AREGISTER') {
              return records.map(r => ({ ...r, 'Total Extent': calculateARegisterTotal(r) }));
          }
          return records;
      };

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

  saveModuleRecords: async (module: ModuleType, newRecords: DynamicRecord[]) => {
      const db = await openDB();
      const tx = db.transaction(STORES.RECORDS, 'readwrite');
      const store = tx.objectStore(STORES.RECORDS);
      
      // Handle base64 logic if needed (it just passes through in offline mode)
      for (const record of newRecords) {
          store.put(record);
      }
      
      return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  },

  clearModuleModifiedFlags: async (module: ModuleType): Promise<boolean> => {
      const records = await DataService.getModuleRecords(module);
      const updatedRecords = records.map(r => ({ ...r, is_highlighted: 0, is_modified: 0 }));
      await DataService.saveModuleRecords(module, updatedRecords);
      return true;
  },

  getARegisterSummary: async (fileId: string): Promise<ARegisterSummary | undefined> => {
      return dbOp<ARegisterSummary>(STORES.SUMMARIES, 'readonly', store => store.get(fileId));
  },

  saveARegisterSummary: async (summary: ARegisterSummary) => {
      await dbOp(STORES.SUMMARIES, 'readwrite', store => store.put(summary));
  },

  // --- RECYCLE BIN ---
  getRecycleBin: async (): Promise<RecycleBinRecord[]> => {
      return dbGetAll<RecycleBinRecord>(STORES.RECYCLE_BIN);
  },

  emptyRecycleBin: async () => {
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.clear());
  },

  softDeleteRecord: async (module: ModuleType, id: string, deletedBy: string): Promise<boolean> => {
      const record = await dbOp<DynamicRecord>(STORES.RECORDS, 'readonly', store => store.get(id));
      if (!record) return false;
      const binItem: RecycleBinRecord = { ...record, deletedAt: new Date().toISOString(), deletedBy, originalFileId: record.fileId || 'unknown', sourceModule: `${module}_ROW`, originalData: record };
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.put(binItem));
      await dbOp(STORES.RECORDS, 'readwrite', store => store.delete(id));
      return true;
  },

  softDeleteFMB: async (id: string, deletedBy: string): Promise<boolean> => {
      const record = await dbOp<FMBRecord>(STORES.FMB, 'readonly', s => s.get(id));
      if(!record) return false;
      const binItem = { ...record, deletedAt: new Date().toISOString(), deletedBy, originalFileId: 'N/A', sourceModule: 'FMB', originalData: record };
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', s => s.put(binItem));
      await dbOp(STORES.FMB, 'readwrite', s => s.delete(id));
      return true;
  },

  softDeleteKML: async (id: string, deletedBy: string): Promise<boolean> => {
      const record = await dbOp<KMLRecord>(STORES.KML, 'readonly', s => s.get(id));
      if(!record) return false;
      const binItem = { ...record, deletedAt: new Date().toISOString(), deletedBy, originalFileId: 'N/A', sourceModule: 'KML', originalData: record };
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', s => s.put(binItem));
      await dbOp(STORES.KML, 'readwrite', s => s.delete(id));
      return true;
  },

  restoreRecycleBinRecord: async (id: string): Promise<boolean> => {
      const record = await dbOp<RecycleBinRecord>(STORES.RECYCLE_BIN, 'readonly', s => s.get(id));
      if (!record) return false;
      
      const { deletedAt, deletedBy, originalFileId, sourceModule, originalData, ...cleanData } = record;
      const dataToRestore = originalData || cleanData;

      let localTarget = STORES.RECORDS;
      if (sourceModule === 'FMB') localTarget = STORES.FMB;
      if (sourceModule === 'KML') localTarget = STORES.KML;
      if (sourceModule?.endsWith('_FILE')) localTarget = STORES.FILES;

      await dbOp(localTarget, 'readwrite', s => s.put(dataToRestore));
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', s => s.delete(id));
      return true;
  },

  permanentDeleteRecycleBinRecord: async (id: string): Promise<boolean> => {
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', s => s.delete(id)); 
      return true;
  },

  // --- FMB & KML ---
  getFMB: async (): Promise<FMBRecord[]> => {
      return dbGetAll<FMBRecord>(STORES.FMB);
  },
  saveFMB: async (record: FMBRecord) => {
      await dbOp(STORES.FMB, 'readwrite', s => s.put(record));
  },
  importFMB: async (newRecords: FMBRecord[]) => {
      const db = await openDB();
      const tx = db.transaction(STORES.FMB, 'readwrite');
      const store = tx.objectStore(STORES.FMB);
      newRecords.forEach(r => store.put(r));
      return new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  },

  getKML: async (): Promise<KMLRecord[]> => {
      return dbGetAll<KMLRecord>(STORES.KML);
  },
  saveKML: async (record: KMLRecord) => {
      await dbOp(STORES.KML, 'readwrite', s => s.put(record));
  },

  // --- ATTENDANCE ---
  markAttendance: async (record: AttendanceRecord): Promise<boolean> => {
      await dbOp(STORES.ATTENDANCE, 'readwrite', s => s.put(record));
      return true;
  },
  
  getTodayAttendance: async (userId: string): Promise<boolean> => {
      const today = new Date().toISOString().split('T')[0];
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
  },
  
  getAllAttendance: async (): Promise<AttendanceRecord[]> => {
      return dbGetAll<AttendanceRecord>(STORES.ATTENDANCE);
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
      return DataService.getAllUsers();
  },

  login: async (email: string, password: string): Promise<{ success: boolean, user?: User, message?: string }> => {
      const users = DataService.getAllUsers();
      const user = users.find(u => u.email === email && u.password === password);
      if (user) {
          if (user.status === 'Inactive') return { success: false, message: "Account Deactivated." };
          return { success: true, user };
      }
      return { success: false, message: "Invalid Email or Password" };
  },
  
  updateUserLoginTime: async (userId: string) => {
      const users = DataService.getAllUsers();
      const u = users.find(u => u.id === userId);
      if(u) { u.lastLogin = new Date().toISOString(); localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); }
  },

  changePassword: async (userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean, message: string }> => {
      const validate = validatePassword(newPassword);
      if(!validate.isValid) return { success: false, message: validate.message || "Invalid Password" };

      const users = DataService.getAllUsers();
      const idx = users.findIndex(u => u.id === userId);
      if(idx > -1) { users[idx].password = newPassword; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); return { success: true, message: "Password updated." }; }
      return { success: false, message: "User not found" };
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
      
      const users = DataService.getAllUsers(); 
      users.push(newUser); 
      localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); 
      return { success: true, message: "Staff added" }; 
  },

  updateUserProfile: async (user: User): Promise<{ success: boolean, message: string }> => {
      const users = DataService.getAllUsers();
      const idx = users.findIndex(u => u.id === user.id);
      if(idx > -1) { users[idx] = { ...users[idx], ...user, is_updated: 1 }; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); }
      return { success: true, message: "Profile updated" };
  },

  updateUserStatus: async (id: string, status: 'Active' | 'Inactive'): Promise<boolean> => {
      const users = DataService.getAllUsers();
      const u = users.find(u => u.id === id);
      if(u) { u.status = status; localStorage.setItem('rythu_samachar_users', JSON.stringify(users)); }
      return true;
  },

  deleteUser: async (id: string) => {
      const users = DataService.getAllUsers().filter(u => u.id !== id);
      localStorage.setItem('rythu_samachar_users', JSON.stringify(users));
  },
  
  sendOtp: async (email: string): Promise<{ success: boolean, otp?: string, message?: string }> => {
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
      
      const localUsers = DataService.getAllUsers();
      const idx = localUsers.findIndex(u => u.id === user.id);
      if(idx > -1) { localUsers[idx].password = pass; localStorage.setItem('rythu_samachar_users', JSON.stringify(localUsers)); }
      return { success: true, message: "Password Reset" };
  }
};

export const AuthService = {
    ...DataService,
    getAllUsers: () => DataService.getAllUsers()
};

DataService.initialize();