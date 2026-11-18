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
    followCurrentMonth: true,
    editingStudentId: null,
    editingStudentFingerprint: null,
    editingLessonId: null,
    editingLessonFingerprint: null,
    recordsView: 'list', // 'list' | 'calendar'
    calendarMonthKey: Calc.currentMonthKey(),
    selectedDate: Calc.toDateString(new Date()),
    trendYear: Calc.currentYearKey(),
    analysisPeriod: 'month', // 'month' | 'year'
    analysisYear: Calc.currentYearKey(),
    analysisMonthKey: Calc.currentMonthKey(),
    ledgerStudent: '',
    ledgerSubject: '',
    ledgerStatus: 'all' // 'all' | 'unpaid' | 'paid'
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

  /** 金额输入是否与历史记录等值；允许超过普通表单上限，仅用于未修改判断 */
  function isRateUnchanged(value, original) {
    if (!original || !Calc.isIntegerAmount(original.hourlyRateCents)) return false;
    var parsed = Calc.parseYuanInput(value, { maxCents: Number.MAX_SAFE_INTEGER });
    return parsed.ok && parsed.cents === original.hourlyRateCents;
  }

  /** 金额输入错误 → 对应语言的提示；prefix 为 validation.lesson / validation.student */
  function rateErrorKey(prefix, parsed) {
    var suffix = {
      empty: 'Required',
      format: 'Number',
      decimals: 'Decimals',
      range: 'Range'
    }[parsed && parsed.reason] || 'Number';
    return prefix + '.rate' + suffix;
  }

  function writeFailureMessage(result, fallbackKey) {
    if (result && result.error && result.error.key) {
      return t(result.error.key, result.error.params);
    }
    return t(fallbackKey);
  }

  function isWriteFailure(result) {
    return !result || result.ok === false;
  }

  function notifyWriteFailure(result, fallbackKey) {
    UI.showToast(writeFailureMessage(result, fallbackKey), 'error');
    syncStorageWarning();
  }

  function syncStorageWarning() {
    if (!TTStorage.isReadAvailable()) {
      UI.showStorageWarning(t('storage.warning.unavailable'));
    } else if (TTStorage.isReadOnly()) {
      UI.showStorageWarning(t('storage.warning.readOnly'));
    } else {
      UI.hideStorageWarning();
    }

    UI.setRawExportVisible(
      !TTStorage.isReadAvailable() || TTStorage.isReadOnly()
    );
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

    // 读取数据（顺带触发迁移和损坏数据的兜底）
    TTStorage.load();
    syncStorageWarning();

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
    document.getElementById('ledger-list').addEventListener('click', handleListClick);
    document.getElementById('outstanding-list').addEventListener('click', handleListClick);

    document.getElementById('stats-month').addEventListener('change', handleStatsMonthChange);
    document.getElementById('ledger-student').addEventListener('input', handleLedgerFilterInput);
    document.getElementById('ledger-subject').addEventListener('input', handleLedgerFilterInput);
    document.getElementById('ledger-status').addEventListener('change', handleLedgerFilterInput);
    document.getElementById('ledger-reset').addEventListener('click', handleLedgerReset);
    document.getElementById('ledger-export').addEventListener('click', handleExportLedger);

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
      state.editingLessonFingerprint = null;
    });
    lessonDialog.addEventListener('cancel', function () {
      state.editingLessonId = null;
      state.editingLessonFingerprint = null;
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
    document.getElementById('export-raw').addEventListener('click', handleExportRawData);
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

    global.addEventListener('storage', function (event) {
      if (event.key !== TTStorage.KEY && event.key !== null) return;
      if (event.storageArea && event.storageArea !== global.localStorage) return;
      if (!TTStorage.reload()) {
        syncStorageWarning();
        return;
      }

      syncStorageWarning();

      var conflict = false;

      if (state.editingLessonId) {
        var liveLesson = findLesson(state.editingLessonId);
        if (
          !liveLesson ||
          lessonFingerprint(liveLesson) !== state.editingLessonFingerprint
        ) {
          state.editingLessonId = null;
          state.editingLessonFingerprint = null;
          UI.closeLessonEditor();
          conflict = true;
        }
      }

      if (state.editingStudentId) {
        var liveStudent = findStudent(state.editingStudentId);
        if (
          !liveStudent ||
          studentFingerprint(liveStudent) !== state.editingStudentFingerprint
        ) {
          state.editingStudentId = null;
          state.editingStudentFingerprint = null;
          UI.resetStudentForm();
          conflict = true;
        }
      }

      render();
      UI.showToast(
        t(conflict ? 'storage.editConflict' : 'storage.externalChange'),
        conflict ? 'error' : ''
      );
    });

    // 页面从后台切回来时，如果跨月或跨年了就刷新统计
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (!state.followCurrentMonth) return;

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
    syncStorageWarning();

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

  function studentFingerprint(student) {
    if (!student) return '';
    return JSON.stringify([
      student.id,
      student.name,
      student.grade,
      student.subject,
      student.hourlyRateCents,
      student.createdAt
    ]);
  }

  function lessonFingerprint(lesson) {
    if (!lesson) return '';
    return JSON.stringify([
      lesson.id,
      lesson.studentId,
      lesson.student,
      lesson.date,
      lesson.duration,
      lesson.hourlyRateCents,
      lesson.feeCents,
      lesson.paid,
      lesson.createdAt
    ]);
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

  /** 校验记课表单，返回 { 字段名: 错误信息 }。original 用于编辑历史课程时保留未修改的超限计费字段 */
  function validate(values, original) {
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
    var durationUnchanged = Boolean(original) &&
      values.duration !== '' &&
      duration === original.duration;
    if (values.duration === '') {
      errors.duration = t('validation.lesson.durationRequired');
    } else if (!Number.isFinite(duration) || !Number.isInteger(duration)) {
      errors.duration = t('validation.lesson.durationInteger');
    } else if (!durationUnchanged && (duration < 1 || duration > 1440)) {
      errors.duration = t('validation.lesson.durationRange');
    }

    var rate = Calc.parseYuanInput(values.rate);
    var rateUnchanged = isRateUnchanged(values.rate, original);
    if (!rate.ok && !rateUnchanged) {
      errors.rate = t(rateErrorKey('validation.lesson', rate));
    }

    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    var values = readForm();
    var errors = validate(values);

    UI.clearErrors();
    if (Object.keys(errors).length > 0) {
      UI.showErrors(errors);
      return;
    }

    var result;
    try {
      result = await TTStorage.addLesson({
        studentId: values.studentId,
        date: values.date,
        duration: Number(values.duration),
        hourlyRateCents: Calc.parseYuanInput(values.rate).cents
      });
    } catch (error) {
      UI.showToast(t('toast.lesson.addFailed'), 'error');
      return;
    }

    if (isWriteFailure(result)) {
      notifyWriteFailure(result, 'toast.lesson.addFailed');
      return;
    }

    UI.resetForm();
    UI.setIncomePreview(null);
    render();

    UI.showToast(t('toast.lesson.added', {
      student: result.lesson.student,
      duration: Calc.minutesToText(result.lesson.duration)
    }), 'success');

    UI.focusStudent();
  }

  /** 选择学生后自动填入默认时薪，仍允许手动修改 */
  function handleStudentSelect() {
    var student = findStudent(form.elements.studentId.value);
    if (!student) {
      handlePreview();
      return;
    }

    UI.setLessonRate(student.hourlyRateCents);
    handlePreview();
  }

  /** 输入时长或单价时，实时预览这一节课的收入 */
  function handlePreview() {
    var values = readForm();
    var duration = Number(values.duration);
    var rate = Calc.parseYuanInput(values.rate);

    var valid =
      values.duration !== '' &&
      Number.isFinite(duration) &&
      duration > 0 &&
      rate.ok;

    if (!valid) {
      UI.setIncomePreview(null);
      return;
    }

    var feeCents = Calc.lessonFeeCentsFromRate(rate.cents, duration);
    UI.setIncomePreview(I18N.formatCurrencyCents(feeCents));
  }

  /** 输入法还在选词时按回车，不要提交表单 */
  function handleKeydown(event) {
    if (event.key === 'Enter' && event.isComposing) {
      event.preventDefault();
    }
  }

  async function handleListClick(event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;

    var action = button.dataset.action;
    var id = button.dataset.id;

    if (action === 'toggle-paid') {
      await handleTogglePaid(id);
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

    var result;
    try {
      result = await TTStorage.removeLesson(id);
    } catch (error) {
      UI.showToast(t('toast.lesson.deleteFailed'), 'error');
      return;
    }
    if (isWriteFailure(result) || !result.removed) {
      notifyWriteFailure(result, 'toast.lesson.deleteFailed');
      return;
    }

    if (state.editingLessonId === id) {
      state.editingLessonId = null;
      state.editingLessonFingerprint = null;
      UI.closeLessonEditor();
    }

    render();
    UI.showToast(t('toast.lesson.deleted'), 'success');
  }

  /** 在「待收款 / 已收款」之间切换 */
  async function handleTogglePaid(id) {
    var target = findLesson(id);
    if (!target) {
      UI.showToast(t('toast.lesson.missing'), 'error');
      render();
      return;
    }

    var nextPaid = !Calc.isPaid(target);
    var result;
    try {
      result = await TTStorage.setLessonPaid(id, nextPaid);
    } catch (error) {
      UI.showToast(t('toast.lesson.updateFailed'), 'error');
      return;
    }
    if (isWriteFailure(result)) {
      notifyWriteFailure(result, 'toast.lesson.updateFailed');
      return;
    }

    render();
    UI.showToast(
      t(nextPaid ? 'toast.lesson.paidMarked' : 'toast.lesson.unpaidMarked'),
      'success',
      {
        label: t('common.undo'),
        onClick: function () {
          handleUndoPaid(id, nextPaid);
        }
      }
    );
  }

  /** 撤销刚才的收款状态切换 */
  async function handleUndoPaid(id, changedToPaid) {
    var target = findLesson(id);
    if (!target) {
      UI.showToast(t('toast.lesson.missing'), 'error');
      render();
      return;
    }

    var result;
    try {
      result = await TTStorage.setLessonPaid(id, !changedToPaid);
    } catch (error) {
      UI.showToast(t('toast.lesson.updateFailed'), 'error');
      return;
    }
    if (isWriteFailure(result)) {
      notifyWriteFailure(result, 'toast.lesson.updateFailed');
      return;
    }

    render();
    UI.showToast(
      t(changedToPaid ? 'toast.lesson.undoPaid' : 'toast.lesson.undoUnpaid'),
      'success'
    );
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
    state.editingLessonFingerprint = lessonFingerprint(target);
    UI.openLessonEditor(target, TTStorage.getStudents());
  }

  async function handleLessonEditSubmit(event) {
    event.preventDefault();

    var id = state.editingLessonId;
    if (!id) {
      UI.showToast(t('toast.lesson.noEditing'), 'error');
      return;
    }

    var values = UI.readLessonEditor();
    var original = findLesson(id);
    var errors = validate(values, original);

    UI.clearEditErrors();
    if (Object.keys(errors).length > 0) {
      UI.showEditErrors(errors);
      return;
    }

    var result;
    var rate = Calc.parseYuanInput(values.rate);
    var hourlyRateCents = rate.ok
      ? rate.cents
      : (original ? original.hourlyRateCents : null);
    try {
      result = await TTStorage.updateLesson(id, {
        studentId: values.studentId,
        date: values.date,
        duration: Number(values.duration),
        hourlyRateCents: hourlyRateCents,
        paid: values.paid === 'paid'
      });
    } catch (error) {
      UI.showToast(t('toast.lesson.updateFailed'), 'error');
      return;
    }

    if (isWriteFailure(result)) {
      notifyWriteFailure(result, 'toast.lesson.updateFailed');
      return;
    }

    state.editingLessonId = null;
    state.editingLessonFingerprint = null;
    UI.closeLessonEditor();
    render();
    UI.showToast(t('toast.lesson.updated'), 'success');
  }

  function closeLessonEditor() {
    state.editingLessonId = null;
    state.editingLessonFingerprint = null;
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

  function validateStudent(values, original) {
    var errors = {};

    if (!values.name) {
      errors.name = t('validation.student.nameRequired');
    } else if (values.name.length > 20) {
      errors.name = t('validation.student.nameTooLong');
    }

    var rate = Calc.parseYuanInput(values.rate);
    var rateUnchanged = isRateUnchanged(values.rate, original);
    if (!rate.ok && !rateUnchanged) {
      errors.rate = t(rateErrorKey('validation.student', rate));
    }

    return errors;
  }

  async function handleStudentSubmit(event) {
    event.preventDefault();

    var values = readStudentForm();
    var original = state.editingStudentId ? findStudent(state.editingStudentId) : null;
    var errors = validateStudent(values, original);

    UI.clearStudentErrors();
    if (Object.keys(errors).length > 0) {
      UI.showStudentErrors(errors);
      return;
    }

    var wasEditing = Boolean(state.editingStudentId);
    var hadSelection = Boolean(UI.getLessonStudentId());
    var rate = Calc.parseYuanInput(values.rate);
    var rateUnchanged = isRateUnchanged(values.rate, original);
    var payload = {
      name: values.name,
      grade: values.grade,
      subject: values.subject,
      hourlyRateCents: rate.ok ? rate.cents : (rateUnchanged ? original.hourlyRateCents : null)
    };

    var result;
    try {
      result = wasEditing
        ? await TTStorage.updateStudent(state.editingStudentId, payload)
        : await TTStorage.addStudent(payload);
    } catch (error) {
      UI.showToast(t('toast.student.saveFailed'), 'error');
      return;
    }

    if (isWriteFailure(result)) {
      notifyWriteFailure(result, 'toast.student.saveFailed');
      return;
    }

    state.editingStudentId = null;
    state.editingStudentFingerprint = null;
    UI.resetStudentForm();
    render();

    // 刚添加的学生如果是第一位，顺手在记课表单里选中
    if (!wasEditing && !hadSelection) {
      UI.selectLessonStudent(result.student);
      handlePreview();
    }

    UI.showToast(
      t(wasEditing ? 'toast.student.saved' : 'toast.student.added', {
        name: result.student.name
      }),
      'success'
    );

    UI.focusStudentName();
  }

  async function handleStudentListClick(event) {
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
      state.editingStudentFingerprint = studentFingerprint(student);
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

    var result;
    try {
      result = await TTStorage.removeStudent(target.id);
    } catch (error) {
      UI.showToast(t('toast.student.deleteFailed'), 'error');
      return;
    }
    if (isWriteFailure(result) || !result.removed) {
      notifyWriteFailure(result, 'toast.student.deleteFailed');
      return;
    }

    if (state.editingStudentId === target.id) {
      state.editingStudentId = null;
      state.editingStudentFingerprint = null;
      UI.resetStudentForm();
    }

    render();
    UI.showToast(t('toast.student.deleted', { name: target.name }), 'success');
  }

  function handleCancelStudentEdit() {
    if (!state.editingStudentId) return;
    state.editingStudentId = null;
    state.editingStudentFingerprint = null;
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

  function downloadTextFile(content, filename, mime) {
    var link = document.createElement('a');
    var url = '';

    link.download = filename;

    try {
      if (
        typeof global.Blob === 'function' &&
        global.URL &&
        typeof global.URL.createObjectURL === 'function'
      ) {
        var blob = new global.Blob([content], { type: mime });
        url = global.URL.createObjectURL(blob);
        link.href = url;
      } else {
        link.href = 'data:' + mime + ',' + encodeURIComponent(content);
      }
    } catch (error) {
      return false;
    }

    document.body.appendChild(link);
    link.click();
    link.remove();

    if (url) {
      global.setTimeout(function () {
        global.URL.revokeObjectURL(url);
      }, 1000);
    }

    return true;
  }

  function handleExportBackup() {
    var backup = TTStorage.createBackup();

    if (!backup) {
      UI.showToast(t('toast.export.unavailable'), 'error');
      syncStorageWarning();
      return;
    }

    var json = JSON.stringify(backup, null, 2);
    var filename = 'TutorTrack-backup-' + Calc.toDateString(new Date()) + '.json';

    if (!downloadTextFile(json, filename, 'application/json;charset=utf-8')) {
      UI.showToast(t('toast.export.failed'), 'error');
      return;
    }

    UI.showToast(t('toast.export.success', {
      students: I18N.countLong('students', backup.counts.students),
      lessons: I18N.countLong('records', backup.counts.lessons)
    }), 'success');
  }

  /** 只读/加载失败时原样导出正式 KEY，不做任何解析或修正 */
  function handleExportRawData() {
    var result = TTStorage.getRawData();

    if (!result.ok) {
      UI.showToast(t('toast.export.rawReadFailed'), 'error');
      return;
    }
    if (!result.exists) {
      UI.showToast(t('toast.export.rawMissing'), 'error');
      return;
    }

    var filename = 'TutorTrack-raw-' + Calc.toDateString(new Date()) + '.json';
    if (!downloadTextFile(result.raw, filename, 'application/json;charset=utf-8')) {
      UI.showToast(t('toast.export.rawFailed'), 'error');
      return;
    }

    UI.showToast(t('toast.export.rawSuccess'), 'success');
  }

  /** 导出所选月份的完整账目，不受当前筛选影响 */
  function handleExportLedger() {
    TTStorage.reload();
    var allLessons = TTStorage.getLessons();
    var monthKey = state.monthKey;
    var monthLessons = Calc.sortLessons(allLessons.filter(function (lesson) {
      return Calc.monthKey(lesson.date) === monthKey;
    }));

    if (!monthLessons.length) {
      UI.showToast(t('ledger.exportEmpty'), 'error');
      return;
    }

    var students = TTStorage.getStudents();
    var studentsById = indexStudents(students);
    var summary = Calc.summarizeMonthPayments(allLessons, monthKey);
    var base = Calc.summarize(allLessons, monthKey);
    var lines = [];

    function csvCell(value) {
      var text = value === null || value === undefined ? '' : String(value);
      if (/[",\r\n]/.test(text)) {
        return '"' + text.replace(/"/g, '""') + '"';
      }
      return text;
    }

    function moneyCell(cents) {
      return Calc.centsToYuanFixed(cents);
    }

    lines.push([t('ledger.csv.title'), Calc.monthLabel(monthKey)]);
    lines.push([t('ledger.csv.month'), Calc.monthLabel(monthKey)]);
    lines.push([t('ledger.csv.totalLessons'), monthLessons.length]);
    lines.push([t('ledger.csv.totalMinutes'), base.totalMinutes]);
    lines.push([t('ledger.csv.receivable'), moneyCell(summary.totalCents)]);
    lines.push([t('ledger.csv.paid'), moneyCell(summary.paidCents)]);
    lines.push([t('ledger.csv.unpaid'), moneyCell(summary.unpaidCents)]);
    lines.push([]);
    lines.push([
      t('ledger.csv.date'),
      t('ledger.csv.student'),
      t('ledger.csv.subject'),
      t('ledger.csv.duration'),
      t('ledger.csv.rate'),
      t('ledger.csv.amount'),
      t('ledger.csv.status')
    ]);

    monthLessons.forEach(function (lesson) {
      var student = lesson.studentId ? studentsById[lesson.studentId] : null;
      var subject = student && student.subject ? student.subject : t('ledger.noSubject');
      lines.push([
        lesson.date,
        Calc.resolveStudentName(lesson, studentsById),
        subject,
        lesson.duration,
        moneyCell(lesson.hourlyRateCents),
        moneyCell(Calc.lessonFeeCents(lesson)),
        Calc.isPaid(lesson) ? t('status.paid') : t('status.unpaid')
      ]);
    });

    var csv = lines.map(function (row) {
      return row.map(csvCell).join(',');
    }).join('\r\n');

    if (!downloadTextFile(
      '\uFEFF' + csv,
      'TutorTrack-ledger-' + monthKey + '.csv',
      'text/csv;charset=utf-8'
    )) {
      UI.showToast(t('toast.export.failed'), 'error');
      return;
    }

    UI.showToast(t('ledger.exported', {
      month: Calc.monthLabel(monthKey),
      count: count('records', monthLessons.length)
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

      applyImportedBackup(parsed).catch(function () {
        var message = t('import.failed', {
          reason: t('storage.error.restoreWriteFailed')
        });
        UI.showImportStatus(message, 'error');
        UI.showToast(message, 'error');
      });
    };

    reader.onerror = function () {
      UI.showImportStatus(t('import.readFailed'), 'error');
      UI.showToast(t('toast.import.readFailed'), 'error');
    };

    reader.readAsText(file, 'utf-8');
  }

  async function applyImportedBackup(parsed) {
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

    var result;
    try {
      result = await TTStorage.restoreBackup(parsed);
    } catch (error) {
      result = {
        ok: false,
        errorKey: 'storage.error.restoreWriteFailed',
        params: null
      };
    }

    if (!result.ok) {
      var restoreMessage = t('import.failed', {
        reason: t(result.errorKey, result.params)
      });
      UI.showImportStatus(restoreMessage, 'error');
      UI.showToast(restoreMessage, 'error');
      syncStorageWarning();
      return;
    }

    // 清理可能残留的编辑状态，并回到当前月份重新渲染
    state.editingStudentId = null;
    state.editingStudentFingerprint = null;
    state.editingLessonId = null;
    state.editingLessonFingerprint = null;
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
    state.period = 'month';
    state.monthKey = Calc.currentMonthKey();
    state.yearKey = Calc.currentYearKey();
    state.followCurrentMonth = true;
    state.ledgerStudent = '';
    state.ledgerSubject = '';
    state.ledgerStatus = 'all';
    UI.setLedgerFilterValues(state);

    syncStorageWarning();
    render();

    var successMessage = t('import.success', {
      students: I18N.countLong('students', result.counts.students),
      lessons: I18N.countLong('records', result.counts.lessons)
    });
    UI.showImportStatus(successMessage, 'success');
    UI.showToast(successMessage, 'success');
  }

  /* ---------------- 统计范围 ---------------- */

  function handleStatsMonthChange(event) {
    var value = event.target.value;
    if (!/^\d{4}-\d{2}$/.test(value)) return;

    state.monthKey = value;
    state.yearKey = value.slice(0, 4);
    state.followCurrentMonth = value === Calc.currentMonthKey();
    render();
  }

  function handleLedgerFilterInput() {
    state.ledgerStudent = document.getElementById('ledger-student').value;
    state.ledgerSubject = document.getElementById('ledger-subject').value;
    state.ledgerStatus = document.getElementById('ledger-status').value;
    renderLedgerOnly();
  }

  function handleLedgerReset() {
    state.ledgerStudent = '';
    state.ledgerSubject = '';
    state.ledgerStatus = 'all';
    UI.setLedgerFilterValues(state);
    renderLedgerOnly();
  }

  function renderLedgerOnly() {
    var students = TTStorage.getStudents();
    var lessons = Calc.sortLessons(TTStorage.getLessons());
    UI.renderLedger(lessons, indexStudents(students), {
      monthKey: state.monthKey,
      studentName: state.ledgerStudent,
      subject: state.ledgerSubject,
      status: state.ledgerStatus
    });
  }

  function handlePeriodClick(event) {
    var period = event.currentTarget.dataset.period;
    if (period !== 'month' && period !== 'year') return;
    if (period === state.period) return;

    state.period = period;
    if (/^\d{4}-\d{2}$/.test(state.monthKey)) {
      state.yearKey = state.monthKey.slice(0, 4);
    }
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
      totalCents: payments.totalCents,
      paidCents: payments.paidCents,
      unpaidCents: payments.unpaidCents,
      paidCount: payments.paidCount,
      unpaidCount: payments.unpaidCount
    };

    var compareDelta = null;
    if (state.period === 'month') {
      var previousPayments = Calc.summarizeMonthPayments(
        lessons,
        Calc.shiftMonthKey(state.monthKey, -1)
      );
      compareDelta = payments.paidCents - previousPayments.paidCents;
    }

    UI.setStatsMonth(state.monthKey);
    UI.renderStats(summary, state.period, key, compareDelta);
    UI.renderLedger(lessons, studentsById, {
      monthKey: state.monthKey,
      studentName: state.ledgerStudent,
      subject: state.ledgerSubject,
      status: state.ledgerStatus
    });
    UI.renderOutstanding(lessons, studentsById);
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
