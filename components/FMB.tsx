
import React, { useState, useRef, useEffect } from 'react';
import { DataService } from '../services/mockDataService';
import { FMBRecord, UserRole } from '../types';
import { Search, Plus, Trash2, Spline, Upload, X, Eye, Maximize2, FileText, Image as ImageIcon, File, Loader2, Download, ZoomIn, ZoomOut, RotateCw, AlertTriangle, CheckCircle } from 'lucide-react';

export const FMB: React.FC = () => {
  const [data, setData] = useState<FMBRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<FMBRecord | null>(null);
  const [formData, setFormData] = useState<Partial<FMBRecord>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  
  // Image Viewer Controls
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  
  const bulkInputRef = useRef<HTMLInputElement>(null);

  // --- PERMISSION CHECK ---
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
    if (toast.show) {
      const timer = setTimeout(() => setToast({ ...toast, show: false }), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ show: true, message, type });
  };

  const loadData = async () => {
      const records = await DataService.getFMB();
      setData(records);
  };

  const filteredData = data.filter(d => d.surveyNo.includes(searchTerm));

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
        showToast("Permission Denied: Only Admins can upload sketches.", "error");
        return;
    }
    setIsUploading(true);
    let finalUrl = formData.sketchUrl || '';

    await DataService.saveFMB({
      id: Date.now().toString(),
      surveyNo: formData.surveyNo || '',
      village: formData.village || '',
      sketchUrl: finalUrl,
      lastUpdated: new Date().toISOString().split('T')[0],
      fileType: formData.fileType
    });
    
    await loadData();
    setIsUploading(false);
    setIsModalOpen(false);
    showToast("FMB Sketch saved successfully!");
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdmin) {
        showToast("Permission Denied: Only Admins can upload sketches.", "error");
        return;
    }
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsUploading(true);
      const newRecords: FMBRecord[] = [];
      
      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const nameWithoutExt = file.name.split('.').slice(0, -1).join('.');
          
          try {
              const base64Data = await fileToBase64(file);
              const fileType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff') ? 'image/tiff' : 'image/jpeg');

              newRecords.push({
                id: Date.now().toString() + i,
                surveyNo: nameWithoutExt,
                village: 'Imported',
                sketchUrl: base64Data, 
                lastUpdated: new Date().toISOString().split('T')[0],
                fileType: fileType
              });
          } catch (err) {
              console.error("Error converting file", file.name, err);
          }
      }
      
      await DataService.importFMB(newRecords);
      await loadData();
      setIsUploading(false);
      showToast(`Successfully uploaded ${newRecords.length} sketches!`);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    // 1. Stop propagation to prevent opening the viewer
    if(e) {
      e.preventDefault();
      e.stopPropagation(); 
    }
    
    // 2. Strict Permission Check
    if (!isAdmin) {
        showToast("Permission Denied: Only Admin can delete files.", "error");
        return;
    }

    // 3. Confirmation
    if(window.confirm("Are you sure you want to delete this file?")) {
        try {
            // 4. Call Backend Soft Delete
            const success = await DataService.softDeleteFMB(id, user.name || 'Admin');
            
            if(success) {
                // 5. Refresh List
                await loadData();
                
                // If viewing the deleted record, close the modal
                if (viewingRecord && viewingRecord.id === id) {
                    setViewingRecord(null);
                }

                showToast("File deleted successfully.", "success");
            } else {
                showToast("Error: Failed to delete file.", "error");
            }
        } catch(err) {
            console.error(err);
            showToast("Error: Exception during delete.", "error");
        }
    }
  };

  const handleView = (record: FMBRecord) => {
    setViewingRecord(record);
    setZoomLevel(1);
    setRotation(0);
  };

  const isPdf = (record: FMBRecord) => record.fileType?.includes('pdf') || record.sketchUrl.toLowerCase().startsWith('data:application/pdf') || record.sketchUrl.toLowerCase().endsWith('.pdf');
  const isTiff = (record: FMBRecord) => record.fileType?.includes('tiff') || record.sketchUrl.toLowerCase().startsWith('data:image/tiff') || record.sketchUrl.toLowerCase().endsWith('.tif') || record.sketchUrl.toLowerCase().endsWith('.tiff');

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast.show && (
          <div className={`fixed top-24 right-5 z-[60] px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 ${toast.type === 'success' ? 'bg-corp-900 text-white' : 'bg-red-600 text-white'}`}>
              {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
              <span className="font-bold">{toast.message}</span>
          </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-lg shadow-sm">
        <div className="relative w-full md:w-64">
           <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
           <input className="w-full pl-10 pr-4 py-2 border rounded-lg" placeholder="Search Survey No..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
        </div>
        
        {isAdmin && (
            <div className="flex gap-2 items-center">
                {isUploading && <span className="text-sm text-purple-600 flex items-center animate-pulse"><Loader2 size={16} className="animate-spin mr-1"/> Processing...</span>}
                <input type="file" multiple accept="image/*,.pdf,.tif,.tiff" ref={bulkInputRef} className="hidden" onChange={handleBulkUpload} />
                <button onClick={() => bulkInputRef.current?.click()} disabled={isUploading} className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300 font-medium text-sm disabled:opacity-50"><Upload size={18} className="mr-2"/> Bulk Upload</button>
                <button onClick={() => setIsModalOpen(true)} disabled={isUploading} className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium text-sm disabled:opacity-50"><Plus size={18} className="mr-2"/> Add Single</button>
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
         {filteredData.length === 0 && (<div className="col-span-full text-center py-10 text-gray-400"><Spline size={48} className="mx-auto mb-3 opacity-20" />No FMB sketches found.</div>)}
         {filteredData.map(fmb => (
             <div key={fmb.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow group relative">
                 <div className="flex justify-between items-start mb-2">
                    <div className="truncate pr-2 w-full"><h4 className="font-bold text-gray-800 truncate" title={fmb.surveyNo}>S.No: {fmb.surveyNo}</h4><p className="text-xs text-gray-500">{fmb.village}</p></div>
                    
                    {/* Permission Guard: Delete Option for Admin */}
                    {isAdmin && (
                        <button 
                            onClick={(e) => handleDelete(fmb.id, e)} 
                            className="bg-red-50 text-red-600 hover:bg-red-600 hover:text-white flex-shrink-0 transition-all p-1.5 rounded-lg shadow-sm border border-red-100 z-10"
                            title="Delete File"
                            type="button"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                 </div>
                 <div className="relative bg-gray-100 h-40 rounded-lg flex items-center justify-center mb-3 overflow-hidden cursor-pointer border border-gray-100" onClick={() => handleView(fmb)}>
                     {isPdf(fmb) ? (
                        <div className="flex flex-col items-center text-red-500">
                            <FileText size={48} className="drop-shadow-sm" />
                            <span className="text-xs font-bold mt-2 uppercase tracking-wide">PDF Document</span>
                        </div>
                     ) : isTiff(fmb) ? (
                        <div className="flex flex-col items-center text-purple-500">
                            <File size={48} className="drop-shadow-sm" />
                            <span className="text-xs font-bold mt-2 uppercase tracking-wide">TIFF File</span>
                        </div>
                     ) : fmb.sketchUrl ? (
                        <img src={fmb.sketchUrl} alt="FMB Sketch" className="w-full h-full object-cover" />
                     ) : (
                        <Spline size={40} className="text-gray-300" />
                     )}
                     <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <Maximize2 className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" size={24} />
                     </div>
                 </div>
                 <div className="flex justify-between items-center mt-2">
                    <p className="text-xs text-gray-400 truncate max-w-[100px]" title={fmb.lastUpdated}>{fmb.lastUpdated}</p>
                    <button onClick={() => handleView(fmb)} className="text-xs text-purple-600 hover:underline font-medium">View Full</button>
                 </div>
             </div>
         ))}
      </div>
      
      {/* Upload Modal */}
      {isModalOpen && isAdmin && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white p-6 rounded-lg w-full max-w-md shadow-2xl"><div className="flex justify-between items-center mb-4"><h3 className="font-bold text-lg">Upload FMB Sketch</h3><button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button></div><form onSubmit={handleSave} className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Survey Number</label><input className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none" value={formData.surveyNo || ''} onChange={e => setFormData({...formData, surveyNo: e.target.value})} required/></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Village</label><input className="w-full p-2 border rounded focus:ring-2 focus:ring-purple-500 outline-none" value={formData.village || ''} onChange={e => setFormData({...formData, village: e.target.value})} required/></div><div className="border-2 border-dashed border-gray-300 p-6 text-center rounded-lg bg-gray-50 hover:bg-gray-100 transition cursor-pointer relative"><input type="file" accept="image/*,.pdf,.tif,.tiff" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={async (e) => { if(e.target.files?.[0]) { const file = e.target.files[0]; try { setIsUploading(true); const base64 = await fileToBase64(file); setFormData({...formData, sketchUrl: base64, fileType: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : file.name.endsWith('.tif') || file.name.endsWith('.tiff') ? 'image/tiff' : 'image/jpeg')}); setIsUploading(false); } catch (err) { console.error(err); setIsUploading(false); }}}}/>{isUploading ? (<p className="text-sm text-purple-600 animate-pulse">Encoding file...</p>) : (<p className="text-sm text-gray-500">{formData.sketchUrl ? "File Selected (Ready to Save)" : "Click to Upload Image/PDF/TIFF"}</p>)}</div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button><button type="submit" disabled={isUploading} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">Save</button></div></form></div></div>)}
      
      {/* FULL VIEWER MODAL - Same Page Display */}
      {viewingRecord && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setViewingRecord(null)}>
            <div className="bg-white rounded-lg max-w-6xl h-[90vh] w-full overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="font-bold text-gray-900 text-lg">FMB Sketch: S.No {viewingRecord.surveyNo}</h3>
                        <p className="text-sm text-gray-500">{viewingRecord.village} {viewingRecord.fileType ? `(${viewingRecord.fileType})` : ''}</p>
                    </div>
                    <div className="flex gap-2 items-center">
                        <a href={viewingRecord.sketchUrl} download={`FMB_${viewingRecord.surveyNo}`} className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg" title="Download Original">
                            <Download size={20} />
                        </a>
                        {/* Permission Guard: Delete Option for Admin in Modal */}
                        {isAdmin && (
                            <button 
                                onClick={(e) => handleDelete(viewingRecord.id, e)} 
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-100" 
                                title="Delete File"
                            >
                                <Trash2 size={20} />
                            </button>
                        )}
                        <div className="w-px h-6 bg-gray-200 mx-1"></div>
                        <button onClick={() => setViewingRecord(null)} className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg hover:text-red-500 transition-colors">
                            <X size={24} />
                        </button>
                    </div>
                </div>
                
                {/* Viewer Body */}
                <div className="flex-1 bg-gray-100 relative overflow-hidden flex flex-col">
                    
                    {/* Controls Toolbar (Images Only) */}
                    {!isPdf(viewingRecord) && !isTiff(viewingRecord) && viewingRecord.sketchUrl && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur border border-gray-200 rounded-full px-4 py-2 shadow-lg z-20 flex gap-4">
                            <button onClick={() => setZoomLevel(z => Math.min(z + 0.25, 3))} className="p-1 hover:text-blue-600" title="Zoom In"><ZoomIn size={20} /></button>
                            <span className="text-xs font-mono self-center text-gray-400 w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
                            <button onClick={() => setZoomLevel(z => Math.max(z - 0.25, 0.5))} className="p-1 hover:text-blue-600" title="Zoom Out"><ZoomOut size={20} /></button>
                            <div className="w-px bg-gray-300 mx-1"></div>
                            <button onClick={() => setRotation(r => r + 90)} className="p-1 hover:text-blue-600" title="Rotate"><RotateCw size={20} /></button>
                        </div>
                    )}

                    <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                        {/* 1. PDF VIEWER - Uses <embed> as requested */}
                        {isPdf(viewingRecord) ? (
                            <embed 
                                src={viewingRecord.sketchUrl} 
                                type="application/pdf" 
                                className="w-full h-full rounded shadow-sm"
                            />
                        ) : isTiff(viewingRecord) ? (
                            /* 2. TIFF VIEWER (Fallback) */
                            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center bg-white rounded-lg shadow-sm border border-gray-200 max-w-md">
                                <File size={64} className="mb-4 text-purple-400" />
                                <h3 className="text-xl font-bold text-gray-800 mb-2">TIFF File Detected</h3>
                                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm text-yellow-800 mb-6 flex items-start text-left">
                                    <AlertTriangle size={18} className="mr-2 flex-shrink-0 mt-0.5" />
                                    <span>Browsers cannot natively display TIFF files without backend conversion. Please download the file to view it.</span>
                                </div>
                                <a 
                                    href={viewingRecord.sketchUrl} 
                                    download={`FMB_${viewingRecord.surveyNo}.tiff`} 
                                    className="px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium shadow transition-colors flex items-center"
                                >
                                    <Download size={18} className="mr-2" /> Download to View
                                </a>
                            </div>
                        ) : viewingRecord.sketchUrl ? (
                            /* 3. IMAGE VIEWER (JPG, PNG) - With Transformations */
                            <div className="overflow-auto w-full h-full flex items-center justify-center">
                                <img 
                                    src={viewingRecord.sketchUrl} 
                                    alt={`Sketch ${viewingRecord.surveyNo}`} 
                                    style={{ 
                                        transform: `scale(${zoomLevel}) rotate(${rotation}deg)`, 
                                        transition: 'transform 0.2s ease-out' 
                                    }}
                                    className="max-w-full max-h-full object-contain shadow-lg bg-white" 
                                />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400 flex-col">
                                <Spline size={48} className="mb-2 opacity-50" />
                                <p>Document Available</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
