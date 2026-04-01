import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, BookOpen, Clock, Brain, Trophy, 
  User, Settings, ChevronRight, Play, CheckCircle2, Flame,
  LogOut, Plus, Search, Trash2, Edit3, Save, X,
  TrendingUp, Calendar, Target, Zap, Award,
  Pause, RotateCcw, Check, BrainCircuit,
  FileText, Image as ImageIcon, Upload, Link as LinkIcon, File, ExternalLink, Paperclip
} from 'lucide-react';
import { 
  auth, db, storage, loginWithGoogle, logout, FirebaseUser,
  OperationType, handleFirestoreError, Timestamp,
  registerWithEmail, loginWithEmail, resetPassword, deleteAccount, updateAuthPassword
} from './firebase';
import { 
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile
} from 'firebase/auth';
import { 
  collection, doc, setDoc, getDoc, updateDoc, onSnapshot, 
  query, where, orderBy, limit, addDoc, serverTimestamp,
  getDocs, deleteDoc, deleteField
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { format, subDays, startOfWeek, endOfWeek, isSameDay, parseISO } from 'date-fns';
import { GoogleGenAI } from "@google/genai";
import { 
  Mail, Lock, UserPlus, Key, Shield, Eye, EyeOff, 
  Globe, Bell, Moon, Sun, Smartphone, Trash, AlertCircle, Info,
  Camera, CheckCircle, Smartphone as PhoneIcon
} from 'lucide-react';

// --- TYPES ---
interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  bio?: string;
  phone?: string;
  level: number;
  xp: number;
  streak: number;
  coins: number;
  lastStudyDate?: any;
  isVerified?: boolean;
  twoFactorEnabled?: boolean;
  preferences?: {
    theme: 'light' | 'dark';
    notifications: boolean;
    language: string;
  };
  privacy?: {
    isPublic: boolean;
    dataControl: boolean;
  };
}

interface StudySession {
  id: string;
  userId: string;
  subject: string;
  duration: number;
  timestamp: any;
  xpEarned: number;
}

interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  subject: string;
  createdAt: any;
  updatedAt: any;
}

interface Goal {
  id: string;
  userId: string;
  title: string;
  target: number;
  current: number;
  deadline: any;
  completed: boolean;
}

interface Flashcard {
  id: string;
  userId: string;
  front: string;
  back: string;
  subject: string;
  nextReview: any;
  interval: number;
  easeFactor: number;
  repetition: number;
}

interface Material {
  id: string;
  userId: string;
  name: string;
  url: string;
  type: string;
  subject: string;
  createdAt: any;
  linkedNotes?: string[];
  linkedSessions?: string[];
}

interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'suggestion' | 'deadline' | 'achievement';
  timestamp: any;
  read: boolean;
  actionTab?: string;
}

// --- COMPONENTS ---

const Card = ({ children, className = "", noPadding = false, onClick }: { children: React.ReactNode, className?: string, noPadding?: boolean, onClick?: () => void }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    onClick={onClick}
    className={`bg-[#111] border border-gray-800 rounded-2xl overflow-hidden ${noPadding ? "" : "p-6"} ${onClick ? "cursor-pointer" : ""} ${className}`}
  >
    {children}
  </motion.div>
);

const Button = ({ children, variant = "primary", onClick, className = "", disabled = false }: { children: React.ReactNode, variant?: "primary" | "secondary" | "outline" | "danger" | "ghost", onClick?: () => void, className?: string, disabled?: boolean }) => {
  const styles = {
    primary: "bg-[#D4AF37] text-black hover:bg-[#b8962d]",
    secondary: "bg-blue-600 text-white hover:bg-blue-700",
    outline: "border border-gray-700 text-gray-300 hover:bg-gray-800",
    danger: "bg-red-600/10 text-red-500 border border-red-500/20 hover:bg-red-600/20",
    ghost: "text-gray-400 hover:text-white hover:bg-gray-900"
  };
  return (
    <button 
      disabled={disabled}
      onClick={onClick} 
      className={`px-6 py-2 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    {...props}
    className={`w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#D4AF37] transition ${props.className}`}
  />
);

const TextArea = ({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea 
    {...props}
    className={`w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#D4AF37] transition min-h-[200px] ${props.className}`}
  />
);

// --- MAIN APP ---
export default function JurisAprendizado() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const isRegistering = useRef(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        if (isRegistering.current) return;
        
        // Fetch or Create Profile
        const userRef = doc(db, 'users', firebaseUser.uid);
        try {
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setProfile(userSnap.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || 'Estudante',
              email: firebaseUser.email || '',
              level: 1,
              xp: 0,
              streak: 0,
              coins: 0,
              isVerified: firebaseUser.emailVerified,
              preferences: { theme: 'dark', notifications: true, language: 'pt-BR' },
              privacy: { isPublic: false, dataControl: true }
            };
            await setDoc(userRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'users');
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const sessionsQuery = query(
      collection(db, 'study_sessions'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    const unsubscribeSessions = onSnapshot(sessionsQuery, (snapshot) => {
      setSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StudySession)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'study_sessions'));

    const notesQuery = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notes'));

    const goalsQuery = query(
      collection(db, 'goals'),
      where('userId', '==', user.uid),
      orderBy('deadline', 'asc')
    );
    const unsubscribeGoals = onSnapshot(goalsQuery, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Goal)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'goals'));

    const profileRef = doc(db, 'users', user.uid);
    const unsubscribeProfile = onSnapshot(profileRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserProfile;
        setProfile(data);
        // Apply theme
        if (data.preferences?.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'users'));

    const flashcardsQuery = query(
      collection(db, 'flashcards'),
      where('userId', '==', user.uid),
      orderBy('nextReview', 'asc')
    );
    const unsubscribeFlashcards = onSnapshot(flashcardsQuery, (snapshot) => {
      setFlashcards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'flashcards'));

    const materialsQuery = query(
      collection(db, 'materials'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribeMaterials = onSnapshot(materialsQuery, (snapshot) => {
      setMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Material)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'materials'));

    return () => {
      unsubscribeSessions();
      unsubscribeNotes();
      unsubscribeGoals();
      unsubscribeProfile();
      unsubscribeFlashcards();
      unsubscribeMaterials();
    };
  }, [user]);

  // Intelligent Notification Logic
  useEffect(() => {
    if (!user || !profile || loading) return;

    const newNotifications: AppNotification[] = [];

    // 1. Flashcard Reviews
    const dueFlashcards = flashcards.filter(f => {
      const nextReview = f.nextReview instanceof Timestamp ? f.nextReview.toDate() : new Date(f.nextReview);
      return nextReview <= new Date();
    });
    if (dueFlashcards.length > 0) {
      newNotifications.push({
        id: 'flashcards-due',
        title: 'Revisão Necessária',
        message: `Você tem ${dueFlashcards.length} flashcards para revisar hoje!`,
        type: 'suggestion',
        timestamp: new Date(),
        read: false,
        actionTab: 'flashcards'
      });
    }

    // 2. Upcoming Deadlines
    goals.forEach(goal => {
      if (!goal.completed) {
        const deadline = goal.deadline instanceof Timestamp ? goal.deadline.toDate() : new Date(goal.deadline);
        const diff = deadline.getTime() - new Date().getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        
        if (days >= 0 && days <= 2) {
          newNotifications.push({
            id: `goal-deadline-${goal.id}`,
            title: 'Prazo Próximo',
            message: `A meta "${goal.title}" vence em ${days === 0 ? 'hoje' : days + ' dias'}!`,
            type: 'deadline',
            timestamp: new Date(),
            read: false,
            actionTab: 'goals'
          });
        }
      }
    });

    // 3. Study Patterns (Consistency)
    if (sessions.length > 0) {
      const lastSession = sessions[0];
      const lastDate = lastSession.timestamp instanceof Timestamp ? lastSession.timestamp.toDate() : new Date(lastSession.timestamp);
      const diff = new Date().getTime() - lastDate.getTime();
      const daysSinceLast = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (daysSinceLast >= 3) {
        newNotifications.push({
          id: 'consistency-check',
          title: 'Senti sua falta!',
          message: `Já faz ${daysSinceLast} dias desde sua última sessão. Que tal um pomodoro rápido?`,
          type: 'suggestion',
          timestamp: new Date(),
          read: false,
          actionTab: 'focus'
        });
      }
    }

    // 4. Goal Adjustments
    goals.forEach(goal => {
      if (!goal.completed && goal.current >= goal.target * 0.9) {
        newNotifications.push({
          id: `goal-adjust-${goal.id}`,
          title: 'Quase lá!',
          message: `Você atingiu 90% da meta "${goal.title}". Deseja ajustar o objetivo ou finalizar?`,
          type: 'suggestion',
          timestamp: new Date(),
          read: false,
          actionTab: 'goals'
        });
      }
    });

    setNotifications(newNotifications);
  }, [flashcards, goals, sessions, profile, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen setProfile={setProfile} isRegistering={isRegistering} />;
  }

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20}/> },
    { id: 'notes', label: 'Anotações', icon: <BookOpen size={20}/> },
    { id: 'materials', label: 'Materiais', icon: <FileText size={20}/> },
    { id: 'flashcards', label: 'Flashcards', icon: <Brain size={20}/> },
    { id: 'focus', label: 'Modo Foco', icon: <Clock size={20}/> },
    { id: 'goals', label: 'Metas', icon: <Target size={20}/> },
    { id: 'assistant', label: 'IA Assistant', icon: <BrainCircuit size={20}/> },
    { id: 'ranking', label: 'Ranking', icon: <Trophy size={20}/> },
    { id: 'settings', label: 'Configurações', icon: <Settings size={20}/> },
  ];

  return (
    <div className="flex min-h-screen bg-[#0A0A0A] text-white font-sans">
      {/* SIDEBAR */}
      <aside className="w-64 border-r border-gray-800 flex flex-col p-6 hidden md:flex sticky top-0 h-screen">
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 bg-[#D4AF37] rounded-lg flex items-center justify-center">
            <Award className="text-black" size={20} />
          </div>
          <h1 className="text-xl font-black tracking-tighter text-white italic uppercase">JURIS</h1>
        </div>
        <nav className="flex-1 space-y-2">
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition ${activeTab === item.id ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-900'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </nav>
        <div className="pt-6 border-t border-gray-800">
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-500 hover:text-red-500 hover:bg-red-500/5 transition"
          >
            <LogOut size={20}/> Sair
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h2 className="text-2xl font-bold">Olá, {profile?.displayName} 👋</h2>
            <p className="text-gray-500 text-sm">Pronto para mais um dia de conquistas?</p>
          </div>
          
          <div className="flex items-center gap-4 bg-gray-900/50 p-2 rounded-2xl border border-gray-800">
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-gray-400 hover:text-white transition relative"
              >
                <Bell size={20} />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0A0A0A]" />
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-4 w-80 bg-[#111] border border-gray-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                      <h4 className="font-bold text-sm">Notificações Inteligentes</h4>
                      <button 
                        onClick={() => setNotifications(notifications.map(n => ({ ...n, read: true })))}
                        className="text-[10px] text-blue-500 hover:underline font-bold"
                      >
                        Ler todas
                      </button>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 text-sm">
                          Tudo em dia! Nenhuma sugestão no momento.
                        </div>
                      ) : (
                        notifications.map(n => (
                          <div 
                            key={n.id} 
                            onClick={() => {
                              if (n.actionTab) setActiveTab(n.actionTab);
                              setShowNotifications(false);
                            }}
                            className={`p-4 border-b border-gray-800 hover:bg-gray-900 transition cursor-pointer ${!n.read ? 'bg-blue-500/5' : ''}`}
                          >
                            <div className="flex gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                n.type === 'suggestion' ? 'bg-blue-500/10 text-blue-500' :
                                n.type === 'deadline' ? 'bg-red-500/10 text-red-500' :
                                'bg-yellow-500/10 text-yellow-500'
                              }`}>
                                {n.type === 'suggestion' ? <Zap size={14} /> : 
                                 n.type === 'deadline' ? <Clock size={14} /> : 
                                 <Award size={14} />}
                              </div>
                              <div>
                                <h5 className="text-sm font-bold">{n.title}</h5>
                                <p className="text-xs text-gray-400 mt-1 leading-relaxed">{n.message}</p>
                                <span className="text-[10px] text-gray-600 mt-2 block">
                                  {format(n.timestamp, 'HH:mm')}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-2 px-3 border-r border-gray-700">
              <Flame className="text-orange-500" size={18} />
              <span className="font-bold">{profile?.streak || 0}</span>
            </div>
            <div className="flex items-center gap-2 px-3">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-500">
                  <span>Nível {profile?.level}</span>
                  <span>{profile?.xp} / {(profile?.level || 1) * 1000} XP</span>
                </div>
                <div className="w-48 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${((profile?.xp || 0) / ((profile?.level || 1) * 1000)) * 100}%` }}
                    className="h-full bg-[#D4AF37]"
                  />
                </div>
              </div>
            </div>
            <button 
              onClick={() => setActiveTab('settings')}
              className="w-10 h-10 rounded-xl overflow-hidden border-2 border-gray-700 hover:border-blue-500 transition ml-2"
            >
              {profile?.photoURL ? (
                <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-500">
                  {profile?.displayName?.[0] || 'U'}
                </div>
              )}
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <Dashboard key="dashboard" profile={profile} sessions={sessions} goals={goals} materials={materials} />}
          {activeTab === 'notes' && <Notes key="notes" user={user} notes={notes} materials={materials} />}
          {activeTab === 'materials' && <MaterialsView key="materials" user={user} materials={materials} notes={notes} sessions={sessions} />}
          {activeTab === 'flashcards' && <FlashcardsView key="flashcards" user={user} flashcards={flashcards} />}
          {activeTab === 'focus' && <FocusMode key="focus" user={user} profile={profile} materials={materials} />}
          {activeTab === 'goals' && <Goals key="goals" user={user} goals={goals} />}
          {activeTab === 'assistant' && <StudyAssistant key="assistant" />}
          {activeTab === 'ranking' && <Ranking key="ranking" profile={profile} />}
          {activeTab === 'settings' && <ProfileSettings key="settings" user={user} profile={profile} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- SCREENS ---

// --- SCREENS ---

function AuthScreen({ setProfile, isRegistering }: { setProfile: (p: UserProfile | null) => void, isRegistering: React.MutableRefObject<boolean> }) {
  const [mode, setMode] = useState<'login' | 'register' | 'recovery'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (password !== confirmPassword) throw new Error('As senhas não coincidem');
        if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres');
        isRegistering.current = true;
        const userCred = await registerWithEmail(email, password);
        await updateProfile(userCred.user, { displayName: name });
        
        // Explicitly create the profile document to ensure the name is saved
        const userRef = doc(db, 'users', userCred.user.uid);
        const newProfile: UserProfile = {
          uid: userCred.user.uid,
          displayName: name,
          email: email,
          level: 1,
          xp: 0,
          streak: 0,
          coins: 0,
          isVerified: false,
          preferences: { theme: 'dark', notifications: true, language: 'pt-BR' },
          privacy: { isPublic: false, dataControl: true }
        };
        await setDoc(userRef, newProfile);
        setProfile(newProfile);
        isRegistering.current = false;
      } else if (mode === 'login') {
        await loginWithEmail(email, password);
      } else if (mode === 'recovery') {
        await resetPassword(email);
        setSuccess('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent">
      <Card className="max-w-md w-full p-8 shadow-2xl border-gray-800/50 backdrop-blur-xl bg-black/40">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#D4AF37] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-[#D4AF37]/20">
            <Award className="text-black" size={32} />
          </div>
          <h1 className="text-3xl font-black tracking-tighter mb-2 italic uppercase">JURIS</h1>
          <p className="text-gray-500 text-sm">
            {mode === 'login' && 'Bem-vindo de volta ao Juris Aprendizado'}
            {mode === 'register' && 'Crie sua conta de estudante de elite'}
            {mode === 'recovery' && 'Recupere o acesso à sua conta'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {mode === 'register' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Nome Completo</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <Input 
                  required
                  placeholder="Seu nome" 
                  className="pl-12"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <Input 
                required
                type="email"
                placeholder="exemplo@email.com" 
                className="pl-12"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {mode !== 'recovery' && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Senha</label>
                {mode === 'login' && (
                  <button 
                    type="button"
                    onClick={() => setMode('recovery')}
                    className="text-[10px] font-bold text-blue-500 hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <Input 
                  required
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••" 
                  className="pl-12 pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Confirmar Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                <Input 
                  required
                  type="password"
                  placeholder="••••••••" 
                  className="pl-12"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          )}

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-red-500/10 border border-red-500/20 text-red-500 p-3 rounded-xl text-xs flex items-center gap-2"
              >
                <AlertCircle size={14} /> {error}
              </motion.div>
            )}
            {success && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-green-500/10 border border-green-500/20 text-green-500 p-3 rounded-xl text-xs flex items-center gap-2"
              >
                <CheckCircle size={14} /> {success}
              </motion.div>
            )}
          </AnimatePresence>

          <Button disabled={loading} className="w-full py-4 mt-4">
            {loading ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-5 h-5 border-2 border-black border-t-transparent rounded-full" />
            ) : (
              <>
                {mode === 'login' && 'Entrar'}
                {mode === 'register' && 'Criar Conta'}
                {mode === 'recovery' && 'Enviar E-mail'}
              </>
            )}
          </Button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-800"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#111] px-2 text-gray-600">Ou continue com</span></div>
        </div>

        <Button variant="outline" onClick={loginWithGoogle} className="w-full py-3 mb-8">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 mr-2" alt="Google" />
          Google
        </Button>

        <div className="text-center text-sm">
          {mode === 'login' ? (
            <p className="text-gray-500">Não tem uma conta? <button onClick={() => setMode('register')} className="text-blue-500 font-bold hover:underline">Cadastre-se</button></p>
          ) : (
            <p className="text-gray-500">Já tem uma conta? <button onClick={() => setMode('login')} className="text-blue-500 font-bold hover:underline">Entrar</button></p>
          )}
        </div>
      </Card>
    </div>
  );
}

function ProfileSettings({ user, profile }: { user: FirebaseUser, profile: UserProfile | null }) {
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'preferences' | 'privacy' | 'security'>('profile');
  const [editProfile, setEditProfile] = useState({
    displayName: '',
    bio: '',
    phone: '',
    photoURL: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [passwordData, setPasswordData] = useState({ current: '', new: '', confirm: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync editProfile with profile prop
  useEffect(() => {
    if (profile) {
      setEditProfile({
        displayName: profile.displayName || '',
        bio: profile.bio || '',
        phone: profile.phone || '',
        photoURL: profile.photoURL || ''
      });
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...editProfile,
        updatedAt: serverTimestamp()
      });
      // Update auth profile as well
      await updateProfile(user, { displayName: editProfile.displayName, photoURL: editProfile.photoURL });
      alert('Perfil atualizado com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const storageRef = ref(storage, `profiles/${user.uid}/${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      setEditProfile(prev => ({ ...prev, photoURL: url }));
      // Auto-save photo URL to firestore
      await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
      await updateProfile(user, { photoURL: url });
    } catch (error) {
      console.error("Upload error:", error);
      alert("Erro ao fazer upload da imagem.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdatePreferences = async (key: string, value: any) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        [`preferences.${key}`]: value
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const handleUpdatePrivacy = async (key: string, value: any) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        [`privacy.${key}`]: value
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    }
  };

  const handlePasswordChange = async () => {
    if (passwordData.new !== passwordData.confirm) {
      alert('As senhas não coincidem');
      return;
    }
    try {
      await updateAuthPassword(passwordData.new);
      alert('Senha alterada com sucesso!');
      setPasswordData({ current: '', new: '', confirm: '' });
    } catch (error: any) {
      alert('Erro ao alterar senha: ' + error.message);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('TEM CERTEZA? Esta ação é irreversível e todos os seus dados serão apagados.')) return;
    try {
      // Delete Firestore data
      await deleteDoc(doc(db, 'users', user.uid));
      // Delete Auth account
      await deleteAccount();
    } catch (error: any) {
      alert('Erro ao excluir conta: ' + error.message);
    }
  };

  const handleVerifyEmail = async () => {
    try {
      await sendEmailVerification(user);
      alert('E-mail de verificação enviado!');
    } catch (error: any) {
      alert('Erro: ' + error.message);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row gap-8">
        {/* SIDE NAV */}
        <aside className="w-full md:w-64 space-y-2">
          {[
            { id: 'profile', label: 'Editar Perfil', icon: <User size={18}/> },
            { id: 'preferences', label: 'Preferências', icon: <Settings size={18}/> },
            { id: 'privacy', label: 'Privacidade', icon: <Shield size={18}/> },
            { id: 'security', label: 'Segurança', icon: <Lock size={18}/> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition font-bold text-sm ${activeSubTab === tab.id ? 'bg-blue-600/10 text-blue-500 border border-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-900'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </aside>

        {/* CONTENT */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            {activeSubTab === 'profile' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <Card>
                  <h3 className="text-xl font-bold mb-6">Informações do Perfil</h3>
                  <div className="flex flex-col md:flex-row gap-8 items-start">
                    <div className="relative group">
                      <div className="w-32 h-32 bg-gray-800 rounded-3xl overflow-hidden border-4 border-gray-900 shadow-xl relative">
                        {isUploading && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-6 h-6 border-2 border-white border-t-transparent rounded-full" />
                          </div>
                        )}
                        {editProfile.photoURL ? (
                          <img src={editProfile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl font-black text-gray-700">
                            {profile?.displayName?.[0] || '?'}
                          </div>
                        )}
                      </div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handlePhotoUpload} 
                        accept="image/*" 
                        className="hidden" 
                      />
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute -bottom-2 -right-2 p-2 bg-blue-600 rounded-xl border-4 border-gray-900 hover:scale-110 transition shadow-lg"
                      >
                        <Camera size={18} />
                      </button>
                    </div>

                    <div className="flex-1 w-full space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Nome de Exibição</label>
                          <Input value={editProfile.displayName} onChange={(e) => setEditProfile({...editProfile, displayName: e.target.value})} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Telefone</label>
                          <Input value={editProfile.phone} onChange={(e) => setEditProfile({...editProfile, phone: e.target.value})} placeholder="+55 (00) 00000-0000" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Bio</label>
                        <TextArea value={editProfile.bio} onChange={(e) => setEditProfile({...editProfile, bio: e.target.value})} placeholder="Conte um pouco sobre sua jornada acadêmica..." className="min-h-[100px]" />
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={handleSaveProfile} disabled={isSaving}>
                          {isSaving ? 'Salvando...' : <><Save size={18}/> Salvar Alterações</>}
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="border-blue-500/20 bg-blue-500/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-500">
                        <Mail size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold">Verificação de E-mail</h4>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                    {user.emailVerified ? (
                      <div className="flex items-center gap-2 text-green-500 font-bold text-sm">
                        <CheckCircle size={18} /> Verificado
                      </div>
                    ) : (
                      <Button variant="outline" onClick={handleVerifyEmail} className="text-xs">Verificar Agora</Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            )}

            {activeSubTab === 'preferences' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <Card>
                  <h3 className="text-xl font-bold mb-8">Preferências do Sistema</h3>
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center text-gray-400">
                          <Moon size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold">Tema Escuro</h4>
                          <p className="text-xs text-gray-500">Ativar interface de alto contraste</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleUpdatePreferences('theme', profile?.preferences?.theme === 'dark' ? 'light' : 'dark')}
                        className={`w-12 h-6 rounded-full transition-colors relative ${profile?.preferences?.theme === 'dark' ? 'bg-blue-600' : 'bg-gray-800'}`}
                      >
                        <motion.div 
                          animate={{ x: profile?.preferences?.theme === 'dark' ? 24 : 4 }}
                          className="w-4 h-4 bg-white rounded-full absolute top-1"
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center text-gray-400">
                          <Bell size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold">Notificações</h4>
                          <p className="text-xs text-gray-500">Alertas de estudo e lembretes</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleUpdatePreferences('notifications', !profile?.preferences?.notifications)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${profile?.preferences?.notifications ? 'bg-blue-600' : 'bg-gray-800'}`}
                      >
                        <motion.div 
                          animate={{ x: profile?.preferences?.notifications ? 24 : 4 }}
                          className="w-4 h-4 bg-white rounded-full absolute top-1"
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center text-gray-400">
                          <Globe size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold">Idioma</h4>
                          <p className="text-xs text-gray-500">Idioma da interface do usuário</p>
                        </div>
                      </div>
                      <select 
                        value={profile?.preferences?.language}
                        onChange={(e) => handleUpdatePreferences('language', e.target.value)}
                        className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500"
                      >
                        <option value="pt-BR">Português (Brasil)</option>
                        <option value="en-US">English (US)</option>
                        <option value="es-ES">Español</option>
                      </select>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {activeSubTab === 'privacy' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <Card>
                  <h3 className="text-xl font-bold mb-8">Privacidade e Dados</h3>
                  <div className="space-y-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center text-gray-400">
                          <Eye size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold">Perfil Público</h4>
                          <p className="text-xs text-gray-500">Permitir que outros vejam suas estatísticas</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleUpdatePrivacy('isPublic', !profile?.privacy?.isPublic)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${profile?.privacy?.isPublic ? 'bg-blue-600' : 'bg-gray-800'}`}
                      >
                        <motion.div 
                          animate={{ x: profile?.privacy?.isPublic ? 24 : 4 }}
                          className="w-4 h-4 bg-white rounded-full absolute top-1"
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center text-gray-400">
                          <Brain size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold">Controle de Dados</h4>
                          <p className="text-xs text-gray-500">Melhorar a IA com seus dados de estudo</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleUpdatePrivacy('dataControl', !profile?.privacy?.dataControl)}
                        className={`w-12 h-6 rounded-full transition-colors relative ${profile?.privacy?.dataControl ? 'bg-blue-600' : 'bg-gray-800'}`}
                      >
                        <motion.div 
                          animate={{ x: profile?.privacy?.dataControl ? 24 : 4 }}
                          className="w-4 h-4 bg-white rounded-full absolute top-1"
                        />
                      </button>
                    </div>
                  </div>
                </Card>

                <Card className="border-red-500/20 bg-red-500/5">
                  <h4 className="font-bold text-red-500 mb-2">Zona de Perigo</h4>
                  <p className="text-xs text-gray-500 mb-6">Ao excluir sua conta, todos os seus dados (notas, flashcards, materiais) serão removidos permanentemente.</p>
                  <Button variant="danger" onClick={handleDeleteAccount} className="w-full">
                    <Trash size={18} /> Excluir Minha Conta
                  </Button>
                </Card>
              </motion.div>
            )}

            {activeSubTab === 'security' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <Card>
                  <h3 className="text-xl font-bold mb-8">Segurança da Conta</h3>
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold uppercase tracking-wider text-gray-500">Alterar Senha</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Nova Senha</label>
                          <Input type="password" value={passwordData.new} onChange={(e) => setPasswordData({...passwordData, new: e.target.value})} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase ml-1">Confirmar Nova Senha</label>
                          <Input type="password" value={passwordData.confirm} onChange={(e) => setPasswordData({...passwordData, confirm: e.target.value})} />
                        </div>
                      </div>
                      <Button onClick={handlePasswordChange} variant="outline" className="w-full md:w-auto">Atualizar Senha</Button>
                    </div>

                    <div className="pt-8 border-t border-gray-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-gray-800 rounded-xl flex items-center justify-center text-gray-400">
                            <Smartphone size={20} />
                          </div>
                          <div>
                            <h4 className="font-bold flex items-center gap-2">
                              Autenticação em Duas Etapas (2FA)
                              <span className="text-[8px] bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded-full uppercase tracking-widest">Em Breve</span>
                            </h4>
                            <p className="text-xs text-gray-500">Camada extra de segurança para sua conta</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => alert('Funcionalidade em desenvolvimento')}
                          className={`w-12 h-6 rounded-full transition-colors relative bg-gray-800`}
                        >
                          <div className="w-4 h-4 bg-white rounded-full absolute top-1 left-1" />
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ profile, sessions, goals, materials }: { profile: UserProfile | null, sessions: StudySession[], goals: Goal[], materials: Material[] }) {
  // Calculate weekly data
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = subDays(new Date(), 6 - i);
    const daySessions = sessions.filter(s => {
      const sessionDate = s.timestamp instanceof Timestamp ? s.timestamp.toDate() : new Date(s.timestamp);
      return isSameDay(sessionDate, d);
    });
    return {
      name: format(d, 'EEE'),
      minutes: daySessions.reduce((acc, s) => acc + s.duration, 0)
    };
  });

  const totalMinutes = sessions.reduce((acc, s) => acc + s.duration, 0);
  const completedGoals = goals.filter(g => g.completed).length;

  return (
    <div className="space-y-8">
      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="flex flex-col gap-2">
          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Estudado</span>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black">{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</span>
            <TrendingUp className="text-green-500 mb-1" size={16} />
          </div>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Sessões Foco</span>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black">{sessions.length}</span>
            <Zap className="text-blue-500 mb-1" size={16} />
          </div>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Metas Batidas</span>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black">{completedGoals}</span>
            <Target className="text-orange-500 mb-1" size={16} />
          </div>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider">Juris Coins</span>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-black text-[#D4AF37]">{profile?.coins || 0}</span>
            <Award className="text-[#D4AF37] mb-1" size={16} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* CHART */}
        <Card className="lg:col-span-2">
          <h3 className="text-lg font-bold mb-6">Atividade Semanal</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last7Days}>
                <defs>
                  <linearGradient id="colorMin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="name" stroke="#555" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#555" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '12px' }}
                  itemStyle={{ color: '#3b82f6' }}
                />
                <Area type="monotone" dataKey="minutes" stroke="#3b82f6" fillOpacity={1} fill="url(#colorMin)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* RECENT ACTIVITY */}
        <Card>
          <h3 className="text-lg font-bold mb-6">Últimas Sessões</h3>
          <div className="space-y-4">
            {sessions.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded-xl border border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600/10 rounded-lg flex items-center justify-center">
                    <BookOpen className="text-blue-500" size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{s.subject}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-gray-500">{format(s.timestamp instanceof Timestamp ? s.timestamp.toDate() : new Date(s.timestamp), 'dd/MM HH:mm')}</p>
                      {materials.filter(m => m.linkedSessions?.includes(s.id)).length > 0 && (
                        <div className="flex items-center gap-1 bg-blue-600/10 px-1.5 py-0.5 rounded text-[8px] text-blue-500 font-bold uppercase">
                          <LinkIcon size={8} />
                          {materials.filter(m => m.linkedSessions?.includes(s.id)).length} Mat.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-mono text-[#D4AF37]">+{s.xpEarned} XP</span>
              </div>
            ))}
            {sessions.length === 0 && <p className="text-center text-gray-600 py-10 text-sm">Nenhuma sessão registrada.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Notes({ user, notes, materials }: { user: FirebaseUser, notes: Note[], materials: Material[] }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentNote, setCurrentNote] = useState<Partial<Note>>({ title: '', content: '', subject: 'Geral' });
  const [searchTerm, setSearchTerm] = useState('');

  const saveNote = async () => {
    if (!currentNote.title || !currentNote.content) return;
    
    try {
      if (currentNote.id) {
        await updateDoc(doc(db, 'notes', currentNote.id), {
          title: currentNote.title,
          content: currentNote.content,
          subject: currentNote.subject,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'notes'), {
          title: currentNote.title,
          content: currentNote.content,
          subject: currentNote.subject,
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setIsEditing(false);
      setCurrentNote({ title: '', content: '', subject: 'Geral' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'notes');
    }
  };

  const deleteNote = async (id: string) => {
    if (!window.confirm('Deseja excluir esta nota?')) return;
    try {
      await deleteDoc(doc(db, 'notes', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'notes');
    }
  };

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    n.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const linkedMaterials = currentNote.id 
    ? materials.filter(m => m.linkedNotes?.includes(currentNote.id!))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Minhas Anotações</h3>
        <Button onClick={() => { setCurrentNote({ title: '', content: '', subject: 'Geral' }); setIsEditing(true); }}>
          <Plus size={18} /> Nova Nota
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <Input 
          placeholder="Buscar notas por título ou matéria..." 
          className="pl-12"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredNotes.map((note) => (
          <Card key={note.id} className="group hover:border-[#D4AF37]/50 transition cursor-pointer" onClick={() => { setCurrentNote(note); setIsEditing(true); }}>
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-1 rounded">
                {note.subject}
              </span>
              <span className="text-[10px] text-gray-500">
                {format(note.updatedAt instanceof Timestamp ? note.updatedAt.toDate() : new Date(note.updatedAt), 'dd/MM/yy')}
              </span>
            </div>
            <h4 className="text-lg font-bold mb-2 group-hover:text-[#D4AF37] transition">{note.title}</h4>
            <p className="text-gray-500 text-sm line-clamp-3 mb-4">{note.content}</p>
            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition">
              <button className="p-2 hover:text-blue-500" onClick={(e) => { e.stopPropagation(); setCurrentNote(note); setIsEditing(true); }}><Edit3 size={16} /></button>
              <button className="p-2 hover:text-red-500" onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}><Trash2 size={16} /></button>
            </div>
          </Card>
        ))}
      </div>

      {/* MODAL EDIT */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-gray-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl my-auto"
            >
              <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                <h4 className="text-xl font-bold">{currentNote.id ? 'Editar Nota' : 'Nova Nota'}</h4>
                <button onClick={() => setIsEditing(false)} className="text-gray-500 hover:text-white"><X size={24}/></button>
              </div>
              <div className="p-8 space-y-6 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Título</label>
                    <Input 
                      value={currentNote.title} 
                      onChange={(e) => setCurrentNote({...currentNote, title: e.target.value})}
                      placeholder="Ex: Teoria Geral do Estado"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Matéria</label>
                    <Input 
                      value={currentNote.subject} 
                      onChange={(e) => setCurrentNote({...currentNote, subject: e.target.value})}
                      placeholder="Ex: Constucional"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Conteúdo (Markdown)</label>
                  <TextArea 
                    value={currentNote.content} 
                    onChange={(e) => setCurrentNote({...currentNote, content: e.target.value})}
                    placeholder="Escreva suas anotações aqui..."
                  />
                </div>

                {currentNote.id && (
                  <div className="space-y-4">
                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                      <Paperclip size={14} /> Materiais Anexados
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {linkedMaterials.map(m => (
                        <div key={m.id} className="flex items-center justify-between p-3 bg-gray-900 rounded-xl border border-gray-800">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <FileText size={18} className="text-blue-500 flex-shrink-0" />
                            <span className="text-sm truncate">{m.name}</span>
                          </div>
                          <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white">
                            <ExternalLink size={16} />
                          </a>
                        </div>
                      ))}
                      {linkedMaterials.length === 0 && (
                        <p className="text-xs text-gray-600 italic">Nenhum material vinculado a esta nota.</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-4 pt-4">
                  <Button variant="outline" onClick={() => setIsEditing(false)}>Cancelar</Button>
                  <Button onClick={saveNote}><Save size={18} /> Salvar Nota</Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MaterialsView({ user, materials, notes, sessions }: { user: FirebaseUser, materials: Material[], notes: Note[], sessions: StudySession[] }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadData, setUploadData] = useState({ subject: 'Geral', file: null as File | null });
  const [searchTerm, setSearchTerm] = useState('');
  const [linkModal, setLinkModal] = useState<{ isOpen: boolean, materialId: string | null, tab: 'notes' | 'sessions' }>({ isOpen: false, materialId: null, tab: 'notes' });
  const [deleteConfirm, setDeleteConfirm] = useState<Material | null>(null);
  const [autoLinkSuggestions, setAutoLinkSuggestions] = useState<{ materialId: string, noteId?: string, sessionId?: string, type: 'note' | 'session', name: string }[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const suggestAutoLinks = () => {
    setIsSuggesting(true);
    const suggestions: typeof autoLinkSuggestions = [];
    
    materials.forEach(material => {
      const materialKeywords = material.name.toLowerCase()
        .replace(/\.[^/.]+$/, "") // remove extension
        .split(/[\s_-]+/)
        .filter(w => w.length > 3); // only words with more than 3 chars

      // Check Notes
      notes.forEach(note => {
        const alreadyLinked = material.linkedNotes?.includes(note.id);
        if (alreadyLinked) return;

        const noteKeywords = (note.title + " " + note.subject).toLowerCase().split(/[\s_-]+/);
        const hasOverlap = materialKeywords.some(kw => noteKeywords.includes(kw));
        
        if (hasOverlap || material.subject.toLowerCase() === note.subject.toLowerCase()) {
          suggestions.push({
            materialId: material.id,
            noteId: note.id,
            type: 'note',
            name: `Vincular "${material.name}" à anotação "${note.title}"`
          });
        }
      });

      // Check Sessions
      sessions.forEach(session => {
        const alreadyLinked = material.linkedSessions?.includes(session.id);
        if (alreadyLinked) return;

        if (material.subject.toLowerCase() === session.subject.toLowerCase()) {
          suggestions.push({
            materialId: material.id,
            sessionId: session.id,
            type: 'session',
            name: `Vincular "${material.name}" à sessão de "${session.subject}"`
          });
        }
      });
    });

    setAutoLinkSuggestions(suggestions.slice(0, 10)); // Limit to 10 suggestions
    setIsSuggesting(false);
  };

  const confirmAutoLinks = async () => {
    try {
      for (const suggestion of autoLinkSuggestions) {
        if (suggestion.type === 'note' && suggestion.noteId) {
          await toggleNoteLink(suggestion.materialId, suggestion.noteId);
        } else if (suggestion.type === 'session' && suggestion.sessionId) {
          await toggleSessionLink(suggestion.materialId, suggestion.sessionId);
        }
      }
      setAutoLinkSuggestions([]);
      alert('Links criados com sucesso!');
    } catch (error) {
      console.error('Error confirming links:', error);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadData.file) return;
    setIsUploading(true);
    try {
      const file = uploadData.file;
      const fileRef = ref(storage, `materials/${user.uid}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(fileRef, file);
      const url = await getDownloadURL(snapshot.ref);

      await addDoc(collection(db, 'materials'), {
        userId: user.uid,
        name: file.name,
        url,
        type: file.type,
        subject: uploadData.subject,
        createdAt: serverTimestamp(),
        linkedNotes: [],
        linkedSessions: []
      });
      setUploadData({ subject: 'Geral', file: null });
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deleteConfirm) return;
    try {
      // Delete from Storage
      const fileRef = ref(storage, deleteConfirm.url);
      await deleteObject(fileRef).catch(err => console.warn('Storage delete failed:', err));
      
      // Delete from Firestore
      await deleteDoc(doc(db, 'materials', deleteConfirm.id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'materials');
    }
  };

  const toggleNoteLink = async (materialId: string, noteId: string) => {
    const material = materials.find(m => m.id === materialId);
    if (!material) return;

    const linkedNotes = material.linkedNotes || [];
    const newLinks = linkedNotes.includes(noteId)
      ? linkedNotes.filter(id => id !== noteId)
      : [...linkedNotes, noteId];

    try {
      await updateDoc(doc(db, 'materials', materialId), {
        linkedNotes: newLinks
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'materials');
    }
  };

  const toggleSessionLink = async (materialId: string, sessionId: string) => {
    const material = materials.find(m => m.id === materialId);
    if (!material) return;

    const linkedSessions = material.linkedSessions || [];
    const newLinks = linkedSessions.includes(sessionId)
      ? linkedSessions.filter(id => id !== sessionId)
      : [...linkedSessions, sessionId];

    try {
      await updateDoc(doc(db, 'materials', materialId), {
        linkedSessions: newLinks
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'materials');
    }
  };

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Materiais de Estudo</h3>
        <div className="flex flex-wrap gap-4 items-center">
          <Button variant="outline" onClick={suggestAutoLinks} className="py-2">
            <Zap size={18} className="text-yellow-500" /> Auto-Link
          </Button>
          <Input 
            placeholder="Matéria" 
            className="w-40 py-2"
            value={uploadData.subject}
            onChange={(e) => setUploadData({...uploadData, subject: e.target.value})}
          />
          <input 
            type="file" 
            id="file-upload" 
            className="hidden" 
            onChange={(e) => setUploadData({...uploadData, file: e.target.files?.[0] || null})}
          />
          <label 
            htmlFor="file-upload" 
            className="bg-gray-800 text-white px-6 py-2 rounded-xl font-bold hover:bg-gray-700 transition cursor-pointer flex items-center gap-2 border border-gray-700"
          >
            <Paperclip size={18} /> {uploadData.file ? uploadData.file.name : 'Anexar Arquivo'}
          </label>
          {uploadData.file && (
            <Button onClick={handleFileUpload} disabled={isUploading}>
              {isUploading ? 'Enviando...' : 'Confirmar Upload'}
            </Button>
          )}
        </div>
      </div>

      {/* AUTO-LINK MODAL */}
      <AnimatePresence>
        {autoLinkSuggestions.length > 0 && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-gray-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Zap className="text-yellow-500" size={24} />
                  <h4 className="text-xl font-bold italic">Sugestões de Auto-Link</h4>
                </div>
                <button onClick={() => setAutoLinkSuggestions([])} className="text-gray-500 hover:text-white"><X size={24}/></button>
              </div>
              <div className="p-6 max-h-[400px] overflow-y-auto space-y-3">
                <p className="text-sm text-gray-400 mb-4">Encontramos algumas conexões inteligentes entre seus materiais e estudos. Deseja criar estes links?</p>
                {autoLinkSuggestions.map((s, idx) => (
                  <div key={idx} className="p-4 bg-gray-900/50 border border-gray-800 rounded-xl flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                      {s.type === 'note' ? <BookOpen size={16} /> : <Clock size={16} />}
                    </div>
                    <span className="text-sm font-medium flex-1">{s.name}</span>
                  </div>
                ))}
              </div>
              <div className="p-6 border-t border-gray-800 flex gap-4">
                <Button variant="outline" onClick={() => setAutoLinkSuggestions([])} className="flex-1">Cancelar</Button>
                <Button onClick={confirmAutoLinks} className="flex-1">Confirmar Todos</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <Input 
          placeholder="Buscar materiais por nome ou matéria..." 
          className="pl-12"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMaterials.map((m) => (
          <Card key={m.id} className="group hover:border-blue-500/50 transition">
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500 bg-blue-500/10 px-2 py-1 rounded">
                {m.subject}
              </span>
              <span className="text-[10px] text-gray-500">
                {format(m.createdAt instanceof Timestamp ? m.createdAt.toDate() : new Date(m.createdAt), 'dd/MM/yy')}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-4">
              {m.type.includes('image') ? <ImageIcon className="text-purple-500" /> : <FileText className="text-blue-500" />}
              <h4 className="text-lg font-bold truncate flex-1">{m.name}</h4>
            </div>
            
            <div className="flex items-center justify-between mt-6">
              <div className="flex gap-2">
                <Button variant="ghost" className="p-2 h-auto" onClick={() => setLinkModal({ isOpen: true, materialId: m.id, tab: 'notes' })}>
                  <LinkIcon size={16} />
                  <span className="text-[10px]">{ (m.linkedNotes?.length || 0) + (m.linkedSessions?.length || 0) }</span>
                </Button>
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-500 hover:text-white transition">
                  <ExternalLink size={18} />
                </a>
              </div>
              <button 
                onClick={() => setDeleteConfirm(m)}
                className="p-2 text-gray-700 hover:text-red-500 transition opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </Card>
        ))}
        {filteredMaterials.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <Upload className="mx-auto text-gray-800 mb-4" size={48} />
            <p className="text-gray-500">Nenhum material encontrado. Faça upload do seu primeiro PDF ou imagem!</p>
          </div>
        )}
      </div>

      {/* LINK MODAL */}
      <AnimatePresence>
        {linkModal.isOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                <h4 className="text-xl font-bold italic">Vincular Material</h4>
                <button onClick={() => setLinkModal({ ...linkModal, isOpen: false, materialId: null })} className="text-gray-500 hover:text-white"><X size={24}/></button>
              </div>
              
              <div className="flex border-b border-gray-800">
                <button 
                  onClick={() => setLinkModal({ ...linkModal, tab: 'notes' })}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition ${linkModal.tab === 'notes' ? 'text-blue-500 bg-blue-500/5' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Notas ({notes.length})
                </button>
                <button 
                  onClick={() => setLinkModal({ ...linkModal, tab: 'sessions' })}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-widest transition ${linkModal.tab === 'sessions' ? 'text-[#D4AF37] bg-[#D4AF37]/5' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  Sessões ({sessions.length})
                </button>
              </div>

              <div className="p-6 max-h-[400px] overflow-y-auto space-y-2">
                {linkModal.tab === 'notes' ? (
                  notes.map(note => {
                    const isLinked = materials.find(m => m.id === linkModal.materialId)?.linkedNotes?.includes(note.id);
                    return (
                      <button 
                        key={note.id}
                        onClick={() => toggleNoteLink(linkModal.materialId!, note.id)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition ${isLinked ? 'bg-blue-600/10 border-blue-500/50 text-blue-500' : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'}`}
                      >
                        <div className="text-left">
                          <p className="font-bold text-sm">{note.title}</p>
                          <p className="text-[10px] uppercase font-bold opacity-60">{note.subject}</p>
                        </div>
                        {isLinked && <Check size={18} />}
                      </button>
                    );
                  })
                ) : (
                  sessions.map(session => {
                    const isLinked = materials.find(m => m.id === linkModal.materialId)?.linkedSessions?.includes(session.id);
                    return (
                      <button 
                        key={session.id}
                        onClick={() => toggleSessionLink(linkModal.materialId!, session.id)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition ${isLinked ? 'bg-[#D4AF37]/10 border-[#D4AF37]/50 text-[#D4AF37]' : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'}`}
                      >
                        <div className="text-left">
                          <p className="font-bold text-sm">{session.subject}</p>
                          <p className="text-[10px] uppercase font-bold opacity-60">
                            {format(session.timestamp instanceof Timestamp ? session.timestamp.toDate() : new Date(session.timestamp), 'dd/MM/yy HH:mm')}
                          </p>
                        </div>
                        {isLinked && <Check size={18} />}
                      </button>
                    );
                  })
                )}
                {linkModal.tab === 'notes' && notes.length === 0 && <p className="text-center text-gray-600 py-10">Crie algumas notas primeiro para vinculá-las.</p>}
                {linkModal.tab === 'sessions' && sessions.length === 0 && <p className="text-center text-gray-600 py-10">Realize algumas sessões de estudo primeiro.</p>}
              </div>
              <div className="p-6 border-t border-gray-800 flex justify-end">
                <Button onClick={() => setLinkModal({ ...linkModal, isOpen: false, materialId: null })}>Concluído</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE CONFIRM MODAL */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-gray-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="text-red-500" size={32} />
              </div>
              <h4 className="text-xl font-bold mb-2">Excluir Material?</h4>
              <p className="text-gray-500 text-sm mb-8">
                Tem certeza que deseja excluir <span className="text-white font-bold">"{deleteConfirm.name}"</span>? 
                Esta ação removerá o arquivo permanentemente e não pode ser desfeita.
              </p>
              <div className="flex gap-4">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirm(null)}>
                  Cancelar
                </Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700 border-none" onClick={handleDeleteMaterial}>
                  Excluir
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FocusMode({ user, profile, materials }: { user: FirebaseUser, profile: UserProfile | null, materials: Material[] }) {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [subject, setSubject] = useState('Geral');
  const [isFinished, setIsFinished] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      handleFinish();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive, timeLeft]);

  const handleFinish = async () => {
    setIsActive(false);
    setIsFinished(true);
    
    const xpGained = 50; // Base XP for a session
    const coinsGained = 10;

    try {
      // Record Session
      const sessionRef = await addDoc(collection(db, 'study_sessions'), {
        userId: user.uid,
        subject,
        duration: 25,
        timestamp: serverTimestamp(),
        xpEarned: xpGained
      });

      // Link selected materials to this session
      for (const materialId of selectedMaterials) {
        const material = materials.find(m => m.id === materialId);
        if (material) {
          const linkedSessions = material.linkedSessions || [];
          if (!linkedSessions.includes(sessionRef.id)) {
            await updateDoc(doc(db, 'materials', materialId), {
              linkedSessions: [...linkedSessions, sessionRef.id]
            });
          }
        }
      }

      // Update User Profile
      const userRef = doc(db, 'users', user.uid);
      const newXp = (profile?.xp || 0) + xpGained;
      const newLevel = Math.floor(newXp / 1000) + 1;
      
      await updateDoc(userRef, {
        xp: newXp,
        level: newLevel,
        coins: (profile?.coins || 0) + coinsGained,
        lastStudyDate: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'study_sessions');
    }
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(25 * 60);
    setIsFinished(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleMaterialSelection = (id: string) => {
    setSelectedMaterials(prev => 
      prev.includes(id) ? prev.filter(mId => mId !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col items-center justify-center py-10 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
        <div className="lg:col-span-2">
          <Card className="w-full text-center py-16 px-10 relative overflow-hidden">
            {/* PROGRESS RING BACKGROUND */}
            <div className="absolute inset-0 flex items-center justify-center opacity-5">
              <Clock size={400} />
            </div>

            <div className="relative z-10">
              <div className="mb-8">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Matéria em Foco</label>
                <Input 
                  value={subject} 
                  onChange={(e) => setSubject(e.target.value)}
                  className="text-center text-xl font-bold bg-transparent border-none focus:border-none"
                  placeholder="Ex: Direito Civil"
                />
              </div>

              <div className="relative w-72 h-72 flex items-center justify-center mx-auto mb-12">
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle 
                    cx="144" cy="144" r="130" 
                    fill="none" stroke="#222" strokeWidth="8" 
                  />
                  <motion.circle 
                    cx="144" cy="144" r="130" 
                    fill="none" stroke={isActive ? "#3b82f6" : "#D4AF37"} strokeWidth="8" 
                    strokeDasharray="816"
                    animate={{ strokeDashoffset: 816 - (816 * (timeLeft / (25 * 60))) }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                </svg>
                <span className="text-7xl font-black font-mono tracking-tighter tabular-nums">
                  {formatTime(timeLeft)}
                </span>
              </div>

              <div className="flex gap-4 justify-center">
                {!isActive ? (
                  <Button variant="secondary" className="px-12 py-4 text-lg" onClick={() => setIsActive(true)}>
                    <Play size={24}/> Iniciar
                  </Button>
                ) : (
                  <Button variant="outline" className="px-12 py-4 text-lg" onClick={() => setIsActive(false)}>
                    <Pause size={24}/> Pausar
                  </Button>
                )}
                <Button variant="ghost" onClick={resetTimer}><RotateCcw size={20}/></Button>
              </div>

              {isFinished && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-10 p-4 bg-green-500/10 border border-green-500/20 rounded-2xl text-green-500 font-bold flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={20} /> Sessão concluída! +50 XP
                </motion.div>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="h-full flex flex-col p-6">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <LinkIcon size={16} className="text-blue-500" />
              Vincular Materiais
            </h3>
            <p className="text-[10px] text-gray-500 uppercase font-bold mb-4">Selecione materiais para esta sessão</p>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {materials.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleMaterialSelection(m.id)}
                  className={`w-full p-3 rounded-xl border text-left transition ${selectedMaterials.includes(m.id) ? 'bg-blue-600/10 border-blue-500/50 text-blue-500' : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'}`}
                >
                  <p className="text-xs font-bold truncate">{m.name}</p>
                  <p className="text-[8px] uppercase font-bold opacity-60">{m.subject}</p>
                </button>
              ))}
              {materials.length === 0 && (
                <div className="text-center py-10">
                  <FileText className="mx-auto text-gray-800 mb-2" size={24} />
                  <p className="text-[10px] text-gray-600">Nenhum material disponível</p>
                </div>
              )}
            </div>
            
            {selectedMaterials.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-800">
                <p className="text-[10px] text-blue-500 font-bold">{selectedMaterials.length} materiais selecionados</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-12 grid grid-cols-3 gap-6 w-full">
        <div className="text-center">
          <p className="text-gray-500 text-[10px] font-bold uppercase mb-1">Ciclo</p>
          <p className="font-bold">25 min</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500 text-[10px] font-bold uppercase mb-1">Descanso</p>
          <p className="font-bold">5 min</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500 text-[10px] font-bold uppercase mb-1">Recompensa</p>
          <p className="font-bold text-[#D4AF37]">10 Coins</p>
        </div>
      </div>
    </div>
  );
}

function Goals({ user, goals }: { user: FirebaseUser, goals: Goal[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', target: 10 });

  const addGoal = async () => {
    if (!newGoal.title) return;
    try {
      await addDoc(collection(db, 'goals'), {
        userId: user.uid,
        title: newGoal.title,
        target: newGoal.target,
        current: 0,
        deadline: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 days from now
        completed: false
      });
      setIsAdding(false);
      setNewGoal({ title: '', target: 10 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'goals');
    }
  };

  const updateProgress = async (goal: Goal, increment: number) => {
    const newCurrent = Math.max(0, Math.min(goal.target, goal.current + increment));
    try {
      await updateDoc(doc(db, 'goals', goal.id), {
        current: newCurrent,
        completed: newCurrent === goal.target
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'goals');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Metas de Estudo</h3>
        <Button onClick={() => setIsAdding(true)}><Plus size={18} /> Definir Meta</Button>
      </div>

      <div className="space-y-4">
        {goals.map((goal) => (
          <Card key={goal.id} className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <h4 className="text-lg font-bold mb-1">{goal.title}</h4>
              <p className="text-xs text-gray-500">Expira em {format(goal.deadline instanceof Timestamp ? goal.deadline.toDate() : new Date(goal.deadline), 'dd/MM/yy')}</p>
            </div>
            
            <div className="flex items-center gap-6 w-full md:w-auto">
              <div className="flex-1 md:w-64">
                <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                  <span>Progresso</span>
                  <span>{goal.current} / {goal.target}</span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(goal.current / goal.target) * 100}%` }}
                    className={`h-full ${goal.completed ? 'bg-green-500' : 'bg-blue-500'}`}
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => updateProgress(goal, -1)}
                  className="w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center hover:bg-gray-800 transition"
                >
                  -
                </button>
                <button 
                  onClick={() => updateProgress(goal, 1)}
                  className="w-8 h-8 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center hover:bg-gray-800 transition"
                >
                  +
                </button>
              </div>

              {goal.completed && (
                <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center text-green-500">
                  <Check size={20} />
                </div>
              )}
            </div>
          </Card>
        ))}
        {goals.length === 0 && <p className="text-center text-gray-600 py-20">Você ainda não definiu nenhuma meta.</p>}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-gray-800 rounded-3xl w-full max-w-md p-8 space-y-6"
            >
              <h4 className="text-xl font-bold">Nova Meta</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">O que você quer alcançar?</label>
                  <Input 
                    placeholder="Ex: Resolver 50 questões" 
                    value={newGoal.title}
                    onChange={(e) => setNewGoal({...newGoal, title: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Quantidade Alvo</label>
                  <Input 
                    type="number" 
                    value={newGoal.target}
                    onChange={(e) => setNewGoal({...newGoal, target: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-4 pt-4">
                <Button variant="outline" onClick={() => setIsAdding(false)}>Cancelar</Button>
                <Button onClick={addGoal}>Criar Meta</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Ranking({ profile }: { profile: UserProfile | null }) {
  const [topUsers, setTopUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('xp', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTopUsers(snapshot.docs.map(doc => doc.data() as UserProfile));
    });
    return () => unsubscribe();
  }, []);

  return (
    <Card className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="text-[#D4AF37]" /> Ranking Global - Liga Juris
        </h3>
        <div className="px-3 py-1 bg-[#D4AF37]/10 rounded-full border border-[#D4AF37]/20 text-[#D4AF37] text-[10px] font-bold uppercase tracking-wider">
          Temporada 1
        </div>
      </div>

      <div className="space-y-2">
        {topUsers.map((u, i) => (
          <motion.div 
            key={u.uid}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className={`flex items-center justify-between p-4 rounded-2xl border transition ${u.uid === profile?.uid ? 'bg-blue-600/10 border-blue-500/30' : 'bg-gray-900/30 border-gray-800 hover:border-gray-700'}`}
          >
            <div className="flex items-center gap-4">
              <span className={`w-8 font-black italic text-lg ${i === 0 ? 'text-[#D4AF37]' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-600' : 'text-gray-600'}`}>
                #{i + 1}
              </span>
              <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center font-bold text-gray-400">
                {u.displayName?.[0] || '?'}
              </div>
              <div>
                <p className="font-bold">{u.displayName} {u.uid === profile?.uid && <span className="text-xs text-blue-500 ml-2">(Você)</span>}</p>
                <p className="text-[10px] text-gray-500 uppercase font-bold">Nível {u.level}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono font-bold text-[#D4AF37]">{u.xp.toLocaleString()} XP</p>
              <div className="flex items-center gap-1 justify-end text-orange-500">
                <Flame size={12} />
                <span className="text-[10px] font-bold">{u.streak}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

function FlashcardsView({ user, flashcards }: { user: FirebaseUser, flashcards: Flashcard[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [isQuizMode, setIsQuizMode] = useState(false);
  const [newCard, setNewCard] = useState({ front: '', back: '', subject: 'Geral' });
  const [searchTerm, setSearchTerm] = useState('');

  const addCard = async () => {
    if (!newCard.front || !newCard.back) return;
    try {
      await addDoc(collection(db, 'flashcards'), {
        userId: user.uid,
        front: newCard.front,
        back: newCard.back,
        subject: newCard.subject,
        nextReview: serverTimestamp(),
        interval: 0,
        easeFactor: 2.5,
        repetition: 0
      });
      setIsAdding(false);
      setNewCard({ front: '', back: '', subject: 'Geral' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'flashcards');
    }
  };

  const dueCards = flashcards.filter(card => {
    const nextReview = card.nextReview instanceof Timestamp ? card.nextReview.toDate() : new Date(card.nextReview);
    return nextReview <= new Date();
  });

  const filteredCards = flashcards.filter(c => 
    c.front.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isQuizMode) {
    return <QuizSession cards={dueCards} onFinish={() => setIsQuizMode(false)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold">Biblioteca de Flashcards</h3>
          <p className="text-sm text-gray-500">{dueCards.length} cards para revisar hoje</p>
        </div>
        <div className="flex gap-4">
          <Button variant="secondary" disabled={dueCards.length === 0} onClick={() => setIsQuizMode(true)}>
            <Play size={18} /> Iniciar Revisão
          </Button>
          <Button onClick={() => setIsAdding(true)}>
            <Plus size={18} /> Novo Card
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
        <Input 
          placeholder="Buscar cards..." 
          className="pl-12"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCards.map((card) => (
          <Card key={card.id} className="group hover:border-[#D4AF37]/50 transition">
            <div className="flex justify-between items-start mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-1 rounded">
                {card.subject}
              </span>
              <span className="text-[10px] text-gray-500">
                Prox: {format(card.nextReview instanceof Timestamp ? card.nextReview.toDate() : new Date(card.nextReview), 'dd/MM')}
              </span>
            </div>
            <h4 className="text-lg font-bold mb-2">{card.front}</h4>
            <p className="text-gray-500 text-sm line-clamp-2">{card.back}</p>
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-gray-800 rounded-3xl w-full max-w-md p-8 space-y-6"
            >
              <h4 className="text-xl font-bold">Novo Flashcard</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Frente (Pergunta)</label>
                  <Input 
                    placeholder="Ex: O que é o Princípio da Legalidade?" 
                    value={newCard.front}
                    onChange={(e) => setNewCard({...newCard, front: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Verso (Resposta)</label>
                  <TextArea 
                    placeholder="Ex: Não há crime sem lei anterior que o defina..." 
                    className="min-h-[100px]"
                    value={newCard.back}
                    onChange={(e) => setNewCard({...newCard, back: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Matéria</label>
                  <Input 
                    placeholder="Ex: Direito Penal" 
                    value={newCard.subject}
                    onChange={(e) => setNewCard({...newCard, subject: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-4 pt-4">
                <Button variant="outline" onClick={() => setIsAdding(false)}>Cancelar</Button>
                <Button onClick={addCard}>Criar Card</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuizSession({ cards, onFinish }: { cards: Flashcard[], onFinish: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [isAIGenerating, setIsAIGenerating] = useState(false);
  const [aiQuestion, setAiQuestion] = useState<string | null>(null);

  const currentCard = cards[currentIndex];

  const handleGrade = async (grade: number) => {
    // SM-2 Algorithm simplified
    let { interval, repetition, easeFactor } = currentCard;

    if (grade >= 3) {
      if (repetition === 0) interval = 1;
      else if (repetition === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      repetition++;
    } else {
      repetition = 0;
      interval = 1;
    }

    easeFactor = easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    try {
      await updateDoc(doc(db, 'flashcards', currentCard.id), {
        interval,
        repetition,
        easeFactor,
        nextReview: Timestamp.fromDate(nextReview)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'flashcards');
    }

    if (currentIndex + 1 < cards.length) {
      setCurrentIndex(prev => prev + 1);
      setShowAnswer(false);
      setAiQuestion(null);
    } else {
      onFinish();
    }
  };

  const generateAIQuestion = async () => {
    setIsAIGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Com base no seguinte flashcard (Frente: ${currentCard.front}, Verso: ${currentCard.back}), crie uma pergunta de múltipla escolha ou um desafio prático para testar o conhecimento do aluno. Retorne apenas a pergunta/desafio.`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      setAiQuestion(response.text || "Não foi possível gerar a pergunta.");
    } catch (error) {
      console.error("AI Quiz Error:", error);
    } finally {
      setIsAIGenerating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-10">
      <div className="flex justify-between items-center text-sm text-gray-500">
        <span>Card {currentIndex + 1} de {cards.length}</span>
        <button onClick={onFinish} className="hover:text-white">Sair</button>
      </div>

      <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          className="h-full bg-blue-500"
        />
      </div>

      <Card className="min-h-[300px] flex flex-col items-center justify-center text-center p-12 relative">
        <AnimatePresence mode="wait">
          {!showAnswer ? (
            <motion.div 
              key="front"
              initial={{ opacity: 0, rotateY: 90 }}
              animate={{ opacity: 1, rotateY: 0 }}
              exit={{ opacity: 0, rotateY: -90 }}
              className="space-y-6"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full">Pergunta</span>
              <h3 className="text-2xl font-bold leading-relaxed">{currentCard.front}</h3>
              
              {aiQuestion && (
                <div className="mt-6 p-4 bg-gray-900 rounded-xl border border-gray-800 text-left">
                  <p className="text-xs font-bold text-[#D4AF37] mb-2 uppercase flex items-center gap-2">
                    <Brain size={14} /> Desafio IA
                  </p>
                  <p className="text-sm text-gray-300 italic">{aiQuestion}</p>
                </div>
              )}

              <div className="flex gap-4 justify-center mt-8">
                <Button onClick={() => setShowAnswer(true)} className="px-10">Ver Resposta</Button>
                <Button variant="outline" onClick={generateAIQuestion} disabled={isAIGenerating}>
                  {isAIGenerating ? "Gerando..." : "Desafio IA"}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="back"
              initial={{ opacity: 0, rotateY: 90 }}
              animate={{ opacity: 1, rotateY: 0 }}
              exit={{ opacity: 0, rotateY: -90 }}
              className="space-y-6"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-green-500 bg-green-500/10 px-3 py-1 rounded-full">Resposta</span>
              <p className="text-xl leading-relaxed text-gray-200">{currentCard.back}</p>
              
              <div className="pt-10 space-y-4">
                <p className="text-xs text-gray-500 font-bold uppercase">Como foi seu desempenho?</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Difícil', grade: 1, color: 'hover:bg-red-500' },
                    { label: 'Bom', grade: 3, color: 'hover:bg-blue-500' },
                    { label: 'Fácil', grade: 4, color: 'hover:bg-green-500' },
                    { label: 'Perfeito', grade: 5, color: 'hover:bg-[#D4AF37]' },
                  ].map((btn) => (
                    <button 
                      key={btn.grade}
                      onClick={() => handleGrade(btn.grade)}
                      className={`p-3 rounded-xl border border-gray-800 text-xs font-bold transition-all ${btn.color} hover:text-black hover:border-transparent`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}

function StudyAssistant() {
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: userMsg,
        config: {
          systemInstruction: "Você é o Juris AI, um assistente de estudos universitários de elite. Ajude o estudante a organizar cronogramas, explicar conceitos complexos (especialmente de Direito), resumir conteúdos e motivar o aprendizado. Seja profissional, encorajador e direto."
        }
      });
      
      setMessages(prev => [...prev, { role: 'ai', text: response.text || "Desculpe, tive um problema ao processar sua solicitação." }]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, { role: 'ai', text: "Erro ao conectar com a IA. Verifique sua chave de API." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <Card className="max-w-4xl mx-auto h-[700px] flex flex-col p-0 overflow-hidden">
      <div className="p-6 border-b border-gray-800 flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center">
          <BrainCircuit className="text-blue-500" size={24} />
        </div>
        <div>
          <h3 className="font-bold">Juris AI Assistant</h3>
          <p className="text-[10px] text-gray-500 uppercase font-bold">Inteligência de Estudo Ativa</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
        {messages.length === 0 && (
          <div className="text-center py-20">
            <BrainCircuit className="mx-auto text-gray-800 mb-4" size={48} />
            <p className="text-gray-500 text-sm">Olá! Eu sou o Juris AI. Como posso ajudar seus estudos hoje?</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {["Explique o Princípio da Dignidade Humana", "Crie um cronograma de 4h", "Resuma o conceito de Posse"].map(q => (
                <button key={q} onClick={() => setInput(q)} className="text-xs px-4 py-2 bg-gray-900 border border-gray-800 rounded-full hover:border-blue-500 transition">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] p-4 rounded-2xl ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-900 border border-gray-800 text-gray-200'}`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
            </div>
          </motion.div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce [animation-delay:0.4s]"></span>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 border-t border-gray-800 bg-gray-900/30">
        <div className="flex gap-4">
          <Input 
            placeholder="Pergunte qualquer coisa sobre seus estudos..." 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <Button onClick={sendMessage} disabled={isTyping}>
            <Play size={18} />
          </Button>
        </div>
      </div>
    </Card>
  );
}
