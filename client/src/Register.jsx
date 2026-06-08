import React, { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import {
  getApiBaseUrl,
  getDefaultApiBaseUrl,
  hasApiBaseUrlOverride,
  setApiBaseUrlOverride,
  clearApiBaseUrlOverride,
} from './api';
import './Login.css';

export default function Register({ onSwitchToLogin }) {
  const { register } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' -> 'code' -> 'register'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [serverStatus, setServerStatus] = useState('checking');
  const [showServerUrl, setShowServerUrl] = useState(false);
  const [serverUrlDraft, setServerUrlDraft] = useState('');

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

  // Таймер обратного отсчета для повторной отправки кода
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Отправка кода подтверждения
  const handleSendCode = async () => {
    setError('');
    
    const normalizedPhone = phone.replace(/[^\d+]/g, '');
    const digitsOnly = normalizedPhone.replace(/\+/g, '');
    
    if (digitsOnly.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }
    
    setLoading(true);
    
    try {
      const BASE = getApiBaseUrl();
      const response = await fetch(`${BASE}/api/auth/send-verification-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to send code' }));
        throw new Error(errorData.error || 'Failed to send verification code');
      }
      
      const data = await response.json();
      setCodeSent(true);
      setStep('code');
      setCountdown(60); // 60 секунд до возможности повторной отправки
      
      // В режиме разработки показываем код в консоли
      if (data.code) {
        console.log('[REGISTER] Verification code:', data.code);
      }
    } catch (err) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  // Проверка кода и переход к регистрации
  const handleVerifyCode = async () => {
    setError('');
    
    if (!verificationCode.trim() || verificationCode.length !== 6) {
      setError('Please enter a 6-digit verification code');
      return;
    }
    
    setLoading(true);
    
    try {
      const BASE = getApiBaseUrl();
      const normalizedPhone = phone.replace(/[^\d+]/g, '');
      const response = await fetch(`${BASE}/api/auth/verify-phone-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          phone: normalizedPhone,
          code: verificationCode.trim()
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Invalid code' }));
        throw new Error(errorData.error || 'Invalid verification code');
      }
      
      setStep('register');
    } catch (err) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  // Регистрация
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Валидация на клиенте
    const trimmedLogin = login.trim();
    
    if (!trimmedLogin) {
      setError('Please enter a username');
      return;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedLogin)) {
      setError('Username can only contain letters, numbers, and underscores');
      return;
    }
    
    if (trimmedLogin.length > 30) {
      setError('Username must be 30 characters or less');
      return;
    }
    
    if (!password) {
      setError('Please enter a password');
      return;
    }
    
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    const trimmedDisplayName = displayName.trim();
    if (!trimmedDisplayName) {
      setError('Please enter a display name');
      return;
    }
    
    if (trimmedDisplayName.length > 50) {
      setError('Display name must be 50 characters or less');
      return;
    }
    
    setLoading(true);
    
    try {
      console.log('[REGISTER] Submitting registration form');
      const normalizedPhone = phone.replace(/[^\d+]/g, '');
      await register(trimmedLogin, password, trimmedDisplayName, normalizedPhone, verificationCode.trim());
      console.log('[REGISTER] Registration successful');
      // Успешная регистрация - компонент переключится автоматически через AuthContext
    } catch (err) {
      console.error('[REGISTER] Registration error:', err);
      const errorMessage = err.message || 'Registration failed. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Форматирование телефона при вводе
  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 0) return '';
    if (digits.length <= 1) return `+${digits}`;
    if (digits.length <= 4) return `+${digits.slice(0, 1)} (${digits.slice(1)}`;
    if (digits.length <= 7) return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4)}`;
    return `+${digits.slice(0, 1)} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo" />
          <h1>Nova</h1>
          <p>{step === 'phone' ? 'Enter your phone number' : step === 'code' ? 'Enter verification code' : 'Create your account'}</p>
        </div>
        
        {step === 'phone' && (
          <div className="login-form">
            <p className="login-hint" style={{ marginBottom: 12 }}>
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
              <div className="login-field" style={{ marginBottom: 12 }}>
                <input
                  type="url"
                  placeholder={getDefaultApiBaseUrl()}
                  value={serverUrlDraft}
                  onChange={(e) => setServerUrlDraft(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  style={{ fontSize: '13px' }}
                />
                <button
                  type="button"
                  className="login-btn"
                  style={{ marginTop: 8, padding: '8px', fontSize: '13px' }}
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
            )}
            <div className="login-field">
              <input
                type="tel"
                placeholder="+7 (999) 123-45-67"
                value={phone}
                onChange={(e) => {
                  const formatted = formatPhone(e.target.value);
                  setPhone(formatted);
                  setError('');
                }}
                autoComplete="tel"
                disabled={loading}
                required
                autoFocus
                maxLength={18}
              />
            </div>
            
            {error && (
              <div className="login-error">
                {error}
              </div>
            )}
            
            <button
              type="button"
              className="login-btn"
              onClick={handleSendCode}
              disabled={loading || !phone.replace(/\D/g, '').match(/^\d{10,15}$/)}
            >
              {loading ? 'Sending…' : 'Send verification code'}
            </button>
          </div>
        )}

        {step === 'code' && (
          <div className="login-form">
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px', textAlign: 'center' }}>
              We sent a verification code to {phone}
            </p>
            
            <div className="login-field">
              <input
                type="text"
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(value);
                  setError('');
                  // Автоматически переходим к регистрации при вводе 6 цифр
                  if (value.length === 6) {
                    setTimeout(() => handleVerifyCode(), 300);
                  }
                }}
                autoComplete="one-time-code"
                disabled={loading}
                required
                autoFocus
                maxLength={6}
                style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '1.2rem' }}
              />
            </div>
            
            {error && (
              <div className="login-error">
                {error}
              </div>
            )}
            
            <button
              type="button"
              className="login-btn"
              onClick={handleVerifyCode}
              disabled={loading || verificationCode.length !== 6}
            >
              {loading ? 'Verifying…' : 'Verify code'}
            </button>
            
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setVerificationCode('');
                setError('');
              }}
              style={{
                width: '100%',
                marginTop: '10px',
                padding: '10px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
              }}
            >
              Change phone number
            </button>
            
            {countdown > 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '12px', textAlign: 'center' }}>
                Resend code in {countdown}s
              </p>
            ) : (
              <button
                type="button"
                onClick={handleSendCode}
                disabled={loading}
                style={{
                  width: '100%',
                  marginTop: '10px',
                  padding: '10px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent, #007bff)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  fontSize: '0.9rem',
                }}
              >
                Resend code
              </button>
            )}
          </div>
        )}

        {step === 'register' && (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="login-field">
              <input
                type="text"
                placeholder="Username"
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''));
                  setError('');
                }}
                autoComplete="username"
                disabled={loading}
                required
                maxLength={30}
                autoFocus
              />
            </div>
            
            <div className="login-field">
              <input
                type="text"
                placeholder="Display Name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setError('');
                }}
                autoComplete="name"
                disabled={loading}
                required
                maxLength={50}
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
                autoComplete="new-password"
                disabled={loading}
                required
                minLength={4}
              />
            </div>
            
            <div className="login-field">
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError('');
                }}
                autoComplete="new-password"
                disabled={loading}
                required
                minLength={4}
              />
            </div>
            
            {error && (
              <div className="login-error">
                {error}
              </div>
            )}
            
            <button
              type="submit"
              className="login-btn"
              disabled={loading || !login.trim() || !password || !confirmPassword || !displayName.trim()}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}
        
        <p className="login-hint">
          Already have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
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
            Sign in
          </button>
        </p>
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
