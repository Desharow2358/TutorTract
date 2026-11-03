/* ============================================================
   app.js —— 应用入口
   把「表单 → 校验 → 存储 → 界面」串起来，并绑定事件。
   ============================================================ */
(function (global) {
  'use strict';

  var state = {
    period: 'month', // 'month' | 'year'
    monthKey: Calc.currentMonthKey(),
    yearKey: Calc.currentYearKey(),
    editingStudentId: null,
    editingLessonId: null,
    recordsView: 'list', // 'list' | 'calendar'
    calendarMonthKey: Calc.currentMonthKey(),
    selectedDate: Calc.toDateString(new Date()),
    trendYear: Calc.currentYearKey(),
    analysisPeriod: 'month', // 'month' | 'year'
    analysisYear: Calc.currentYearKey(),
    analysisMonthKey: Calc.currentMonthKey()
  };

  var form = null;
  var list = null;
  var studentForm = null;
  var studentList = null;
  var calendarView = null;
  var trendYearSelect = null;
  var analysisYearSelect = null;
  var analysisMonthSelect = null;
  var importFile = null;
  var languageSelect = null;

  function t(key, params) {
    return I18N.t(key, params);
  }

  function count(unit, value) {
    return I18N.count(unit, value);
  }

  function init() {
    form = document.getElementById('lesson-form');
    list = document.getElementById('lesson-list');
    studentForm = document.getElementById('student-form');
    studentList = document.getElementById('student-list');
    calendarView = document.getElementById('calendar-view');
    trendYearSelect = document.getElementById('trend-year');
    analysisYearSelect = document.getElementById('analysis-year');
    analysisMonthSelect = document.getElementById('analysis-month');
    importFile = document.getElementById('import-file');
    languageSelect = document.getElementById('language-select');

    // 先按已保存的语言把静态文案铺好，再初始化界面
    I18N.apply(document);
    UI.init();

    // 读取数据（顺带触发可用性检测、旧数据迁移和损坏数据的兜底）
    TTStorage.load();
    if (!TTStorage.isPersistent()) {
      UI.showStorageWarning(t('storage.warning.unavailable'));
    }

    var loadError = TTStorage.getLastError();
    if (loadError) UI.showToast(t(loadError.key, loadError.params), 'error');

    UI.setFormDefaultDate(Calc.toDateString(new Date()));

    bindEvents();
    syncLanguageSelect();
    render();
  }

  /**
   * 课时费上下箭头每次增减 10 元，并保留用户输入的零头。
   * step 以 min 为基准，因此把 min 调成「当前值除以 10 的余数 - 10」，
   * 按钮和键盘的上下箭头就会从当前值精确加减 10（例如 134 → 144 → 134）。
   */
  function bindRateStep(input) {
    if (!input) return;

    function syncStepBase() {
      if (input.value === '') {
        input.min = '0';
        return;
      }

      var value = Number(input.value);
      if (!Number.isFinite(value)) {
        input.min = '0';
        return;
      }

      var remainder = ((value % 10) + 10) % 10;
      input.min = String(remainder - 10);
    }

    input.addEventListener('focus', syncStepBase);
    input.addEventListener('input', function () {
      // 从 5 按下箭头时浏览器会给出 -5，这里统一收敛到 0
      if (input.value !== '' && Number(input.value) < 0) {
        input.value = '0';
      }
      syncStepBase();
    });
    input.addEventListener('change', syncStepBase);
  }

  function bindEvents() {
    form.addEventListener('submit', handleSubmit);
    form.addEventListener('input', handlePreview);
    form.addEventListener('keydown', handleKeydown);
    form.elements.studentId.addEventListener('change', handleStudentSelect);

    bindRateStep(form.elements.rate);
    bindRateStep(studentForm.elements.rate);
    bindRateStep(document.getElementById('edit-rate'));

    list.addEventListener('click', handleListClick);

    var lessonEditForm = document.getElementById('lesson-edit-form');
    var lessonDialog = document.getElementById('lesson-dialog');
    lessonEditForm.addEventListener('submit', handleLessonEditSubmit);
    lessonEditForm.addEventListener('input', UI.refreshEditIncomePreview);
    document.getElementById('lesson-edit-cancel').addEventListener('click', closeLessonEditor);
    lessonEditForm.addEventListener('keydown', handleLessonEditKeydown);

    var closeEditButton = lessonDialog.querySelector('[data-action="close-edit"]');
    if (closeEditButton) closeEditButton.addEventListener('click', closeLessonEditor);

    // 原生 Esc 关闭、点击遮罩关闭都会触发 close，统一在这里清理编辑状态
    lessonDialog.addEventListener('close', function () {
      state.editingLessonId = null;
    });
    lessonDialog.addEventListener('cancel', function () {
      state.editingLessonId = null;
    });
    lessonDialog.addEventListener('click', function (event) {
      if (event.target === lessonDialog) closeLessonEditor();
    });

    studentForm.addEventListener('submit', handleStudentSubmit);
    studentForm.addEventListener('keydown', handleStudentKeydown);
    document.getElementById('student-cancel').addEventListener('click', handleCancelStudentEdit);
    studentList.addEventListener('click', handleStudentListClick);

    Array.prototype.forEach.call(
      document.querySelectorAll('[data-period]'),
      function (button) {
        button.addEventListener('click', handlePeriodClick);
      }
    );

    Array.prototype.forEach.call(
      document.querySelectorAll('[data-view]'),
      function (button) {
        button.addEventListener('click', handleViewClick);
      }
    );
    calendarView.addEventListener('click', handleCalendarClick);

    trendYearSelect.addEventListener('change', handleTrendYearChange);

    Array.prototype.forEach.call(
      document.querySelectorAll('[data-analysis-period]'),
      function (button) {
        button.addEventListener('click', handleAnalysisPeriodClick);
      }
    );
    analysisYearSelect.addEventListener('change', handleAnalysisYearChange);
    analysisMonthSelect.addEventListener('change', handleAnalysisMonthChange);

    document.getElementById('export-backup').addEventListener('click', handleExportBackup);
    document.getElementById('import-trigger').addEventListener('click', function () {
      importFile.click();
    });
    importFile.addEventListener('change', handleImportFile);

    if (languageSelect) {
      languageSelect.addEventListener('change', function (event) {
        I18N.setLanguage(event.target.value);
      });
    }
    document.addEventListener('tutortrack:languagechange', applyLanguage);

    // 页面从后台切回来时，如果跨月或跨年了就刷新统计
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;

      var monthKey = Calc.currentMonthKey();
      var yearKey = Calc.currentYearKey();
      if (monthKey !== state.monthKey || yearKey !== state.yearKey) {
        state.monthKey = monthKey;
        state.yearKey = yearKey;
        render();
      }
    });
  }

  function syncLanguageSelect() {
    if (languageSelect) languageSelect.value = I18N.getLanguage();
  }

  /** 切换语言后：先刷新静态文案，再用当前数据重画动态区域，不触碰业务数据 */
  function applyLanguage() {
    I18N.apply(document);
    syncLanguageSelect();

    if (state.editingStudentId) {
      var student = findStudent(state.editingStudentId);
      UI.refreshStudentFormMode(student ? 'edit' : 'add', student);
    } else {
      UI.refreshStudentFormMode('add');
    }

    if (state.editingLessonId) {
      var lesson = findLesson(state.editingLessonId);
      if (lesson) {
        UI.refreshLessonDialogLanguage(lesson, TTStorage.getStudents());
      }
    }

    UI.hideToast();
    UI.showImportStatus('', '');
    render();
  }

  function indexStudents(students) {
    var map = {};
    students.forEach(function (student) {
      map[student.id] = student;
    });
    return map;
  }

  /** 图表年份下拉框：课程里出现过的年份 + 当前年前后几年，保证空年份也能查看 */
  function buildYearOptions(lessons, selected) {
    var years = Calc.yearsWithLessons(lessons);
    var current = Number(Calc.currentYearKey());

    for (var year = current - 5; year <= current + 1; year += 1) {
      years.push(String(year));
    }
    if (selected) years.push(String(selected));

    return years;
  }

  function findStudent(id) {
    var students = TTStorage.getStudents();
    for (var i = 0; i < students.length; i += 1) {
      if (students[i].id === id) return students[i];
    }
    return null;
  }

  function findLesson(id) {
    var lessons = TTStorage.getLessons();
    for (var i = 0; i < lessons.length; i += 1) {
      if (lessons[i].id === id) return lessons[i];
    }
    return null;
  }

  /* ---------------- 记一节课 ---------------- */

  /** 读出记课表单里的原始字符串 */
  function readForm() {
    return {
      studentId: form.elements.studentId.value,
      date: form.elements.date.value,
      duration: form.elements.duration.value.trim(),
      rate: form.elements.rate.value.trim()
    };
  }

  /** 校验记课表单，返回 { 字段名: 错误信息 } */
  function validate(values) {
    var errors = {};

    if (!values.studentId) {
      errors.student = TTStorage.getStudents().length
        ? t('validation.lesson.studentRequired')
        : t('validation.lesson.studentNone');
    }

    if (!values.date) {
      errors.date = t('validation.lesson.dateRequired');
    } else if (!Calc.isValidDateString(values.date)) {
      errors.date = t('validation.lesson.dateInvalid');
    }

    var duration = Number(values.duration);
    if (values.duration === '') {
      errors.duration = t('validation.lesson.durationRequired');
    } else if (!Number.isFinite(duration) || !Number.isInteger(duration)) {
      errors.duration = t('validation.lesson.durationInteger');
    } else if (duration < 1 || duration > 1440) {
      errors.duration = t('validation.lesson.durationRange');
    }

    var rate = Number(values.rate);
    if (values.rate === '') {
      errors.rate = t('validation.lesson.rateRequired');
    } else if (!Number.isFinite(rate)) {
      errors.rate = t('validation.lesson.rateNumber');
    } else if (rate < 0 || rate > 10000) {
      errors.rate = t('validation.lesson.rateRange');
    }

    return errors;
  }

  function handleSubmit(event) {
    event.preventDefault();

    var values = readForm();
    var errors = validate(values);

    UI.clearErrors();
    if (Object.keys(errors).length > 0) {
      UI.showErrors(errors);
      return;
    }

    var result = TTStorage.addLesson({
      studentId: values.studentId,
      date: values.date,
      duration: Number(values.duration),
      rate: Number(values.rate)
    });

    if (!result) {
      UI.showToast(t('toast.lesson.addFailed'), 'error');
      return;
    }

    UI.resetForm();
    UI.setIncomePreview(null);
    render();

    if (result.saved) {
      UI.showToast(t('toast.lesson.added', {
        student: result.lesson.student,
        duration: Calc.minutesToText(result.lesson.duration)
      }), 'success');
    } else {
      UI.showToast(t('toast.lesson.addedUnsaved'), 'error');
    }

    UI.focusStudent();
  }

  /** 选择学生后自动填入默认时薪，仍允许手动修改 */
  function handleStudentSelect() {
    var student = findStudent(form.elements.studentId.value);
    if (!student) {
      handlePreview();
      return;
    }

    UI.setLessonRate(student.rate);
    handlePreview();
  }

  /** 输入时长或单价时，实时预览这一节课的收入 */
  function handlePreview() {
    var values = readForm();
    var duration = Number(values.duration);
    var rate = Number(values.rate);

    var valid =
      values.duration !== '' &&
      values.rate !== '' &&
      Number.isFinite(duration) &&
      Number.isFinite(rate) &&
      duration > 0 &&
      rate >= 0;

    if (!valid) {
      UI.setIncomePreview(null);
      return;
    }

    var income = Calc.lessonIncome({ duration: duration, rate: rate });
    UI.setIncomePreview(I18N.formatCurrency(income));
  }

  /** 输入法还在选词时按回车，不要提交表单 */
  function handleKeydown(event) {
    if (event.key === 'Enter' && event.isComposing) {
      event.preventDefault();
    }
  }

  function handleListClick(event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;

    var action = button.dataset.action;
    var id = button.dataset.id;

    if (action === 'toggle-paid') {
      handleTogglePaid(id);
      return;
    }

    if (action === 'edit') {
      handleOpenLessonEdit(id);
      return;
    }

    if (action !== 'delete') return;

    var target = findLesson(id);
    if (!target) {
      UI.showToast(t('toast.lesson.missing'), 'error');
      return;
    }

    var name = Calc.resolveStudentName(target, indexStudents(TTStorage.getStudents()));
    var message = t('confirm.deleteLesson', {
      name: name,
      date: I18N.formatDate(target.date)
    });
    if (!global.confirm(message)) return;

    var result = TTStorage.removeLesson(id);
    if (!result.removed) {
      UI.showToast(t('toast.lesson.deleteFailed'), 'error');
      render();
      return;
    }

    if (state.editingLessonId === id) {
      state.editingLessonId = null;
      UI.closeLessonEditor();
    }

    render();

    if (result.saved) {
      UI.showToast(t('toast.lesson.deleted'), 'success');
    } else {
      UI.showToast(t('toast.lesson.deletedUnsaved'), 'error');
    }
  }

  /** 在「待收款 / 已收款」之间切换 */
  function handleTogglePaid(id) {
    var target = findLesson(id);
    if (!target) {
      UI.showToast(t('toast.lesson.missing'), 'error');
      render();
      return;
    }

    var nextPaid = !Calc.isPaid(target);
    var result = TTStorage.setLessonPaid(id, nextPaid);
    if (!result) {
      UI.showToast(t('toast.lesson.updateMissing'), 'error');
      render();
      return;
    }

    render();

    if (result.saved) {
      UI.showToast(
        t(nextPaid ? 'toast.lesson.paidMarked' : 'toast.lesson.unpaidMarked'),
        'success'
      );
    } else {
      UI.showToast(
        t(nextPaid ? 'toast.lesson.paidMarkedUnsaved' : 'toast.lesson.unpaidMarkedUnsaved'),
        'error'
      );
    }
  }

  /** 打开编辑弹窗 */
  function handleOpenLessonEdit(id) {
    var target = findLesson(id);
    if (!target) {
      UI.showToast(t('toast.lesson.missing'), 'error');
      render();
      return;
    }

    state.editingLessonId = id;
    UI.openLessonEditor(target, TTStorage.getStudents());
  }

  function handleLessonEditSubmit(event) {
    event.preventDefault();

    var id = state.editingLessonId;
    if (!id) {
      UI.showToast(t('toast.lesson.noEditing'), 'error');
      return;
    }

    var values = UI.readLessonEditor();
    var errors = validate(values);

    UI.clearEditErrors();
    if (Object.keys(errors).length > 0) {
      UI.showEditErrors(errors);
      return;
    }

    var result = TTStorage.updateLesson(id, {
      studentId: values.studentId,
      date: values.date,
      duration: Number(values.duration),
      rate: Number(values.rate),
      paid: values.paid === 'paid'
    });

    if (!result) {
      UI.showToast(t('toast.lesson.updateFailed'), 'error');
      return;
    }

    state.editingLessonId = null;
    UI.closeLessonEditor();
    render();

    if (result.saved) {
      UI.showToast(t('toast.lesson.updated'), 'success');
    } else {
      UI.showToast(t('toast.lesson.updatedUnsaved'), 'error');
    }
  }

  function closeLessonEditor() {
    state.editingLessonId = null;
    UI.closeLessonEditor();
  }

  /** 编辑弹窗里输入法还在选词时按回车，不要提交 */
  function handleLessonEditKeydown(event) {
    if (event.key === 'Enter' && event.isComposing) {
      event.preventDefault();
    }
  }

  /* ---------------- 学生管理 ---------------- */

  function readStudentForm() {
    return {
      name: studentForm.elements.name.value.trim(),
      grade: studentForm.elements.grade.value.trim(),
      subject: studentForm.elements.subject.value.trim(),
      rate: studentForm.elements.rate.value.trim()
    };
  }

  function validateStudent(values) {
    var errors = {};

    if (!values.name) {
      errors.name = t('validation.student.nameRequired');
    } else if (values.name.length > 20) {
      errors.name = t('validation.student.nameTooLong');
    }

    var rate = Number(values.rate);
    if (values.rate === '') {
      errors.rate = t('validation.student.rateRequired');
    } else if (!Number.isFinite(rate)) {
      errors.rate = t('validation.student.rateNumber');
    } else if (rate < 0 || rate > 10000) {
      errors.rate = t('validation.student.rateRange');
    }

    return errors;
  }

  function handleStudentSubmit(event) {
    event.preventDefault();

    var values = readStudentForm();
    var errors = validateStudent(values);

    UI.clearStudentErrors();
    if (Object.keys(errors).length > 0) {
      UI.showStudentErrors(errors);
      return;
    }

    var wasEditing = Boolean(state.editingStudentId);
    var hadSelection = Boolean(UI.getLessonStudentId());

    var result = wasEditing
      ? TTStorage.updateStudent(state.editingStudentId, values)
      : TTStorage.addStudent(values);

    if (!result) {
      UI.showToast(t('toast.student.saveFailed'), 'error');
      return;
    }

    state.editingStudentId = null;
    UI.resetStudentForm();
    render();

    // 刚添加的学生如果是第一位，顺手在记课表单里选中
    if (!wasEditing && !hadSelection) {
      UI.selectLessonStudent(result.student);
      handlePreview();
    }

    if (result.saved) {
      UI.showToast(
        t(wasEditing ? 'toast.student.saved' : 'toast.student.added', {
          name: result.student.name
        }),
        'success'
      );
    } else {
      UI.showToast(
        t(wasEditing ? 'toast.student.savedUnsaved' : 'toast.student.addedUnsaved', {
          name: result.student.name
        }),
        'error'
      );
    }

    UI.focusStudentName();
  }

  function handleStudentListClick(event) {
    var editButton = event.target.closest('button[data-action="edit-student"]');
    var deleteButton = event.target.closest('button[data-action="delete-student"]');

    if (editButton) {
      var student = findStudent(editButton.dataset.id);
      if (!student) {
        UI.showToast(t('toast.student.missing'), 'error');
        render();
        return;
      }

      state.editingStudentId = student.id;
      render();
      UI.setStudentFormMode('edit', student);
      return;
    }

    if (!deleteButton) return;

    var target = findStudent(deleteButton.dataset.id);
    if (!target) {
      UI.showToast(t('toast.student.missing'), 'error');
      render();
      return;
    }

    var lessons = TTStorage.getLessons();
    var related = lessons.filter(function (lesson) {
      return lesson.studentId === target.id;
    }).length;

    var message = related > 0
      ? t('confirm.deleteStudentWithLessons', {
        name: target.name,
        count: count('records', related)
      })
      : t('confirm.deleteStudentNoLessons', { name: target.name });
    if (!global.confirm(message)) return;

    var result = TTStorage.removeStudent(target.id);
    if (!result.removed) {
      UI.showToast(t('toast.student.deleteFailed'), 'error');
      render();
      return;
    }

    if (state.editingStudentId === target.id) {
      state.editingStudentId = null;
      UI.resetStudentForm();
    }

    render();

    if (result.saved) {
      UI.showToast(t('toast.student.deleted', { name: target.name }), 'success');
    } else {
      UI.showToast(t('toast.student.deletedUnsaved'), 'error');
    }
  }

  function handleCancelStudentEdit() {
    if (!state.editingStudentId) return;
    state.editingStudentId = null;
    UI.resetStudentForm();
    render();
  }

  function handleStudentKeydown(event) {
    if (event.key === 'Escape' && state.editingStudentId) {
      event.preventDefault();
      handleCancelStudentEdit();
    }
  }

  /* ---------------- 列表 / 日历视图 ---------------- */

  function handleViewClick(event) {
    var view = event.currentTarget.dataset.view;
    if (view !== 'list' && view !== 'calendar') return;
    if (state.recordsView === view) return;

    state.recordsView = view;
    render();
  }

  function defaultDateForMonth(monthKey) {
    if (monthKey === Calc.currentMonthKey()) {
      return Calc.toDateString(new Date());
    }
    return monthKey + '-01';
  }

  function handleCalendarClick(event) {
    var control = event.target.closest('button[data-action]');

    if (control) {
      var action = control.dataset.action;

      if (action === 'calendar-prev' || action === 'calendar-next') {
        state.calendarMonthKey = Calc.shiftMonthKey(
          state.calendarMonthKey,
          action === 'calendar-prev' ? -1 : 1
        );
        state.selectedDate = defaultDateForMonth(state.calendarMonthKey);
        render();
        return;
      }

      if (action === 'calendar-today') {
        state.calendarMonthKey = Calc.currentMonthKey();
        state.selectedDate = Calc.toDateString(new Date());
        render();
        return;
      }

      // toggle-paid / edit / delete 继续走列表的同一套逻辑
    }

    var cell = event.target.closest('[data-date]');
    if (cell) {
      var date = cell.dataset.date;
      state.selectedDate = date;
      // 点到上/下个月的日期时，顺手切换月份
      if (date.slice(0, 7) !== state.calendarMonthKey) {
        state.calendarMonthKey = date.slice(0, 7);
      }
      render();
      return;
    }

    if (control) handleListClick(event);
  }

  /* ---------------- 收入分析 ---------------- */

  function handleTrendYearChange(event) {
    var value = event.target.value;
    if (!/^\d{4}$/.test(value)) return;
    state.trendYear = value;
    render();
  }

  function handleAnalysisPeriodClick(event) {
    var period = event.currentTarget.dataset.analysisPeriod;
    if (period !== 'month' && period !== 'year') return;
    if (state.analysisPeriod === period) return;

    state.analysisPeriod = period;
    render();
  }

  function handleAnalysisYearChange(event) {
    var value = event.target.value;
    if (!/^\d{4}$/.test(value)) return;

    state.analysisYear = value;
    state.analysisMonthKey = value + '-' + state.analysisMonthKey.slice(5, 7);
    render();
  }

  function handleAnalysisMonthChange(event) {
    var value = event.target.value;
    if (!/^(0[1-9]|1[0-2])$/.test(value)) return;

    state.analysisMonthKey = state.analysisYear + '-' + value;
    render();
  }

  /* ---------------- 数据备份与恢复 ---------------- */

  function handleExportBackup() {
    var backup = TTStorage.createBackup();
    var json = JSON.stringify(backup, null, 2);
    var filename = 'TutorTrack-backup-' + Calc.toDateString(new Date()) + '.json';
    var link = document.createElement('a');
    var url = '';

    link.download = filename;

    try {
      if (
        typeof global.Blob === 'function' &&
        global.URL &&
        typeof global.URL.createObjectURL === 'function'
      ) {
        var blob = new global.Blob([json], {
          type: 'application/json;charset=utf-8'
        });
        url = global.URL.createObjectURL(blob);
        link.href = url;
      } else {
        link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
      }
    } catch (error) {
      UI.showToast(t('toast.export.failed'), 'error');
      return;
    }

    document.body.appendChild(link);
    link.click();
    link.remove();

    if (url) {
      global.setTimeout(function () {
        global.URL.revokeObjectURL(url);
      }, 1000);
    }

    UI.showToast(t('toast.export.success', {
      students: I18N.countLong('students', backup.counts.students),
      lessons: I18N.countLong('records', backup.counts.lessons)
    }), 'success');
  }

  function handleImportFile(event) {
    var file = event.target.files && event.target.files[0];
    // 允许连续选择同一个文件
    event.target.value = '';
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      UI.showImportStatus(t('import.tooLarge'), 'error');
      UI.showToast(t('toast.import.tooLarge'), 'error');
      return;
    }

    var reader = new global.FileReader();

    reader.onload = function () {
      var parsed;

      try {
        parsed = JSON.parse(String(reader.result));
      } catch (error) {
        UI.showImportStatus(t('import.invalidJson'), 'error');
        UI.showToast(t('toast.import.invalidJson'), 'error');
        return;
      }

      applyImportedBackup(parsed);
    };

    reader.onerror = function () {
      UI.showImportStatus(t('import.readFailed'), 'error');
      UI.showToast(t('toast.import.readFailed'), 'error');
    };

    reader.readAsText(file, 'utf-8');
  }

  function applyImportedBackup(parsed) {
    var validation = TTStorage.validateBackup(parsed);

    if (!validation.ok) {
      var validationMessage = t('import.failed', {
        reason: t(validation.errorKey, validation.params)
      });
      UI.showImportStatus(validationMessage, 'error');
      UI.showToast(validationMessage, 'error');
      return;
    }

    var incoming = validation.backup;
    var exportedAt = incoming.exportedAt
      ? I18N.formatExportTime(incoming.exportedAt)
      : t('import.noExportTime');

    var message = t('confirm.import', {
      students: I18N.formatNumber(incoming.counts.students),
      lessons: I18N.formatNumber(incoming.counts.lessons),
      exportedAt: exportedAt,
      currentStudents: I18N.countLong('students', TTStorage.getStudents().length),
      currentLessons: I18N.countLong('records', TTStorage.getLessons().length)
    });

    if (!global.confirm(message)) {
      UI.showImportStatus(t('import.cancelled'), '');
      UI.showToast(t('toast.import.cancelled'), '');
      return;
    }

    var result = TTStorage.restoreBackup(parsed);
    if (!result.ok) {
      var restoreMessage = t('import.failed', {
        reason: t(result.errorKey, result.params)
      });
      UI.showImportStatus(restoreMessage, 'error');
      UI.showToast(restoreMessage, 'error');
      return;
    }

    // 清理可能残留的编辑状态，并回到当前月份重新渲染
    state.editingStudentId = null;
    state.editingLessonId = null;
    UI.closeLessonEditor();
    UI.resetStudentForm();
    UI.resetForm();
    UI.setIncomePreview(null);

    state.calendarMonthKey = Calc.currentMonthKey();
    state.selectedDate = Calc.toDateString(new Date());
    state.trendYear = Calc.currentYearKey();
    state.analysisPeriod = 'month';
    state.analysisYear = Calc.currentYearKey();
    state.analysisMonthKey = Calc.currentMonthKey();

    render();

    var successMessage = t('import.success', {
      students: I18N.countLong('students', result.counts.students),
      lessons: I18N.countLong('records', result.counts.lessons)
    });
    UI.showImportStatus(successMessage, 'success');
    UI.showToast(successMessage, 'success');
  }

  /* ---------------- 统计范围 ---------------- */

  function handlePeriodClick(event) {
    var period = event.currentTarget.dataset.period;
    if (period !== 'month' && period !== 'year') return;
    if (period === state.period) return;

    state.period = period;
    state.monthKey = Calc.currentMonthKey();
    state.yearKey = Calc.currentYearKey();
    render();
  }

  /* ---------------- 统一渲染 ---------------- */

  /** 唯一的渲染入口：所有增删改都走这里，保证列表、日历和统计一致 */
  function render() {
    var students = TTStorage.getStudents();
    var lessons = Calc.sortLessons(TTStorage.getLessons());
    var studentsById = indexStudents(students);

    UI.renderStudents(students, state.editingStudentId);
    UI.setLessonStudentOptions(students);
    UI.renderList(lessons, studentsById);
    UI.renderRecordsView(state.recordsView);

    // 日历：月份或选中日期失效时自动回落到合理值
    if (!/^\d{4}-\d{2}$/.test(state.calendarMonthKey)) {
      state.calendarMonthKey = Calc.currentMonthKey();
    }
    if (
      !state.selectedDate ||
      state.selectedDate.slice(0, 7) !== state.calendarMonthKey
    ) {
      state.selectedDate = defaultDateForMonth(state.calendarMonthKey);
    }
    UI.renderCalendar(
      state.calendarMonthKey,
      lessons,
      studentsById,
      state.selectedDate
    );
    UI.renderCalendarDay(state.selectedDate, lessons, studentsById);

    var base = state.period === 'year'
      ? Calc.summarizeYear(lessons, state.yearKey)
      : Calc.summarize(lessons, state.monthKey);
    var payments = state.period === 'year'
      ? Calc.summarizeYearPayments(lessons, state.yearKey)
      : Calc.summarizeMonthPayments(lessons, state.monthKey);
    var key = state.period === 'year' ? state.yearKey : state.monthKey;

    var summary = {
      count: base.count,
      totalMinutes: base.totalMinutes,
      durationText: base.durationText,
      totalIncome: payments.totalIncome,
      paidIncome: payments.paidIncome,
      unpaidIncome: payments.unpaidIncome,
      paidCount: payments.paidCount,
      unpaidCount: payments.unpaidCount
    };

    UI.renderStats(summary, state.period, key);
    UI.renderCount(lessons.length);

    // 月度趋势：始终显示 12 个月，没有数据的月份为 0
    var currentYear = Calc.currentYearKey();

    var trendYears = buildYearOptions(lessons, state.trendYear);
    UI.setYearOptions(trendYearSelect, trendYears, state.trendYear);
    state.trendYear = trendYearSelect.value || currentYear;
    UI.renderTrend(Calc.monthlyRevenue(lessons, state.trendYear), state.trendYear);

    // 应收 / 已收 / 待收与学生排行共用同一个时间范围
    var analysisYears = buildYearOptions(lessons, state.analysisYear);
    UI.setYearOptions(analysisYearSelect, analysisYears, state.analysisYear);
    state.analysisYear = analysisYearSelect.value || currentYear;
    UI.setMonthOptions(analysisMonthSelect, state.analysisMonthKey.slice(5, 7));
    state.analysisMonthKey = state.analysisYear + '-' + analysisMonthSelect.value;

    var analysisKey = state.analysisPeriod === 'year'
      ? state.analysisYear
      : state.analysisMonthKey;
    var analysisPayments = state.analysisPeriod === 'year'
      ? Calc.summarizeYearPayments(lessons, state.analysisYear)
      : Calc.summarizeMonthPayments(lessons, state.analysisMonthKey);

    UI.renderPaymentAnalysis(analysisPayments, state.analysisPeriod, analysisKey);

    var studentRows = state.analysisPeriod === 'year'
      ? Calc.summarizeStudentsYear(lessons, state.analysisYear, studentsById)
      : Calc.summarizeStudentsMonth(lessons, state.analysisMonthKey, studentsById);

    UI.renderStudentAnalysis(
      studentRows,
      state.analysisPeriod,
      analysisKey,
      studentsById
    );

    UI.renderDataSummary(students.length, lessons.length);
  }

  // defer 脚本执行时 DOM 已经解析完成；这里的判断只是多一层保险
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
