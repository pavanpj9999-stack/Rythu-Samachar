import React, { useState, useEffect } from 'react';
import { DataService } from '../services/mockDataService';
import { AttendanceRecord, UserRole } from '../types';
import { FileText, MapPin, UserCheck, Calendar, Filter, Smartphone, Map as MapIcon, X, CheckCircle, ShieldAlert, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

export const AttendanceDashboard: React.FC = () => {
    const [records, setRecords] = useState<AttendanceRecord[]>([]);
    const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSelfie, setSelectedSelfie] = useState<string | null>(null);
    const [selectedMap, setSelectedMap] = useState<AttendanceRecord | null>(null);

    // Filters - Use local date string to match Auth.tsx capture
    const [dateFilter, setDateFilter] = useState(() => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        return new Date(now.getTime() - offset).toISOString().split('T')[0];
    });
    const [staffFilter, setStaffFilter] = useState('');

    const getCurrentUser = () => {
        const userStr = sessionStorage.getItem('rythu_user');
        if (userStr) return JSON.parse(userStr);
        return { role: 'USER' };
    };
    const user = getCurrentUser();

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [records, dateFilter, staffFilter]);

    const loadData = async () => {
        setLoading(true);
        const data = await DataService.getAllAttendance();
        setRecords(data.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        setLoading(false);
    };

    const applyFilters = () => {
        let result = records;
        if (dateFilter) {
            result = result.filter(r => r.date === dateFilter);
        }
        if (staffFilter) {
            // Added null check for userName
            result = result.filter(r => (r.userName || '').toLowerCase().includes(staffFilter.toLowerCase()));
        }
        setFilteredRecords(result);
    };

    const handleExportExcel = () => {
        const dataToExport = filteredRecords.map((r, i) => ({
            "S.No": i + 1,
            "Staff Name": r.userName || 'Unknown',
            "Date": r.date,
            "Time": new Date(r.timestamp).toLocaleTimeString(),
            "Latitude": r.latitude,
            "Longitude": r.longitude,
            "JioTag Active": r.jioTagStatus,
            "Device": r.browser,
            "Address": r.address
        }));
        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Attendance Logs");
        XLSX.writeFile(wb, `Attendance_Report_${dateFilter}.xlsx`);
    };

    if (user.role !== UserRole.ADMIN) {
        return <div className="p-10 text-center text-red-500 font-bold"><ShieldAlert className="inline mr-2"/> Access Denied. Admin Only.</div>;
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
             {/* Header */}
             <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center shadow-sm gap-4">
                 <div>
                     <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                         <UserCheck className="mr-3 text-green-600" size={28} />
                         Attendance Dashboard
                     </h2>
                     <p className="text-gray-500 text-sm">Monitor Staff Logins, Selfies & GPS Locations.</p>
                 </div>
                 <div className="flex gap-2">
                     <button onClick={handleExportExcel} className="px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg font-bold text-sm hover:bg-green-100 flex items-center">
                         <FileText size={16} className="mr-2" /> Export Report
                     </button>
                 </div>
             </div>

             {/* Filters */}
             <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-end">
                 <div className="flex-1">
                     <label className="text-xs font-bold text-gray-500 uppercase">Filter Date</label>
                     <div className="relative">
                         <Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
                         <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none" />
                     </div>
                 </div>
                 <div className="flex-1">
                     <label className="text-xs font-bold text-gray-500 uppercase">Search Staff</label>
                     <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        <input type="text" placeholder="Enter Name..." value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none" />
                     </div>
                 </div>
             </div>

             {/* Table */}
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                 <div className="overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                         <thead className="bg-gray-100 text-xs uppercase text-gray-600 font-bold">
                             <tr>
                                 <th className="px-6 py-4">Staff Details</th>
                                 <th className="px-6 py-4">Check-In Time</th>
                                 <th className="px-6 py-4">Selfie</th>
                                 <th className="px-6 py-4">Location</th>
                                 <th className="px-6 py-4">Device Info</th>
                                 <th className="px-6 py-4">JioTag</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-gray-100">
                             {filteredRecords.length > 0 ? filteredRecords.map(record => (
                                 <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                                     <td className="px-6 py-4">
                                         <div className="font-bold text-gray-900">{record.userName || 'Unknown User'}</div>
                                         <div className="text-xs text-gray-500">ID: {record.userId}</div>
                                     </td>
                                     <td className="px-6 py-4">
                                         <div className="font-medium text-gray-800">{new Date(record.timestamp).toLocaleTimeString()}</div>
                                         <div className="text-xs text-gray-500">{record.date}</div>
                                     </td>
                                     <td className="px-6 py-4">
                                         {record.selfieUrl ? (
                                             <img 
                                                src={record.selfieUrl} 
                                                alt="Selfie" 
                                                className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md cursor-pointer hover:scale-110 transition-transform"
                                                onClick={() => setSelectedSelfie(record.selfieUrl)}
                                             />
                                         ) : (
                                             <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500">No Img</div>
                                         )}
                                     </td>
                                     <td className="px-6 py-4">
                                         <button 
                                            onClick={() => setSelectedMap(record)}
                                            className="flex items-center text-blue-600 hover:underline text-sm font-medium"
                                         >
                                             <MapPin size={16} className="mr-1" /> View Map
                                         </button>
                                         <div className="text-[10px] text-gray-400 mt-1 max-w-[150px] truncate" title={record.address}>{record.address}</div>
                                     </td>
                                     <td className="px-6 py-4 text-xs text-gray-500">
                                         <div className="flex items-center"><Smartphone size={12} className="mr-1"/> {record.browser}</div>
                                         <div className="mt-1">Acc: ±{Math.round(record.accuracy)}m</div>
                                     </td>
                                     <td className="px-6 py-4">
                                         {record.jioTagStatus === 'YES' ? (
                                             <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold flex items-center w-fit"><CheckCircle size={12} className="mr-1"/> Active</span>
                                         ) : (
                                             <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs font-bold">Inactive</span>
                                         )}
                                     </td>
                                 </tr>
                             )) : (
                                 <tr><td colSpan={6} className="p-8 text-center text-gray-400">No attendance records found.</td></tr>
                             )}
                         </tbody>
                     </table>
                 </div>
             </div>

             {/* Selfie Modal */}
             {selectedSelfie && (
                 <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedSelfie(null)}>
                     <img src={selectedSelfie} alt="Full Selfie" className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
                     <button className="absolute top-4 right-4 text-white hover:bg-white/20 p-2 rounded-full"><X size={32} /></button>
                 </div>
             )}

             {/* Map Modal */}
             {selectedMap && (
                 <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedMap(null)}>
                     <div className="bg-white rounded-xl overflow-hidden shadow-2xl max-w-lg w-full" onClick={e => e.stopPropagation()}>
                         <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                             <h3 className="font-bold flex items-center"><MapIcon className="mr-2 text-blue-600"/> Location Details</h3>
                             <button onClick={() => setSelectedMap(null)}><X size={20} className="text-gray-500"/></button>
                         </div>
                         <div className="p-6 text-center space-y-4">
                             <div className="bg-blue-50 p-4 rounded-lg text-blue-800 text-sm font-medium">
                                 {selectedMap.address}
                             </div>
                             <div className="grid grid-cols-2 gap-4 text-sm">
                                 <div className="bg-gray-50 p-2 rounded border">Lat: {selectedMap.latitude}</div>
                                 <div className="bg-gray-50 p-2 rounded border">Lng: {selectedMap.longitude}</div>
                             </div>
                             <a 
                                href={selectedMap.mapUrl} 
                                target="_blank" 
                                rel="noreferrer"
                                className="block w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
                             >
                                 Open in Google Maps
                             </a>
                         </div>
                     </div>
                 </div>
             )}
        </div>
    );
};