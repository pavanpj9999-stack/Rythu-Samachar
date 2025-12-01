
import React, { useEffect, useState } from 'react';
import { DataService } from '../services/mockDataService';
import { User, DashboardStats } from '../types';
import { Sparkles, Database, UserCheck, ArrowRight, FileText } from 'lucide-react';

interface DashboardProps {
    user: User;
    onNavigate: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onNavigate }) => {
  const [greeting, setGreeting] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    // Determine Greeting
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 16) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
    
    // Load Stats Async
    const loadStats = async () => {
        const s = await DataService.getStats();
        setStats(s);
    };
    loadStats();
  }, []);

  return (
    <div className="space-y-8 pb-10 max-w-6xl mx-auto">
      
      {/* 1. WELCOME BANNER - Minimalist */}
      <div className="bg-white rounded-2xl shadow-sm border border-corp-100 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
              <h1 className="text-3xl font-bold text-corp-900 mb-2">
                  {greeting}, {user.name.split(' ')[0]}
              </h1>
              <p className="text-corp-500 text-lg">
                  Welcome to the Rythu Samachar Portal. Select a module below to get started.
              </p>
          </div>
          <div className="hidden md:block">
              <div className="h-16 w-16 bg-gradient-to-br from-agri-400 to-agri-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-agri-500/30">
                  <Sparkles size={32} />
              </div>
          </div>
      </div>

      {/* 2. QUICK ACCESS REPORTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 6A Reports Card */}
          <button 
            onClick={() => onNavigate('6a-reports')}
            className="bg-white p-6 rounded-2xl shadow-sm border border-corp-100 hover:shadow-md transition-all group text-left relative overflow-hidden"
          >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Database size={100} className="text-blue-600" />
              </div>
              <div className="relative z-10">
                  <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                      <FileText size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">6A Reports</h3>
                  <p className="text-gray-500 mb-6 text-sm">Access updated records, pending entries, and add new 6A data reports.</p>
                  <div className="flex items-center text-blue-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">
                      Open Reports <ArrowRight size={16} className="ml-2" />
                  </div>
              </div>
          </button>

          {/* Rythu Details Card */}
          <button 
            onClick={() => onNavigate('rythu-details-report')}
            className="bg-white p-6 rounded-2xl shadow-sm border border-corp-100 hover:shadow-md transition-all group text-left relative overflow-hidden"
          >
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <UserCheck size={100} className="text-purple-600" />
              </div>
              <div className="relative z-10">
                  <div className="h-12 w-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4">
                      <UserCheck size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Rythu Details</h3>
                  <p className="text-gray-500 mb-6 text-sm">View comprehensive farmer profiles and team assignment reports.</p>
                  <div className="flex items-center text-purple-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">
                      View Report <ArrowRight size={16} className="ml-2" />
                  </div>
              </div>
          </button>
      </div>

      {/* Footer Info */}
      <div className="text-center text-corp-300 text-sm mt-12">
          {stats && <p className="mt-2 text-xs">System Stats: {stats.totalEntries} Total Records • {stats.totalAcres} Acres</p>}
      </div>

    </div>
  );
};
