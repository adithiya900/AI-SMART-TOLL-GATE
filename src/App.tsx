import React, { useState, useEffect, useRef, useCallback, type FormEvent } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, loginAnonymously } from './lib/firebase';
import Webcam from 'react-webcam';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, RotateCcw, CheckCircle2, XCircle, History, ShieldCheck, Car, LogOut, LogIn, Database, ArrowRight, UserCheck, Plus, Search, RefreshCw, Power, ShieldAlert, Trash2, Upload, Image as ImageIcon, Scan, AlertCircle, Download, FileText } from 'lucide-react';
import type { User } from 'firebase/auth';
import { recognizeLicensePlate } from './services/geminiService';
import type { Transaction, Vehicle } from './types';
import { cn, normalizePlate } from './lib/utils';
import { TOLL_RATES, processToll, subscribeToAllVehicles, subscribeToTransactions, addVehicle, updateVehicleStatus, deleteVehicle, seedTestData, clearAllTransactions } from './services/tollService';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualPlate, setManualPlate] = useState('');
  const [manualVehicleType, setManualVehicleType] = useState<Vehicle['vehicleType']>('car');
  const [lastResult, setLastResult] = useState<Transaction | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [dataMode, setDataMode] = useState<'cloud' | 'local'>('cloud');
  
  // Memoize filtered vehicles to prevent expensive re-renders
  const filteredVehicles = React.useMemo(() => {
    return vehicles.filter(v => 
      v.plateNumber.toLowerCase().includes(searchQuery.toLowerCase()) || 
      v.ownerName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [vehicles, searchQuery]);

  const [newVehicle, setNewVehicle] = useState<Omit<Vehicle, 'createdAt'> & { vehicleType: Vehicle['vehicleType']; status: Vehicle['status'] }>({
    plateNumber: '',
    ownerName: '',
    vehicleType: 'car',
    balance: 500,
    status: 'active'
  });
  const [camReady, setCamReady] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [recognitionResult, setRecognitionResult] = useState<any>(null);
  const [processStatus, setProcessStatus] = useState('');
  const [showDetectionSuccess, setShowDetectionSuccess] = useState(false);
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Instantly resets all result/processing state so the next operation starts clean
  const resetState = useCallback(() => {
    setIsProcessing(false);
    setProcessStatus('');
    setRecognitionResult(null);
    setLastResult(null);
    setSelectedImage(null);
  }, []);

  useEffect(() => {
    let loadingTimeout: NodeJS.Timeout | null = null;
    
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        setUser(null);
      }
    });

    setLoading(true);
    
    const unsubVehicles = subscribeToAllVehicles((data, mode) => {
      setVehicles(data);
      setDataMode(mode);
      setLoading(false);
      if (loadingTimeout) clearTimeout(loadingTimeout);
    });
    
    const unsubTransactions = subscribeToTransactions((data, mode) => {
      setHistory(data);
      setDataMode(mode);
    });

    // Ensure loading completes within 3 seconds
    loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => {
      unsubAuth();
      unsubVehicles();
      unsubTransactions();
      if (loadingTimeout) clearTimeout(loadingTimeout);
    };
  }, []);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      await loginAnonymously();
    } catch (error) {
      console.warn("Firebase Auth failed, entering Local Mode:", error);
      // Set a mock user so the app still opens
      setUser({
        displayName: 'Operator (Local Mode)',
        email: loginEmail || 'local@smarttoll.ai'
      } as any);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAddVehicle = async (e: FormEvent) => {
    e.preventDefault();
    try {
      // Normalize before submission to ensure database consistency
      const normalizedPlate = normalizePlate(newVehicle.plateNumber);
      if (!normalizedPlate) {
        alert("Please enter a valid license plate number.");
        return;
      }

      await addVehicle({
        ...newVehicle,
        plateNumber: normalizedPlate
      });
      
      setShowAddForm(false);
      setNewVehicle({
        plateNumber: '',
        ownerName: '',
        vehicleType: 'car',
        balance: 500,
        status: 'active'
      });
    } catch (error) {
      console.error("Add vehicle error:", error);
      alert("Failed to add vehicle. Check console.");
    }
  };

  const toggleStatus = async (plateNumber: string, status: Vehicle['status']) => {
    try {
      await updateVehicleStatus(plateNumber, status === 'active' ? 'suspended' : 'active');
    } catch (error) {
      console.error("Toggle status error:", error);
    }
  };

  const handleDeleteVehicle = async (plateNumber: string) => {
    try {
      await deleteVehicle(plateNumber);
    } catch (error) {
      console.error("Delete vehicle error:", error);
    }
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const result = await seedTestData();
      const modeText = result.mode === 'cloud' ? 'Cloud Database' : 'Local Storage';
      const errorText = result.errors ? `\n\nNote: Some issues occurred:\n${result.errors.join('\n')}` : '';
      
      alert(`✅ Successfully seeded ${result.count} test vehicles into ${modeText}!${errorText}`);
      setDataMode(result.mode);
    } catch (error: any) {
      console.error("Seed error:", error);
      alert(`❌ Seeding failed:\n\n${error.message}\n\nCheck browser console for details.`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleClearHistory = async () => {
    if (window.confirm("Are you sure you want to clear all transaction history?")) {
      try {
        await clearAllTransactions();
      } catch (error) {
        console.error("Clear history error:", error);
      }
    }
  };

  const handleQuickRegister = () => {
    if (recognitionResult?.plateNumber) {
      setNewVehicle({
        ...newVehicle,
        plateNumber: recognitionResult.plateNumber,
        vehicleType: recognitionResult.vehicleType || 'car'
      });
      setShowAddForm(true);
      // Scroll to registry
      document.getElementById('registry-section')?.scrollIntoView({ behavior: 'smooth' });
    }
  };



  const compressImage = async (base64: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // Lower resolution for speed
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.5)); // Lower quality for faster upload
      };
    });
  };


  const processImage = useCallback(async (imageSrc: string) => {
    setIsProcessing(true);
    setRecognitionResult(null);
    setLastResult(null); // Clear previous transaction result
    setProcessStatus('Optimizing image...');
    
    try {
      const compressedImage = await compressImage(imageSrc);
      setSelectedImage(compressedImage);
      setProcessStatus('Uploading to AI Engine...');
      
      const recognition = await recognizeLicensePlate(compressedImage);
      
      if (recognition.error && !recognition.plateNumber) {
        setRecognitionResult({ error: recognition.error });
        return;
      }
      
      // Show "Successfully Detected" banner immediately
      setProcessStatus('Successfully Detected');
      setShowDetectionSuccess(true);
      
      // Brief pause to let user see the success state
      await new Promise(resolve => setTimeout(resolve, 1800));
      setShowDetectionSuccess(false);
      
      setProcessStatus('Finalizing result...');
      
      setRecognitionResult(recognition);

      if (!recognition.plateNumber) {
        return;
      }

      const transaction = await processToll(recognition.plateNumber, recognition.vehicleType);
      setLastResult(transaction);
    } catch (error: any) {
      console.error(error);
      setRecognitionResult({ error: error.message || 'Processing failed' });
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
    }
  }, []);

  const handleManualProcess = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!manualPlate) return;
    
    // Immediately close the manual panel and clear old results
    setIsManualMode(false);
    setIsProcessing(true);
    setRecognitionResult(null);
    setLastResult(null);
    setSelectedImage(null);
    setProcessStatus('Processing manual entry...');
    
    try {
      // Create a mock recognition result for the UI
      const mockRecognition = {
        plateNumber: manualPlate.toUpperCase(),
        vehicleType: manualVehicleType,
        confidence: 1.0,
        processingTime: '0.0s (Manual)'
      };
      
      setRecognitionResult(mockRecognition);
      const transaction = await processToll(mockRecognition.plateNumber, mockRecognition.vehicleType);
      setLastResult(transaction);
      setManualPlate('');
    } catch (error: any) {
      console.error(error);
      setRecognitionResult({ error: error.message || 'Manual processing failed' });
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
    }
  }, [manualPlate, manualVehicleType]);

  const capture = useCallback(async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;
    processImage(imageSrc);
  }, [processImage]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        processImage(reader.result as string);
        // Clear input so same file can be uploaded again
        if (e.target) e.target.value = '';
      };
      reader.readAsDataURL(file);
    }
  }, [processImage]);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);
  const [isInput, setIsInput] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isClickable = target.tagName === 'BUTTON' || target.tagName === 'A' || target.closest('button');
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      
      setIsHovering(!!isClickable);
      setIsInput(isInputField);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseover', handleMouseOver);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseover', handleMouseOver);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-dark-800 to-dark-900 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-24 h-24 border-4 border-gold-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  // Render helper for the cursor (needed for both login and main page)
  const renderCursor = () => (
    <>
      <motion.div 
        className="fixed top-0 left-0 w-6 h-6 border-2 border-gold-500 rounded-full pointer-events-none z-[9999] hidden md:block"
        animate={{ 
          x: mousePos.x - 12, 
          y: mousePos.y - 12,
          scale: isInput ? 0.5 : (isHovering ? 2.5 : 1),
          borderRadius: isInput ? '2px' : '50%',
          width: isInput ? '2px' : '24px',
          height: isInput ? '24px' : '24px',
          borderWidth: isInput ? '0px' : '2px',
          backgroundColor: isInput ? '#FFC107' : (isHovering ? 'rgba(212, 175, 55, 0.2)' : 'rgba(212, 175, 55, 0)')
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 250, mass: 0.5 }}
      />
      <motion.div 
        className="fixed top-0 left-0 w-1.5 h-1.5 bg-gold-500 rounded-full pointer-events-none z-[9999] hidden md:block"
        animate={{ 
          x: mousePos.x - 3, 
          y: mousePos.y - 3,
          scale: (isHovering || isInput) ? 0 : 1
        }}
        transition={{ type: 'spring', damping: 20, stiffness: 300, mass: 0.2 }}
      />
    </>
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center p-6 relative overflow-hidden selection:bg-gold-500/30 selection:text-gold-100">
        {renderCursor()}
        {/* Animated Background */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.15),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(230,184,0,0.15),transparent_50%)]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gold-500/10 rounded-full blur-[120px] pointer-events-none" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-md relative z-10"
        >
          <div className="bg-dark-800/50 backdrop-blur-2xl border border-white/10 rounded-3xl p-10 shadow-2xl relative overflow-hidden">
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-500 via-gold-400 to-gold-500" />
            
            <div className="text-center mb-10">
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="w-20 h-20 bg-gradient-to-br from-gold-500 to-gold-600 rounded-2xl flex items-center justify-center shadow-xl shadow-gold-500/50 mx-auto mb-6 border border-gold-400/30"
              >
                <Car className="w-10 h-10 text-black" />
              </motion.div>
              <h1 className="text-3xl font-black bg-gradient-to-r from-gold-400 to-gold-300 bg-clip-text text-transparent tracking-tight mb-2">
                SmartToll AI
              </h1>
              <p className="text-sm font-mono uppercase tracking-widest text-gold-200/60">Authorized Personnel Only</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-xs font-mono uppercase tracking-widest text-gold-200/60 mb-2">Operator Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Database className="w-5 h-5 text-gold-200/40" />
                  </div>
                  <input 
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full bg-dark-900/50 border border-gold-500/30 text-gold-300 pl-12 pr-4 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all placeholder:text-gold-200/30 font-mono"
                    placeholder="operator@smarttoll.ai"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-widest text-gold-200/60 mb-2">Access Key</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <ShieldCheck className="w-5 h-5 text-gold-200/40" />
                  </div>
                  <input 
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full bg-dark-900/50 border border-gold-500/30 text-gold-300 pl-12 pr-4 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all placeholder:text-gold-200/30 font-mono"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={loginLoading}
                className="w-full bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-400 hover:to-gold-500 text-black py-4 rounded-xl font-bold font-mono uppercase tracking-widest shadow-[0_0_20px_rgba(255,193,7,0.3)] transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed mt-8 border border-gold-400"
              >
                {loginLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Secure Login
                  </>
                )}
              </motion.button>
            </form>
          </div>
          
          <p className="text-center text-xs font-mono uppercase tracking-widest text-gold-200/40 mt-8">
            System version 2.4.0 • Gemini Vision AI
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 text-white selection:bg-gold-500/30 selection:text-gold-100">
      {renderCursor()}
      {/* Header */}
      <header className="backdrop-blur-xl bg-dark-900/90 border-b border-gold-500/20 shadow-sm sticky top-0 z-50 supports-[backdrop-filter:blur(20px)]:bg-dark-900/80">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-gold-500 to-gold-600 rounded-2xl flex items-center justify-center shadow-xl shadow-gold-500/50">
              <Car className="w-7 h-7 text-black" />
            </div>
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-r from-gold-400 via-gold-300 to-gold-500 bg-clip-text text-transparent tracking-tight">
                SmartToll AI
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-xs font-mono uppercase tracking-widest opacity-60">License Plate Recognition</p>
                <div className={cn(
                  "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-tighter border",
                  dataMode === 'cloud' 
                    ? "bg-gold-500/10 text-gold-400 border-gold-500/20" 
                    : "bg-gold-500/10 text-gold-400 border-gold-500/20"
                )}>
                  {dataMode} Mode
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSeed}
              disabled={isSeeding}
              className="px-6 py-2.5 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-black text-sm font-mono uppercase tracking-widest rounded-xl shadow-lg hover:shadow-gold-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-gold-400"
            >
              {isSeeding ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Seeding...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  Seed Data
                </>
              )}
            </motion.button>

            <div className="w-px h-8 bg-gold-500/20" />

            <div className="flex items-center gap-3">
              <div className="text-right hidden md:block">
                <p className="text-sm font-bold capitalize">{user?.displayName || 'Operator'}</p>
                <p className="text-xs opacity-60 font-mono">{user?.email || 'demo@smarttoll.ai'}</p>
              </div>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setUser(null)}
                className="w-12 h-12 border-2 border-gold-500/50 rounded-2xl flex items-center justify-center hover:bg-red-900 hover:border-red-500 text-gold-400 hover:text-red-300 shadow-sm hover:shadow-md transition-all"
              >
                <LogOut className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Stats */}
      <div className="max-w-7xl mx-auto px-6 mt-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-dark-800/70 backdrop-blur-xl p-6 rounded-3xl border border-gold-500/20 shadow-lg group hover:shadow-gold-500/50 transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-mono uppercase tracking-widest text-gold-200/60">Total Revenue</p>
              <div className="px-2 py-1 bg-gold-500/20 text-gold-300 text-[10px] font-bold rounded-lg uppercase tracking-tight">
                {history.filter(t => t.status === 'approved').length} Entries
              </div>
            </div>
            <h4 className="text-4xl font-black text-gold-400 font-mono mb-4">
              ₹{history.filter(t => t.status === 'approved').reduce((acc, t) => acc + t.amount, 0)}
            </h4>
            
            <div className="space-y-2 pt-4 border-t border-dark-600">
              {['car', 'truck', 'bus', 'motorcycle'].map(type => {
                const typeRevenue = history
                  .filter(t => t.status === 'approved' && t.vehicleType === type)
                  .reduce((acc, t) => acc + t.amount, 0);
                if (typeRevenue === 0) return null;
                return (
                  <div key={type} className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-gold-200/60">
                    <span>{type}s</span>
                    <span className="font-bold text-gold-300">₹{typeRevenue}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-dark-800/70 backdrop-blur-xl p-6 rounded-3xl border border-gold-500/20 shadow-lg hover:shadow-gold-500/20 transition-all"
          >
            <p className="text-xs font-mono uppercase tracking-widest text-gold-200/60 mb-1">Total Traffic</p>
            <h4 className="text-3xl font-black text-gold-100 font-mono">{history.length}</h4>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-dark-800/70 backdrop-blur-xl p-6 rounded-3xl border border-gold-500/20 shadow-lg hover:shadow-gold-500/20 transition-all"
          >
            <p className="text-xs font-mono uppercase tracking-widest text-gold-200/60 mb-1">Active Vehicles</p>
            <h4 className="text-3xl font-black text-gold-400 font-mono">{vehicles.filter(v => v.status === 'active').length}</h4>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-dark-800/70 backdrop-blur-xl p-6 rounded-3xl border border-gold-500/20 shadow-lg hover:shadow-gold-500/20 transition-all"
          >
            <p className="text-xs font-mono uppercase tracking-widest text-gold-200/60 mb-1">Last Sync</p>
            <h4 className="text-lg font-bold text-gold-200 font-mono mt-2">{new Date().toLocaleTimeString()}</h4>
          </motion.div>
        </div>
      </div>


      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 2xl:grid-cols-4 gap-8">
          {/* Main Camera & Results */}
          <div className="2xl:col-span-3 space-y-8">
            {/* Camera */}
            <motion.section 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-dark-800/70 backdrop-blur-xl rounded-3xl border border-gold-500/20 shadow-2xl overflow-hidden"
            >
              <div className="bg-gradient-to-r from-dark-900 to-dark-800/80 px-8 py-6 border-b border-gold-500/20">
                <h2 className="text-2xl font-black text-gold-400 flex items-center gap-4">
                  <Camera className="w-8 h-8" />
                  Live Detection
                </h2>
                <p className="text-gold-200/60 text-sm font-mono uppercase tracking-widest opacity-80">Real-time license plate recognition</p>
              </div>

              <div className="p-8 relative">
                <div className="aspect-video bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-white/10 relative">
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    onUserMedia={() => setCamReady(true)}
                    className="w-full h-full object-cover"
                    videoConstraints={{
                      width: { ideal: 1920 },
                      height: { ideal: 1080 },
                      facingMode: 'environment'
                    }}
                  />
                  
                  {selectedImage && (
                    <div className="absolute inset-0 z-10 bg-dark-900">
                      <img src={selectedImage} alt="Captured" className="w-full h-full object-contain" />
                      {recognitionResult?.boundingBox && (
                        <div 
                          className="absolute border-4 border-gold-400 shadow-[0_0_20px_rgba(255,193,7,0.8)] rounded-sm pointer-events-none transition-all duration-500"
                          style={{
                            top: `${recognitionResult.boundingBox.ymin / 10}%`,
                            left: `${recognitionResult.boundingBox.xmin / 10}%`,
                            width: `${(recognitionResult.boundingBox.xmax - recognitionResult.boundingBox.xmin) / 10}%`,
                            height: `${(recognitionResult.boundingBox.ymax - recognitionResult.boundingBox.ymin) / 10}%`,
                          }}
                        >
                          <div className="absolute -top-8 left-0 bg-gold-500 text-black text-[10px] px-2 py-0.5 rounded-t-sm font-bold uppercase tracking-tighter whitespace-nowrap">
                            Number Plate Detected
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Scan overlay */}
                  {!selectedImage && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-1/4 left-1/4 right-1/4 bottom-1/4 border-4 border-gold-400/30 rounded-2xl" />
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,193,7,0.05)0%,transparent_60%)] animate-pulse" />
                      <div className="absolute top-0 left-0 w-full h-1 bg-gold-400/50 blur-sm animate-[scan_2s_ease-in-out_infinite]" />
                    </div>
                  )}

                  {isProcessing && (
                    <div className="absolute inset-0 bg-dark-900/80 flex flex-col items-center justify-center z-20 text-white backdrop-blur-sm">
                      <AnimatePresence mode="wait">
                        {showDetectionSuccess ? (
                          <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.2 }}
                            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                            className="flex flex-col items-center"
                          >
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.1 }}
                              className="w-28 h-28 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,0.6)] mb-8"
                            >
                              <CheckCircle2 className="w-14 h-14 text-white" />
                            </motion.div>
                            <motion.h3
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.3 }}
                              className="text-4xl font-black uppercase tracking-[0.15em] text-emerald-400 mb-3"
                            >
                              Successfully Detected
                            </motion.h3>
                            <motion.p
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.5 }}
                              className="text-sm font-mono text-emerald-300/70 uppercase tracking-widest"
                            >
                              Vehicle identified • Processing toll
                            </motion.p>
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: '200px' }}
                              transition={{ duration: 1.5, ease: 'easeInOut', delay: 0.2 }}
                              className="h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent rounded-full mt-6"
                            />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="processing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center"
                          >
                            <motion.div 
                              className="relative w-32 h-32"
                            >
                              <div className="absolute inset-0 border-4 border-gold-400/20 rounded-full" />
                              <motion.div 
                                className="absolute inset-0 border-4 border-gold-400 border-t-transparent rounded-full"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              />
                              <div className="absolute inset-4 bg-gold-500/10 rounded-full flex items-center justify-center">
                                <Scan className="w-10 h-10 text-gold-400 animate-pulse" />
                              </div>
                            </motion.div>
                            <div className="text-center mt-10">
                              <h3 className="text-3xl font-black uppercase tracking-[0.2em] mb-4 bg-gradient-to-r from-gold-400 to-gold-300 bg-clip-text text-transparent">
                                {processStatus}
                              </h3>
                              <div className="flex items-center justify-center gap-4 text-sm font-mono opacity-70">
                                <span className="flex items-center gap-2">
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  AI Turbo Engine
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {isManualMode && (
                    <div className="absolute inset-0 bg-dark-900/95 flex flex-col items-center justify-center z-30 text-white p-8 rounded-3xl backdrop-blur-md border border-gold-500/20">
                      <div className="w-full max-w-sm space-y-8">
                        <div className="text-center">
                          <h3 className="text-2xl font-black uppercase tracking-widest text-gold-400 mb-2">Manual Toll Entry</h3>
                          <p className="text-xs font-mono opacity-60 uppercase tracking-widest">Enter vehicle details manually</p>
                        </div>
                        
                        <form onSubmit={handleManualProcess} className="space-y-6">
                          <div>
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-gold-200/60 mb-2">License Plate</label>
                            <input 
                              type="text"
                              required
                              autoFocus
                              value={manualPlate}
                              onChange={(e) => setManualPlate(e.target.value.toUpperCase())}
                              placeholder="E.G. TN 43 AB 1234"
                              className="w-full bg-dark-900/50 border border-gold-500/30 text-gold-300 px-6 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500 font-mono text-xl tracking-[0.2em] text-center"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-mono uppercase tracking-widest text-gold-200/60 mb-2">Vehicle Category</label>
                            <div className="grid grid-cols-2 gap-3">
                              {['car', 'motorcycle', 'truck', 'bus'].map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setManualVehicleType(type as any)}
                                  className={cn(
                                    "py-3 rounded-xl border font-mono text-[10px] uppercase tracking-widest transition-all",
                                    manualVehicleType === type 
                                      ? "bg-gold-500 border-gold-400 text-black shadow-[0_0_15px_rgba(255,193,7,0.3)]"
                                      : "bg-white/5 border-white/10 text-gold-200/60 hover:bg-white/10"
                                  )}
                                >
                                  {type}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex gap-4 pt-4">
                            <button
                              type="button"
                              onClick={() => setIsManualMode(false)}
                              className="flex-1 py-4 rounded-xl border border-white/10 text-gold-200/60 font-mono uppercase text-xs tracking-widest hover:bg-white/5 transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="flex-2 bg-gold-500 hover:bg-gold-600 text-black px-8 py-4 rounded-xl font-mono uppercase text-xs font-bold tracking-widest shadow-lg hover:shadow-gold-500/50 transition-all border border-gold-400"
                            >
                              Process Toll
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
                  <div className="flex items-center gap-4 bg-dark-800 p-2 rounded-2xl border border-gold-500/30 shadow-inner">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={capture}
                      disabled={isProcessing || !camReady}
                      className="group bg-gradient-to-r from-gold-600 to-gold-500 hover:from-gold-700 hover:to-gold-600 text-black px-8 py-4 rounded-xl font-mono uppercase text-sm font-bold tracking-widest shadow-lg hover:shadow-gold-500/50 transition-all disabled:opacity-40 flex items-center gap-3 border border-gold-400"
                    >
                      <Camera className="w-5 h-5" />
                      Take Photo
                    </motion.button>
                    
                    <div className="w-px h-8 bg-dark-600" />
                    
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessing}
                      className="group bg-dark-700 hover:bg-dark-600 text-gold-300 px-8 py-4 rounded-xl font-mono uppercase text-sm font-bold tracking-widest shadow-sm border border-gold-500/30 transition-all flex items-center gap-3"
                    >
                      <Upload className="w-5 h-5" />
                      Upload
                    </motion.button>
                    
                    <div className="w-px h-8 bg-dark-600" />

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setIsManualMode(true)}
                      disabled={isProcessing}
                      className="group bg-dark-700 hover:bg-dark-600 text-gold-300 px-8 py-4 rounded-xl font-mono uppercase text-sm font-bold tracking-widest shadow-lg transition-all flex items-center gap-3 border border-gold-500/30"
                    >
                      <Plus className="w-5 h-5" />
                      Manual Entry
                    </motion.button>

                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      className="hidden" 
                      accept="image/*" 
                    />
                  </div>

                  {(selectedImage || recognitionResult || lastResult) && (
                    <motion.button
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      onClick={resetState}
                      className="p-4 bg-red-900/50 text-red-400 rounded-xl hover:bg-red-800/50 transition-all border border-red-600/50 shadow-sm hover:shadow-red-900/50"
                      title="Clear & Reset"
                    >
                      <RotateCcw className="w-6 h-6" />
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.section>

            {/* Last Result */}
            <motion.section 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-dark-800/70 backdrop-blur-xl rounded-3xl border border-gold-500/20 shadow-2xl p-8"
            >
              <h3 className="text-xl font-bold uppercase tracking-wider mb-8 flex items-center gap-3 text-gold-400">
                <ShieldCheck className="w-7 h-7" />
                Processing Result
              </h3>

              <AnimatePresence mode="wait">
                {recognitionResult ? (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-10"
                  >
                    {recognitionResult.error ? (
                      <div className="bg-red-500/10 border-2 border-red-500/30 rounded-3xl p-10 flex flex-col md:flex-row items-center gap-6 text-red-400">
                        <AlertCircle className="w-12 h-12 flex-shrink-0" />
                        <div className="flex-1 text-center md:text-left">
                          <h4 className="text-xl font-bold uppercase font-mono">Detection Issue</h4>
                          <p className="opacity-80 mb-4">{recognitionResult.error}</p>
                          <button 
                            onClick={() => setSelectedImage(null)}
                            className="px-6 py-2 bg-red-600 text-white rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-red-700 transition-all flex items-center gap-2 mx-auto md:mx-0"
                          >
                            <RefreshCw className="w-4 h-4" />
                            Try Again
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* New Dedicated ANPR Output Section */}
                        <div className="bg-dark-800 rounded-[2.5rem] p-1 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden relative group">
                          <div className="absolute inset-0 bg-gradient-to-br from-gold-500/10 via-transparent to-gold-600/10 pointer-events-none" />
                          <div className="bg-dark-800 rounded-[2.3rem] p-8 md:p-10 border border-white/5 relative z-10">
                            <div className="flex flex-col lg:flex-row items-stretch justify-between gap-10">
                              
                              {/* Left: Plate Visualization */}
                              <div className="flex-1 space-y-8">
                                <div className="flex items-center justify-between">
                                  <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-gold-500/10 border border-gold-500/20 text-gold-400 rounded-full text-xs font-mono uppercase tracking-[0.2em]">
                                    <Scan className="w-4 h-4" />
                                    OCR Extraction Successful
                                  </span>
                                  {recognitionResult.processingTime && (
                                    <span className="text-white/40 text-xs font-mono uppercase tracking-widest flex items-center gap-2">
                                      <RefreshCw className="w-3 h-3" />
                                      Time: {recognitionResult.processingTime}
                                    </span>
                                  )}
                                </div>

                                <div className="space-y-6">
                                  <h3 className="text-gold-200/60 text-xs font-mono uppercase tracking-widest">Extracted Vehicle Number:</h3>
                                  <div className="relative inline-block w-full group/plate">
                                    <div className="absolute -inset-4 bg-gradient-to-r from-gold-500 to-gold-600 rounded-2xl blur-xl opacity-20 group-hover/plate:opacity-40 transition-opacity" />
                                    <div className="relative bg-white text-black px-6 md:px-10 py-6 md:py-8 rounded-2xl shadow-2xl border-4 border-gold-400 text-center">
                                      <p className="text-5xl md:text-7xl font-black font-mono tracking-[0.2em] flex items-center justify-center gap-4 break-all">
                                        {recognitionResult.plateNumber || 'NOT DETECTED'}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                {recognitionResult.croppedImage && (
                                  <div className="space-y-4">
                                    <h4 className="text-gold-200/40 text-xs font-mono uppercase tracking-widest">Detected Plate Region:</h4>
                                    <div className="h-24 w-full md:w-64 bg-dark-900/40 rounded-xl border border-white/10 overflow-hidden shadow-inner flex items-center justify-center p-2">
                                      <img 
                                        src={recognitionResult.croppedImage} 
                                        alt="Cropped Plate" 
                                        className="h-full object-contain filter contrast-125 brightness-110" 
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Right: Metrics & Details */}
                              <div className="lg:w-px bg-white/10" />

                              <div className="flex flex-col justify-between gap-8 min-w-[240px]">
                                <div className="space-y-8">
                                  <div>
                                    <p className="text-xs font-mono uppercase tracking-widest text-gold-200/40 mb-3">Vehicle Category</p>
                                    <div className="flex items-center gap-4 bg-white/5 px-6 py-4 rounded-2xl border border-white/10">
                                      <div className="w-10 h-10 bg-gold-500/20 rounded-xl flex items-center justify-center">
                                        <Car className="w-6 h-6 text-gold-400" />
                                      </div>
                                      <span className="text-2xl font-black text-white uppercase font-mono tracking-wider">{recognitionResult.vehicleType}</span>
                                    </div>
                                  </div>

                                  <div>
                                    <div className="flex items-center justify-between mb-3">
                                      <p className="text-xs font-mono uppercase tracking-widest text-gold-200/40">AI Confidence Score</p>
                                      <span className="text-gold-400 font-mono font-bold">{Math.round(recognitionResult.confidence * (recognitionResult.confidence < 1 ? 100 : 1))}%</span>
                                    </div>
                                    <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                      <motion.div 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${recognitionResult.confidence < 1 ? recognitionResult.confidence * 100 : recognitionResult.confidence}%` }}
                                        className="h-full bg-gradient-to-r from-gold-500 to-gold-600 shadow-[0_0_10px_rgba(255,193,7,0.5)]" 
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="p-6 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-4">
                                  <div className="w-2 h-2 bg-gold-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(255,193,7,0.8)]" />
                                  <p className="text-[10px] font-mono text-gold-200/60 uppercase tracking-widest leading-relaxed">
                                    System utilizing Gemini 1.5 Flash Vision OCR with Real-time Sharp Processing
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {lastResult && (
                          <div className={cn(
                            'p-10 rounded-[2.5rem] shadow-2xl border-4 transform transition-all duration-500',
                            lastResult.status === 'approved'
                              ? 'border-gold-400/50 bg-dark-800/80 shadow-gold-500/30'
                              : 'border-red-400/50 bg-dark-800/80 shadow-red-500/30'
                          )}>
                            <div className="flex flex-col md:flex-row items-center gap-10">
                              <div className={`p-8 rounded-3xl shadow-2xl transform hover:scale-110 transition-all ${
                                lastResult.status === 'approved'
                                  ? 'bg-gold-500 shadow-gold-500/30'
                                  : 'bg-red-500 shadow-red-500/30'
                              }`}>
                                {lastResult.status === 'approved' ? (
                                  <CheckCircle2 className="w-12 h-12 text-white" />
                                ) : (
                                  <XCircle className="w-12 h-12 text-white" />
                                )}
                              </div>
                              <div className="flex-1 text-center md:text-left">
                                <h4 className={cn(
                                  "text-4xl font-black uppercase tracking-widest mb-2 font-mono",
                                  lastResult.status === 'approved' ? "text-gold-600" : "text-red-600"
                                )}>
                                  {lastResult.status === 'approved' ? 'GATE OPEN' : 'ACCESS DENIED'}
                                </h4>
                                <p className="text-xl text-gold-100 font-mono uppercase tracking-widest">{lastResult.reason}</p>
                                {lastResult.status === 'rejected' && lastResult.reason === 'Vehicle not registered' && (
                                  <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleQuickRegister}
                                    className="mt-4 px-6 py-2 bg-gold-500 text-black rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 border border-gold-400 hover:bg-gold-600 transition-all"
                                  >
                                    <Plus className="w-4 h-4" />
                                    Register Vehicle Now
                                  </motion.button>
                                )}
                              </div>
                              <div className="bg-dark-700 px-8 py-6 rounded-3xl border border-gold-500/30 text-center min-w-[200px]">
                                <span className="text-xs font-mono uppercase tracking-widest text-gold-200/60 block mb-2">Toll Collected</span>
                                <p className="text-4xl font-black text-gold-400 font-mono">₹{lastResult.amount}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    className="h-80 rounded-[2.5rem] border-4 border-dashed border-gold-500/30 flex flex-col items-center justify-center text-gold-200/60 p-12 bg-dark-700/50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="w-24 h-24 bg-dark-700 rounded-3xl shadow-xl flex items-center justify-center mb-8 border border-gold-500/30 group hover:scale-110 transition-transform">
                      <ImageIcon className="w-10 h-10 text-gold-400" />
                    </div>
                    <h4 className="text-2xl font-black uppercase tracking-[0.2em] mb-4 font-mono text-gold-400">Ready to Analyze</h4>
                    <p className="text-gold-200/60 font-mono text-center max-w-sm leading-relaxed">
                      Position vehicle in camera view or upload an image to start high-precision extraction
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>
          </div>

          {/* Sidebar - Registry */}
          <motion.section 
            id="registry-section"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-dark-800/70 backdrop-blur-xl rounded-3xl border border-gold-500/20 shadow-2xl p-8 sticky top-24 h-fit"
          >
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold uppercase tracking-wider flex items-center gap-3 text-gold-400">
                <UserCheck className="w-7 h-7" />
                Vehicle Registry
              </h3>
              <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className="p-4 bg-dark-700 hover:bg-dark-600 rounded-2xl transition-all shadow-sm hover:shadow-md border border-gold-500/30 flex items-center justify-center group hover:scale-105 text-gold-400"
              >
                {showAddForm ? (
                  <ArrowRight className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                ) : (
                  <Plus className="w-6 h-6" />
                )}
              </button>
            </div>

            {!showAddForm && (
              <div className="relative mb-6">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="w-5 h-5 text-gold-700" />
                </div>
                <input 
                  type="text"
                  placeholder="Search by plate or owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-dark-700/50 border border-gold-500/30 text-gold-300 pl-12 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-gold-500 focus:border-transparent transition-all font-mono text-sm"
                />
              </div>
            )}

            {showAddForm ? (
              <form onSubmit={handleAddVehicle} className="space-y-6 mb-8">
                <div>
                  <input 
                    type="text"
                    placeholder="License Plate Number"
                    value={newVehicle.plateNumber}
                    onChange={(e) => setNewVehicle({...newVehicle, plateNumber: e.target.value.toUpperCase()})}
                    className="w-full px-5 py-4 border border-gold-500/30 rounded-2xl font-mono text-lg tracking-wider focus:outline-none focus:ring-4 focus:ring-gold-500 focus:border-transparent shadow-sm transition-all bg-dark-700 text-gold-300"
                    maxLength={12}
                  />
                </div>
                <input 
                  type="text"
                  placeholder="Owner Name"
                  value={newVehicle.ownerName}
                  onChange={(e) => setNewVehicle({...newVehicle, ownerName: e.target.value})}
                  className="w-full px-5 py-4 border border-gold-500/30 rounded-2xl font-mono text-lg tracking-wider focus:outline-none focus:ring-4 focus:ring-gold-500 focus:border-transparent shadow-sm transition-all bg-dark-700 text-gold-300"
                />
                <div className="grid grid-cols-2 gap-4">
                  <select 
                    value={newVehicle.vehicleType}
                    onChange={(e) => setNewVehicle({...newVehicle, vehicleType: e.target.value as Vehicle['vehicleType']})}
                    className="px-5 py-4 border border-gold-500/30 rounded-2xl font-mono text-lg tracking-wider focus:outline-none focus:ring-4 focus:ring-gold-500 focus:border-transparent shadow-sm transition-all appearance-none bg-dark-700 text-gold-300"
                  >
                    <option value="car">CAR - ₹50</option>
                    <option value="truck">TRUCK - ₹150</option>
                    <option value="bus">BUS - ₹100</option>
                    <option value="motorcycle">Motorcycle - ₹20</option>
                  </select>
                    <motion.button 
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="px-8 py-4 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-black font-mono uppercase text-lg font-bold tracking-wider rounded-2xl shadow-xl hover:shadow-gold-500/50 transition-all border border-gold-400"
                  >
                    Register Vehicle
                  </motion.button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {filteredVehicles.map((v) => (
                  <motion.div 
                    key={v.plateNumber}
                    layout
                    className="p-6 border border-gold-500/30 rounded-2xl hover:border-gold-400 hover:shadow-gold-900/50 transition-all group bg-dark-800/70 backdrop-blur-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl border-4 shadow-lg font-mono font-bold text-sm uppercase tracking-wide flex-shrink-0 ${
                          v.status === 'active' 
                            ? 'border-gold-500/50 bg-gold-500/10 text-gold-400 shadow-gold-500/20' 
                            : 'border-red-500/50 bg-red-500/10 text-red-400 shadow-red-500/20'
                        }`}>
                          {v.vehicleType}
                        </div>
                        <div>
                          <h4 className="text-xl font-mono font-bold uppercase tracking-tight text-white">{v.plateNumber}</h4>
                          <p className="text-lg opacity-70 mt-1 text-gold-100">{v.ownerName}</p>
                          <p className="text-sm opacity-60 font-mono mt-1 text-gold-200/60">
                            Balance: <span className="font-bold text-2xl text-gold-400">₹{v.balance}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                        <button 
                          onClick={() => toggleStatus(v.plateNumber, v.status)}
                          title={v.status === 'active' ? 'Suspend' : 'Activate'}
                          className={`p-3 rounded-xl transition-all shadow-sm font-mono uppercase text-xs tracking-wider border ${
                            v.status === 'active'
                              ? 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-400'
                              : 'bg-gold-500/10 hover:bg-gold-500/20 border-gold-500/30 text-gold-400'
                          }`}
                        >
                          {v.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                        <button 
                          onClick={() => handleDeleteVehicle(v.plateNumber)}
                          title="Delete"
                          className="p-3 bg-dark-700 hover:bg-red-900 border border-white/10 text-gold-200/60 hover:text-red-300 rounded-xl shadow-sm hover:shadow-md transition-all font-mono text-xs uppercase tracking-wider"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {filteredVehicles.length === 0 && (
                  <div className="p-16 border-2 border-dashed border-gold-500/20 rounded-3xl text-center text-gold-200/40 bg-dark-800/50">
                    <UserCheck className="w-20 h-20 mx-auto mb-6 opacity-20 text-gold-500" />
                    <h4 className="text-2xl font-bold uppercase tracking-wider mb-3 font-mono text-gold-400">No Vehicles Registered</h4>
                    <p className="text-lg opacity-50">Click + to add your first vehicle</p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-6 mt-8 border-t border-gold-500/20">
              <div className="flex items-center justify-between text-xs opacity-60 font-mono uppercase tracking-wider">
                <span>Total: {vehicles.length} vehicles</span>
                {searchQuery && <span>{filteredVehicles.length} matching</span>}
              </div>
            </div>
          </motion.section>

          {/* Transaction History */}
          <motion.section 
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-dark-800/70 backdrop-blur-xl rounded-3xl border border-gold-500/20 shadow-2xl p-8 h-[calc(100vh-8rem)] overflow-hidden flex flex-col"
          >
            <div className="bg-gradient-to-r from-dark-800 to-dark-800 px-6 py-4 rounded-t-3xl flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <History className="w-7 h-7" />
                Recent Transactions
              </h3>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      // Generate PDF report
                      const totalRevenue = history.filter(t => t.status === 'approved').reduce((acc, t) => acc + t.amount, 0);
                      const approvedCount = history.filter(t => t.status === 'approved').length;
                      const rejectedCount = history.filter(t => t.status === 'rejected').length;
                      const reportDate = new Date().toLocaleString();
                      
                      // Build styled HTML for PDF
                      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SmartToll AI - Vehicle Detection Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&family=JetBrains+Mono:wght@400;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; background: #0A0A0A; color: #fff; padding: 40px; }
    .header { text-align: center; padding: 40px 0; border-bottom: 2px solid rgba(255,193,7,0.3); margin-bottom: 30px; }
    .header h1 { font-size: 32px; font-weight: 900; background: linear-gradient(to right, #FFC107, #FFD700); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: 2px; }
    .header p { color: rgba(255,255,255,0.5); font-family: 'JetBrains Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-top: 8px; }
    .stats { display: flex; gap: 20px; margin: 30px 0; }
    .stat-card { flex: 1; background: #111; border: 1px solid rgba(255,193,7,0.2); border-radius: 16px; padding: 24px; text-align: center; }
    .stat-card .label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: rgba(255,193,7,0.6); }
    .stat-card .value { font-size: 28px; font-weight: 900; color: #FFC107; font-family: 'JetBrains Mono', monospace; margin-top: 8px; }
    .stat-card .value.green { color: #10B981; }
    .stat-card .value.red { color: #EF4444; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 30px; }
    th { background: #111; color: #FFC107; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; padding: 16px; text-align: left; border-bottom: 2px solid rgba(255,193,7,0.3); }
    td { padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.05); font-family: 'JetBrains Mono', monospace; font-size: 13px; }
    tr:hover td { background: rgba(255,193,7,0.03); }
    .plate { font-weight: 700; letter-spacing: 2px; color: #FFC107; font-size: 14px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
    .badge.approved { background: rgba(255,193,7,0.15); color: #FFC107; border: 1px solid rgba(255,193,7,0.3); }
    .badge.rejected { background: rgba(239,68,68,0.15); color: #EF4444; border: 1px solid rgba(239,68,68,0.3); }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.3); font-size: 11px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 2px; }
    .type-badge { display: inline-block; padding: 3px 10px; border-radius: 8px; font-size: 10px; font-weight: 600; text-transform: uppercase; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); }
    @media print { body { background: white; color: #111; } .header h1 { color: #B38F00; -webkit-text-fill-color: #B38F00; } .stat-card { border-color: #ccc; } th { background: #f5f5f5; color: #B38F00; } .plate { color: #B38F00; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>\u2B50 SmartToll AI - Detection Report</h1>
    <p>Generated on ${reportDate}</p>
  </div>
  
  <div class="stats">
    <div class="stat-card">
      <div class="label">Total Transactions</div>
      <div class="value">${history.length}</div>
    </div>
    <div class="stat-card">
      <div class="label">Total Revenue</div>
      <div class="value">\u20B9${totalRevenue}</div>
    </div>
    <div class="stat-card">
      <div class="label">Approved</div>
      <div class="value green">${approvedCount}</div>
    </div>
    <div class="stat-card">
      <div class="label">Rejected</div>
      <div class="value red">${rejectedCount}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>License Plate</th>
        <th>Vehicle Type</th>
        <th>Amount</th>
        <th>Status</th>
        <th>Reason</th>
        <th>Timestamp</th>
      </tr>
    </thead>
    <tbody>
      ${history.map((t, i) => `
        <tr>
          <td>${i + 1}</td>
          <td class="plate">${t.plateNumber}</td>
          <td><span class="type-badge">${t.vehicleType}</span></td>
          <td>\u20B9${t.amount}</td>
          <td><span class="badge ${t.status}">${t.status}</span></td>
          <td>${t.reason || '-'}</td>
          <td>${new Date(((t.timestamp as any)?.seconds || 0) * 1000).toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  <div class="footer">
    Smart Toll AI Gate System &bull; Powered by Google Gemini &bull; Confidential Report
  </div>
</body>
</html>`;
                      
                      // Open print dialog for PDF
                      const printWindow = window.open('', '_blank');
                      if (printWindow) {
                        printWindow.document.write(htmlContent);
                        printWindow.document.close();
                        // Give fonts time to load before printing
                        setTimeout(() => {
                          printWindow.print();
                        }, 800);
                      }
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-gold-500/20 to-gold-600/20 hover:from-gold-500/30 hover:to-gold-600/30 text-gold-400 rounded-xl text-xs font-mono uppercase tracking-widest transition-all flex items-center gap-2 border border-gold-500/30 hover:border-gold-400/50 shadow-sm hover:shadow-gold-500/20"
                    title="Download PDF Report"
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">PDF Report</span>
                  </motion.button>
                )}
                <button 
                  onClick={handleClearHistory}
                  className="p-2 text-white/50 hover:text-white transition-colors"
                  title="Clear All"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4 p-6 mt-6 overflow-y-auto flex-1">
              <AnimatePresence>
                {history.slice(0, 50).map((transaction, index) => (
                  <motion.div
                    key={`${transaction.plateNumber}-${index}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group p-6 rounded-2xl border transition-all cursor-pointer hover:shadow-xl hover:-translate-y-1 bg-gradient-to-r from-dark-800 to-dark-900 border-gold-500/20 hover:border-gold-400"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xl font-mono font-bold uppercase tracking-tight truncate text-gold-400">{transaction.plateNumber}</h4>
                        <p className="text-sm opacity-50 uppercase font-mono mt-1 text-gold-200/60">{transaction.vehicleType}</p>
                      </div>
                      <div className={`px-4 py-2 rounded-full text-sm font-bold uppercase shadow-md ${
                        transaction.status === 'approved'
                          ? 'bg-gold-500/10 text-gold-400 border border-gold-500/20 shadow-gold-500/10'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20 shadow-red-500/10'
                      }`}>
                        {transaction.status}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm opacity-80 font-mono border-t border-white/5 pt-3">
                      <span className="opacity-40 text-gold-200/40">{new Date((transaction.timestamp as any)?.seconds * 1000).toLocaleTimeString()}</span>
                      <div className="text-right">
                        <p className="text-[10px] uppercase opacity-30 font-bold mb-0.5 text-gold-200/40">Entry Revenue</p>
                        <p className="text-2xl font-bold text-gold-400">₹{transaction.amount}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {history.length === 0 && (
                <div className="flex flex-col items-center justify-center py-24 text-gold-200/60">
                  <History className="w-20 h-20 mb-6 opacity-30" />
                  <h4 className="text-2xl font-bold uppercase tracking-wider mb-3 font-mono">No Transactions Yet</h4>
                  <p className="text-lg opacity-70 max-w-md text-center font-mono leading-relaxed">
                    Process your first vehicle to see live transaction history
                  </p>
                </div>
              )}
            </div>
          </motion.section>
        </div>
      </main>

      <footer className="border-t border-gold-500/10 mt-24 py-12 bg-dark-900/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-sm opacity-40 font-mono uppercase tracking-wider text-gold-200/60">
            Smart Toll AI Gate System • Powered by Google Gemini • Production Ready
          </p>
        </div>
      </footer>
    </div>
  );
}

