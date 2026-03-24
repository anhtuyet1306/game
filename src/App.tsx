import React, { useState, useEffect, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, Play, RotateCcw, CheckCircle2, XCircle, Trophy, Lightbulb, BookOpen, Calculator, Clock, Volume2, VolumeX, User, LogOut, BarChart3, ListOrdered, AlertCircle, Edit2, Check, X } from 'lucide-react';
import { LOGIC_QUESTIONS, PROVERB_QUESTIONS, GENZ_QUESTIONS } from './questions';
import { initAudio, toggleMute, getIsMuted, playCorrect, playIncorrect, playTimeout, playClick, playGameOver } from './audio';
import { auth, loginWithGoogle, handleRedirectResult, logoutUser, saveGameRecord, subscribeToLeaderboard, subscribeToUserStats, updateUsername, subscribeToUserProfile } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Đã có lỗi xảy ra. Vui lòng thử lại sau.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `Lỗi hệ thống: ${parsed.error}`;
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
          <div className="bg-slate-900 border border-red-500/30 p-8 rounded-3xl max-w-md shadow-2xl">
            <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Rất tiếc!</h2>
            <p className="text-slate-400 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

type QuestionType = 'math' | 'logic' | 'proverb';

type Question = {
  id: string;
  type: QuestionType;
  text: string;
  options: string[];
  answer: string;
  explanation?: string;
};

const shuffleArray = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

const generateMathQuestion = (id: number): Question => {
  const operators = ['+', '-', '×'];
  const op = operators[Math.floor(Math.random() * operators.length)];
  let a, b, answer;
  
  if (op === '+') {
    a = Math.floor(Math.random() * 50) + 1;
    b = Math.floor(Math.random() * 50) + 1;
    answer = a + b;
  } else if (op === '-') {
    a = Math.floor(Math.random() * 50) + 20;
    b = Math.floor(Math.random() * a); 
    answer = a - b;
  } else {
    a = Math.floor(Math.random() * 15) + 2;
    b = Math.floor(Math.random() * 10) + 2;
    answer = a * b;
  }
  
  const options = new Set<number>([answer]);
  while (options.size < 4) {
    const offset = Math.floor(Math.random() * 20) - 10;
    const wrongAnswer = answer + offset + (offset === 0 ? 1 : 0);
    if (wrongAnswer >= 0) options.add(wrongAnswer);
  }

  return {
    id: `m${id}`,
    type: 'math',
    text: `${a} ${op} ${b} = ?`,
    options: shuffleArray(Array.from(options).map(String)),
    answer: answer.toString(),
  };
};

const generateGameSession = (): Question[] => {
  // 5 Math, 5 Logic, 5 Proverbs, 5 GenZ = 20 questions per session
  const mathQs = Array.from({ length: 5 }, (_, i) => generateMathQuestion(i));
  
  const shuffledLogic = shuffleArray(LOGIC_QUESTIONS).slice(0, 5).map((q, i) => ({
    id: `l${i}`, type: 'logic' as QuestionType, text: q.text, options: shuffleArray(q.options), answer: q.answer
  }));
  
  const shuffledProverbs = shuffleArray(PROVERB_QUESTIONS).slice(0, 5).map((q, i) => ({
    id: `p${i}`, type: 'proverb' as QuestionType, text: q.text, options: shuffleArray(q.options), answer: q.answer
  }));

  const shuffledGenZ = shuffleArray(GENZ_QUESTIONS).slice(0, 5).map((q, i) => ({
    id: `g${i}`, type: 'logic' as QuestionType, text: q.text, options: shuffleArray(q.options), answer: q.answer
  }));

  return shuffleArray([...mathQs, ...shuffledLogic, ...shuffledProverbs, ...shuffledGenZ]);
};

type GameState = 'home' | 'playing' | 'gameover' | 'auth' | 'leaderboard' | 'stats';
const TIME_PER_QUESTION = 15;

export default function App() {
  return (
    <ErrorBoundary>
      <GameContent />
    </ErrorBoundary>
  );
}

function GameContent() {
  const [gameState, setGameState] = useState<GameState>('home');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | 'timeout' | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [isMuted, setIsMuted] = useState(getIsMuted());
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');

  // Leaderboard & Stats state
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);
    });

    // Check for redirect result on mount
    const checkRedirect = async () => {
      try {
        const user = await handleRedirectResult();
        if (user) {
          setCurrentUser(user);
          setGameState('home');
        }
      } catch (error) {
        console.error("Redirect check failed", error);
      }
    };
    checkRedirect();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser) {
      const unsubscribe = subscribeToUserProfile(currentUser.uid, (profile) => {
        setUserProfile(profile);
        setNewName(profile.username);
      });
      return () => unsubscribe();
    } else {
      setUserProfile(null);
    }
  }, [currentUser]);

  useEffect(() => {
    if (gameState === 'leaderboard') {
      const unsubscribe = subscribeToLeaderboard(setLeaderboard);
      return () => unsubscribe();
    } else if (gameState === 'stats' && currentUser) {
      const unsubscribe = subscribeToUserStats(currentUser.uid, setStats);
      return () => unsubscribe();
    }
  }, [gameState, currentUser]);

  const handleLogin = async () => {
    try {
      const user = await loginWithGoogle();
      if (user) {
        setGameState('home');
      }
    } catch (error: any) {
      console.error('Login failed', error);
      const errorCode = error.code || 'unknown';
      
      if (errorCode === 'auth/unauthorized-domain') {
        alert("Lỗi: Tên miền này chưa được cấp phép trong Firebase. Vui lòng thêm 'game-coral-six-89.vercel.app' vào danh sách 'Authorized domains' trong Firebase Console.");
      } else if (error.message?.includes('disallowed_useragent') || errorCode === 'auth/web-storage-unsupported') {
        alert("Google không cho phép đăng nhập bên trong ứng dụng Zalo/Facebook. Vui lòng nhấn vào dấu 3 chấm (...) ở góc trên bên phải và chọn 'Mở bằng trình duyệt' (Safari/Chrome) để chơi.");
      } else if (window.self !== window.top) {
        alert(`Đăng nhập bị chặn (Lỗi: ${errorCode}). Vui lòng nhấn vào biểu tượng 'Mở trong tab mới' (ở góc trên bên phải) để đăng nhập.`);
      } else {
        alert(`Đăng nhập thất bại (Lỗi: ${errorCode}). Vui lòng kiểm tra kết nối mạng hoặc thử lại sau.`);
      }
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setUserProfile(null);
    setGameState('home');
  };

  const handleUpdateName = async () => {
    if (currentUser && newName.trim() && newName.length <= 20) {
      try {
        await updateUsername(currentUser.uid, newName.trim());
        setIsEditingName(false);
      } catch (error) {
        console.error('Update name failed', error);
      }
    }
  };

  const handleToggleMute = () => {
    setIsMuted(toggleMute());
  };

  const startGame = () => {
    initAudio();
    playClick();
    setQuestions(generateGameSession());
    setCurrentIndex(0);
    setScore(0);
    setUserAnswer('');
    setFeedback(null);
    setTimeLeft(TIME_PER_QUESTION);
    setGameState('playing');
  };

  const moveToNextQuestion = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(i => i + 1);
      setUserAnswer('');
      setFeedback(null);
      setTimeLeft(TIME_PER_QUESTION);
    } else {
      playGameOver();
      if (currentUser) {
        saveGameRecord(currentUser.uid, userProfile?.username || currentUser.displayName || 'Người chơi', score, questions.length);
      }
      setGameState('gameover');
    }
  }, [currentIndex, questions.length, currentUser, score, userProfile]);

  const handleTimeOut = useCallback(() => {
    setFeedback('timeout');
    setUserAnswer('');
    playTimeout();
    setTimeout(() => {
      moveToNextQuestion();
    }, 2000);
  }, [moveToNextQuestion]);

  useEffect(() => {
    if (gameState === 'playing' && feedback === null) {
      if (timeLeft > 0) {
        const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        handleTimeOut();
      }
    }
  }, [timeLeft, gameState, feedback, handleTimeOut]);

  const handleAnswer = (selectedOption: string) => {
    if (feedback !== null) return;

    const currentQ = questions[currentIndex];
    const isCorrect = selectedOption === currentQ.answer;
    setUserAnswer(selectedOption);

    if (isCorrect) {
      setScore(s => s + 1);
      setFeedback('correct');
      playCorrect();
    } else {
      setFeedback('incorrect');
      playIncorrect();
    }

    setTimeout(() => {
      moveToNextQuestion();
    }, 2000);
  };

  const getTypeIcon = (type: QuestionType) => {
    switch (type) {
      case 'math': return <Calculator size={20} className="text-blue-400" />;
      case 'logic': return <Lightbulb size={20} className="text-yellow-400" />;
      case 'proverb': return <BookOpen size={20} className="text-emerald-400" />;
    }
  };

  const getTypeName = (type: QuestionType) => {
    switch (type) {
      case 'math': return 'Toán học';
      case 'logic': return 'Đố mẹo';
      case 'proverb': return 'Ca dao tục ngữ';
    }
  };

  const currentQ = questions[currentIndex];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden flex items-center justify-center p-4 relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-purple-950 to-slate-950">
      
      {/* Top Navigation */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-50">
        <div className="flex gap-2">
          {isAuthReady && currentUser ? (
            <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-md border border-slate-700 px-4 py-2 rounded-full shadow-lg">
              <User size={18} className="text-indigo-400" />
              {isEditingName ? (
                <div className="flex items-center gap-1">
                  <input 
                    type="text" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-slate-700 border border-slate-600 rounded px-2 py-0.5 text-xs text-white focus:outline-none w-24"
                    maxLength={20}
                    autoFocus
                  />
                  <button onClick={handleUpdateName} className="text-green-400 hover:text-green-300">
                    <Check size={14} />
                  </button>
                  <button onClick={() => { setIsEditingName(false); setNewName(userProfile?.username || ''); }} className="text-red-400 hover:text-red-300">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <span className="text-sm font-semibold text-slate-300">{userProfile?.username || currentUser.displayName}</span>
                  <button onClick={() => setIsEditingName(true)} className="text-slate-500 hover:text-indigo-400 transition-colors">
                    <Edit2 size={14} />
                  </button>
                </>
              )}
              <button onClick={handleLogout} className="ml-2 text-slate-500 hover:text-red-400 transition-colors">
                <LogOut size={16} />
              </button>
            </div>
          ) : isAuthReady ? (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 bg-indigo-600/80 hover:bg-indigo-500 backdrop-blur-md border border-indigo-500/50 px-4 py-2 rounded-full shadow-lg text-sm font-semibold transition-colors"
            >
              <User size={18} /> Đăng nhập Google
            </button>
          ) : (
            <div className="w-32 h-10 bg-slate-800/50 animate-pulse rounded-full"></div>
          )}
          
          {gameState !== 'home' && (
            <button 
              onClick={() => setGameState('home')}
              className="bg-slate-800/80 backdrop-blur-md border border-slate-700 px-4 py-2 rounded-full shadow-lg text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              Trang chủ
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setGameState('leaderboard')}
            className="p-3 bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-full shadow-lg text-yellow-500 hover:text-yellow-400 hover:bg-slate-700 transition-colors"
            title="Bảng xếp hạng"
          >
            <ListOrdered size={20} />
          </button>
          {currentUser && (
            <button 
              onClick={() => setGameState('stats')}
              className="p-3 bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-full shadow-lg text-emerald-500 hover:text-emerald-400 hover:bg-slate-700 transition-colors"
              title="Thống kê"
            >
              <BarChart3 size={20} />
            </button>
          )}
          <button 
            onClick={handleToggleMute}
            className="p-3 bg-slate-800/80 backdrop-blur-md border border-slate-700 rounded-full shadow-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {gameState === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
          >
            <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden p-8 text-center border border-slate-700/50">
              <div className="w-24 h-24 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-6 border border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                <Brain size={48} />
              </div>
              <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 mb-4 tracking-tight">Puzzle Game</h1>
              <p className="text-slate-400 mb-8 leading-relaxed">
                Thử thách trí não với 100+ câu hỏi Toán học, Đố mẹo logic và Ca dao tục ngữ Việt Nam!
              </p>
              
              <div className="flex justify-center gap-6 mb-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center shadow-inner"><Calculator className="text-blue-400" size={24} /></div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Toán học</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center shadow-inner"><Lightbulb className="text-yellow-400" size={24} /></div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Đố mẹo</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center shadow-inner"><BookOpen className="text-emerald-400" size={24} /></div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tục ngữ</span>
                </div>
              </div>

              <button onClick={startGame} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] hover:-translate-y-1">
                <Play size={24} fill="currentColor" />
                BẮT ĐẦU CHƠI
              </button>
            </div>
          </motion.div>
        )}

        {gameState === 'playing' && currentQ && (
          <motion.div
            key="playing"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-lg"
          >
            <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden p-6 md:p-8 border border-slate-700/50">
              {/* Header */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-4 py-2 rounded-full shadow-inner w-full sm:w-auto justify-center">
                  {getTypeIcon(currentQ.type)}
                  <span className="text-sm font-bold text-slate-300 uppercase tracking-wider">{getTypeName(currentQ.type)}</span>
                </div>
                <div className="text-indigo-300 font-bold bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 rounded-full w-full sm:w-auto text-center">
                  Câu {currentIndex + 1}/{questions.length}
                </div>
              </div>

              {/* Timer Bar */}
              <div className="w-full bg-slate-800 h-3 rounded-full mb-8 overflow-hidden relative shadow-inner border border-slate-700/50">
                <motion.div 
                  className={`h-full absolute left-0 top-0 ${timeLeft <= 5 ? 'bg-gradient-to-r from-red-500 to-orange-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]'}`}
                  initial={{ width: '100%' }}
                  animate={{ width: `${(timeLeft / TIME_PER_QUESTION) * 100}%` }}
                  transition={{ duration: 1, ease: "linear" }}
                />
              </div>
              
              {/* Question */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                  className="text-center mb-8 min-h-[120px] flex items-center justify-center"
                >
                  <h2 className={`font-black text-white tracking-tight leading-tight drop-shadow-md ${currentQ.text.length > 40 ? 'text-2xl md:text-3xl' : 'text-4xl md:text-5xl'}`}>
                    {currentQ.text}
                  </h2>
                </motion.div>
              </AnimatePresence>

              {/* Options Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {currentQ.options.map((opt, idx) => {
                  let btnClass = "bg-slate-800/50 border-2 border-slate-700 text-slate-300 hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-300 shadow-sm";
                  
                  if (feedback !== null) {
                    if (opt === currentQ.answer) {
                      btnClass = "bg-green-500/20 border-2 border-green-500 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)] z-10 scale-[1.02]";
                    } else if (opt === userAnswer) {
                      btnClass = "bg-red-500/20 border-2 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]";
                    } else {
                      btnClass = "bg-slate-800/30 border-2 border-slate-800 text-slate-600 opacity-50";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(opt)}
                      disabled={feedback !== null}
                      className={`p-4 rounded-xl font-bold text-lg transition-all duration-200 cursor-pointer disabled:cursor-default flex items-center justify-center text-center min-h-[80px] ${btnClass}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              
              {/* Feedback Area */}
              <div className="min-h-[80px] flex flex-col items-center justify-center mt-6">
                <AnimatePresence mode="wait">
                  {feedback === 'correct' && (
                    <motion.div key="correct" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 text-green-400 font-bold text-2xl bg-green-500/10 border border-green-500/20 px-6 py-2 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.2)]">
                        <CheckCircle2 size={28} /> Chính xác!
                      </div>
                      {currentQ.explanation && (
                        <p className="text-slate-400 text-sm mt-2 text-center italic px-4">{currentQ.explanation}</p>
                      )}
                    </motion.div>
                  )}
                  {feedback === 'incorrect' && (
                    <motion.div key="incorrect" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 text-red-400 font-bold text-2xl bg-red-500/10 border border-red-500/20 px-6 py-2 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                        <XCircle size={28} /> Sai rồi!
                      </div>
                      {currentQ.explanation && (
                        <p className="text-slate-400 text-sm mt-2 text-center italic px-4">{currentQ.explanation}</p>
                      )}
                    </motion.div>
                  )}
                  {feedback === 'timeout' && (
                    <motion.div key="timeout" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 text-orange-400 font-bold text-2xl bg-orange-500/10 border border-orange-500/20 px-6 py-2 rounded-full shadow-[0_0_20px_rgba(249,115,22,0.2)]">
                        <Clock size={28} /> Hết giờ!
                      </div>
                      {currentQ.explanation && (
                        <p className="text-slate-400 text-sm mt-2 text-center italic px-4">{currentQ.explanation}</p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>
          </motion.div>
        )}

        {gameState === 'gameover' && (
          <motion.div
            key="gameover"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
          >
            <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden p-8 text-center border border-slate-700/50">
              <div className="w-24 h-24 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/30 shadow-[0_0_30px_rgba(234,179,8,0.2)]">
                <Trophy size={48} />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Hoàn thành!</h1>
              <p className="text-slate-400 mb-8">Bạn đã vượt qua các thử thách của trò chơi.</p>
              
              <div className="bg-slate-800/50 rounded-2xl p-6 mb-8 border border-slate-700">
                <div className="text-sm text-slate-400 font-semibold uppercase tracking-wider mb-2">Tổng điểm</div>
                <div className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 drop-shadow-lg">
                  {score}<span className="text-4xl text-slate-600">/{questions.length}</span>
                </div>
                
                <div className="mt-4 text-sm font-medium text-slate-300">
                  {score === questions.length ? 'Tuyệt vời! Bạn đạt điểm tuyệt đối! 🎉' :
                   score >= questions.length / 2 ? 'Khá lắm! Cố gắng đạt điểm tối đa nhé! 👍' :
                   'Cần cố gắng hơn nữa! 💪'}
                </div>
              </div>

              <div className="flex gap-4">
                <button onClick={() => setGameState('home')} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 border border-slate-700">
                  Trang chủ
                </button>
                <button onClick={startGame} className="flex-1 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(99,102,241,0.4)]">
                  <RotateCcw size={20} />
                  Chơi lại
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {gameState === 'leaderboard' && (
          <motion.div
            key="leaderboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden p-6 md:p-8 border border-slate-700/50">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-yellow-500/20 text-yellow-500 rounded-xl border border-yellow-500/30">
                  <Trophy size={24} />
                </div>
                <h2 className="text-2xl font-bold text-white">Bảng xếp hạng</h2>
              </div>

              {leaderboard.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  Chưa có dữ liệu. Hãy là người đầu tiên chơi!
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {leaderboard.map((user, index) => (
                    <div key={user.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                          ${index === 0 ? 'bg-yellow-500 text-yellow-950' : 
                            index === 1 ? 'bg-slate-300 text-slate-800' : 
                            index === 2 ? 'bg-amber-700 text-amber-100' : 
                            'bg-slate-800 text-slate-400 border border-slate-700'}`}
                        >
                          {index + 1}
                        </div>
                        <span className="font-semibold text-slate-200">{user.username}</span>
                      </div>
                      <div className="font-black text-indigo-400">{user.score} <span className="text-xs text-slate-500 font-normal">điểm</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {gameState === 'stats' && stats && (
          <motion.div
            key="stats"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md"
          >
            <div className="bg-slate-900/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden p-6 md:p-8 border border-slate-700/50">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-emerald-500/20 text-emerald-500 rounded-xl border border-emerald-500/30">
                  <BarChart3 size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Thống kê</h2>
                  <p className="text-sm text-slate-400">Tài khoản: <span className="text-indigo-400 font-semibold">{currentUser?.displayName}</span></p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 text-center">
                  <div className="text-slate-400 text-sm mb-1">Số lần chơi</div>
                  <div className="text-3xl font-black text-white">{stats.totalGames}</div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700/50 text-center">
                  <div className="text-slate-400 text-sm mb-1">Điểm trung bình</div>
                  <div className="text-3xl font-black text-indigo-400">{stats.avgScore}</div>
                </div>
              </div>

              <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/50">
                <div className="text-sm font-semibold text-slate-300 mb-4">Tỷ lệ trả lời</div>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-green-400 flex items-center gap-1"><CheckCircle2 size={14}/> Đúng</span>
                      <span className="font-bold text-slate-200">{stats.correct}</span>
                    </div>
                    <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-green-500 h-full" style={{ width: `${(stats.correct / (stats.correct + stats.incorrect || 1)) * 100}%` }}></div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-red-400 flex items-center gap-1"><XCircle size={14}/> Sai</span>
                      <span className="font-bold text-slate-200">{stats.incorrect}</span>
                    </div>
                    <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-full" style={{ width: `${(stats.incorrect / (stats.correct + stats.incorrect || 1)) * 100}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
