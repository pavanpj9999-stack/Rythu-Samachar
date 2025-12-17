
import React, { useState, useEffect, useRef } from 'react';
import { DataService } from '../services/mockDataService';
import { ARegisterFile, DynamicRecord, ModuleType, UserRole } from '../types';
import { Search, Trash2, Edit, FileSpreadsheet, Upload, ArrowLeft, Save, Image as ImageIcon, Plus, Columns, CheckCircle, X, Download, ShieldAlert, GitCompare, ArrowRightLeft, FileText, RefreshCw, AlertTriangle, ChevronLeft, ChevronRight, RotateCcw, MonitorPlay, Maximize2, Minimize2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const AdangalComparison: React.FC = () => {
  const moduleType: ModuleType = 'ADANGAL';
  const title = "Adangal Comparison";
  const description = "Upload Base Adangal (ROR) with full Excel formatting support.";
  const [viewMode, setViewMode] = useState<'list' | 'file'>('list');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<ARegisterFile | null>(null);
  const [files, setFiles] = useState<ARegisterFile[]>([]);
  const [records, setRecords] = useState<DynamicRecord[]>([]);
  const [comparisonRecords, setComparisonRecords] = useState<DynamicRecord[]>([]);
  const [comparisonFileName, setComparisonFileName] = useState<string>("");
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  const [currentColumns, setCurrentColumns] = useState<string[]>([]);
  const [mergedCells, setMergedCells] = useState<any[]>([]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10); // Default 10
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<DynamicRecord | null>(null);
  const [viewMedia, setViewMedia] = useState<{ type: 'image' | 'pdf', url: string } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, type: 'row' | 'file', id: string | null }>({ isOpen: false, type: 'row', id: null });
  const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const comparisonInputRef = useRef<HTMLInputElement>(null);
  const tableBottomRef = useRef<HTMLTableRowElement>(null);

  const getCurrentUser = () => {
      const userStr = sessionStorage.getItem('rythu_user');
      if (userStr) return JSON.parse(userStr);
      return { email: 'Unknown', role: 'USER' };
  };
  const user = getCurrentUser();
  const isAdmin = user.role === UserRole.ADMIN;

  useEffect(() => { loadFiles(); }, []);
  useEffect(() => { if(toast.show) { const timer = setTimeout(() => setToast({ ...toast, show: false }), 3000); return () => clearTimeout(timer); } }, [toast.show]);

  const loadFiles = async () => {
    const loadedFiles = await DataService.getModuleFiles(moduleType);
    setFiles(loadedFiles);
  };
  const showToast = (message: string, type: 'success' | 'error' = 'success') => { setToast({ show: true, message, type }); };

  const processMergedCells = (ws: XLSX.WorkSheet) => {
      if (!ws['!merges']) return [];
      return ws['!merges'].map((merge: any) => ({
          s: { r: merge.s.r, c: merge.s.c },
          e: { r: merge.e.r, c: merge.e.c }
      }));
  };

  const parseExcel = (file: File, callback: (headers: string[], data: any[], mergedCells: any[], hasFormulaImages: boolean) => void) => {
      setIsLoading(true);
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const buffer = evt.target?.result;
          const wb = XLSX.read(buffer, { type: 'array' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          
          const merges = processMergedCells(ws);
          const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as any[][];
          
          if(!jsonData || jsonData.length === 0) throw new Error("Empty Sheet");

          let maxCols = 0;
          jsonData.forEach(row => { if(row.length > maxCols) maxCols = row.length; });
          
          const headers = Array.from({ length: maxCols }, (_, i) => i.toString());

          let hasFormulaImages = false;

          const rawData = jsonData.map((row) => {
              const rowObj: any = {};
              for (let i = 0; i < maxCols; i++) {
                  let cellVal = row[i];
                  if (typeof cellVal === 'string') {
                      if (cellVal.startsWith('=') || cellVal.includes('DISPIMG') || cellVal.includes('ID_')) {
                          hasFormulaImages = true;
                          cellVal = ''; 
                      }
                  }
                  rowObj[i.toString()] = (cellVal !== undefined && cellVal !== null) ? String(cellVal) : "";
              }
              return rowObj;
          });
          
          callback(headers, rawData, merges, hasFormulaImages);
        } catch (error) { 
            console.error("Excel Read Error:", error); 
            showToast("Failed to read Excel file.", "error"); 
        } finally { 
            setIsLoading(false); 
        }
      };
      reader.readAsArrayBuffer(file);
  };

  const handleBaseUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) {
        showToast("Permission Denied: Only Admins can upload files.", "error");
        return;
    }
    const file = e.target.files?.[0];
    if (file) {
      parseExcel(file, async (headers, rawData, merges, hasFormulaImages) => {
          const fileId = `${moduleType}_file_${Date.now()}`;
          const newFile: ARegisterFile = { 
              id: fileId, 
              fileName: file.name, 
              uploadDate: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString(), 
              rowCount: rawData.length, 
              columns: headers, 
              module: moduleType,
              metadata: { mergedCells: merges } 
          };
          
          const timestamp = Date.now();
          const newRecords: DynamicRecord[] = rawData.map((rowObj, idx) => {
             const sortIndex = idx.toString().padStart(6, '0');
             const record: DynamicRecord = { 
                 id: `${moduleType}_rec_${timestamp}_${sortIndex}`, 
                 fileId: fileId, 
                 documents: [],
                 is_new: 1,
                 is_uploaded: 1, // Flag for Full Screen View
                 ...rowObj 
             };
             return record;
          });
          
          await DataService.saveModuleFile(moduleType, newFile);
          await DataService.saveModuleRecords(moduleType, newRecords);
          
          if(hasFormulaImages) {
              showToast("Warning: Formula images (DISPIMG) skipped. Use 'Copy as Picture' in Excel.", "error");
          } else {
              showToast(`Uploaded ${rawData.length} rows successfully!`);
          }
          
          await loadFiles();
          await handleViewFile(newFile);
          if (fileInputRef.current) fileInputRef.current.value = '';
      });
    }
  };
  
  const handleViewFile = async (file: ARegisterFile) => {
      setSelectedFile(file);
      setCurrentColumns(file.columns || []);
      setMergedCells(file.metadata?.mergedCells || []);
      const fileRecords = await DataService.getModuleRecords(moduleType, file.id);
      fileRecords.sort((a, b) => a.id.localeCompare(b.id));
      setRecords(fileRecords);
      setComparisonRecords([]); setComparisonFileName(""); 
      setEditingId(null); setEditFormData(null); 
      setCurrentPage(1); setViewMode('file');
      setIsFullScreen(false);
      setItemsPerPage(10);
  };

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
    if (!isFullScreen) {
        setItemsPerPage(50);
        setCurrentPage(1);
    } else {
        setItemsPerPage(10);
    }
  };

  const getCellMergeProps = (rowIndex: number, colIndex: number, merges: any[]) => {
      const range = merges.find(m => 
          rowIndex >= m.s.r && rowIndex <= m.e.r &&
          colIndex >= m.s.c && colIndex <= m.e.c
      );
      if (!range) return { isMerged: false, rowSpan: 1, colSpan: 1, skip: false };
      if (range.s.r === rowIndex && range.s.c === colIndex) {
          return {
              isMerged: true,
              rowSpan: range.e.r - range.s.r + 1,
              colSpan: range.e.c - range.s.c + 1,
              skip: false
          };
      }
      return { isMerged: true, rowSpan: 1, colSpan: 1, skip: true };
  };

  const confirmDeleteFile = async () => { if(deleteModal.id) { await DataService.softDeleteModuleFile(moduleType, deleteModal.id, user.email); await loadFiles(); if(selectedFile?.id === deleteModal.id) { setViewMode('list'); setSelectedFile(null); } showToast("File moved to Recycle Bin."); } setDeleteModal({ isOpen: false, type: 'file', id: null }); };
  const initiateDeleteFile = (fileId: string, e: React.MouseEvent) => { e.stopPropagation(); if(!isAdmin) { showToast("Admin Only", "error"); return; } setDeleteModal({ isOpen: true, type: 'file', id: fileId }); };

  // --- FILTERING ---
  const filteredRecords = records.filter(record => {
    let matches = true;
    // 1. Generic Search (Survey / Khata)
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        // Fallback: Global search across all fields
        matches = Object.values(record).some(v => String(v).toLowerCase().includes(term));
    }
    
    return matches;
  });

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
  const paginatedRecords = filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const globalRowOffset = (currentPage - 1) * itemsPerPage;

  const handleClearSearch = () => {
    setSearchTerm('');
    setCurrentPage(1);
  };

  // --- PAGINATION HELPER ---
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

  // --- EXPORT HANDLERS ---
  const handleExportExcel = () => {
    try {
        const dataToExport = filteredRecords;
        const exportData = dataToExport.map(record => {
            const row: any = {};
            // Add Serial Number
            row['S.No'] = dataToExport.indexOf(record) + 1;
            
            currentColumns.forEach(col => {
                let val = record[col];
                // Force string conversion
                if (val === null || val === undefined) val = '';
                val = String(val);
                
                // Truncate logic to prevent Excel 32k character limit crash
                // Reduced limit to 25000 for safety against multi-byte characters
                if (val.length > 25000) {
                   val = val.substring(0, 25000) + '...[Truncated]';
                }
                row[col] = val;
            });
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Adangal Data");
        XLSX.writeFile(wb, "Adangal_Comparison_Export.xlsx");
    } catch (e) {
        console.error(e);
        showToast("Export failed", "error");
    }
  };

  const handleExportPDF = () => {
    try {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.text("Adangal Comparison Report", 14, 10);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 16);
        doc.text(`File: ${selectedFile?.fileName}`, 14, 21);
        
        // Limit columns for PDF fitting (first 10 relevant columns + S.No)
        const displayCols = currentColumns.slice(0, 10);
        const tableColumn = ['S.No', ...displayCols]; 
        
        const dataToExport = filteredRecords;

        const tableRows = dataToExport.map((record, index) => {
            const rowData: (string | number)[] = [index + 1];
            displayCols.forEach(col => {
                let val = String(record[col] || '');
                if (val.length > 100) val = val.substring(0, 100) + '...';
                rowData.push(val);
            });
            return rowData;
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 25,
            styles: { fontSize: 7 },
            headStyles: { fillColor: [22, 163, 74] }
        });
        doc.save("Adangal_Comparison_Report.pdf");
    } catch (e) {
        console.error(e);
        showToast("PDF Export failed", "error");
    }
  };

  if (viewMode === 'list') { return ( <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">{toast.show && <div className={`fixed top-24 right-5 z-50 px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-right ${toast.type === 'success' ? 'bg-corp-900 text-white' : 'bg-red-600 text-white'}`}>{toast.message}</div>}{deleteModal.isOpen && deleteModal.type === 'file' && (<div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"><div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 text-center"><h3 className="text-xl font-bold mb-2">Delete File?</h3><div className="flex gap-3 mt-4"><button onClick={() => setDeleteModal({ isOpen: false, type: 'file', id: null })} className="flex-1 px-4 py-2 bg-gray-100 rounded-lg">Cancel</button><button onClick={confirmDeleteFile} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg">Confirm</button></div></div></div>)}<div className="bg-white p-8 rounded-xl shadow-sm border border-corp-100 flex flex-col md:flex-row items-center gap-8"><div className="flex-1"><h2 className="text-2xl font-bold text-corp-800 flex items-center mb-2"><GitCompare className="mr-3 text-agri-600" size={28} /> {title}</h2><p className="text-corp-500 mb-4">{description}</p>{isAdmin && (<><input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleBaseUpload} /><button onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-corp-900 text-white rounded-lg hover:bg-black font-medium shadow-lg flex items-center" disabled={isLoading}>{isLoading ? <RefreshCw className="animate-spin mr-2"/> : <Upload size={20} className="mr-2" />} {isLoading ? 'Processing...' : 'Upload Base Adangal File'}</button></>)}</div></div><div className="bg-white rounded-xl shadow-sm border border-corp-100 overflow-hidden"><div className="p-5 border-b bg-gray-50"><h3 className="font-bold text-corp-800">Uploaded Base Files</h3></div><div className="divide-y divide-corp-50">{files.length === 0 ? <div className="p-12 text-center text-corp-300">No files yet.</div> : files.map(file => (<div key={file.id} className="p-5 flex flex-col sm:flex-row items-center justify-between hover:bg-blue-50/50 transition-colors group"><div className="flex items-center space-x-4"><FileSpreadsheet size={24} className="text-blue-600" /><span className="font-bold text-corp-800">{file.fileName}</span></div><div className="flex items-center gap-3"><button onClick={() => handleViewFile(file)} className="px-5 py-2.5 bg-corp-900 text-white rounded-lg text-sm font-bold shadow-md flex items-center"><ArrowLeft size={16} className="rotate-180 mr-2" /> Open File</button>{isAdmin && <button onClick={(e) => initiateDeleteFile(file.id, e)} className="p-2.5 text-corp-400 hover:text-red-600"><Trash2 size={20} /></button>}</div></div>))}</div></div></div> ); }
  
  return ( 
    <div className={isFullScreen ? "fixed inset-0 z-[100] bg-white flex flex-col animate-in fade-in zoom-in-95" : "flex flex-col h-[calc(100vh-8rem)] animate-in fade-in slide-in-from-right-4"}>
        {toast.show && (<div className={`fixed top-24 right-5 z-50 px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 ${toast.type === 'success' ? 'bg-corp-900 text-white' : 'bg-red-600 text-white'}`}>{toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}<span className="font-bold">{toast.message}</span></div>)}
        
        {/* Header */}
        <div className="bg-white border-b border-corp-200 px-6 py-4 flex flex-col gap-4 shadow-sm shrink-0">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    {!isFullScreen && (
                        <button onClick={() => setViewMode('list')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft size={20} /></button>
                    )}
                    <div>
                        <h2 className="text-xl font-bold text-corp-900">{selectedFile?.fileName}</h2>
                        <span className="text-xs text-gray-500">Excel View • {records.length} Rows</span>
                    </div>
                </div>
                
                {/* Export Buttons */}
                <div className="flex gap-2">
                    <button onClick={toggleFullScreen} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200 flex items-center font-bold text-sm" title={isFullScreen ? "Exit Full Screen" : "Full Screen"}>{isFullScreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}</button>
                    <button onClick={handleExportExcel} className="flex items-center px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-sm font-bold shadow-sm">
                        <FileSpreadsheet size={18} className="mr-2" /> Excel
                    </button>
                    <button onClick={handleExportPDF} className="flex items-center px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-bold shadow-sm">
                        <FileText size={18} className="mr-2" /> PDF
                    </button>
                </div>
            </div>
        </div>

        {/* Data Grid View */}
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50 p-4">
            
            {/* UNIFIED SEARCH BAR */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-corp-100 mb-4 flex flex-col md:flex-row gap-4 items-end">
                {/* Generic Search */}
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
                    <button 
                        onClick={() => setCurrentPage(1)}
                        className="flex-1 md:flex-none px-6 py-2 bg-corp-900 text-white rounded-lg font-bold text-sm hover:bg-black transition-colors shadow-md"
                    >
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

            <div className="flex-1 bg-white border border-corp-200 rounded-xl overflow-hidden shadow-sm relative flex flex-col min-h-0 max-h-[600px] flex-grow">
                <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-gray-300">
                    <table className="border-collapse w-full text-sm">
                        <thead className="sticky top-0 bg-white z-10 shadow-sm">
                            <tr>
                                {currentColumns.map((colKey, colIndex) => (
                                    <th key={colKey} className="border border-gray-300 px-2 py-2 bg-gray-100 text-left font-bold min-w-[100px]">{colKey}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {paginatedRecords.length > 0 ? paginatedRecords.map((record, localRowIndex) => {
                                const globalRowIndex = globalRowOffset + localRowIndex;
                                // STANDARD: Existing/Bulk=White, Updated=Green, New=Pink
                                let rowClass = "hover:bg-blue-50/10 bg-white";
                                if (record.is_new === 1 && record.is_uploaded !== 1) {
                                    rowClass = "bg-pink-50 hover:bg-pink-100";
                                } else if (record.is_updated === 1) {
                                    rowClass = "bg-[#d4f8d4] hover:bg-green-100";
                                }

                                return (
                                    <tr key={record.id} className={rowClass}>
                                        {currentColumns.map((colKey, colIndex) => {
                                            const { isMerged, rowSpan, colSpan, skip } = getCellMergeProps(globalRowIndex, colIndex, mergedCells);
                                            if (skip) return null; 
                                            return (
                                                <td 
                                                    key={colKey}
                                                    rowSpan={rowSpan}
                                                    colSpan={colSpan}
                                                    className="border border-gray-300 px-2 py-1 align-top break-words min-w-[50px] max-w-[400px]"
                                                    style={{ height: '24px' }}
                                                >
                                                    {record[colKey] || ""}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={currentColumns.length} className="px-6 py-10 text-center text-gray-400">
                                        No matching records found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    {records.length === 0 && <div className="p-10 text-center text-gray-400">No data available</div>}
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

                        {/* Pagination Controls */}
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
    </div>
  );
};
