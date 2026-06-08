import React, { Component } from 'react';
import { AuthProvider } from './AuthContext.jsx';
import { useAuth } from './useAuth';
import { SocketProvider } from './SocketContext';
import { CallProvider } from './useCall';
import { NovaToastHost } from './NovaToast';
import { NovaConfettiHost } from './NovaConfetti';
import Login from './Login';
import Messenger from './Messenger';

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const isAuthHmr = import.meta.env.DEV
        && String(this.state.error.message || '').includes('useAuth must be used within AuthProvider');
      return (
        <div style={{
          padding: 24,
          fontFamily: 'sans-serif',
          background: '#0c0c0e',
          color: '#e4e4e7',
          minHeight: '100vh',
        }}>
          <h2 style={{ color: '#e53935' }}>Ошибка загрузки</h2>
          <pre style={{ overflow: 'auto', fontSize: 14 }}>
            {this.state.error.message}
          </pre>
          {isAuthHmr && (
            <p style={{ color: '#a1a1aa', marginTop: 12 }}>
              Это сбой hot reload в dev-режиме. Обновите страницу (Ctrl+Shift+R).
            </p>
          )}
          <button
            type="button"
            style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { user, loading, accessToken } = useAuth();
  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <Login />;
  return (
    <SocketProvider token={accessToken}>
      <CallProvider>
        <Messenger />
      </CallProvider>
    </SocketProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <NovaConfettiHost />
        <NovaToastHost />
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}
