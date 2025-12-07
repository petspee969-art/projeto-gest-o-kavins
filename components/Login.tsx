
import React, { useState } from 'react';
import { User } from '../types';
import { getUsers } from '../services/storageService';
import { Lock, User as UserIcon, Loader2, AlertTriangle } from 'lucide-react';

interface Props {
  onLogin: (user: User) => void;
}

const Login: React.FC<Props> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const users = await getUsers();
      
      // Se users for vazio, significa que o banco conectou mas não tem usuários (apenas o admin padrão deve existir)
      if (users.length === 0) {
         setError('Conexão bem sucedida, mas nenhum usuário encontrado. Verifique se rodou o script SQL.');
         setLoading(false);
         return;
      }

      const validUser = users.find(u => u.username === username && u.password === password);
      
      if (validUser) {
        onLogin(validUser);
      } else {
        setError('Usuário ou senha incorretos.');
      }
    } catch (err: any) {
      console.error(err);
      // Mostra a mensagem exata vinda do service (que distingue server off de erro de DB)
      setError(err.message || 'Erro desconhecido ao tentar login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-900">Confecção Pro</h1>
          <p className="text-gray-500 mt-2">Sistema de Gestão de Pedidos</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm flex items-start">
              <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
              <div className="whitespace-pre-wrap">{error}</div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Usuário / Email</label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="text"
                required
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="password"
                required
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="123"
                disabled={loading}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition duration-200 shadow-md flex justify-center items-center disabled:opacity-70"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Entrar no Sistema'}
          </button>
        </form>
        
        <div className="mt-6 text-center text-xs text-gray-400">
          <p>Dica: Certifique-se que o "node server.js" está rodando.</p>
          &copy; 2025 Gestão Confecção.
        </div>
      </div>
    </div>
  );
};

export default Login;
