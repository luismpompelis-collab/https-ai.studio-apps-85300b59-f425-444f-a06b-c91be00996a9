import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  UserCheck,
  Shield,
  Key,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { UserRole } from '../types';

export const AuthModal: React.FC = () => {
  const { loginWithGoogle, loginWithEmail, registerWithEmail, resetPassword } = useAuth();

  const [tab, setTab] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('seller');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (tab === 'login') {
        // Allow email or username (if no @, append @clientespro.do)
        const cleanEmail = email.includes('@') ? email.trim() : `${email.trim().toLowerCase()}@clientespro.do`;
        await loginWithEmail(cleanEmail, password);
      } else if (tab === 'register') {
        if (!fullName.trim()) {
          setErrorMsg('El nombre completo es requerido');
          setLoading(false);
          return;
        }
        const cleanEmail = email.includes('@') ? email.trim() : `${email.trim().toLowerCase()}@clientespro.do`;
        await registerWithEmail(cleanEmail, password, fullName.trim(), role);
      } else if (tab === 'forgot') {
        if (!email.trim()) {
          setErrorMsg('Por favor ingresa tu correo electrónico para enviarte el enlace.');
          setLoading(false);
          return;
        }
        await resetPassword(email.trim());
        setSuccessMsg('Enlace de recuperación enviado. Revisa tu bandeja de entrada.');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      let msg = err.message || 'Error de autenticación';
      if (msg.includes('user-not-found') || msg.includes('invalid-credential')) {
        msg = 'Credenciales incorrectas o usuario no registrado.';
      } else if (msg.includes('wrong-password')) {
        msg = 'Contraseña incorrecta.';
      } else if (msg.includes('email-already-in-use')) {
        msg = 'Este correo electrónico ya está registrado. Inicia sesión.';
      } else if (msg.includes('weak-password')) {
        msg = 'La contraseña debe tener al menos 6 caracteres.';
      }
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo iniciar sesión con Google.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-700 to-indigo-500 items-center justify-center shadow-lg shadow-blue-500/20 text-white font-black text-2xl">
            CP
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            CLIENTES <span className="text-blue-400">PRO</span>
          </h1>
          <p className="text-xs text-slate-400">
            Sistema Profesional de Registro y Gestión Comercial
          </p>
        </div>

        {/* Auth mode tabs */}
        <div className="flex border-b border-slate-800 mb-5 text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setErrorMsg(null);
            }}
            className={`flex-1 pb-3 text-center transition-colors relative ${
              tab === 'login' ? 'text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            Iniciar Sesión
            {tab === 'login' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setTab('register');
              setErrorMsg(null);
            }}
            className={`flex-1 pb-3 text-center transition-colors relative ${
              tab === 'register' ? 'text-blue-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            Crear Cuenta
            {tab === 'register' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
          </button>
        </div>

        {/* Feedback alerts */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-950/70 border border-red-800 text-red-300 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-950/70 border border-emerald-800 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Google One-Click Login */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white font-bold text-xs transition flex items-center justify-center gap-3 shadow mb-4 active:scale-[0.99]"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continuar con Cuenta Google</span>
        </button>

        <div className="relative flex py-2 items-center mb-4">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-3 text-slate-500 text-[11px] uppercase font-bold tracking-wider">o con credenciales</span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {tab === 'register' && (
            <div>
              <label className="block text-slate-300 font-bold uppercase mb-1">Nombre Completo *</label>
              <div className="relative">
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ej: Lic. Carlos Medina"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-bold uppercase mb-1">
              {tab === 'login' ? 'Correo o Nombre de Usuario *' : 'Correo Electrónico *'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@clientespro.do"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {tab !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-300 font-bold uppercase">Contraseña *</label>
                {tab === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab('forgot');
                      setErrorMsg(null);
                    }}
                    className="text-[11px] text-blue-400 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {tab === 'register' && (
            <div>
              <label className="block text-slate-300 font-bold uppercase mb-1">Rol Inicial</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white text-xs"
              >
                <option value="seller">Vendedor Comercial</option>
                <option value="supervisor">Supervisor de Equipo</option>
                <option value="admin">Administrador General</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs tracking-wider uppercase transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : tab === 'login' ? (
              'Iniciar Sesión'
            ) : tab === 'register' ? (
              'Crear Cuenta Comercial'
            ) : (
              'Enviar Enlace de Recuperación'
            )}
          </button>

          {tab === 'forgot' && (
            <button
              type="button"
              onClick={() => setTab('login')}
              className="w-full text-center text-xs text-slate-400 hover:text-white mt-2 block"
            >
              Volver a Iniciar Sesión
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
