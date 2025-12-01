
import React, { useState, useEffect } from 'react';
import { DataService } from '../services/mockDataService';
import { RecycleBinRecord, UserRole } from '../types';
import { Trash2, RotateCcw, Search, AlertCircle, ShieldAlert, CheckCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react';

interface RecycleBinProps {
  userRole: UserRole;
}

export const RecycleBin: React.FC<RecycleBinProps> = ({ userRole }) => {
  const [deletedRecords, setDeletedRecords] = useState<RecycleBinRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [modal, setModal] = useState<{isOpen: boolean, type: 'restore' | 'delete' | 'clear', id?: string}>({isOpen: false, type: 'restore'});
  const [toast, setToast] = useState<{show: boolean, msg: string, type: 'success' | 'error'}>({show: false, msg: '', type: 'success'});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
      if(toast.show) {
          const timer = setTimeout(() => setToast({...toast, show: false}), 3000);
          return () => clearTimeout(timer);
      }
  }, [toast.show]);

  const loadData = async () => {
    const data = await DataService.getRecycleBin();
    setDeletedRecords(data);
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
      setToast({show: true, msg, type});
  };

  if (userRole !== UserRole.ADMIN) {
      return (<div className="flex flex-col items-center justify-center h-[60vh] text-center p-6 bg-white rounded-xl shadow-sm border border-gray-100"><ShieldAlert size={64} className="text-red-500 mb-4" /><h2 className="text-2xl font-bold text-gray-800">Access Denied</h2><p className="text-gray-500 mt-2">Only Administrators have permission to view the Recycle Bin.</p></div>);
  }

  const handleActionConfirm = async () => {
      if(modal.type === 'restore' && modal.id) {
          await DataService.restoreRecycleBinRecord(modal.id);
          showToast("Record Restored Successfully");
      } else if (modal.type === 'delete' && modal.id) {
          await DataService.permanentDeleteRecycleBinRecord(modal.id);
          showToast("Record Deleted Permanently");
      } else if (modal.type === 'clear') {
          await DataService.emptyRecycleBin();
          showToast("Recycle Bin Emptied");
      }
      
      await loadData();
      setModal({isOpen: false, type: 'restore'});
  };

  const filteredData = deletedRecords.filter(r => JSON.stringify(r).toLowerCase().includes(searchTerm.toLowerCase()));

  // Helper to render preview based on source module
  const renderPreview = (record: RecycleBinRecord) => {
      if (record.sourceModule === 'FMB') {
          return (
              <div>
                  <div className="text-sm font-bold text-gray-900">Survey No: {record['surveyNo']}</div>
                  <div className="text-xs text-gray-500">Village: {record['village']}</div>
                  <div className="text-xs text-gray-400 mt-0.5">ID: {record.id}</div>
              </div>
          );
      } else if (record.sourceModule === 'KML') {
           return (
              <div>
                  <div className="text-sm font-bold text-gray-900">File: {record['fileName']}</div>
                  <div className="text-xs text-gray-500">Size: {record['size']}</div>
                  <div className="text-xs text-gray-400 mt-0.5">ID: {record.id}</div>
              </div>
          );
      } else if (record.sourceModule && record.sourceModule.endsWith('_FILE')) {
           return (
              <div className="flex items-center">
                  <FileSpreadsheet size={16} className="text-green-600 mr-2"/>
                  <div>
                    <div className="text-sm font-bold text-gray-900">Dataset: {record['fileName']}</div>
                    <div className="text-xs text-gray-500">Uploaded: {record['uploadDate']}</div>
                  </div>
              </div>
          );
      } else {
          // Default Excel Row (Adangal / Rythu Details)
          return (
              <div>
                  <div className="text-sm font-medium text-gray-900 truncate max-w-md">
                    {Object.keys(record).filter(k => !['id','fileId','imageUrl','documents','deletedAt','deletedBy','originalFileId','sourceModule','originalData'].includes(k)).slice(0, 3).map(k => `${k}: ${record[k]}`).join(', ')}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Source: {record.sourceModule} | ID: {record.id}</div>
              </div>
          );
      }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {toast.show && (<div className={`fixed top-24 right-5 z-50 px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 ${toast.type === 'success' ? 'bg-corp-900 text-white' : 'bg-red-600 text-white'}`}>{toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}<span className="font-bold">{toast.msg}</span></div>)}
      {modal.isOpen && (<div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"><div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200"><div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${modal.type === 'restore' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{modal.type === 'restore' ? <RotateCcw size={24} /> : <Trash2 size={24} />}</div><h3 className="text-xl font-bold text-center text-gray-900 mb-2">{modal.type === 'restore' ? 'Restore Record?' : modal.type === 'delete' ? 'Delete Permanently?' : 'Empty Recycle Bin?'}</h3><p className="text-center text-gray-500 mb-6 text-sm">{modal.type === 'restore' ? 'This record will be moved back to its original module table.' : 'WARNING: This action cannot be undone. Data will be lost forever.'}</p><div className="flex gap-3"><button onClick={() => setModal({isOpen: false, type: 'restore'})} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors">Cancel</button><button onClick={handleActionConfirm} className={`flex-1 px-4 py-2.5 text-white font-bold rounded-lg transition-colors shadow-lg ${modal.type === 'restore' ? 'bg-green-600 hover:bg-green-700 shadow-green-500/30' : 'bg-red-600 hover:bg-red-700 shadow-red-500/30'}`}>Confirm</button></div></div></div>)}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4"><div><h2 className="text-2xl font-bold text-gray-800 flex items-center"><Trash2 className="mr-3 text-red-600" size={28} /> Recycle Bin</h2><p className="text-gray-500 mt-1">Manage deleted records from all modules.</p></div><div className="flex items-center gap-3 w-full md:w-auto"><div className="relative flex-1 md:w-72"><Search className="absolute left-3 top-2.5 text-gray-400" size={18} /><input className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none" placeholder="Search deleted records..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/></div>{deletedRecords.length > 0 && (<button onClick={() => setModal({isOpen: true, type: 'clear'})} className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm font-bold flex items-center whitespace-nowrap transition-colors border border-red-200"><Trash2 size={16} className="mr-2" /> Empty Bin</button>)}</div></div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left border-collapse"><thead><tr className="bg-red-50 text-xs text-red-800 uppercase tracking-wider"><th className="px-6 py-4 font-semibold border-b border-red-100">Source</th><th className="px-6 py-4 font-semibold border-b border-red-100">Deleted Data Preview</th><th className="px-6 py-4 font-semibold border-b border-red-100">Deleted By</th><th className="px-6 py-4 font-semibold border-b border-red-100">Date Deleted</th><th className="px-6 py-4 font-semibold border-b border-red-100 text-right">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{filteredData.length > 0 ? (filteredData.map((record) => (<tr key={record.id} className="hover:bg-red-50/20 transition-colors group"><td className="px-6 py-4"><span className="px-2 py-1 rounded bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">{record.sourceModule || 'EXCEL'}</span></td><td className="px-6 py-4">{renderPreview(record)}</td><td className="px-6 py-4 text-sm text-gray-600">{record.deletedBy}</td><td className="px-6 py-4 text-sm text-gray-600">{new Date(record.deletedAt).toLocaleString()}</td><td className="px-6 py-4 text-right"><div className="flex justify-end gap-2"><button onClick={() => setModal({isOpen: true, type: 'restore', id: record.id})} className="flex items-center px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded-lg text-xs font-bold transition-colors border border-green-200"><RotateCcw size={14} className="mr-1" /> Restore</button><button onClick={() => setModal({isOpen: true, type: 'delete', id: record.id})} className="flex items-center px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors border border-red-200"><Trash2 size={14} className="mr-1" /> Delete</button></div></td></tr>))) : (<tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400"><AlertCircle size={32} className="mx-auto mb-2 opacity-30" /><p>Recycle Bin is empty.</p></td></tr>)}</tbody></table></div></div>
    </div>
  );
};
