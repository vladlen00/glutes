/* Юнит-проверка чистой логики storage.js. Запуск: node storage.test.js */
var S = require('./storage.js');

var failed = 0;
function eq(actual, expected, name) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { console.log('  ok  ' + name); }
  else { failed++; console.log('FAIL  ' + name + '  expected ' + e + ' got ' + a); }
}

console.log('splitGoal (жёсткая таблица, НЕ round):');
eq(S.splitGoal(10), [6, 4], '10 -> 6/4');
eq(S.splitGoal(14), [9, 5], '14 -> 9/5');
eq(S.splitGoal(16), [10, 6], '16 -> 10/6');
eq(S.splitGoal(20), [13, 7], '20 -> 13/7');

// Контрольная: round дал бы 7/3 для 10 - убеждаемся, что мы НЕ так считаем.
eq(Math.round(10 * 0.65), 7, 'round(10*0.65)===7 (именно поэтому таблица)');
eq(S.splitGoal(10)[0] !== Math.round(10 * 0.65), true, 'splitGoal(10) != round-путь');

console.log('дефолт цели:');
eq(S.DEFAULT_GOAL, 14, 'DEFAULT_GOAL===14');
eq(S.normalizeState(null).weeklyGoal, 14, 'пустой стейт -> цель 14');
eq(S.splitGoal(S.normalizeState(null).weeklyGoal), [9, 5], 'дефолт -> 9/5');

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
