
import React, { useState, useEffect, useMemo } from 'react';
import { DataService } from '../services/mockDataService';
import { DynamicRecord } from '../types';
import { Filter, Search, Download, Calculator, ArrowUpAZ, ArrowDownAZ, LayoutList } from 'lucide-react';
import * as XLSX from 'xlsx';

export const TeamExtentAllReports: React.FC = () => {
  const [records, setRecords] = useState<DynamicRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReason, setSelectedReason] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'teamName', direction: 'asc' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const data = await DataService.getModuleRecords('DATA_6A');
    
    // Enrich data with parsed fields
    const processed = data.map(r => ({
        ...r,
        teamName: r.createdBy || r.updatedBy || 'Unassigned',
        normalizedReason: normalizeReason(r),
        parsedExtent: getExtent(r),
        displaySurvey: getSurveyNo(r),
        displayVillage: getVillage(r)
    }));
    
    setRecords(processed);
    setLoading(false);
  };

  // --- HELPERS ---
  const normalizeReason = (r: DynamicRecord) => {
      const keys = Object.keys(r);
      // Look for columns like 'Reason', 'Remarks'
      const reasonKey = keys.find(k => k.toLowerCase().includes('reason') || k.toLowerCase().includes('remarks'));
      let val = reasonKey ? String(r[reasonKey]).trim() : '';
      
      // Normalize values to match dropdown requirements
      const lower = val.toLowerCase();
      if (lower.includes('no issue')) return 'No Issue';
      if (lower.includes('mutation')) return 'Mutations';
      if (lower.includes('court')) return 'Court Case';
      
      return val || 'No Issue'; // Default if empty
  };

  const getExtent = (r: DynamicRecord) => {
      const keys = Object.keys(r);
      // Priority: Enjoyer Extent -> Extent -> Acres
      const extentKey = keys.find(k => 
          ['enjoyer extent', 'enjoyer_extent', 'extent', 'acres', 'total extent'].some(kw => k.toLowerCase().includes(kw))
      );
      if (extentKey) {
          const val = String(r[extentKey]).replace(/[^0-9.]/g, '');
          return parseFloat(val) || 0;
      }
      return 0;
  };

  const getSurveyNo = (r: DynamicRecord) => {
      const keys = Object.keys(r);
      const key = keys.find(k => ['survey', 'sy.no', 's.no'].some(kw => k.toLowerCase().includes(kw)));
      return key ? r[key] : 'N/A';
  };
  
  const getVillage = (r: DynamicRecord) => {
      const keys = Object.keys(r);
      const key = keys.find(k => ['village', 'rev_village'].some(kw => k.toLowerCase().includes(kw)));
      return key ? r[key] : 'N/A';
  };

  // --- FILTERING & SORTING ---
  const filteredData = useMemo(() => {
      let data = [...records];

      // 1. Reason Filter
      if (selectedReason !== 'All') {
          if (selectedReason === 'New entries') {
              data = data.filter(r => r.is_new === 1);
          } else {
              data = data.filter(r => r.normalizedReason === selectedReason);
          }
      }

      // 2. Search Filter
      if (searchTerm) {
          const term = searchTerm.toLowerCase();
          data = data.filter(r => 
              r.teamName.toLowerCase().includes(term) || 
              String(r.displaySurvey).toLowerCase().includes(term) ||
              String(r.displayVillage).toLowerCase().includes(term)
          );
      }

      // 3. Sorting
      data.sort((a: any, b: any) => {
          let aVal = a[sortConfig.key];
          let bVal = b[sortConfig.key];
          
          // Custom sort for numbers
          if (sortConfig.key === 'parsedExtent') {
              return sortConfig.direction === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
          }

          // String sort
          aVal = String(aVal).toLowerCase();
          bVal = String(bVal).toLowerCase();
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });

      return data;
  }, [records, selectedReason, searchTerm, sortConfig]);

  // --- CALCULATIONS ---
  const stats = useMemo(() => {
      let totalExtent = 0;
      let noIssue = 0;
      let mutations = 0;
      let court = 0;
      let newEntriesCount = 0;
      
      const teamBreakdown: Record<string, number> = {};

      filteredData.forEach(r => {
          const ext = Number(r.parsedExtent || 0);
          totalExtent += ext;
          
          // Reason totals (Global based on current filters)
          const reason = r.normalizedReason;
          if (reason === 'No Issue') noIssue += ext;
          else if (reason === 'Mutations') mutations += ext;
          else if (reason === 'Court Case') court += ext;
          
          if (r.is_new === 1) newEntriesCount++;

          // Team Totals
          teamBreakdown[r.teamName] = (teamBreakdown[r.teamName] || 0) + ext;
      });

      return {
          totalExtent: parseFloat(totalExtent.toFixed(2)),
          noIssue: parseFloat(noIssue.toFixed(2)),
          mutations: parseFloat(mutations.toFixed(2)),
          court: parseFloat(court.toFixed(2)),
          newEntriesCount,
          teamBreakdown
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
          "Village": r.displayVillage,
          "Survey No": r.displaySurvey,
          "Enjoyer Extent": r.parsedExtent,
          "Reason": r.normalizedReason,
          "Status": r.is_new === 1 ? 'New Entry' : 'Existing'
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Extent_Report");
      XLSX.writeFile(wb, "Team_Extent_Report.xlsx");
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 p-1">
      
      {/* 1. TOP STATS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-4 rounded-xl shadow-md">
              <p className="text-xs font-bold uppercase opacity-80 mb-1">Total Extent</p>
              <p className="text-2xl font-extrabold flex items-baseline">
                  {stats.totalExtent} <span className="text-sm font-normal ml-1">Ac</span>
              </p>
          </div>
          <div className="bg-white border border-green-200 p-4 rounded-xl shadow-sm">
              <p className="text-xs font-bold text-green-600 uppercase mb-1">No Issue</p>
              <p className="text-xl font-bold text-gray-800">{stats.noIssue} <span className="text-xs text-gray-400">Ac</span></p>
          </div>
          <div className="bg-white border border-orange-200 p-4 rounded-xl shadow-sm">
              <p className="text-xs font-bold text-orange-600 uppercase mb-1">Mutations</p>
              <p className="text-xl font-bold text-gray-800">{stats.mutations} <span className="text-xs text-gray-400">Ac</span></p>
          </div>
          <div className="bg-white border border-red-200 p-4 rounded-xl shadow-sm">
              <p className="text-xs font-bold text-red-600 uppercase mb-1">Court Cases</p>
              <p className="text-xl font-bold text-gray-800">{stats.court} <span className="text-xs text-gray-400">Ac</span></p>
          </div>
           <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl shadow-sm">
              <p className="text-xs font-bold text-indigo-600 uppercase mb-1">New Entries</p>
              <p className="text-xl font-bold text-indigo-900">{stats.newEntriesCount} <span className="text-xs text-gray-400">Recs</span></p>
          </div>
      </div>

      {/* 2. TEAM SUMMARY (Horizontal Scroll) */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 overflow-x-auto">
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center">
              <Calculator size={14} className="mr-1"/> Team-wise Total Extent
          </h4>
          <div className="flex gap-4">
              {Object.entries(stats.teamBreakdown).map(([team, total]) => (
                  <div key={team} className="bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm min-w-[140px]">
                      <p className="text-[10px] font-bold text-gray-400 uppercase truncate" title={team}>{team}</p>
                      <p className="text-lg font-bold text-gray-800">{Number(total).toFixed(2)} Ac</p>
                  </div>
              ))}
          </div>
      </div>

      {/* 3. FILTERS */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Filter by Reason</label>
              <div className="relative">
                  <Filter className="absolute left-3 top-2.5 text-gray-400" size={16} />
                  <select 
                      value={selectedReason} 
                      onChange={(e) => setSelectedReason(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                      <option value="All">All Records</option>
                      <option value="No Issue">No Issue</option>
                      <option value="Mutations">Mutations</option>
                      <option value="Court Case">Court Case</option>
                      <option value="New entries">New Entries Only</option>
                  </select>
              </div>
          </div>
          <div className="flex-1 w-full">
               <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Search</label>
               <div className="relative">
                  <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                  <input 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search Team, Village or Survey..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
               </div>
          </div>
          <button onClick={handleExport} className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 shadow-sm flex items-center whitespace-nowrap">
              <Download size={18} className="mr-2" /> Export Excel
          </button>
      </div>

      {/* 4. TABLE */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                  <thead>
                      <tr className="bg-gray-100 text-xs font-bold text-gray-600 uppercase border-b border-gray-200">
                          <th className="px-6 py-4">S.No</th>
                          <th className="px-6 py-4 cursor-pointer hover:bg-gray-200 transition" onClick={() => handleSort('teamName')}>
                              <div className="flex items-center">Team Name {sortConfig.key === 'teamName' && (sortConfig.direction === 'asc' ? <ArrowUpAZ size={14} className="ml-1"/> : <ArrowDownAZ size={14} className="ml-1"/>)}</div>
                          </th>
                          <th className="px-6 py-4">Village</th>
                          <th className="px-6 py-4 cursor-pointer hover:bg-gray-200 transition" onClick={() => handleSort('displaySurvey')}>
                              <div className="flex items-center">Survey No {sortConfig.key === 'displaySurvey' && (sortConfig.direction === 'asc' ? <ArrowUpAZ size={14} className="ml-1"/> : <ArrowDownAZ size={14} className="ml-1"/>)}</div>
                          </th>
                          <th className="px-6 py-4 text-right cursor-pointer hover:bg-gray-200 transition" onClick={() => handleSort('parsedExtent')}>
                              <div className="flex items-center justify-end">Extent (Ac) {sortConfig.key === 'parsedExtent' && (sortConfig.direction === 'asc' ? <ArrowUpAZ size={14} className="ml-1"/> : <ArrowDownAZ size={14} className="ml-1"/>)}</div>
                          </th>
                          <th className="px-6 py-4">Reason</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {filteredData.length > 0 ? filteredData.map((r: any, idx) => {
                          // Highlight Logic
                          const isNew = r.is_new === 1;
                          const rowClass = isNew ? "bg-[#d4f8d4] hover:bg-green-100" : "hover:bg-gray-50";

                          return (
                          <tr key={r.id || idx} className={`${rowClass} transition-colors`}>
                              <td className="px-6 py-3 text-sm font-bold text-gray-700">{idx + 1}</td>
                              <td className="px-6 py-3 text-sm font-medium text-blue-800">{r.teamName}</td>
                              <td className="px-6 py-3 text-sm text-gray-600">{r.displayVillage}</td>
                              <td className="px-6 py-3 text-sm font-mono font-medium text-gray-800">{r.displaySurvey}</td>
                              <td className="px-6 py-3 text-sm font-bold text-right text-gray-800">{Number(r.parsedExtent).toFixed(2)}</td>
                              <td className="px-6 py-3 text-sm">
                                  <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                      r.normalizedReason === 'No Issue' ? 'bg-green-100 text-green-700' :
                                      r.normalizedReason === 'Mutations' ? 'bg-orange-100 text-orange-700' :
                                      'bg-red-100 text-red-700'
                                  }`}>
                                      {r.normalizedReason}
                                  </span>
                                  {isNew && <span className="ml-2 px-2 py-0.5 bg-green-600 text-white text-[10px] rounded-full font-bold shadow-sm">NEW</span>}
                              </td>
                          </tr>
                      )}) : (
                          <tr>
                              <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                                  <LayoutList size={48} className="mx-auto mb-2 opacity-20" />
                                  No records found matching criteria.
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
