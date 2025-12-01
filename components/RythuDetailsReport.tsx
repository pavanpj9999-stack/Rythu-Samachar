
import React, { useState, useEffect } from 'react';
import { DataService } from '../services/mockDataService';
import { DynamicRecord, UserRole } from '../types';
import { FileText, Download, Calendar, RefreshCw, Loader2, Image as ImageIcon, Filter, CheckCircle, Edit, UserCheck, Search, FileSpreadsheet, ChevronLeft, ChevronRight, Eraser, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const RythuDetailsReport: React.FC = () => {
    const [records, setRecords] = useState<DynamicRecord[]>([]);
    const [filteredRecords, setFilteredRecords] = useState<DynamicRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastRefreshed, setLastRefreshed] = useState('');
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    
    // Stats
    const [stats, setStats] = useState({
        total: 0,
        newRows: 0,
        updatedRows: 0,
        highlightedRows: 0,
        photos: 0
    });

    // Filters
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    
    const getCurrentUser = () => {
      const userStr = sessionStorage.getItem('rythu_user');
      if (userStr) return JSON.parse(userStr);
      return { role: 'USER' };
    };
    const user = getCurrentUser();
    const isAdmin = user.role === UserRole.ADMIN;

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [records, fromDate, toDate, searchTerm]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await DataService.getModuleRecords('RYTHU_DETAILS');
            // Sort by latest created/updated
            data.sort((a, b) => {
                const dateA = new Date(a.updatedDate || a.createdDate || 0).getTime();
                const dateB = new Date(b.updatedDate || b.createdDate || 0).getTime();
                return dateB - dateA;
            });
            setRecords(data);
            setLastRefreshed(new Date().toLocaleTimeString());
        } catch (e) {
            console.error("Failed to load Rythu Details", e);
        } finally {
            setLoading(false);
        }
    };
    
    const handleClearHighlights = async () => {
        if(!window.confirm("Are you sure you want to clear all highlight flags for Rythu Details? This will reset the Pink rows to normal.")) return;
        await DataService.clearModuleModifiedFlags('RYTHU_DETAILS');
        await loadData();
    };

    const applyFilters = () => {
        let result = [...records];

        // Date Filter
        if (fromDate) {
            const from = new Date(fromDate).setHours(0, 0, 0, 0);
            result = result.filter(r => {
                const rDate = new Date(r.createdDate || r.updatedDate || 0).setHours(0, 0, 0, 0);
                return rDate >= from;
            });
        }
        if (toDate) {
            const to = new Date(toDate).setHours(23, 59, 59, 999);
            result = result.filter(r => {
                const rDate = new Date(r.createdDate || r.updatedDate || 0).setHours(0, 0, 0, 0);
                return rDate <= to;
            });
        }
        
        // Search Filter (Generic)
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(term)));
        }

        setFilteredRecords(result);
        calculateStats(result);
        setCurrentPage(1); // Reset to first page on filter
    };

    const calculateStats = (data: DynamicRecord[]) => {
        let newCount = 0;
        let updatedCount = 0;
        let highlightedCount = 0;
        let photoCount = 0;

        data.forEach(r => {
            if (r.is_new === 1) newCount++;
            if (r.is_updated === 1) updatedCount++;
            if (r.is_modified === 1 || r.is_highlighted === 1) highlightedCount++;
            
            // Photo Logic: Check specific columns or imageUrl
            const hasPhoto = r.imageUrl || r['Photo'] || r['Picture'] || r['image'] || r['photo'];
            if (hasPhoto && !String(hasPhoto).includes('[Image]')) photoCount++;
        });

        setStats({
            total: data.length,
            newRows: newCount,
            updatedRows: updatedCount,
            highlightedRows: highlightedCount,
            photos: photoCount
        });
    };
    
    // Pagination Calculations
    const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
    const paginatedRecords = filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // --- EXPORT FUNCTIONS ---
    const handleExportExcel = () => {
        const exportData = filteredRecords.map(r => {
            const { id, fileId, is_new, is_updated, is_highlighted, is_modified, documents, metadata, ...cleanRecord } = r;
            return cleanRecord;
        });
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Rythu Details Report");
        XLSX.writeFile(wb, "Rythu_Details_Report.xlsx");
    };

    const handleExportPDF = () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.text("Rythu Details Report", 14, 10);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 16);
        doc.text(`Total Records: ${filteredRecords.length}`, 14, 21);

        const tableColumn = ["ID", "Created By", "Date", "Status"]; 
        // Note: Dynamic columns vary, so picking static/audit fields for PDF + first 3 dynamic keys
        
        // Helper to get first few keys that aren't system keys
        const sampleKeys = filteredRecords.length > 0 
            ? Object.keys(filteredRecords[0]).filter(k => !['id', 'fileId', 'is_new', 'is_updated', 'is_highlighted', 'is_modified', 'documents', 'imageUrl', 'createdBy', 'createdDate', 'updatedBy', 'updatedDate'].includes(k)).slice(0, 4)
            : [];
            
        const headers = [...sampleKeys, "Created By", "Date"];

        const tableRows = filteredRecords.map(r => {
            const rowData: any[] = [];
            sampleKeys.forEach(k => rowData.push(String(r[k] || '').substring(0, 20)));
            rowData.push(r.createdBy || r.updatedBy || 'N/A');
            rowData.push(r.createdDate ? new Date(r.createdDate).toLocaleDateString() : 'N/A');
            return rowData;
        });

        autoTable(doc, {
            head: [headers],
            body: tableRows,
            startY: 25,
            styles: { fontSize: 8 },
            headStyles: { fillColor: [147, 51, 234] } // Purple theme
        });
        doc.save("Rythu_Details_Report.pdf");
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in slide-in-from-right-4">
            
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                        <UserCheck className="mr-3 text-purple-600" size={28} />
                        Rythu Details Report
                    </h2>
                    <p className="text-gray-500 text-sm">Overview of farmer data, updates, and field activity.</p>
                </div>
                <div className="flex items-center gap-3">
                    {isAdmin && (
                       <button 
                          onClick={handleClearHighlights}
                          className="flex items-center px-4 py-2 bg-pink-50 text-pink-700 border border-pink-200 rounded-lg font-bold hover:bg-pink-100 transition-colors shadow-sm text-sm whitespace-nowrap"
                       >
                           <Eraser size={18} className="mr-2"/> Clear Highlights
                       </button>
                    )}
                    <span className="text-xs text-gray-400 font-mono hidden md:block">Refreshed: {lastRefreshed}</span>
                    <button 
                        onClick={loadData} 
                        className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                        title="Refresh Data"
                    >
                        <RefreshCw size={20} className={`${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <div className="h-8 w-px bg-gray-300 mx-1 hidden sm:block"></div>
                    <button onClick={handleExportExcel} className="flex items-center px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-bold text-sm">
                        <FileSpreadsheet size={18} className="mr-2"/> Excel
                    </button>
                    <button onClick={handleExportPDF} className="flex items-center px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 font-bold text-sm">
                        <FileText size={18} className="mr-2"/> PDF
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6 bg-gray-50">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Records</p>
                        <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                    </div>
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><UserCheck size={24}/></div>
                </div>
                
                {/* Active Highlighted Rows (Pink) */}
                <div className="bg-white p-4 rounded-xl border-l-4 border-pink-400 shadow-sm flex items-center justify-between col-span-2 md:col-span-1">
                    <div>
                        <p className="text-xs font-bold text-pink-600 uppercase tracking-wider">Active Changes</p>
                        <p className="text-2xl font-bold text-pink-800">{stats.highlightedRows}</p>
                    </div>
                    <div className="p-3 bg-pink-50 text-pink-600 rounded-lg"><AlertTriangle size={24}/></div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Newly Added</p>
                        <p className="text-2xl font-bold text-green-600">{stats.newRows}</p>
                    </div>
                    <div className="p-3 bg-green-50 text-green-600 rounded-lg"><CheckCircle size={24}/></div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Updates</p>
                        <p className="text-2xl font-bold text-orange-600">{stats.updatedRows}</p>
                    </div>
                    <div className="p-3 bg-orange-50 text-orange-600 rounded-lg"><Edit size={24}/></div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Photos</p>
                        <p className="text-2xl font-bold text-purple-600">{stats.photos}</p>
                    </div>
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><ImageIcon size={24}/></div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="px-6 pb-4 bg-gray-50 flex flex-col md:flex-row gap-4 items-end border-b border-gray-200">
                <div className="flex items-center gap-4 bg-white p-3 rounded-lg border border-gray-200 shadow-sm w-full md:w-auto">
                    <Filter size={18} className="text-gray-400" />
                    <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">From Date</label>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="text-sm outline-none font-medium text-gray-700"/>
                    </div>
                    <div className="w-px h-8 bg-gray-200 mx-2"></div>
                    <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">To Date</label>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="text-sm outline-none font-medium text-gray-700"/>
                    </div>
                </div>
                
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                    <input 
                        className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500 outline-none shadow-sm"
                        placeholder="Search records..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Data Table */}
            <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm relative flex flex-col min-h-0 mx-6 mb-6">
                {loading ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                        <Loader2 size={48} className="animate-spin mb-4 text-purple-500" />
                        <p>Loading Report Data...</p>
                    </div>
                ) : (
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-100 text-gray-600 text-xs uppercase sticky top-0 z-10">
                                <tr>
                                    <th className="p-4 border-b border-gray-200 font-bold">Status</th>
                                    <th className="p-4 border-b border-gray-200 font-bold">Action By</th>
                                    <th className="p-4 border-b border-gray-200 font-bold">Date</th>
                                    {/* Render dynamic columns (first 5 for preview) */}
                                    {filteredRecords.length > 0 && Object.keys(filteredRecords[0])
                                        .filter(k => !['id','fileId','is_new','is_updated','documents','imageUrl','createdBy','createdDate','updatedBy','updatedDate','metadata', 'is_highlighted', 'is_modified'].includes(k))
                                        .slice(0, 5)
                                        .map((key, idx) => (
                                            <th key={idx} className="p-4 border-b border-gray-200 font-bold whitespace-nowrap">{key}</th>
                                        ))
                                    }
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paginatedRecords.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="p-10 text-center text-gray-400">No records found matching filters.</td>
                                    </tr>
                                ) : (
                                    paginatedRecords.map((record, index) => {
                                        const isNew = record.is_new === 1;
                                        const isUpdated = record.is_updated === 1;
                                        const isModified = record.is_modified === 1 || record.is_highlighted === 1;
                                        
                                        const user = record.createdBy || record.updatedBy || 'System';
                                        const date = record.createdDate || record.updatedDate;
                                        const displayDate = date ? new Date(date).toLocaleString() : 'N/A';
                                        
                                        // Row Color Logic for Report: Highlight if flagged
                                        const rowClass = isModified ? "bg-pink-50 hover:bg-pink-100" : "hover:bg-gray-50";

                                        let statusBadge = <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">Existing</span>;
                                        if (isNew) statusBadge = <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">New</span>;
                                        else if (isUpdated) statusBadge = <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">Updated</span>;

                                        return (
                                            <tr key={record.id} className={`${rowClass} transition-colors`}>
                                                <td className="p-4 align-middle">{statusBadge}</td>
                                                <td className="p-4 align-middle text-sm font-medium text-gray-800">{user}</td>
                                                <td className="p-4 align-middle text-sm text-gray-500">{displayDate}</td>
                                                {Object.keys(record)
                                                    .filter(k => !['id','fileId','is_new','is_updated','documents','imageUrl','createdBy','createdDate','updatedBy','updatedDate','metadata', 'is_highlighted', 'is_modified'].includes(k))
                                                    .slice(0, 5)
                                                    .map((key, idx) => (
                                                        <td key={idx} className="p-4 align-middle text-sm text-gray-700 max-w-[200px] truncate">
                                                            {String(record[key] || '')}
                                                        </td>
                                                    ))
                                                }
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                
                {/* Pagination Footer */}
                {filteredRecords.length > 0 && (
                    <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 select-none">
                        <div className="flex items-center gap-2">
                             <select
                                value={itemsPerPage}
                                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                className="border border-gray-300 rounded-lg p-1 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
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
                            <span className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm font-bold border border-purple-100">{currentPage}</span>
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
    );
};
