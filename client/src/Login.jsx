import React, { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import {
  getApiBaseUrl,
  getDefaultApiBaseUrl,
  hasApiBaseUrlOverride,
  setApiBaseUrlOverride,
  clearApiBaseUrlOverride,
} from './api';
import Register from './Register';
import NovaAmbient from './NovaAmbient';
import './Login.css';

export default function Login() {
  const { login } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [need2fa, setNeed2fa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking');
  const [showServerUrl, setShowServerUrl] = useState(false);
  const [serverUrlDraft, setServerUrlDraft] = useState('');
  const [loginSuccess, setLoginSuccess] = useState(false);

  useEffect(() => {
    setServerUrlDraft(hasApiBaseUrlOverride() ? getApiBaseUrl() : '');
  }, []);

  // Проверка доступности сервера при загрузке
  useEffect(() => {
    const checkServer = async () => {
      try {
        const BASE = getApiBaseUrl();
        const response = await fetch(`${BASE}/api/test`, { method: 'GET' });
        if (response.ok) {
          setServerStatus('online');
        } else {
          setServerStatus('error');
        }
      } catch (e) {
        setServerStatus('offline');
      }
    };
    checkServer();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Валидация на клиенте
    const trimmedLogin = loginName.trim();
    
    if (!trimmedLogin) {
      setError('Please enter your login');
      return;
    }
    
    if (!password) {
      setError('Please enter your password');
      return;
    }

    if (need2fa && (!pin.trim() || !/^\d{4,8}$/.test(pin.trim()))) {
      setError('Enter your PIN (4-8 digits)');
      return;
    }
    
    if (password.length === 0) {
      setError('Password cannot be empty');
      return;
    }
    
    setLoading(true);
    
    try {
      console.log('[LOGIN] Submitting login form');
      await login(trimmedLogin, password, need2fa ? pin.trim() : undefined);
      console.log('[LOGIN] Login successful');
      setLoginSuccess(true);
      // Успешный вход - компонент переключится автоматически через AuthContext
    } catch (err) {
      console.error('[LOGIN] Login error:', err);
      // Показываем понятное сообщение об ошибке
      const msg = err?.message || 'Login failed. Please check your credentials.';
      if (msg.includes('2FA PIN required') || msg.includes('PIN') || err?.code === 'NEED_2FA') {
        setNeed2fa(true);
        setError('Enter PIN to continue');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  if (showRegister) {
    return <Register onSwitchToLogin={() => setShowRegister(false)} />;
  }

  return (
    <div className="login-page">
      <NovaAmbient variant="login" density={36} />
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo" />
          <h1>Nova</h1>
          <p>Sign in to continue</p>
          <div className={`login-server-status login-server-status--${serverStatus}`}>
            <span className="login-server-status-dot" aria-hidden />
            <span>
              {serverStatus === 'online' && 'Server online'}
              {serverStatus === 'offline' && 'Server offline'}
              {serverStatus === 'checking' && 'Checking server…'}
              {serverStatus === 'error' && 'Server error'}
            </span>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className={`login-form${loginSuccess ? ' login-form--success' : ''}`}>
          <div className="login-field">
            <input
              type="text"
              placeholder="Username"
              value={loginName}
              onChange={(e) => {
                setLoginName(e.target.value);
                setError('');
              }}
              autoComplete="username"
              disabled={loading}
              required
              autoFocus
            />
          </div>
          
          <div className="login-field">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </div>

          {need2fa && (
            <div className="login-field">
              <input
                type="password"
                inputMode="numeric"
                placeholder="PIN (4-8 digits)"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                autoComplete="one-time-code"
                disabled={loading}
                required
              />
            </div>
          )}
          
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            className="login-btn"
            disabled={loading || !loginName.trim() || !password}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        
        <p className="login-hint">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={() => setShowRegister(true)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent, #007bff)',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
              fontSize: 'inherit',
            }}
          >
            Sign up
          </button>
        </p>
        <p className="login-hint" style={{ marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowServerUrl(!showServerUrl)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #888)',
              cursor: 'pointer',
              fontSize: '12px',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            {showServerUrl ? 'Hide' : 'Server URL'} (default: {getDefaultApiBaseUrl()})
          </button>
        </p>
        {showServerUrl && (
          <div className="login-field" style={{ marginTop: 8 }}>
            <input
              type="url"
              placeholder={getDefaultApiBaseUrl()}
              value={serverUrlDraft}
              onChange={(e) => setServerUrlDraft(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={{ fontSize: '13px' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 4 }}>
              <button
                type="button"
                className="login-btn"
                style={{ flex: 1, padding: '8px', fontSize: '13px' }}
                onClick={() => {
                  const v = serverUrlDraft.trim();
                  if (!v) clearApiBaseUrlOverride();
                  else setApiBaseUrlOverride(v);
                  window.location.reload();
                }}
              >
                Apply & reload
              </button>
            </div>
          </div>
        )}
        {serverStatus === 'offline' && (
          <p style={{ color: '#ff4444', fontSize: '12px', marginTop: '10px', textAlign: 'center' }}>
            ⚠️ Сервер не запущен. Запустите: <code>cd server && npm start</code>
          </p>
        )}
        {serverStatus === 'checking' && (
          <p style={{ color: '#888', fontSize: '12px', marginTop: '10px', textAlign: 'center' }}>
            Проверка подключения к серверу...
          </p>
        )}
      </div>
    </div>
  );
}
