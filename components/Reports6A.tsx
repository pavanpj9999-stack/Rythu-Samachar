
import React, { useEffect, useState } from 'react';
import { DataService, AuthService } from '../services/mockDataService';
import { DynamicRecord, UserRole, User } from '../types';
import { LayoutDashboard, Loader2, RefreshCw, User as UserIcon, CheckCircle, Upload, Edit, PlusCircle, Activity, Eraser, AlertTriangle, X, Calendar, Search, Filter, FileText, FileSpreadsheet, ChevronLeft, ChevronRight, Clock, Shield, MonitorPlay, Database, PieChart } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ExtentReport } from './ExtentReport';

interface TeamStats {
    userId: string;
    userName: string;
    teamLabel: string; // Team 1, Team 2, etc.
    totalEntries: number;
    newRows: number;
    updatedRows: number;
    highlightedRows: number; // New Stat
    photosUploaded: number;
    activityByDate: { date: string, count: number }[];
}

interface AuditLog {
    id: string;
    recordId: string;
    staffName: string;
    action: 'New Entry' | 'Modified' | 'Photo Upload';
    description: string;
    timestamp: string;
    rawDate: Date;
    module: string;
}

export const Reports6A: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'activity' | 'extent'>('activity');
  const [stats, setStats] = useState<TeamStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [total6ACount, setTotal6ACount] = useState(0);
  
  // Data State
  const [allRecords, setAllRecords] = useState<DynamicRecord[]>([]);

  // Modal State
  const [selectedTeam, setSelectedTeam] = useState<TeamStats | null>(null);
  const [historyLogs, setHistoryLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  
  // Modal Filters
  const [modalSearch, setModalSearch] = useState('');
  const [modalFromDate, setModalFromDate] = useState('');
  const [modalToDate, setModalToDate] = useState('');
  const [modalActionFilter, setModalActionFilter] = useState('All');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const getCurrentUser = () => {
      const userStr = sessionStorage.getItem('rythu_user');
      if (userStr) return JSON.parse(userStr);
      return { role: 'USER' };
  };
  const user = getCurrentUser();
  const isAdmin = user.role === UserRole.ADMIN;

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Filter Effect
  useEffect(() => {
      if (selectedTeam) {
          filterLogs();
      }
  }, [historyLogs, modalSearch, modalFromDate, modalToDate, modalActionFilter]);

  const loadDashboardData = async () => {
    setLoading(true);
    
    // 1. Fetch Staff Users (Exclude Admin if you only want 'Teams')
    const allUsers = AuthService.getAllUsers();
    const staffUsers = allUsers.filter(u => u.role !== UserRole.ADMIN);
    
    // 2. Fetch Data from All Monitored Modules
    const modulesToCheck = ['DATA_6A', 'RYTHU_DETAILS', 'AREGISTER', 'ADANGAL'];
    let fetchedRecords: DynamicRecord[] = [];
    
    for (const mod of modulesToCheck) {
        const recs = await DataService.getModuleRecords(mod as any);
        // Tag with module for context
        const recsWithModule = recs.map(r => ({ ...r, _sourceModule: mod }));
        fetchedRecords = [...fetchedRecords, ...recsWithModule];
    }
    
    setAllRecords(fetchedRecords);

    // NEW: Calculate Total 6A Records
    const count6A = fetchedRecords.filter(r => r._sourceModule === 'DATA_6A').length;
    setTotal6ACount(count6A);

    // 3. Aggregate Stats per User
    const teamStats: TeamStats[] = [];
    
    // We need 8 slots fixed (Increased from 6)
    for (let i = 0; i < 8; i++) {
        const user = staffUsers[i]; // Get user at index
        const teamLabel = `Team ${i + 1}`;
        
        if (!user) {
            // Placeholder for empty team slot
            teamStats.push({
                userId: `placeholder_${i}`,
                userName: 'Unassigned',
                teamLabel,
                totalEntries: 0,
                newRows: 0,
                updatedRows: 0,
                highlightedRows: 0,
                photosUploaded: 0,
                activityByDate: []
            });
            continue;
        }

        const userRecords = fetchedRecords.filter(r => 
            (r.createdBy === user.name) || (r.updatedBy === user.name)
        );

        let newRowsCount = 0;
        let updatedRowsCount = 0;
        let highlightedCount = 0;
        let photosCount = 0;
        const dateMap: Record<string, number> = {};

        userRecords.forEach(r => {
            // Highlight Check (Modified or Highlighted Legacy)
            if (r.is_modified === 1 || r.is_highlighted === 1) {
                highlightedCount++;
            }

            // New Rows: Created by user AND marked is_new
            if (r.createdBy === user.name && r.is_new === 1) {
                newRowsCount++;
                const date = r.createdDate ? r.createdDate.split('T')[0] : 'Unknown';
                dateMap[date] = (dateMap[date] || 0) + 1;
            }
            
            // Updated Rows
            if (r.updatedBy === user.name && r.is_updated === 1) {
                 updatedRowsCount++;
                 const date = r.updatedDate ? r.updatedDate.split('T')[0] : 'Unknown';
                 dateMap[date] = (dateMap[date] || 0) + 1;
            }

            // Photos
            if ((r.imageUrl || r['Photo'] || r['Picture'] || r['image']) && (r.updatedBy === user.name || r.createdBy === user.name)) {
                photosCount++;
            }
        });

        // Convert dateMap to array for chart
        const activityByDate = Object.entries(dateMap)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date))
            .slice(-7); // Last 7 days

        teamStats.push({
            userId: user.id,
            userName: user.name,
            teamLabel,
            totalEntries: userRecords.length,
            newRows: newRowsCount,
            updatedRows: updatedRowsCount,
            highlightedRows: highlightedCount,
            photosUploaded: photosCount,
            activityByDate
        });
    }

    setStats(teamStats);
    setLastRefreshed(new Date().toLocaleTimeString());
    setLoading(false);
  };

  const generateAuditLogs = (userRecords: DynamicRecord[], userName: string) => {
      const logs: AuditLog[] = [];
      
      userRecords.forEach(r => {
          const moduleName = r['_sourceModule'] || 'General';
          
          // Identifier Helper
          const identifier = `S.No: ${r['Survey No'] || r['Survey_No'] || r['sy_no'] || 'N/A'}`;

          // 1. Creation Action
          if (r.createdBy === userName) {
              logs.push({
                  id: `${r.id}_create`,
                  recordId: r.id,
                  staffName: userName,
                  action: 'New Entry',
                  description: `Created new record in ${moduleName}. ${identifier}`,
                  timestamp: r.createdDate || new Date().toISOString(),
                  rawDate: new Date(r.createdDate || 0),
                  module: moduleName
              });
          }

          // 2. Update/Modification Action
          if (r.updatedBy === userName) {
              const isPhoto = (r.imageUrl || r['Photo']) && !r.is_new; // Heuristic
              
              logs.push({
                  id: `${r.id}_update`,
                  recordId: r.id,
                  staffName: userName,
                  action: isPhoto ? 'Photo Upload' : 'Modified',
                  description: isPhoto 
                    ? `Uploaded photo/document for ${identifier}` 
                    : `Updated record details for ${identifier}. ${r.is_modified ? 'Manual Modification' : 'Bulk Update'}`,
                  timestamp: r.updatedDate || new Date().toISOString(),
                  rawDate: new Date(r.updatedDate || 0),
                  module: moduleName
              });
          }
      });

      // Sort Descending
      return logs.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime());
  };

  const handleTeamClick = (team: TeamStats) => {
      if (team.userName === 'Unassigned') return;
      
      const userRecords = allRecords.filter(r => 
        (r.createdBy === team.userName) || (r.updatedBy === team.userName)
      );
      
      const logs = generateAuditLogs(userRecords, team.userName);
      setHistoryLogs(logs);
      setFilteredLogs(logs);
      setSelectedTeam(team);
      
      // Reset Filters
      setModalSearch('');
      setModalFromDate('');
      setModalToDate('');
      setModalActionFilter('All');
      setCurrentPage(1);
  };

  const filterLogs = () => {
      let result = [...historyLogs];

      // Text Search
      if (modalSearch) {
          const term = modalSearch.toLowerCase();
          result = result.filter(l => 
             l.description.toLowerCase().includes(term) || 
             l.recordId.toLowerCase().includes(term) ||
             l.module.toLowerCase().includes(term)
          );
      }

      // Action Filter
      if (modalActionFilter !== 'All') {
          result = result.filter(l => l.action === modalActionFilter);
      }

      // Date Range
      if (modalFromDate) {
          const from = new Date(modalFromDate).setHours(0,0,0,0);
          result = result.filter(l => l.rawDate.getTime() >= from);
      }
      if (modalToDate) {
          const to = new Date(modalToDate).setHours(23,59,59,999);
          result = result.filter(l => l.rawDate.getTime() <= to);
      }

      setFilteredLogs(result);
      setCurrentPage(1); // Reset pagination on filter change
  };

  const handleClearHighlights = async () => {
      if(!window.confirm("Are you sure you want to clear all highlight flags for 6A Data? This will reset the Pink rows to normal.")) return;
      await DataService.clearModuleModifiedFlags('DATA_6A');
      await loadDashboardData();
  };

  // --- PAGINATION HELPERS ---
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // --- EXPORT HANDLERS ---
  const handleExportExcel = () => {
      if (!selectedTeam) return;
      const data = filteredLogs.map((log, idx) => ({
          "S.No": idx + 1,
          "Staff Name": log.staffName,
          "Action Type": log.action,
          "Module": log.module,
          "Description": log.description,
          "Record ID": log.recordId,
          "Date & Time": new Date(log.timestamp).toLocaleString()
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Activity_History");
      XLSX.writeFile(wb, `${selectedTeam.userName}_Activity_Report.xlsx`);
  };

  const handleExportPDF = () => {
      if (!selectedTeam) return;
      const doc = new jsPDF('l', 'mm', 'a4');
      doc.text(`Activity Report: ${selectedTeam.userName} (${selectedTeam.teamLabel})`, 14, 10);
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 16);

      const headers = ["S.No", "Action", "Module", "Description", "Date"];
      const rows = filteredLogs.map((log, idx) => [
          idx + 1,
          log.action,
          log.module,
          log.description.substring(0, 60) + (log.description.length > 60 ? '...' : ''),
          new Date(log.timestamp).toLocaleString()
      ]);

      autoTable(doc, {
          head: [headers],
          body: rows,
          startY: 20,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] }, // Blue
          columnStyles: { 3: { cellWidth: 100 } } // Description width
      });
      doc.save(`${selectedTeam.userName}_Activity_Report.pdf`);
  };

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F'];

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-in fade-in slide-in-from-right-4">
       {/* Header */}
       <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-sm shrink-0 gap-4">
           <div>
               <div className="flex items-center gap-4">
                   <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                       <LayoutDashboard className="mr-3 text-blue-600" size={28} />
                       8-Teams Work Monitor
                   </h2>
                   {!loading && activeTab === 'activity' && (
                        <div className="bg-indigo-50 text-indigo-700 px-4 py-1.5 rounded-full text-sm font-bold border border-indigo-100 flex items-center shadow-sm animate-in fade-in zoom-in">
                           <Database size={16} className="mr-2 text-indigo-500" />
                           Total 6A Records: <span className="ml-1 text-lg font-extrabold">{total6ACount}</span>
                        </div>
                   )}
               </div>
               {/* TAB NAVIGATION */}
               <div className="flex gap-4 mt-4">
                   <button 
                       onClick={() => setActiveTab('activity')}
                       className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'activity' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
                   >
                       <Activity size={16} className="mr-2" /> Day Activity
                   </button>
                   <button 
                       onClick={() => setActiveTab('extent')}
                       className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'extent' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}`}
                   >
                       <PieChart size={16} className="mr-2" /> Extent Report
                   </button>
               </div>
           </div>
           
           {activeTab === 'activity' && (
           <div className="flex items-center gap-4">
               {isAdmin && (
                   <button 
                      onClick={handleClearHighlights}
                      className="flex items-center px-4 py-2 bg-pink-50 text-pink-700 border border-pink-200 rounded-lg font-bold hover:bg-pink-100 transition-colors shadow-sm"
                   >
                       <Eraser size={18} className="mr-2"/> Clear Highlights
                   </button>
               )}
               <span className="text-xs text-gray-400 font-mono hidden md:inline">Refreshed: {lastRefreshed}</span>
               <button 
                  onClick={loadDashboardData} 
                  className="flex items-center px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-bold hover:bg-blue-100 transition-colors shadow-sm"
                  disabled={loading}
               >
                   <RefreshCw size={18} className={`mr-2 ${loading ? 'animate-spin' : ''}`}/> Refresh
               </button>
           </div>
           )}
       </div>
       
       {/* Content */}
       <div className="flex-1 bg-gray-50 p-6 overflow-y-auto">
           {activeTab === 'extent' ? (
               <ExtentReport />
           ) : (
               <>
                   {loading ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <Loader2 size={64} className="animate-spin mb-4 text-blue-500" />
                            <p className="text-lg">Aggregating Team Data...</p>
                        </div>
                   ) : (
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                           {stats.map((team, idx) => (
                               <div 
                                 key={idx} 
                                 onClick={() => handleTeamClick(team)}
                                 className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden transition-all flex flex-col relative group ${team.userName !== 'Unassigned' ? 'hover:shadow-lg hover:-translate-y-1 cursor-pointer' : 'opacity-60 cursor-default'}`}
                               >
                                   {/* Hover Hint */}
                                   {team.userName !== 'Unassigned' && (
                                       <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 text-white text-[10px] px-2 py-1 rounded-full font-bold z-10">
                                           Click for Details
                                       </div>
                                   )}

                                   {/* Card Header */}
                                   <div className={`p-4 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r ${team.userName === 'Unassigned' ? 'from-gray-50 to-gray-100' : 'from-blue-50 to-white'}`}>
                                       <div className="flex items-center gap-3">
                                           <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm ${team.userName === 'Unassigned' ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white'}`}>
                                               {team.userName === 'Unassigned' ? '?' : team.userName.charAt(0)}
                                           </div>
                                           <div>
                                               <h3 className="font-bold text-gray-900 text-lg">{team.teamLabel}</h3>
                                               <p className={`text-xs font-medium ${team.userName === 'Unassigned' ? 'text-gray-400 italic' : 'text-blue-600'}`}>
                                                   {team.userName}
                                               </p>
                                           </div>
                                       </div>
                                       <div className="text-right">
                                           <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">Total Activity</p>
                                           <p className="text-xl font-bold text-gray-800">{team.totalEntries}</p>
                                       </div>
                                   </div>

                                   {/* Stats Grid */}
                                   <div className="p-4 grid grid-cols-2 gap-4 bg-white">
                                       {/* Highlighted Rows Count (Pink) */}
                                       <div className="bg-pink-50 p-3 rounded-lg border border-pink-100 col-span-2 flex items-center justify-between">
                                           <div>
                                               <span className="text-xs font-bold text-pink-700 uppercase">Highlighted (Active)</span>
                                               <p className="text-2xl font-bold text-pink-800">{team.highlightedRows}</p>
                                           </div>
                                           <AlertTriangle size={24} className="text-pink-400"/>
                                       </div>

                                       <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                                           <div className="flex items-center justify-between mb-1">
                                               <span className="text-xs font-bold text-green-700 uppercase">New</span>
                                               <PlusCircle size={14} className="text-green-500"/>
                                           </div>
                                           <p className="text-xl font-bold text-green-800">{team.newRows}</p>
                                       </div>
                                       <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                                           <div className="flex items-center justify-between mb-1">
                                               <span className="text-xs font-bold text-orange-700 uppercase">Updated</span>
                                               <Edit size={14} className="text-orange-500"/>
                                           </div>
                                           <p className="text-xl font-bold text-orange-800">{team.updatedRows}</p>
                                       </div>
                                       <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                                           <div className="flex items-center justify-between mb-1">
                                               <span className="text-xs font-bold text-purple-700 uppercase">Photos</span>
                                               <Upload size={14} className="text-purple-500"/>
                                           </div>
                                           <p className="text-xl font-bold text-purple-800">{team.photosUploaded}</p>
                                       </div>
                                       <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                           <div className="flex items-center justify-between mb-1">
                                               <span className="text-xs font-bold text-blue-700 uppercase">Days</span>
                                               <Activity size={14} className="text-blue-500"/>
                                           </div>
                                           <p className="text-xl font-bold text-blue-800">{team.activityByDate.length}</p>
                                       </div>
                                   </div>
                                   
                                   {/* Mini Chart Area */}
                                   <div className="flex-1 min-h-[100px] bg-gray-50 border-t border-gray-100 p-4 relative">
                                       {team.activityByDate.length > 0 ? (
                                           <>
                                             <p className="text-[10px] text-gray-400 font-bold uppercase mb-2 absolute top-2 left-4">Recent Activity Trend</p>
                                             <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={team.activityByDate} onClick={() => handleTeamClick(team)}>
                                                    <XAxis dataKey="date" hide />
                                                    <Tooltip 
                                                        cursor={{fill: 'transparent'}}
                                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                                        labelStyle={{color: '#6b7280', fontSize: '10px'}}
                                                        itemStyle={{color: '#1f2937', fontWeight: 'bold', fontSize: '12px'}}
                                                    />
                                                    <Bar dataKey="count" radius={[4, 4, 0, 0]} cursor="pointer">
                                                        {team.activityByDate.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={COLORS[idx % COLORS.length]} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                             </ResponsiveContainer>
                                           </>
                                       ) : (
                                           <div className="h-full flex items-center justify-center text-xs text-gray-400 italic">
                                               No recent activity recorded
                                           </div>
                                       )}
                                   </div>
                               </div>
                           ))}
                       </div>
                   )}
               </>
           )}
       </div>

       {/* FULL DETAILS POPUP (MODAL) */}
       {selectedTeam && (
           <div className="fixed inset-0 bg-gray-900/70 z-[100] flex flex-col animate-in fade-in duration-300 backdrop-blur-sm">
               {/* Modal Header */}
               <div className="bg-white px-6 py-4 border-b border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 z-20">
                   <div className="flex items-center gap-4">
                       <button onClick={() => setSelectedTeam(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors group" title="Close">
                           <X size={24} className="text-gray-500 group-hover:text-red-600" />
                       </button>
                       <div>
                           <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                               <MonitorPlay size={24} className="text-purple-600"/>
                               Team Activity Details
                           </h2>
                           <div className="flex items-center gap-2 text-sm text-gray-500">
                               <span className="font-bold text-gray-800">{selectedTeam.userName}</span>
                               <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">{selectedTeam.teamLabel}</span>
                               <span className="text-xs">• {filteredLogs.length} Records Found</span>
                           </div>
                       </div>
                   </div>

                   <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="flex gap-2">
                             <button onClick={handleExportExcel} className="flex items-center px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 font-bold text-sm shadow-sm">
                                <FileSpreadsheet size={18} className="mr-2"/> Excel
                             </button>
                             <button onClick={handleExportPDF} className="flex items-center px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 font-bold text-sm shadow-sm">
                                <FileText size={18} className="mr-2"/> PDF
                             </button>
                        </div>
                   </div>
               </div>

               {/* Filters Bar */}
               <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex items-center gap-4 bg-white p-3 rounded-lg border border-gray-200 shadow-sm w-full md:w-auto">
                        <Filter size={18} className="text-gray-400" />
                        
                        {/* Action Type */}
                        <div className="flex flex-col">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">Action Type</label>
                            <select 
                                value={modalActionFilter} 
                                onChange={e => setModalActionFilter(e.target.value)}
                                className="text-sm outline-none font-medium text-gray-700 bg-transparent border-none p-0 focus:ring-0"
                            >
                                <option value="All">All Actions</option>
                                <option value="New Entry">New Entry</option>
                                <option value="Modified">Modified</option>
                                <option value="Photo Upload">Photo Upload</option>
                            </select>
                        </div>
                        
                        <div className="w-px h-8 bg-gray-200 mx-2"></div>

                        {/* Date Range */}
                        <div className="flex flex-col">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">From Date</label>
                            <input type="date" value={modalFromDate} onChange={e => setModalFromDate(e.target.value)} className="text-sm outline-none font-medium text-gray-700 bg-transparent p-0"/>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-[10px] font-bold text-gray-400 uppercase">To Date</label>
                            <input type="date" value={modalToDate} onChange={e => setModalToDate(e.target.value)} className="text-sm outline-none font-medium text-gray-700 bg-transparent p-0"/>
                        </div>
                    </div>
                    
                    {/* Search */}
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-3 text-gray-400" size={18}/>
                        <input 
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-purple-500 outline-none shadow-sm"
                            placeholder="Search records by ID, module or details..."
                            value={modalSearch}
                            onChange={e => setModalSearch(e.target.value)}
                        />
                    </div>
               </div>

               {/* Data Table */}
               <div className="flex-1 overflow-auto bg-gray-50 p-6 relative">
                   <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden min-h-[400px]">
                       <table className="w-full text-left border-collapse">
                           <thead className="bg-gray-100 text-gray-600 text-xs uppercase sticky top-0 z-10">
                               <tr>
                                   <th className="p-4 border-b border-gray-200 font-bold w-16">#</th>
                                   <th className="p-4 border-b border-gray-200 font-bold">Action Type</th>
                                   <th className="p-4 border-b border-gray-200 font-bold">Module Source</th>
                                   <th className="p-4 border-b border-gray-200 font-bold">Details / Change Log</th>
                                   <th className="p-4 border-b border-gray-200 font-bold">Record ID</th>
                                   <th className="p-4 border-b border-gray-200 font-bold text-right">Date & Time</th>
                               </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-100">
                               {paginatedLogs.length === 0 ? (
                                   <tr>
                                       <td colSpan={6} className="p-20 text-center text-gray-400">
                                           <div className="flex flex-col items-center">
                                               <Shield size={48} className="mb-4 opacity-20" />
                                               <p className="text-lg font-medium">No activity records found matching filters.</p>
                                           </div>
                                       </td>
                                   </tr>
                               ) : (
                                   paginatedLogs.map((log, index) => {
                                       const globalIndex = (currentPage - 1) * itemsPerPage + index + 1;
                                       
                                       // Badge Colors
                                       let badgeClass = "bg-gray-100 text-gray-600";
                                       if (log.action === 'New Entry') badgeClass = "bg-green-100 text-green-700";
                                       else if (log.action === 'Modified') badgeClass = "bg-orange-100 text-orange-700";
                                       else if (log.action === 'Photo Upload') badgeClass = "bg-purple-100 text-purple-700";

                                       return (
                                           <tr key={log.id} className="hover:bg-blue-50/30 transition-colors">
                                               <td className="p-4 text-sm font-bold text-gray-500">{globalIndex}</td>
                                               <td className="p-4">
                                                   <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${badgeClass}`}>
                                                       {log.action}
                                                   </span>
                                               </td>
                                               <td className="p-4 text-sm font-bold text-gray-700">
                                                   {log.module}
                                               </td>
                                               <td className="p-4 text-sm text-gray-600 max-w-md">
                                                   {log.description}
                                               </td>
                                               <td className="p-4 text-xs font-mono text-gray-400">
                                                   {log.recordId}
                                               </td>
                                               <td className="p-4 text-right text-sm font-medium text-gray-900">
                                                   <div className="flex items-center justify-end gap-2">
                                                       <Clock size={14} className="text-gray-400"/>
                                                       {new Date(log.timestamp).toLocaleString()}
                                                   </div>
                                               </td>
                                           </tr>
                                       );
                                   })
                               )}
                           </tbody>
                       </table>
                   </div>
                   
                   {/* Pagination */}
                   {filteredLogs.length > 0 && (
                       <div className="mt-4 flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
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
                                   Showing <span className="font-bold text-gray-900">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-bold text-gray-900">{Math.min(currentPage * itemsPerPage, filteredLogs.length)}</span> of <span className="font-bold text-gray-900">{filteredLogs.length}</span>
                                </div>
                           </div>

                           <div className="flex items-center gap-1.5">
                               <button 
                                   onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                   disabled={currentPage === 1} 
                                   className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 flex items-center gap-1"
                               >
                                   <ChevronLeft size={16}/> Prev
                               </button>
                               <span className="px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-sm font-bold border border-purple-100">{currentPage}</span>
                               <button 
                                   onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                   disabled={currentPage === totalPages} 
                                   className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 flex items-center gap-1"
                               >
                                   Next <ChevronRight size={16}/>
                               </button>
                           </div>
                       </div>
                   )}
               </div>
           </div>
       )}
    </div>
  );
};
