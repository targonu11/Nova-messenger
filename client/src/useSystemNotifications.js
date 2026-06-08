import { useEffect, useRef } from 'react';

let permissionGranted = false;
let permissionRequested = false;

/**
 * Запрашивает разрешение на системные уведомления
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    permissionGranted = true;
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  if (!permissionRequested) {
    permissionRequested = true;
    const permission = await Notification.requestPermission();
    permissionGranted = permission === 'granted';
    return permissionGranted;
  }

  return false;
}

/**
 * Показывает системное уведомление
 */
export function showSystemNotification({ title, body, icon, tag, onClick }) {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported');
    return null;
  }

  if (Notification.permission !== 'granted') {
    return null;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon: icon || undefined,
      tag: tag || undefined,
      badge: icon || undefined,
      requireInteraction: false,
      silent: false,
    });

    if (onClick) {
      notification.onclick = (event) => {
        event.preventDefault();
        onClick();
        // Фокусируем окно приложения
        if (window.focus) {
          window.focus();
        }
        notification.close();
      };
    }

    // Автоматически закрываем уведомление через 5 секунд
    setTimeout(() => {
      notification.close();
    }, 5000);

    return notification;
  } catch (error) {
    console.error('Failed to show notification:', error);
    return null;
  }
}

/**
 * Хук для инициализации системных уведомлений
 */
export function useSystemNotifications() {
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    // Запрашиваем разрешение при монтировании компонента
    if (!permissionRequestedRef.current) {
      permissionRequestedRef.current = true;
      requestNotificationPermission().catch((err) => {
        console.error('Failed to request notification permission:', err);
      });
    }
  }, []);

  return {
    showNotification: showSystemNotification,
    requestPermission: requestNotificationPermission,
  };
}
