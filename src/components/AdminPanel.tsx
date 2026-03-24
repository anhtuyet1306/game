import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Plus, Trash2, Save, X, Settings, List, Users, BarChart } from 'lucide-react';
import { addQuestion, subscribeToQuestions, deleteQuestion } from '../firebase';

interface AdminPanelProps {
  onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'questions' | 'users' | 'stats'>('questions');
  const [questions, setQuestions] = useState<any[]>([]);
  const [newQuestion, setNewQuestion] = useState({
    type: 'logic',
    text: '',
    options: ['', '', '', ''],
    answer: '',
    explanation: ''
  });

  useEffect(() => {
    const unsubscribe = subscribeToQuestions(setQuestions);
    return () => unsubscribe();
  }, []);

  const handleAddQuestion = async () => {
    if (!newQuestion.text || !newQuestion.answer || newQuestion.options.some(o => !o)) {
      alert('Vui lòng điền đầy đủ thông tin câu hỏi!');
      return;
    }
    await addQuestion(newQuestion);
    setNewQuestion({
      type: 'logic',
      text: '',
      options: ['', '', '', ''],
      answer: '',
      explanation: ''
    });
  };

  const handleDeleteQuestion = async (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa câu hỏi này?')) {
      await deleteQuestion(id);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
    >
      <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl h-[80vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 rounded-lg">
              <Settings className="text-indigo-400" size={24} />
            </div>
            <h2 className="text-xl font-bold text-white">Quản trị hệ thống</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/30">
          <button 
            onClick={() => setActiveTab('questions')}
            className={`flex-1 py-4 flex items-center justify-center gap-2 font-medium transition-all ${activeTab === 'questions' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-400/5' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <List size={18} />
            Câu hỏi
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-4 flex items-center justify-center gap-2 font-medium transition-all ${activeTab === 'users' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-400/5' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Users size={18} />
            Người dùng
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-4 flex items-center justify-center gap-2 font-medium transition-all ${activeTab === 'stats' ? 'text-indigo-400 border-b-2 border-indigo-400 bg-indigo-400/5' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <BarChart size={18} />
            Thống kê
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-950/20">
          {activeTab === 'questions' && (
            <div className="space-y-8">
              {/* Add New Question Form */}
              <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Plus size={20} className="text-green-400" />
                  Thêm câu hỏi mới
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Loại câu hỏi</label>
                    <select 
                      value={newQuestion.type}
                      onChange={(e) => setNewQuestion({...newQuestion, type: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 text-white p-3 rounded-xl outline-none focus:border-indigo-500 transition-all"
                    >
                      <option value="logic">Đố mẹo</option>
                      <option value="proverb">Ca dao tục ngữ</option>
                      <option value="genz">Ngôn ngữ GenZ</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Câu hỏi</label>
                    <input 
                      type="text"
                      value={newQuestion.text}
                      onChange={(e) => setNewQuestion({...newQuestion, text: e.target.value})}
                      placeholder="Nhập nội dung câu hỏi..."
                      className="w-full bg-slate-800 border border-slate-700 text-white p-3 rounded-xl outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {newQuestion.options.map((opt, idx) => (
                    <div key={idx} className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Đáp án {idx + 1}</label>
                      <input 
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...newQuestion.options];
                          newOpts[idx] = e.target.value;
                          setNewQuestion({...newQuestion, options: newOpts});
                        }}
                        placeholder={`Lựa chọn ${idx + 1}...`}
                        className="w-full bg-slate-800 border border-slate-700 text-white p-3 rounded-xl outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Đáp án đúng</label>
                    <select 
                      value={newQuestion.answer}
                      onChange={(e) => setNewQuestion({...newQuestion, answer: e.target.value})}
                      className="w-full bg-slate-800 border border-slate-700 text-white p-3 rounded-xl outline-none focus:border-indigo-500 transition-all"
                    >
                      <option value="">Chọn đáp án đúng...</option>
                      {newQuestion.options.map((opt, idx) => (
                        <option key={idx} value={opt}>{opt || `Lựa chọn ${idx + 1}`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button 
                      onClick={handleAddQuestion}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
                    >
                      <Save size={20} />
                      Lưu câu hỏi
                    </button>
                  </div>
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <List size={20} className="text-indigo-400" />
                  Danh sách câu hỏi ({questions.length})
                </h3>
                <div className="space-y-3">
                  {questions.map((q) => (
                    <div key={q.id} className="bg-slate-900/30 border border-slate-800 p-4 rounded-2xl flex items-start justify-between gap-4 hover:border-slate-700 transition-all group">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[10px] font-bold uppercase rounded-md border border-slate-700">
                            {q.type}
                          </span>
                          <span className="text-slate-500 text-xs">ID: {q.id.slice(0, 8)}...</span>
                        </div>
                        <p className="text-white font-medium">{q.text}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {q.options.map((opt: string, i: number) => (
                            <span key={i} className={`text-xs px-2 py-1 rounded-lg ${opt === q.answer ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-800/50 text-slate-500 border border-slate-700/50'}`}>
                              {opt}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
              <Users size={48} className="opacity-20" />
              <p>Tính năng quản lý người dùng đang được phát triển...</p>
            </div>
          )}

          {activeTab === 'stats' && (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
              <BarChart size={48} className="opacity-20" />
              <p>Tính năng thống kê hệ thống đang được phát triển...</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default AdminPanel;
