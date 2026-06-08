const SCREENS = ['welcome', 'path', 'installing', 'done', 'error'];
let current = 'welcome';
let config = null;
let installing = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(name) {
  current = name;
  $$('.screen').forEach((el) => {
    el.classList.toggle('active', el.dataset.screen === name);
  });
  const back = $('#btn-back');
  const next = $('#btn-next');
  next.hidden = false;
  back.hidden = name === 'welcome' || name === 'installing' || name === 'done' || name === 'error';
  if (name === 'welcome') {
    next.textContent = 'Далее';
    next.disabled = false;
  } else if (name === 'path') {
    next.textContent = 'Установить';
    next.disabled = false;
  } else if (name === 'installing') {
    next.hidden = true;
    back.hidden = true;
  } else if (name === 'done') {
    next.hidden = false;
    next.textContent = 'Запустить Nova';
    next.disabled = false;
  } else if (name === 'error') {
    next.hidden = false;
    next.textContent = 'Закрыть';
    back.hidden = true;
  }
}

function setProgress(percent, detail) {
  const p = Math.min(100, Math.max(0, percent));
  $('#progress-fill').style.width = `${p}%`;
  $('#progress-percent').textContent = `${p}%`;
  if (detail) $('#progress-detail').textContent = detail;
}

function logLine(text) {
  const el = $('#install-log');
  el.textContent = text;
}

async function init() {
  $('#btn-min').addEventListener('click', () => window.novaInstaller.windowMinimize());
  $('#btn-close').addEventListener('click', () => window.novaInstaller.windowClose());

  config = await window.novaInstaller.getConfig();
  $('#version-label').textContent = `v${config.version || '1.1.0'}`;
  $('#install-path').value = config.defaultInstallDir || '';
  if (config.hasBundledSetup) {
    $('#bundled-hint').hidden = false;
  }

  $('#btn-browse').addEventListener('click', async () => {
    const dir = await window.novaInstaller.selectFolder();
    if (dir) $('#install-path').value = dir;
  });

  $('#btn-back').addEventListener('click', () => {
    if (current === 'path') showScreen('welcome');
  });

  $('#btn-next').addEventListener('click', async () => {
    if (current === 'welcome') {
      showScreen('path');
      return;
    }
    if (current === 'path') {
      await runInstall();
      return;
    }
    if (current === 'done') {
      await window.novaInstaller.launchApp();
      window.novaInstaller.windowClose();
      return;
    }
    if (current === 'error') {
      window.novaInstaller.windowClose();
    }
  });

  window.novaInstaller.onProgress((data) => {
    if (current !== 'installing') return;
    const pct = data.percent ?? 0;
    setProgress(pct);
    if (data.total > 0) {
      const mb = (n) => (n / 1024 / 1024).toFixed(1);
      $('#progress-detail').textContent = `${mb(data.received)} / ${mb(data.total)} МБ`;
    }
  });

  window.novaInstaller.onPhase(({ phase, detail }) => {
    if (phase === 'download') {
      $('#install-title').textContent = 'Загрузка Nova';
      $('#install-status').textContent = detail || 'Скачивание файлов…';
      logLine('Подключение к серверу…');
    } else if (phase === 'install') {
      $('#install-title').textContent = 'Установка Nova';
      $('#install-status').textContent = detail || 'Копирование файлов…';
      logLine('Распаковка и настройка…');
    } else if (phase === 'done') {
      $('#install-status').textContent = 'Завершено';
      logLine('');
    } else if (phase === 'error') {
      showScreen('error');
      $('#error-text').textContent = detail || 'Неизвестная ошибка';
      installing = false;
    }
  });

  showScreen('welcome');
}

async function runInstall() {
  if (installing) return;
  installing = true;
  showScreen('installing');
  setProgress(0);
  $('#install-title').textContent = 'Подготовка';
  $('#install-status').textContent = 'Инициализация установки…';

  try {
    const installDir = $('#install-path').value.trim();
    await window.novaInstaller.startInstall({ installDir });
    setProgress(100);
    await new Promise((r) => setTimeout(r, 500));
    showScreen('done');
  } catch (e) {
    showScreen('error');
    $('#error-text').textContent = e.message || String(e);
  } finally {
    installing = false;
  }
}

init();
