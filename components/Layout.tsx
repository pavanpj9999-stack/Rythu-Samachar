import React, { useState, useEffect } from 'react';
import { LogOut, LayoutDashboard, Database, Users, Menu, X, FileText, Spline, GitCompare, UserCheck, Shield, ChevronRight, Upload, Trash2, Lock, Camera, Cloud, CloudOff, AlertTriangle } from 'lucide-react';
import { User, UserRole } from '../types';
import { RythuLogo } from './RythuLogo';
import { DataService } from '../services/mockDataService';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, user, onLogout, activeTab, setActiveTab }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const isOffline = DataService.isOffline();
  
  // Live Clock Effect (Updates every second)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format Time for India (IST)
  const formattedTime = currentTime.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  // Format Date (DD-MM-YYYY)
  const formattedDate = currentTime.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).replace(/\//g, '-');

  // Core menu items for everyone
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'a-register', label: 'A-Register', icon: <FileText size={20} /> },
    { id: 'kml-upload', label: 'KML file & Map view', icon: <Upload size={20} /> },
    { id: 'fmb', label: 'FMB Sketches', icon: <Spline size={20} /> },
    { id: 'comparison', label: 'Adangal Comparison', icon: <GitCompare size={20} /> },
    { id: '6a-data', label: '6A Data', icon: <Database size={20} /> },
    { id: 'rythu-details', label: 'Rythu Details', icon: <UserCheck size={20} /> },
    { id: 'dkt-land-details', label: 'DKT Land Details', icon: <FileText size={20} /> },
  ];

  // Add Admin Panel and Recycle Bin if User is Admin
  if(user.role === UserRole.ADMIN) {
      menuItems.unshift({ id: 'admin-panel', label: 'Admin Panel', icon: <Shield size={20} /> });
      menuItems.push({ id: 'attendance-dashboard', label: 'Attendance Logs', icon: <Camera size={20} /> });
      menuItems.push({ id: 'recycle-bin', label: 'Recycle Bin', icon: <Trash2 size={20} /> });
      menuItems.push({ id: 'change-password', label: 'Change Password', icon: <Lock size={20} /> });
  }

  return (
    <div className="flex h-screen bg-corp-50 overflow-hidden font-sans">
      {/* Sidebar - Corporate Slate Theme */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-72' : 'w-20'
        } bg-corp-900 text-white transition-all duration-300 flex flex-col shadow-2xl z-30`}
      >
        <div className="p-4 flex items-center justify-between border-b border-corp-800 h-28 bg-corp-900">
          {isSidebarOpen ? (
            <div className="flex items-center justify-start w-full overflow-hidden">
                <RythuLogo className="h-[80px] w-auto" />
            </div>
          ) : (
             <div className="w-12 h-12 flex items-center justify-center overflow-hidden">
                <RythuLogo className="w-full h-full" />
             </div>
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-corp-800 rounded-lg text-corp-400 hover:text-white transition-colors">
            {isSidebarOpen ? <X size={18} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 scrollbar-hide space-y-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center group relative px-3 py-3 rounded-xl transition-all duration-200 mb-1 ${
                  activeTab === item.id 
                    ? 'bg-gradient-to-r from-agri-600 to-agri-500 text-white shadow-lg shadow-agri-900/20' 
                    : 'text-corp-300 hover:bg-corp-800 hover:text-white'
                } ${!isSidebarOpen ? 'justify-center' : ''}`}
                title={!isSidebarOpen ? item.label : ''}
              >
                <span className={`${activeTab === item.id ? 'text-white' : 'text-corp-400 group-hover:text-white'} transition-colors`}>
                    {item.icon}
                </span>
                
                {isSidebarOpen && (
                    <>
                        <span className="ml-3 font-medium text-sm tracking-wide">{item.label}</span>
                        {activeTab === item.id && <ChevronRight size={16} className="ml-auto opacity-70" />}
                    </>
                )}
                
                {/* Tooltip for collapsed state */}
                {!isSidebarOpen && (
                    <div className="absolute left-full ml-4 px-2 py-1 bg-corp-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl">
                        {item.label}
                    </div>
                )}
              </button>
            ))}
        </nav>

        <div className="p-4 border-t border-corp-800 bg-corp-900/50">
          <button 
            onClick={onLogout}
            className={`w-full flex items-center ${
              !isSidebarOpen ? 'justify-center' : 'justify-start space-x-3'
            } px-4 py-3 rounded-xl text-red-300 hover:bg-red-900/20 hover:text-red-200 transition-colors group`}
          >
            <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
            {isSidebarOpen && <span className="font-medium text-sm">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-corp-50">
        {/* Header Bar - Subtle Gradient */}
        <header className="bg-white/90 backdrop-blur-sm h-20 flex items-center justify-between px-8 z-20 border-b border-corp-200 shadow-sm sticky top-0">
          <div className="flex flex-col">
              <h2 className="text-xl font-bold text-corp-800 tracking-tight">
                {activeTab === 'admin-profile' ? 'My Profile' : menuItems.find(i => i.id === activeTab)?.label}
              </h2>
              <p className="text-xs text-corp-400 hidden sm:block">
                  {user.role === UserRole.ADMIN ? 'Administrator Control' : 'Staff Workspace'}
              </p>
          </div>
          
          <div className="flex items-center space-x-8">
            {/* Status Indicator */}
            {isOffline ? (
                <div className="flex items-center text-red-600 bg-red-50 px-4 py-2 rounded-full text-xs font-bold border border-red-200 animate-pulse shadow-sm cursor-help" title="CRITICAL: You are running in Offline Mode because API keys are missing. Data saved will NOT appear on other devices.">
                    <AlertTriangle size={16} className="mr-2"/> OFFLINE MODE (Data Not Syncing)
                </div>
            ) : (
                <div className="flex items-center text-green-600 bg-green-50 px-3 py-1 rounded-full text-xs font-bold border border-green-200" title="Connected to Cloud Database">
                    <Cloud size={14} className="mr-1.5"/> Cloud Sync Active
                </div>
            )}

            {/* Live Clock Section */}
            <div className="hidden md:flex flex-col items-end border-r border-corp-100 pr-6">
              <div className="flex items-center text-corp-800 font-bold text-lg leading-none font-mono tracking-tight">
                {formattedTime}
              </div>
              <div className="flex items-center text-corp-400 text-xs font-semibold uppercase tracking-wider mt-1">
                {formattedDate} • IST
              </div>
            </div>

            {/* Profile Section */}
            <div 
              onClick={() => user.role === UserRole.ADMIN && setActiveTab('admin-profile')}
              className={`flex items-center gap-3 pl-2 transition-opacity ${user.role === UserRole.ADMIN ? 'cursor-pointer hover:opacity-70' : 'cursor-default'}`}
              title={user.role === UserRole.ADMIN ? "Go to Profile" : ""}
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-bold text-corp-900 leading-tight">{user.name}</p>
                <p className="text-xs uppercase font-bold tracking-wider text-agri-600 bg-agri-50 px-2 py-0.5 rounded-full inline-block mt-1">
                  {user.role}
                </p>
              </div>
              <div className="h-11 w-11 rounded-full bg-gradient-to-br from-corp-100 to-corp-200 p-1 shadow-inner relative group">
                  <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-corp-700 font-bold border border-corp-100 overflow-hidden">
                     {user.name.charAt(0)}
                  </div>
                  {user.role === UserRole.ADMIN && (
                      <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <Users size={16} className="text-white" />
                      </div>
                  )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-corp-50 p-6 md:p-8 scrollbar-thin">
          <div className="max-w-7xl mx-auto h-full flex flex-col">
              {children}
          </div>
        </div>
      </main>
    </div>
  );
};