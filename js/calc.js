/* ============================================================
   calc.js —— 纯计算模块
   这里不读写 localStorage，也不碰页面元素。
   好处：逻辑可以单独测试（见 tests/calc.test.html）。
   ============================================================ */
(function (global) {
  'use strict';

  /** 存储层允许的最大时薪：1,000,000 元（防止异常数据溢出） */
  var MAX_RATE_CENTS = 100000000;
  /** 表单允许输入的最大时薪：10,000 元，与原有产品规则一致 */
  var MAX_INPUT_CENTS = 1000000;

  function isIntegerAmount(value) {
    return typeof value === 'number' &&
      Number.isFinite(value) &&
      Math.floor(value) === value;
  }

  /** 把任意非金额输入安全地转成数字，失败时返回 0 */
  function toNumber(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }
    var parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * 把 "12.50" 这样的十进制金额字符串转成整数分。
   * 这里只处理字符串，避免 1.005 * 100 这类浮点误差。
   * 超过两位的小数按「四舍五入到分」处理。
   */
  function decimalTextToCents(text) {
    var normalized = text.charAt(0) === '.' ? '0' + text : text;
    var parts = normalized.split('.');
    var whole = Number(parts[0]);
    if (!Number.isFinite(whole)) return null;

    var fraction = parts[1] || '';
    var cents = whole * 100 + Number((fraction + '00').slice(0, 2));
    var rest = fraction.slice(2);
    // 第三位小数 >= 5 时进一分；后面的位数不再参与，避免浮点误差
    if (rest && rest.charCodeAt(0) >= 53) cents += 1;
    return cents;
  }

  /**
   * 解析用户输入的人民币元（严格模式）：最多两位小数，不允许负数。
   * 返回 { ok, cents } 或 { ok:false, reason:'empty'|'format'|'decimals'|'range' }
   * options.maxCents 可覆盖默认表单上限，仅用于与历史金额做等值比较。
   */
  function parseYuanInput(value, options) {
    if (value === null || value === undefined) {
      return { ok: false, reason: 'empty' };
    }

    var maxCents = options && Number.isSafeInteger(options.maxCents)
      ? options.maxCents
      : MAX_INPUT_CENTS;
    var text = typeof value === 'number' ? String(value) : String(value).trim();
    if (text === '') return { ok: false, reason: 'empty' };

    // 负数仍属于金额范围问题，给出与旧版一致的“范围”提示
    if (/^-\d+(?:\.\d*)?$/.test(text) || /^-\.\d+$/.test(text)) {
      return { ok: false, reason: 'range' };
    }

    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
      return { ok: false, reason: 'format' };
    }
    if (/\.\d{3,}$/.test(text)) {
      return { ok: false, reason: 'decimals' };
    }

    var cents = decimalTextToCents(text);
    if (cents === null || !Number.isFinite(cents)) {
      return { ok: false, reason: 'format' };
    }
    if (!Number.isSafeInteger(cents) || cents > maxCents) {
      return { ok: false, reason: 'range' };
    }
    return { ok: true, cents: cents };
  }

  /** 用户输入元 → 整数分；非法输入返回 null */
  function yuanToCents(value) {
    var parsed = parseYuanInput(value);
    return parsed.ok ? parsed.cents : null;
  }

  /**
   * 旧数据/旧备份里的元金额 → 整数分。
   * 旧数据可能带两位以上小数，这里统一四舍五入到分。
   */
  function legacyYuanToCents(value) {
    var text;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value < 0) return null;
      text = String(value);
      // 极小数字会变成 1e-7 这种形式，四舍五入到分后是 0
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
        var rounded = Math.round(value * 100);
        return Number.isSafeInteger(rounded) && rounded >= 0 ? rounded : null;
      }
    } else if (typeof value === 'string') {
      text = value.trim();
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
    } else {
      return null;
    }

    var cents = decimalTextToCents(text);
    return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
  }

  /** 整数分 → 表单输入框里的元字符串（去掉多余的 0，最多两位小数） */
  function centsToYuanInput(cents) {
    var value = Number(cents);
    if (!isIntegerAmount(value) || value < 0) return '';
    var whole = Math.floor(value / 100);
    var fraction = value % 100;
    if (fraction === 0) return String(whole);
    return whole + '.' + String(fraction).padStart(2, '0').replace(/0$/, '');
  }

  /** 整数分 → 固定两位小数的元字符串（用于 CSV 等纯文本输出） */
  function centsToYuanFixed(cents) {
    var value = Number(cents);
    if (!Number.isFinite(value)) value = 0;
    value = Math.round(value);
    var negative = value < 0;
    value = Math.abs(value);
    var whole = Math.floor(value / 100);
    var fraction = value % 100;
    return (negative ? '-' : '') + whole + '.' + String(fraction).padStart(2, '0');
  }

  /**
   * 一节课费用（整数分）的严格计算。
   * 使用整数余数完成四舍五入：fee = floor(n/60) + (n%60 >= 30 ? 1 : 0)。
   * 不使用浮点除法，也不依赖 Math.round(rate * duration / 60)。
   */
  function calculateLessonFeeCents(hourlyRateCents, durationMinutes) {
    if (!isIntegerAmount(hourlyRateCents) || hourlyRateCents < 0) {
      return { ok: false, code: 'INVALID_RATE', cents: null };
    }
    if (!isIntegerAmount(durationMinutes) || durationMinutes <= 0) {
      return { ok: false, code: 'INVALID_DURATION', cents: null };
    }

    var numerator = hourlyRateCents * durationMinutes;
    if (!Number.isSafeInteger(numerator)) {
      return { ok: false, code: 'FEE_OVERFLOW', cents: null };
    }

    // 对安全整数取余是精确的；先减去余数再除以 60，得到精确的整数商。
    var remainder = numerator % 60;
    var whole = (numerator - remainder) / 60;
    var feeCents = whole + (remainder >= 30 ? 1 : 0);

    if (!Number.isSafeInteger(feeCents) || feeCents < 0) {
      return { ok: false, code: 'FEE_OVERFLOW', cents: null };
    }
    return { ok: true, cents: feeCents, code: null };
  }

  /**
   * 一节课的费用（整数分）。
   * 供展示和汇总使用；非法输入返回 0，保证旧调用方不会得到 NaN。
   * 需要拒绝非法输入的写入路径应使用 calculateLessonFeeCents()。
   */
  function lessonFeeCentsFromRate(hourlyRateCents, durationMinutes) {
    var result = calculateLessonFeeCents(hourlyRateCents, durationMinutes);
    return result.ok ? result.cents : 0;
  }

  /** 读取一节课的整数分费用；旧记录缺少 feeCents 时按当前规则补算 */
  function lessonFeeCents(lesson) {
    if (!lesson) return 0;
    if (isIntegerAmount(lesson.feeCents) && lesson.feeCents >= 0) {
      return lesson.feeCents;
    }
    return lessonFeeCentsFromRate(lesson.hourlyRateCents, lesson.duration);
  }

  /**
   * 把非负十进制金额文本解析成精确分数：numerator / scale。
   * 支持普通小数、".5"、数字转字符串后的科学计数法（例如 1e-7）。
   * 解析失败或规模异常时返回 null，避免构造超大 BigInt。
   */
  function decimalToFraction(value) {
    if (typeof BigInt !== 'function') return null;

    var text;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value < 0) return null;
      text = String(value);
    } else if (typeof value === 'string') {
      text = value.trim();
    } else {
      return null;
    }

    var match = /^(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
    if (!match) return null;

    var whole = match[1] || '';
    var fraction = match[2] || '';
    if (!whole && !fraction) return null;

    var exponent = match[3] ? Number(match[3]) : 0;
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 30) return null;

    var digits = (whole + fraction).replace(/^0+(?=\d)/, '') || '0';
    if (digits.length > 30) return null;

    var numerator = BigInt(digits);
    var scaleExp = fraction.length - exponent;
    var scale = BigInt(1);
    if (scaleExp > 0) {
      if (scaleExp > 30) return null;
      scale = BigInt(10) ** BigInt(scaleExp);
    } else if (scaleExp < 0) {
      if (-scaleExp > 30) return null;
      numerator *= BigInt(10) ** BigInt(-scaleExp);
    }

    return { numerator: numerator, scale: scale };
  }

  /**
   * 旧版课程费用的严格计算：round(元时薪 × 分钟 × 100 / 60)。
   * 先把旧时薪解析为精确十进制分数，再全程使用 BigInt 整数比例运算，
   * 不会先把旧时薪四舍五入成整数分，因此能保留超过两位小数的历史费用。
   */
  function calculateLegacyLessonFeeCents(hourlyRateYuan, durationMinutes) {
    var fraction = decimalToFraction(hourlyRateYuan);
    if (!fraction) {
      return { ok: false, code: 'INVALID_LEGACY_RATE', cents: null };
    }
    if (!isIntegerAmount(durationMinutes) || durationMinutes <= 0) {
      return { ok: false, code: 'INVALID_DURATION', cents: null };
    }
    if (fraction.numerator > fraction.scale * BigInt(MAX_RATE_CENTS / 100)) {
      return { ok: false, code: 'INVALID_LEGACY_RATE', cents: null };
    }

    var numerator = fraction.numerator * BigInt(durationMinutes) * BigInt(100);
    var denominator = fraction.scale * BigInt(60);
    var whole = numerator / denominator;
    var remainder = numerator % denominator;
    if (remainder * BigInt(2) >= denominator) whole += BigInt(1);

    if (whole < BigInt(0) || whole > BigInt(Number.MAX_SAFE_INTEGER)) {
      return { ok: false, code: 'FEE_OVERFLOW', cents: null };
    }
    return { ok: true, cents: Number(whole), code: null };
  }

  /**
   * 旧版公式的兼容包装：非法输入或超出安全范围时返回 0。
   * 迁移、备份导入等写入路径必须使用 calculateLegacyLessonFeeCents() 的严格结果。
   */
  function legacyLessonFeeCents(hourlyRateYuan, durationMinutes) {
    var result = calculateLegacyLessonFeeCents(hourlyRateYuan, durationMinutes);
    return result.ok ? result.cents : 0;
  }

  /** 是否已收款；旧数据没有 paid 字段时视为待收款 */
  function isPaid(lesson) {
    return Boolean(lesson) && lesson.paid === true;
  }

  /** 整数分 → "1,860.00"（按当前语言格式化，仅用于展示） */
  function formatCents(cents) {
    return global.I18N.formatCents(cents);
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
   * 返回 { count, totalMinutes, totalCents, durationText }
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
      // 每节课的费用已经是最接近的整数分，这里只做整数求和
      cents += lessonFeeCents(lesson);
    }

    return {
      count: count,
      totalMinutes: minutes,
      totalCents: cents,
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
   * 按收款状态拆分收入（全部为整数分）
   * 返回 { totalCents, paidCents, unpaidCents, paidCount, unpaidCount }
   * totalCents 是应收总额，paidCents 是实际已收，unpaidCents 是待收
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

      var cents = lessonFeeCents(lesson);
      if (isPaid(lesson)) {
        paidCents += cents;
        paidCount += 1;
      } else {
        unpaidCents += cents;
        unpaidCount += 1;
      }
    }

    return {
      totalCents: paidCents + unpaidCents,
      paidCents: paidCents,
      unpaidCents: unpaidCents,
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

  /**
   * 按月份、学生姓名、科目和收款状态筛选课程。
   * 科目来自学生当前档案；已删除学生没有科目，因此不会被科目筛选命中。
   */
  function filterLessons(lessons, options) {
    var list = Array.isArray(lessons) ? lessons : [];
    var opts = options || {};
    var targetMonth = typeof opts.monthKey === 'string' ? opts.monthKey : '';
    var nameQuery = typeof opts.studentName === 'string'
      ? opts.studentName.trim().toLowerCase()
      : '';
    var subjectQuery = typeof opts.subject === 'string'
      ? opts.subject.trim().toLowerCase()
      : '';
    var status = opts.status === 'paid' || opts.status === 'unpaid'
      ? opts.status
      : 'all';
    var studentsById = opts.studentsById || {};

    return list.filter(function (lesson) {
      if (!lesson) return false;
      if (targetMonth && monthKey(lesson.date) !== targetMonth) return false;

      var name = resolveStudentName(lesson, studentsById) || '';
      if (nameQuery && name.toLowerCase().indexOf(nameQuery) === -1) return false;

      var student = lesson.studentId ? studentsById[lesson.studentId] : null;
      var subject = student && student.subject ? student.subject : '';
      if (subjectQuery && subject.toLowerCase().indexOf(subjectQuery) === -1) {
        return false;
      }

      if (status === 'paid' && !isPaid(lesson)) return false;
      if (status === 'unpaid' && isPaid(lesson)) return false;
      return true;
    });
  }

  /** 汇总任意一组课程，用于筛选结果合计 */
  function summarizeList(lessons) {
    return summarizeBy(lessons, function () {
      return true;
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
   * 金额字段均为整数分
   * 返回 [{ month, key, label, count, totalCents, paidCents, unpaidCents }]
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

      var cents = lessonFeeCents(lesson);
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
        totalCents: totalCents[i],
        paidCents: paidCents[i],
        unpaidCents: unpaidCents[i]
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
      map[groupKey].cents += lessonFeeCents(lesson);
    }

    var rows = order.map(function (groupKey) {
      var row = map[groupKey];
      return {
        key: row.key,
        studentId: row.studentId,
        name: row.name,
        count: row.count,
        totalCents: row.cents
      };
    });

    rows.sort(function (a, b) {
      if (b.totalCents !== a.totalCents) return b.totalCents - a.totalCents;
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
    MAX_RATE_CENTS: MAX_RATE_CENTS,
    MAX_INPUT_CENTS: MAX_INPUT_CENTS,
    toNumber: toNumber,
    parseYuanInput: parseYuanInput,
    yuanToCents: yuanToCents,
    legacyYuanToCents: legacyYuanToCents,
    centsToYuanInput: centsToYuanInput,
    centsToYuanFixed: centsToYuanFixed,
    calculateLessonFeeCents: calculateLessonFeeCents,
    lessonFeeCentsFromRate: lessonFeeCentsFromRate,
    lessonFeeCents: lessonFeeCents,
    calculateLegacyLessonFeeCents: calculateLegacyLessonFeeCents,
    legacyLessonFeeCents: legacyLessonFeeCents,
    isIntegerAmount: isIntegerAmount,
    isPaid: isPaid,
    formatCents: formatCents,
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
    filterLessons: filterLessons,
    summarizeList: summarizeList,
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
