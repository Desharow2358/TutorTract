/* ============================================================
   ui.js —— 渲染模块
   只负责把数据画到页面上、显示提示，不修改存储、不做业务判断。
   ============================================================ */
(function (global) {
  'use strict';

  var els = {};
  var toastTimer = null;

  var LESSON_CONTROL = {
    student: 'studentId',
    date: 'date',
    duration: 'duration',
    rate: 'rate'
  };

  function init() {
    els.periodLabel = document.getElementById('period-label');
    els.statsHint = document.getElementById('stats-hint');
    els.statReceivableLabel = document.getElementById('stat-receivable-label');
    els.statReceivable = document.getElementById('stat-receivable');
    els.statPaidLabel = document.getElementById('stat-paid-label');
    els.statPaid = document.getElementById('stat-paid');
    els.statPaidSub = document.getElementById('stat-paid-sub');
    els.statUnpaidLabel = document.getElementById('stat-unpaid-label');
    els.statUnpaid = document.getElementById('stat-unpaid');
    els.statUnpaidSub = document.getElementById('stat-unpaid-sub');
    els.statCount = document.getElementById('stat-count');
    els.statDuration = document.getElementById('stat-duration');
    els.periodButtons = Array.prototype.slice.call(document.querySelectorAll('[data-period]'));

    els.lessonCount = document.getElementById('lesson-count');
    els.list = document.getElementById('lesson-list');
    els.empty = document.getElementById('empty-state');
    els.template = document.getElementById('lesson-item-template');
    els.incomePreview = document.getElementById('income-preview');

    els.form = document.getElementById('lesson-form');
    els.lessonStudent = document.getElementById('student');
    els.studentHint = document.getElementById('student-hint');

    els.lessonDialog = document.getElementById('lesson-dialog');
    els.lessonEditForm = document.getElementById('lesson-edit-form');
    els.editStudent = document.getElementById('edit-student');
    els.editIncomePreview = document.getElementById('edit-income-preview');
    els.editCancel = document.getElementById('lesson-edit-cancel');

    els.studentForm = document.getElementById('student-form');
    els.studentList = document.getElementById('student-list');
    els.studentEmpty = document.getElementById('student-empty-state');
    els.studentTemplate = document.getElementById('student-item-template');
    els.studentCount = document.getElementById('student-count');
    els.studentSubmit = document.getElementById('student-submit');
    els.studentCancel = document.getElementById('student-cancel');
    els.studentFormHint = document.getElementById('student-form-hint');

    els.toast = document.getElementById('toast');
    els.warning = document.getElementById('storage-warning');

    els.recordsHint = document.getElementById('records-hint');
    els.viewButtons = Array.prototype.slice.call(document.querySelectorAll('[data-view]'));
    els.listView = document.getElementById('list-view');
    els.calendarView = document.getElementById('calendar-view');
    els.calendarTitle = document.getElementById('calendar-title');
    els.calendarGrid = document.getElementById('calendar-grid');
    els.calendarDayTitle = document.getElementById('calendar-day-title');
    els.calendarDaySummary = document.getElementById('calendar-day-summary');
    els.calendarDayCount = document.getElementById('calendar-day-count');
    els.calendarDayList = document.getElementById('calendar-day-list');
    els.calendarDayEmpty = document.getElementById('calendar-day-empty');
    els.calendarDayEmptyTitle = document.getElementById('calendar-day-empty-title');
    els.calendarDayEmptyHint = document.getElementById('calendar-day-empty-hint');
    els.calendarTemplate = document.getElementById('calendar-lesson-template');

    els.trendYear = document.getElementById('trend-year');
    els.trendChart = document.getElementById('trend-chart');
    els.trendEmpty = document.getElementById('trend-empty');
    els.analysisPeriodButtons = Array.prototype.slice.call(
      document.querySelectorAll('[data-analysis-period]')
    );
    els.analysisYear = document.getElementById('analysis-year');
    els.analysisMonth = document.getElementById('analysis-month');
    els.analysisMonthWrap = els.analysisMonth ? els.analysisMonth.closest('label') : null;
    els.analysisRangeLabel = document.getElementById('analysis-range-label');
    els.analysisReceivable = document.getElementById('analysis-receivable');
    els.analysisPaid = document.getElementById('analysis-paid');
    els.analysisPaidSub = document.getElementById('analysis-paid-sub');
    els.analysisUnpaid = document.getElementById('analysis-unpaid');
    els.analysisUnpaidSub = document.getElementById('analysis-unpaid-sub');
    els.paymentBar = document.getElementById('payment-bar');
    els.paymentBarPaid = document.getElementById('payment-bar-paid');
    els.paymentBarUnpaid = document.getElementById('payment-bar-unpaid');
    els.paymentEmpty = document.getElementById('payment-empty');
    els.studentChart = document.getElementById('student-chart');
    els.studentChartHint = document.getElementById('student-chart-hint');
    els.studentChartEmpty = document.getElementById('student-chart-empty');

    els.exportBackup = document.getElementById('export-backup');
    els.importTrigger = document.getElementById('import-trigger');
    els.importFile = document.getElementById('import-file');
    els.importStatus = document.getElementById('import-status');
    els.dataSummary = document.getElementById('data-summary');
  }

  /* ---------------- 概览 ---------------- */

  /** 概览：应收 / 已收 / 待收 / 次数 / 总时长，支持本月与全年 */
  function renderStats(summary, period, key) {
    var isYear = period === 'year';
    var prefix = isYear ? '全年' : '本月';

    els.periodLabel.textContent = isYear ? Calc.yearLabel(key) : Calc.monthLabel(key);
    els.statsHint.textContent = isYear
      ? '按上课日期统计当前自然年'
      : '按上课日期统计当前自然月';

    els.statReceivableLabel.textContent = prefix + '应收';
    els.statPaidLabel.textContent = prefix + '已收';
    els.statUnpaidLabel.textContent = prefix + '待收';

    els.statReceivable.textContent = '¥' + Calc.formatMoney(summary.totalIncome);
    els.statPaid.textContent = '¥' + Calc.formatMoney(summary.paidIncome);
    els.statUnpaid.textContent = '¥' + Calc.formatMoney(summary.unpaidIncome);
    els.statPaidSub.textContent = summary.paidCount + ' 节';
    els.statUnpaidSub.textContent = summary.unpaidCount + ' 节';

    els.statCount.textContent = summary.count + ' 节';
    els.statDuration.textContent = summary.durationText;

    els.periodButtons.forEach(function (button) {
      button.setAttribute(
        'aria-pressed',
        button.dataset.period === period ? 'true' : 'false'
      );
    });
  }

  function renderCount(total) {
    els.lessonCount.textContent = total + ' 条';
  }

  /** 给列表项里的收款状态与操作按钮统一绑定数据 */
  function decorateLessonActions(node, lesson, name) {
    var paid = Calc.isPaid(lesson);
    var status = node.querySelector('[data-field="status"]');
    status.textContent = paid ? '已收款' : '待收款';
    status.classList.add(paid ? 'status-badge--paid' : 'status-badge--unpaid');

    var toggleButton = node.querySelector('[data-action="toggle-paid"]');
    toggleButton.dataset.id = lesson.id;
    toggleButton.textContent = paid ? '改回待收' : '标记已收';
    toggleButton.setAttribute('aria-pressed', paid ? 'true' : 'false');
    toggleButton.setAttribute(
      'aria-label',
      toggleButton.textContent + '：' + name + ' ' + lesson.date
    );

    var editButton = node.querySelector('[data-action="edit"]');
    editButton.dataset.id = lesson.id;
    editButton.setAttribute(
      'aria-label',
      '编辑 ' + name + ' 在 ' + lesson.date + ' 的课程记录'
    );

    var deleteButton = node.querySelector('[data-action="delete"]');
    deleteButton.dataset.id = lesson.id;
    deleteButton.setAttribute(
      'aria-label',
      '删除 ' + name + ' 在 ' + lesson.date + ' 的课程记录'
    );
  }

  /* ---------------- 课程列表 ---------------- */

  /** 重画课程列表；没有数据时显示空状态 */
  function renderList(lessons, studentsById) {
    els.list.textContent = '';

    if (!lessons.length) {
      els.empty.hidden = false;
      return;
    }
    els.empty.hidden = true;

    var fragment = document.createDocumentFragment();

    lessons.forEach(function (lesson) {
      var node = els.template.content.firstElementChild.cloneNode(true);
      var name = Calc.resolveStudentName(lesson, studentsById);

      node.dataset.id = lesson.id;
      node.querySelector('[data-field="student"]').textContent = name;
      node.querySelector('[data-field="date"]').textContent = lesson.date;
      node.querySelector('[data-field="duration"]').textContent = Calc.minutesToText(lesson.duration);
      node.querySelector('[data-field="rate"]').textContent = '¥' + Calc.formatMoney(lesson.rate) + '/小时';
      node.querySelector('[data-field="income"]').textContent = '¥' + Calc.formatMoney(Calc.lessonIncome(lesson));

      decorateLessonActions(node, lesson, name);

      fragment.appendChild(node);
    });

    els.list.appendChild(fragment);
  }

  /* ---------------- 学生列表与下拉框 ---------------- */

  /** 重画学生列表；editingId 用于高亮正在编辑的那一行 */
  function renderStudents(students, editingId) {
    els.studentCount.textContent = students.length + ' 位';
    els.studentList.textContent = '';

    if (!students.length) {
      els.studentEmpty.hidden = false;
      return;
    }
    els.studentEmpty.hidden = true;

    var fragment = document.createDocumentFragment();

    students.forEach(function (student) {
      var node = els.studentTemplate.content.firstElementChild.cloneNode(true);

      node.dataset.id = student.id;
      node.querySelector('[data-field="name"]').textContent = student.name;

      var meta = [];
      if (student.grade) meta.push(student.grade);
      if (student.subject) meta.push(student.subject);
      node.querySelector('[data-field="meta"]').textContent =
        meta.length ? meta.join(' · ') : '未填写年级与科目';

      node.querySelector('[data-field="rate"]').textContent =
        '¥' + Calc.formatMoney(student.rate) + '/小时';

      if (student.id === editingId) {
        node.classList.add('student--editing');
      }

      var editButton = node.querySelector('[data-action="edit-student"]');
      editButton.dataset.id = student.id;
      editButton.setAttribute('aria-label', '编辑学生 ' + student.name);

      var deleteButton = node.querySelector('[data-action="delete-student"]');
      deleteButton.dataset.id = student.id;
      deleteButton.setAttribute('aria-label', '删除学生 ' + student.name);

      fragment.appendChild(node);
    });

    els.studentList.appendChild(fragment);
  }

  /**
   * 重建「记一节课」里的学生下拉框
   * preferredId 省略时，尽量保留当前选中的学生
   */
  function setLessonStudentOptions(students, preferredId) {
    var current = typeof preferredId === 'string' ? preferredId : els.lessonStudent.value;

    els.lessonStudent.textContent = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';

    if (students.length) {
      placeholder.textContent = '请选择学生';
      els.lessonStudent.disabled = false;
      els.studentHint.hidden = true;
    } else {
      placeholder.textContent = '还没有学生，请先添加';
      els.lessonStudent.disabled = true;
      els.studentHint.hidden = false;
    }
    els.lessonStudent.appendChild(placeholder);

    students.forEach(function (student) {
      var option = document.createElement('option');
      option.value = student.id;

      var label = [student.name];
      if (student.grade) label.push(student.grade);
      if (student.subject) label.push(student.subject);
      option.textContent = label.join(' · ');

      els.lessonStudent.appendChild(option);
    });

    if (current) {
      var exists = students.some(function (student) {
        return student.id === current;
      });
      els.lessonStudent.value = exists ? current : '';
    }
  }

  function getLessonStudentId() {
    return els.lessonStudent.value;
  }

  /** 选中某个学生，并带出默认时薪 */
  function selectLessonStudent(student) {
    if (!student) return;
    els.lessonStudent.value = student.id;
    setLessonRate(student.rate);
  }

  function setLessonRate(value) {
    els.form.elements.rate.value =
      value === null || value === undefined ? '' : String(value);
  }

  /* ---------------- 记课表单 ---------------- */

  /** 实时收入预览；传 null 显示占位符 */
  function setIncomePreview(text) {
    els.incomePreview.textContent = text || '—';
  }

  /* ---------------- 编辑课程弹窗 ---------------- */

  /** 根据当前编辑表单里的时长和课时费刷新收入预览 */
  function refreshEditIncomePreview() {
    var duration = Number(els.lessonEditForm.elements.duration.value);
    var rate = Number(els.lessonEditForm.elements.rate.value);

    var valid =
      els.lessonEditForm.elements.duration.value !== '' &&
      els.lessonEditForm.elements.rate.value !== '' &&
      Number.isFinite(duration) &&
      Number.isFinite(rate) &&
      duration > 0 &&
      rate >= 0;

    els.editIncomePreview.textContent = valid
      ? '¥' + Calc.formatMoney(Calc.lessonIncome({ duration: duration, rate: rate }))
      : '—';
  }

  /** 重建编辑弹窗里的学生下拉框（保留已被删除学生的昵称，避免编辑时丢失） */
  function setEditStudentOptions(students, lesson) {
    els.editStudent.textContent = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = students.length ? '请选择学生' : '还没有学生';
    els.editStudent.appendChild(placeholder);

    var found = false;
    students.forEach(function (student) {
      var option = document.createElement('option');
      option.value = student.id;

      var label = [student.name];
      if (student.grade) label.push(student.grade);
      if (student.subject) label.push(student.subject);
      option.textContent = label.join(' · ');

      if (student.id === lesson.studentId) found = true;
      els.editStudent.appendChild(option);
    });

    if (!found && lesson.studentId) {
      var removedOption = document.createElement('option');
      removedOption.value = lesson.studentId;
      removedOption.textContent = (lesson.student || '原学生') + '（已删除）';
      els.editStudent.appendChild(removedOption);
    }

    els.editStudent.value = lesson.studentId || '';
  }

  /** 打开编辑弹窗，并自动填入当前记录的数据 */
  function openLessonEditor(lesson, students) {
    clearEditErrors();

    setEditStudentOptions(students, lesson);
    els.lessonEditForm.elements.date.value = lesson.date;
    els.lessonEditForm.elements.duration.value = String(lesson.duration);
    els.lessonEditForm.elements.rate.value = String(lesson.rate);

    var paid = Calc.isPaid(lesson) ? 'paid' : 'unpaid';
    var paidInput = els.lessonEditForm.elements.namedItem('paid');
    if (paidInput) paidInput.value = paid;

    refreshEditIncomePreview();

    if (typeof els.lessonDialog.showModal === 'function') {
      if (!els.lessonDialog.open) els.lessonDialog.showModal();
    } else {
      els.lessonDialog.setAttribute('open', '');
    }

    els.editStudent.focus();
  }

  function closeLessonEditor() {
    if (typeof els.lessonDialog.close === 'function' && els.lessonDialog.open) {
      els.lessonDialog.close();
    } else {
      els.lessonDialog.removeAttribute('open');
    }
  }

  /** 读取编辑表单的原始字符串 */
  function readLessonEditor() {
    var elements = els.lessonEditForm.elements;
    var paidInput = elements.namedItem('paid');

    return {
      studentId: elements.studentId.value,
      date: elements.date.value,
      duration: elements.duration.value.trim(),
      rate: elements.rate.value.trim(),
      paid: paidInput ? paidInput.value : 'unpaid'
    };
  }

  function setEditFieldError(name, message) {
    var controlName = LESSON_CONTROL[name] || name;
    var input = els.lessonEditForm.elements.namedItem(controlName);
    var error = document.getElementById('edit-' + name + '-error');

    if (input) {
      input.classList.toggle('is-invalid', Boolean(message));
      if (message) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    }

    if (error) {
      error.textContent = message || '';
      error.hidden = !message;
    }
  }

  function clearEditErrors() {
    ['student', 'date', 'duration', 'rate'].forEach(function (name) {
      setEditFieldError(name, '');
    });
  }

  function showEditErrors(errors) {
    var order = ['student', 'date', 'duration', 'rate'];
    var firstInvalid = null;

    order.forEach(function (name) {
      var message = errors[name];
      setEditFieldError(name, message || '');
      if (message && !firstInvalid) firstInvalid = name;
    });

    if (firstInvalid) {
      var input = els.lessonEditForm.elements.namedItem(
        LESSON_CONTROL[firstInvalid] || firstInvalid
      );
      if (input) input.focus();
    }
  }

  function setFieldError(name, message) {
    var controlName = LESSON_CONTROL[name] || name;
    var input = els.form.elements.namedItem(controlName);
    var error = document.getElementById(name + '-error');

    if (input) {
      input.classList.toggle('is-invalid', Boolean(message));
      if (message) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    }

    if (error) {
      error.textContent = message || '';
      error.hidden = !message;
    }
  }

  function clearErrors() {
    ['student', 'date', 'duration', 'rate'].forEach(function (name) {
      setFieldError(name, '');
    });
  }

  /** 显示错误；自动把焦点移到第一个出错的控件 */
  function showErrors(errors) {
    var order = ['student', 'date', 'duration', 'rate'];
    var firstInvalid = null;

    order.forEach(function (name) {
      var message = errors[name];
      setFieldError(name, message || '');
      if (message && !firstInvalid) firstInvalid = name;
    });

    if (firstInvalid) {
      var input = els.form.elements.namedItem(LESSON_CONTROL[firstInvalid] || firstInvalid);
      if (input) input.focus();
    }
  }

  function setFormDefaultDate(value) {
    els.form.elements.date.value = value;
  }

  /** 清空记课表单，并把日期恢复为今天 */
  function resetForm() {
    els.form.reset();
    clearErrors();
    setFormDefaultDate(Calc.toDateString(new Date()));
  }

  function focusStudent() {
    els.form.elements.studentId.focus();
  }

  /* ---------------- 学生表单 ---------------- */

  function setStudentFieldError(name, message) {
    var input = els.studentForm.elements.namedItem(name);
    var error = document.getElementById('student-' + name + '-error');

    if (input) {
      input.classList.toggle('is-invalid', Boolean(message));
      if (message) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    }

    if (error) {
      error.textContent = message || '';
      error.hidden = !message;
    }
  }

  function clearStudentErrors() {
    ['name', 'grade', 'subject', 'rate'].forEach(function (name) {
      setStudentFieldError(name, '');
    });
  }

  function showStudentErrors(errors) {
    var order = ['name', 'grade', 'subject', 'rate'];
    var firstInvalid = null;

    order.forEach(function (name) {
      var message = errors[name];
      setStudentFieldError(name, message || '');
      if (message && !firstInvalid) firstInvalid = name;
    });

    if (firstInvalid) {
      var input = els.studentForm.elements.namedItem(firstInvalid);
      if (input) input.focus();
    }
  }

  /** mode: 'add' 或 'edit' */
  function setStudentFormMode(mode, student) {
    var editing = mode === 'edit' && student;

    clearStudentErrors();

    if (editing) {
      els.studentForm.elements.name.value = student.name;
      els.studentForm.elements.grade.value = student.grade || '';
      els.studentForm.elements.subject.value = student.subject || '';
      els.studentForm.elements.rate.value = String(student.rate);

      els.studentSubmit.textContent = '保存修改';
      els.studentCancel.hidden = false;
      els.studentFormHint.textContent = '正在编辑「' + student.name + '」，修改后点击保存。';

      focusStudentName();
    } else {
      els.studentForm.reset();
      clearStudentErrors();
      els.studentSubmit.textContent = '添加学生';
      els.studentCancel.hidden = true;
      els.studentFormHint.textContent = '填写学生信息后点击「添加学生」';
    }
  }

  function resetStudentForm() {
    setStudentFormMode('add');
  }

  function focusStudentName() {
    els.studentForm.elements.name.focus();
  }

  /* ---------------- 列表 / 日历视图 ---------------- */

  /** 切换「列表视图 / 日历视图」；两种视图共用同一份课程数据 */
  function renderRecordsView(view) {
    var isCalendar = view === 'calendar';

    els.listView.hidden = isCalendar;
    els.calendarView.hidden = !isCalendar;
    els.recordsHint.textContent = isCalendar
      ? '按日期查看课程安排'
      : '按日期从新到旧排列';

    els.viewButtons.forEach(function (button) {
      button.setAttribute(
        'aria-pressed',
        button.dataset.view === view ? 'true' : 'false'
      );
    });
  }

  function groupLessonsByDate(lessons) {
    var map = {};
    lessons.forEach(function (lesson) {
      if (!lesson || !lesson.date) return;
      if (!map[lesson.date]) map[lesson.date] = [];
      map[lesson.date].push(lesson);
    });
    return map;
  }

  /** 绘制完整月历（周一为第一列，固定 42 格） */
  function renderCalendar(monthKey, lessons, studentsById, selectedDate) {
    var parts = /^\d{4}-\d{2}$/.test(monthKey)
      ? monthKey.split('-')
      : Calc.currentMonthKey().split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var cells = Calc.buildMonthCells(year, month);
    var byDate = groupLessonsByDate(lessons);
    var today = Calc.toDateString(new Date());

    els.calendarTitle.textContent = Calc.monthLabel(monthKey);
    els.calendarGrid.textContent = '';

    var fragment = document.createDocumentFragment();

    cells.forEach(function (cell) {
      var dayLessons = byDate[cell.date] || [];
      var cents = 0;

      dayLessons.forEach(function (lesson) {
        cents += Math.round(Calc.lessonIncome(lesson) * 100);
      });

      var node = document.createElement('button');
      node.type = 'button';
      node.className = 'calendar__cell';
      node.dataset.date = cell.date;

      if (!cell.inMonth) node.classList.add('calendar__cell--outside');
      if (cell.date === today) node.classList.add('calendar__cell--today');
      if (cell.date === selectedDate) {
        node.classList.add('calendar__cell--selected');
        node.setAttribute('aria-current', 'date');
      }
      if (dayLessons.length) node.classList.add('calendar__cell--has-lessons');

      var dayNumber = document.createElement('span');
      dayNumber.className = 'calendar__daynum';
      dayNumber.textContent = cell.day;
      node.appendChild(dayNumber);

      if (dayLessons.length) {
        var info = document.createElement('span');
        info.className = 'calendar__cell-info';

        var count = document.createElement('span');
        count.className = 'calendar__count';
        count.textContent = dayLessons.length + ' 节';

        var amount = document.createElement('span');
        amount.className = 'calendar__amount';
        amount.textContent = '¥' + Calc.formatMoney(cents / 100);

        info.appendChild(count);
        info.appendChild(amount);
        node.appendChild(info);

        var names = document.createElement('span');
        names.className = 'calendar__names';
        var resolved = dayLessons
          .map(function (lesson) {
            return Calc.resolveStudentName(lesson, studentsById);
          })
          .filter(Boolean);

        var shown = resolved.slice(0, 2).join('、');
        if (resolved.length > 2) shown += ' 等';
        names.textContent = shown;
        node.appendChild(names);
      }

      var label =
        cell.year + ' 年 ' + cell.month + ' 月 ' + cell.day + ' 日 ' +
        Calc.weekdayLabel(cell.date);

      if (dayLessons.length) {
        label +=
          '，' + dayLessons.length + ' 节课，收入 ¥' +
          Calc.formatMoney(cents / 100);
      } else {
        label += '，没有课程';
      }

      node.setAttribute('aria-label', label);
      node.title = label;
      fragment.appendChild(node);
    });

    els.calendarGrid.appendChild(fragment);
  }

  /** 绘制选中日期的课程详情 */
  function renderCalendarDay(date, lessons, studentsById) {
    els.calendarDayList.textContent = '';

    if (!date) {
      els.calendarDayTitle.textContent = '选择日期';
      els.calendarDaySummary.textContent = '点击日历中的日期查看当天课程。';
      els.calendarDayCount.textContent = '0 条';
      els.calendarDayEmpty.hidden = false;
      els.calendarDayEmptyTitle.textContent = '还没有选择日期';
      els.calendarDayEmptyHint.textContent = '点击上方日历中的任意一天。';
      return;
    }

    var dayLessons = Calc.sortLessons(Calc.lessonsOnDate(lessons, date));
    var parts = date.split('-');
    var title =
      parts[0] + ' 年 ' + Number(parts[1]) + ' 月 ' + Number(parts[2]) + ' 日';
    var weekday = Calc.weekdayLabel(date);
    if (weekday) title += ' · ' + weekday;

    els.calendarDayTitle.textContent = title;
    els.calendarDayCount.textContent = dayLessons.length + ' 条';

    var minutes = 0;
    var cents = 0;
    dayLessons.forEach(function (lesson) {
      minutes += Math.max(0, Math.round(Number(lesson.duration) || 0));
      cents += Math.round(Calc.lessonIncome(lesson) * 100);
    });

    els.calendarDaySummary.textContent = dayLessons.length
      ? dayLessons.length + ' 节课 · ' + Calc.minutesToText(minutes) +
        ' · 收入 ¥' + Calc.formatMoney(cents / 100)
      : '当天没有课程记录。';

    if (!dayLessons.length) {
      els.calendarDayEmpty.hidden = false;
      els.calendarDayEmptyTitle.textContent = '当天没有课程';
      els.calendarDayEmptyHint.textContent =
        '可以选择其他日期，或在上方「记一节课」中添加。';
      return;
    }

    els.calendarDayEmpty.hidden = true;
    var fragment = document.createDocumentFragment();

    dayLessons.forEach(function (lesson) {
      var node = els.calendarTemplate.content.firstElementChild.cloneNode(true);
      var name = Calc.resolveStudentName(lesson, studentsById);

      node.dataset.id = lesson.id;
      node.querySelector('[data-field="student"]').textContent = name;
      node.querySelector('[data-field="duration"]').textContent =
        Calc.minutesToText(lesson.duration);
      node.querySelector('[data-field="rate"]').textContent =
        '¥' + Calc.formatMoney(lesson.rate) + '/小时';
      node.querySelector('[data-field="income"]').textContent =
        '¥' + Calc.formatMoney(Calc.lessonIncome(lesson));

      decorateLessonActions(node, lesson, name);
      fragment.appendChild(node);
    });

    els.calendarDayList.appendChild(fragment);
  }

  /* ---------------- 收入分析图表 ---------------- */

  /** 图表里用的短金额：12000 → 1.2万 */
  function compactMoney(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '0';
    if (number >= 10000) {
      return (Math.round((number / 10000) * 10) / 10)
        .toFixed(1)
        .replace(/\.0$/, '') + '万';
    }
    if (number >= 1000) return String(Math.round(number));
    return String(Math.round(number * 100) / 100);
  }

  /** 横向切换年份下拉框 */
  function setYearOptions(select, years, selected) {
    var list = [];
    var seen = {};

    (years || []).forEach(function (year) {
      var key = String(year);
      if (!/^\d{4}$/.test(key) || seen[key]) return;
      seen[key] = true;
      list.push(key);
    });

    if (selected && !seen[selected]) {
      seen[selected] = true;
      list.push(String(selected));
    }

    list.sort(function (a, b) {
      return Number(b) - Number(a);
    });

    select.textContent = '';
    list.forEach(function (year) {
      var option = document.createElement('option');
      option.value = year;
      option.textContent = year + ' 年';
      select.appendChild(option);
    });

    if (list.indexOf(String(selected)) !== -1) {
      select.value = String(selected);
    } else if (list.length) {
      select.value = list[0];
    }
  }

  /** 1～12 月下拉框 */
  function setMonthOptions(select, selected) {
    select.textContent = '';

    for (var month = 1; month <= 12; month += 1) {
      var value = month < 10 ? '0' + month : String(month);
      var option = document.createElement('option');
      option.value = value;
      option.textContent = month + ' 月';
      select.appendChild(option);
    }

    select.value = /^(0[1-9]|1[0-2])$/.test(String(selected))
      ? String(selected)
      : Calc.currentMonthKey().slice(5, 7);
  }

  /** 月度收入柱状图；没有课程的月份也保留 12 根柱子 */
  function renderTrend(rows, yearKey) {
    els.trendChart.textContent = '';

    var max = 0;
    var total = 0;
    var hasData = false;

    rows.forEach(function (row) {
      if (row.totalIncome > max) max = row.totalIncome;
      total += row.totalIncome;
      if (row.count > 0) hasData = true;
    });

    els.trendEmpty.hidden = hasData;
    els.trendChart.setAttribute(
      'aria-label',
      yearKey + ' 年月度收入趋势，全年合计 ¥' + Calc.formatMoney(total)
    );

    rows.forEach(function (row) {
      var column = document.createElement('div');
      column.className = 'trend-chart__col';

      var value = document.createElement('span');
      value.className = 'trend-chart__value';
      value.textContent = '¥' + compactMoney(row.totalIncome);

      var track = document.createElement('span');
      track.className = 'trend-chart__track';

      var bar = document.createElement('span');
      bar.className = 'trend-chart__bar';
      var percent = max > 0
        ? Math.max((row.totalIncome / max) * 100, row.totalIncome > 0 ? 2 : 0)
        : 0;
      bar.style.height = percent + '%';

      var description =
        yearKey + ' 年 ' + row.month + ' 月：¥' +
        Calc.formatMoney(row.totalIncome) + '，' + row.count + ' 节课';
      bar.title = description;
      track.title = description;
      track.appendChild(bar);

      var label = document.createElement('span');
      label.className = 'trend-chart__label';
      label.textContent = row.month + ' 月';

      column.title = description;
      column.appendChild(value);
      column.appendChild(track);
      column.appendChild(label);
      els.trendChart.appendChild(column);
    });
  }

  /** 应收 / 已收 / 待收卡片和占比条 */
  function renderPaymentAnalysis(summary, period, key) {
    var isYear = period === 'year';
    var rangeLabel = isYear ? Calc.yearLabel(key) : Calc.monthLabel(key);
    var total = summary.totalIncome;

    els.analysisRangeLabel.textContent = rangeLabel;
    els.analysisReceivable.textContent = '¥' + Calc.formatMoney(total);
    els.analysisPaid.textContent = '¥' + Calc.formatMoney(summary.paidIncome);
    els.analysisPaidSub.textContent = summary.paidCount + ' 节';
    els.analysisUnpaid.textContent = '¥' + Calc.formatMoney(summary.unpaidIncome);
    els.analysisUnpaidSub.textContent = summary.unpaidCount + ' 节';

    var paidPercent = total > 0 ? (summary.paidIncome / total) * 100 : 0;
    var unpaidPercent = total > 0 ? (summary.unpaidIncome / total) * 100 : 0;
    els.paymentBarPaid.style.width = paidPercent + '%';
    els.paymentBarUnpaid.style.width = unpaidPercent + '%';
    els.paymentBar.classList.toggle('split-bar--empty', total <= 0);
    els.paymentBar.setAttribute(
      'aria-label',
      rangeLabel + '：应收 ¥' + Calc.formatMoney(total) +
        '，已收 ¥' + Calc.formatMoney(summary.paidIncome) +
        '，待收 ¥' + Calc.formatMoney(summary.unpaidIncome)
    );
    els.paymentEmpty.hidden = (summary.paidCount + summary.unpaidCount) > 0;

    els.analysisPeriodButtons.forEach(function (button) {
      button.setAttribute(
        'aria-pressed',
        button.dataset.analysisPeriod === period ? 'true' : 'false'
      );
    });

    if (els.analysisMonthWrap) {
      els.analysisMonthWrap.hidden = isYear;
    }
  }

  /** 学生收入排行；已删除学生的历史记录由 calc 层用昵称快照保留 */
  function renderStudentAnalysis(rows, period, key, studentsById) {
    els.studentChart.textContent = '';
    var hasRows = rows.length > 0;

    els.studentChart.hidden = !hasRows;
    els.studentChartEmpty.hidden = hasRows;
    els.studentChartHint.textContent =
      (period === 'year' ? Calc.yearLabel(key) : Calc.monthLabel(key)) +
      ' · 按收入从高到低排列';

    if (!hasRows) return;

    var max = rows[0].totalIncome;
    rows.forEach(function (row) {
      var name = row.name;
      if (row.studentId && studentsById && !studentsById[row.studentId]) {
        name += '（已删除）';
      }

      var item = document.createElement('div');
      item.className = 'rank-row';

      var top = document.createElement('div');
      top.className = 'rank-row__top';

      var nameNode = document.createElement('span');
      nameNode.className = 'rank-row__name';
      nameNode.textContent = name;

      var meta = document.createElement('span');
      meta.className = 'rank-row__meta';
      meta.textContent = row.count + ' 节 · ¥' + Calc.formatMoney(row.totalIncome);

      top.appendChild(nameNode);
      top.appendChild(meta);

      var track = document.createElement('div');
      track.className = 'rank-row__track';

      var bar = document.createElement('span');
      bar.className = 'rank-row__bar';
      var percent = max > 0
        ? Math.max((row.totalIncome / max) * 100, row.totalIncome > 0 ? 2 : 0)
        : 0;
      bar.style.width = percent + '%';

      track.appendChild(bar);
      item.appendChild(top);
      item.appendChild(track);
      item.setAttribute(
        'aria-label',
        name + '：' + row.count + ' 节课，收入 ¥' + Calc.formatMoney(row.totalIncome)
      );
      els.studentChart.appendChild(item);
    });
  }

  /* ---------------- 数据管理 ---------------- */

  function renderDataSummary(studentsCount, lessonsCount) {
    els.dataSummary.textContent =
      '当前数据：' + studentsCount + ' 名学生 · ' + lessonsCount + ' 条课程记录';
  }

  function showImportStatus(message, state) {
    if (!message) {
      els.importStatus.hidden = true;
      els.importStatus.textContent = '';
      els.importStatus.dataset.state = '';
      return;
    }

    els.importStatus.hidden = false;
    els.importStatus.textContent = message;
    els.importStatus.dataset.state = state || '';
  }

  /* ---------------- 通用提示 ---------------- */

  function showToast(message, state) {
    els.toast.textContent = message;
    els.toast.dataset.state = state || '';
    els.toast.hidden = false;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.hidden = true;
    }, 3200);
  }

  function showStorageWarning(message) {
    els.warning.textContent = message;
    els.warning.hidden = false;
  }

  global.UI = {
    init: init,
    renderStats: renderStats,
    renderCount: renderCount,
    renderList: renderList,
    renderRecordsView: renderRecordsView,
    renderCalendar: renderCalendar,
    renderCalendarDay: renderCalendarDay,
    setYearOptions: setYearOptions,
    setMonthOptions: setMonthOptions,
    renderTrend: renderTrend,
    renderPaymentAnalysis: renderPaymentAnalysis,
    renderStudentAnalysis: renderStudentAnalysis,
    renderDataSummary: renderDataSummary,
    showImportStatus: showImportStatus,
    renderStudents: renderStudents,
    setLessonStudentOptions: setLessonStudentOptions,
    getLessonStudentId: getLessonStudentId,
    selectLessonStudent: selectLessonStudent,
    setLessonRate: setLessonRate,
    setIncomePreview: setIncomePreview,
    openLessonEditor: openLessonEditor,
    closeLessonEditor: closeLessonEditor,
    readLessonEditor: readLessonEditor,
    refreshEditIncomePreview: refreshEditIncomePreview,
    setEditFieldError: setEditFieldError,
    clearEditErrors: clearEditErrors,
    showEditErrors: showEditErrors,
    setFieldError: setFieldError,
    clearErrors: clearErrors,
    showErrors: showErrors,
    setFormDefaultDate: setFormDefaultDate,
    resetForm: resetForm,
    focusStudent: focusStudent,
    setStudentFieldError: setStudentFieldError,
    clearStudentErrors: clearStudentErrors,
    showStudentErrors: showStudentErrors,
    setStudentFormMode: setStudentFormMode,
    resetStudentForm: resetStudentForm,
    focusStudentName: focusStudentName,
    showToast: showToast,
    showStorageWarning: showStorageWarning
  };
})(window);
