
import React, { useState, useRef } from 'react';
import { AuthService, DataService } from '../services/mockDataService';
import { User, UserRole, AttendanceRecord } from '../types';
import { KeyRound, Mail, User as UserIcon, Lock, ArrowRight, Info, CheckCircle, ArrowLeft, Camera, Loader2 } from 'lucide-react';
import { RythuLogo } from './RythuLogo';

interface AuthProps {
  onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  // Views: login -> attendance -> forgot_email -> forgot_otp -> forgot_reset
  const [view, setView] = useState<'login' | 'attendance' | 'forgot_email' | 'forgot_otp' | 'forgot_reset'>('login');
  
  // Login State
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [tempUser, setTempUser] = useState<User | null>(null);

  // Forgot PW State
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | null>(null);

  // Attendance State
  const [selfieFile, setSelfieFile] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = AuthService.login(loginId, password);
    if (result.success && result.user) {
        if (result.user.role === UserRole.ADMIN) {
            // Admins bypass attendance
            AuthService.updateUserLoginTime(result.user.id);
            onLogin(result.user);
        } else {
            // Staff must check attendance
            const hasMarked = await DataService.getTodayAttendance(result.user.id);
            if (hasMarked) {
                AuthService.updateUserLoginTime(result.user.id);
                onLogin(result.user);
            } else {
                // Redirect to Attendance Popup
                setTempUser(result.user);
                setView('attendance');
            }
        }
    } else {
      setError(result.message || 'Invalid Email or Password.');
    }
  };

  // --- ATTENDANCE LOGIC ---
  const handleSelfieUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              setSelfieFile(ev.target?.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const submitAttendance = async () => {
      if (!tempUser || !selfieFile) return;
      setIsSubmitting(true);

      // Best-effort location capture (Non-blocking)
      let locationData = { lat: 0, lng: 0, acc: 0, address: 'Location Not Available' };
      try {
          if (navigator.geolocation) {
              const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                  navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 }); // 3s timeout
              });
              locationData = {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                  acc: position.coords.accuracy,
                  address: `Lat: ${position.coords.latitude.toFixed(4)}, Lng: ${position.coords.longitude.toFixed(4)}`
              };
          }
      } catch (e) {
          console.warn("Location capture failed, proceeding without it.");
      }

      const record: AttendanceRecord = {
          id: `att_${Date.now()}`,
          userId: tempUser.id,
          userName: tempUser.name,
          date: new Date().toISOString().split('T')[0],
          timestamp: new Date().toISOString(), // Exact Login Time
          selfieUrl: selfieFile,
          latitude: locationData.lat,
          longitude: locationData.lng,
          accuracy: locationData.acc,
          address: locationData.address,
          deviceInfo: navigator.userAgent,
          browser: "Mobile/Web",
          jioTagStatus: locationData.acc > 0 && locationData.acc < 50 ? 'YES' : 'NO',
          mapUrl: `https://www.google.com/maps?q=${locationData.lat},${locationData.lng}`
      };

      await DataService.markAttendance(record);
      AuthService.updateUserLoginTime(tempUser.id);
      
      setIsSubmitting(false);
      // Proceed to Dashboard
      onLogin(tempUser);
  };
  // --- END ATTENDANCE LOGIC ---

  const handleSendOtp = (e: React.FormEvent) => {
      e.preventDefault();
      const result = AuthService.sendOtp(resetEmail);
      if(result.success && result.otp) {
          setDemoOtp(result.otp);
          setView('forgot_otp');
          setResetMsg('OTP Generated Successfully.');
          setError('');
      } else {
          setError(result.message || 'Email not found or inactive.');
      }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
      e.preventDefault();
      const isValid = AuthService.verifyOtp(resetEmail, otp);
      if(isValid) {
          setView('forgot_reset');
          setResetMsg('OTP Verified. Set new password.');
          setError('');
      } else {
          setError('Invalid or Expired OTP.');
      }
  };

  const handleResetPassword = (e: React.FormEvent) => {
      e.preventDefault();
      const result = AuthService.resetPassword(resetEmail, newPassword);
      if(result.success) {
          alert("Password Reset Successful. Please Login.");
          setView('login');
          setPassword('');
          setError('');
          setResetMsg('');
      } else {
          setError(result.message);
      }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-agri-50 to-agri-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white w-full max-w-[450px] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-white/50 relative">
        
        {/* Decorative Top Bar */}
        <div className="h-2 w-full bg-gradient-to-r from-agri-500 to-agri-700"></div>

        {/* Logo Section */}
        <div className="flex flex-col items-center justify-center pt-10 pb-4 px-8 bg-white">
           <div className="relative group w-full flex justify-center">
               <RythuLogo className="w-full max-w-[260px] h-auto transition-transform duration-500 hover:scale-105" />
           </div>
        </div>

        {/* Content Section */}
        <div className="px-8 pb-10 pt-2 flex-1">
          
          {/* --- LOGIN VIEW --- */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-gray-800">Welcome Back</h2>
                  <p className="text-sm text-gray-500">Please sign in to access the portal</p>
              </div>

              {error && (
                  <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center shadow-sm">
                      <Info size={16} className="mr-2 flex-shrink-0"/>{error}
                  </div>
              )}
              
              <div className="space-y-4">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-agri-600 transition-colors">
                        <UserIcon size={20} />
                    </div>
                    <input 
                      type="email" 
                      placeholder="Email Address" 
                      className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-agri-500 focus:border-transparent outline-none transition-all font-medium text-gray-700"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      required
                    />
                  </div>

                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-agri-600 transition-colors">
                        <Lock size={20} />
                    </div>
                    <input 
                      type="password" 
                      placeholder="Password" 
                      className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-agri-500 focus:border-transparent outline-none transition-all font-medium text-gray-700"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
              </div>

              <div className="text-right">
                <button type="button" onClick={() => { setView('forgot_email'); setError(''); }} className="text-agri-600 hover:text-agri-700 hover:underline text-sm font-semibold transition-colors">Forgot Password?</button>
              </div>

              <button type="submit" className="w-full bg-gradient-to-r from-agri-600 to-agri-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-agri-600/30 hover:shadow-agri-600/50 hover:scale-[1.01] transition-all flex justify-center items-center group">
                Sign In <ArrowRight size={20} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          )}
          
          {/* --- ATTENDANCE POPUP VIEW --- */}
          {view === 'attendance' && (
              <div className="space-y-6 text-center animate-in fade-in zoom-in duration-300">
                  <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl">
                      <h2 className="text-xl font-bold text-gray-800 flex items-center justify-center mb-2">
                          <Camera className="mr-2 text-purple-600" /> Mark Attendance
                      </h2>
                      <p className="text-sm text-gray-600">Welcome, <strong>{tempUser?.name}</strong>!</p>
                      <p className="text-xs text-gray-500 mt-1">Please upload a selfie to confirm your login time.</p>
                  </div>
                  
                  <div className="flex flex-col items-center gap-4">
                      {selfieFile ? (
                          <div className="relative w-full max-w-[250px] aspect-square rounded-xl overflow-hidden shadow-lg border-2 border-purple-200 group">
                              <img src={selfieFile} alt="Selfie Preview" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
                              <button 
                                  onClick={() => setSelfieFile(null)}
                                  className="absolute top-2 right-2 bg-white/90 text-red-600 p-2 rounded-full shadow-md hover:bg-white transition-all"
                                  title="Retake"
                              >
                                  <ArrowLeft size={20} />
                              </button>
                          </div>
                      ) : (
                          <div 
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full max-w-[250px] aspect-square bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:bg-purple-50 hover:border-purple-300 transition-all group"
                          >
                              <div className="p-4 bg-white rounded-full shadow-sm mb-3 group-hover:scale-110 transition-transform">
                                <Camera size={32} className="text-gray-400 group-hover:text-purple-600" />
                              </div>
                              <span className="text-sm font-bold text-gray-500 group-hover:text-purple-700">Tap to Take Selfie</span>
                          </div>
                      )}
                      
                      {/* Hidden File Input: Capture=user forces camera on mobile */}
                      <input 
                          type="file" 
                          accept="image/*" 
                          capture="user" 
                          ref={fileInputRef} 
                          onChange={handleSelfieUpload} 
                          className="hidden" 
                      />

                      {selfieFile && (
                          <button 
                              onClick={submitAttendance}
                              disabled={isSubmitting}
                              className="w-full bg-green-600 text-white py-3.5 rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-500/30 flex items-center justify-center animate-in slide-in-from-bottom-2 transition-all"
                          >
                              {isSubmitting ? (
                                  <><Loader2 size={20} className="animate-spin mr-2"/> Verifying...</>
                              ) : (
                                  <><CheckCircle size={20} className="mr-2"/> Confirm & Login</>
                              )}
                          </button>
                      )}
                      
                      {!selfieFile && (
                          <button 
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full bg-purple-600 text-white py-3.5 rounded-xl font-bold hover:bg-purple-700 shadow-lg shadow-purple-500/30 flex items-center justify-center transition-all"
                          >
                              <Camera size={20} className="mr-2"/> Open Camera
                          </button>
                      )}
                  </div>
              </div>
          )}

          {/* --- FORGOT: EMAIL STEP --- */}
          {view === 'forgot_email' && (
            <form onSubmit={handleSendOtp} className="space-y-5 animate-in fade-in slide-in-from-right-4">
               <div className="text-center mb-4">
                   <h2 className="text-xl font-bold text-gray-800">Reset Password</h2>
                   <p className="text-sm text-gray-500">Enter your registered email to receive OTP</p>
               </div>
               
               {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{error}</div>}
               
               <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-agri-600 transition-colors">
                        <Mail size={20} />
                    </div>
                   <input 
                     type="email" 
                     placeholder="Enter Email Address" 
                     className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-agri-500 outline-none transition-all"
                     value={resetEmail}
                     onChange={e => setResetEmail(e.target.value)}
                     required 
                   />
               </div>
               <button type="submit" className="w-full bg-agri-600 text-white py-3.5 rounded-xl font-bold hover:bg-agri-700 shadow-lg transition-all">Send OTP</button>
               <button type="button" onClick={() => setView('login')} className="w-full text-center text-sm text-gray-500 mt-2 flex items-center justify-center hover:text-gray-700 font-medium">
                   <ArrowLeft size={16} className="mr-1"/> Back to Login
               </button>
            </form>
          )}

          {/* --- FORGOT: OTP STEP --- */}
          {view === 'forgot_otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5 animate-in fade-in slide-in-from-right-4">
               <div className="text-center mb-4">
                   <h2 className="text-xl font-bold text-gray-800">Verify OTP</h2>
                   <p className="text-sm text-gray-500">Enter the 6-digit code sent to your email</p>
               </div>
               
               {/* DEMO OTP DISPLAY */}
               {demoOtp && (
                   <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl text-center animate-in zoom-in">
                       <p className="text-xs text-yellow-700 font-bold uppercase mb-1">Demo Mode Code</p>
                       <p className="text-3xl font-mono font-black text-gray-800 tracking-[0.2em]">{demoOtp}</p>
                       <p className="text-[10px] text-gray-400 mt-1">Expires in 3 minutes</p>
                   </div>
               )}

               <div className="bg-green-50 text-green-700 p-3 text-sm rounded-lg flex items-center justify-center font-medium">
                   <CheckCircle size={16} className="mr-2"/> {resetMsg}
               </div>
               {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{error}</div>}
               
               <input 
                 type="text" 
                 placeholder="------" 
                 maxLength={6}
                 className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-agri-500 focus:ring-0 outline-none text-center text-3xl font-bold tracking-[0.5em] text-gray-700 transition-all"
                 value={otp}
                 onChange={e => setOtp(e.target.value.replace(/\D/g,''))}
                 required 
                 autoFocus
               />
               <button type="submit" className="w-full bg-agri-600 text-white py-3.5 rounded-xl font-bold hover:bg-agri-700 shadow-lg transition-all">Verify & Proceed</button>
               <button type="button" onClick={() => setView('login')} className="w-full text-center text-sm text-gray-500 hover:text-gray-700 font-medium">Cancel</button>
            </form>
          )}

          {/* --- FORGOT: RESET STEP --- */}
          {view === 'forgot_reset' && (
            <form onSubmit={handleResetPassword} className="space-y-5 animate-in fade-in slide-in-from-right-4">
               <div className="text-center mb-4">
                   <h2 className="text-xl font-bold text-gray-800">New Password</h2>
                   <p className="text-sm text-gray-500">Create a strong password for your account</p>
               </div>

               {error && <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">{error}</div>}
               
               <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-100">
                   <strong className="text-gray-700">Requirements:</strong> Min 8 chars, 1 Uppercase, 1 Lowercase, 1 Number, 1 Special Character.
               </div>

               <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-agri-600 transition-colors">
                    <KeyRound size={20} />
                </div>
                <input 
                  type="password" 
                  placeholder="Enter New Password" 
                  className="w-full pl-10 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-agri-500 outline-none transition-all font-medium"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required 
                />
               </div>
               <button type="submit" className="w-full bg-green-600 text-white py-3.5 rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-500/30 transition-all flex justify-center items-center">
                   <CheckCircle size={20} className="mr-2"/> Update Password
               </button>
            </form>
          )}

        </div>
      </div>
      
      {/* Footer Branding */}
      <div className="fixed bottom-4 text-center w-full text-agri-900/40 text-xs font-semibold">
          © {new Date().getFullYear()} Rythu Samachar Portal • Secure Access
      </div>
    </div>
  );
};
