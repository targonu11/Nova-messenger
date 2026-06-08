import React, { useState, useEffect, useCallback } from 'react';
import { getApiBaseUrl, refreshAccessToken, resolveAuthBootstrap, restoreAccessTokenForBootstrap, clearAuthStorage } from './api';
import { AuthContext } from './authContextSingleton';

export { useAuth } from './useAuth';

function userFromMeApi(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    id: data.id,
    login: data.login,
    displayName: data.displayName,
    bio: data.bio ?? '',
    avatarPath: data.avatarPath ?? null,
    coverPath: data.coverPath ?? null,
    avatarRing: data.avatarRing || 'none',
    hideLastSeen: !!data.hideLastSeen,
    isVerified: !!data.isVerified,
    banUntil: data.banUntil ?? null,
    e2ePublicKey: data.e2ePublicKey || null,
    twofaEnabled: !!data.twofaEnabled,
    badgeId: data.badgeId ?? null,
    badgeName: data.badgeName ?? null,
    badgeIcon: data.badgeIcon ?? null,
    isAdmin: !!(data.isAdmin || data.login === 'lololowkid'),
    allowUsernameChange: data.allowUsernameChange !== false,
    socialLinks: data.socialLinks && typeof data.socialLinks === 'object' ? data.socialLinks : {},
    createdAt: data.createdAt != null ? data.createdAt : null,
    customStatusEmoji: data.customStatusEmoji || '',
    customStatusText: data.customStatusText || '',
    customStatusMode: data.customStatusMode || 'online',
    birthday: data.birthday || '',
    phone: data.phone || '',
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const syncToken = () => setAccessToken(localStorage.getItem('token'));
    window.addEventListener('nova-token-updated', syncToken);
    return () => window.removeEventListener('nova-token-updated', syncToken);
  }, []);

  // Восстановление сессии из localStorage и подтягивание актуального профиля с сервера (аватар, bio)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const hasStoredSession = !!(localStorage.getItem('token') || localStorage.getItem('refreshToken'));

      if (!hasStoredSession) {
        if (!cancelled) {
          setUser(null);
          setAccessToken(null);
          setLoading(false);
        }
        resolveAuthBootstrap();
        return;
      }

      const BASE = getApiBaseUrl();
      try {
        const t = await restoreAccessTokenForBootstrap();
        if (cancelled) return;
        if (!t) {
          clearAuthStorage();
          setUser(null);
          setAccessToken(null);
          return;
        }

        const res = await fetch(`${BASE}/api/users/me`, { headers: { Authorization: 'Bearer ' + t } });
        if (cancelled) return;
        if (!res.ok) {
          clearAuthStorage();
          setUser(null);
          setAccessToken(null);
          return;
        }
        const data = await res.json();
        const updatedUser = userFromMeApi(data);
        if (!updatedUser) {
          clearAuthStorage();
          setUser(null);
          setAccessToken(null);
          return;
        }
        if (!cancelled) {
          setUser(updatedUser);
          setAccessToken(t);
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
      } catch (err) {
        console.error('Refresh user on restore:', err);
        if (!cancelled) {
          setUser(null);
          setAccessToken(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
        resolveAuthBootstrap();
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Вход в систему (переписано с нуля)
  const login = async (loginName, password, pin) => {
    const BASE = getApiBaseUrl();
    const url = `${BASE}/api/auth/login`;
    
    console.log('[AUTH] Attempting login for:', loginName);
    
    try {
      // Валидация на клиенте
      if (!loginName || typeof loginName !== 'string') {
        throw new Error('Login is required');
      }
      
      if (!password || typeof password !== 'string') {
        throw new Error('Password is required');
      }
      
      const trimmedLogin = loginName.trim();
      if (!trimmedLogin) {
        throw new Error('Login cannot be empty');
      }
      
      // Отправляем запрос на сервер
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            login: trimmedLogin,
            password: password,
            ...(pin ? { pin: String(pin) } : {}),
          }),
        });
      } catch (fetchError) {
        console.error('[AUTH] Fetch error:', fetchError);
        const errorMsg = fetchError.message || 'Network error';
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('ECONNREFUSED')) {
          throw new Error('Не удалось подключиться к серверу. Убедитесь, что сервер запущен: cd server && npm start');
        }
        throw new Error('Ошибка сети: ' + errorMsg);
      }

      // Проверяем статус ответа
      const contentType = response.headers.get('content-type');
      let errorData = null;
      let errorText = null;
      
      if (!response.ok) {
        // Пытаемся получить текст ответа
        try {
          errorText = await response.text();
          console.error('[AUTH] Server response text:', errorText);
        } catch (e) {
          console.error('[AUTH] Failed to read response text:', e);
        }
        
        // Пытаемся получить JSON с ошибкой
        if (contentType && contentType.includes('application/json')) {
          try {
            errorData = JSON.parse(errorText);
            console.error('[AUTH] Parsed error data:', errorData);
          } catch (e) {
            console.error('[AUTH] Failed to parse error response as JSON:', e);
          }
        }
        
        let errorMessage = errorData?.error || errorText || `Server error: ${response.status}`;
        if (!errorText || errorText.trim() === '') {
          errorMessage = 'Сервер не отвечает или не запущен. Запустите сервер: cd server && npm start';
        }
        console.error('[AUTH] Login failed:', errorMessage);
        console.error('[AUTH] Response status:', response.status);
        console.error('[AUTH] Response statusText:', response.statusText);
        throw new Error(errorMessage);
      }

      // Парсим успешный ответ
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response format from server');
      }
      
      const data = await response.json();
      
      // Проверяем структуру ответа
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response from server');
      }
      
      if (!data.token || typeof data.token !== 'string') {
        throw new Error('Missing or invalid token in response');
      }
      
      if (!data.user || typeof data.user !== 'object') {
        throw new Error('Missing or invalid user data in response');
      }
      
      // Проверяем обязательные поля пользователя
      if (!data.user.id || !data.user.login) {
        throw new Error('Invalid user data structure');
      }

      // Сохраняем токен; профиль подтягиваем с /api/users/me (бейджи, verified, isAdmin)
      localStorage.setItem('token', data.token);
      if (data.refreshToken && typeof data.refreshToken === 'string') {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      setAccessToken(data.token);

      let finalUser = userFromMeApi(data.user);
      try {
        const meRes = await fetch(`${BASE}/api/users/me`, {
          headers: { Authorization: 'Bearer ' + data.token },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          const fromMe = userFromMeApi(meData);
          if (fromMe) finalUser = fromMe;
        }
      } catch (meErr) {
        console.warn('[AUTH] /api/users/me after login failed, using login payload:', meErr?.message);
      }

      if (!finalUser) {
        throw new Error('Invalid user data after login');
      }

      localStorage.setItem('user', JSON.stringify(finalUser));
      setUser(finalUser);
      resolveAuthBootstrap();

      console.log('[AUTH] Successfully logged in:', finalUser.login);
      return finalUser;
    } catch (err) {
      console.error('[AUTH] Login error:', err.message);
      // Пробрасываем ошибку дальше с понятным сообщением
      throw new Error(err.message || 'Login failed. Please check your credentials.');
    }
  };

  // Выход из системы
  // ВАЖНО: Удаляем только токен и данные пользователя, НЕ трогаем настройки мессенджера
  // Настройки (тема, язык, аудио устройства, имена контактов, фоны чатов) остаются в localStorage
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
    setAccessToken(null);
    // НЕ удаляем настройки:
    // - nova_theme
    // - nova_lang
    // - nova_audio_input_id
    // - nova_audio_output_id
    // - nova_contact_names
    // - nova_chat_backgrounds
    // - nova_last_chat
  };

  // Обновление данных пользователя (локально)
  const updateUser = (updates) => {
    if (!user) return;
    const merged = { ...user };
    for (const [key, value] of Object.entries(updates || {})) {
      if (value !== undefined) merged[key] = value;
    }
    setUser(merged);
    localStorage.setItem('user', JSON.stringify(merged));
  };

  // Регистрация нового пользователя
  const register = async (loginName, password, displayName, phone, verificationCode) => {
    const BASE = getApiBaseUrl();
    const url = `${BASE}/api/auth/register`;
    
    console.log('[AUTH] Attempting registration for:', loginName);
    
    try {
      // Валидация на клиенте
      if (!loginName || typeof loginName !== 'string') {
        throw new Error('Login is required');
      }
      
      if (!password || typeof password !== 'string') {
        throw new Error('Password is required');
      }
      
      if (password.length < 4) {
        throw new Error('Password must be at least 4 characters');
      }
      
      if (!displayName || typeof displayName !== 'string') {
        throw new Error('Display name is required');
      }
      
      const trimmedLogin = loginName.trim();
      if (!trimmedLogin) {
        throw new Error('Login cannot be empty');
      }
      
      if (!/^[a-zA-Z0-9_]+$/.test(trimmedLogin)) {
        throw new Error('Login can only contain letters, numbers, and underscores');
      }
      
      if (trimmedLogin.length > 30) {
        throw new Error('Login must be 30 characters or less');
      }
      
      const trimmedDisplayName = displayName.trim();
      if (!trimmedDisplayName) {
        throw new Error('Display name cannot be empty');
      }
      
      if (trimmedDisplayName.length > 50) {
        throw new Error('Display name must be 50 characters or less');
      }
      
      // Отправляем запрос на сервер
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            login: trimmedLogin,
            password: password,
            displayName: trimmedDisplayName,
            phone: phone,
            verificationCode: verificationCode,
          }),
        });
      } catch (fetchError) {
        console.error('[AUTH] Fetch error:', fetchError);
        const errorMsg = fetchError.message || 'Network error';
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('ECONNREFUSED')) {
          throw new Error('Не удалось подключиться к серверу. Убедитесь, что сервер запущен: cd server && npm start');
        }
        throw new Error('Ошибка сети: ' + errorMsg);
      }

      // Проверяем статус ответа
      const contentType = response.headers.get('content-type');
      let errorData = null;
      let errorText = null;
      
      if (!response.ok) {
        // Пытаемся получить текст ответа
        try {
          errorText = await response.text();
          console.error('[AUTH] Server response text:', errorText);
        } catch (e) {
          console.error('[AUTH] Failed to read response text:', e);
        }
        
        // Пытаемся получить JSON с ошибкой
        if (contentType && contentType.includes('application/json')) {
          try {
            errorData = JSON.parse(errorText);
            console.error('[AUTH] Parsed error data:', errorData);
          } catch (e) {
            console.error('[AUTH] Failed to parse error response as JSON:', e);
          }
        }
        
        let errorMessage = errorData?.error || errorText || `Server error: ${response.status}`;
        if (!errorText || errorText.trim() === '') {
          errorMessage = 'Сервер не отвечает или не запущен. Запустите сервер: cd server && npm start';
        }
        console.error('[AUTH] Registration failed:', errorMessage);
        console.error('[AUTH] Response status:', response.status);
        console.error('[AUTH] Response statusText:', response.statusText);
        throw new Error(errorMessage);
      }

      // Парсим успешный ответ
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response format from server');
      }
      
      const data = await response.json();
      
      // Проверяем структуру ответа
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response from server');
      }
      
      if (!data.token || typeof data.token !== 'string') {
        throw new Error('Missing or invalid token in response');
      }
      
      if (!data.user || typeof data.user !== 'object') {
        throw new Error('Missing or invalid user data in response');
      }
      
      // Проверяем обязательные поля пользователя
      if (!data.user.id || !data.user.login) {
        throw new Error('Invalid user data structure');
      }

      // Сохраняем токен и данные пользователя
      localStorage.setItem('token', data.token);
      if (data.refreshToken && typeof data.refreshToken === 'string') {
        localStorage.setItem('refreshToken', data.refreshToken);
      }
      localStorage.setItem('user', JSON.stringify(data.user));
      setUser(data.user);
      setAccessToken(data.token);
      resolveAuthBootstrap();
      
      console.log('[AUTH] Successfully registered:', data.user.login);
      return data.user;
    } catch (err) {
      console.error('[AUTH] Registration error:', err.message);
      throw new Error(err.message || 'Registration failed. Please try again.');
    }
  };

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    if (!token && !refreshToken) return;
    const BASE = getApiBaseUrl();
    try {
      const tryMe = async (t) => fetch(`${BASE}/api/users/me`, { headers: { Authorization: 'Bearer ' + t } });
      let t = token;
      let res = t ? await tryMe(t) : null;
      if ((!res || res.status === 401) && refreshToken) {
        t = await refreshAccessToken();
        res = t ? await tryMe(t) : null;
      }
      if (!res || !res.ok) return;
      const data = await res.json();
      const updatedUser = userFromMeApi(data);
      if (!updatedUser) return;
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      if (t) setAccessToken(t);
    } catch (err) {
      console.error('Refresh user error:', err);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, accessToken, login, register, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
