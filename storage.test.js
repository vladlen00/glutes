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

console.log(failed ? ('\n' + failed + ' проверок УПАЛО') : '\nВсе проверки прошли');
process.exit(failed ? 1 : 0);
