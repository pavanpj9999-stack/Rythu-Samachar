import { User, UserRole, DashboardStats, FMBRecord, KMLRecord, ARegisterFile, RecycleBinRecord, DynamicRecord, ModuleType, ARegisterSummary, AttendanceRecord } from '../types';

// --- INDEXED DB HELPER ---
const DB_NAME = 'RythuPortalDB';
const DB_VERSION = 4; // Incremented for Attendance Store
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
        
        tx.oncomplete = () => {
            if (request && 'result' in request) resolve(request.result);
            else resolve(undefined as unknown as T);
        };
        tx.onerror = () => reject(tx.error);
        if (request) request.onerror = () => reject(request.error);
    });
};

const dbGetAll = async <T>(storeName: string): Promise<T[]> => {
    return dbOp<T[]>(storeName, 'readonly', store => store.getAll());
};

// Storage Keys for LocalStorage (Auth Only)
const KEYS = {
  USERS: 'rythu_samachar_users',
  APP_CONFIG: 'rythu_app_config'
};

// Legacy keys to clean up to fix QuotaExceededError
const LEGACY_KEYS = [
    'rythu_aregister_files', 'rythu_aregister_records',
    'rythu_6a_files', 'rythu_6a_records',
    'rythu_rythu_details_files', 'rythu_rythu_details_records',
    'rythu_adangal_files', 'rythu_adangal_records',
    'rythu_fmb', 'rythu_kml', 'rythu_recycle_bin',
    'rythu_files', 'rythu_records'
];

// --- PASSWORD UTILS ---
const validatePassword = (password: string): { isValid: boolean, message?: string } => {
  if (password.length < 8) return { isValid: false, message: "Password must be at least 8 characters long." };
  if (!/[A-Z]/.test(password)) return { isValid: false, message: "Password must contain at least one uppercase letter." };
  if (!/[a-z]/.test(password)) return { isValid: false, message: "Password must contain at least one lowercase letter." };
  if (!/\d/.test(password)) return { isValid: false, message: "Password must contain at least one digit." };
  if (!/[@$!%*?&]/.test(password)) return { isValid: false, message: "Password must contain at least one special character (@$!%*?&)." };
  return { isValid: true };
};

// --- HELPER: CALCULATE TOTAL EXTENT (BACKEND LOGIC SIMULATION) ---
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
        // Skip metadata and the Total Extent field itself if it exists
        if(['id', 'fileId', 'is_new', 'is_updated', 'Total Extent'].includes(key)) return;
        
        // Check if column name matches any extent keyword
        if (EXTENT_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
            const val = record[key];
            if(val) {
                // Parse number from string (e.g. "1.25 Ac" -> 1.25)
                const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
                if(!isNaN(num)) total += num;
            }
        }
    });
    return total.toFixed(2);
};

// --- OTP STORAGE (In-Memory for Mock) ---
const otpStore: Record<string, { code: string, expires: number }> = {};

export const DataService = {
  initialize: () => {
    // --- CLEANUP LEGACY DATA TO FIX QUOTA ERRORS ---
    try {
        LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
    } catch (e) {
        console.warn("Failed to clean up legacy keys", e);
    }

    // --- ADMIN ACCOUNT INITIALIZATION (LocalStorage) ---
    const usersStr = localStorage.getItem(KEYS.USERS);
    let users: User[] = usersStr ? JSON.parse(usersStr) : [];
    
    // Migration for status
    let migrationNeeded = false;
    users = users.map(u => {
        if (!u.status) {
            u.status = 'Active';
            migrationNeeded = true;
        }
        return u;
    });

    const adminExists = users.find(u => u.email === 'sanju.pavan11@gmail.com');
    if (!adminExists) {
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
        migrationNeeded = true;
    }
    
    if (migrationNeeded) localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  },

  // --- APP CONFIGURATION (Logo etc) ---
  getAppConfig: () => {
      try {
        const stored = localStorage.getItem(KEYS.APP_CONFIG);
        return stored ? JSON.parse(stored) : { logo: '/ryathu.jpg' };
      } catch {
          return { logo: '/ryathu.jpg' };
      }
  },

  updateAppLogo: (logoBase64: string) => {
      const config = DataService.getAppConfig();
      config.logo = logoBase64;
      localStorage.setItem(KEYS.APP_CONFIG, JSON.stringify(config));
      // Dispatch event so components can update live
      window.dispatchEvent(new Event('appConfigUpdated'));
      return { success: true };
  },

  resetAppLogo: () => {
      const config = DataService.getAppConfig();
      config.logo = '/ryathu.jpg';
      localStorage.setItem(KEYS.APP_CONFIG, JSON.stringify(config));
      window.dispatchEvent(new Event('appConfigUpdated'));
      return { success: true };
  },

  // --- BACKUP & RESTORE SYSTEM ---
  exportDatabase: async (): Promise<string> => {
      const db = await openDB();
      const exportData: any = {};
      const storeNames = Array.from(db.objectStoreNames);
      
      for (const storeName of storeNames) {
          exportData[storeName] = await dbGetAll(storeName);
      }
      
      // Also include LocalStorage Users/Config
      exportData['localStorage_users'] = localStorage.getItem(KEYS.USERS);
      exportData['localStorage_config'] = localStorage.getItem(KEYS.APP_CONFIG);
      
      return JSON.stringify(exportData);
  },

  importDatabase: async (jsonString: string): Promise<boolean> => {
      try {
          const data = JSON.parse(jsonString);
          const db = await openDB();
          
          // Restore IndexedDB Stores
          const tx = db.transaction(db.objectStoreNames, 'readwrite');
          
          for (const storeName of Array.from(db.objectStoreNames)) {
              if (data[storeName]) {
                  const store = tx.objectStore(storeName);
                  await store.clear();
                  for (const item of data[storeName]) {
                      await store.put(item);
                  }
              }
          }
          
          // Restore LocalStorage
          if (data['localStorage_users']) localStorage.setItem(KEYS.USERS, data['localStorage_users']);
          if (data['localStorage_config']) localStorage.setItem(KEYS.APP_CONFIG, data['localStorage_config']);
          
          return new Promise((resolve) => {
              tx.oncomplete = () => resolve(true);
              tx.onerror = () => resolve(false);
          });
      } catch (e) {
          console.error("Import failed", e);
          return false;
      }
  },

  // --- MODULE HANDLERS (Async / IndexedDB) ---
  
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
      if (file) {
          file.columns = newColumns;
          await dbOp(STORES.FILES, 'readwrite', store => store.put(file));
      }
  },

  // PERMANENT DELETE (Direct)
  deleteModuleFile: async (module: ModuleType, fileId: string) => {
      // 1. Remove File Metadata
      await dbOp(STORES.FILES, 'readwrite', store => store.delete(fileId));
      
      // 2. Remove Active Records linked to file
      const db = await openDB();
      const tx = db.transaction(STORES.RECORDS, 'readwrite');
      const store = tx.objectStore(STORES.RECORDS);
      const index = store.index('fileId');
      const request = index.getAllKeys(fileId);
      
      request.onsuccess = () => {
          const keys = request.result;
          keys.forEach(key => store.delete(key));
      };
      
      return new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  },

  // SOFT DELETE MODULE FILE (Moves File Metadata to Bin)
  softDeleteModuleFile: async (module: ModuleType, fileId: string, deletedBy: string): Promise<boolean> => {
      const file = await dbOp<ARegisterFile>(STORES.FILES, 'readonly', store => store.get(fileId));
      if (!file) return false;

      const binItem: RecycleBinRecord = {
          id: file.id,
          fileId: file.id, // self reference
          deletedAt: new Date().toISOString(),
          deletedBy: deletedBy,
          originalFileId: file.id,
          sourceModule: `${module}_FILE`, // Mark as FILE
          originalData: file, // Store full file object
          fileName: file.fileName // Helpful for preview
      };

      await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.put(binItem));
      await dbOp(STORES.FILES, 'readwrite', store => store.delete(fileId));
      
      return true;
  },

  getModuleRecords: async (module: ModuleType, fileId?: string): Promise<DynamicRecord[]> => {
      let resultRecords: DynamicRecord[] = [];

      if (fileId) {
          const db = await openDB();
          resultRecords = await new Promise((resolve) => {
              const tx = db.transaction(STORES.RECORDS, 'readonly');
              const store = tx.objectStore(STORES.RECORDS);
              const index = store.index('fileId');
              const request = index.getAll(fileId);
              request.onsuccess = () => resolve(request.result);
          });
      } else {
          // If no fileId, we must find all files for this module first
          const files = await DataService.getModuleFiles(module);
          const fileIds = new Set(files.map(f => f.id));
          
          const allRecords = await dbGetAll<DynamicRecord>(STORES.RECORDS);
          resultRecords = allRecords.filter(r => r.fileId && fileIds.has(r.fileId));
      }

      // --- BACKEND LOGIC: AUTOMATICALLY CALCULATE TOTAL EXTENT FOR A-REGISTER ---
      if (module === 'AREGISTER') {
          return resultRecords.map(record => ({
              ...record,
              'Total Extent': calculateARegisterTotal(record)
          }));
      }

      return resultRecords;
  },

  saveModuleRecords: async (module: ModuleType, newRecords: DynamicRecord[]) => {
      const db = await openDB();
      const tx = db.transaction(STORES.RECORDS, 'readwrite');
      const store = tx.objectStore(STORES.RECORDS);
      
      newRecords.forEach(r => {
          // DO NOT auto-set highlighting here. 
          // Highlighting (is_modified) is controlled by the frontend action (Edit/Add vs Bulk Upload).
          store.put(r);
      });

      return new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
      });
  },

  // --- CLEAR MODIFIED FLAGS (Admin Only) ---
  // Resets the Pink Highlight (is_modified) and legacy is_highlighted
  clearModuleModifiedFlags: async (module: ModuleType): Promise<boolean> => {
      try {
          const records = await DataService.getModuleRecords(module);
          const updatedRecords = records.map(r => ({ 
              ...r, 
              is_highlighted: 0,
              is_modified: 0 
          }));
          await DataService.saveModuleRecords(module, updatedRecords);
          return true;
      } catch (e) {
          console.error("Failed to clear highlights", e);
          return false;
      }
  },

  // --- CLEAR HIGHLIGHTS (Legacy) ---
  clearModuleHighlights: async (module: ModuleType): Promise<boolean> => {
      return DataService.clearModuleModifiedFlags(module);
  },

  // --- A-Register Summary Handlers ---
  getARegisterSummary: async (fileId: string): Promise<ARegisterSummary | undefined> => {
      const summary = await dbOp<ARegisterSummary>(STORES.SUMMARIES, 'readonly', store => store.get(fileId));
      return summary;
  },

  saveARegisterSummary: async (summary: ARegisterSummary) => {
      await dbOp(STORES.SUMMARIES, 'readwrite', store => store.put(summary));
  },

  // --- RECYCLE BIN LOGIC ---
  getRecycleBin: async (): Promise<RecycleBinRecord[]> => {
      return dbGetAll<RecycleBinRecord>(STORES.RECYCLE_BIN);
  },

  emptyRecycleBin: async () => {
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.clear());
  },

  softDeleteRecord: async (module: ModuleType, id: string, deletedBy: string): Promise<boolean> => {
      const record = await dbOp<DynamicRecord>(STORES.RECORDS, 'readonly', store => store.get(id));
      
      if (!record) return false;

      // 1. Create Recycle Bin Entry
      const binItem: RecycleBinRecord = {
          ...record,
          deletedAt: new Date().toISOString(),
          deletedBy: deletedBy,
          originalFileId: record.fileId || 'unknown',
          sourceModule: `${module}_ROW`, // Differentiate Row vs File
          originalData: record
      };

      // 2. Add to Bin
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.put(binItem));

      // 3. Remove from Active List
      await dbOp(STORES.RECORDS, 'readwrite', store => store.delete(id));

      return true;
  },

  // --- FIXED FMB DELETE LOGIC ---
  softDeleteFMB: async (id: string, deletedBy: string): Promise<boolean> => {
    try {
        const record = await dbOp<FMBRecord>(STORES.FMB, 'readonly', store => store.get(id));
        if (!record) {
            console.error("FMB Record not found for soft delete:", id);
            return false;
        }

        const binItem: RecycleBinRecord = {
            ...record,
            deletedAt: new Date().toISOString(),
            deletedBy,
            originalFileId: 'N/A',
            sourceModule: 'FMB',
            originalData: record
        };

        await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.put(binItem));
        await dbOp(STORES.FMB, 'readwrite', store => store.delete(id));
        return true;
    } catch (e) {
        console.error("FMB Soft Delete Error", e);
        return false;
    }
  },

  // --- FIXED KML DELETE LOGIC ---
  softDeleteKML: async (id: string, deletedBy: string): Promise<boolean> => {
    try {
        const record = await dbOp<KMLRecord>(STORES.KML, 'readonly', store => store.get(id));
        if (!record) {
            console.error("KML Record not found for soft delete:", id);
            return false;
        }

        const binItem: RecycleBinRecord = {
            ...record,
            deletedAt: new Date().toISOString(),
            deletedBy,
            originalFileId: 'N/A',
            sourceModule: 'KML',
            originalData: record
        };

        await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.put(binItem));
        await dbOp(STORES.KML, 'readwrite', store => store.delete(id));
        return true;
    } catch (e) {
        console.error("KML Soft Delete Error", e);
        return false;
    }
  },

  restoreRecycleBinRecord: async (id: string): Promise<boolean> => {
      const recordToRestore = await dbOp<RecycleBinRecord>(STORES.RECYCLE_BIN, 'readonly', store => store.get(id));
      
      if (!recordToRestore) return false;

      // 1. Extract original data (preferred) or use record fields
      const originalData = recordToRestore.originalData || recordToRestore;
      const { deletedAt, deletedBy, originalFileId, sourceModule, ...cleanData } = originalData;
      
      // 2. Add back to Active List based on Source Module
      if (recordToRestore.sourceModule === 'FMB') {
          await dbOp(STORES.FMB, 'readwrite', store => store.put(cleanData));
      } else if (recordToRestore.sourceModule === 'KML') {
          await dbOp(STORES.KML, 'readwrite', store => store.put(cleanData));
      } else if (recordToRestore.sourceModule && recordToRestore.sourceModule.endsWith('_FILE')) {
          // It's a file metadata (Adangal / Rythu File)
          await dbOp(STORES.FILES, 'readwrite', store => store.put(cleanData));
      } else {
          // Default for Excel-based rows (AREGISTER_ROW, DATA_6A_ROW, etc.)
          await dbOp(STORES.RECORDS, 'readwrite', store => store.put(cleanData));
      }

      // 3. Remove from Bin
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.delete(id));

      return true;
  },

  permanentDeleteRecycleBinRecord: async (id: string): Promise<boolean> => {
      await dbOp(STORES.RECYCLE_BIN, 'readwrite', store => store.delete(id));
      return true;
  },
  
  // --- FMB & KML Handlers ---
  getFMB: async (): Promise<FMBRecord[]> => {
    return dbGetAll<FMBRecord>(STORES.FMB);
  },
  saveFMB: async (record: FMBRecord) => {
    await dbOp(STORES.FMB, 'readwrite', store => store.put(record));
  },
  deleteFMB: async (id: string): Promise<boolean> => {
    try {
        await dbOp(STORES.FMB, 'readwrite', store => store.delete(id));
        return true;
    } catch (e) {
        console.error("Error deleting FMB", e);
        return false;
    }
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
    await dbOp(STORES.KML, 'readwrite', store => store.put(record));
  },
  deleteKML: async (id: string): Promise<boolean> => {
    try {
        await dbOp(STORES.KML, 'readwrite', store => store.delete(id));
        return true;
    } catch (e) {
        console.error("Error deleting KML", e);
        return false;
    }
  },

  // --- ATTENDANCE SYSTEM ---
  markAttendance: async (record: AttendanceRecord): Promise<boolean> => {
      try {
          await dbOp(STORES.ATTENDANCE, 'readwrite', store => store.put(record));
          return true;
      } catch(e) {
          console.error("Attendance Mark Error", e);
          return false;
      }
  },
  
  getTodayAttendance: async (userId: string): Promise<boolean> => {
      try {
          const db = await openDB();
          const today = new Date().toISOString().split('T')[0];
          return new Promise((resolve) => {
              const tx = db.transaction(STORES.ATTENDANCE, 'readonly');
              const store = tx.objectStore(STORES.ATTENDANCE);
              const index = store.index('userId');
              const request = index.getAll(userId);
              
              request.onsuccess = () => {
                  const records = request.result as AttendanceRecord[];
                  const hasMarkedToday = records.some(r => r.date === today);
                  resolve(hasMarkedToday);
              };
              request.onerror = () => resolve(false);
          });
      } catch(e) {
          return false;
      }
  },
  
  getAllAttendance: async (): Promise<AttendanceRecord[]> => {
      return dbGetAll<AttendanceRecord>(STORES.ATTENDANCE);
  },

  // --- STATS (Async) ---
  getStats: async (): Promise<DashboardStats> => {
    const areg = await DataService.getModuleRecords('AREGISTER');
    const data6a = await DataService.getModuleRecords('DATA_6A');
    const fmb = await DataService.getFMB();
    
    let totalAcres = 0;
    
    [...areg, ...data6a].forEach(r => {
        const val = r['Extent'] || r['Acres'] || r['extent'] || r['acres'] || 0;
        const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
        if(!isNaN(num)) totalAcres += num;
    });

    return {
      totalEntries: areg.length + data6a.length,
      totalAcres: parseFloat(totalAcres.toFixed(2)),
      verifiedCount: 0,
      teamDistribution: [{ name: 'Team 1', value: 10 }, { name: 'Team 2', value: 15 }],
      totalARegister: areg.length,
      totalFMB: fmb.length,
      comparisonIssues: 0
    };
  },

  // --- AUTH SERVICES (Sync - LocalStorage) ---
  getAllUsers: (): User[] => {
      const usersStr = localStorage.getItem(KEYS.USERS);
      let users: User[] = usersStr ? JSON.parse(usersStr) : [];
      return users.map(u => ({ ...u, status: u.status || 'Active' }));
  },

  login: (email: string, password: string): { success: boolean, user?: User, message?: string } => {
    const usersStr = localStorage.getItem(KEYS.USERS);
    if(usersStr) {
        const users: User[] = JSON.parse(usersStr);
        const user = users.find(u => u.email === email && u.password === password);
        if (user) {
            if (user.status === 'Inactive') return { success: false, message: "Account Deactivated." };
            // Update last login
            // user.lastLogin = new Date().toISOString(); 
            // Note: We update lastLogin in Auth component now to handle Attendance flow
            return { success: true, user };
        }
        return { success: false, message: "Invalid Email or Password" };
    }
    return { success: false, message: "System Error" };
  },
  
  updateUserLoginTime: (userId: string) => {
      const users = AuthService.getAllUsers();
      const index = users.findIndex(u => u.id === userId);
      if(index > -1) {
          users[index].lastLogin = new Date().toISOString();
          localStorage.setItem(KEYS.USERS, JSON.stringify(users));
      }
  },

  changePassword: (userId: string, currentPassword: string, newPassword: string): { success: boolean, message: string } => {
      const usersStr = localStorage.getItem(KEYS.USERS);
      if (!usersStr) return { success: false, message: "User database error." };

      const users: User[] = JSON.parse(usersStr);
      const userIndex = users.findIndex(u => u.id === userId);

      if (userIndex === -1) return { success: false, message: "User not found." };

      const user = users[userIndex];

      // 1. Verify Current Password
      if (user.password !== currentPassword) {
          return { success: false, message: "Incorrect current password." };
      }

      // 2. Validate New Password Complexity
      const validation = validatePassword(newPassword);
      if (!validation.isValid) {
          return { success: false, message: validation.message || "Invalid password format." };
      }

      // 3. Update Password
      users[userIndex].password = newPassword;
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));

      return { success: true, message: "Password updated successfully." };
  },

  addStaff: (user: Partial<User>): { success: boolean, message: string } => {
      if(!user.password) return { success: false, message: "Password required" };
      const validation = validatePassword(user.password);
      if(!validation.isValid) return { success: false, message: validation.message || 'Invalid Password' };

      const users = AuthService.getAllUsers();
      if(users.some(u => u.email === user.email)) return { success: false, message: "Email already exists" };

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
      
      users.push(newUser);
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
      return { success: true, message: "Staff added successfully" };
  },

  updateUserProfile: (user: User): { success: boolean, message: string } => {
    const users = AuthService.getAllUsers();
    const index = users.findIndex(u => u.id === user.id);
    if (index === -1) return { success: false, message: "User not found" };
    users[index] = { ...users[index], ...user, is_updated: 1 };
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
    sessionStorage.setItem('rythu_user', JSON.stringify(users[index]));
    return { success: true, message: "Profile updated successfully" };
  },

  updateUserStatus: (id: string, status: 'Active' | 'Inactive'): boolean => {
      const users = AuthService.getAllUsers();
      const index = users.findIndex(u => u.id === id);
      if(index === -1) return false;
      if (users[index].role === UserRole.ADMIN) return false;
      users[index].status = status;
      users[index].is_updated = 1;
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
      return true;
  },

  deleteUser: (id: string) => {
      const users = AuthService.getAllUsers().filter(u => u.id !== id);
      localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  },
  
  sendOtp: (email: string): { success: boolean, otp?: string, message?: string } => {
      const users = AuthService.getAllUsers();
      const user = users.find(u => u.email === email);
      
      if (!user) return { success: false, message: "Email not registered." };
      if (user.status === 'Inactive') return { success: false, message: "Account is inactive." };

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore[email] = {
          code: otp,
          expires: Date.now() + 180000 // 3 minutes
      };
      
      return { success: true, otp };
  },

  verifyOtp: (email: string, otp: string): boolean => {
      const record = otpStore[email];
      if (!record) return false;
      if (Date.now() > record.expires) return false;
      if (record.code !== otp) return false;
      
      // Cleanup after successful verification
      delete otpStore[email];
      return true;
  },

  resetPassword: (email: string, pass: string) => ({ success: true, message: 'Done' })
};

export const AuthService = DataService;
DataService.initialize();