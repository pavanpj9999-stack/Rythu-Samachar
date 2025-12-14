
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { AuthService } from '../services/mockDataService';
import { Lock, Save, AlertCircle, CheckCircle, Eye, EyeOff, Shield } from 'lucide-react';

interface ChangePasswordProps {
  user: User;
  onLogout: () => void;
}

export const ChangePassword: React.FC<ChangePasswordProps> = ({ user, onLogout }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (user.role !== UserRole.ADMIN) {
      return <div className="p-10 text-center text-red-500 font-bold">Access Denied. Admin Only.</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // Frontend Validation
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: "New password and confirm password do not match." });
      return;
    }

    if (currentPassword === newPassword) {
        setMessage({ type: 'error', text: "New password cannot be the same as current password." });
        return;
    }

    setIsLoading(true);

    // Simulate Network Delay for "Backend" feel
    setTimeout(async () => {
        const result = await AuthService.changePassword(user.id, currentPassword, newPassword);
        setIsLoading(false);

        if (result.success) {
            setMessage({ type: 'success', text: result.message });
            // Clear Form
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            
            // Force Re-login after delay
            setTimeout(() => {
                alert("Password changed successfully. Please login again.");
                onLogout();
            }, 1500);
        } else {
            setMessage({ type: 'error', text: result.message });
        }
    }, 800);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
        <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
           <Lock size={24} />
        </div>
        <div>
           <h2 className="text-xl font-bold text-gray-800">Change Password</h2>
           <p className="text-sm text-gray-500">Secure your administrator account</p>
        </div>
      </div>

      {/* Message Alert */}
      {message && (
          <div className={`p-4 rounded-xl border flex items-center shadow-sm animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
              {message.type === 'success' ? <CheckCircle size={20} className="mr-2"/> : <AlertCircle size={20} className="mr-2"/>}
              <span className="font-medium">{message.text}</span>
          </div>
      )}

      {/* Form */}
      <div className="bg-white rounded-xl shadow-lg border-t-4 border-purple-600 overflow-hidden">
        <div className="p-6 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
           <h3 className="font-bold text-gray-800 flex items-center">
             <Shield size={16} className="mr-2 text-purple-600"/> Security Credentials
           </h3>
           <button 
             type="button" 
             onClick={() => setShowPassword(!showPassword)}
             className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center"
           >
             {showPassword ? <><EyeOff size={16} className="mr-1"/> Hide Passwords</> : <><Eye size={16} className="mr-1"/> Show Passwords</>}
           </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Current Password</label>
                <input 
                    type={showPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                    placeholder="Enter your current password"
                    required
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">New Password</label>
                    <input 
                        type={showPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                        placeholder="Min 8 chars, 1 number, 1 special"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm New Password</label>
                    <input 
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all"
                        placeholder="Re-enter new password"
                        required
                    />
                </div>
            </div>
            
            <div className="pt-2 text-xs text-gray-500 bg-blue-50 p-3 rounded border border-blue-100">
                <strong>Requirement:</strong> Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one digit, and one special character.
            </div>

            <div className="pt-4 flex justify-end border-t border-gray-100 mt-4">
                <button 
                    type="submit" 
                    disabled={isLoading}
                    className={`px-8 py-3 bg-purple-900 text-white rounded-lg font-bold shadow-lg hover:bg-purple-950 transition-all flex items-center ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
                >
                    {isLoading ? 'Updating...' : <><Save size={18} className="mr-2"/> Update Password</>}
                </button>
            </div>
        </form>
      </div>
    </div>
  );
};
