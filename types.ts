
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER'
}

export type ModuleType = 'AREGISTER' | 'DATA_6A' | 'RYTHU_DETAILS' | 'GENERIC' | 'ADANGAL' | 'ATTENDANCE';

export interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: UserRole;
  password?: string;
  createdDate?: string;
  otp?: string;
  otpExpiry?: number;
  status: 'Active' | 'Inactive';
  lastLogin?: string;
  dob?: string;
  bio?: string;
  is_new?: number;
  is_updated?: number;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO String
  selfieUrl: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  address?: string;
  deviceInfo: string;
  browser: string;
  ip?: string;
  jioTagStatus: 'YES' | 'NO';
  mapUrl?: string;
}

export interface ARegisterFile {
  id: string;
  fileName: string;
  uploadDate: string;
  rowCount: number;
  columns?: string[];
  module?: ModuleType;
  metadata?: any; // Stores merged cells info, row heights, etc.
}

export interface ARegisterSummary {
  fileId: string;
  totalextent: number;
  pattaDry: number;
  pattaWet: number;
  inamDry: number;
  inamWet: number;
  dottedDry: number;
  dottedWet: number;
  uaw: number;
  poramboke: number;
}

// Universal Record Interface for all Excel-based modules
export interface DynamicRecord {
  id: string;
  fileId?: string; 
  imageUrl?: string;
  documents?: DocumentFile[];
  is_new?: number;
  is_updated?: number;
  is_uploaded?: number; // 1 = Bulk Uploaded Data
  
  // Activity Tracking
  is_highlighted?: number; // Legacy flag (deprecated in favor of is_modified)
  is_modified?: number; // 1 = Manually Modified/Added (Triggers Pink Highlight)

  // Audit Fields for Team Dashboard
  createdBy?: string;
  createdDate?: string;
  updatedBy?: string;
  updatedDate?: string;
  
  [key: string]: any;
}

// Backward compatibility alias
export type ARegisterRecord = DynamicRecord;
export type FarmerRecord = DynamicRecord;

export interface RecycleBinRecord extends DynamicRecord {
  deletedAt: string;
  deletedBy: string;
  originalFileId: string;
  sourceModule: string; // Supports 'FMB' | 'KML' | 'AREGISTER_FILE' | 'ADANGAL_ROW' etc.
  originalData?: any; // To store full object for restoration
}

export interface FMBRecord {
  id: string;
  surveyNo: string;
  village: string;
  sketchUrl: string;
  lastUpdated: string;
  fileType?: string; 
}

export interface KMLRecord {
  id: string;
  fileName: string;
  uploadedBy: string;
  uploadDate: string;
  size: string;
  url: string;
  googleEarthLink?: string;
  latitude?: number;
  longitude?: number;
}

export interface DocumentFile {
  id: string;
  name: string;
  type: string;
  url: string; 
}

export interface DashboardStats {
  totalEntries: number;
  totalAcres: number;
  verifiedCount: number;
  teamDistribution: { name: string; value: number }[];
  totalARegister: number;
  totalFMB: number;
  comparisonIssues: number;
}