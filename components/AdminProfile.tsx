
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { AuthService } from '../services/mockDataService';
import { Save, User as UserIcon, Mail, Phone, Calendar, ShieldCheck, CheckCircle, AlertTriangle, Edit3, X } from 'lucide-react';

interface AdminProfileProps {
    user: User;
    onProfileUpdate: (updatedUser: User) => void;
}

export const AdminProfile: React.FC<AdminProfileProps> = ({ user, onProfileUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<User>(user);
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Basic Validation
        if (!formData.name || !formData.email || !formData.mobile) {
            setMsg({ type: 'error', text: 'Please fill in all required fields.' });
            return;
        }

        if (!/^\d{10}$/.test(formData.mobile)) {
             setMsg({ type: 'error', text: 'Mobile number must be 10 digits.' });
             return;
        }

        const result = AuthService.updateUserProfile(formData);
        if (result.success) {
            setMsg({ type: 'success', text: result.message });
            onProfileUpdate(formData); // Update App state
            setIsEditing(false);
            setTimeout(() => setMsg(null), 3000);
        } else {
            setMsg({ type: 'error', text: result.message });
        }
    };

    if (user.role !== UserRole.ADMIN) {
        return <div className="p-10 text-center text-red-500 font-bold">Access Denied. Admin Only.</div>;
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            
            {/* 1. Header Card */}
            <div className="bg-gradient-to-r from-corp-900 to-corp-700 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
                    <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-md p-1.5 shadow-lg border-2 border-white/30">
                        <div className="w-full h-full bg-white rounded-full flex items-center justify-center text-corp-900 font-bold text-4xl">
                            {user.name.charAt(0)}
                        </div>
                    </div>
                    <div className="text-center md:text-left flex-1">
                        <h1 className="text-3xl font-bold mb-1">{user.name}</h1>
                        <p className="text-blue-200 font-medium flex items-center justify-center md:justify-start gap-2">
                            <ShieldCheck size={16} /> Administrator Account
                        </p>
                        <p className="text-xs text-blue-300 mt-2 opacity-80">
                            Member since {user.createdDate ? new Date(user.createdDate).toLocaleDateString() : 'Unknown'}
                        </p>
                    </div>
                    <div>
                        {!isEditing && (
                             <button 
                                onClick={() => setIsEditing(true)}
                                className="px-6 py-2.5 bg-white text-corp-900 rounded-xl font-bold shadow-lg hover:bg-gray-50 transition-all flex items-center gap-2"
                             >
                                <Edit3 size={18} /> Edit Profile
                             </button>
                        )}
                    </div>
                </div>
                {/* Decoration */}
                <div className="absolute -right-10 -bottom-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
            </div>

            {/* 2. Feedback Message */}
            {msg && (
                <div className={`p-4 rounded-xl border flex items-center shadow-sm animate-in fade-in slide-in-from-top-2 ${msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                    {msg.type === 'success' ? <CheckCircle size={20} className="mr-2"/> : <AlertTriangle size={20} className="mr-2"/>}
                    <span className="font-medium">{msg.text}</span>
                </div>
            )}

            {/* 3. Details Form */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h2 className="text-lg font-bold text-gray-800">Personal Information</h2>
                    {isEditing && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded font-medium">Editing Mode</span>}
                </div>

                <form onSubmit={handleSave} className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Name */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <UserIcon size={16} /> Full Name
                            </label>
                            {isEditing ? (
                                <input 
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-gray-900"
                                />
                            ) : (
                                <p className="text-lg font-bold text-gray-800 py-2 border-b border-gray-100">{user.name}</p>
                            )}
                        </div>

                        {/* Email (Read Only usually, but editable here based on prompt) */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Mail size={16} /> Email Address
                            </label>
                            {isEditing ? (
                                <input 
                                    name="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-gray-900"
                                />
                            ) : (
                                <p className="text-lg font-bold text-gray-800 py-2 border-b border-gray-100">{user.email}</p>
                            )}
                        </div>

                        {/* Mobile */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Phone size={16} /> Mobile Number
                            </label>
                            {isEditing ? (
                                <input 
                                    name="mobile"
                                    value={formData.mobile}
                                    onChange={handleChange}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-gray-900"
                                    placeholder="10 digit number"
                                />
                            ) : (
                                <p className="text-lg font-bold text-gray-800 py-2 border-b border-gray-100">{user.mobile}</p>
                            )}
                        </div>

                        {/* Date of Birth */}
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                <Calendar size={16} /> Date of Birth
                            </label>
                            {isEditing ? (
                                <input 
                                    name="dob"
                                    type="date"
                                    value={formData.dob || ''}
                                    onChange={handleChange}
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-medium text-gray-900"
                                />
                            ) : (
                                <p className="text-lg font-bold text-gray-800 py-2 border-b border-gray-100">
                                    {user.dob ? new Date(user.dob).toLocaleDateString('en-IN', { dateStyle: 'long'}) : 'Not Set'}
                                </p>
                            )}
                        </div>
                    </div>

                    {isEditing && (
                        <div className="mt-10 pt-6 border-t border-gray-100 flex gap-4 justify-end">
                            <button 
                                type="button"
                                onClick={() => { setIsEditing(false); setFormData(user); }}
                                className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors flex items-center gap-2"
                            >
                                <X size={18} /> Cancel
                            </button>
                            <button 
                                type="submit"
                                className="px-8 py-3 bg-corp-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg shadow-gray-200 flex items-center gap-2"
                            >
                                <Save size={18} /> Save Changes
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};
