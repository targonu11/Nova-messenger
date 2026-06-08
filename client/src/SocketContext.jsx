import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getApiBaseUrl } from './api';

const SocketContext = createContext(null);

export function SocketProvider({ children, token }) {
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [authFailed, setAuthFailed] = useState(false);

  const apiBase =
    typeof window !== 'undefined' ? getApiBaseUrl() : '';

  useEffect(() => {
    setAuthFailed(false);
    if (!token || typeof token !== 'string' || !token.trim()) {
      setSocket(null);
      setConnected(false);
      return;
    }
    const base = getApiBaseUrl();
    const socketUrl =
      base && String(base).trim()
        ? base
        : typeof window !== 'undefined'
          ? window.location.origin
          : 'http://localhost:3001';
    // В DEV только polling: иначе React Strict Mode дважды размонтирует эффект и в консоли сыпятся
    // «WebSocket is closed before the connection is established» (на работу сокета это не влияет).
    // В production сначала polling: часть сетей/прокси режет WebSocket — без сокета кнопка звонка disabled (canCall).
    const transports = import.meta.env.DEV ? ['polling'] : ['polling', 'websocket'];
    const s = io(socketUrl, { path: '/socket.io', transports, reconnection: true, reconnectionAttempts: 10 });
    s.on('connect', () => {
      setAuthFailed(false);
      s.emit('auth', token);
    });
    s.on('auth_ok', () => {
      setSocket(s);
      setConnected(true);
      setAuthFailed(false);
    });
    s.on('auth_fail', () => {
      setSocket(null);
      setConnected(false);
      setAuthFailed(true);
    });
    s.on('disconnect', (reason) => {
      setConnected(false);
    });
    s.on('connect_error', (err) => {
      console.warn('[Socket] connect_error', err?.message || err);
    });
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token, apiBase]);

  return (
    <SocketContext.Provider value={{ socket, connected, authFailed }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used inside SocketProvider');
  return ctx;
}
