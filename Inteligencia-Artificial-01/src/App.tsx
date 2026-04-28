/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { 
  Star, 
  Download, 
  RefreshCw, 
  Moon, 
  Sun, 
  Info, 
  Settings2, 
  Palette, 
  Layers,
  Sparkles,
  Search,
  LogIn,
  LogOut,
  Save,
  Library,
  X,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  deleteDoc, 
  doc,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db, loginWithGoogle, logout } from './firebase';

// --- Constants & Types ---

const PALETTE = [
  "#F2F4F8", "#E8DAFF", "#BAE6FF", "#D0E2FF", "#9EF0F0", 
  "#A7F0BA", "#FF0066", "#8A3FFC", "#FA4D56", "#F1C21B", 
  "#08BDBA", "#0F62FE", "#24A148"
];

type StarConfig = {
  type: number; // Number of points
  quantity: number;
  effect: number; // 0-100 scale
  color: string;
  innerRadius: number; // 0-100 scale
  hasFill: boolean;
  rotationSpeed: number; // 0, 1, 2, 3, 4
  is3D: boolean;
};

interface SavedStar extends StarConfig {
  id: string;
  userId: string;
  createdAt: string;
}

const INTERPRETATIONS: Record<number, { title: string; meaning: string; connection: string }> = {
  3: { title: "The Triad", meaning: "Represents stability and the fundamental structure of data analysis.", connection: "Triangle Constellation (Triangulum)" },
  4: { title: "The Compass", meaning: "Symbolizes direction, navigation, and the four cardinal points of intelligence gathering.", connection: "Crux (Southern Cross)" },
  5: { title: "The Classic Pentagram", meaning: "A symbol of protection and the five senses of observation.", connection: "Cassiopeia" },
  6: { title: "The Hexagram", meaning: "Represents balance and the intersection of different data sources.", connection: "The Winter Hexagon" },
  7: { title: "The Septagram", meaning: "Associated with the seven days of the week and mystical cycles of information.", connection: "The Pleiades (Seven Sisters)" },
  8: { title: "The Octagram", meaning: "Symbolizes regeneration and the expansion of knowledge networks.", connection: "Andromeda" },
  9: { title: "The Enneagram", meaning: "Represents completion and the holistic view of a complex system.", connection: "Orion's Belt" },
  10: { title: "The Decagram", meaning: "A symbol of universal harmony and the integration of diverse intelligence fields.", connection: "The Zodiacal Light" },
  12: { title: "The Dodecagram", meaning: "Represents the full cycle and the complexity of global intelligence networks.", connection: "The Ecliptic" },
};

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't throw here to avoid crashing the app, but we could show a toast
}

// --- Helper Functions ---

const calculateStarPath = (cx: number, cy: number, points: number, outerRadius: number, innerRadius: number) => {
  let path = "";
  const angle = Math.PI / points;

  for (let i = 0; i < 2 * points; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const currX = cx + Math.cos(i * angle - Math.PI / 2) * r;
    const currY = cy + Math.sin(i * angle - Math.PI / 2) * r;
    path += (i === 0 ? "M" : "L") + currX + "," + currY;
  }
  path += "Z";
  return path;
};

// --- Components ---

export default function App() {
  const [config, setConfig] = useState<StarConfig>({
    type: 5,
    quantity: 1,
    effect: 20,
    color: PALETTE[7], // Default to a nice purple
    innerRadius: 40,
    hasFill: true,
    rotationSpeed: 1,
    is3D: false,
  });
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [customHex, setCustomHex] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [savedStars, setSavedStars] = useState<SavedStar[]>([]);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Toggle Dark Mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Test Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  // Fetch Saved Stars
  useEffect(() => {
    if (!isAuthReady || !user) {
      setSavedStars([]);
      return;
    }

    const path = 'stars';
    const q = query(
      collection(db, path),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const stars = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SavedStar[];
      setSavedStars(stars);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const handleRandomize = () => {
    setConfig({
      type: Math.floor(Math.random() * 10) + 3,
      quantity: Math.floor(Math.random() * 10) + 1,
      effect: Math.floor(Math.random() * 100),
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      innerRadius: Math.floor(Math.random() * 60) + 20,
      hasFill: Math.random() > 0.3,
      rotationSpeed: Math.floor(Math.random() * 5),
      is3D: Math.random() > 0.7,
    });
  };

  const downloadSVG = () => {
    const svgElement = document.getElementById('star-preview-svg');
    if (!svgElement) return;

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElement);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `jojo-star-${config.type}pt.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const saveStar = async () => {
    if (!user) return;
    setIsSaving(true);
    const path = 'stars';
    try {
      await addDoc(collection(db, path), {
        ...config,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
      // Optional: Show success toast
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteStar = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const path = `stars/${id}`;
    try {
      await deleteDoc(doc(db, 'stars', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const interpretation = useMemo(() => {
    return INTERPRETATIONS[config.type] || { 
      title: `${config.type}-Pointed Star`, 
      meaning: "A complex geometric configuration representing high-density data nodes.", 
      connection: "Deep Space Networks" 
    };
  }, [config.type]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-[#0a0a0c] text-slate-200' : 'bg-slate-50 text-slate-900'} font-sans selection:bg-indigo-500/30`}>
      {/* Header */}
      <header className="border-b border-slate-800/20 px-6 py-4 flex items-center justify-between backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20">
            <Search className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight uppercase">JOJO STAR</h1>
            <p className="text-[10px] opacity-50 font-mono uppercase tracking-widest">Joestar Birthmark Generator</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3 pr-2 border-r border-slate-800/50">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold">{user.displayName}</p>
                <p className="text-[10px] opacity-50 font-mono">STAND USER</p>
              </div>
              <img 
                src={user.photoURL || ''} 
                alt="Profile" 
                className="w-8 h-8 rounded-full border border-indigo-500/50"
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={logout}
                className="p-2 rounded-full hover:bg-red-500/10 text-red-400 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button 
              onClick={loginWithGoogle}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-indigo-500/20"
            >
              <LogIn className="w-4 h-4" />
              Login with Google
            </button>
          )}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full hover:bg-slate-500/10 transition-colors"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Controls */}
        <section className="lg:col-span-4 space-y-6">
          <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'} shadow-xl`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wider">Parameters</h2>
              </div>
              {user && (
                <button 
                  onClick={() => setIsGalleryOpen(true)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 transition-colors relative"
                  title="My Gallery"
                >
                  <Library className="w-4 h-4" />
                  {savedStars.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-white text-[8px] flex items-center justify-center rounded-full border border-slate-900">
                      {savedStars.length}
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="space-y-8">
              {/* Star Type */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-mono uppercase opacity-70">
                  <label>Pontas da Estrela</label>
                  <span>{config.type}</span>
                </div>
                <input 
                  type="range" min="3" max="24" step="1"
                  value={config.type}
                  onChange={(e) => setConfig({...config, type: parseInt(e.target.value)})}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Inner Radius */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-mono uppercase opacity-70">
                  <label>Nitidez das Pontas</label>
                  <span>{config.innerRadius}%</span>
                </div>
                <input 
                  type="range" min="5" max="80" step="1"
                  value={config.innerRadius}
                  onChange={(e) => setConfig({...config, innerRadius: parseInt(e.target.value)})}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Quantity */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-mono uppercase opacity-70">
                  <label>Densidade (Qtd)</label>
                  <span>{config.quantity}</span>
                </div>
                <input 
                  type="range" min="1" max="10" step="1"
                  value={config.quantity}
                  onChange={(e) => setConfig({...config, quantity: parseInt(e.target.value)})}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Effect */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-mono uppercase opacity-70">
                  <label>Efeito Especial (Brilho)</label>
                  <span>{config.effect}%</span>
                </div>
                <input 
                  type="range" min="0" max="100" step="1"
                  value={config.effect}
                  onChange={(e) => setConfig({...config, effect: parseInt(e.target.value)})}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Fill Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-700/50 bg-slate-800/20">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-mono uppercase opacity-70">Modo Preenchimento</span>
                </div>
                <button
                  onClick={() => setConfig({...config, hasFill: !config.hasFill})}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${config.hasFill ? 'bg-indigo-600' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${config.hasFill ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Rotation Speed */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-mono uppercase opacity-70">
                  <label>Velocidade de Rotação</label>
                  <span>{config.rotationSpeed === 0 ? 'Estático' : `${config.rotationSpeed}x`}</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {[0, 1, 2, 3, 4].map((speed) => (
                    <button
                      key={speed}
                      onClick={() => setConfig({...config, rotationSpeed: speed})}
                      className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${
                        config.rotationSpeed === speed 
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' 
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {speed === 0 ? 'OFF' : `${speed}x`}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3D Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-700/50 bg-slate-800/20">
                <div className="flex items-center gap-2">
                  <RefreshCw className={`w-4 h-4 text-indigo-400 ${config.is3D ? 'animate-spin' : ''}`} />
                  <span className="text-xs font-mono uppercase opacity-70">Perspectiva 3D</span>
                </div>
                <button
                  onClick={() => setConfig({...config, is3D: !config.is3D})}
                  className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${config.is3D ? 'bg-indigo-600' : 'bg-slate-700'}`}
                >
                  <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${config.is3D ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Color Palette */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-mono uppercase opacity-70">
                  <Palette className="w-3 h-3" />
                  <label>Cor do Sinal</label>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {PALETTE.map((color) => (
                    <button
                      key={color}
                      onClick={() => setConfig({...config, color})}
                      className={`w-full aspect-square rounded-md transition-transform hover:scale-110 active:scale-95 ${config.color === color ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-900' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="#HEX CODE"
                    value={customHex}
                    onChange={(e) => {
                      setCustomHex(e.target.value);
                      if (e.target.value.match(/^#[0-9A-Fa-f]{6}$/)) {
                        setConfig({...config, color: e.target.value});
                      }
                    }}
                    className={`w-full px-4 py-2 text-xs font-mono rounded-lg border ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'} focus:outline-none focus:ring-1 focus:ring-indigo-500`}
                  />
                  <div 
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-slate-600"
                    style={{ backgroundColor: config.color }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-3">
              <button 
                onClick={handleRandomize}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Aleatório
              </button>
              <button 
                onClick={downloadSVG}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              >
                <Download className="w-4 h-4" />
                Exportar
              </button>
              {user && (
                <button 
                  onClick={saveStar}
                  disabled={isSaving}
                  className="col-span-2 flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-indigo-500/20"
                >
                  {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar na Constelação
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Middle Column: Preview */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          <div 
            className={`flex-1 min-h-[400px] rounded-2xl border ${isDarkMode ? 'bg-slate-900/30 border-slate-800' : 'bg-white border-slate-200'} relative overflow-hidden flex items-center justify-center group shadow-inner`}
            style={{ perspective: config.is3D ? '1000px' : 'none' }}
          >
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
            
            <AnimatePresence mode="wait">
              <motion.div
                key={`${config.type}-${config.innerRadius}-${config.quantity}-${config.color}-${config.is3D}`}
                className="w-full h-full flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  rotateX: config.is3D ? 45 : 0,
                  rotateY: config.is3D ? 15 : 0,
                  z: config.is3D ? 100 : 0
                }}
                exit={{ opacity: 0, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 100, damping: 15 }}
                style={{ transformStyle: 'preserve-3d' }}
              >
                <motion.svg
                  id="star-preview-svg"
                  viewBox="0 0 200 200"
                  className="w-full h-full max-w-[300px] drop-shadow-2xl"
                >
                  <defs>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation={config.effect / 10} result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>

                  {Array.from({ length: config.quantity }).map((_, i) => {
                    const opacity = 1 - (i * 0.15);
                    const scale = 1 - (i * 0.1);
                    return (
                      <motion.path
                        key={`${i}-${config.rotationSpeed}`}
                        d={calculateStarPath(100, 100, config.type, 80 * scale, (config.innerRadius / 100) * 80 * scale)}
                        fill={config.hasFill ? config.color : "none"}
                        stroke={config.hasFill ? "none" : config.color}
                        strokeWidth={config.hasFill ? 0 : 2}
                        fillOpacity={opacity}
                        filter="url(#glow)"
                        animate={{ 
                          rotate: config.rotationSpeed > 0 ? [0, 360] : 0,
                        }}
                        transition={{ 
                          duration: config.rotationSpeed === 1 ? 8 : 
                                    config.rotationSpeed === 2 ? 3 : 
                                    config.rotationSpeed === 3 ? 1 : 
                                    config.rotationSpeed === 4 ? 0.3 : 0, 
                          repeat: Infinity, 
                          ease: "linear" 
                        }}
                      />
                    );
                  })}
                </motion.svg>
              </motion.div>
            </AnimatePresence>

            <div className="absolute bottom-4 left-4 flex gap-2">
              <div className="px-2 py-1 bg-slate-800/80 backdrop-blur-md rounded text-[10px] font-mono uppercase tracking-tighter border border-slate-700">
                JOESTAR_BLOODLINE_OK
              </div>
              <div className="px-2 py-1 bg-slate-800/80 backdrop-blur-md rounded text-[10px] font-mono uppercase tracking-tighter border border-slate-700">
                {config.type}PTS
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Interpretation */}
        <section className="lg:col-span-3 space-y-6">
          <div className={`p-6 rounded-2xl border ${isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'} h-full flex flex-col`}>
            <div className="flex items-center gap-2 mb-6">
              <Info className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wider">Stand Stats</h2>
            </div>

            <div className="flex-1 space-y-6">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-indigo-400">{interpretation.title}</h3>
                <div className="h-1 w-12 bg-indigo-500 mt-2 rounded-full" />
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase opacity-50">Stand Ability</p>
                  <p className="text-sm leading-relaxed italic">"{interpretation.meaning}"</p>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase opacity-50">Fate Connection</p>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="w-3 h-3 text-yellow-500" />
                    {interpretation.connection}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800/50">
                  <p className="text-[10px] font-mono uppercase opacity-50 mb-3">Technical Specs</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <p className="text-[9px] opacity-50">VERTICES</p>
                      <p className="text-xs font-bold">{config.type * 2}</p>
                    </div>
                    <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <p className="text-[9px] opacity-50">NODES</p>
                      <p className="text-xs font-bold">{config.quantity}</p>
                    </div>
                    <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <p className="text-[9px] opacity-50">SPEED</p>
                      <p className="text-xs font-bold uppercase">{config.rotationSpeed === 0 ? 'Static' : `${config.rotationSpeed}x`}</p>
                    </div>
                    <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <p className="text-[9px] opacity-50">DIMENSION</p>
                      <p className="text-xs font-bold uppercase">{config.is3D ? '3D Perspective' : '2D Flat'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
              <p className="text-[10px] leading-relaxed opacity-70">
                This visualization is generated using the Joestar lineage algorithms. Use these symbols to identify Stand users or map the destiny of the bloodline.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Gallery Sidebar */}
      <AnimatePresence>
        {isGalleryOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsGalleryOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed top-0 right-0 h-full w-full max-w-md z-[70] border-l ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'} shadow-2xl flex flex-col`}
            >
              <div className="p-6 border-b border-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Library className="w-5 h-5 text-indigo-500" />
                  <h2 className="text-lg font-bold uppercase tracking-tight">Minha Galeria</h2>
                </div>
                <button 
                  onClick={() => setIsGalleryOpen(false)}
                  className="p-2 rounded-full hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {savedStars.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 text-center space-y-4">
                    <Star className="w-12 h-12" />
                    <p className="text-sm font-mono uppercase">Sua constelação está vazia</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {savedStars.map((star) => (
                      <motion.div
                        key={star.id}
                        layout
                        whileHover={{ scale: 1.02 }}
                        onClick={() => {
                          setConfig({
                            type: star.type,
                            quantity: star.quantity,
                            effect: star.effect,
                            color: star.color,
                            innerRadius: star.innerRadius,
                            hasFill: star.hasFill,
                            rotationSpeed: star.rotationSpeed,
                            is3D: star.is3D
                          });
                          setIsGalleryOpen(false);
                        }}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${isDarkMode ? 'bg-slate-800/50 border-slate-700 hover:border-indigo-500/50' : 'bg-slate-50 border-slate-200 hover:border-indigo-500/50'} group`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-lg bg-slate-900 flex items-center justify-center overflow-hidden border border-slate-700">
                            <svg viewBox="0 0 200 200" className="w-12 h-12">
                              <path 
                                d={calculateStarPath(100, 100, star.type, 80, (star.innerRadius / 100) * 80)}
                                fill={star.hasFill ? star.color : 'none'}
                                stroke={star.hasFill ? 'none' : star.color}
                                strokeWidth={star.hasFill ? 0 : 4}
                              />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-bold text-indigo-400">
                              {INTERPRETATIONS[star.type]?.title || `${star.type}-Pointed Star`}
                            </h4>
                            <p className="text-[10px] opacity-50 font-mono uppercase">
                              {new Date(star.createdAt).toLocaleDateString()}
                            </p>
                            <div className="flex gap-2 mt-2">
                              <span className="text-[8px] px-1.5 py-0.5 bg-slate-700 rounded uppercase">{star.rotationSpeed}x</span>
                              <span className="text-[8px] px-1.5 py-0.5 bg-slate-700 rounded uppercase">{star.is3D ? '3D' : '2D'}</span>
                            </div>
                          </div>
                          <button 
                            onClick={(e) => deleteStar(star.id, e)}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="mt-12 border-t border-slate-800/20 p-8 text-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-30">
          JOJO STAR // Speedwagon Foundation v1.0.4 // Secure Connection
        </p>
      </footer>
    </div>
  );
}
