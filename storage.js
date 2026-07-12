/* ==========================================================================
   storage.js - слой данных вкладки «Прогресс» (Биохакинг ягодиц).

   Единая точка доступа к данным. Боевой путь - Telegram CloudStorage
   (per-user, переживает смену устройства, бэкенд не нужен). Дев-фолбэк вне
   Telegram - localStorage, затем in-memory. Весь UI и логика ходят СЮДА,
   чтобы позже можно было заменить реализацию на Supabase edge, не трогая UI.

   Публичный async-интерфейс: loadProgress(), saveProgress(state, today).
   Плюс чистые хелперы (goalPair, weekDateKeys, dateKey) - их же тестируем.

   Универсальный модуль: работает в браузере (window.GlutesStorage) и в Node
   (module.exports) - последнее нужно для юнит-теста storage.test.js.
   ========================================================================== */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'glutes_progress_v1';

  /* -------------------- Уровни цели (прямые пары, без деления) ------------
     Пользователь выбирает уровень; цель каждой копилки задана парой напрямую.
     big - большая ягодичная (движения назад), med - средняя (отведения). */
  var LEVELS = [
    { key: 'maintain', name: 'Поддержание',        big: 6,  med: 4,  note: 'держит набранную форму, для тяжёлой недели и цикла' },
    { key: 'tone',     name: 'Тонус',              big: 9,  med: 7,  note: 'плотная подтянутая форма без роста объёма' },
    { key: 'growth',   name: 'Рекомендуемый рост', big: 13, med: 10, note: 'наш выбор, заметный рост' },
    { key: 'active',   name: 'Активный рост',      big: 16, med: 12, note: 'для тех, кто хочет быстрее' },
    { key: 'expert',   name: 'Для опытных',        big: 20, med: 15, note: 'высокий объём для подготовленных' }
  ];
  var DEFAULT_LEVEL = 'growth';

  function levelByKey(key) {
    for (var i = 0; i < LEVELS.length; i++) { if (LEVELS[i].key === key) return LEVELS[i]; }
    return null;
  }

  // Пара целей [большая, средняя] для уровня. Неизвестный ключ -> дефолтный уровень.
  function goalPair(key) {
    var l = levelByKey(key) || levelByKey(DEFAULT_LEVEL);
    return [l.big, l.med];
  }

  /* -------------------- Чистая логика недели (Пн-Вс, локальное время) ----- */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  // 'YYYY-MM-DD' по ЛОКАЛЬНОЙ дате устройства (не UTC).
  function dateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // Понедельник текущей недели (00:00 локально). Пн=0 ... Вс=6.
  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dow);
    return x;
  }

  // Массив из 7 ключей 'YYYY-MM-DD' от понедельника до воскресенья.
  function weekDateKeys(today) {
    var start = startOfWeek(today);
    var keys = [];
    for (var i = 0; i < 7; i++) {
      keys.push(dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
    }
    return keys;
  }

  /* -------------------- Дефолты и нормализация стейта --------------------- */
  function emptyDay() {
    return {
      glutMaxSets: 0,
      glutMedSets: 0,
      isTrainingDay: false,
      habits: { sleep: false, protein: false, water: false, steps: false, creatine: false }
    };
  }

  function normalizeState(raw) {
    var s = (raw && typeof raw === 'object') ? raw : {};
    // Миграция: у старых подписчиц лежит weeklyGoal без level -> дефолтный уровень.
    var level = (typeof s.level === 'string' && levelByKey(s.level)) ? s.level : DEFAULT_LEVEL;
    return {
      level: level,
      hintSeen: s.hintSeen === true,
      days: (s.days && typeof s.days === 'object') ? s.days : {}
    };
  }

  // Оставляем только дни текущей недели, чтобы не упереться в ~4KB на ключ.
  function pruneOldWeeks(state, today) {
    var keep = {};
    var keys = weekDateKeys(today);
    var inWeek = {};
    keys.forEach(function (k) { inWeek[k] = true; });
    Object.keys(state.days || {}).forEach(function (k) {
      if (inWeek[k]) keep[k] = state.days[k];
    });
    state.days = keep;
    return state;
  }

  /* -------------------- Telegram CloudStorage (обёрнут в Promise) --------- */
  function cloud() {
    try {
      var cs = global.Telegram && global.Telegram.WebApp && global.Telegram.WebApp.CloudStorage;
      if (cs && typeof cs.getItem === 'function' && typeof cs.setItem === 'function') return cs;
    } catch (e) {}
    return null;
  }

  function cloudGet(key) {
    return new Promise(function (resolve) {
      var cs = cloud();
      if (!cs) return resolve(null);
      try { cs.getItem(key, function (err, val) { resolve(err ? null : (val || null)); }); }
      catch (e) { resolve(null); }
    });
  }

  function cloudSet(key, value) {
    return new Promise(function (resolve) {
      var cs = cloud();
      if (!cs) return resolve(false);
      try { cs.setItem(key, value, function (err) { resolve(!err); }); }
      catch (e) { resolve(false); }
    });
  }

  /* -------------------- Дев-фолбэк вне Telegram --------------------------- */
  var memoryBlob = null;
  function devGet(key) {
    try { if (global.localStorage) return global.localStorage.getItem(key); } catch (e) {}
    return memoryBlob;
  }
  function devSet(key, value) {
    try { if (global.localStorage) { global.localStorage.setItem(key, value); return; } } catch (e) {}
    memoryBlob = value;
  }

  /* -------------------- Публичный async-интерфейс ------------------------- */
  function loadProgress() {
    var cs = cloud();
    var p = cs ? cloudGet(STORAGE_KEY) : Promise.resolve(devGet(STORAGE_KEY));
    return p.then(function (raw) {
      var parsed = null;
      if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
      return normalizeState(parsed);
    });
  }

  function saveProgress(state, today) {
    var clean = pruneOldWeeks(normalizeState(state), today || new Date());
    var blob = JSON.stringify(clean);
    var cs = cloud();
    var p = cs ? cloudSet(STORAGE_KEY, blob) : Promise.resolve(devSet(STORAGE_KEY, blob));
    return p.then(function () { return clean; });
  }

  var API = {
    loadProgress: loadProgress,
    saveProgress: saveProgress,
    goalPair: goalPair,
    levelByKey: levelByKey,
    weekDateKeys: weekDateKeys,
    startOfWeek: startOfWeek,
    dateKey: dateKey,
    emptyDay: emptyDay,
    normalizeState: normalizeState,
    pruneOldWeeks: pruneOldWeeks,
    hasCloud: function () { return !!cloud(); },
    LEVELS: LEVELS,
    DEFAULT_LEVEL: DEFAULT_LEVEL,
    STORAGE_KEY: STORAGE_KEY
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.GlutesStorage = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
