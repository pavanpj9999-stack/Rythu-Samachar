
import React, { useState, useEffect, useMemo } from 'react';
import { DataService } from '../services/mockDataService';
import { DynamicRecord } from '../types';
import { Filter, Download, Calculator, ArrowUpAZ, ArrowDownAZ, LayoutList, PieChart, Users, Calendar, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';

export const ExtentReport: React.FC = () => {
  const [records, setRecords] = useState<DynamicRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedTeam, setSelectedTeam] = useState<string>('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  
  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'teamName', direction: 'asc' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await DataService.getModuleRecords('DATA_6A');
    
    // Filter: Show ONLY Updated or New Records
    // Logic: is_new=1 OR is_updated=1
    const relevantRecords = data.filter(r => r.is_new === 1 || r.is_updated === 1);
    
    // Enrich Data
    const processed = relevantRecords.map(r => ({
        ...r,
        teamName: r.updatedBy || r.createdBy || 'Unassigned', // Prioritize Updater for 'Updated' records
        displaySurvey: getSurveyNo(r),
        parsedExtent: getEnjoyerExtent(r),
        reasonValue: getReason(r), // New Status Value
        displayDate: getRecordDate(r), // Replaces Village
        rawDate: r.updatedDate || r.createdDate // For date filtering
    }));
    
    setRecords(processed);
    setLoading(false);
  };

  // --- HELPERS ---
  const getEnjoyerExtent = (r: DynamicRecord) => {
      const keys = Object.keys(r);
      // STRICT REQUIREMENT: Look for 'Enjoyer Extent' first
      let extentKey = keys.find(k => k.toLowerCase().includes('enjoyer extent') || k.toLowerCase().includes('enjoyer_extent'));
      
      // Fallback to generic 'Extent' if specific column not found
      if (!extentKey) {
          extentKey = keys.find(k => k.toLowerCase() === 'extent' || k.toLowerCase() === 'acres');
      }

      if (extentKey) {
          const val = String(r[extentKey]).replace(/[^0-9.]/g, '');
          return parseFloat(val) || 0;
      }
      return 0;
  };

  const getSurveyNo = (r: DynamicRecord) => {
      const keys = Object.keys(r);
      const key = keys.find(k => ['survey', 'sy.no', 's.no'].some(kw => k.toLowerCase().includes(kw)));
      return key ? String(r[key]) : 'N/A';
  };
  
  const getReason = (r: DynamicRecord) => {
      const keys = Object.keys(r);
      // Look for specific Reason column or fallback
      const key = keys.find(k => ['reason', 'remarks', 'status'].some(kw => k.toLowerCase().includes(kw)));
      let val = key ? String(r[key]) : 'No Issue';
      
      // Cleanup "Select Reason" placeholder
      if (val === 'Select Reason') return 'No Issue';
      if (!val || val.trim() === '') return 'No Issue';
      
      return val;
  };

  const getRecordDate = (r: DynamicRecord) => {
      // Prioritize Updated Date, then Created Date
      const dateStr = r.updatedDate || r.createdDate;
      if (!dateStr) return 'N/A';
      
      const date = new Date(dateStr);
      // Format: DD-MM-YYYY HH:mm
      return date.toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
      }).replace(',', '');
  };

  // --- FILTERING & SORTING ---
  const filteredData = useMemo(() => {
      let data = [...records];

      // 1. Team Filter
      if (selectedTeam !== 'All') {
          data = data.filter(r => r.teamName === selectedTeam);
      }

      // 2. Date Range Filter
      if (fromDate) {
          const from = new Date(fromDate).setHours(0, 0, 0, 0);
          data = data.filter(r => {
              const rDate = new Date(r.rawDate || 0).setHours(0, 0, 0, 0);
              return rDate >= from;
          });
      }
      if (toDate) {
          const to = new Date(toDate).setHours(23, 59, 59, 999);
          data = data.filter(r => {
              const rDate = new Date(r.rawDate || 0).getTime();
              return rDate <= to;
          });
      }

      // 3. Sorting
      data.sort((a: any, b: any) => {
          const aVal = a[sortConfig.key];
          const bVal = b[sortConfig.key];
          
          if (sortConfig.key === 'parsedExtent') {
              return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
          }

          const sA = String(aVal).toLowerCase();
          const sB = String(bVal).toLowerCase();
          
          if (sA < sB) return sortConfig.direction === 'asc' ? -1 : 1;
          if (sA > sB) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });

      return data;
  }, [records, selectedTeam, fromDate, toDate, sortConfig]);

  // --- CALCULATIONS ---
  const stats = useMemo(() => {
      let totalExtent = 0;
      const teamTotals: Record<string, number> = {};
      const uniqueTeams = new Set<string>();

      filteredData.forEach(r => {
          const ext = r.parsedExtent;
          totalExtent += ext;
          teamTotals[r.teamName] = (teamTotals[r.teamName] || 0) + ext;
          uniqueTeams.add(r.teamName);
      });

      // Filter and sort for Top 8
      const sortedTeams = Object.entries(teamTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {} as Record<string, number>);

      return {
          totalExtent: totalExtent.toFixed(2),
          totalRecords: filteredData.length,
          teamBreakdown: sortedTeams,
          teamsList: Array.from(uniqueTeams).sort()
      };
  }, [filteredData]);

  const handleSort = (key: string) => {
      setSortConfig(current => ({
          key,
          direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
      }));
  };

  const handleExport = () => {
      const exportData = filteredData.map((r: any, i) => ({
          "S.No": i + 1,
          "Team Name": r.teamName,
          "Date & Time": r.displayDate,
          "Survey No": r.displaySurvey,
          "Enjoyer Extent": r.parsedExtent,
          "Status (Reason)": r.reasonValue
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Extent_Report");
      XLSX.writeFile(wb, "Team_Extent_Report.xlsx");
  };

  // Get list of all available teams for dropdown
  const allTeams = useMemo(() => {
      const teams = new Set(records.map(r => r.teamName));
      return Array.from(teams).sort();
  }, [records]);

  // Badge Color Helper
  const getStatusColor = (reason: string) => {
      const r = reason.toLowerCase();
      if (r.includes('no issue')) return 'bg-green-100 text-green-800 border-green-200';
      if (r.includes('mutation')) return 'bg-orange-100 text-orange-800 border-orange-200';
      if (r.includes('court')) return 'bg-red-100 text-red-800 border-red-200';
      if (r.includes('deletion')) return 'bg-gray-100 text-gray-800 border-gray-200';
      return 'bg-blue-50 text-blue-700 border-blue-100';
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
      
      {/* 1. SUMMARY STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-green-600 to-green-700 text-white p-5 rounded-xl shadow-md flex items-center justify-between">
              <div>
                  <p className="text-xs font-bold uppercase opacity-80 mb-1">Total Enjoyer Extent</p>
                  <p className="text-3xl font-extrabold flex items-baseline">
                      {stats.totalExtent} <span className="text-sm font-normal ml-1">Ac</span>
                  </p>
                  <p className="text-[10px] mt-1 opacity-70">Calculated from updated records</p>
              </div>
              <PieChart size={40} className="opacity-20" />
          </div>
          
          <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-xs font-bold text-gray-500 uppercase mb-1">Updated Records</p>
                  <p className="text-3xl font-bold text-gray-800">{stats.totalRecords}</p>
                  <p className="text-[10px] text-gray-400 mt-1">Filtered Count</p>
              </div>
              <LayoutList size={40} className="text-gray-200" />
          </div>

          <div className="bg-white border border-gray-200 p-5 rounded-xl shadow-sm flex flex-col justify-center">
               <p className="text-xs font-bold text-gray-500 uppercase mb-2">Team Breakdown (Top 8)</p>
               <div className="space-y-2">
                   {Object.entries(stats.teamBreakdown).map(([team, total]) => (
                       <div key={team} className="flex justify-between items-center text-sm">
                           <span className="font-medium text-gray-700 truncate max-w-[150px]">{team}</span>
                           <span className="font-bold text-green-700">{Number(total).toFixed(2)} Ac</span>
                       </div>
                   ))}
               </div>
          </div>
      </div>

      {/* 2. FILTERS */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-end">
          
          {/* Team Filter */}
          <div className="flex-1 w-full md:max-w-xs">
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Filter by Team</label>
              <div className="relative">
                  <Users className="absolute left-3 top-2.5 text-gray-400" size={16} />
                  <select 
                      value={selectedTeam} 
                      onChange={(e) => setSelectedTeam(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
                  >
                      <option value="All">All Teams</option>
                      {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
              </div>
          </div>

          {/* Date Range Filters */}
          <div className="flex gap-2 w-full md:w-auto flex-1">
              <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">From Date</label>
                  <div className="relative">
                     <Calendar className="absolute left-2.5 top-2.5 text-gray-400 pointer-events-none" size={14} />
                     <input 
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="w-full pl-8 pr-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none text-gray-600"
                     />
                  </div>
              </div>
              <div className="flex-1">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">To Date</label>
                  <div className="relative">
                     <Calendar className="absolute left-2.5 top-2.5 text-gray-400 pointer-events-none" size={14} />
                     <input 
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="w-full pl-8 pr-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none text-gray-600"
                     />
                  </div>
              </div>
          </div>

          <button onClick={handleExport} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 shadow-sm flex items-center whitespace-nowrap">
              <Download size={18} className="mr-2" /> Export Report
          </button>
      </div>

      {/* 3. DATA TABLE */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                  <thead>
                      <tr className="bg-gray-100 text-xs font-bold text-gray-600 uppercase border-b border-gray-200">
                          <th className="px-6 py-4 w-16">S.No</th>
                          
                          <th className="px-6 py-4 cursor-pointer hover:bg-gray-200 transition" onClick={() => handleSort('teamName')}>
                              <div className="flex items-center">Team Name {sortConfig.key === 'teamName' && (sortConfig.direction === 'asc' ? <ArrowUpAZ size={14} className="ml-1"/> : <ArrowDownAZ size={14} className="ml-1"/>)}</div>
                          </th>
                          
                          {/* Replaced Village with Date & Time */}
                          <th className="px-6 py-4">Date & Time</th>
                          
                          <th className="px-6 py-4 cursor-pointer hover:bg-gray-200 transition" onClick={() => handleSort('displaySurvey')}>
                              <div className="flex items-center">Survey No {sortConfig.key === 'displaySurvey' && (sortConfig.direction === 'asc' ? <ArrowUpAZ size={14} className="ml-1"/> : <ArrowDownAZ size={14} className="ml-1"/>)}</div>
                          </th>
                          
                          <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-200 transition" onClick={() => handleSort('parsedExtent')}>
                              <div className="flex items-center justify-end">Enjoyer Extent (Ac) {sortConfig.key === 'parsedExtent' && (sortConfig.direction === 'asc' ? <ArrowUpAZ size={14} className="ml-1"/> : <ArrowDownAZ size={14} className="ml-1"/>)}</div>
                          </th>
                          
                          {/* Changed Status to show Reason */}
                          <th className="px-6 py-4 text-center">Status (Reason)</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {loading ? (
                          <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Loading data...</td></tr>
                      ) : filteredData.length > 0 ? (
                          filteredData.map((r: any, idx) => (
                              <tr key={idx} className="bg-white hover:bg-green-50 transition-colors">
                                  <td className="px-6 py-3 text-sm font-bold text-gray-700">{idx + 1}</td>
                                  <td className="px-6 py-3 text-sm font-medium text-blue-800">{r.teamName}</td>
                                  
                                  {/* Date & Time Column */}
                                  <td className="px-6 py-3 text-sm text-gray-600 font-mono">
                                      <div className="flex items-center">
                                          <Clock size={12} className="mr-1.5 opacity-50"/>
                                          {r.displayDate}
                                      </div>
                                  </td>
                                  
                                  <td className="px-6 py-3 text-sm font-mono font-medium text-gray-800">{r.displaySurvey}</td>
                                  <td className="px-6 py-3 text-sm font-bold text-right text-gray-900">{r.parsedExtent.toFixed(2)}</td>
                                  
                                  {/* Reason Status Column */}
                                  <td className="px-6 py-3 text-center">
                                      <span className={`px-2 py-1 border text-xs font-bold uppercase rounded ${getStatusColor(r.reasonValue)}`}>
                                          {r.reasonValue}
                                      </span>
                                  </td>
                              </tr>
                          ))
                      ) : (
                          <tr>
                              <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                                  No updated records found matching criteria.
                              </td>
                          </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};
