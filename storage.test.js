/* Юнит-проверка чистой логики storage.js. Запуск: node storage.test.js */
var S = require('./storage.js');

var failed = 0;
function eq(actual, expected, name) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log('  ok  ' + name); }
  else { failed++; console.log('FAIL  ' + name + '  expected ' + e + ' got ' + a); }
}

console.log('уровни цели (прямые пары, без деления):');
eq(S.LEVELS.length, 5, '5 уровней');
eq(S.LEVELS.map(function (l) { return l.key; }),
   ['maintain', 'tone', 'growth', 'active', 'expert'], 'ключи уровней по порядку');
eq(S.goalPair('maintain'), [6, 4], 'Поддержание -> 6/4');
eq(S.goalPair('tone'), [9, 7], 'Тонус -> 9/7');
eq(S.goalPair('growth'), [13, 10], 'Рекомендуемый рост -> 13/10');
eq(S.goalPair('active'), [16, 12], 'Активный рост -> 16/12');
eq(S.goalPair('expert'), [20, 15], 'Для опытных -> 20/15');
eq(S.goalPair('нет-такого'), [13, 10], 'неизвестный ключ -> дефолтный уровень 13/10');

console.log('дефолт и миграция:');
eq(S.DEFAULT_LEVEL, 'growth', 'DEFAULT_LEVEL===growth');
eq(S.normalizeState(null).level, 'growth', 'пустой стейт -> уровень growth');
eq(S.goalPair(S.normalizeState(null).level), [13, 10], 'дефолт -> 13/10');
// Старая подписчица: лежит weeklyGoal без level -> дефолтный уровень.
eq(S.normalizeState({ weeklyGoal: 20 }).level, 'growth', 'старый weeklyGoal без level -> growth');
eq(S.normalizeState({ level: 'expert' }).level, 'expert', 'валидный level сохраняется');
eq(S.normalizeState({ level: 'мусор' }).level, 'growth', 'битый level -> growth');
eq(S.normalizeState(null).hintSeen, false, 'hintSeen по умолчанию false');
eq(S.normalizeState({ hintSeen: true }).hintSeen, true, 'hintSeen сохраняется');

console.log('неделя Пн-Вс по локальной дате:');
var keys = S.weekDateKeys(new Date(2026, 6, 9)); // 2026-07-09
eq(keys.length, 7, '7 дней');
eq(S.startOfWeek(new Date(2026, 6, 9)).getDay(), 1, 'старт недели - понедельник');
eq(keys[0], '2026-07-06', 'понедельник недели 09.07.2026 = 2026-07-06');
eq(keys[6], '2026-07-12', 'воскресенье = 2026-07-12');
eq(S.dateKey(new Date(2026, 0, 5)), '2026-01-05', 'dateKey с ведущими нулями');

console.log('подчистка старых недель:');
var st = S.normalizeState({ days: { '2026-07-06': S.emptyDay(), '2020-01-01': S.emptyDay() } });
S.pruneOldWeeks(st, new Date(2026, 6, 9));
eq(Object.keys(st.days), ['2026-07-06'], 'старый 2020-01-01 удалён, текущий оставлен');

// Подделка повторяет SDK: CloudStorage есть ВСЕГДА, ниже 6.9 вызов бросает.
function fakeLocal() {
  var m = {};
  return { data: m,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); } };
}
function fakeTelegram(supported) {
  var store = {}, calls = 0;
  var cs = {
    getItem: function (k, cb) { calls++; if (!supported) throw Error('WebAppMethodUnsupported');
      setTimeout(function () { cb(null, store[k] || ''); }, 0); },
    setItem: function (k, v, cb) { calls++; if (!supported) throw Error('WebAppMethodUnsupported');
      store[k] = v; setTimeout(function () { cb(null, true); }, 0); }
  };
  return { store: store, calls: function () { return calls; },
    tg: { WebApp: { CloudStorage: cs, isVersionAtLeast: function () { return supported; } } } };
}
async function roundTrip(telegram) {
  var ls = fakeLocal();
  global.localStorage = ls;
  global.Telegram = telegram ? telegram.tg : undefined;
  var today = new Date(2026, 8, 14), st = S.normalizeState({ level: 'tone' });
  st.days[S.dateKey(today)] = S.emptyDay();
  st.days[S.dateKey(today)].glutMaxSets = 2;
  await S.saveProgress(st, today);
  return { ls: ls, back: await S.loadProgress() };
}

(async function () {
  console.log('выбор хранилища:');
  var web = fakeTelegram(false), r = await roundTrip(web);
  eq(S.hasCloud(), false, 'вне телеграма (SDK 6.0): CloudStorage НЕ выбран');
  eq(web.calls(), 0, 'вне телеграма: к CloudStorage ни одного вызова');
  eq(Object.keys(r.ls.data), ['glutes_progress_v1'], 'вне телеграма: запись в localStorage');
  eq([r.back.level, r.back.days['2026-09-14'].glutMaxSets], ['tone', 2], 'вне телеграма: данные пережили загрузку');

  var tg = fakeTelegram(true); r = await roundTrip(tg);
  eq(S.hasCloud(), true, 'телеграм 6.9+: CloudStorage выбран, как раньше');
  eq(typeof tg.store.glutes_progress_v1, 'string', 'телеграм 6.9+: запись в CloudStorage');
  eq(Object.keys(r.ls.data), [], 'телеграм 6.9+: localStorage НЕ тронут');
  eq(r.back.level, 'tone', 'телеграм 6.9+: прочитано из CloudStorage');

  r = await roundTrip(null);
  eq(r.back.level, 'tone', 'без объекта Telegram: localStorage, как и было');

  console.log(failed ? ('\n' + failed + ' проверок УПАЛО') : '\nВсе проверки прошли');
  process.exit(failed ? 1 : 0);
})();
