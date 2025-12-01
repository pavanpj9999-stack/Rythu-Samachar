
import React, { useState, useEffect, useRef } from 'react';
import { DataService } from '../services/mockDataService';
import { KMLRecord, UserRole } from '../types';
import { Upload, File, Map as MapIcon, Trash2, Globe, ExternalLink, Loader2, Eye, Download, X, Image as ImageIcon, MapPin, CheckCircle, AlertTriangle } from 'lucide-react';

interface KMLViewerProps {
    title?: string;
}

export const KMLViewer: React.FC<KMLViewerProps> = ({ title = "KML and Map View" }) => {
  const [files, setFiles] = useState<KMLRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingFile, setViewingFile] = useState<KMLRecord | null>(null);
  const [viewingMap, setViewingMap] = useState<KMLRecord | null>(null);
  
  // Toast State
  const [toast, setToast] = useState<{ show: boolean, message: string, type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  
  const mapRef = useRef<any>(null); // Reference to Leaflet Map instance

  // --- PERMISSION CHECK ---
  const getCurrentUser = () => {
      try {
        const userStr = sessionStorage.getItem('rythu_user');
        if (userStr) return JSON.parse(userStr);
      } catch(e) { console.error("Session parse error", e); }
      return { role: 'USER' };
  };
  const user = getCurrentUser();
  const isAdmin = user.role === UserRole.ADMIN;

  useEffect(() => {
    loadKMLs();
  }, []);

  // Toast Timer
  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => setToast({ ...toast, show: false }), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
      setToast({ show: true, message, type });
  };

  // --- MAP INITIALIZATION ---
  useEffect(() => {
    if (viewingMap) {
        const coords = getCoordinates(viewingMap);
        if (coords) {
            // Wait for modal to render
            setTimeout(() => {
                const L = (window as any).L;
                if (!L) {
                    alert("Map library not loaded.");
                    return;
                }

                // If map already exists, remove it
                if (mapRef.current) {
                    mapRef.current.remove();
                    mapRef.current = null;
                }

                // Initialize Map
                const map = L.map('kml-map-container').setView([coords.lat, coords.lon], 15);

                // Add Tile Layer (OpenStreetMap)
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(map);

                // Add Marker
                L.marker([coords.lat, coords.lon])
                    .addTo(map)
                    .bindPopup(`<b>${viewingMap.fileName}</b><br>Lat: ${coords.lat}<br>Lon: ${coords.lon}`)
                    .openPopup();

                mapRef.current = map;
            }, 100);
        }
    }

    return () => {
        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }
    };
  }, [viewingMap]);

  const loadKMLs = async () => {
      setLoading(true);
      try {
        const records = await DataService.getKML();
        setFiles(records);
      } catch (e) {
        console.error("Failed to load KMLs", e);
      } finally {
        setLoading(false);
      }
  };

  const fileToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
      });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Backend Guard: Strict check to prevent staff upload
    if (!isAdmin) {
        showToast("Permission Denied: Only Admins can upload files.", "error");
        return;
    }

    const fileList = e.target.files;
    if (fileList && fileList.length > 0) {
      const file = fileList[0];
      const isKml = file.name.toLowerCase().endsWith('.kml') || file.name.toLowerCase().endsWith('.kmz');
      const isTiff = file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff');

      let googleEarthLink = '';
      let fileUrl = '';
      let latitude: number | undefined;
      let longitude: number | undefined;

      try {
        if (isKml) {
            // Logic for KML: Read text to extract coordinates
            const text = await file.text();
            let latStr = '';
            let lonStr = '';
            
            // Try extracting coordinates
            const coordMatch = text.match(/<coordinates>([^<]+)<\/coordinates>/);
            if (coordMatch && coordMatch[1]) {
                const firstCoord = coordMatch[1].trim().split(/\s+/)[0];
                const parts = firstCoord.split(',');
                if (parts.length >= 2) {
                    lonStr = parts[0];
                    latStr = parts[1];
                }
            }
            if (!latStr || !lonStr) {
                const latMatch = text.match(/<latitude>([^<]+)<\/latitude>/);
                const lonMatch = text.match(/<longitude>([^<]+)<\/longitude>/);
                if (latMatch && lonMatch) {
                    latStr = latMatch[1];
                    lonStr = lonMatch[1];
                }
            }

            if (latStr && lonStr) {
                googleEarthLink = `https://earth.google.com/web/@${latStr},${lonStr},1000d,35y,0h,0t,0r`;
                latitude = parseFloat(latStr);
                longitude = parseFloat(lonStr);
            } else {
                googleEarthLink = 'https://earth.google.com/web/';
            }
            
            // For KML, we can just store a blob URL for download or base64
            fileUrl = await fileToBase64(file);

        } else if (isTiff) {
            // Logic for TIFF: Store as Base64/DataURL
            fileUrl = await fileToBase64(file);
            // No Earth Link for raw TIFFs
            googleEarthLink = '';
        } else {
            showToast("Unsupported file type.", "error");
            return;
        }

        const newRecord: KMLRecord = {
          id: Date.now().toString(),
          fileName: file.name,
          uploadedBy: user.name || 'Admin',
          uploadDate: new Date().toLocaleDateString(),
          size: (file.size / 1024).toFixed(2) + ' KB',
          url: fileUrl,
          googleEarthLink: googleEarthLink,
          latitude: latitude,
          longitude: longitude
        };
        
        await DataService.saveKML(newRecord);
        await loadKMLs();
        showToast("File uploaded successfully!", "success");
        
        // Reset input
        e.target.value = '';

      } catch (err) {
          console.error("Upload failed", err);
          showToast("Error processing file upload.", "error");
      }
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    // 1. Stop propagation
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
    if (window.confirm("Are you sure you want to delete this file?")) {
        try {
            // 4. Call Backend Soft Delete
            const success = await DataService.softDeleteKML(id, user.name || 'Admin');
            
            if (success) {
                // 5. Refresh List Immediately
                await loadKMLs();
                
                // If the deleted file was open in modal, close it
                if (viewingFile && viewingFile.id === id) setViewingFile(null);
                if (viewingMap && viewingMap.id === id) setViewingMap(null);

                showToast("File deleted successfully.", "success");
            } else {
                showToast("Error: Failed to delete file.", "error");
            }
            
        } catch (error) {
            console.error("Delete operation failed", error);
            showToast("Error: Exception during delete.", "error");
        }
    }
  };

  const isTiff = (fileName: string) => fileName.toLowerCase().endsWith('.tif') || fileName.toLowerCase().endsWith('.tiff');

  const getCoordinates = (record: KMLRecord) => {
      if (record.latitude && record.longitude) {
          return { lat: record.latitude, lon: record.longitude };
      }
      // Fallback: extract from Earth Link
      if (record.googleEarthLink) {
          const match = record.googleEarthLink.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
          if (match) {
              return { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
          }
      }
      return null;
  };

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col relative">
      
      {/* Toast Notification */}
      {toast.show && (
          <div className={`fixed top-24 right-5 z-[60] px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 ${toast.type === 'success' ? 'bg-corp-900 text-white' : 'bg-red-600 text-white'}`}>
              {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
              <span className="font-bold">{toast.message}</span>
          </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
        <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center">
                <Globe className="mr-2 text-agri-600" /> {title}
            </h3>
            <p className="text-sm text-gray-500">View and analyze KML maps and TIFF overlays.</p>
        </div>
        
        {/* Permission Guard: Upload UI completely hidden for Staff */}
        {isAdmin && (
            <div className="flex gap-3">
                <div className="relative">
                    <input type="file" accept=".kml,.kmz,.tif,.tiff" onChange={handleUpload} className="hidden" id="kml-upload" />
                    <label htmlFor="kml-upload" className="flex items-center px-4 py-2 bg-agri-600 text-white rounded-lg cursor-pointer hover:bg-agri-700 font-medium text-sm shadow-sm transition-colors">
                        <Upload size={18} className="mr-2" /> Upload File
                    </label>
                </div>
            </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h3 className="font-semibold text-gray-800">Available Files</h3>
                {!isAdmin && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">View Only</span>}
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
                {loading && <div className="text-center py-4 text-agri-600 flex justify-center"><Loader2 className="animate-spin mr-2"/> Loading...</div>}
                
                {!loading && files.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                        <MapIcon size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No files uploaded.</p>
                    </div>
                )}
                
                {!loading && files.map(f => {
                    const hasCoords = getCoordinates(f) !== null;
                    return (
                        <div key={f.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-agri-300 transition-colors group relative">
                            <div className="flex items-center overflow-hidden mr-2">
                                {isTiff(f.fileName) ? (
                                    <ImageIcon className="text-purple-500 mr-3 flex-shrink-0" size={24}/>
                                ) : (
                                    <File className="text-orange-500 mr-3 flex-shrink-0" size={24}/>
                                )}
                                <div className="min-w-0">
                                    <button onClick={() => isTiff(f.fileName) ? setViewingFile(f) : window.open(f.googleEarthLink || 'https://earth.google.com/web/', '_blank')} className="text-sm font-bold text-gray-800 truncate hover:text-blue-600 hover:underline block text-left w-full">
                                        {f.fileName}
                                    </button>
                                    <p className="text-xs text-gray-500">{f.uploadDate} • {f.size}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 z-10">
                                {isTiff(f.fileName) ? (
                                    <button onClick={() => setViewingFile(f)} className="p-2 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors" title="View TIFF">
                                        <Eye size={18} />
                                    </button>
                                ) : (
                                    <>
                                        {/* Map View Button */}
                                        {hasCoords && (
                                            <button 
                                                onClick={() => setViewingMap(f)}
                                                className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors flex items-center" 
                                                title="View On Map"
                                            >
                                                <MapPin size={18} />
                                            </button>
                                        )}
                                        {/* Earth Link Button */}
                                        <a href={f.googleEarthLink || 'https://earth.google.com/web/'} target="_blank" rel="noreferrer" className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors flex items-center" title="Fly to location in Google Earth">
                                            <Globe size={18} />
                                        </a>
                                    </>
                                )}
                                
                                {/* Permission Guard: Delete Option for Admin */}
                                {isAdmin && (
                                    <button 
                                        onClick={(e) => handleDelete(f.id, e)} 
                                        className="p-2 text-red-500 hover:bg-red-100 hover:text-red-700 rounded-lg transition-colors border border-transparent hover:border-red-200 z-20" 
                                        type="button"
                                        title="Delete File"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
        <div className="lg:col-span-2 bg-gray-900 rounded-xl shadow-inner border border-gray-800 overflow-hidden relative flex flex-col items-center justify-center text-center p-8 text-white bg-[url('https://www.gstatic.com/earth/social/00_generic_facebook-001.jpg')] bg-cover bg-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
            <div className="relative z-10 max-w-md">
                <Globe size={64} className="mx-auto mb-4 text-blue-400" />
                <h2 className="text-2xl font-bold mb-2">View in Google Earth</h2>
                <p className="text-gray-300 mb-6">Launch Google Earth to view 3D terrain and satellite imagery.</p>
                <div className="bg-gray-800/80 p-4 rounded-lg mb-6 text-left text-sm border border-gray-700">
                    <p className="font-semibold text-gray-200 mb-2">Instructions:</p>
                    <ol className="list-decimal pl-4 space-y-1 text-gray-400">
                        <li>Click the <strong>File Name</strong> or <strong>Globe icon</strong> to open Google Earth.</li>
                        <li>Click the <strong>Map Pin icon</strong> to view the location on a standard map here.</li>
                        <li>To see boundaries: In Google Earth, go to <span className="text-white">Projects</span>.</li>
                        <li>Select <span className="text-white">Open &gt; Import KML file from computer</span>.</li>
                        <li>Select the KML file you downloaded (if available locally).</li>
                    </ol>
                </div>
                <a href="https://earth.google.com/web/" target="_blank" rel="noreferrer" className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-bold transition-all shadow-lg hover:shadow-blue-500/30">
                    <ExternalLink size={20} className="mr-2" /> Launch Google Earth Web
                </a>
            </div>
        </div>
      </div>

      {/* MAP VIEWER MODAL */}
      {viewingMap && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setViewingMap(null)}>
              <div className="bg-white rounded-lg max-w-5xl w-full h-[80vh] overflow-hidden flex flex-col shadow-2xl relative" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                      <div>
                          <h3 className="font-bold text-gray-900 flex items-center">
                              <MapPin size={20} className="mr-2 text-green-600"/> 
                              Map View: {viewingMap.fileName}
                          </h3>
                          <p className="text-xs text-gray-500">
                              Lat: {getCoordinates(viewingMap)?.lat}, Lon: {getCoordinates(viewingMap)?.lon}
                          </p>
                      </div>
                      <div className="flex gap-2 items-center">
                          {isAdmin && (
                            <button 
                                onClick={(e) => handleDelete(viewingMap.id, e)} 
                                className="p-2 text-red-500 hover:bg-red-100 rounded-full transition-colors"
                                title="Delete File"
                            >
                                <Trash2 size={20} />
                            </button>
                          )}
                          <button onClick={() => setViewingMap(null)} className="p-1 hover:bg-gray-200 rounded-full transition"><X size={24} className="text-gray-600" /></button>
                      </div>
                  </div>
                  
                  {/* Map Container */}
                  <div className="flex-1 bg-gray-100 relative">
                      <div id="kml-map-container" className="w-full h-full z-10"></div>
                  </div>
              </div>
          </div>
      )}

      {/* TIFF VIEWER MODAL */}
      {viewingFile && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200" onClick={() => setViewingFile(null)}>
              <div className="bg-white rounded-lg max-w-3xl w-full overflow-hidden flex flex-col shadow-2xl relative" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                      <div>
                          <h3 className="font-bold text-gray-900">{viewingFile.fileName}</h3>
                          <p className="text-xs text-gray-500">{viewingFile.size}</p>
                      </div>
                      <div className="flex gap-2 items-center">
                          {isAdmin && (
                            <button 
                                onClick={(e) => handleDelete(viewingFile.id, e)} 
                                className="p-2 text-red-500 hover:bg-red-100 rounded-full transition-colors"
                                title="Delete File"
                            >
                                <Trash2 size={20} />
                            </button>
                          )}
                          <button onClick={() => setViewingFile(null)} className="p-1 hover:bg-gray-200 rounded-full transition"><X size={24} className="text-gray-600" /></button>
                      </div>
                  </div>
                  
                  <div className="p-8 bg-gray-100 flex flex-col items-center justify-center min-h-[400px]">
                      {isTiff(viewingFile.fileName) ? (
                         <div className="flex flex-col items-center justify-center text-center max-w-md">
                            <File size={64} className="mb-4 text-purple-400" />
                            <h3 className="text-xl font-bold text-gray-800 mb-2">TIFF File Detected</h3>
                            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm text-yellow-800 mb-6">
                                Browsers cannot natively display TIFF files without backend conversion. 
                                <br/>Please download the file to view it.
                            </div>
                            <a href={viewingFile.url} download={viewingFile.fileName} className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold shadow-lg flex items-center transition-transform hover:-translate-y-0.5">
                                <Download size={20} className="mr-2" /> Download TIFF File
                            </a>
                         </div>
                      ) : (
                          /* Fallback for other images if supported in future */
                          <div className="text-gray-400">Preview not available</div>
                      )}
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
