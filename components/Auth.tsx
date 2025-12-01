

import React, { useState, useEffect, useRef } from 'react';
import { AuthService, DataService } from '../services/mockDataService';
import { User, UserRole, AttendanceRecord } from '../types';
import { KeyRound, Mail, User as UserIcon, Lock, ArrowRight, Info, CheckCircle, ArrowLeft, Camera, MapPin, Loader2, Navigation, Upload } from 'lucide-react';

interface AuthProps {
  onLogin: (user: User) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  // Views: login -> attendance -> forgot_email -> forgot_otp -> forgot_reset
  const [view, setView] = useState<'login' | 'attendance' | 'forgot_email' | 'forgot_otp' | 'forgot_reset'>('login');
  const [appLogo, setAppLogo] = useState<string>('/ryathu.jpg');
  
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

  // Load Logo
  useEffect(() => {
    const config = DataService.getAppConfig();
    setAppLogo(config.logo);
  }, []);

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

  // --- ATTENDANCE LOGIC (SIMPLIFIED) ---
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
    <div className="min-h-screen bg-gradient-to-br from-agri-50 to-agri-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header - Logo Image Replacement */}
        <div className="bg-white py-8 px-6 text-center flex justify-center items-center border-b border-gray-100 shadow-sm relative">
           <img 
             src={appLogo} 
             alt="Rythu Samachar - Admin & Staff Portal" 
             className="h-28 w-auto max-w-full object-contain drop-shadow-md hover:scale-105 transition-transform duration-500"
           />
        </div>

        {/* Content */}
        <div className="p-8 flex-1">
          
          {/* --- LOGIN VIEW --- */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">Sign In</h2>
              {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded border border-red-100 flex items-center"><Info size={16} className="mr-2"/>{error}</div>}
              
              <div className="relative">
                <UserIcon className="absolute left-3 top-3 text-gray-400" size={20} />
                <input 
                  type="email" 
                  placeholder="Email Address" 
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-agri-500 focus:outline-none"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  required
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
                <input 
                  type="password" 
                  placeholder="Password" 
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-agri-500 focus:outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="w-full bg-agri-600 text-white py-3 rounded-lg font-semibold hover:bg-agri-700 transition flex justify-center items-center group">
                Login <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
              </button>

              <div className="text-center mt-4">
                <button type="button" onClick={() => { setView('forgot_email'); setError(''); }} className="text-agri-600 hover:underline text-sm font-medium">Forgot Password?</button>
              </div>
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
                          <div className="relative w-full max-w-[250px] aspect-square rounded-xl overflow-hidden shadow-lg border-2 border-purple-200">
                              <img src={selfieFile} alt="Selfie Preview" className="w-full h-full object-cover" />
                              <button 
                                  onClick={() => setSelfieFile(null)}
                                  className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow-md hover:bg-red-700"
                                  title="Retake"
                              >
                                  <ArrowLeft size={16} />
                              </button>
                          </div>
                      ) : (
                          <div 
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full max-w-[250px] aspect-square bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors group"
                          >
                              <Camera size={48} className="text-gray-400 group-hover:text-purple-500 mb-2" />
                              <span className="text-sm font-semibold text-gray-500 group-hover:text-gray-700">Tap to Take Selfie</span>
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
                              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 shadow-lg flex items-center justify-center animate-in slide-in-from-bottom-2"
                          >
                              {isSubmitting ? (
                                  <><Loader2 size={20} className="animate-spin mr-2"/> Saving...</>
                              ) : (
                                  <><CheckCircle size={20} className="mr-2"/> Submit Attendance</>
                              )}
                          </button>
                      )}
                      
                      {!selfieFile && (
                          <button 
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 shadow-md flex items-center justify-center"
                          >
                              <Camera size={20} className="mr-2"/> Open Camera
                          </button>
                      )}
                  </div>
              </div>
          )}

          {/* --- FORGOT: EMAIL STEP --- */}
          {view === 'forgot_email' && (
            <form onSubmit={handleSendOtp} className="space-y-5">
               <h2 className="text-xl font-semibold text-gray-800">Reset Password</h2>
               <p className="text-gray-500 text-sm">Enter your registered email address. We will send you a 6-digit OTP.</p>
               {error && <div className="text-red-500 text-sm">{error}</div>}
               
               <input 
                 type="email" 
                 placeholder="Enter Email" 
                 className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-agri-500"
                 value={resetEmail}
                 onChange={e => setResetEmail(e.target.value)}
                 required 
               />
               <button type="submit" className="w-full bg-agri-600 text-white py-3 rounded-lg font-semibold hover:bg-agri-700">Send OTP</button>
               <button type="button" onClick={() => setView('login')} className="w-full text-center text-sm text-gray-500 mt-2 flex items-center justify-center">
                   <ArrowLeft size={16} className="mr-1"/> Back to Login
               </button>
            </form>
          )}

          {/* --- FORGOT: OTP STEP --- */}
          {view === 'forgot_otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
               <h2 className="text-xl font-semibold text-gray-800">Enter OTP</h2>
               
               {/* DEMO OTP DISPLAY */}
               {demoOtp && (
                   <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg text-center animate-in zoom-in">
                       <p className="text-xs text-yellow-700 font-bold uppercase mb-1">Demo Mode: Verification Code</p>
                       <p className="text-3xl font-mono font-bold text-gray-800 tracking-widest">{demoOtp}</p>
                       <p className="text-xs text-gray-400 mt-1">Valid for 3 minutes</p>
                   </div>
               )}

               <div className="bg-green-50 text-green-700 p-2 text-sm rounded flex items-center">
                   <CheckCircle size={16} className="mr-2"/> {resetMsg}
               </div>
               {error && <div className="text-red-500 text-sm">{error}</div>}
               
               <input 
                 type="text" 
                 placeholder="6-Digit OTP" 
                 maxLength={6}
                 className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-agri-500 text-center text-2xl tracking-widest"
                 value={otp}
                 onChange={e => setOtp(e.target.value.replace(/\D/g,''))}
                 required 
               />
               <button type="submit" className="w-full bg-agri-600 text-white py-3 rounded-lg font-semibold hover:bg-agri-700">Verify OTP</button>
               <button type="button" onClick={() => setView('login')} className="w-full text-center text-sm text-gray-500 mt-2">Cancel</button>
            </form>
          )}

          {/* --- FORGOT: RESET STEP --- */}
          {view === 'forgot_reset' && (
            <form onSubmit={handleResetPassword} className="space-y-5">
               <h2 className="text-xl font-semibold text-gray-800">Set New Password</h2>
               {error && <div className="text-red-500 text-sm">{error}</div>}
               
               <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
                   <strong>Rules:</strong> Min 8 chars, 1 Upper, 1 Lower, 1 Digit, 1 Special Char.
               </div>

               <div className="relative">
                <KeyRound className="absolute left-3 top-3 text-gray-400" size={20} />
                <input 
                  type="password" 
                  placeholder="New Password" 
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-agri-500 focus:outline-none"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required 
                />
               </div>
               <button type="submit" className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700">Update Password</button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};
