
import React, { useState, useEffect } from 'react';
import { AuthService } from '../services/mockDataService';
import { User, UserRole } from '../types';
import { UserPlus, Trash2, Shield, Mail, Phone, Search, Users, ToggleLeft, ToggleRight, Eye, Calendar, Clock, Lock, CheckCircle, XCircle, X, FileSpreadsheet, FileText, RotateCcw } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Add Staff State
  const [isAddMode, setIsAddMode] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // View Profile State
  const [viewUser, setViewUser] = useState<User | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = () => {
    setUsers(AuthService.getAllUsers());
  };

  const handleAddStaff = async (e: React.FormEvent) => {
      e.preventDefault();
      const result = await AuthService.addStaff({
          name: newName,
          email: newEmail,
          mobile: newMobile,
          password: newPassword
      });

      if(result.success) {
          setSuccess(result.message);
          setError('');
          setIsAddMode(false);
          setNewName(''); setNewEmail(''); setNewMobile(''); setNewPassword('');
          loadUsers();
          setTimeout(() => setSuccess(''), 3000);
      } else {
          setError(result.message);
      }
  };

  const handleStatusToggle = async (id: string, currentStatus: 'Active' | 'Inactive') => {
      const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
      if(await AuthService.updateUserStatus(id, newStatus)) {
          loadUsers();
          setSuccess(`User ${newStatus === 'Active' ? 'Activated' : 'Deactivated'} Successfully`);
          setTimeout(() => setSuccess(''), 3000);
      } else {
          setError("Operation Failed. Cannot deactivate Main Admin.");
          setTimeout(() => setError(''), 3000);
      }
  };

  const handleDelete = async (id: string, role: UserRole) => {
      if(role === UserRole.ADMIN) {
          alert("Cannot delete Main Admin.");
          return;
      }
      if(window.confirm("Are you sure you want to permanently delete this staff member? This action cannot be undone.")) {
          await AuthService.deleteUser(id);
          loadUsers();
          setSuccess("Staff member deleted permanently.");
          setTimeout(() => setSuccess(''), 3000);
      }
  };

  const filteredUsers = users.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportExcel = () => {
    const dataToExport = filteredUsers.map((u, index) => ({
      "S.No": index + 1,
      "Name": u.name,
      "Email": u.email,
      "Role": u.role,
      "Mobile": u.mobile || 'N/A',
      "Status": u.status,
      "Joined Date": u.createdDate ? new Date(u.createdDate).toLocaleDateString() : 'N/A',
      "Last Login": u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Staff Users");
    XLSX.writeFile(wb, "Staff_Users_Report.xlsx");
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Staff Users Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
    doc.text(`Total Staff: ${filteredUsers.length}`, 14, 27);

    const tableColumn = ["S.No", "Name", "Email", "Role", "Status", "Joined", "Last Login"];
    const tableRows = filteredUsers.map((u, index) => [
      index + 1,
      u.name,
      u.email,
      u.role,
      u.status,
      u.createdDate ? new Date(u.createdDate).toLocaleDateString() : 'N/A',
      u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [22, 163, 74] },
      alternateRowStyles: { fillColor: [240, 253, 244] }
    });

    doc.save("Staff_Users_Report.pdf");
  };

  return (
    <div className="space-y-6">
      
      {/* 1. HEADER SECTION */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-gray-800 flex items-center">
              <Shield className="mr-3 text-agri-600" size={28} /> 
              Admin Control Panel
           </h2>
           <p className="text-gray-500 mt-1">Manage Staff Access, Activation & System Permissions</p>
        </div>
        <div className="flex gap-4">
             <div className="bg-blue-50 px-4 py-2 rounded-lg text-blue-700 text-sm font-semibold flex flex-col items-center">
                 <span className="text-xl font-bold">{users.filter(u => u.role !== UserRole.ADMIN).length}</span>
                 <span className="text-xs uppercase opacity-70">Total Staff</span>
             </div>
             <div className="bg-green-50 px-4 py-2 rounded-lg text-green-700 text-sm font-semibold flex flex-col items-center">
                 <span className="text-xl font-bold">{users.filter(u => u.status === 'Active' && u.role !== UserRole.ADMIN).length}</span>
                 <span className="text-xs uppercase opacity-70">Active</span>
             </div>
             <button 
                onClick={() => setIsAddMode(!isAddMode)} 
                className={`px-5 py-2 rounded-lg flex items-center shadow-md transition-colors font-medium ${isAddMode ? 'bg-gray-100 text-gray-700' : 'bg-agri-600 text-white hover:bg-agri-700'}`}
            >
                <UserPlus size={18} className="mr-2" /> {isAddMode ? 'Cancel' : 'Add New Staff'}
            </button>
        </div>
      </div>

      {/* 2. TOAST MESSAGES */}
      {(success || error) && (
          <div className={`p-4 rounded-lg shadow-sm border flex items-center animate-in slide-in-from-top-2 ${success ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
              {success ? <CheckCircle size={20} className="mr-2"/> : <XCircle size={20} className="mr-2"/>}
              <span className="font-medium">{success || error}</span>
          </div>
      )}

      {/* 3. ADD STAFF FORM */}
      {isAddMode && (
          <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-agri-500 animate-in fade-in slide-in-from-top-4">
              <h3 className="font-bold text-gray-800 mb-6 flex items-center text-lg">
                  <UserPlus className="mr-2 text-agri-500" size={20} /> Register New Staff Member
              </h3>
              
              <form onSubmit={handleAddStaff} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                      <input className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-agri-500 outline-none" placeholder="e.g. Rahul Sharma" value={newName} onChange={e => setNewName(e.target.value)} required />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                      <input className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-agri-500 outline-none" placeholder="e.g. rahul@example.com" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                      <input className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-agri-500 outline-none" placeholder="e.g. 9876543210" value={newMobile} onChange={e => setNewMobile(e.target.value)} required />
                  </div>
                  <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Initial Password</label>
                      <div className="relative">
                        <input className="w-full border border-gray-300 p-2.5 rounded-lg focus:ring-2 focus:ring-agri-500 outline-none" placeholder="Create strong password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                        <Lock className="absolute right-3 top-3 text-gray-400" size={16} />
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Requirements: Min 8 chars, 1 Upper, 1 Lower, 1 Digit, 1 Special.</p>
                  </div>
                  <div className="md:col-span-2 pt-2 border-t border-gray-100 flex justify-end gap-3">
                      <button type="button" onClick={() => setIsAddMode(false)} className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                      <button className="px-6 py-2.5 bg-agri-600 text-white rounded-lg hover:bg-agri-700 shadow-lg shadow-agri-500/30 font-medium">Create Account</button>
                  </div>
              </form>
          </div>
      )}

      {/* 4. STAFF ACTIVATION TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-5 border-b bg-gray-50 flex flex-col lg:flex-row justify-between items-center gap-4">
              <h3 className="font-bold text-gray-800 flex items-center text-lg">
                  <Users className="mr-2 text-gray-500" size={20} /> 
                  Staff Status / Activation Panel
              </h3>
              
              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto items-center">
                  {/* Search */}
                  <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-2.5 text-gray-400" size={18}/>
                      <input 
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-agri-500 outline-none" 
                        placeholder="Search by Name or Email..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)}
                      />
                  </div>
                  
                  {/* Exports */}
                  <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                      <button 
                        onClick={handleExportExcel}
                        className="flex items-center px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors text-sm font-bold shadow-sm"
                        title="Download Excel"
                      >
                         <FileSpreadsheet size={18} className="mr-2" /> Excel
                      </button>
                      <button 
                        onClick={handleExportPDF}
                        className="flex items-center px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-bold shadow-sm"
                        title="Download PDF"
                      >
                         <FileText size={18} className="mr-2" /> PDF
                      </button>
                  </div>
              </div>
          </div>
          
          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                  <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                          <th className="px-6 py-4 font-semibold">Staff Details</th>
                          <th className="px-6 py-4 font-semibold">Role</th>
                          <th className="px-6 py-4 font-semibold">Joined Date</th>
                          <th className="px-6 py-4 font-semibold">Account Status</th>
                          <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {filteredUsers.map(user => {
                          const isHighlighted = user.is_new === 1 || user.is_updated === 1;
                          const rowClass = isHighlighted 
                            ? 'bg-[#d4f8d4] hover:bg-green-100 transition-colors group'
                            : 'hover:bg-blue-50/30 transition-colors group';

                          return (
                          <tr key={user.id} className={rowClass}>
                              <td className="px-6 py-4">
                                  <div className="flex items-center">
                                      <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-lg mr-3 shadow-sm ${user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                                          {user.name.charAt(0)}
                                      </div>
                                      <div>
                                          <p className="font-bold text-gray-900">{user.name}</p>
                                          <p className="text-xs text-gray-500 flex items-center"><Mail size={10} className="mr-1"/> {user.email}</p>
                                      </div>
                                  </div>
                              </td>
                              <td className="px-6 py-4">
                                  {user.role === UserRole.ADMIN ? (
                                      <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-full uppercase tracking-wide">Administrator</span>
                                  ) : (
                                      <span className="px-3 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-full uppercase tracking-wide">Staff</span>
                                  )}
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-500">
                                  <div className="flex items-center">
                                      <Calendar size={14} className="mr-2 text-gray-400" />
                                      {user.createdDate ? new Date(user.createdDate).toLocaleDateString() : 'N/A'}
                                  </div>
                              </td>
                              <td className="px-6 py-4">
                                  {user.status === 'Active' ? (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                          <span className="w-2 h-2 mr-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                          Active
                                      </span>
                                  ) : (
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                          <span className="w-2 h-2 mr-1.5 bg-red-500 rounded-full"></span>
                                          Not Active
                                      </span>
                                  )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                      {user.role !== UserRole.ADMIN && (
                                          <button 
                                            onClick={() => handleStatusToggle(user.id, user.status)}
                                            className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                user.status === 'Active' 
                                                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' 
                                                : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200'
                                            }`}
                                            title={user.status === 'Active' ? 'Deactivate Account' : 'Activate Account'}
                                          >
                                              {user.status === 'Active' ? (
                                                  <> <ToggleRight size={18} className="mr-1" /> Deactivate </>
                                              ) : (
                                                  <> <ToggleLeft size={18} className="mr-1" /> Activate </>
                                              )}
                                          </button>
                                      )}
                                      
                                      <button 
                                        onClick={() => setViewUser(user)} 
                                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="View Profile"
                                      >
                                          <Eye size={18} />
                                      </button>
                                      
                                      {user.role !== UserRole.ADMIN && (
                                        <button 
                                            onClick={() => handleDelete(user.id, user.role)} 
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete Permanently"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                      )}
                                  </div>
                              </td>
                          </tr>
                          )
                      })}
                      {filteredUsers.length === 0 && (
                          <tr>
                              <td colSpan={5} className="text-center py-10 text-gray-400">
                                  No staff members found matching your search.
                              </td>
                          </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>

      {/* 6. VIEW PROFILE MODAL */}
      {viewUser && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                  <div className="bg-gradient-to-r from-agri-700 to-agri-900 p-6 text-white relative">
                      <button onClick={() => setViewUser(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-black/20 hover:bg-black/40 p-1 rounded-full transition-colors">
                          <X size={20} />
                      </button>
                      <div className="flex items-center gap-4">
                          <div className="h-16 w-16 bg-white text-agri-800 rounded-full flex items-center justify-center text-3xl font-bold shadow-lg">
                              {viewUser.name.charAt(0)}
                          </div>
                          <div>
                              <h3 className="text-xl font-bold">{viewUser.name}</h3>
                              <p className="text-agri-200 text-sm flex items-center"><Mail size={12} className="mr-1"/> {viewUser.email}</p>
                          </div>
                      </div>
                  </div>
                  
                  <div className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                          <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                              <p className="text-xs text-gray-500 uppercase font-bold mb-1">Account Role</p>
                              <p className="font-semibold text-gray-800">{viewUser.role}</p>
                          </div>
                          <div className={`p-3 rounded-lg border ${viewUser.status === 'Active' ? 'bg-green-50 border-green-100 text-green-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                              <p className="text-xs uppercase font-bold mb-1 opacity-70">Current Status</p>
                              <p className="font-bold flex items-center">
                                  {viewUser.status === 'Active' ? <CheckCircle size={16} className="mr-1"/> : <XCircle size={16} className="mr-1"/>}
                                  {viewUser.status || 'Active'}
                              </p>
                          </div>
                      </div>

                      <div className="space-y-3 pt-2">
                          <div className="flex items-center justify-between text-sm py-2 border-b border-gray-100">
                              <span className="text-gray-500 flex items-center"><Phone size={16} className="mr-2"/> Mobile</span>
                              <span className="font-medium text-gray-900">{viewUser.mobile}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm py-2 border-b border-gray-100">
                              <span className="text-gray-500 flex items-center"><Calendar size={16} className="mr-2"/> Joined Date</span>
                              <span className="font-medium text-gray-900">{viewUser.createdDate ? new Date(viewUser.createdDate).toLocaleDateString() : 'N/A'}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm py-2 border-b border-gray-100">
                              <span className="text-gray-500 flex items-center"><Clock size={16} className="mr-2"/> Last Login</span>
                              <span className="font-medium text-gray-900">{viewUser.lastLogin ? new Date(viewUser.lastLogin).toLocaleString() : 'Never'}</span>
                          </div>
                      </div>
                      
                      <div className="pt-4 flex gap-3">
                          {viewUser.role !== UserRole.ADMIN && (
                              <button 
                                onClick={async () => {
                                   const newP = prompt("Enter new password for " + viewUser.name);
                                   if(newP) {
                                       const res = await AuthService.resetPassword(viewUser.email, newP);
                                       alert(res.message);
                                   }
                                }}
                                className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold flex items-center justify-center"
                              >
                                  <RotateCcw size={16} className="mr-2"/> Reset Password
                              </button>
                          )}
                          <button onClick={() => setViewUser(null)} className="flex-1 py-2 bg-agri-600 hover:bg-agri-700 text-white rounded-lg text-sm font-bold">Close Profile</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
