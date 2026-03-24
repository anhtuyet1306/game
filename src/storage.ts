export const USERS_KEY = 'puzzle_users';
export const HISTORY_KEY = 'puzzle_history';
export const CURRENT_USER_KEY = 'puzzle_current_user';

export const getAuthUser = () => localStorage.getItem(CURRENT_USER_KEY);
export const setAuthUser = (username: string) => localStorage.setItem(CURRENT_USER_KEY, username);
export const logout = () => localStorage.removeItem(CURRENT_USER_KEY);

export const register = (username: string, password: string) => {
  if (!username || !password) return { success: false, message: 'Vui lòng nhập đầy đủ thông tin!' };
  
  const users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  if (users[username]) return { success: false, message: 'Tài khoản đã tồn tại!' };
  
  users[username] = { password };
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  setAuthUser(username);
  return { success: true };
};

export const login = (username: string, password: string) => {
  if (!username || !password) return { success: false, message: 'Vui lòng nhập đầy đủ thông tin!' };

  const users = JSON.parse(localStorage.getItem(USERS_KEY) || '{}');
  if (!users[username] || users[username].password !== password) {
    return { success: false, message: 'Sai tài khoản hoặc mật khẩu!' };
  }
  
  setAuthUser(username);
  return { success: true };
};

export const saveRecord = (username: string, score: number, total: number) => {
  if (!username) return;
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  history.push({ username, score, total, date: new Date().toISOString() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
};

export const getLeaderboard = () => {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  const userMaxScores: Record<string, number> = {};
  
  history.forEach((record: any) => {
    if (!userMaxScores[record.username] || record.score > userMaxScores[record.username]) {
      userMaxScores[record.username] = record.score;
    }
  });
  
  return Object.entries(userMaxScores)
    .map(([username, score]) => ({ username, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
};

export const getStats = (username: string) => {
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  const userHistory = history.filter((h: any) => h.username === username);
  
  const totalGames = userHistory.length;
  if (totalGames === 0) return { totalGames: 0, avgScore: 0, correct: 0, incorrect: 0 };

  let totalScore = 0;
  let totalQuestions = 0;
  
  userHistory.forEach((h: any) => {
    totalScore += h.score;
    totalQuestions += h.total;
  });

  return {
    totalGames,
    avgScore: Math.round((totalScore / totalGames) * 10) / 10,
    correct: totalScore,
    incorrect: totalQuestions - totalScore
  };
};
