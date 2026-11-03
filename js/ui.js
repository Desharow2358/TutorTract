/* ============================================================
   ui.js —— 渲染模块
   只负责把数据画到页面上、显示提示，不修改存储、不做业务判断。
   ============================================================ */
(function (global) {
  'use strict';

  var els = {};
  var toastTimer = null;

  function t(key, params) {
    return I18N.t(key, params);
  }

  function count(unit, value) {
    return I18N.count(unit, value);
  }

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
    var periodKey = isYear ? 'year' : 'month';

    els.periodLabel.textContent = isYear ? Calc.yearLabel(key) : Calc.monthLabel(key);
    els.statsHint.textContent = t('stats.hint.' + periodKey);

    els.statReceivableLabel.textContent = t('stats.label.receivable.' + periodKey);
    els.statPaidLabel.textContent = t('stats.label.paid.' + periodKey);
    els.statUnpaidLabel.textContent = t('stats.label.unpaid.' + periodKey);

    els.statReceivable.textContent = I18N.formatCurrency(summary.totalIncome);
    els.statPaid.textContent = I18N.formatCurrency(summary.paidIncome);
    els.statUnpaid.textContent = I18N.formatCurrency(summary.unpaidIncome);
    els.statPaidSub.textContent = count('lessons', summary.paidCount);
    els.statUnpaidSub.textContent = count('lessons', summary.unpaidCount);

    els.statCount.textContent = count('lessons', summary.count);
    els.statDuration.textContent = summary.durationText;

    els.periodButtons.forEach(function (button) {
      button.setAttribute(
        'aria-pressed',
        button.dataset.period === period ? 'true' : 'false'
      );
    });
  }

  function renderCount(total) {
    els.lessonCount.textContent = count('records', total);
  }

  /** 给列表项里的收款状态与操作按钮统一绑定数据 */
  function decorateLessonActions(node, lesson, name) {
    var paid = Calc.isPaid(lesson);
    var dateText = I18N.formatDate(lesson.date);
    var status = node.querySelector('[data-field="status"]');
    status.textContent = paid ? t('status.paid') : t('status.unpaid');
    status.classList.add(paid ? 'status-badge--paid' : 'status-badge--unpaid');

    var toggleButton = node.querySelector('[data-action="toggle-paid"]');
    toggleButton.dataset.id = lesson.id;
    toggleButton.textContent = paid ? t('status.markUnpaid') : t('status.markPaid');
    toggleButton.setAttribute('aria-pressed', paid ? 'true' : 'false');
    toggleButton.setAttribute(
      'aria-label',
      t('status.toggleAria', {
        action: toggleButton.textContent,
        name: name,
        date: dateText
      })
    );

    var editButton = node.querySelector('[data-action="edit"]');
    editButton.dataset.id = lesson.id;
    editButton.textContent = t('common.edit');
    editButton.setAttribute(
      'aria-label',
      t('common.lessonEditAria', { name: name, date: dateText })
    );

    var deleteButton = node.querySelector('[data-action="delete"]');
    deleteButton.dataset.id = lesson.id;
    deleteButton.textContent = t('common.delete');
    deleteButton.setAttribute(
      'aria-label',
      t('common.lessonDeleteAria', { name: name, date: dateText })
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
      node.querySelector('[data-field="date"]').textContent = I18N.formatDate(lesson.date);
      node.querySelector('[data-field="duration"]').textContent = Calc.minutesToText(lesson.duration);
      node.querySelector('[data-field="rate"]').textContent =
        t('currency.perHour', { amount: I18N.formatCurrency(lesson.rate) });
      node.querySelector('[data-field="income"]').textContent =
        I18N.formatCurrency(Calc.lessonIncome(lesson));

      decorateLessonActions(node, lesson, name);

      fragment.appendChild(node);
    });

    els.list.appendChild(fragment);
  }

  /* ---------------- 学生列表与下拉框 ---------------- */

  /** 重画学生列表；editingId 用于高亮正在编辑的那一行 */
  function renderStudents(students, editingId) {
    els.studentCount.textContent = count('students', students.length);
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
        meta.length ? meta.join(' · ') : t('students.metaFallback');

      node.querySelector('[data-field="rate"]').textContent =
        t('currency.perHour', { amount: I18N.formatCurrency(student.rate) });

      if (student.id === editingId) {
        node.classList.add('student--editing');
      }

      var editButton = node.querySelector('[data-action="edit-student"]');
      editButton.dataset.id = student.id;
      editButton.textContent = t('common.edit');
      editButton.setAttribute(
        'aria-label',
        t('students.editAria', { name: student.name })
      );

      var deleteButton = node.querySelector('[data-action="delete-student"]');
      deleteButton.dataset.id = student.id;
      deleteButton.textContent = t('common.delete');
      deleteButton.setAttribute(
        'aria-label',
        t('students.deleteAria', { name: student.name })
      );

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
      placeholder.textContent = t('lessonForm.student.placeholder');
      els.lessonStudent.disabled = false;
      els.studentHint.hidden = true;
    } else {
      placeholder.textContent = t('lessonForm.student.empty');
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
      ? I18N.formatCurrency(Calc.lessonIncome({ duration: duration, rate: rate }))
      : '—';
  }

  /** 重建编辑弹窗里的学生下拉框（保留已被删除学生的昵称，避免编辑时丢失） */
  function setEditStudentOptions(students, lesson, preferredId) {
    var currentId = typeof preferredId === 'string' ? preferredId : lesson.studentId;
    els.editStudent.textContent = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = students.length
      ? t('modal.student.placeholder')
      : t('modal.student.empty');
    els.editStudent.appendChild(placeholder);

    var found = false;
    students.forEach(function (student) {
      var option = document.createElement('option');
      option.value = student.id;

      var label = [student.name];
      if (student.grade) label.push(student.grade);
      if (student.subject) label.push(student.subject);
      option.textContent = label.join(' · ');

      if (student.id === currentId) found = true;
      els.editStudent.appendChild(option);
    });

    if (!found && currentId) {
      var removedOption = document.createElement('option');
      removedOption.value = currentId;
      removedOption.textContent = t('modal.removedStudent', {
        name: (currentId === lesson.studentId && lesson.student) ||
          t('common.originalStudent')
      });
      els.editStudent.appendChild(removedOption);
    }

    els.editStudent.value = currentId || '';
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

  function refreshLessonDialogLanguage(lesson, students) {
    if (
      !els.lessonDialog ||
      (!els.lessonDialog.open && !els.lessonDialog.hasAttribute('open'))
    ) {
      return;
    }
    setEditStudentOptions(students, lesson, els.editStudent.value || lesson.studentId);
    refreshEditIncomePreview();
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

  /** 只刷新表单模式相关的文案，不覆盖用户正在输入的内容 */
  function refreshStudentFormMode(mode, student) {
    var editing = mode === 'edit' && student;

    if (editing) {
      els.studentSubmit.textContent = t('students.save');
      els.studentCancel.hidden = false;
      els.studentFormHint.textContent = t('students.editingHint', {
        name: student.name
      });
    } else {
      els.studentSubmit.textContent = t('students.add');
      els.studentCancel.hidden = true;
      els.studentFormHint.textContent = t('students.form.hint');
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
      refreshStudentFormMode('edit', student);
      focusStudentName();
    } else {
      els.studentForm.reset();
      clearStudentErrors();
      refreshStudentFormMode('add');
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
      ? t('records.hint.calendar')
      : t('records.hint.list');

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

        var countNode = document.createElement('span');
        countNode.className = 'calendar__count';
        countNode.textContent = count('lessons', dayLessons.length);

        var amount = document.createElement('span');
        amount.className = 'calendar__amount';
        amount.textContent = I18N.formatCurrency(cents / 100);

        info.appendChild(countNode);
        info.appendChild(amount);
        node.appendChild(info);

        var names = document.createElement('span');
        names.className = 'calendar__names';
        var resolved = dayLessons
          .map(function (lesson) {
            return Calc.resolveStudentName(lesson, studentsById);
          })
          .filter(Boolean);

        var shown = I18N.joinNames(resolved.slice(0, 2));
        if (resolved.length > 2) {
          shown += t('calendar.moreNames', { n: resolved.length - 2 });
        }
        names.textContent = shown;
        node.appendChild(names);
      }

      var dateLabel = I18N.formatDate(cell.date);
      var weekdayText = Calc.weekdayLabel(cell.date);
      var label = dayLessons.length
        ? t('calendar.cellHasLessons', {
          date: dateLabel,
          weekday: weekdayText,
          count: count('lessons', dayLessons.length),
          amount: I18N.formatCurrency(cents / 100)
        })
        : t('calendar.cellNoLessons', {
          date: dateLabel,
          weekday: weekdayText
        });

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
      els.calendarDayTitle.textContent = t('calendar.dayTitle');
      els.calendarDaySummary.textContent = t('calendar.daySummary');
      els.calendarDayCount.textContent = count('records', 0);
      els.calendarDayEmpty.hidden = false;
      els.calendarDayEmptyTitle.textContent = t('calendar.selectPromptTitle');
      els.calendarDayEmptyHint.textContent = t('calendar.selectPromptHint');
      return;
    }

    var dayLessons = Calc.sortLessons(Calc.lessonsOnDate(lessons, date));

    els.calendarDayTitle.textContent = I18N.formatDateLong(date);
    els.calendarDayCount.textContent = count('records', dayLessons.length);

    var minutes = 0;
    var cents = 0;
    dayLessons.forEach(function (lesson) {
      minutes += Math.max(0, Math.round(Number(lesson.duration) || 0));
      cents += Math.round(Calc.lessonIncome(lesson) * 100);
    });

    els.calendarDaySummary.textContent = dayLessons.length
      ? t('calendar.daySummaryLine', {
        count: count('lessons', dayLessons.length),
        duration: Calc.minutesToText(minutes),
        amount: I18N.formatCurrency(cents / 100)
      })
      : t('calendar.noLessonsSummary');

    if (!dayLessons.length) {
      els.calendarDayEmpty.hidden = false;
      els.calendarDayEmptyTitle.textContent = t('calendar.noLessons');
      els.calendarDayEmptyHint.textContent = t('calendar.noLessonsHint');
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
        t('currency.perHour', { amount: I18N.formatCurrency(lesson.rate) });
      node.querySelector('[data-field="income"]').textContent =
        I18N.formatCurrency(Calc.lessonIncome(lesson));

      decorateLessonActions(node, lesson, name);
      fragment.appendChild(node);
    });

    els.calendarDayList.appendChild(fragment);
  }

  /* ---------------- 收入分析图表 ---------------- */

  /** 图表里用的短金额：12000 → 1.2万（按当前语言） */
  function compactMoney(value) {
    return I18N.compactMoney(value);
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
      option.textContent = I18N.yearLabel(year);
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
      option.textContent = I18N.monthName(month);
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
      t('analysis.trendAria', {
        year: yearKey,
        amount: I18N.formatCurrency(total)
      })
    );

    rows.forEach(function (row) {
      var column = document.createElement('div');
      column.className = 'trend-chart__col';

      var value = document.createElement('span');
      value.className = 'trend-chart__value';
      value.textContent = I18N.formatCompactCurrency(row.totalIncome);

      var track = document.createElement('span');
      track.className = 'trend-chart__track';

      var bar = document.createElement('span');
      bar.className = 'trend-chart__bar';
      var percent = max > 0
        ? Math.max((row.totalIncome / max) * 100, row.totalIncome > 0 ? 2 : 0)
        : 0;
      bar.style.height = percent + '%';

      var description = t('analysis.trendBarAria', {
        year: yearKey,
        month: I18N.monthName(row.month),
        amount: I18N.formatCurrency(row.totalIncome),
        count: count('lessons', row.count)
      });
      bar.title = description;
      track.title = description;
      track.appendChild(bar);

      var label = document.createElement('span');
      label.className = 'trend-chart__label';
      label.textContent = I18N.monthName(row.month, 'short');

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
    els.analysisReceivable.textContent = I18N.formatCurrency(total);
    els.analysisPaid.textContent = I18N.formatCurrency(summary.paidIncome);
    els.analysisPaidSub.textContent = count('lessons', summary.paidCount);
    els.analysisUnpaid.textContent = I18N.formatCurrency(summary.unpaidIncome);
    els.analysisUnpaidSub.textContent = count('lessons', summary.unpaidCount);

    var paidPercent = total > 0 ? (summary.paidIncome / total) * 100 : 0;
    var unpaidPercent = total > 0 ? (summary.unpaidIncome / total) * 100 : 0;
    els.paymentBarPaid.style.width = paidPercent + '%';
    els.paymentBarUnpaid.style.width = unpaidPercent + '%';
    els.paymentBar.classList.toggle('split-bar--empty', total <= 0);
    els.paymentBar.setAttribute(
      'aria-label',
      t('analysis.paymentBarAria', {
        range: rangeLabel,
        receivable: I18N.formatCurrency(total),
        paid: I18N.formatCurrency(summary.paidIncome),
        unpaid: I18N.formatCurrency(summary.unpaidIncome)
      })
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
    els.studentChartHint.textContent = t('analysis.rank.hintWithRange', {
      range: period === 'year' ? Calc.yearLabel(key) : Calc.monthLabel(key)
    });

    if (!hasRows) return;

    var max = rows[0].totalIncome;
    rows.forEach(function (row) {
      var name = row.name;
      if (row.studentId && studentsById && !studentsById[row.studentId]) {
        name += t('analysis.deletedSuffix');
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
      meta.textContent = t('analysis.rank.meta', {
        count: count('lessons', row.count),
        amount: I18N.formatCurrency(row.totalIncome)
      });

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
        t('analysis.rank.itemAria', {
          name: name,
          count: count('lessons', row.count),
          amount: I18N.formatCurrency(row.totalIncome)
        })
      );
      els.studentChart.appendChild(item);
    });
  }

  /* ---------------- 数据管理 ---------------- */

  function renderDataSummary(studentsCount, lessonsCount) {
    els.dataSummary.textContent = t('data.summary', {
      students: I18N.countLong('students', studentsCount),
      lessons: I18N.countLong('records', lessonsCount)
    });
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

  function hideToast() {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    els.toast.hidden = true;
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
    refreshLessonDialogLanguage: refreshLessonDialogLanguage,
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
    refreshStudentFormMode: refreshStudentFormMode,
    resetStudentForm: resetStudentForm,
    focusStudentName: focusStudentName,
    showToast: showToast,
    hideToast: hideToast,
    showStorageWarning: showStorageWarning
  };
})(window);
