
import React, { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Data6A } from './components/Data6A';
import { Reports6A } from './components/Reports6A';
import { RythuDetailsReport } from './components/RythuDetailsReport';
import { ARegister } from './components/ARegister';
import { KMLViewer } from './components/KMLViewer';
import { FMB } from './components/FMB';
import { AdangalComparison } from './components/AdangalComparison';
import { RythuDetails } from './components/RythuDetails';
import { DktLandDetails } from './components/DktLandDetails';
import { AdminDashboard } from './components/AdminDashboard';
import { AttendanceDashboard } from './components/AttendanceDashboard';
import { RecycleBin } from './components/RecycleBin';
import { AdminProfile } from './components/AdminProfile';
import { ChangePassword } from './components/ChangePassword';
import { User, UserRole } from './types';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    // Check for existing session
    const sessionUser = sessionStorage.getItem('rythu_user');
    if (sessionUser) {
      const parsedUser = JSON.parse(sessionUser);
      setUser(parsedUser);
      // If admin, default to admin panel on first load
      if(parsedUser.role === UserRole.ADMIN && !sessionStorage.getItem('rythu_tab')) {
          setActiveTab('dashboard');
      } else if (sessionStorage.getItem('rythu_tab')) {
          setActiveTab(sessionStorage.getItem('rythu_tab') || 'dashboard');
      }
    }
  }, []);

  useEffect(() => {
      if(user) {
          sessionStorage.setItem('rythu_tab', activeTab);
      }
  }, [activeTab, user]);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    sessionStorage.setItem('rythu_user', JSON.stringify(loggedInUser));
    // Redirect Admin to Admin Panel immediately
    if(loggedInUser.role === UserRole.ADMIN) {
        setActiveTab('dashboard'); // Changed from admin-panel to dashboard to show the new UI first
    } else {
        setActiveTab('dashboard');
    }
  };

  const handleLogout = () => {
    setUser(null);
    sessionStorage.removeItem('rythu_user');
    sessionStorage.removeItem('rythu_tab');
    setActiveTab('dashboard');
  };

  // Callback to update local user state when profile changes
  const handleProfileUpdate = (updatedUser: User) => {
    setUser(updatedUser);
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'admin-panel':
          return user.role === UserRole.ADMIN ? <AdminDashboard /> : <Dashboard user={user} onNavigate={setActiveTab} />;
      case 'dashboard':
        return <Dashboard user={user} onNavigate={setActiveTab} />;
      case 'a-register':
        return <ARegister />;
      case 'kml-upload':
        // Updated title to match specific permission requirement text
        return <KMLViewer title="KML and Map View" />;
      case 'fmb':
        return <FMB />;
      case 'comparison':
        return <AdangalComparison />;
      case '6a-data':
        return <Data6A />;
      case '6a-reports':
        return <Reports6A />;
      case 'rythu-details':
        return <RythuDetails />;
      case 'dkt-land-details':
        return <DktLandDetails />;
      case 'rythu-details-report':
        return <RythuDetailsReport />;
      case 'attendance-dashboard':
        return <AttendanceDashboard />;
      case 'recycle-bin':
        return <RecycleBin userRole={user.role} />;
      case 'change-password':
        return <ChangePassword user={user} onLogout={handleLogout} />;
      case 'admin-profile':
        return <AdminProfile user={user} onProfileUpdate={handleProfileUpdate} />;
      default:
        return <Dashboard user={user} onNavigate={setActiveTab} />;
    }
  };

  return (
    <Layout 
      user={user} 
      onLogout={handleLogout} 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
    >
      {renderContent()}
    </Layout>
  );
}

export default App;
