/* ============================================================
   storage.js —— 本地存储模块
   只负责“把数据安全地存进 localStorage / 取出来”，不做计算、不碰页面。

   存储键仍然是 tutortrack:v1（为了兼容第一版数据，不换键）。
   内部数据结构升级到 version 3：
     { version: 3, students: [...], lessons: [...] }
   读取旧数据时会自动迁移：
     - 根据课程里的昵称生成学生档案（v1 → v2）
     - 旧课程没有 paid 字段时补成 false（待收款，v2 → v3）
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'tutortrack:v1';
  var VERSION = 3;

  // 备份文件格式版本（与内部数据结构版本分开，方便以后单独升级）
  var BACKUP_APP = 'TutorTrack';
  var BACKUP_VERSION = 1;

  var cache = { version: VERSION, students: [], lessons: [] };
  var loaded = false;
  var available = true;
  var lastError = '';

  function emptyStore() {
    return { version: VERSION, students: [], lessons: [] };
  }

  /** 检查 localStorage 是否可用（无痕模式、禁用站点数据时会抛异常） */
  function detect() {
    try {
      var probe = '__tutortrack_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (error) {
      return false;
    }
  }

  function createId(prefix) {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') {
        return prefix + '_' + global.crypto.randomUUID();
      }
    } catch (error) {
      /* 某些环境不支持，走下面的兜底 */
    }
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function cleanText(value, maxLength) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
  }

  /** 把一条原始学生数据清洗成标准格式，不合法则返回 null */
  function normalizeStudent(raw) {
    if (!raw || typeof raw !== 'object') return null;

    var name = cleanText(raw.name, 20);
    var rate = Number(raw.rate);

    if (!name) return null;
    if (!Number.isFinite(rate) || rate < 0) return null;

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId('s'),
      name: name,
      grade: cleanText(raw.grade, 20),
      subject: cleanText(raw.subject, 20),
      rate: rate,
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now()
    };
  }

  /**
   * 把一条原始课程数据清洗成标准格式，不合法则返回 null
   * student 是“昵称快照”：即使学生以后改名或被删除，历史记录仍然有名字可显示
   */
  function normalizeLesson(raw, studentsById) {
    if (!raw || typeof raw !== 'object') return null;

    var studentId = typeof raw.studentId === 'string' ? raw.studentId : '';
    var student = typeof raw.student === 'string' ? raw.student.trim() : '';
    var date = typeof raw.date === 'string' ? raw.date : '';
    var duration = Math.round(Number(raw.duration));
    var rate = Number(raw.rate);

    // 新数据只有 studentId 时，从学生档案补出昵称快照
    if (!student && studentId && studentsById && studentsById[studentId]) {
      student = studentsById[studentId].name;
    }

    if (!student || !Calc.isValidDateString(date)) return null;
    if (!Number.isFinite(duration) || duration <= 0) return null;
    if (!Number.isFinite(rate) || rate < 0) return null;

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId('l'),
      studentId: studentId,
      student: student.slice(0, 20),
      date: date,
      duration: duration,
      rate: rate,
      // 旧数据没有 paid 字段 → 默认待收款
      paid: raw.paid === true,
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now()
    };
  }

  function indexStudents(students) {
    var map = {};
    for (var i = 0; i < students.length; i += 1) {
      map[students[i].id] = students[i];
    }
    return map;
  }

  /**
   * 兼容三种输入：纯课程数组、v1 的 { version, lessons }、v2/v3 的完整结构
   * 返回 { store, migrated }，migrated 表示是否发生了数据结构升级
   */
  function normalizeStore(raw) {
    var rawStudents = [];
    var rawLessons = [];
    var migrated = false;

    if (Array.isArray(raw)) {
      rawLessons = raw;
      migrated = true;
    } else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.students)) rawStudents = raw.students;
      if (Array.isArray(raw.lessons)) rawLessons = raw.lessons;
      if (Number(raw.version) !== VERSION) migrated = true;
    } else {
      migrated = true;
    }

    // 1. 清洗学生
    var students = [];
    var seenIds = {};
    for (var i = 0; i < rawStudents.length; i += 1) {
      var student = normalizeStudent(rawStudents[i]);
      if (!student) continue;
      if (seenIds[student.id]) continue;
      seenIds[student.id] = true;
      students.push(student);
    }
    var byId = indexStudents(students);

    // 2. 清洗课程；旧课程没有 studentId，就按昵称补建学生
    var lessons = [];
    for (var j = 0; j < rawLessons.length; j += 1) {
      // 缺少收款状态也视为需要迁移（即使 version 号已经是 3）
      if (
        !rawLessons[j] ||
        typeof rawLessons[j] !== 'object' ||
        typeof rawLessons[j].paid !== 'boolean'
      ) {
        migrated = true;
      }

      var lesson = normalizeLesson(rawLessons[j], byId);
      if (!lesson) continue;

      if (!lesson.studentId) {
        var matched = null;
        for (var k = 0; k < students.length; k += 1) {
          if (students[k].name === lesson.student) {
            matched = students[k];
            break;
          }
        }

        if (!matched) {
          matched = {
            id: createId('s'),
            name: lesson.student,
            grade: '',
            subject: '',
            rate: lesson.rate,
            createdAt: lesson.createdAt
          };
          students.push(matched);
          byId[matched.id] = matched;
        }

        lesson.studentId = matched.id;
        migrated = true;
      }

      lessons.push(lesson);
    }

    return {
      store: { version: VERSION, students: students, lessons: lessons },
      migrated: migrated
    };
  }

  /** 从 localStorage 读取。失败不会抛错，而是返回空数据并记录原因 */
  function load() {
    if (loaded) return cache;
    loaded = true;

    available = detect();
    if (!available) {
      lastError = '无法访问浏览器本地存储，本次记录在刷新后会丢失。';
      cache = emptyStore();
      return cache;
    }

    var raw = null;
    try {
      raw = global.localStorage.getItem(KEY);
    } catch (error) {
      available = false;
      lastError = '读取本地数据失败，本次记录在刷新后会丢失。';
      cache = emptyStore();
      return cache;
    }

    if (!raw) {
      cache = emptyStore();
      return cache;
    }

    try {
      var result = normalizeStore(JSON.parse(raw));
      cache = result.store;
      // 旧数据升级成 v2 后立刻写回，避免每次刷新都重新迁移
      if (result.migrated) persist();
    } catch (error) {
      // 数据损坏：先把原文备份到另一个键，再重置，避免直接丢失
      lastError = '本地数据格式异常，已备份原数据并重置为空列表。';
      try {
        global.localStorage.setItem(KEY + ':broken:' + Date.now(), raw);
        global.localStorage.removeItem(KEY);
      } catch (backupError) {
        /* 备份失败也不影响页面继续使用 */
      }
      cache = emptyStore();
    }

    return cache;
  }

  /** 写回 localStorage，返回是否成功 */
  function persist() {
    if (!available) return false;
    try {
      global.localStorage.setItem(KEY, JSON.stringify(cache));
      return true;
    } catch (error) {
      lastError = '保存失败：浏览器存储空间不足或已被禁用。';
      return false;
    }
  }

  /* ---------------- 课程 ---------------- */

  function getLessons() {
    return load().lessons.slice();
  }

  /**
   * 新增一条课程
   * 成功返回 { lesson, saved }；数据不合法返回 null
   * saved=false 表示只存在内存里，刷新会丢失
   */
  function addLesson(input) {
    load();

    var payload = input;
    if (input && input.studentId) {
      var student = null;
      for (var i = 0; i < cache.students.length; i += 1) {
        if (cache.students[i].id === input.studentId) {
          student = cache.students[i];
          break;
        }
      }
      // 用学生档案里的最新昵称作为快照
      if (student) {
        payload = Object.assign({}, input, { student: student.name });
      }
    }

    var lesson = normalizeLesson(payload, indexStudents(cache.students));
    if (!lesson) return null;

    cache.lessons.push(lesson);
    return { lesson: lesson, saved: persist() };
  }

  /**
   * 修改一条已有课程（原地更新，不会新增记录）
   * 成功返回 { lesson, saved }；找不到或数据不合法返回 null
   */
  function updateLesson(id, input) {
    load();

    var index = -1;
    for (var i = 0; i < cache.lessons.length; i += 1) {
      if (cache.lessons[i].id === id) {
        index = i;
        break;
      }
    }
    if (index === -1) return null;

    var existing = cache.lessons[index];
    var payload = Object.assign({}, existing, input);

    // 如果改到了另一位学生，用学生档案里的最新昵称作为快照
    if (payload.studentId) {
      for (var j = 0; j < cache.students.length; j += 1) {
        if (cache.students[j].id === payload.studentId) {
          payload.student = cache.students[j].name;
          break;
        }
      }
    }

    var normalized = normalizeLesson(payload, indexStudents(cache.students));
    if (!normalized) return null;

    // id 和创建时间保持不变，避免编辑后被当成新记录
    normalized.id = existing.id;
    normalized.createdAt = existing.createdAt;

    cache.lessons[index] = normalized;
    return { lesson: normalized, saved: persist() };
  }

  /** 修改收款状态；paid 传 true 表示已收款，false 表示待收款 */
  function setLessonPaid(id, paid) {
    load();

    for (var i = 0; i < cache.lessons.length; i += 1) {
      if (cache.lessons[i].id === id) {
        cache.lessons[i].paid = paid === true;
        return { lesson: cache.lessons[i], saved: persist() };
      }
    }

    return null;
  }

  function removeLesson(id) {
    load();
    var before = cache.lessons.length;
    cache.lessons = cache.lessons.filter(function (lesson) {
      return lesson.id !== id;
    });

    if (cache.lessons.length === before) {
      return { removed: false, saved: true };
    }
    return { removed: true, saved: persist() };
  }

  /* ---------------- 学生 ---------------- */

  function getStudents() {
    return load().students.slice();
  }

  /** 新增学生，返回 { student, saved }；数据不合法返回 null */
  function addStudent(input) {
    var student = normalizeStudent(input);
    if (!student) return null;

    load();
    cache.students.push(student);
    return { student: student, saved: persist() };
  }

  /** 修改学生，返回 { student, saved }；找不到或数据不合法返回 null */
  function updateStudent(id, input) {
    load();

    var index = -1;
    for (var i = 0; i < cache.students.length; i += 1) {
      if (cache.students[i].id === id) {
        index = i;
        break;
      }
    }
    if (index === -1) return null;

    var normalized = normalizeStudent(input);
    if (!normalized) return null;

    var existing = cache.students[index];
    var updated = {
      id: existing.id,
      name: normalized.name,
      grade: normalized.grade,
      subject: normalized.subject,
      rate: normalized.rate,
      createdAt: existing.createdAt
    };

    cache.students[index] = updated;

    // 改名时同步刷新课程里的昵称快照，这样以后删除学生也不会突然变回旧名字
    if (existing.name !== updated.name) {
      for (var j = 0; j < cache.lessons.length; j += 1) {
        if (cache.lessons[j].studentId === existing.id) {
          cache.lessons[j].student = updated.name;
        }
      }
    }

    return { student: updated, saved: persist() };
  }

  /**
   * 删除学生。注意：不会删除任何课程记录。
   * 历史课程依靠 student 昵称快照继续显示和统计。
   */
  function removeStudent(id) {
    load();
    var before = cache.students.length;
    cache.students = cache.students.filter(function (student) {
      return student.id !== id;
    });

    if (cache.students.length === before) {
      return { removed: false, saved: true };
    }
    return { removed: true, saved: persist() };
  }

  /* ---------------- 备份与恢复 ---------------- */

  function backupError(message) {
    return { ok: false, error: message };
  }

  /**
   * 生成备份对象。
   * 返回的是全新对象，不会修改 cache，也不会修改任何现有记录。
   * 备份里的 income 只是导出时计算出来的展示字段，内部数据并不会新增该字段。
   */
  function createBackup() {
    var store = load();

    var students = store.students.map(function (student) {
      return {
        id: student.id,
        name: student.name,
        grade: student.grade,
        subject: student.subject,
        rate: student.rate,
        createdAt: student.createdAt
      };
    });

    var lessons = store.lessons.map(function (lesson) {
      return {
        id: lesson.id,
        studentId: lesson.studentId,
        student: lesson.student,
        date: lesson.date,
        duration: lesson.duration,
        rate: lesson.rate,
        paid: lesson.paid === true,
        income: Calc.lessonIncome(lesson),
        createdAt: lesson.createdAt
      };
    });

    return {
      app: BACKUP_APP,
      backupVersion: BACKUP_VERSION,
      dataVersion: VERSION,
      exportedAt: new Date().toISOString(),
      counts: {
        students: students.length,
        lessons: lessons.length
      },
      students: students,
      lessons: lessons
    };
  }

  /**
   * 校验备份文件。
   * 只有全部记录都通过校验才返回 ok:true；任何一条有问题都不会修改当前数据。
   * 成功时返回 { ok:true, backup:{...}, store:{...} }。
   */
  function validateBackup(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return backupError('备份文件内容不是有效的 JSON 对象。');
    }

    if (raw.app !== BACKUP_APP) {
      return backupError('这不是 TutorTrack 的备份文件（缺少 app 标记）。');
    }

    var backupVersion = Number(raw.backupVersion);
    if (!Number.isFinite(backupVersion) || backupVersion < 1) {
      return backupError('备份文件缺少有效的 backupVersion。');
    }
    if (backupVersion > BACKUP_VERSION) {
      return backupError(
        '备份文件版本较新（v' + backupVersion + '），当前应用最高支持 v' + BACKUP_VERSION + '。'
      );
    }

    var dataVersion = Number(raw.dataVersion);
    if (!Number.isFinite(dataVersion) || dataVersion < 1) {
      return backupError('备份文件缺少有效的 dataVersion。');
    }
    if (dataVersion > VERSION) {
      return backupError(
        '备份数据版本较新（v' + dataVersion + '），当前应用最高支持 v' + VERSION + '。'
      );
    }

    if (!Array.isArray(raw.students) || !Array.isArray(raw.lessons)) {
      return backupError('备份文件缺少 students 或 lessons 数组。');
    }

    /* 1. 校验学生 */
    var students = [];
    var studentIds = {};

    for (var i = 0; i < raw.students.length; i += 1) {
      var item = raw.students[i];
      var label = '第 ' + (i + 1) + ' 名学生';

      if (!item || typeof item !== 'object') {
        return backupError(label + '格式不正确。');
      }
      if (typeof item.id !== 'string' || !item.id.trim()) {
        return backupError(label + '缺少 id。');
      }
      if (studentIds[item.id]) {
        return backupError('学生 id 重复：' + item.id);
      }

      var name = cleanText(item.name, 20);
      var rate = Number(item.rate);
      if (!name) {
        return backupError(label + '缺少昵称。');
      }
      if (!Number.isFinite(rate) || rate < 0) {
        return backupError(label + '的时薪不正确。');
      }

      studentIds[item.id] = true;
      students.push({
        id: item.id,
        name: name,
        grade: cleanText(item.grade, 20),
        subject: cleanText(item.subject, 20),
        rate: rate,
        createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now()
      });
    }

    /* 2. 校验课程；允许学生已被删除，但课程里必须保留昵称快照 */
    var byId = indexStudents(students);
    var lessons = [];
    var lessonIds = {};

    for (var j = 0; j < raw.lessons.length; j += 1) {
      var rawLesson = raw.lessons[j];
      var lessonLabel = '第 ' + (j + 1) + ' 条课程记录';

      if (!rawLesson || typeof rawLesson !== 'object') {
        return backupError(lessonLabel + '格式不正确。');
      }
      if (typeof rawLesson.id !== 'string' || !rawLesson.id.trim()) {
        return backupError(lessonLabel + '缺少 id。');
      }
      if (lessonIds[rawLesson.id]) {
        return backupError('课程记录 id 重复：' + rawLesson.id);
      }
      if (typeof rawLesson.studentId !== 'string' || !rawLesson.studentId) {
        return backupError(lessonLabel + '缺少 studentId。');
      }

      var snapshot = cleanText(rawLesson.student, 20);
      if (!snapshot && byId[rawLesson.studentId]) {
        snapshot = byId[rawLesson.studentId].name;
      }
      if (!snapshot) {
        return backupError(lessonLabel + '缺少学生昵称。');
      }
      if (!Calc.isValidDateString(rawLesson.date)) {
        return backupError(lessonLabel + '的上课日期不正确。');
      }

      var duration = Number(rawLesson.duration);
      if (!Number.isFinite(duration) || duration <= 0 || Math.round(duration) !== duration) {
        return backupError(lessonLabel + '的时长必须是大于 0 的整数分钟。');
      }

      var lessonRate = Number(rawLesson.rate);
      if (!Number.isFinite(lessonRate) || lessonRate < 0) {
        return backupError(lessonLabel + '的课时费不正确。');
      }
      // 兼容旧备份：缺少 paid 字段时按待收款处理
      if (rawLesson.paid !== undefined && typeof rawLesson.paid !== 'boolean') {
        return backupError(lessonLabel + '的收款状态不正确。');
      }

      lessonIds[rawLesson.id] = true;
      lessons.push({
        id: rawLesson.id,
        studentId: rawLesson.studentId,
        student: snapshot,
        date: rawLesson.date,
        duration: duration,
        rate: lessonRate,
        paid: rawLesson.paid === true,
        createdAt: Number.isFinite(Number(rawLesson.createdAt))
          ? Number(rawLesson.createdAt)
          : Date.now()
      });
    }

    return {
      ok: true,
      backup: {
        exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
        dataVersion: dataVersion,
        counts: { students: students.length, lessons: lessons.length }
      },
      store: { version: VERSION, students: students, lessons: lessons }
    };
  }

  /**
   * 用备份替换当前数据。
   * 先完整校验，再写入 localStorage，最后才替换内存缓存；
   * 写入失败时当前缓存和已保存的数据都保持不变。
   */
  function restoreBackup(raw) {
    var validation = validateBackup(raw);
    if (!validation.ok) return validation;

    available = detect();
    if (!available) {
      lastError = '浏览器本地存储不可用，无法恢复备份。';
      return backupError(lastError);
    }

    var previousRaw = null;
    try {
      previousRaw = global.localStorage.getItem(KEY);
    } catch (error) {
      available = false;
      lastError = '读取当前数据失败，未执行恢复。';
      return backupError(lastError);
    }

    // 恢复前尽力留一份快照，万一后续操作出错还能手动找回
    if (previousRaw) {
      try {
        global.localStorage.setItem(KEY + ':pre-restore:' + Date.now(), previousRaw);
      } catch (error) {
        /* 快照失败不阻止恢复 */
      }
    }

    var serialized;
    try {
      serialized = JSON.stringify(validation.store);
    } catch (error) {
      return backupError('备份数据处理失败，当前数据未改变。');
    }

    try {
      global.localStorage.setItem(KEY, serialized);
    } catch (error) {
      // 再尝试把原数据写回，确保不会留下半截数据
      try {
        if (previousRaw !== null) global.localStorage.setItem(KEY, previousRaw);
      } catch (rollbackError) {
        /* 忽略回滚失败，至少内存缓存没有被替换 */
      }
      lastError = '写入本地存储失败，当前数据未改变。';
      return backupError(lastError);
    }

    cache = validation.store;
    loaded = true;
    lastError = '';

    return {
      ok: true,
      counts: validation.backup.counts,
      exportedAt: validation.backup.exportedAt
    };
  }

  function isPersistent() {
    load();
    return available;
  }

  function getLastError() {
    return lastError;
  }

  global.TTStorage = {
    KEY: KEY,
    VERSION: VERSION,
    BACKUP_VERSION: BACKUP_VERSION,
    load: load,
    getLessons: getLessons,
    addLesson: addLesson,
    updateLesson: updateLesson,
    setLessonPaid: setLessonPaid,
    removeLesson: removeLesson,
    getStudents: getStudents,
    addStudent: addStudent,
    updateStudent: updateStudent,
    removeStudent: removeStudent,
    createBackup: createBackup,
    validateBackup: validateBackup,
    restoreBackup: restoreBackup,
    isPersistent: isPersistent,
    getLastError: getLastError
  };
})(window);
