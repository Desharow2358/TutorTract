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

    UI.init();

    // 读取数据（顺带触发可用性检测、旧数据迁移和损坏数据的兜底）
    TTStorage.load();
    if (!TTStorage.isPersistent()) {
      UI.showStorageWarning(
        '无法访问浏览器本地存储（可能处于无痕模式或禁用了站点数据）。本次记录在刷新后会丢失。'
      );
    }

    var loadError = TTStorage.getLastError();
    if (loadError) UI.showToast(loadError, 'error');

    UI.setFormDefaultDate(Calc.toDateString(new Date()));

    bindEvents();
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
        ? '请选择学生。'
        : '还没有学生，请先在「学生管理」中添加。';
    }

    if (!values.date) {
      errors.date = '请选择上课日期。';
    } else if (!Calc.isValidDateString(values.date)) {
      errors.date = '日期格式不正确。';
    }

    var duration = Number(values.duration);
    if (values.duration === '') {
      errors.duration = '请填写课程时长。';
    } else if (!Number.isFinite(duration) || !Number.isInteger(duration)) {
      errors.duration = '时长请填写整数分钟。';
    } else if (duration < 1 || duration > 1440) {
      errors.duration = '时长需在 1～1440 分钟之间。';
    }

    var rate = Number(values.rate);
    if (values.rate === '') {
      errors.rate = '请填写课时费。';
    } else if (!Number.isFinite(rate)) {
      errors.rate = '课时费请填写数字。';
    } else if (rate < 0 || rate > 10000) {
      errors.rate = '课时费需在 0～10000 元之间。';
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
      UI.showToast('添加失败：数据格式不正确。', 'error');
      return;
    }

    UI.resetForm();
    UI.setIncomePreview(null);
    render();

    if (result.saved) {
      UI.showToast(
        '已记录：' + result.lesson.student + ' · ' + Calc.minutesToText(result.lesson.duration),
        'success'
      );
    } else {
      UI.showToast('记录已添加，但未能写入本地存储，刷新后会丢失。', 'error');
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
    UI.setIncomePreview('¥' + Calc.formatMoney(income));
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
      UI.showToast('这条记录已经不存在了，请刷新页面。', 'error');
      return;
    }

    var name = Calc.resolveStudentName(target, indexStudents(TTStorage.getStudents()));
    var message =
      '确定删除 ' + name + ' 在 ' + target.date + ' 的课程记录吗？\n此操作无法撤销。';
    if (!global.confirm(message)) return;

    var result = TTStorage.removeLesson(id);
    if (!result.removed) {
      UI.showToast('删除失败：没有找到这条记录。', 'error');
      render();
      return;
    }

    if (state.editingLessonId === id) {
      state.editingLessonId = null;
      UI.closeLessonEditor();
    }

    render();

    if (result.saved) {
      UI.showToast('已删除一条课程记录。', 'success');
    } else {
      UI.showToast('已删除，但未能同步到本地存储，刷新后可能恢复。', 'error');
    }
  }

  /** 在「待收款 / 已收款」之间切换 */
  function handleTogglePaid(id) {
    var target = findLesson(id);
    if (!target) {
      UI.showToast('这条记录已经不存在了，请刷新页面。', 'error');
      render();
      return;
    }

    var nextPaid = !Calc.isPaid(target);
    var result = TTStorage.setLessonPaid(id, nextPaid);
    if (!result) {
      UI.showToast('修改失败：没有找到这条记录。', 'error');
      render();
      return;
    }

    render();

    var message = nextPaid ? '已标记为已收款。' : '已改回待收款。';
    if (result.saved) {
      UI.showToast(message, 'success');
    } else {
      UI.showToast(message + ' 但未能写入本地存储，刷新后可能恢复。', 'error');
    }
  }

  /** 打开编辑弹窗 */
  function handleOpenLessonEdit(id) {
    var target = findLesson(id);
    if (!target) {
      UI.showToast('这条记录已经不存在了，请刷新页面。', 'error');
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
      UI.showToast('没有正在编辑的记录，请重新打开编辑窗口。', 'error');
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
      UI.showToast('保存失败：记录不存在或数据格式不正确。', 'error');
      return;
    }

    state.editingLessonId = null;
    UI.closeLessonEditor();
    render();

    if (result.saved) {
      UI.showToast('已保存课程记录的修改。', 'success');
    } else {
      UI.showToast('已保存，但未能写入本地存储，刷新后可能恢复。', 'error');
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
      errors.name = '请填写学生昵称。';
    } else if (values.name.length > 20) {
      errors.name = '昵称最多 20 个字符。';
    }

    var rate = Number(values.rate);
    if (values.rate === '') {
      errors.rate = '请填写默认时薪。';
    } else if (!Number.isFinite(rate)) {
      errors.rate = '默认时薪请填写数字。';
    } else if (rate < 0 || rate > 10000) {
      errors.rate = '默认时薪需在 0～10000 元之间。';
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
      UI.showToast('保存失败：请检查学生信息。', 'error');
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

    var verb = wasEditing
      ? '已保存「' + result.student.name + '」的修改。'
      : '已添加学生「' + result.student.name + '」。';

    if (result.saved) {
      UI.showToast(verb, 'success');
    } else {
      UI.showToast(verb + ' 但未能写入本地存储，刷新后会丢失。', 'error');
    }

    UI.focusStudentName();
  }

  function handleStudentListClick(event) {
    var editButton = event.target.closest('button[data-action="edit-student"]');
    var deleteButton = event.target.closest('button[data-action="delete-student"]');

    if (editButton) {
      var student = findStudent(editButton.dataset.id);
      if (!student) {
        UI.showToast('这位学生已经不存在了，请刷新页面。', 'error');
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
      UI.showToast('这位学生已经不存在了，请刷新页面。', 'error');
      render();
      return;
    }

    var lessons = TTStorage.getLessons();
    var related = lessons.filter(function (lesson) {
      return lesson.studentId === target.id;
    }).length;

    var message = '确定删除学生「' + target.name + '」吗？';
    if (related > 0) {
      message += '\n他/她的 ' + related + ' 条历史课程记录会保留，并继续计入收入统计。';
    } else {
      message += '\n该学生还没有课程记录。';
    }
    if (!global.confirm(message)) return;

    var result = TTStorage.removeStudent(target.id);
    if (!result.removed) {
      UI.showToast('删除失败：没有找到这位学生。', 'error');
      render();
      return;
    }

    if (state.editingStudentId === target.id) {
      state.editingStudentId = null;
      UI.resetStudentForm();
    }

    render();

    if (result.saved) {
      UI.showToast('已删除学生「' + target.name + '」，历史课程记录已保留。', 'success');
    } else {
      UI.showToast('已删除，但未能同步到本地存储，刷新后可能恢复。', 'error');
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

  function twoDigits(value) {
    return value < 10 ? '0' + value : String(value);
  }

  /** 把备份里的 ISO 时间显示成本地时间 */
  function formatExportTime(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return value || '未知';

    return (
      date.getFullYear() + '-' + twoDigits(date.getMonth() + 1) + '-' +
      twoDigits(date.getDate()) + ' ' + twoDigits(date.getHours()) + ':' +
      twoDigits(date.getMinutes())
    );
  }

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
      UI.showToast('导出失败：浏览器不支持文件下载。', 'error');
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

    UI.showToast(
      '已导出备份：' + backup.counts.students + ' 名学生、' +
      backup.counts.lessons + ' 条课程记录。',
      'success'
    );
  }

  function handleImportFile(event) {
    var file = event.target.files && event.target.files[0];
    // 允许连续选择同一个文件
    event.target.value = '';
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      UI.showImportStatus('导入失败：备份文件超过 20 MB。', 'error');
      UI.showToast('导入失败：备份文件过大。', 'error');
      return;
    }

    var reader = new global.FileReader();

    reader.onload = function () {
      var parsed;

      try {
        parsed = JSON.parse(String(reader.result));
      } catch (error) {
        UI.showImportStatus('导入失败：文件不是有效的 JSON。', 'error');
        UI.showToast('导入失败：文件不是有效的 JSON。', 'error');
        return;
      }

      applyImportedBackup(parsed);
    };

    reader.onerror = function () {
      UI.showImportStatus('导入失败：无法读取文件。', 'error');
      UI.showToast('导入失败：无法读取文件。', 'error');
    };

    reader.readAsText(file, 'utf-8');
  }

  function applyImportedBackup(parsed) {
    var validation = TTStorage.validateBackup(parsed);

    if (!validation.ok) {
      UI.showImportStatus('导入失败：' + validation.error, 'error');
      UI.showToast('导入失败：' + validation.error, 'error');
      return;
    }

    var incoming = validation.backup;
    var currentStudents = TTStorage.getStudents().length;
    var currentLessons = TTStorage.getLessons().length;
    var exportedAt = incoming.exportedAt
      ? formatExportTime(incoming.exportedAt)
      : '备份文件中未记录';

    var message =
      '即将导入备份：\n' +
      '· 学生：' + incoming.counts.students + ' 名\n' +
      '· 课程记录：' + incoming.counts.lessons + ' 条\n' +
      '· 导出时间：' + exportedAt + '\n\n' +
      '注意：导入会替换当前现有的 ' + currentStudents + ' 名学生和 ' +
      currentLessons + ' 条课程记录，现有数据将被覆盖。\n' +
      '建议先导出当前数据作为备份。\n\n' +
      '确定继续导入吗？';

    if (!global.confirm(message)) {
      UI.showImportStatus('已取消导入，当前数据没有改变。', '');
      UI.showToast('已取消导入。', '');
      return;
    }

    var result = TTStorage.restoreBackup(parsed);
    if (!result.ok) {
      UI.showImportStatus('导入失败：' + result.error, 'error');
      UI.showToast('导入失败：' + result.error, 'error');
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

    var successMessage =
      '导入成功：已恢复 ' + result.counts.students + ' 名学生、' +
      result.counts.lessons + ' 条课程记录。';
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
