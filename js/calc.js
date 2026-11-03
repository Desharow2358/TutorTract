/* ============================================================
   calc.js —— 纯计算模块
   这里不读写 localStorage，也不碰页面元素。
   好处：逻辑可以单独测试（见 tests/calc.test.html）。
   ============================================================ */
(function (global) {
  'use strict';

  /** 把任意输入安全地转成数字，失败时返回 0 */
  function toNumber(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    var parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /** 金额四舍五入到分，避免出现 97.50000000000001 */
  function roundMoney(value) {
    return Math.round(toNumber(value) * 100) / 100;
  }

  /** 一节课的收入：时长(分钟) / 60 × 每小时课时费 */
  function lessonIncome(lesson) {
    if (!lesson) return 0;
    var duration = toNumber(lesson.duration);
    var rate = toNumber(lesson.rate);
    if (duration <= 0 || rate <= 0) return 0;
    return roundMoney((duration / 60) * rate);
  }

  /** 是否已收款；旧数据没有 paid 字段时视为待收款 */
  function isPaid(lesson) {
    return Boolean(lesson) && lesson.paid === true;
  }

  /** 1860 → "1,860.00"（按当前语言格式化） */
  function formatMoney(value) {
    return global.I18N.formatMoney(roundMoney(value));
  }

  /** 150 → "2 小时 30 分钟"（按当前语言格式化） */
  function minutesToText(value) {
    return global.I18N.minutesToText(value);
  }

  /** 从 "2026-11-03" 取出 "2026-11" */
  function monthKey(dateString) {
    return typeof dateString === 'string' ? dateString.slice(0, 7) : '';
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  /** 用本地时间生成 "YYYY-MM-DD"，不要用 toISOString（会有时区偏移） */
  function toDateString(date) {
    var d = date instanceof Date ? date : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 当前月份的 "YYYY-MM" */
  function currentMonthKey(date) {
    return monthKey(toDateString(date));
  }

  /** "2026-11" → "2026 年 11 月"（按当前语言格式化） */
  function monthLabel(key) {
    return global.I18N.monthLabel(key);
  }

  /** 从 "2026-11-03" 取出 "2026" */
  function yearKey(dateString) {
    return typeof dateString === 'string' ? dateString.slice(0, 4) : '';
  }

  /** 当前年份的 "YYYY" */
  function currentYearKey(date) {
    return yearKey(toDateString(date));
  }

  /** "2026" → "2026 年"（按当前语言格式化） */
  function yearLabel(key) {
    return global.I18N.yearLabel(key);
  }

  /** 判断一节课是否属于指定年份 */
  function isSameYear(lesson, key) {
    return Boolean(lesson) && yearKey(lesson.date) === key;
  }

  /** 严格校验日期字符串，能识别 2026-02-30 这种不存在的日期 */
  function isValidDateString(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
    }
    var parts = value.split('-').map(Number);
    var year = parts[0];
    var month = parts[1];
    var day = parts[2];
    if (month < 1 || month > 12 || day < 1) return false;

    var d = new Date(year, month - 1, day);
    return (
      d.getFullYear() === year &&
      d.getMonth() === month - 1 &&
      d.getDate() === day
    );
  }

  /** 判断一节课是否属于指定月份 */
  function isSameMonth(lesson, key) {
    return Boolean(lesson) && monthKey(lesson.date) === key;
  }

  /**
   * 通用汇总：按 predicate 过滤后统计
   * 返回 { count, totalMinutes, totalIncome, durationText }
   */
  function summarizeBy(lessons, predicate) {
    var list = Array.isArray(lessons) ? lessons : [];
    var count = 0;
    var minutes = 0;
    var cents = 0;

    for (var i = 0; i < list.length; i += 1) {
      var lesson = list[i];
      if (!predicate(lesson)) continue;
      count += 1;
      minutes += Math.max(0, Math.round(toNumber(lesson.duration)));
      // 以“分”累加，避免浮点误差越加越大
      cents += Math.round(lessonIncome(lesson) * 100);
    }

    return {
      count: count,
      totalMinutes: minutes,
      totalIncome: cents / 100,
      durationText: minutesToText(minutes)
    };
  }

  /** 汇总某个月的课程 */
  function summarize(lessons, key) {
    return summarizeBy(lessons, function (lesson) {
      return isSameMonth(lesson, key);
    });
  }

  /** 汇总某一年的课程 */
  function summarizeYear(lessons, key) {
    return summarizeBy(lessons, function (lesson) {
      return isSameYear(lesson, key);
    });
  }

  /**
   * 按收款状态拆分收入
   * 返回 { totalIncome, paidIncome, unpaidIncome, paidCount, unpaidCount }
   * totalIncome 是应收总额，paidIncome 是实际已收，unpaidIncome 是待收
   */
  function summarizePaymentsBy(lessons, predicate) {
    var list = Array.isArray(lessons) ? lessons : [];
    var paidCents = 0;
    var unpaidCents = 0;
    var paidCount = 0;
    var unpaidCount = 0;

    for (var i = 0; i < list.length; i += 1) {
      var lesson = list[i];
      if (!predicate(lesson)) continue;

      // 同样以“分”累加，避免浮点误差
      var cents = Math.round(lessonIncome(lesson) * 100);
      if (isPaid(lesson)) {
        paidCents += cents;
        paidCount += 1;
      } else {
        unpaidCents += cents;
        unpaidCount += 1;
      }
    }

    return {
      totalIncome: (paidCents + unpaidCents) / 100,
      paidIncome: paidCents / 100,
      unpaidIncome: unpaidCents / 100,
      paidCount: paidCount,
      unpaidCount: unpaidCount
    };
  }

  /** 汇总某个月按收款状态拆分的收入 */
  function summarizeMonthPayments(lessons, key) {
    return summarizePaymentsBy(lessons, function (lesson) {
      return isSameMonth(lesson, key);
    });
  }

  /** 汇总某一年按收款状态拆分的收入 */
  function summarizeYearPayments(lessons, key) {
    return summarizePaymentsBy(lessons, function (lesson) {
      return isSameYear(lesson, key);
    });
  }

  /**
   * 取课程的显示用学生姓名
   * 学生还在，就用学生档案里的最新昵称；学生已删除，就用课程里的昵称快照
   */
  function resolveStudentName(lesson, studentsById) {
    if (!lesson) return '';
    if (studentsById && lesson.studentId && studentsById[lesson.studentId]) {
      return studentsById[lesson.studentId].name;
    }
    return lesson.student || '';
  }

  /** 排序：日期倒序；同一天则按创建时间倒序。返回新数组，不修改原数组 */
  function sortLessons(lessons) {
    var list = Array.isArray(lessons) ? lessons.slice() : [];
    return list.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  /** 筛选某一天的全部课程 */
  function lessonsOnDate(lessons, date) {
    var list = Array.isArray(lessons) ? lessons : [];
    return list.filter(function (lesson) {
      return lesson && lesson.date === date;
    });
  }

  /** 指定月份的天数（month 从 1 开始） */
  function daysInMonth(year, month) {
    var y = Math.round(toNumber(year));
    var m = Math.round(toNumber(month));
    if (m < 1 || m > 12) return 0;
    return new Date(y, m, 0).getDate();
  }

  /**
   * 生成月历格子（6 行 × 7 列，周一为第一列）
   * 返回 [{ date, day, month, year, inMonth }]
   */
  function buildMonthCells(year, month) {
    var y = Math.round(toNumber(year));
    var m = Math.round(toNumber(month));
    if (m < 1 || m > 12) return [];

    var first = new Date(y, m - 1, 1);
    var offset = (first.getDay() + 6) % 7; // 周一 = 0，周日 = 6
    var cells = [];

    for (var i = 0; i < 42; i += 1) {
      var d = new Date(y, m - 1, 1 - offset + i);
      cells.push({
        date: toDateString(d),
        day: d.getDate(),
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        inMonth: d.getMonth() === m - 1
      });
    }

    return cells;
  }

  /** "2026-11" 前后移动若干个月 */
  function shiftMonthKey(key, delta) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}$/.test(key)) {
      return currentMonthKey();
    }

    var year = Number(key.slice(0, 4));
    var month = Number(key.slice(5, 7));
    var total = year * 12 + (month - 1) + Math.round(toNumber(delta));
    var nextYear = Math.floor(total / 12);
    var nextMonth = total - nextYear * 12 + 1;

    return nextYear + '-' + pad2(nextMonth);
  }

  /** "2026-11-03" → "周二"（按当前语言格式化） */
  function weekdayLabel(dateString) {
    if (!isValidDateString(dateString)) return '';
    return global.I18N.weekdayLabel(dateString);
  }

  /**
   * 某一年 12 个月的收入趋势（没有课程的月份也返回 0）
   * 返回 [{ month, key, label, count, totalIncome, paidIncome, unpaidIncome }]
   */
  function monthlyRevenue(lessons, key) {
    var year = typeof key === 'string' ? key : String(key);
    var list = Array.isArray(lessons) ? lessons : [];
    var counts = [];
    var totalCents = [];
    var paidCents = [];
    var unpaidCents = [];
    var i;

    for (i = 0; i < 12; i += 1) {
      counts.push(0);
      totalCents.push(0);
      paidCents.push(0);
      unpaidCents.push(0);
    }

    for (i = 0; i < list.length; i += 1) {
      var lesson = list[i];
      if (!lesson || yearKey(lesson.date) !== year) continue;

      var month = Number(monthKey(lesson.date).slice(5, 7));
      var index = month - 1;
      if (index < 0 || index > 11) continue;

      var cents = Math.round(lessonIncome(lesson) * 100);
      counts[index] += 1;
      totalCents[index] += cents;
      if (isPaid(lesson)) {
        paidCents[index] += cents;
      } else {
        unpaidCents[index] += cents;
      }
    }

    var result = [];
    for (i = 0; i < 12; i += 1) {
      result.push({
        month: i + 1,
        key: year + '-' + pad2(i + 1),
        label: global.I18N.monthName(i + 1, 'short'),
        count: counts[i],
        totalIncome: totalCents[i] / 100,
        paidIncome: paidCents[i] / 100,
        unpaidIncome: unpaidCents[i] / 100
      });
    }

    return result;
  }

  /**
   * 按学生汇总收入，默认从高到低。
   * 使用 studentId 分组；学生已删除时使用课程里的昵称快照，
   * 所以删除学生不会导致历史收入丢失或串到别人头上。
   */
  function summarizeStudentsBy(lessons, predicate, studentsById) {
    var list = Array.isArray(lessons) ? lessons : [];
    var map = {};
    var order = [];

    for (var i = 0; i < list.length; i += 1) {
      var lesson = list[i];
      if (!predicate(lesson)) continue;

      var name = resolveStudentName(lesson, studentsById) || lesson.student ||
        global.I18N.t('common.unnamedStudent');
      var groupKey = lesson.studentId
        ? 'id:' + lesson.studentId
        : 'name:' + (lesson.student || '');

      if (!map[groupKey]) {
        map[groupKey] = {
          key: groupKey,
          studentId: lesson.studentId || '',
          name: name,
          count: 0,
          cents: 0
        };
        order.push(groupKey);
      }

      map[groupKey].name = name;
      map[groupKey].count += 1;
      map[groupKey].cents += Math.round(lessonIncome(lesson) * 100);
    }

    var rows = order.map(function (groupKey) {
      var row = map[groupKey];
      return {
        key: row.key,
        studentId: row.studentId,
        name: row.name,
        count: row.count,
        totalIncome: row.cents / 100
      };
    });

    rows.sort(function (a, b) {
      if (b.totalIncome !== a.totalIncome) return b.totalIncome - a.totalIncome;
      return a.name.localeCompare(b.name, global.I18N.getLocale());
    });

    return rows;
  }

  function summarizeStudentsMonth(lessons, key, studentsById) {
    return summarizeStudentsBy(lessons, function (lesson) {
      return isSameMonth(lesson, key);
    }, studentsById);
  }

  function summarizeStudentsYear(lessons, key, studentsById) {
    return summarizeStudentsBy(lessons, function (lesson) {
      return isSameYear(lesson, key);
    }, studentsById);
  }

  /** 课程记录中出现过的年份，从新到旧 */
  function yearsWithLessons(lessons) {
    var list = Array.isArray(lessons) ? lessons : [];
    var seen = {};
    var years = [];

    for (var i = 0; i < list.length; i += 1) {
      var year = yearKey(list[i] && list[i].date);
      if (year && !seen[year]) {
        seen[year] = true;
        years.push(year);
      }
    }

    years.sort(function (a, b) {
      return Number(b) - Number(a);
    });
    return years;
  }

  global.Calc = {
    toNumber: toNumber,
    roundMoney: roundMoney,
    lessonIncome: lessonIncome,
    isPaid: isPaid,
    formatMoney: formatMoney,
    minutesToText: minutesToText,
    monthKey: monthKey,
    toDateString: toDateString,
    currentMonthKey: currentMonthKey,
    monthLabel: monthLabel,
    yearKey: yearKey,
    currentYearKey: currentYearKey,
    yearLabel: yearLabel,
    isValidDateString: isValidDateString,
    isSameMonth: isSameMonth,
    isSameYear: isSameYear,
    summarize: summarize,
    summarizeYear: summarizeYear,
    summarizeMonthPayments: summarizeMonthPayments,
    summarizeYearPayments: summarizeYearPayments,
    resolveStudentName: resolveStudentName,
    sortLessons: sortLessons,
    lessonsOnDate: lessonsOnDate,
    daysInMonth: daysInMonth,
    buildMonthCells: buildMonthCells,
    shiftMonthKey: shiftMonthKey,
    weekdayLabel: weekdayLabel,
    monthlyRevenue: monthlyRevenue,
    summarizeStudentsMonth: summarizeStudentsMonth,
    summarizeStudentsYear: summarizeStudentsYear,
    yearsWithLessons: yearsWithLessons
  };
})(window);
