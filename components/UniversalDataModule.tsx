
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import { DataService } from '../services/mockDataService';
import { ARegisterFile, DynamicRecord, ModuleType, UserRole, ARegisterSummary } from '../types';
import { Search, Trash2, Edit, FileSpreadsheet, Upload, ArrowLeft, Save, Image as ImageIcon, Plus, Columns, CheckCircle, X, FileText, ChevronLeft, ChevronRight, BarChart3, RefreshCw, PlusCircle, RotateCcw, File, AlertTriangle, Eye, Download, User as UserIcon, MonitorPlay, Maximize2, Minimize2, Eraser, Loader2, Cloud, CloudOff } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface UniversalDataModuleProps {
    moduleType: ModuleType;
    title: string;
    description: string;
}

// --- HELPERS ---

const extractDispImgId = (val: any): string | null => {
    if (!val || typeof val !== 'string') return null;
    const match = val.match(/=DISPIMG\("([^"]+)"/i);
    return match ? match[1] : null;
};

const getFileType = (url: string): 'image' | 'pdf' | 'doc' | 'none' => {
    if (!url) return 'none';
    const lower = url.toLowerCase();
    if (lower.startsWith('data:application/pdf') || lower.endsWith('.pdf')) return 'pdf';
    if (lower.startsWith('data:image') || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(lower)) return 'image';
    if (lower.includes('word') || lower.endsWith('.doc') || lower.endsWith('.docx') || lower.endsWith('.txt')) return 'doc';
    return 'image'; // Default fallback
};

const parseExtent = (val: any) => {
    if (!val) return 0;
    const str = String(val).replace(/,/g, ''); 
    const match = str.match(/[\d.]+/); 
    return match ? parseFloat(match[0]) : 0;
};

// --- MEDIA CELL COMPONENT ---
const MediaCell = ({ url, isEditable, onUpload, onClick }: { url: string | null, isEditable: boolean, onUpload: (e: any) => void, onClick: () => void }) => {
    const type = getFileType(url || '');
    
    return (
        <div className="flex justify-center items-center h-full">
            {isEditable ? (
                <label className={`cursor-pointer border border-gray-200 hover:border-blue-400 rounded-lg p-1 block text-center shadow-sm relative group overflow-hidden transition-all ${url ? 'bg-white' : 'bg-gray-50 hover:bg-white'}`} style={{ width: '60px', height: '60px' }}>
                    {url ? (
                        <>
                            {type === 'pdf' ? (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 text-red-500">
                                    <FileText size={24} />
                                    <span className="text-[8px] font-bold uppercase">PDF</span>
                                </div>
                            ) : type === 'doc' ? (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50 text-blue-500">
                                    <File size={24} />
                                    <span className="text-[8px] font-bold uppercase">DOC</span>
                                </div>
                            ) : (
                                <img src={url} className="w-full h-full object-cover rounded" alt="Thumb" />
                            )}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Edit size={16} className="text-white" />
                            </div>
                        </>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 hover:text-blue-500">
                            <Plus size={18} />
                            <span className="text-[8px] font-bold mt-1">Add</span>
                        </div>
                    )}
                    <input type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={onUpload} />
                </label>
            ) : (
                url ? (
                    <button onClick={onClick} className="relative group w-[60px] h-[60px] rounded-lg border border-gray-200 overflow-hidden shadow-sm bg-white hover:ring-2 hover:ring-blue-400 transition-all">
                         {type === 'pdf' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 text-red-500">
                                <FileText size={24} />
                                <span className="text-[8px] font-bold uppercase mt-1">PDF</span>
                            </div>
                         ) : type === 'doc' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50 text-blue-500">
                                <File size={24} />
                                <span className="text-[8px] font-bold uppercase mt-1">DOC</span>
                            </div>
                         ) : (
                            <img src={url} className="w-full h-full object-cover" alt="Thumbnail" />
                         )}
                         <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <Eye size={16} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                         </div>
                    </button>
                ) : (
                    <div className="w-[60px] h-[60px] rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-300">
                        <ImageIcon size={20} />
                    </div>
                )
            )}
        </div>
    );
};

// --- RYTHU PHOTO ONLY CELL ---
const PhotoCell = ({ url, isEditable, onUpload, onClick }: { url: string | null, isEditable: boolean, onUpload: (e: any) => void, onClick: () => void }) => {
    // Logic to resolve image source
    let src = url;
    const dispId = extractDispImgId(url);
    if (dispId) src = `/uploads/${dispId}.jpg`; // Placeholder logic

    const type = getFileType(src || '');
    const isImage = type === 'image' && src;
    
    return (
        <div className="flex justify-center items-center h-full">
            {isEditable ? (
                <label className={`cursor-pointer border border-gray-200 hover:border-pink-400 rounded-lg p-1 block text-center shadow-sm relative group overflow-hidden transition-all ${isImage ? 'bg-white' : 'bg-gray-50 hover:bg-white'}`} style={{ width: '60px', height: '60px' }}>
                    {isImage ? (
                        <>
                            <img src={src || ''} className="w-full h-full object-cover rounded" alt="Thumb" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Edit size={16} className="text-white" />
                            </div>
                        </>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 hover:text-pink-500">
                            <Plus size={18} />
                            <span className="text-[8px] font-bold mt-1">Photo</span>
                        </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={onUpload} />
                </label>
            ) : (
                isImage ? (
                    <button onClick={onClick} className="relative group w-[60px] h-[60px] rounded-lg border border-gray-200 overflow-hidden shadow-sm bg-white hover:ring-2 hover:ring-pink-400 transition-all">
                         <img src={src || ''} className="w-full h-full object-cover" alt="Farmer" />
                         <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                            <Eye size={16} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                         </div>
                    </button>
                ) : (
                    <div className="w-[60px] h-[60px] rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 mx-auto">
                        <UserIcon size={24} />
                    </div>
                )
            )}
        </div>
    );
};

export const UniversalDataModule: React.FC<UniversalDataModuleProps> = ({ moduleType, title, description }) => {
  const [viewMode, setViewMode] = useState<'list' | 'file' | 'addRows'>('list');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [listTab, setListTab] = useState<'existing' | 'add'>('existing');
  const [activeTab, setActiveTab] = useState<'data' | 'report'>('data');
  const [selectedFile, setSelectedFile] = useState<ARegisterFile | null>(null);
  const [files, setFiles] = useState<ARegisterFile[]>([]);
  const [records, setRecords] = useState<DynamicRecord[]>([]); 
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  const [currentColumns, setCurrentColumns] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // Default to 10 rows per page
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<DynamicRecord | null>(null);
  const [summaryStats, setSummaryStats] = useState<ARegisterSummary | null>(null);
  const [isSummaryEdited, setIsSummaryEdited] = useState(false);
  const [viewMedia, setViewMedia] = useState<{ type: 'image' | 'pdf' | 'doc', url: string, name?: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, type: 'row' | 'file', id: string | null }>({ isOpen: false, type: 'row', id: null });
  const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  
  // Add Data - File Selection State
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableBottomRef = useRef<HTMLTableRowElement>(null);

  const getCurrentUser = () => {
      const userStr = sessionStorage.getItem('rythu_user');
      if (userStr) return JSON.parse(userStr);
      return { email: 'Unknown', name: 'Unknown', role: 'USER' };
  };

  const user = getCurrentUser();
  const isAdmin = user.role === UserRole.ADMIN;
  const isData6A = moduleType === 'DATA_6A';
  const isRythuDetails = moduleType === 'RYTHU_DETAILS';
  const isARegister = moduleType === 'AREGISTER';
  
  const canEdit = isAdmin || isRythuDetails || isData6A;
  const canDelete = isAdmin;
  const canManageColumns = isAdmin;
  const canUpload = isAdmin;
  const canAdd = isAdmin; // Admin can use the top 'Add Row' button
  const isStaff = user.role !== UserRole.ADMIN;
  const canStaffInsert = isStaff && (isData6A || isRythuDetails);
  const isExcelDriven = ['AREGISTER', 'DKT_LAND'].includes(moduleType);

  // --- REAL-TIME SUBSCRIPTION HOOK ---
  useEffect(() => {
      // Subscribe to file list updates
      const unsubscribe = DataService.subscribeToFiles(moduleType, (updatedFiles) => {
          setFiles(prev => {
              // Preserve "cloud_data" virtual file if it exists, as it's not in DB
              const cloud = prev.find(f => f.id === 'cloud_data');
              return cloud ? [cloud, ...updatedFiles] : updatedFiles;
          });
      });
      return () => unsubscribe();
  }, [moduleType]);

  // --- RECORD SUBSCRIPTION HOOK ---
  useEffect(() => {
      if (selectedFile && selectedFile.id !== 'cloud_data' && viewMode === 'file') {
          setIsLoading(true);
          const unsubscribe = DataService.subscribeToModuleRecords(moduleType, selectedFile.id, (data) => {
              data.sort((a, b) => a.id.localeCompare(b.id));
              setRecords(data);
              setIsLoading(false);
          });
          return () => unsubscribe();
      }
  }, [selectedFile, moduleType, viewMode]);

  const isColumnEditable = (colIndex: number, recordId?: string): boolean => {
      if (isAdmin) return true;
      if (isRythuDetails) return true;
      if (isData6A) {
          if (recordId && recordId.includes('_new_')) {
              return true;
          }
          return [17, 18, 23, 24].includes(colIndex);
      }
      return false;
  };

  const REASONS_DROPDOWN = [
      "Select Reason",
      "No issue",
      "Mutation due to Sale/Partition/Gift/Will",
      "Mutation due to Death",
      "Mutation for Corrections",
      "Court case",
      "Deletion"
  ];
  
  const EXTENT_KEYWORDS = {
    pattaDry: ['Patta Dry', 'Patta Metta', 'Dry Patta', 'Metta', 'మెట్ట'],
    pattaWet: ['Patta Wet', 'Patta Tari', 'Wet Patta', 'Tari', 'తరి'],
    inamDry: ['Inam Dry', 'Inam Metta', 'ఈనామ్ మెట్ట', 'ఇనాం మెట్ట'],
    inamWet: ['Inam Wet', 'Inam Tari', 'ఈనామ్ తరి', 'ఇనాం తరి'],
    dottedDry: ['Dotted Dry', 'Dot Dry', 'Chukkala Metta', 'చుక్కల మెట్ట'],
    dottedWet: ['Dotted Wet', 'Dot Wet', 'Chukkala Tari', 'చుక్కల తరి'],
    uaw: ['UAW', 'Unassessed', 'అంచనా వేయబడని'],
    poramboke: ['Poramboke', 'Govt', 'Government', 'పోరంబోకు', 'ప్రభుత్వ']
  };

  useEffect(() => {
      const loadSummary = async () => {
          if(activeTab === 'report' && selectedFile && moduleType === 'AREGISTER') {
              const savedSummary = await DataService.getARegisterSummary(selectedFile.id);
              if(savedSummary) {
                  setSummaryStats(savedSummary);
              } else {
                  recalculateStats();
              }
          }
      };
      loadSummary();
  }, [activeTab, selectedFile, moduleType]);

  useEffect(() => {
      if(toast.show) {
          const timer = setTimeout(() => setToast({ ...toast, show: false }), 3000);
          return () => clearTimeout(timer);
      }
  }, [toast.show]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ show: true, message, type });
  };

  const loadFiles = async () => {
    try {
        const loadedFiles = await DataService.getModuleFiles(moduleType);
        setFiles(prev => {
            const cloud = prev.find(f => f.id === 'cloud_data');
            return cloud ? [cloud, ...loadedFiles] : loadedFiles;
        });
        showToast("Files refreshed");
    } catch (e) {
        console.error("Failed to refresh files", e);
        showToast("Failed to refresh files", "error");
    }
  };

  const isMediaColumn = (colName: string) => {
      if (!isRythuDetails && !isData6A) return false;
      const lower = colName.toLowerCase();
      return ['photo', 'image', 'url', 'link', 'ఫోటో', 'document', 'file', 'pattadar passbook', 'passbook'].some(k => lower.includes(k));
  };
  
  const recalculateStats = () => {
    if (!selectedFile) return;
    const sourceData = records;
    const totals: ARegisterSummary = {
        fileId: selectedFile.id,
        totalextent: 0,
        pattaDry: 0, pattaWet: 0, inamDry: 0, inamWet: 0, dottedDry: 0, dottedWet: 0, uaw: 0, poramboke: 0
    };

    const getVal = (rec: DynamicRecord, keywords: string[]) => {
        const key = currentColumns.find(col => keywords.some(k => col.toLowerCase().includes(k.toLowerCase())));
        return key ? parseExtent(rec[key]) : 0;
    };
    sourceData.forEach(r => {
        totals.pattaDry += getVal(r, EXTENT_KEYWORDS.pattaDry);
        totals.pattaWet += getVal(r, EXTENT_KEYWORDS.pattaWet);
        totals.inamDry += getVal(r, EXTENT_KEYWORDS.inamDry);
        totals.inamWet += getVal(r, EXTENT_KEYWORDS.inamWet);
        totals.dottedDry += getVal(r, EXTENT_KEYWORDS.dottedDry);
        totals.dottedWet += getVal(r, EXTENT_KEYWORDS.dottedWet);
        totals.uaw += getVal(r, EXTENT_KEYWORDS.uaw);
        totals.poramboke += getVal(r, EXTENT_KEYWORDS.poramboke);
    });
    totals.totalextent = totals.pattaDry + totals.pattaWet + totals.inamDry + totals.inamWet + totals.dottedDry + totals.dottedWet + totals.uaw + totals.poramboke;
    setSummaryStats(totals);
    setIsSummaryEdited(true); 
    showToast("Values recalculated from data.");
  };

  const handleSummaryChange = (field: keyof ARegisterSummary, value: string) => {
      if (!summaryStats) return;
      if (value && !/^\d*\.?\d*$/.test(value)) return;
      const newStats = { ...summaryStats, [field]: value === '' ? 0 : parseFloat(value) };
      if (field !== 'totalextent') {
        newStats.totalextent = newStats.pattaDry + newStats.pattaWet + newStats.inamDry + newStats.inamWet + newStats.dottedDry + newStats.dottedWet + newStats.uaw + newStats.poramboke;
      }
      setSummaryStats(newStats);
      setIsSummaryEdited(true);
  };

  const saveSummary = async () => {
      if(summaryStats) {
          await DataService.saveARegisterSummary(summaryStats);
          setIsSummaryEdited(false);
          showToast("Report Summary Updated Successfully.");
      }
  };

  // --- REUSABLE EXCEL PROCESSOR ---
  const processExcelFile = (file: File) => {
      setIsLoading(true);
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const buffer = evt.target?.result;
          const wb = XLSX.read(buffer, { type: 'array', cellFormula: false, cellHTML: false, cellText: true, cellDates: false });
          const fillMergedCells = (workbook: XLSX.WorkBook) => {
             workbook.SheetNames.forEach(name => {
               const sheet = workbook.Sheets[name];
               if (sheet['!merges']) {
                 sheet['!merges'].forEach((range: any) => {
                   const startNode = XLSX.utils.encode_cell(range.s);
                   if(sheet[startNode]) {
                       for (let R = range.s.r; R <= range.e.r; ++R) {
                         for (let C = range.s.c; C <= range.e.c; ++C) {
                           const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
                           if(!sheet[cellRef]) { sheet[cellRef] = { ...sheet[startNode] }; }
                         }
                       }
                   }
                 });
               }
             });
          };
          fillMergedCells(wb);
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];

          if (!jsonData || jsonData.length === 0) { showToast("The uploaded Excel file is empty.", "error"); setIsLoading(false); return; }

          let headerRowIdx = 0;
          let maxCols = 0;
          for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
              const row = jsonData[i];
              const cols = row ? row.filter(c => c !== undefined && c !== null && String(c).trim() !== '').length : 0;
              if (cols > maxCols) { maxCols = cols; headerRowIdx = i; }
          }
          const headerRow = jsonData[headerRowIdx];
          const columns: string[] = [];
          const colIndices: number[] = [];
          
          headerRow.forEach((cell, idx) => {
              if (cell && String(cell).trim() !== '') { columns.push(String(cell).trim()); colIndices.push(idx); }
          });
          if (columns.length === 0) { showToast("Could not detect headers in the file.", "error"); setIsLoading(false); return; }

          const dataRows = jsonData.slice(headerRowIdx + 1);
          const fileId = `${moduleType}_file_${Date.now()}`;
          const uploadTime = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
          const newFile: ARegisterFile = { id: fileId, fileName: file.name, uploadDate: uploadTime, rowCount: dataRows.length, columns: columns, module: moduleType };
          const timestamp = Date.now();
          const newRecords: DynamicRecord[] = dataRows.map((row, rIdx) => {
              const sortIndex = rIdx.toString().padStart(6, '0');
              const record: DynamicRecord = { 
                  id: `${moduleType}_rec_${timestamp}_${sortIndex}`, 
                  fileId: fileId, 
                  documents: [], 
                  is_new: 1,
                  is_uploaded: 1, // Flag for Uploaded View
                  is_modified: 0 // BULK UPLOAD = WHITE ROW (Not Modified)
              };
              
              columns.forEach((colName, cIdx) => { 
                  let val = row[colIndices[cIdx]]; 
                  val = val !== undefined && val !== null ? String(val) : '';
                  if (moduleType === 'DATA_6A' && cIdx === 23) {
                      const trimmedVal = val.trim();
                      const match = REASONS_DROPDOWN.find(r => r.toLowerCase() === trimmedVal.toLowerCase());
                      if (match) { val = match; } else { val = "Select Reason"; }
                  }
                  record[colName] = val; 
              });

              // Legacy Auto-Map Image URL
              const imgKey = columns.find(h => ['image', 'photo', 'url', 'link', 'ఫోటో', 'document', 'file', 'pattadar passbook', 'passbook'].includes(h.toLowerCase()));
              if(imgKey && record[imgKey] && !record[imgKey].includes('[Image]')) { record.imageUrl = record[imgKey]; }
              return record;
          });

          // Upload to API if online
          if (!apiError) {
              axios.post(`${API_BASE}/upload${moduleType.toLowerCase()}`, { records: newRecords, timestamp: new Date().toISOString() })
                  .then(() => showToast("Data synced to cloud successfully"))
                  .catch(e => {
                      console.warn("Cloud sync endpoint unavailable. Continuing with local/Firebase storage.", e.message);
                      setApiError(true); // Disable future API calls for this session
                  });
          }

          await DataService.saveModuleFile(moduleType, newFile);
          await DataService.saveModuleRecords(moduleType, newRecords);
          showToast(`Uploaded ${dataRows.length} rows successfully!`);
          
          // Reset Upload State
          setSelectedUploadFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';

        } catch (error) { console.error("Upload Error", error); showToast("Failed to process Excel file.", "error"); } finally { setIsLoading(false); }
      };
      reader.readAsArrayBuffer(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (!file.name.match(/\.(xlsx|xls)$/i)) {
              showToast("Invalid file type. Please select an Excel file (.xlsx, .xls)", "error");
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
          }
          setSelectedUploadFile(file);
      }
  };

  const handleUpload = () => {
      if (selectedUploadFile) {
          processExcelFile(selectedUploadFile);
      } else {
          showToast("Please select a file first.", "error");
      }
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUpload) {
        showToast("Permission Denied: Only Admins can upload files.", "error");
        return;
    }
    const file = e.target.files?.[0];
    if (file) {
        processExcelFile(file);
    }
  };

  const handleViewFile = async (file: ARegisterFile) => {
      setSelectedFile(file);
      
      let fileRecords: DynamicRecord[] = [];
      
      // Handle Cloud File fetch
      if (file.id === 'cloud_data') {
          try {
              setIsLoading(true);
              const res = await axios.get(`${API_BASE}/${moduleType.toLowerCase()}`);
              fileRecords = res.data;
              if (fileRecords.length > 0 && !file.columns) {
                  // Infer columns if missing
                  file.columns = Object.keys(fileRecords[0]);
              }
          } catch (e) {
              console.error("Failed to fetch cloud records", e);
              showToast("Failed to fetch cloud data", "error");
          } finally {
              setIsLoading(false);
          }
          setRecords(fileRecords); // Set initial data for cloud file
      } else {
          // Trigger subscription logic via useEffect
          // Just clear records momentarily to show loading
          setRecords([]);
      }

      setCurrentColumns(file.columns || []);
      setEditingId(null);
      setEditFormData(null);
      setCurrentPage(1);
      setViewMode('file');
      setActiveTab('data');
      setIsFullScreen(false); 
  };

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  const confirmDeleteFile = async () => {
      if(deleteModal.id) {
          const success = await DataService.softDeleteModuleFile(moduleType, deleteModal.id, user.name);
          if (success) {
              if(selectedFile?.id === deleteModal.id) {
                 setViewMode('list');
                 setSelectedFile(null);
              }
              showToast("File moved to Recycle Bin.");
          } else {
              showToast("Failed to delete file.", "error");
          }
      }
      setDeleteModal({ isOpen: false, type: 'file', id: null });
  };

  const confirmDeleteRow = async () => {
      if (deleteModal.id) {
          const success = await DataService.softDeleteRecord(moduleType, deleteModal.id, user.name);
          if (success) {
              const updatedRecords = records.filter(r => r.id !== deleteModal.id);
              setRecords(updatedRecords); 
              showToast("Row moved to Recycle Bin");
          } else {
              showToast("Failed to delete record", "error");
          }
      }
      setDeleteModal({ isOpen: false, type: 'row', id: null });
  };

  const handleSaveRow = async () => {
      if (!editFormData) return;
      
      const recordToSave: DynamicRecord = { 
          ...editFormData, 
          is_updated: 1,
          is_modified: 1, 
          is_highlighted: 1,
          updatedBy: user.name,
          updatedDate: new Date().toISOString()
      };
      
      // Update state immediately for responsiveness
      const updatedRecords = records.map(r => r.id === editFormData.id ? recordToSave : r);
      setRecords(updatedRecords);
      await DataService.saveModuleRecords(moduleType, [recordToSave]);
      showToast("Row saved successfully!");
      setEditingId(null);
      setEditFormData(null);
  };
  
  const handleAddColumn = async () => {
    if (!canManageColumns) return;
    const colName = prompt("Enter the new column name:");
    if (colName && colName.trim() !== "") {
      const formattedName = colName.trim();
      if (currentColumns.includes(formattedName)) return;
      const newCols = [...currentColumns, formattedName];
      setCurrentColumns(newCols);
      if (selectedFile && selectedFile.id !== 'cloud_data') {
         await DataService.updateModuleFileColumns(moduleType, selectedFile.id, newCols);
         const updatedFile = { ...selectedFile, columns: newCols };
         setSelectedFile(updatedFile);
      }
      const updatedRecords = records.map(r => ({ ...r, [formattedName]: "" }));
      setRecords(updatedRecords);
      await DataService.saveModuleRecords(moduleType, updatedRecords);
      showToast(`Column '${formattedName}' added successfully.`);
    }
  };

  const handleAddRow = async () => {
    if (!selectedFile || !canAdd) return;
    const timestamp = Date.now();
    const newRecord: DynamicRecord = {
      id: `${moduleType}_new_${timestamp}_${Math.random().toString(36).substr(2, 5)}`,
      fileId: selectedFile.id,
      imageUrl: "",
      documents: [],
      is_new: 1,
      is_modified: 1, 
      is_highlighted: 1,
      createdBy: user.name,
      createdDate: new Date().toISOString()
    };
    currentColumns.forEach((col, idx) => {
        if (moduleType === 'DATA_6A' && idx === 23) {
            newRecord[col] = "Select Reason";
        } else {
            newRecord[col] = "";
        }
    });
    const newRecs = [newRecord, ...records];
    setRecords(newRecs);
    setCurrentPage(1);
    setEditingId(newRecord.id);
    setEditFormData(newRecord);
    await DataService.saveModuleRecords(moduleType, [newRecord]);
    showToast("New row added.");
  };

  const handleInsertRowAfter = async (targetRecordId: string) => {
    if (!selectedFile || !canStaffInsert) return;

    setSearchTerm('');

    const timestamp = Date.now();
    const newRecord: DynamicRecord = {
      id: `${moduleType}_new_${timestamp}_${Math.random().toString(36).substr(2, 5)}`,
      fileId: selectedFile.id,
      imageUrl: "",
      documents: [],
      is_new: 1,
      is_modified: 1,
      is_highlighted: 1,
      createdBy: user.name,
      createdDate: new Date().toISOString()
    };

    const targetIndex = records.findIndex(r => r.id === targetRecordId);
    
    const snKeywords = ['s.no', 'sl.no', 'serial no', 'no.', 'no'];
    const snCol = currentColumns.find(c => snKeywords.includes(c.toLowerCase()));

    currentColumns.forEach((col, idx) => {
        if (snCol && col === snCol && targetIndex !== -1) {
             const prevVal = parseInt(String(records[targetIndex][col]).replace(/\D/g, ''));
             newRecord[col] = !isNaN(prevVal) ? (prevVal + 1).toString() : "";
        } else if (moduleType === 'DATA_6A' && idx === 23) {
            newRecord[col] = "Select Reason"; 
        } else {
            newRecord[col] = "";
        }
    });

    let newRecords = [...records];
    if (targetIndex !== -1) {
        newRecords.splice(targetIndex + 1, 0, newRecord);
    } else {
        newRecords.unshift(newRecord);
    }

    setRecords(newRecords);
    setEditingId(newRecord.id);
    setEditFormData(newRecord);
    
    const newIndex = targetIndex + 1;
    const newPage = Math.ceil((newIndex + 1) / itemsPerPage);
    if (newPage !== currentPage) {
        setCurrentPage(newPage);
    }
    
    await DataService.saveModuleRecords(moduleType, [newRecord]);
    showToast("New row added.");
  };

  const calculateRowTotalExtent = (record: DynamicRecord, columns: string[]) => {
    let total = 0;
    const keywords = Object.values(EXTENT_KEYWORDS).flat();
    Object.keys(record).forEach(key => {
        if (key === 'Total Extent') return;
        if (keywords.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
             total += parseExtent(record[key]);
        }
    });
    return total;
  };

  const handleEditChange = (col: string, value: string) => { 
      if (editFormData) { 
          const updated = { ...editFormData, [col]: value };
          if (isARegister) {
             const total = calculateRowTotalExtent(updated, currentColumns);
             updated['Total Extent'] = total.toFixed(2);
          }
          setEditFormData(updated); 
      } 
  };
  
  const handleMediaUpload = (recordId: string, colKey: string | null, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && editFormData && editFormData.id === recordId) {
          const reader = new FileReader();
          reader.onload = (evt) => {
              const base64 = evt.target?.result as string;
              if (colKey) {
                  setEditFormData({ ...editFormData, [colKey]: base64 });
              } else {
                  setEditFormData({ ...editFormData, imageUrl: base64 });
              }
          };
          reader.readAsDataURL(file);
      }
  };

  const handleDirectMediaUpload = async (recordId: string, colKey: string | null, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          // Initialize FileReader to fix "Cannot find name 'reader'" error
          const reader = new FileReader();
          reader.onload = async (evt) => {
              const base64 = evt.target?.result as string;
              
              const record = records.find(r => r.id === recordId);
              if(record) {
                  const updatedRecord = { 
                      ...record, 
                      [colKey || 'imageUrl']: base64,
                      is_modified: 1,
                      is_updated: 1,
                      updatedBy: user.name,
                      updatedDate: new Date().toISOString()
                  };
                  
                  setRecords(prev => prev.map(r => r.id === recordId ? updatedRecord : r));
                  
                  if (editingId === recordId && editFormData) {
                      setEditFormData(prev => prev ? ({ ...prev, [colKey || 'imageUrl']: base64 }) : null);
                  }

                  await DataService.saveModuleRecords(moduleType, [updatedRecord]);
                  showToast("Photo uploaded successfully");
              }
          };
          reader.readAsDataURL(file);
      }
  };

  const handleStartEdit = (record: DynamicRecord) => { if (!canEdit) return; setEditingId(record.id); setEditFormData({ ...record }); };
  const handleCancelEdit = () => { setEditingId(null); setEditFormData(null); };
  
  const openMediaViewer = (url: string, name?: string) => { 
      const type = getFileType(url);
      if (type === 'pdf') setViewMedia({ type: 'pdf', url, name });
      else if (type === 'image') setViewMedia({ type: 'image', url, name });
      else setViewMedia({ type: 'doc', url, name });
  };
  
  const initiateDeleteFile = (fileId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if(!canDelete) { showToast("Permission Denied: Admin Only", "error"); return; }
      setDeleteModal({ isOpen: true, type: 'file', id: null }); // Fix: Set id explicitly when needed below
      setDeleteModal({ isOpen: true, type: 'file', id: fileId });
  };

  const initiateDeleteRow = (id: string) => {
      if (!canDelete) { showToast("Access Denied: Admin Only", "error"); return; }
      setDeleteModal({ isOpen: true, type: 'row', id: id });
  };

  const handleExportExcel = () => {
      try {
          const dataToExport = filteredRecords;
          const exportData = dataToExport.map(record => {
            const cleanRecord: Record<string, any> = {};
            if (isARegister) {
                if (!record['Total Extent']) {
                    cleanRecord['Total Extent'] = calculateRowTotalExtent(record, currentColumns).toFixed(2);
                } else {
                    cleanRecord['Total Extent'] = record['Total Extent'];
                }
            }

            Object.keys(record).forEach(key => {
                if (['documents', 'metadata', 'is_new', 'is_updated', 'fileId', 'id', 'imageUrl', 'createdBy', 'createdDate', 'updatedBy', 'updatedDate', 'is_highlighted', 'is_uploaded', 'is_modified'].includes(key)) return;
                
                let value = record[key];

                if (value === null || value === undefined) {
                    value = '';
                } else if (typeof value === 'object') {
                    try { value = JSON.stringify(value); } catch(e) { value = ''; }
                } else {
                    value = String(value);
                }
                
                if (value.length > 25000) {
                    if (value.startsWith('data:')) {
                        value = '[Media Content - Not Exported]';
                    } else {
                        value = value.substring(0, 25000) + '...[Truncated]';
                    }
                }
                cleanRecord[key] = value;
            });
            return cleanRecord;
          });

          const ws = XLSX.utils.json_to_sheet(exportData);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Data");
          XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_Export.xlsx`);
      } catch (error) {
          console.error("Export Failed", error);
          showToast("Export failed: Data may exceed Excel limitations.", "error");
      }
  };

  const handleExportPDF = () => {
      try {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.text(`${title} Report`, 14, 10);
        
        let tableColumn = currentColumns.slice(0, 10);
        if (isARegister) {
             const hasTotal = tableColumn.some(c => c === 'Total Extent');
             if (!hasTotal) tableColumn.push('Total Extent');
        }
        
        const dataToExport = filteredRecords;

        const tableRows = dataToExport.map(record => {
            const rowData = currentColumns.slice(0, 10).map(col => {
                let val = record[col] || '';
                if (typeof val === 'string' && val.length > 500 && val.startsWith('data:')) {
                    return '[Media]';
                }
                return String(val).substring(0, 100);
            });
            
            if (isARegister) {
                 const hasTotal = currentColumns.slice(0, 10).some(c => c === 'Total Extent');
                 if (!hasTotal) {
                     rowData.push(record['Total Extent'] || calculateRowTotalExtent(record, currentColumns).toFixed(2));
                 }
            }
            return rowData;
        });

        autoTable(doc, { 
            head: [tableColumn], 
            body: tableRows, 
            startY: 20, 
            styles: { fontSize: 7 }, 
            headStyles: { fillColor: [22, 163, 74] } 
        });
        doc.save(`${title.replace(/\s+/g, '_')}_Report.pdf`);
      } catch (e) {
        console.error("PDF Export Error", e);
        showToast("PDF Export failed.", "error");
      }
  };

  const getColumnName = (keywords: string[]) => {
    if (!currentColumns.length) return undefined;
    return currentColumns.find(col => keywords.some(k => col.toLowerCase().includes(k.toLowerCase())));
  };

  const filteredRecords = records.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    
    const surveyCol = getColumnName(['survey', 'sy.no', 's.no', 'sur.no', 'survey no']);
    const khataCol = getColumnName(['khata', 'account', 'passbook', 'khata no']);

    if (surveyCol || khataCol) {
        const inSurvey = surveyCol ? String(r[surveyCol] || '').toLowerCase().includes(term) : false;
        const inKhata = khataCol ? String(r[khataCol] || '').toLowerCase().includes(term) : false;
        return inSurvey || inKhata;
    }
    
    return Object.values(r).some(v => 
        typeof v === 'string' && v.toLowerCase().includes(term)
    );
  });

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const paginatedRecords = filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleClearSearch = () => {
      setSearchTerm('');
  };

  const getPaginationRange = () => {
    const delta = 1; 
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
            range.push(i);
        }
    }

    for (let i of range) {
        if (l) {
            if (i - l === 2) {
                rangeWithDots.push(l + 1);
            } else if (i - l !== 1) {
                rangeWithDots.push('...');
            }
        }
        rangeWithDots.push(i);
        l = i;
    }
    return rangeWithDots;
  };

  return (
    <>
      {viewMode === 'list' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              {toast.show && (
                  <div className={`fixed top-24 right-5 z-50 px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 ${toast.type === 'success' ? 'bg-corp-900 text-white' : 'bg-red-600 text-white'}`}>
                      {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                      <span className="font-bold">{toast.message}</span>
                  </div>
              )}
              {deleteModal.isOpen && deleteModal.type === 'file' && (
                  <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center">
                          <h3 className="text-xl font-bold mb-2">Delete File?</h3>
                          <div className="flex gap-3 mt-4">
                              <button onClick={() => setDeleteModal({ isOpen: false, type: 'file', id: null })} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancel</button>
                              <button onClick={confirmDeleteFile} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg">Confirm</button>
                          </div>
                      </div>
                  </div>
              )}
              
              {isData6A ? (
                  /* 6A DATA SPECIFIC LAYOUT: TABS FOR EXISTING FILES vs ADD DATA */
                  <div className="bg-white rounded-xl shadow-sm border border-corp-100 flex flex-col min-h-[500px]">
                      {/* Tabs Header */}
                      <div className="flex border-b border-corp-200">
                          <button 
                             onClick={() => setListTab('existing')}
                             className={`flex-1 py-4 text-center font-bold text-sm uppercase tracking-wider transition-colors border-b-2 ${listTab === 'existing' ? 'border-agri-600 text-agri-700 bg-agri-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                          >
                              Existing Files
                          </button>
                          {canUpload && (
                              <button 
                                 onClick={() => setListTab('add')}
                                 className={`flex-1 py-4 text-center font-bold text-sm uppercase tracking-wider transition-colors border-b-2 ${listTab === 'add' ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                              >
                                  Add Data
                              </button>
                          )}
                      </div>

                      <div className="p-8 flex-1">
                          {listTab === 'existing' && (
                              <div className="space-y-4">
                                   <div className="flex justify-between items-center mb-6">
                                       <h3 className="text-xl font-bold text-corp-800 flex items-center">
                                           <FileText className="mr-2 text-agri-600" /> Existing 6A Files
                                       </h3>
                                       <button onClick={loadFiles} className="text-sm text-agri-600 font-medium hover:underline flex items-center"><RefreshCw size={14} className="mr-1"/> Refresh List</button>
                                   </div>
                                   
                                   {files.length === 0 ? (
                                       <div className="p-12 text-center text-corp-300 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                           <FileSpreadsheet size={48} className="mx-auto mb-3 opacity-20" />
                                           <p>No files uploaded yet.</p>
                                       </div>
                                   ) : (
                                       <div className="grid grid-cols-1 gap-4">
                                           {files.map(file => (
                                              <div key={file.id} className="p-5 flex flex-col sm:flex-row items-center justify-between bg-gray-50 hover:bg-blue-50 border border-gray-200 rounded-xl transition-all group shadow-sm hover:shadow-md">
                                                  <div className="flex items-center space-x-4 mb-3 sm:mb-0 w-full sm:w-auto">
                                                      <div className="p-3 bg-white rounded-lg text-blue-600 shadow-sm">
                                                          {file.id === 'cloud_data' ? <Cloud size={24} /> : <FileSpreadsheet size={24} />}
                                                      </div>
                                                      <div>
                                                          <p className="font-bold text-corp-800 text-lg group-hover:text-blue-700">{file.fileName}</p>
                                                          <p className="text-xs text-corp-400 font-medium mt-0.5">Uploaded: {file.uploadDate} • <span className="bg-white px-2 py-0.5 rounded text-corp-600 border border-gray-100">{file.rowCount} Records</span></p>
                                                      </div>
                                                  </div>
                                                  <div className="flex items-center gap-3">
                                                      <button onClick={() => handleViewFile(file)} className="px-5 py-2.5 bg-corp-900 text-white rounded-lg text-sm font-bold hover:bg-corp-800 shadow-md flex items-center transition-all">
                                                          <ArrowLeft size={16} className="rotate-180 mr-2" /> Open
                                                      </button>
                                                      {canDelete && file.id !== 'cloud_data' && <button onClick={(e) => initiateDeleteFile(file.id, e)} className="p-2.5 text-corp-400 bg-white hover:text-red-600 hover:bg-red-50 border border-gray-100 rounded-lg transition-colors shadow-sm" title="Move to Recycle Bin"><Trash2 size={20} /></button>}
                                                  </div>
                                              </div>
                                           ))}
                                       </div>
                                   )}
                              </div>
                          )}

                          {listTab === 'add' && canUpload && (
                              <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto animate-in fade-in zoom-in duration-300">
                                  <div className="bg-white p-8 rounded-2xl shadow-xl border border-blue-100 w-full text-center">
                                      <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600 shadow-inner">
                                          <FileSpreadsheet size={32} />
                                      </div>
                                      <h2 className="text-2xl font-bold text-gray-800 mb-2">Upload Excel File</h2>
                                      <p className="text-gray-500 mb-8">Select a .xlsx or .xls file to import new 6A data records.</p>
                                      
                                      <input 
                                          type="file" 
                                          ref={fileInputRef} 
                                          accept=".xlsx,.xls" 
                                          onChange={handleFileSelect} 
                                          className="hidden" 
                                      />
                                      
                                      {!selectedUploadFile ? (
                                          <button 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="px-8 py-3 bg-corp-900 text-white rounded-lg font-bold shadow-lg hover:bg-black transition-all flex items-center justify-center mx-auto"
                                          >
                                            <FileSpreadsheet size={20} className="mr-2" /> Select Excel File
                                          </button>
                                      ) : (
                                          <div className="space-y-6">
                                              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-col items-center">
                                                  <FileSpreadsheet size={32} className="text-green-600 mb-2" />
                                                  <span className="font-bold text-gray-800">{selectedUploadFile.name}</span>
                                                  <span className="text-xs text-gray-500">{(selectedUploadFile.size / 1024).toFixed(2)} KB</span>
                                                  <button onClick={() => setSelectedUploadFile(null)} className="text-xs text-red-500 hover:underline mt-2">Remove / Change</button>
                                              </div>
                                              
                                              <button 
                                                  onClick={handleUpload} 
                                                  disabled={isLoading}
                                                  className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-500/30 transition-all flex items-center justify-center disabled:opacity-70"
                                              >
                                                  {isLoading ? (
                                                      <><Loader2 size={20} className="animate-spin mr-2"/> Processing...</>
                                                  ) : (
                                                      <><CheckCircle size={20} className="mr-2"/> Upload Data</>
                                                  )}
                                              </button>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          )}
                      </div>
                  </div>
              ) : (
                  <>
                    <div className="bg-white p-8 rounded-xl shadow-sm border border-corp-100 flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-1">
                            <h2 className="text-2xl font-bold text-corp-800 flex items-center mb-2">
                                {canUpload ? <Upload className="mr-3 text-agri-600" size={28} /> : <FileText className="mr-3 text-agri-600" size={28} />}
                                {title} {canUpload ? 'Upload' : 'Viewer'}
                            </h2>
                            <p className="text-corp-500 mb-4">{description}</p>
                            {canUpload && (
                            <div className="flex gap-3">
                               <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleExcelUpload} />
                                <button onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="px-6 py-3 bg-corp-900 text-white rounded-lg hover:bg-black font-medium shadow-lg transition-all flex items-center disabled:opacity-70">
                                    {isLoading ? <RefreshCw className="animate-spin mr-2"/> : <FileSpreadsheet size={20} className="mr-2" />} {isLoading ? 'Processing...' : 'Select Excel File'}
                                </button>
                            </div>
                            )}
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-corp-100 overflow-hidden">
                        <div className="p-5 border-b border-corp-100 bg-gray-50 flex justify-between items-center">
                            <h3 className="font-bold text-corp-800">Recent Uploads</h3>
                            <div className="flex items-center gap-2">
                                {apiError && <span className="text-xs text-red-500 flex items-center"><CloudOff size={14} className="mr-1"/> Offline</span>}
                                <button onClick={loadFiles} className="text-sm text-agri-600 font-medium hover:underline">Refresh List</button>
                            </div>
                        </div>
                        <div className="divide-y divide-corp-50">
                            {files.length === 0 ? (
                                <div className="p-12 text-center text-corp-300"><FileSpreadsheet size={48} className="mx-auto mb-3 opacity-20" /><p>No files uploaded yet.</p></div>
                            ) : (
                                files.map(file => (
                                    <div key={file.id} className="p-5 flex flex-col sm:flex-row items-center justify-between hover:bg-blue-50/50 transition-colors group">
                                        <div className="flex items-center space-x-4 mb-3 sm:mb-0 w-full sm:w-auto">
                                            <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
                                                {file.id === 'cloud_data' ? <Cloud size={24} /> : <FileSpreadsheet size={24} />}
                                            </div>
                                            <div>
                                                <p className="font-bold text-corp-800 text-lg">{file.fileName}</p>
                                                <p className="text-xs text-corp-400 font-medium mt-0.5">Uploaded: {file.uploadDate} • <span className="bg-gray-100 px-2 py-0.5 rounded text-corp-600">{file.rowCount} Records</span></p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => handleViewFile(file)} className="px-5 py-2.5 bg-corp-900 text-white rounded-lg text-sm font-bold hover:bg-corp-800 shadow-md flex items-center transition-all">
                                                <ArrowLeft size={16} className="rotate-180 mr-2" /> Open
                                            </button>
                                            {canDelete && file.id !== 'cloud_data' && <button onClick={(e) => initiateDeleteFile(file.id, e)} className="p-2.5 text-corp-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Move to Recycle Bin"><Trash2 size={20} /></button>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                  </>
              )}
          </div>
      )}

      {/* RENDER TABLE VIEW */}
      {viewMode === 'file' && (
        <div className={isFullScreen ? "fixed inset-0 z-[100] bg-white flex flex-col animate-in fade-in zoom-in-95" : "flex flex-col h-[calc(100vh-8rem)] animate-in fade-in slide-in-from-right-4"}>
          {toast.show && (<div className={`fixed top-24 right-5 z-[110] px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 ${toast.type === 'success' ? 'bg-corp-900 text-white' : 'bg-red-600 text-white'}`}>{toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}<span className="font-bold">{toast.message}</span></div>)}
          {deleteModal.isOpen && deleteModal.type === 'row' && (<div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center"><h3 className="text-xl font-bold mb-2">Delete Record?</h3><div className="flex gap-3 mt-4"><button onClick={() => setDeleteModal({ isOpen: false, type: 'row', id: null })} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancel</button><button onClick={confirmDeleteRow} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg">Confirm</button></div></div></div>)}
          
          {/* MEDIA VIEWER MODAL */}
          {viewMedia && (
            <div className="fixed inset-0 z-[110] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setViewMedia(null)}>
                <div className="relative max-w-6xl w-full h-full max-h-[90vh] flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
                    <div className="absolute top-0 w-full flex justify-between items-center p-4 text-white">
                        <h3 className="text-lg font-bold">{viewMedia.name || "Media Viewer"}</h3>
                        <button onClick={() => setViewMedia(null)} className="p-2 hover:bg-white/20 rounded-full transition"><X size={32} /></button>
                    </div>
                    
                    {viewMedia.type === 'pdf' ? (
                        <div className="w-full h-full bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden">
                            <iframe src={viewMedia.url} className="w-full h-full" title="PDF Viewer" />
                        </div>
                    ) : viewMedia.type === 'image' ? (
                        <img src={viewMedia.url} className="max-w-full max-h-full rounded shadow-2xl border border-gray-700 object-contain" alt="Full View" />
                    ) : (
                        <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-2xl text-center">
                            <FileText size={64} className="mx-auto text-blue-500 mb-4" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">Document File</h3>
                            <p className="text-gray-500 mb-6">This document format cannot be previewed directly in the browser.</p>
                            <a href={viewMedia.url} download="document" className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition shadow-lg">
                                <Download size={20} className="mr-2" /> Download File
                            </a>
                        </div>
                    )}
                </div>
            </div>
          )}

          <div className="bg-white border-b border-corp-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
             <div className="flex items-center gap-4">
                 {!isFullScreen && (
                     <button onClick={() => setViewMode('list')} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ArrowLeft size={20} /></button>
                 )}
                 <div>
                     <h2 className="text-xl font-bold text-corp-900">{selectedFile?.fileName}</h2>
                     <div className="flex items-center gap-2 text-xs text-corp-500"><span className="bg-corp-100 px-2 py-0.5 rounded text-corp-700 font-medium">{records.length} Records</span>{activeTab === 'data' && <span>Page {currentPage} of {totalPages}</span>}</div>
                 </div>
             </div>
             <div className="flex gap-2">
                 {moduleType === 'AREGISTER' && (<div className="flex bg-gray-100 p-1 rounded-lg mr-4"><button onClick={() => setActiveTab('data')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center ${activeTab === 'data' ? 'bg-white text-corp-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><FileText size={16} className="mr-2"/> Data Sheet</button><button onClick={() => setActiveTab('report')} className={`px-4 py-2 rounded-md text-sm font-bold transition-all flex items-center ${activeTab === 'report' ? 'bg-white text-agri-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}><BarChart3 size={16} className="mr-2"/> A-Register Report</button></div>)}
                 <button onClick={toggleFullScreen} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 flex items-center font-bold text-sm" title={isFullScreen ? "Exit Full Screen" : "Full Screen"}>{isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}</button>
                 <button onClick={handleExportExcel} className="p-2 text-green-600 hover:bg-green-50 rounded-lg border border-green-200" title="Export to Excel"><FileSpreadsheet size={20} /></button>
                 <button onClick={handleExportPDF} className="p-2 text-red-600 hover:bg-red-50 rounded-lg border border-red-200" title="Export to PDF"><FileText size={20} /></button>
             </div>
          </div>
          
          {activeTab === 'data' && (
              <div className="flex-1 flex flex-col min-h-0 bg-gray-50 p-4">
                  
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-corp-100 mb-4 flex flex-col md:flex-row gap-4 items-end relative z-10 overflow-hidden">
                    <div className="flex-1 w-full">
                        <label className="text-xs font-bold text-gray-500 uppercase mb-1 block tracking-wider">Search Records</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            <input 
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-agri-500 outline-none transition-all" 
                                placeholder="Enter Survey No / Khata No"
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            />
                        </div>
                    </div>
                    
                    <div className="flex gap-2 w-full md:w-auto">
                        <button className="flex-1 md:flex-none px-6 py-2 bg-corp-900 text-white rounded-lg font-bold text-sm hover:bg-black transition-colors shadow-md">
                            Search
                        </button>
                        <button 
                            onClick={handleClearSearch}
                            className="flex-1 md:flex-none px-6 py-2 bg-gray-100 text-gray-600 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors flex items-center justify-center"
                        >
                            <RotateCcw size={14} className="mr-2"/> Clear
                        </button>
                    </div>
                  </div>

                  <div className="flex justify-end mb-4">
                      <div className="flex gap-2">
                          {canManageColumns && (
                              <button onClick={handleAddColumn} className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50">
                                  <Columns size={16} className="mr-2 inline text-blue-600"/> Add Col
                              </button>
                          )}
                          {canAdd && (
                              <button onClick={handleAddRow} className="px-4 py-2 bg-corp-900 text-white rounded-lg text-sm font-bold hover:bg-black shadow-lg">
                                  <Plus size={16} className="mr-2 inline" /> Add Row
                              </button>
                          )}
                      </div>
                  </div>

                  <div className="flex-1 bg-white border border-corp-200 rounded-xl overflow-hidden shadow-sm relative flex flex-col min-h-0 max-h-[600px] flex-grow">
                      <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-300">
                          {isLoading ? (
                              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                  <Loader2 size={48} className="animate-spin mb-4 text-blue-500" />
                                  <p>Fetching Data...</p>
                              </div>
                          ) : (
                          <table className="w-full text-left border-collapse table-auto">
                              <thead className="sticky top-0 z-20 shadow-sm"><tr className="bg-gray-50/95 backdrop-blur-sm border-b border-corp-200 text-xs font-bold text-corp-400 uppercase">{currentColumns.map((col, idx) => {
                                if (moduleType === 'DATA_6A' && col === 'Total Extent') return null;
                                return (<th key={idx} className={`px-3 py-3 border-r border-gray-200 min-w-[120px] max-w-[250px] whitespace-normal break-words ${col === 'Total Extent' ? 'bg-green-50 text-green-800 text-right' : ''}`}>{col}</th>);
                              })}{!isExcelDriven && <th className="px-3 py-3 w-24 text-center">{isRythuDetails ? 'Picture' : 'Photo/Doc'}</th>}{canEdit && <th className="px-3 py-3 w-24 text-center">Action</th>}</tr></thead>
                              <tbody className="bg-white divide-y divide-gray-100">
                                  {paginatedRecords.length > 0 ? paginatedRecords.map((record, index) => {
                                      const isSpecialModule = ['DATA_6A', 'RYTHU_DETAILS'].includes(moduleType);
                                      // Row Background Logic
                                      // STANDARD: Existing=White, Updated=Green, New=Pink
                                      let rowClass = "hover:bg-blue-50/30 bg-white";
                                      
                                      if (record.is_new === 1 && record.is_uploaded !== 1) {
                                          rowClass = "bg-pink-50 hover:bg-pink-100"; // Manual New -> Pink
                                      } else if (record.is_modified === 1 || record.is_updated === 1) {
                                          rowClass = "bg-[#d4f8d4] hover:bg-green-100"; // Updated -> Green
                                      }
                                      
                                      const isEditing = editingId === record.id;
                                      if (isEditing) rowClass = "bg-yellow-50";

                                      return (
                                          <tr key={record.id} className={`${rowClass} group transition-colors`}>
                                              {currentColumns.map((col, cIdx) => {
                                                  if (moduleType === 'DATA_6A' && col === 'Total Extent') return null;
                                                  
                                                  const isTotalExtent = col === 'Total Extent';
                                                  const isMedia = isMediaColumn(col);

                                                  return (
                                                  <td key={cIdx} className={`px-3 py-2 border-r border-gray-100 align-top min-w-[120px] max-w-[250px] break-words text-sm ${isTotalExtent ? 'text-right font-bold text-green-700 bg-green-50/30' : 'text-gray-700'}`}>
                                                      {isEditing ? (
                                                          isTotalExtent ? (
                                                              <span>{editFormData?.[col]}</span>
                                                          ) : isColumnEditable(cIdx, record.id) ? (
                                                              moduleType === 'DATA_6A' && cIdx === 23 ? (
                                                                  <select
                                                                      className="w-full p-1.5 border border-blue-300 rounded bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                                      value={editFormData?.[col] || "Select Reason"}
                                                                      onChange={e => handleEditChange(col, e.target.value)}
                                                                  >
                                                                      {REASONS_DROPDOWN.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                  </select>
                                                              ) : isMedia ? (
                                                                   <div className="flex flex-col items-center">
                                                                       {isRythuDetails ? (
                                                                           <PhotoCell 
                                                                               url={editFormData?.[col]} 
                                                                               isEditable={true} 
                                                                               onUpload={(e) => handleMediaUpload(record.id, col, e)}
                                                                               onClick={() => openMediaViewer(editFormData?.[col])}
                                                                           />
                                                                       ) : (
                                                                           <MediaCell 
                                                                               url={editFormData?.[col]} 
                                                                               isEditable={true} 
                                                                               onUpload={(e) => handleMediaUpload(record.id, col, e)}
                                                                               onClick={() => openMediaViewer(editFormData?.[col])}
                                                                           />
                                                                       )}
                                                                   </div>
                                                              ) : (
                                                                  <textarea 
                                                                      className="w-full p-1.5 border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none min-h-[38px] resize-y"
                                                                      value={editFormData?.[col] || ""}
                                                                      onChange={e => handleEditChange(col, e.target.value)}
                                                                  />
                                                              )
                                                          ) : (
                                                              <span className="text-gray-400 italic">{record[col]}</span>
                                                          )
                                                      ) : (
                                                          isMedia ? (
                                                              <div className="flex justify-center">
                                                                {isRythuDetails ? (
                                                                     <PhotoCell 
                                                                         url={record[col]} 
                                                                         isEditable={false} 
                                                                         onUpload={() => {}}
                                                                         onClick={() => openMediaViewer(record[col])}
                                                                     />
                                                                ) : record[col] ? (
                                                                    <button onClick={() => openMediaViewer(record[col], `Column: ${col}`)} className="text-blue-600 hover:underline text-xs flex items-center">
                                                                        <ImageIcon size={14} className="mr-1"/> View
                                                                    </button>
                                                                ) : <span className="text-gray-300">-</span>}
                                                              </div>
                                                          ) : (
                                                              <span>{record[col]}</span>
                                                          )
                                                      )}
                                                  </td>
                                              )})}
                                              
                                              {!isExcelDriven && (
                                                <td className="px-3 py-2 text-center align-middle border-r border-gray-100">
                                                    {isEditing ? (
                                                       <div className="flex justify-center">
                                                           {isRythuDetails ? (
                                                               <PhotoCell 
                                                                   url={editFormData?.imageUrl} 
                                                                   isEditable={true} 
                                                                   onUpload={(e) => handleMediaUpload(record.id, null, e)}
                                                                   onClick={() => openMediaViewer(editFormData?.imageUrl)}
                                                               />
                                                           ) : (
                                                               <MediaCell 
                                                                   url={editFormData?.imageUrl} 
                                                                   isEditable={true} 
                                                                   onUpload={(e) => handleMediaUpload(record.id, null, e)}
                                                                   onClick={() => openMediaViewer(editFormData?.imageUrl)}
                                                               />
                                                           )}
                                                       </div>
                                                    ) : (
                                                       <div className="flex justify-center">
                                                            {isRythuDetails ? (
                                                               <PhotoCell 
                                                                   url={record.imageUrl} 
                                                                   isEditable={false} 
                                                                   onUpload={(e) => handleDirectMediaUpload(record.id, null, e)}
                                                                   onClick={() => openMediaViewer(record.imageUrl)}
                                                               />
                                                           ) : (
                                                               <MediaCell 
                                                                   url={record.imageUrl} 
                                                                   isEditable={false} 
                                                                   onUpload={(e) => handleDirectMediaUpload(record.id, null, e)}
                                                                   onClick={() => openMediaViewer(record.imageUrl)}
                                                               />
                                                           )}
                                                       </div>
                                                    )}
                                                </td>
                                              )}
                                              
                                              {canEdit && (
                                                  <td className="px-3 py-2 text-center align-middle w-24">
                                                      <div className="flex items-center justify-center gap-2">
                                                          {isEditing ? (
                                                              <>
                                                                  <button onClick={handleSaveRow} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors" title="Save">
                                                                      <Save size={16} />
                                                                  </button>
                                                                  <button onClick={handleCancelEdit} className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors" title="Cancel">
                                                                      <X size={16} />
                                                                  </button>
                                                              </>
                                                          ) : (
                                                              <>
                                                                  <button onClick={() => handleStartEdit(record)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit Row">
                                                                      <Edit size={16} />
                                                                  </button>
                                                                  
                                                                  {/* Insert Row Below Button (For Staff/Admin) */}
                                                                  {canStaffInsert && (
                                                                      <button 
                                                                         onClick={() => handleInsertRowAfter(record.id)} 
                                                                         className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors" 
                                                                         title="Insert New Row Below"
                                                                      >
                                                                          <PlusCircle size={16} />
                                                                      </button>
                                                                  )}

                                                                  {canDelete && (
                                                                      <button onClick={() => initiateDeleteRow(record.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete Row">
                                                                          <Trash2 size={16} />
                                                                      </button>
                                                                  )}
                                                              </>
                                                          )}
                                                      </div>
                                                  </td>
                                              )}
                                          </tr>
                                      );
                                  }) : (
                                      <tr><td colSpan={currentColumns.length + 3} className="px-6 py-12 text-center text-gray-400 italic">No records found matching your search.</td></tr>
                                  )}
                              </tbody>
                          </table>
                          )}
                      </div>
                      
                      {totalPages > 1 && (
                          <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 select-none">
                              <div className="flex items-center gap-2">
                                   <select
                                      value={itemsPerPage}
                                      onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                      className="border border-gray-300 rounded-lg p-1 text-sm focus:ring-2 focus:ring-agri-500 outline-none"
                                   >
                                      <option value={10}>10 rows</option>
                                      <option value={25}>25 rows</option>
                                      <option value={50}>50 rows</option>
                                      <option value={100}>100 rows</option>
                                   </select>
                                   <div className="text-sm text-gray-500 font-medium">
                                      Showing <span className="font-bold text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-gray-900">{Math.min(currentPage * itemsPerPage, filteredRecords.length)}</span> of <span className="font-bold text-gray-900">{filteredRecords.length}</span>
                                   </div>
                              </div>

                              <div className="flex items-center gap-1.5 order-1 md:order-2">
                                  <button 
                                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                      disabled={currentPage === 1} 
                                      className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                                  >
                                      <ChevronLeft size={16}/> Prev
                                  </button>

                                  <div className="flex items-center gap-1">
                                      {getPaginationRange().map((pageNum, idx) => (
                                          typeof pageNum === 'number' ? (
                                              <button
                                                  key={idx}
                                                  onClick={() => setCurrentPage(pageNum)}
                                                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold transition-all ${
                                                      currentPage === pageNum 
                                                      ? 'bg-corp-900 text-white shadow-md border border-corp-900' 
                                                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-100'
                                                  }`}
                                              >
                                                  {pageNum}
                                              </button>
                                          ) : (
                                              <span key={idx} className="px-1 text-gray-400">...</span>
                                          )
                                      ))}
                                  </div>

                                  <button 
                                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                      disabled={currentPage === totalPages} 
                                      className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                                  >
                                      Next <ChevronRight size={16}/>
                                  </button>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          )}

          {activeTab === 'report' && moduleType === 'AREGISTER' && (
               <div className="flex-1 overflow-auto bg-gray-50 p-6">
                   <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                       <div className="p-6 bg-gradient-to-r from-agri-600 to-agri-800 text-white flex justify-between items-center">
                           <div>
                               <h2 className="text-2xl font-bold flex items-center"><BarChart3 className="mr-3" size={28} /> A-Register Summary Report</h2>
                               <p className="text-blue-100 text-sm mt-1">{selectedFile?.fileName}</p>
                           </div>
                           <button onClick={recalculateStats} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-bold backdrop-blur-sm flex items-center">
                               <RefreshCw size={16} className="mr-2"/> Recalculate
                           </button>
                       </div>

                       <div className="p-8">
                           {summaryStats ? (
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                                   <div className="col-span-1 md:col-span-2 bg-blue-50 p-6 rounded-xl border border-blue-100 flex justify-between items-center mb-4">
                                       <div>
                                           <h3 className="text-lg font-bold text-blue-900 uppercase">Total Extent</h3>
                                           <p className="text-sm text-blue-600">Sum of all categories</p>
                                       </div>
                                       <div className="text-4xl font-extrabold text-blue-700 flex items-baseline">
                                           {summaryStats.totalextent.toFixed(2)} <span className="text-lg font-medium text-blue-400 ml-1">Acres</span>
                                       </div>
                                   </div>

                                   {/* Editable Fields Grid */}
                                   <div className="space-y-4">
                                       <h4 className="font-bold text-gray-500 border-b pb-2 mb-4">Patta Lands</h4>
                                       <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                           <span className="font-medium text-gray-700">Patta Dry</span>
                                           <input 
                                              type="number" 
                                              className="w-32 p-2 border border-gray-300 rounded text-right font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                              value={summaryStats.pattaDry}
                                              onChange={(e) => handleSummaryChange('pattaDry', e.target.value)}
                                           />
                                       </div>
                                       <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                           <span className="font-medium text-gray-700">Patta Wet</span>
                                           <input 
                                              type="number" 
                                              className="w-32 p-2 border border-gray-300 rounded text-right font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                              value={summaryStats.pattaWet}
                                              onChange={(e) => handleSummaryChange('pattaWet', e.target.value)}
                                           />
                                       </div>
                                   </div>

                                   <div className="space-y-4">
                                       <h4 className="font-bold text-gray-500 border-b pb-2 mb-4">Inam Lands</h4>
                                       <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                           <span className="font-medium text-gray-700">Inam Dry</span>
                                           <input 
                                              type="number" 
                                              className="w-32 p-2 border border-gray-300 rounded text-right font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                              value={summaryStats.inamDry}
                                              onChange={(e) => handleSummaryChange('inamDry', e.target.value)}
                                           />
                                       </div>
                                       <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                           <span className="font-medium text-gray-700">Inam Wet</span>
                                           <input 
                                              type="number" 
                                              className="w-32 p-2 border border-gray-300 rounded text-right font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                              value={summaryStats.inamWet}
                                              onChange={(e) => handleSummaryChange('inamWet', e.target.value)}
                                           />
                                       </div>
                                   </div>
                                   
                                   <div className="space-y-4">
                                       <h4 className="font-bold text-gray-500 border-b pb-2 mb-4">Dotted Lands</h4>
                                       <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                           <span className="font-medium text-gray-700">Dotted Dry</span>
                                           <input 
                                              type="number" 
                                              className="w-32 p-2 border border-gray-300 rounded text-right font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                              value={summaryStats.dottedDry}
                                              onChange={(e) => handleSummaryChange('dottedDry', e.target.value)}
                                           />
                                       </div>
                                       <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                           <span className="font-medium text-gray-700">Dotted Wet</span>
                                           <input 
                                              type="number" 
                                              className="w-32 p-2 border border-gray-300 rounded text-right font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                              value={summaryStats.dottedWet}
                                              onChange={(e) => handleSummaryChange('dottedWet', e.target.value)}
                                           />
                                       </div>
                                   </div>

                                   <div className="space-y-4">
                                       <h4 className="font-bold text-gray-500 border-b pb-2 mb-4">Other Lands</h4>
                                       <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                           <span className="font-medium text-gray-700">Unassessed Waste (UAW)</span>
                                           <input 
                                              type="number" 
                                              className="w-32 p-2 border border-gray-300 rounded text-right font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                              value={summaryStats.uaw}
                                              onChange={(e) => handleSummaryChange('uaw', e.target.value)}
                                           />
                                       </div>
                                       <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                           <span className="font-medium text-gray-700">Poramboke</span>
                                           <input 
                                              type="number" 
                                              className="w-32 p-2 border border-gray-300 rounded text-right font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                                              value={summaryStats.poramboke}
                                              onChange={(e) => handleSummaryChange('poramboke', e.target.value)}
                                           />
                                       </div>
                                   </div>
                               </div>
                           ) : (
                               <div className="p-10 text-center text-gray-400">
                                   Summary not calculated yet.
                               </div>
                           )}

                           {isSummaryEdited && (
                               <div className="mt-8 flex justify-end animate-in fade-in slide-in-from-bottom-2">
                                   <button onClick={saveSummary} className="px-8 py-3 bg-green-600 text-white rounded-lg font-bold shadow-lg hover:bg-green-700 transition-all flex items-center">
                                       <Save size={20} className="mr-2"/> Save Report
                                   </button>
                               </div>
                           )}
                       </div>
                   </div>
               </div>
          )}
        </div>
      )}
    </>
  );
};
