/* ============================================================
   storage.js —— 本地存储模块
   只负责“把数据安全地存进 localStorage / 取出来”，不做计算、不碰页面。

   存储键仍然是 tutortrack:v1（为了兼容第一版数据，不换键）。
   内部数据结构升级到 version 4：
     { version: 4, schemaVersion: 4, students: [...], lessons: [...] }
   所有正式金额字段使用整数分（hourlyRateCents / feeCents）。
   读取旧数据时会自动迁移：
     - 根据课程里的昵称生成学生档案（v1 → v2）
     - 旧课程没有 paid 字段时补成 false（待收款，v2 → v3）
     - 元金额转换为整数分（v3 → v4）
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'tutortrack:v1';
  // v4：所有持久化金额改为整数分（hourlyRateCents / feeCents）
  var SCHEMA_VERSION = 4;
  var VERSION = SCHEMA_VERSION;
  /** 新数据的业务上限；历史记录在计费字段未变化时另行豁免 */
  var MAX_NEW_LESSON_DURATION = 1440;
  var MAX_NEW_HOURLY_RATE_CENTS = 1000000;
  var MAX_NEW_FEE_CENTS = 24000000;

  // 备份文件格式版本（与内部数据结构版本分开，方便以后单独升级）
  var BACKUP_APP = 'TutorTrack';
  var BACKUP_VERSION = 2;
  var BACKUP_AMOUNT_UNIT = 'cent';
  /** 自动快照保留策略：仅作用于 pre-restore / broken，pre-migrate 永久排除 */
  var SNAPSHOT_LIMITS = {
    preRestoreCount: 5,
    brokenCount: 3,
    totalBytes: 2 * 1024 * 1024
  };
  var SNAPSHOT_TYPES = [
    { name: 'preRestore', prefix: KEY + ':pre-restore:', maxCount: SNAPSHOT_LIMITS.preRestoreCount },
    { name: 'broken', prefix: KEY + ':broken:', maxCount: SNAPSHOT_LIMITS.brokenCount }
  ];

  var cache = { version: VERSION, students: [], lessons: [] };
  var loaded = false;
  var readAvailable = false;
  var writeAvailable = false;
  var readError = null;
  var writeError = null;
  var writeBlocked = false;
  var lastError = null;
  var revision = 0;
  var lastRaw = null;
  var migrationReport = null;
  var TAB_ID = createId('tab');
  var LOCK_NAME = 'tutortrack:v1:write';

  var TOP_FIELDS = [
    'version', 'schemaVersion', 'revision', 'updatedAt', 'writerId',
    'students', 'lessons'
  ];
  var STUDENT_FIELDS = [
    'id', 'name', 'grade', 'subject', 'hourlyRateCents', 'createdAt'
  ];
  var LESSON_FIELDS = [
    'id', 'studentId', 'student', 'date', 'duration',
    'hourlyRateCents', 'feeCents', 'paid', 'createdAt'
  ];
  var LEGACY_STUDENT_FIELDS = ['id', 'name', 'grade', 'subject', 'rate', 'createdAt'];
  var LEGACY_LESSON_FIELDS = [
    'id', 'studentId', 'student', 'date', 'duration', 'rate', 'paid', 'createdAt'
  ];

  function emptyStore() {
    return { version: VERSION, students: [], lessons: [] };
  }

  /** 只检测写入能力；读取能力由 load() 实际读取 KEY 决定。 */
  function detectWrite() {
    var storage;
    var probe = '__tutortrack_write_probe__:' + TAB_ID;

    try {
      storage = global.localStorage;
    } catch (error) {
      return {
        ok: false,
        code: 'STORAGE_UNAVAILABLE',
        key: 'storage.writeError.unavailable'
      };
    }

    try {
      storage.setItem(probe, '1');
      if (storage.getItem(probe) !== '1') {
        throw new Error('write probe readback mismatch');
      }
      storage.removeItem(probe);
      if (storage.getItem(probe) !== null) {
        throw new Error('write probe cleanup failed');
      }
      return { ok: true, code: null, key: null };
    } catch (error) {
      try {
        storage.removeItem(probe);
      } catch (cleanupError) {
        /* 临时 key 清不掉也不能影响正式数据 */
      }
      var code = classifyStorageError(error);
      return {
        ok: false,
        code: code,
        key: WRITE_ERROR_KEYS[code] || 'storage.writeError.failed'
      };
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

  /** 正式金额必须是整数分，且不能超过防御上限 */
  function isRateCents(value) {
    return Calc.isIntegerAmount(value) &&
      value >= 0 &&
      value <= Calc.MAX_RATE_CENTS;
  }

  /** 每节课费用：整数分，且必须是安全整数 */
  function isFeeCents(value) {
    return Calc.isIntegerAmount(value) &&
      value >= 0 &&
      Number.isSafeInteger(value);
  }

  /**
   * v4 费用一致性：费用必须是合法整数分，并与当前计价字段足够接近。
   * 容差仅用于兼容历史时薪按分舍入造成的差异，不用于放宽字段类型。
   */
  function isFeeConsistent(hourlyRateCents, duration, feeCents) {
    if (!isFeeCents(feeCents)) return false;

    var calculated = Calc.calculateLessonFeeCents(hourlyRateCents, duration);
    if (!calculated.ok) return false;

    var tolerance = Math.ceil(duration / 120) + 1;
    return Math.abs(feeCents - calculated.cents) <= tolerance;
  }

  function isNewRateWithinBounds(value) {
    return isRateCents(value) && value <= MAX_NEW_HOURLY_RATE_CENTS;
  }

  function isNewDurationWithinBounds(value) {
    return Calc.isIntegerAmount(value) &&
      value >= 1 &&
      value <= MAX_NEW_LESSON_DURATION;
  }

  function isNewFeeWithinBounds(value) {
    return isFeeCents(value) && value <= MAX_NEW_FEE_CENTS;
  }

  function indexRecordsById(list) {
    var map = Object.create(null);
    for (var i = 0; i < list.length; i += 1) {
      map[list[i].id] = list[i];
    }
    return map;
  }

  function readRevision(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 0;
    var value = Number(raw.revision);
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }

  /**
   * localStorage 内部外层增加 revision / updatedAt / writerId。
   * 备份文件仍然只导出 students / lessons，不受这些内部字段影响。
   */
  function serializeStore(store, nextRevision) {
    return JSON.stringify({
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      revision: nextRevision,
      updatedAt: Date.now(),
      writerId: TAB_ID,
      students: store.students,
      lessons: store.lessons
    });
  }

  /** 把一段当前版本 localStorage 内容应用到内存缓存 */
  function applyRaw(raw) {
    if (raw === null) {
      cache = emptyStore();
      revision = 0;
      lastRaw = null;
      loaded = true;
      readAvailable = true;
      readError = null;
      writeBlocked = false;
      lastError = null;
      migrationReport = {
        ok: true,
        migrated: false,
        fromVersion: null,
        toVersion: SCHEMA_VERSION,
        snapshotKey: null,
        counts: null
      };
      return { ok: true, store: cache, revision: 0, counts: null };
    }

    var result = readStore(raw, false);
    if (!result.ok) {
      var error = new Error('storage migration/read rejected');
      error.migrationResult = result;
      throw error;
    }

    cache = result.store;
    revision = result.revision;
    lastRaw = raw;
    loaded = true;
    readAvailable = true;
    readError = null;
    writeBlocked = false;
    lastError = null;
    migrationReport = {
      ok: true,
      migrated: false,
      fromVersion: result.fromVersion,
      toVersion: SCHEMA_VERSION,
      snapshotKey: null,
      counts: result.counts,
      financial: result.financial
    };
    return result;
  }

  /** 供 storage 事件使用：重新读取 localStorage，不主动写回 */
  function reload() {
    if (!loaded) {
      load();
      return true;
    }

    var raw;
    try {
      raw = global.localStorage.getItem(KEY);
      readAvailable = true;
      readError = null;
    } catch (error) {
      readAvailable = false;
      readError = 'storage.error.readFailed';
      setLastError('storage.error.readFailed');
      return false;
    }

    if (raw === lastRaw) return false;

    try {
      applyRaw(raw);
      return true;
    } catch (error) {
      writeBlocked = true;
      var result = error.migrationResult;
      lastError = {
        key: result && result.code === 'corruptJson'
          ? 'storage.error.corrupt'
          : 'storage.error.migrationFailed',
        params: null
      };
      migrationReport = {
        ok: false,
        code: result ? result.code : 'readFailed',
        detail: result ? result.detail : null,
        snapshotKey: null,
        rolledBack: false
      };
      return false;
    }
  }

  /**
   * 跨标签页写锁。支持的浏览器使用 Web Locks，保证同一时间只有一个标签页写入；
   * 不支持时退化为 Promise 队列，只能依赖 revision 做尽力而为的冲突检测。
   */
  function withWriteLock(callback) {
    var locks = global.navigator && global.navigator.locks;

    if (locks && typeof locks.request === 'function') {
      var started = false;
      try {
        return locks.request(LOCK_NAME, { mode: 'exclusive' }, function () {
          started = true;
          return callback();
        }).catch(function (error) {
          if (!started) return callback();
          throw error;
        });
      } catch (error) {
        return Promise.resolve().then(callback);
      }
    }

    return Promise.resolve().then(callback);
  }

  var WRITE_ERROR_KEYS = {
    STORAGE_QUOTA_EXCEEDED: 'storage.writeError.quota',
    STORAGE_UNAVAILABLE: 'storage.writeError.unavailable',
    STORAGE_WRITE_FAILED: 'storage.writeError.failed',
    REVISION_CONFLICT: 'storage.writeError.conflict',
    VALIDATION_FAILED: 'storage.writeError.validation',
    WRITE_BLOCKED: 'storage.writeError.blocked',
    SERIALIZATION_FAILED: 'storage.writeError.serialization',
    NOT_FOUND: 'storage.writeError.notFound'
  };

  function writeFailure(code, params) {
    return {
      ok: false,
      saved: false,
      error: {
        code: code,
        key: WRITE_ERROR_KEYS[code] || WRITE_ERROR_KEYS.STORAGE_WRITE_FAILED,
        params: params || null
      }
    };
  }

  function classifyStorageError(error) {
    if (
      error &&
      (error.name === 'QuotaExceededError' ||
        error.code === 22 ||
        error.code === 1014)
    ) {
      return 'STORAGE_QUOTA_EXCEEDED';
    }
    return 'STORAGE_WRITE_FAILED';
  }

  function cloneStore(store) {
    return JSON.parse(JSON.stringify({
      version: VERSION,
      students: store.students,
      lessons: store.lessons
    }));
  }

  function findTargetRecord(store, target) {
    if (!store || !target) return null;
    var list = target.type === 'student' ? store.students : store.lessons;
    for (var i = 0; i < list.length; i += 1) {
      if (list[i].id === target.id) return list[i];
    }
    return null;
  }

  function targetFingerprint(record, type) {
    if (!record) return '';
    if (type === 'student') {
      return JSON.stringify([
        record.id,
        record.name,
        record.grade,
        record.subject,
        record.hourlyRateCents,
        record.createdAt
      ]);
    }
    return JSON.stringify([
      record.id,
      record.studentId,
      record.student,
      record.date,
      record.duration,
      record.hourlyRateCents,
      record.feeCents,
      record.paid,
      record.createdAt
    ]);
  }

  /** 读取最新基准数据；目标记录被其他标签页改动时返回 REVISION_CONFLICT */
  function readBaseForWrite(target) {
    var raw;
    try {
      raw = global.localStorage.getItem(KEY);
      readAvailable = true;
      readError = null;
    } catch (error) {
      readAvailable = false;
      readError = 'storage.error.readFailed';
      return writeFailure('STORAGE_UNAVAILABLE');
    }

    var baseStore;
    var baseRevision;

    if (raw === null) {
      baseStore = emptyStore();
      baseRevision = revision;
    } else if (raw === lastRaw) {
      baseStore = cache;
      baseRevision = revision;
    } else {
      var latest = readStore(raw, false);
      if (!latest.ok) {
        if (latest.code === 'invalidSchema' || latest.code === 'futureSchema') {
          return writeFailure('REVISION_CONFLICT');
        }
        writeBlocked = true;
        setLastError('storage.error.migrationFailed');
        return writeFailure('STORAGE_WRITE_FAILED');
      }
      baseStore = latest.store;
      baseRevision = Math.max(revision, latest.revision);
    }

    if (target) {
      var oldRecord = findTargetRecord(cache, target);
      if (!oldRecord) return writeFailure('NOT_FOUND');

      if (raw !== lastRaw) {
        var latestRecord = findTargetRecord(baseStore, target);
        if (!latestRecord) return writeFailure('REVISION_CONFLICT');
        if (
          targetFingerprint(oldRecord, target.type) !==
          targetFingerprint(latestRecord, target.type)
        ) {
          return writeFailure('REVISION_CONFLICT');
        }
      }
    }

    return {
      ok: true,
      store: baseStore,
      revision: baseRevision,
      raw: raw
    };
  }

  /**
   * 校验候选数据。baseStore 用于历史兼容：
   * 只有 base 中已存在且计价字段完全未变化的记录，才允许保留旧的超限数值。
   */
  function validateCandidateStore(store, baseStore) {
    if (!store || !Array.isArray(store.students) || !Array.isArray(store.lessons)) {
      return false;
    }

    var baseStudents = baseStore && Array.isArray(baseStore.students)
      ? baseStore.students
      : [];
    var baseLessons = baseStore && Array.isArray(baseStore.lessons)
      ? baseStore.lessons
      : [];
    var baseStudentsById = indexRecordsById(baseStudents);
    var baseLessonsById = indexRecordsById(baseLessons);

    var studentIds = {};
    var lessonIds = {};
    var i;

    for (i = 0; i < store.students.length; i += 1) {
      var student = store.students[i];
      if (!student || typeof student.id !== 'string' || !student.id) return false;
      if (studentIds[student.id]) return false;
      if (typeof student.name !== 'string' || !student.name) return false;
      if (!isRateCents(student.hourlyRateCents)) return false;

      var baseStudent = baseStudentsById[student.id] || null;
      var studentPricingChanged = !baseStudent ||
        student.hourlyRateCents !== baseStudent.hourlyRateCents;
      if (studentPricingChanged && !isNewRateWithinBounds(student.hourlyRateCents)) {
        return false;
      }

      studentIds[student.id] = true;
    }

    for (i = 0; i < store.lessons.length; i += 1) {
      var lesson = store.lessons[i];
      if (!lesson || typeof lesson.id !== 'string' || !lesson.id) return false;
      if (lessonIds[lesson.id]) return false;
      if (typeof lesson.studentId !== 'string' || !lesson.studentId) return false;
      if (typeof lesson.student !== 'string' || !lesson.student) return false;
      if (!Calc.isValidDateString(lesson.date)) return false;
      if (!Calc.isIntegerAmount(lesson.duration) || lesson.duration <= 0) return false;
      if (!isRateCents(lesson.hourlyRateCents)) return false;
      if (!isFeeCents(lesson.feeCents)) return false;
      if (!isFeeConsistent(
        lesson.hourlyRateCents,
        lesson.duration,
        lesson.feeCents
      )) return false;
      if (typeof lesson.paid !== 'boolean') return false;

      var baseLesson = baseLessonsById[lesson.id] || null;
      var lessonPricingChanged = !baseLesson ||
        lesson.duration !== baseLesson.duration ||
        lesson.hourlyRateCents !== baseLesson.hourlyRateCents ||
        lesson.feeCents !== baseLesson.feeCents;

      if (lessonPricingChanged &&
        (!isNewDurationWithinBounds(lesson.duration) ||
          !isNewRateWithinBounds(lesson.hourlyRateCents) ||
          !isNewFeeWithinBounds(lesson.feeCents))) {
        return false;
      }

      lessonIds[lesson.id] = true;
    }

    return true;
  }

  /**
   * 统一写事务：候选数据写入成功并回读验证后，才提交 cache/revision。
   * target 存在时，如果目标记录在最新数据中已被改动，返回 REVISION_CONFLICT。
   */
  function runWrite(target, mutate) {
    return withWriteLock(function () {
      load();

      if (!readAvailable) return writeFailure('STORAGE_UNAVAILABLE');
      if (!writeAvailable || writeBlocked) return writeFailure('WRITE_BLOCKED');

      var base = readBaseForWrite(target);
      if (!base.ok) return base;

      var candidate;
      var outcome;
      try {
        candidate = cloneStore(base.store);
      } catch (error) {
        return writeFailure('SERIALIZATION_FAILED');
      }

      try {
        outcome = mutate(candidate, base.revision);
      } catch (error) {
        return writeFailure('VALIDATION_FAILED');
      }

      if (!outcome || outcome.ok === false) {
        return outcome || writeFailure('VALIDATION_FAILED');
      }

      var candidateValid;
      try {
        candidateValid = validateCandidateStore(candidate, base.store);
      } catch (error) {
        candidateValid = false;
      }
      if (!candidateValid) {
        return writeFailure('VALIDATION_FAILED');
      }

      var nextRevision = base.revision + 1;
      var serialized;
      try {
        serialized = serializeStore(candidate, nextRevision);
      } catch (error) {
        return writeFailure('SERIALIZATION_FAILED');
      }

      // setItem 前再次确认基准未变，避免把另一个标签页刚写入的数据覆盖。
      var latestRaw;
      try {
        latestRaw = global.localStorage.getItem(KEY);
        readAvailable = true;
        readError = null;
      } catch (error) {
        readAvailable = false;
        readError = 'storage.error.readFailed';
        return writeFailure('STORAGE_UNAVAILABLE');
      }
      if (latestRaw !== base.raw) {
        return writeFailure('REVISION_CONFLICT');
      }

      try {
        global.localStorage.setItem(KEY, serialized);
      } catch (error) {
        var writeCode = classifyStorageError(error);
        writeAvailable = false;
        writeError = WRITE_ERROR_KEYS[writeCode] || 'storage.writeError.failed';
        return writeFailure(writeCode);
      }

      var readBack;
      try {
        readBack = global.localStorage.getItem(KEY);
        readAvailable = true;
        readError = null;
      } catch (error) {
        readAvailable = false;
        readError = 'storage.error.readFailed';
        writeAvailable = false;
        writeError = 'storage.writeError.failed';
        return writeFailure('STORAGE_WRITE_FAILED');
      }
      if (readBack !== serialized) {
        return writeFailure('REVISION_CONFLICT');
      }

      // 只有到这里才提交正式内存状态。
      cache = candidate;
      revision = nextRevision;
      lastRaw = serialized;
      readAvailable = true;
      writeAvailable = true;
      readError = null;
      writeError = null;
      lastError = null;

      outcome.result.ok = true;
      outcome.result.saved = true;
      return outcome.result;
    });
  }


  /**
   * 把一条原始学生数据清洗成当前格式（整数分）。
   * version < 4 时读取旧的 rate（元）；version >= 4 时只接受 hourlyRateCents。
   */
  function normalizeStudentRecord(raw, version) {
    if (!raw || typeof raw !== 'object') return null;

    var name = cleanText(raw.name, 20);
    if (!name) return null;

    var rateCents;
    if (version >= 4) {
      rateCents = isRateCents(raw.hourlyRateCents) ? raw.hourlyRateCents : null;
    } else {
      rateCents = Calc.legacyYuanToCents(raw.rate);
      if (rateCents !== null && rateCents > Calc.MAX_RATE_CENTS) rateCents = null;
    }
    if (rateCents === null) return null;

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId('s'),
      name: name,
      grade: cleanText(raw.grade, 20),
      subject: cleanText(raw.subject, 20),
      hourlyRateCents: rateCents,
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now()
    };
  }

  /**
   * 把一条原始课程数据清洗成当前格式（整数分）。
   * student 是“昵称快照”：即使学生以后改名或被删除，历史记录仍然有名字可显示。
   * 旧版数据用旧公式算出 feeCents，保留历史金额；新版直接读取已经持久化的 feeCents。
   */
  function normalizeLessonRecord(raw, version, studentsById) {
    if (!raw || typeof raw !== 'object') return null;

    var studentId = typeof raw.studentId === 'string' ? raw.studentId : '';
    var student = typeof raw.student === 'string' ? raw.student.trim() : '';
    var date = typeof raw.date === 'string' ? raw.date : '';
    var duration = Math.round(Number(raw.duration));

    // 新数据只有 studentId 时，从学生档案补出昵称快照
    if (!student && studentId && studentsById && studentsById[studentId]) {
      student = studentsById[studentId].name;
    }

    if (!student || !Calc.isValidDateString(date)) return null;
    if (!Number.isFinite(duration) || duration <= 0) return null;

    var rateCents;
    var feeCents;
    if (version >= 4) {
      rateCents = isRateCents(raw.hourlyRateCents) ? raw.hourlyRateCents : null;
      feeCents = isFeeCents(raw.feeCents) ? raw.feeCents : null;
    } else {
      rateCents = Calc.legacyYuanToCents(raw.rate);
      if (rateCents !== null && rateCents > Calc.MAX_RATE_CENTS) rateCents = null;
      var legacyFee = Calc.calculateLegacyLessonFeeCents(raw.rate, duration);
      feeCents = legacyFee.ok ? legacyFee.cents : null;
    }
    if (rateCents === null || feeCents === null) return null;

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId('l'),
      studentId: studentId,
      student: student.slice(0, 20),
      date: date,
      duration: duration,
      hourlyRateCents: rateCents,
      feeCents: feeCents,
      // 旧数据没有 paid 字段 → 默认待收款
      paid: raw.paid === true,
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now()
    };
  }

  /** 新增/编辑时构造学生记录：只接受整数分 */
  function buildStudentRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var name = cleanText(raw.name, 20);
    if (!name) return null;
    if (!isRateCents(raw.hourlyRateCents)) return null;

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId('s'),
      name: name,
      grade: cleanText(raw.grade, 20),
      subject: cleanText(raw.subject, 20),
      hourlyRateCents: raw.hourlyRateCents,
      createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now()
    };
  }

  /** 新增/编辑时构造课程记录：整数分，并根据当前规则重新计算每节课费用 */
  function buildLessonRecord(raw, studentsById) {
    if (!raw || typeof raw !== 'object') return null;

    var studentId = typeof raw.studentId === 'string' ? raw.studentId : '';
    var student = typeof raw.student === 'string' ? raw.student.trim() : '';
    var date = typeof raw.date === 'string' ? raw.date : '';
    var rawDuration = raw.duration;
    if (typeof rawDuration !== 'number' && typeof rawDuration !== 'string') return null;
    var duration = Number(rawDuration);

    if (!student && studentId && studentsById && studentsById[studentId]) {
      student = studentsById[studentId].name;
    }

    if (!student || !Calc.isValidDateString(date)) return null;
    if (!Calc.isIntegerAmount(duration) || duration <= 0) return null;
    if (!isRateCents(raw.hourlyRateCents)) return null;

    var fee = Calc.calculateLessonFeeCents(raw.hourlyRateCents, duration);
    if (!fee.ok) return null;

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId('l'),
      studentId: studentId,
      student: student.slice(0, 20),
      date: date,
      duration: duration,
      hourlyRateCents: raw.hourlyRateCents,
      feeCents: fee.cents,
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
   * 兼容四种输入：纯课程数组、v1 的 { version, lessons }、v2/v3 的完整结构、v4 当前结构
   * 返回 { store, migrated }，migrated 表示是否发生了数据结构升级
   */
  function normalizeStore(raw, version) {
    var rawStudents = [];
    var rawLessons = [];
    var migrated = false;

    if (Array.isArray(raw)) {
      rawLessons = raw;
      migrated = true;
    } else if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.students)) rawStudents = raw.students;
      if (Array.isArray(raw.lessons)) rawLessons = raw.lessons;
      if (version !== VERSION) migrated = true;
    } else {
      migrated = true;
    }

    // 1. 清洗学生
    var students = [];
    var seenIds = {};
    for (var i = 0; i < rawStudents.length; i += 1) {
      var student = normalizeStudentRecord(rawStudents[i], version);
      if (!student) continue;
      if (seenIds[student.id]) continue;
      seenIds[student.id] = true;
      students.push(student);
    }
    var byId = indexStudents(students);

    // 2. 清洗课程；旧课程没有 studentId，就按昵称补建学生
    var lessons = [];
    for (var j = 0; j < rawLessons.length; j += 1) {
      // 旧版缺少收款状态也视为需要迁移
      if (
        version < 3 &&
        (
          !rawLessons[j] ||
          typeof rawLessons[j] !== 'object' ||
          typeof rawLessons[j].paid !== 'boolean'
        )
      ) {
        migrated = true;
      }

      var lesson = normalizeLessonRecord(rawLessons[j], version, byId);
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
            hourlyRateCents: lesson.hourlyRateCents,
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

  /* ---------------- 安全迁移 ---------------- */

  function migrationFail(code, detail) {
    return { ok: false, code: code, detail: detail || null };
  }

  function firstUnknownField(obj, allowed) {
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i += 1) {
      if (allowed.indexOf(keys[i]) === -1) return keys[i];
    }
    return null;
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function detectSchemaVersion(raw) {
    if (Array.isArray(raw)) return 1;
    if (!isObject(raw)) return null;

    var hasSchema = raw.schemaVersion !== undefined && raw.schemaVersion !== null;
    var hasVersion = raw.version !== undefined && raw.version !== null;
    var schema = hasSchema ? Number(raw.schemaVersion) : NaN;
    var version = hasVersion ? Number(raw.version) : NaN;

    if (
      (hasSchema && (!Number.isFinite(schema) || Math.floor(schema) !== schema)) ||
      (hasVersion && (!Number.isFinite(version) || Math.floor(version) !== version))
    ) {
      return null;
    }

    if (
      hasSchema &&
      hasVersion &&
      Math.floor(schema) !== Math.floor(version)
    ) {
      return null;
    }

    var value = hasSchema ? schema : version;
    if (!Number.isFinite(value) || value < 1) return null;
    return Math.floor(value);
  }

  /** 迁移前后都使用这个快照核对课程数量、时长和金额（全部为整数分） */
  function financialSnapshot(lessons, version) {
    var list = Array.isArray(lessons) ? lessons : [];
    var count = 0;
    var minutes = 0;
    var totalCents = 0;
    var paidCents = 0;
    var unpaidCents = 0;

    for (var i = 0; i < list.length; i += 1) {
      var lesson = list[i];
      count += 1;
      minutes += Math.max(0, Math.round(Number(lesson.duration) || 0));
      var cents;
      if (version >= 4) {
        cents = Calc.lessonFeeCents(lesson);
      } else {
        var legacyFee = Calc.calculateLegacyLessonFeeCents(lesson.rate, lesson.duration);
        if (!legacyFee.ok) return null;
        cents = legacyFee.cents;
      }
      totalCents += cents;
      if (lesson.paid === true) paidCents += cents;
      else unpaidCents += cents;
    }

    return {
      count: count,
      minutes: minutes,
      totalCents: totalCents,
      paidCents: paidCents,
      unpaidCents: unpaidCents
    };
  }

  function optionalStringField(value, label) {
    if (value === undefined || value === null) return { ok: true, value: '' };
    if (typeof value !== 'string') {
      return migrationFail('invalidField', label);
    }
    if (value.length > 20) {
      return migrationFail('fieldTooLong', label);
    }
    return { ok: true, value: value };
  }

  /**
   * 在迁移前严格检查原始结构。
   * 这里不负责修复数据；无法确定的内容直接返回错误，避免静默丢失。
   */
  function validateRawShape(parsed, version) {
    var rawStudents = [];
    var rawLessons = [];
    var legacyAmounts = version < 4;
    var studentFields = legacyAmounts ? LEGACY_STUDENT_FIELDS : STUDENT_FIELDS;
    var lessonFields = legacyAmounts ? LEGACY_LESSON_FIELDS : LESSON_FIELDS;

    if (Array.isArray(parsed)) {
      if (version !== 1) return migrationFail('invalidVersion', 'array');
      rawLessons = parsed;
    } else {
      var topUnknown = firstUnknownField(parsed, TOP_FIELDS);
      if (topUnknown) return migrationFail('unknownField', 'top.' + topUnknown);
      if (!Array.isArray(parsed.lessons)) {
        return migrationFail('missingField', 'lessons');
      }
      rawLessons = parsed.lessons;

      if (version === 1) {
        if (parsed.students !== undefined && !Array.isArray(parsed.students)) {
          return migrationFail('invalidField', 'students');
        }
        rawStudents = parsed.students || [];
      } else {
        if (!Array.isArray(parsed.students)) {
          return migrationFail('missingField', 'students');
        }
        rawStudents = parsed.students;
      }
    }

    var studentIds = {};
    var studentsById = {};
    var i;

    for (i = 0; i < rawStudents.length; i += 1) {
      var student = rawStudents[i];
      var studentLabel = 'students[' + i + ']';

      if (!isObject(student)) return migrationFail('invalidField', studentLabel);
      var studentUnknown = firstUnknownField(student, studentFields);
      if (studentUnknown) {
        return migrationFail('unknownField', studentLabel + '.' + studentUnknown);
      }

      var studentId = student.id;
      if (studentId !== undefined && studentId !== null && studentId !== '') {
        if (typeof studentId !== 'string' || !studentId.trim()) {
          return migrationFail('invalidField', studentLabel + '.id');
        }
        if (studentIds[studentId]) {
          return migrationFail('duplicateId', 'student:' + studentId);
        }
        studentIds[studentId] = true;
        studentsById[studentId] = student;
      } else if (version > 1) {
        return migrationFail('missingField', studentLabel + '.id');
      }

      if (typeof student.name !== 'string' || !student.name.trim()) {
        return migrationFail('missingField', studentLabel + '.name');
      }
      if (student.name.length > 20) {
        return migrationFail('fieldTooLong', studentLabel + '.name');
      }

      var grade = optionalStringField(student.grade, studentLabel + '.grade');
      if (!grade.ok) return grade;
      var subject = optionalStringField(student.subject, studentLabel + '.subject');
      if (!subject.ok) return subject;

      if (legacyAmounts) {
        if (student.rate === undefined || student.rate === null || student.rate === '') {
          return migrationFail('missingField', studentLabel + '.rate');
        }
        if (typeof student.rate !== 'number' && typeof student.rate !== 'string') {
          return migrationFail('invalidField', studentLabel + '.rate');
        }
        var studentRateCents = Calc.legacyYuanToCents(student.rate);
        if (studentRateCents === null || studentRateCents > Calc.MAX_RATE_CENTS) {
          return migrationFail('invalidField', studentLabel + '.rate');
        }
      } else if (!isRateCents(student.hourlyRateCents)) {
        return migrationFail(
          student.hourlyRateCents === undefined || student.hourlyRateCents === null
            ? 'missingField'
            : 'invalidField',
          studentLabel + '.hourlyRateCents'
        );
      }

      if (
        student.createdAt !== undefined &&
        student.createdAt !== null &&
        !Number.isFinite(Number(student.createdAt))
      ) {
        return migrationFail('invalidField', studentLabel + '.createdAt');
      }
      if (
        version >= 3 &&
        (student.createdAt === undefined || student.createdAt === null)
      ) {
        return migrationFail('missingField', studentLabel + '.createdAt');
      }
    }

    var lessonIds = {};

    for (i = 0; i < rawLessons.length; i += 1) {
      var lesson = rawLessons[i];
      var lessonLabel = 'lessons[' + i + ']';

      if (!isObject(lesson)) return migrationFail('invalidField', lessonLabel);
      var lessonUnknown = firstUnknownField(lesson, lessonFields);
      if (lessonUnknown) {
        return migrationFail('unknownField', lessonLabel + '.' + lessonUnknown);
      }

      var lessonId = lesson.id;
      if (lessonId !== undefined && lessonId !== null && lessonId !== '') {
        if (typeof lessonId !== 'string' || !lessonId.trim()) {
          return migrationFail('invalidField', lessonLabel + '.id');
        }
        if (lessonIds[lessonId]) {
          return migrationFail('duplicateId', 'lesson:' + lessonId);
        }
        lessonIds[lessonId] = true;
      } else if (version > 1) {
        return migrationFail('missingField', lessonLabel + '.id');
      }

      if (version > 1) {
        if (typeof lesson.studentId !== 'string' || !lesson.studentId.trim()) {
          return migrationFail('missingField', lessonLabel + '.studentId');
        }
      } else if (
        lesson.studentId !== undefined &&
        lesson.studentId !== null &&
        (typeof lesson.studentId !== 'string' || !lesson.studentId.trim())
      ) {
        return migrationFail('invalidField', lessonLabel + '.studentId');
      }

      var hasSnapshot = typeof lesson.student === 'string' && lesson.student.trim() !== '';
      if (
        lesson.student !== undefined &&
        lesson.student !== null &&
        typeof lesson.student !== 'string'
      ) {
        return migrationFail('invalidField', lessonLabel + '.student');
      }
      if (hasSnapshot && lesson.student.length > 20) {
        return migrationFail('fieldTooLong', lessonLabel + '.student');
      }
      if (!hasSnapshot) {
        if (version >= 3) {
          return migrationFail('missingField', lessonLabel + '.student');
        }
        if (!lesson.studentId || !studentsById[lesson.studentId]) {
          return migrationFail('missingField', lessonLabel + '.student');
        }
      }

      if (!Calc.isValidDateString(lesson.date)) {
        return migrationFail('invalidField', lessonLabel + '.date');
      }

      var duration = Number(lesson.duration);
      if (
        (typeof lesson.duration !== 'number' && typeof lesson.duration !== 'string') ||
        lesson.duration === '' ||
        !Number.isFinite(duration) ||
        duration <= 0 ||
        Math.round(duration) !== duration
      ) {
        return migrationFail('invalidField', lessonLabel + '.duration');
      }

      if (legacyAmounts) {
        if (lesson.rate === undefined || lesson.rate === null || lesson.rate === '') {
          return migrationFail('missingField', lessonLabel + '.rate');
        }
        if (typeof lesson.rate !== 'number' && typeof lesson.rate !== 'string') {
          return migrationFail('invalidField', lessonLabel + '.rate');
        }
        var lessonRateCents = Calc.legacyYuanToCents(lesson.rate);
        if (lessonRateCents === null || lessonRateCents > Calc.MAX_RATE_CENTS) {
          return migrationFail('invalidField', lessonLabel + '.rate');
        }
        var legacyFee = Calc.calculateLegacyLessonFeeCents(lesson.rate, duration);
        if (!legacyFee.ok) {
          return migrationFail('invalidField', lessonLabel + '.rate');
        }
      } else {
        if (!isRateCents(lesson.hourlyRateCents)) {
          return migrationFail(
            lesson.hourlyRateCents === undefined || lesson.hourlyRateCents === null
              ? 'missingField'
              : 'invalidField',
            lessonLabel + '.hourlyRateCents'
          );
        }
        if (!isFeeCents(lesson.feeCents)) {
          return migrationFail(
            lesson.feeCents === undefined || lesson.feeCents === null
              ? 'missingField'
              : 'invalidField',
            lessonLabel + '.feeCents'
          );
        }
        if (!isFeeConsistent(
          lesson.hourlyRateCents,
          duration,
          lesson.feeCents
        )) {
          return migrationFail('feeMismatch', lessonLabel + '.feeCents');
        }
      }

      if (version >= 3) {
        if (typeof lesson.paid !== 'boolean') {
          return migrationFail('missingField', lessonLabel + '.paid');
        }
      } else if (
        lesson.paid !== undefined &&
        lesson.paid !== null &&
        typeof lesson.paid !== 'boolean'
      ) {
        return migrationFail('invalidField', lessonLabel + '.paid');
      }

      if (
        lesson.createdAt !== undefined &&
        lesson.createdAt !== null &&
        !Number.isFinite(Number(lesson.createdAt))
      ) {
        return migrationFail('invalidField', lessonLabel + '.createdAt');
      }
      if (
        version >= 3 &&
        (lesson.createdAt === undefined || lesson.createdAt === null)
      ) {
        return migrationFail('missingField', lessonLabel + '.createdAt');
      }
    }

    return {
      ok: true,
      rawStudents: rawStudents,
      rawLessons: rawLessons
    };
  }

  function buildStore(parsed, version) {
    var shape = validateRawShape(parsed, version);
    if (!shape.ok) return shape;

    if (
      !Array.isArray(parsed) &&
      parsed.revision !== undefined &&
      parsed.revision !== null &&
      (!Number.isFinite(Number(parsed.revision)) ||
        Number(parsed.revision) < 0 ||
        Math.floor(Number(parsed.revision)) !== Number(parsed.revision))
    ) {
      return migrationFail('invalidRevision', 'revision');
    }

    var normalized = normalizeStore(parsed, version);
    var store = normalized.store;

    if (version === SCHEMA_VERSION && normalized.migrated) {
      return migrationFail('unexpectedNormalization', 'currentVersion');
    }

    if (store.lessons.length !== shape.rawLessons.length) {
      return migrationFail('lostRecords', 'lessons');
    }
    if (version > 1 && store.students.length !== shape.rawStudents.length) {
      return migrationFail('lostRecords', 'students');
    }
    if (version === 1 && store.students.length < shape.rawStudents.length) {
      return migrationFail('lostRecords', 'students');
    }

    var normalizedStudentsById = indexStudents(store.students);
    var normalizedLessonsById = {};
    var i;

    for (i = 0; i < store.students.length; i += 1) {
      var student = store.students[i];
      if (!student.id || normalizedStudentsById[student.id] !== student) {
        return migrationFail('duplicateId', 'student:' + (student.id || ''));
      }
    }

    for (i = 0; i < store.lessons.length; i += 1) {
      var lesson = store.lessons[i];
      if (normalizedLessonsById[lesson.id]) {
        return migrationFail('duplicateId', 'lesson:' + lesson.id);
      }
      normalizedLessonsById[lesson.id] = lesson;
    }

    for (i = 0; i < shape.rawStudents.length; i += 1) {
      var rawStudent = shape.rawStudents[i];
      if (typeof rawStudent.id !== 'string' || !rawStudent.id) continue;
      var actualStudent = normalizedStudentsById[rawStudent.id];
      if (!actualStudent) {
        return migrationFail('lostRecords', 'student:' + rawStudent.id);
      }
      var expectedStudentRate = version >= 4
        ? rawStudent.hourlyRateCents
        : Calc.legacyYuanToCents(rawStudent.rate);
      if (
        actualStudent.name !== String(rawStudent.name).trim() ||
        actualStudent.grade !== (rawStudent.grade === undefined || rawStudent.grade === null
          ? ''
          : String(rawStudent.grade).trim()) ||
        actualStudent.subject !== (rawStudent.subject === undefined || rawStudent.subject === null
          ? ''
          : String(rawStudent.subject).trim()) ||
        actualStudent.hourlyRateCents !== expectedStudentRate
      ) {
        return migrationFail('fieldChanged', 'student:' + rawStudent.id);
      }
    }

    for (i = 0; i < shape.rawLessons.length; i += 1) {
      var rawLesson = shape.rawLessons[i];
      if (typeof rawLesson.id !== 'string' || !rawLesson.id) continue;
      var actualLesson = normalizedLessonsById[rawLesson.id];
      if (!actualLesson) {
        return migrationFail('lostRecords', 'lesson:' + rawLesson.id);
      }
      var expectedLessonRate = version >= 4
        ? rawLesson.hourlyRateCents
        : Calc.legacyYuanToCents(rawLesson.rate);
      var expectedLessonFee;
      if (version >= 4) {
        expectedLessonFee = rawLesson.feeCents;
      } else {
        var expectedLegacyFee = Calc.calculateLegacyLessonFeeCents(
          rawLesson.rate,
          rawLesson.duration
        );
        if (!expectedLegacyFee.ok) {
          return migrationFail('invalidField', 'lesson:' + rawLesson.id + '.rate');
        }
        expectedLessonFee = expectedLegacyFee.cents;
      }
      if (
        actualLesson.date !== rawLesson.date ||
        actualLesson.duration !== Number(rawLesson.duration) ||
        actualLesson.hourlyRateCents !== expectedLessonRate ||
        actualLesson.feeCents !== expectedLessonFee ||
        actualLesson.paid !== (rawLesson.paid === true) ||
        (version > 1 && actualLesson.studentId !== rawLesson.studentId)
      ) {
        return migrationFail('fieldChanged', 'lesson:' + rawLesson.id);
      }
    }

    var before = financialSnapshot(shape.rawLessons, version);
    var after = financialSnapshot(store.lessons, SCHEMA_VERSION);
    if (!before || !after) {
      return migrationFail('invalidField', 'financial');
    }
    if (
      before.count !== after.count ||
      before.minutes !== after.minutes ||
      before.totalCents !== after.totalCents ||
      before.paidCents !== after.paidCents ||
      before.unpaidCents !== after.unpaidCents
    ) {
      return migrationFail('integrityMismatch', 'financial');
    }

    // 迁移后的最终 v4 课程也必须满足费用一致性；旧版本原始数据不直接套用此规则。
    for (i = 0; i < store.lessons.length; i += 1) {
      var finalLesson = store.lessons[i];
      if (!isFeeConsistent(
        finalLesson.hourlyRateCents,
        finalLesson.duration,
        finalLesson.feeCents
      )) {
        return migrationFail('feeMismatch', 'lesson:' + finalLesson.id + '.feeCents');
      }
    }

    return {
      ok: true,
      store: store,
      migrated: version !== SCHEMA_VERSION,
      fromVersion: version,
      revision: readRevision(parsed),
      counts: {
        studentsBefore: shape.rawStudents.length,
        studentsAfter: store.students.length,
        lessonsBefore: shape.rawLessons.length,
        lessonsAfter: store.lessons.length
      },
      financial: {
        before: before,
        after: after
      }
    };
  }

  function readStore(raw, allowMigration) {
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return migrationFail('corruptJson', 'JSON.parse');
    }

    var version = detectSchemaVersion(parsed);
    if (version === null) {
      return migrationFail('invalidSchema', 'missingOrInvalid');
    }
    if (version > SCHEMA_VERSION) {
      return migrationFail('futureSchema', { version: version, max: SCHEMA_VERSION });
    }
    if (!allowMigration && version !== SCHEMA_VERSION) {
      return migrationFail('invalidSchema', 'requiresMigration');
    }

    return buildStore(parsed, version);
  }

  function savePreMigrationSnapshot(raw, fromVersion) {
    var snapshotKey = KEY + ':pre-migrate:v' + fromVersion;
    try {
      global.localStorage.setItem(snapshotKey, raw);
      if (global.localStorage.getItem(snapshotKey) !== raw) {
        return null;
      }
      return snapshotKey;
    } catch (error) {
      return null;
    }
  }

  /** 损坏数据副本；不会覆盖同键旧副本，也不会删除正式 KEY */
  function saveBrokenCopy(raw) {
    var storage = getSnapshotStorage();
    if (!storage) return null;

    var brokenKey = KEY + ':broken:' + Date.now();
    try {
      if (storage.getItem(brokenKey) !== null) return null;
    } catch (error) {
      return null;
    }

    var incomingBytes = (brokenKey.length + raw.length) * 2;
    var room = ensureSnapshotRoom(incomingBytes);
    if (!room.ok) return null;

    try {
      storage.setItem(brokenKey, raw);
    } catch (error) {
      removeSnapshotQuietly(brokenKey);
      return null;
    }

    var readBack;
    try {
      readBack = storage.getItem(brokenKey);
    } catch (error) {
      removeSnapshotQuietly(brokenKey);
      return null;
    }
    if (readBack !== raw) {
      removeSnapshotQuietly(brokenKey);
      return null;
    }

    if (!pruneManagedSnapshots().ok) {
      removeSnapshotQuietly(brokenKey);
      return null;
    }

    return brokenKey;
  }

  function rollbackRaw(raw) {
    try {
      global.localStorage.setItem(KEY, raw);
      return global.localStorage.getItem(KEY) === raw;
    } catch (error) {
      return false;
    }
  }

  function failLoad(code, detail, snapshotKey, rolledBack) {
    var errorKey = code === 'corruptJson'
      ? 'storage.error.corrupt'
      : 'storage.error.migrationFailed';

    writeBlocked = true;
    lastError = { key: errorKey, params: null };
    migrationReport = {
      ok: false,
      code: code,
      detail: detail || null,
      snapshotKey: snapshotKey || null,
      rolledBack: Boolean(rolledBack),
      toVersion: SCHEMA_VERSION
    };
    cache = emptyStore();
    revision = 0;
    lastRaw = null;
    loaded = true;
    return cache;
  }

  /** 从 localStorage 读取。读取与写入能力分别判断；迁移失败时保留原始数据 */
  function load() {
    if (loaded) return cache;
    loaded = true;

    readAvailable = false;
    writeAvailable = false;
    readError = null;
    writeError = null;
    writeBlocked = false;
    lastError = null;
    migrationReport = null;

    var raw = null;
    try {
      raw = global.localStorage.getItem(KEY);
      readAvailable = true;
    } catch (error) {
      readAvailable = false;
      writeAvailable = false;
      readError = 'storage.error.readFailed';
      writeError = 'storage.writeError.unavailable';
      setLastError('storage.error.readFailed');
      cache = emptyStore();
      revision = 0;
      lastRaw = null;
      return cache;
    }

    // 读取成功后再独立检测写入能力；探测只用临时 key，不碰正式数据。
    var writeProbe = detectWrite();
    writeAvailable = writeProbe.ok;
    writeError = writeProbe.ok ? null : writeProbe.key;

    if (raw === null) {
      cache = emptyStore();
      revision = 0;
      lastRaw = null;
      writeBlocked = false;
      lastError = null;
      migrationReport = {
        ok: true,
        migrated: false,
        fromVersion: null,
        toVersion: SCHEMA_VERSION,
        snapshotKey: null,
        counts: null
      };
      return cache;
    }

    var result = readStore(raw, true);

    if (!result.ok) {
      if (result.code === 'corruptJson') {
        saveBrokenCopy(raw);
      }
      return failLoad(result.code, result.detail);
    }

    if (result.migrated && !writeAvailable) {
      writeBlocked = true;
      setLastError('storage.error.migrationFailed');
      migrationReport = {
        ok: false,
        code: 'writeUnavailableForMigration',
        detail: 'migration requires a writable store',
        snapshotKey: null,
        rolledBack: false,
        fromVersion: result.fromVersion,
        toVersion: SCHEMA_VERSION
      };
      cache = emptyStore();
      revision = 0;
      lastRaw = null;
      return cache;
    }

    if (!result.migrated) {
      cache = result.store;
      revision = result.revision;
      lastRaw = raw;
      writeBlocked = false;
      lastError = null;
      migrationReport = {
        ok: true,
        migrated: false,
        fromVersion: result.fromVersion,
        toVersion: SCHEMA_VERSION,
        snapshotKey: null,
        counts: result.counts,
        financial: result.financial
      };
      return cache;
    }

    // 只有确认需要迁移后才保存原始快照；快照失败则不进入写入流程
    var snapshotKey = savePreMigrationSnapshot(raw, result.fromVersion);
    if (!snapshotKey) {
      writeAvailable = false;
      writeError = 'storage.writeError.failed';
      return failLoad('snapshotFailed', 'pre-migrate');
    }

    var nextRevision = result.revision + 1;

    // 迁移写入前再确认一次：如果其他标签页已经写入，放弃本次迁移并采用最新数据，
    // 避免用刚读取的旧快照覆盖新数据。
    var latestRaw;
    try {
      latestRaw = global.localStorage.getItem(KEY);
      readAvailable = true;
      readError = null;
    } catch (error) {
      readAvailable = false;
      readError = 'storage.error.readFailed';
      return failLoad('readBackFailed', 'pre-write getItem', snapshotKey);
    }

    if (latestRaw !== raw) {
      var latest = readStore(latestRaw, false);
      if (latest.ok) {
        cache = latest.store;
        revision = latest.revision;
        lastRaw = latestRaw;
        writeBlocked = false;
        lastError = null;
        migrationReport = {
          ok: true,
          migrated: false,
          concurrent: true,
          fromVersion: latest.fromVersion,
          toVersion: SCHEMA_VERSION,
          snapshotKey: snapshotKey,
          counts: latest.counts
        };
        return cache;
      }
      return failLoad('concurrentChange', 'raw changed before migration', snapshotKey);
    }

    var serialized;
    try {
      serialized = serializeStore(result.store, nextRevision);
    } catch (error) {
      return failLoad('serializeFailed', 'serializeStore', snapshotKey);
    }

    try {
      global.localStorage.setItem(KEY, serialized);
    } catch (error) {
      var migrateWriteCode = classifyStorageError(error);
      writeAvailable = false;
      writeError = WRITE_ERROR_KEYS[migrateWriteCode] || 'storage.writeError.failed';
      return failLoad('writeFailed', 'setItem', snapshotKey);
    }

    var readBack;
    try {
      readBack = global.localStorage.getItem(KEY);
      readAvailable = true;
      readError = null;
    } catch (error) {
      readAvailable = false;
      readError = 'storage.error.readFailed';
      var rollbackRead = rollbackRaw(raw);
      return failLoad('readBackFailed', 'getItem', snapshotKey, rollbackRead);
    }

    if (readBack !== serialized) {
      // 如果是另一个标签页在读回前写入，不要回滚它的数据；
      // 尝试采用最新数据，无法识别时恢复迁移前原始内容。
      var concurrent = readStore(readBack, false);
      if (concurrent.ok) {
        cache = concurrent.store;
        revision = concurrent.revision;
        lastRaw = readBack;
        writeBlocked = false;
        lastError = null;
        migrationReport = {
          ok: true,
          migrated: false,
          concurrent: true,
          fromVersion: concurrent.fromVersion,
          toVersion: SCHEMA_VERSION,
          snapshotKey: snapshotKey,
          counts: concurrent.counts
        };
        return cache;
      }
      var rollbackMismatch = rollbackRaw(raw);
      return failLoad(
        'readBackMismatch',
        'serialized data changed',
        snapshotKey,
        rollbackMismatch
      );
    }

    var verify = readStore(readBack, false);
    if (!verify.ok) {
      var rollbackVerify = rollbackRaw(raw);
      return failLoad(
        'verifyFailed',
        verify.code + ':' + (verify.detail || ''),
        snapshotKey,
        rollbackVerify
      );
    }

    cache = result.store;
    revision = nextRevision;
    lastRaw = serialized;
    readAvailable = true;
    writeAvailable = true;
    readError = null;
    writeError = null;
    writeBlocked = false;
    lastError = null;
    migrationReport = {
      ok: true,
      migrated: true,
      fromVersion: result.fromVersion,
      toVersion: SCHEMA_VERSION,
      snapshotKey: snapshotKey,
      revision: nextRevision,
      counts: result.counts,
      financial: result.financial
    };

    return cache;
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
    return runWrite(null, function (store) {
      var payload = input;
      if (input && input.studentId) {
        var student = null;
        for (var i = 0; i < store.students.length; i += 1) {
          if (store.students[i].id === input.studentId) {
            student = store.students[i];
            break;
          }
        }
        // 用学生档案里的最新昵称作为快照
        if (student) {
          payload = Object.assign({}, input, { student: student.name });
        }
      }

      var lesson = buildLessonRecord(payload, indexStudents(store.students));
      if (!lesson) return writeFailure('VALIDATION_FAILED');

      store.lessons.push(lesson);
      return {
        ok: true,
        result: { ok: true, lesson: lesson, saved: true }
      };
    });
  }

  /**
   * 修改一条已有课程（原地更新，不会新增记录）
   * 成功返回 { lesson, saved }；找不到或数据不合法返回 null
   */
  function updateLesson(id, input) {
    return runWrite({ type: 'lesson', id: id }, function (store) {
      var index = -1;
      for (var i = 0; i < store.lessons.length; i += 1) {
        if (store.lessons[i].id === id) {
          index = i;
          break;
        }
      }
      if (index === -1) return writeFailure('NOT_FOUND');

      var existing = store.lessons[index];
      var payload = Object.assign({}, existing, input);

      // 如果改到了另一位学生，用学生档案里的最新昵称作为快照；
      // 历史时薪快照不随学生关联变化，除非调用方明确传入新的 hourlyRateCents。
      if (payload.studentId) {
        for (var j = 0; j < store.students.length; j += 1) {
          if (store.students[j].id === payload.studentId) {
            payload.student = store.students[j].name;
            break;
          }
        }
      }

      var nextDuration = Number(payload.duration);
      var nextRateCents = payload.hourlyRateCents;
      var pricingChanged =
        nextDuration !== existing.duration ||
        nextRateCents !== existing.hourlyRateCents;

      var normalized = buildLessonRecord(payload, indexStudents(store.students));
      if (!normalized) return writeFailure('VALIDATION_FAILED');

      // 只改日期、学生、昵称或收款状态时，保留原费用；
      // 只有时长或时薪快照变化时才采用重新计算的结果。
      if (!pricingChanged) {
        normalized.feeCents = existing.feeCents;
      }

      // id 和创建时间保持不变，避免编辑后被当成新记录
      normalized.id = existing.id;
      normalized.createdAt = existing.createdAt;

      store.lessons[index] = normalized;
      return {
        ok: true,
        result: { ok: true, lesson: normalized, saved: true }
      };
    });
  }

  /** 修改收款状态；paid 传 true 表示已收款，false 表示待收款 */
  function setLessonPaid(id, paid) {
    return runWrite({ type: 'lesson', id: id }, function (store) {
      for (var i = 0; i < store.lessons.length; i += 1) {
        if (store.lessons[i].id === id) {
          store.lessons[i].paid = paid === true;
          return {
            ok: true,
            result: { ok: true, lesson: store.lessons[i], saved: true }
          };
        }
      }
      return writeFailure('NOT_FOUND');
    });
  }

  function removeLesson(id) {
    return runWrite({ type: 'lesson', id: id }, function (store) {
      for (var i = 0; i < store.lessons.length; i += 1) {
        if (store.lessons[i].id === id) {
          store.lessons.splice(i, 1);
          return {
            ok: true,
            result: { ok: true, removed: true, saved: true }
          };
        }
      }
      return writeFailure('NOT_FOUND');
    });
  }

  /* ---------------- 学生 ---------------- */

  function getStudents() {
    return load().students.slice();
  }

  /** 新增学生，返回 { student, saved }；数据不合法返回 null */
  function addStudent(input) {
    return runWrite(null, function (store) {
      var student = buildStudentRecord(input);
      if (!student) return writeFailure('VALIDATION_FAILED');

      store.students.push(student);
      return {
        ok: true,
        result: { ok: true, student: student, saved: true }
      };
    });
  }

  /** 修改学生，返回 { ok, student, saved } 或结构化失败 */
  function updateStudent(id, input) {
    return runWrite({ type: 'student', id: id }, function (store) {
      var index = -1;
      for (var i = 0; i < store.students.length; i += 1) {
        if (store.students[i].id === id) {
          index = i;
          break;
        }
      }
      if (index === -1) return writeFailure('NOT_FOUND');

      var normalized = buildStudentRecord(input);
      if (!normalized) return writeFailure('VALIDATION_FAILED');

      var existing = store.students[index];
      var updated = {
        id: existing.id,
        name: normalized.name,
        grade: normalized.grade,
        subject: normalized.subject,
        hourlyRateCents: normalized.hourlyRateCents,
        createdAt: existing.createdAt
      };

      store.students[index] = updated;

      // 改名时同步刷新课程里的昵称快照，这样以后删除学生也不会突然变回旧名字
      if (existing.name !== updated.name) {
        for (var j = 0; j < store.lessons.length; j += 1) {
          if (store.lessons[j].studentId === existing.id) {
            store.lessons[j].student = updated.name;
          }
        }
      }

      return {
        ok: true,
        result: { ok: true, student: updated, saved: true }
      };
    });
  }

  /**
   * 删除学生。注意：不会删除任何课程记录。
   * 历史课程依靠 student 昵称快照继续显示和统计。
   */
  function removeStudent(id) {
    return runWrite({ type: 'student', id: id }, function (store) {
      for (var i = 0; i < store.students.length; i += 1) {
        if (store.students[i].id === id) {
          store.students.splice(i, 1);
          return {
            ok: true,
            result: { ok: true, removed: true, saved: true }
          };
        }
      }
      return writeFailure('NOT_FOUND');
    });
  }

  /* ---------------- 备份与恢复 ---------------- */

  function setLastError(key, params) {
    lastError = { key: key, params: params || null };
  }

  function backupError(key, params) {
    return { ok: false, errorKey: key, params: params || null };
  }

  /**
   * 读取正式 KEY 的原始字符串，不经过 cache、load()、JSON.parse 或迁移。
   * 只用于只读/加载失败时的恢复文件导出。
   */
  function getRawData() {
    var raw;
    try {
      raw = global.localStorage.getItem(KEY);
    } catch (error) {
      return {
        ok: false,
        exists: false,
        raw: null,
        errorKey: 'storage.error.readFailed'
      };
    }

    if (raw === null) {
      return { ok: true, exists: false, raw: null, errorKey: null };
    }
    return { ok: true, exists: true, raw: raw, errorKey: null };
  }

  /** cache 是否来自一次成功的正式数据加载，可安全生成标准备份 */
  function isCacheTrusted() {
    return readAvailable &&
      !writeBlocked &&
      (!migrationReport || migrationReport.ok !== false);
  }

  /**
   * 生成备份对象。
   * 返回的是全新对象，不会修改 cache，也不会修改任何现有记录。
   * v2 备份明确标记 amountUnit: 'cent'；hourlyRateCents / feeCents 都是整数分。
   * 正式数据加载失败或 cache 不可信时返回 null，避免导出空备份。
   */
  function createBackup() {
    reload();
    var store = load();

    if (!isCacheTrusted()) return null;

    var students = store.students.map(function (student) {
      return {
        id: student.id,
        name: student.name,
        grade: student.grade,
        subject: student.subject,
        hourlyRateCents: student.hourlyRateCents,
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
        hourlyRateCents: lesson.hourlyRateCents,
        feeCents: Calc.lessonFeeCents(lesson),
        paid: lesson.paid === true,
        createdAt: lesson.createdAt
      };
    });

    return {
      app: BACKUP_APP,
      backupVersion: BACKUP_VERSION,
      dataVersion: VERSION,
      amountUnit: BACKUP_AMOUNT_UNIT,
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
      return backupError('backup.error.notObject');
    }

    if (raw.app !== BACKUP_APP) {
      return backupError('backup.error.notBackup');
    }

    var backupVersion = Number(raw.backupVersion);
    if (!Number.isFinite(backupVersion) || backupVersion < 1) {
      return backupError('backup.error.backupVersionMissing');
    }
    if (backupVersion > BACKUP_VERSION) {
      return backupError('backup.error.backupVersionNewer', {
        version: backupVersion,
        max: BACKUP_VERSION
      });
    }

    var dataVersion = Number(raw.dataVersion);
    if (!Number.isFinite(dataVersion) || dataVersion < 1) {
      return backupError('backup.error.dataVersionMissing');
    }
    if (dataVersion > VERSION) {
      return backupError('backup.error.dataVersionNewer', {
        version: dataVersion,
        max: VERSION
      });
    }

    if (!Array.isArray(raw.students) || !Array.isArray(raw.lessons)) {
      return backupError('backup.error.arraysMissing');
    }

    // dataVersion >= 4 的备份必须明确标记整数分；1–3 为旧的“元”备份
    var isCentsBackup = dataVersion >= 4;
    if (isCentsBackup) {
      if (raw.amountUnit !== BACKUP_AMOUNT_UNIT) {
        return backupError('backup.error.amountUnit');
      }
    } else if (raw.amountUnit !== undefined && raw.amountUnit !== 'yuan') {
      return backupError('backup.error.amountUnit');
    }

    /* 1. 校验学生 */
    var students = [];
    var studentIds = {};

    for (var i = 0; i < raw.students.length; i += 1) {
      var item = raw.students[i];
      var index = i + 1;

      if (!item || typeof item !== 'object') {
        return backupError('backup.error.studentFormat', { index: index });
      }
      if (typeof item.id !== 'string' || !item.id.trim()) {
        return backupError('backup.error.studentId', { index: index });
      }
      if (studentIds[item.id]) {
        return backupError('backup.error.studentDuplicate', { id: item.id });
      }

      var name = cleanText(item.name, 20);
      if (!name) {
        return backupError('backup.error.studentName', { index: index });
      }

      var rateCents;
      if (isCentsBackup) {
        if (!isRateCents(item.hourlyRateCents)) {
          return backupError('backup.error.studentRate', { index: index });
        }
        rateCents = item.hourlyRateCents;
      } else {
        rateCents = Calc.legacyYuanToCents(item.rate);
        if (rateCents === null || rateCents > Calc.MAX_RATE_CENTS) {
          return backupError('backup.error.studentRate', { index: index });
        }
      }

      studentIds[item.id] = true;
      students.push({
        id: item.id,
        name: name,
        grade: cleanText(item.grade, 20),
        subject: cleanText(item.subject, 20),
        hourlyRateCents: rateCents,
        createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : Date.now()
      });
    }

    /* 2. 校验课程；允许学生已被删除，但课程里必须保留昵称快照 */
    var byId = indexStudents(students);
    var lessons = [];
    var lessonIds = {};

    for (var j = 0; j < raw.lessons.length; j += 1) {
      var rawLesson = raw.lessons[j];
      var lessonIndex = j + 1;

      if (!rawLesson || typeof rawLesson !== 'object') {
        return backupError('backup.error.lessonFormat', { index: lessonIndex });
      }
      if (typeof rawLesson.id !== 'string' || !rawLesson.id.trim()) {
        return backupError('backup.error.lessonId', { index: lessonIndex });
      }
      if (lessonIds[rawLesson.id]) {
        return backupError('backup.error.lessonDuplicate', { id: rawLesson.id });
      }
      if (typeof rawLesson.studentId !== 'string' || !rawLesson.studentId) {
        return backupError('backup.error.lessonStudentId', { index: lessonIndex });
      }

      var snapshot = cleanText(rawLesson.student, 20);
      if (!snapshot && byId[rawLesson.studentId]) {
        snapshot = byId[rawLesson.studentId].name;
      }
      if (!snapshot) {
        return backupError('backup.error.lessonStudentName', { index: lessonIndex });
      }
      if (!Calc.isValidDateString(rawLesson.date)) {
        return backupError('backup.error.lessonDate', { index: lessonIndex });
      }

      var duration = Number(rawLesson.duration);
      if (!Number.isFinite(duration) || duration <= 0 || Math.round(duration) !== duration) {
        return backupError('backup.error.lessonDuration', { index: lessonIndex });
      }

      var rateCents;
      var feeCents;
      if (isCentsBackup) {
        if (!isRateCents(rawLesson.hourlyRateCents)) {
          return backupError('backup.error.lessonRate', { index: lessonIndex });
        }
        if (!isFeeCents(rawLesson.feeCents)) {
          return backupError('backup.error.lessonFee', { index: lessonIndex });
        }
        rateCents = rawLesson.hourlyRateCents;
        feeCents = rawLesson.feeCents;
      } else {
        rateCents = Calc.legacyYuanToCents(rawLesson.rate);
        if (rateCents === null || rateCents > Calc.MAX_RATE_CENTS) {
          return backupError('backup.error.lessonRate', { index: lessonIndex });
        }
        var legacyBackupFee = Calc.calculateLegacyLessonFeeCents(
          rawLesson.rate,
          duration
        );
        if (!legacyBackupFee.ok) {
          return backupError('backup.error.lessonRate', { index: lessonIndex });
        }
        feeCents = legacyBackupFee.cents;
      }
      // 兼容旧备份：缺少 paid 字段时按待收款处理
      if (rawLesson.paid !== undefined && typeof rawLesson.paid !== 'boolean') {
        return backupError('backup.error.lessonPaid', { index: lessonIndex });
      }

      if (!isFeeConsistent(rateCents, duration, feeCents)) {
        return backupError('backup.error.lessonFee', { index: lessonIndex });
      }

      lessonIds[rawLesson.id] = true;
      lessons.push({
        id: rawLesson.id,
        studentId: rawLesson.studentId,
        student: snapshot,
        date: rawLesson.date,
        duration: duration,
        hourlyRateCents: rateCents,
        feeCents: feeCents,
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

  function restoreSnapshotError() {
    return {
      ok: false,
      code: 'RESTORE_SNAPSHOT_FAILED',
      errorKey: 'storage.error.restoreSnapshotFailed',
      params: null
    };
  }

  function removeSnapshotQuietly(key) {
    try {
      global.localStorage.removeItem(key);
    } catch (error) {
      /* 清理失败不影响正式数据；快照键只是多占一点空间 */
    }
  }

  function getSnapshotStorage() {
    try {
      return global.localStorage;
    } catch (error) {
      return null;
    }
  }

  /** 只识别两类自动快照：前缀 + 纯数字时间戳；其他键一律不参与清理 */
  function parseManagedSnapshotKey(key) {
    for (var i = 0; i < SNAPSHOT_TYPES.length; i += 1) {
      var type = SNAPSHOT_TYPES[i];
      if (key.indexOf(type.prefix) !== 0) continue;

      var stampText = key.slice(type.prefix.length);
      if (!/^\d+$/.test(stampText)) return null;
      var timestamp = Number(stampText);
      if (!Number.isSafeInteger(timestamp) || timestamp < 0) return null;
      return { type: type.name, timestamp: timestamp };
    }
    return null;
  }

  /**
   * 枚举自动快照。容量按 UTF-16 每字符 2 字节估算，不包含浏览器内部开销，
   * 也不代表浏览器真实 localStorage 配额。
   */
  function listManagedSnapshots() {
    var storage = getSnapshotStorage();
    if (!storage) return null;

    var length;
    try {
      length = storage.length;
    } catch (error) {
      return null;
    }
    if (typeof length !== 'number' || !Number.isFinite(length) || length < 0) {
      return null;
    }

    var list = [];
    for (var i = 0; i < length; i += 1) {
      var key;
      try {
        key = storage.key(i);
      } catch (error) {
        return null;
      }
      if (typeof key !== 'string') continue;

      var meta = parseManagedSnapshotKey(key);
      if (!meta) continue;

      var value = null;
      var readable = false;
      try {
        value = storage.getItem(key);
        readable = typeof value === 'string';
      } catch (error) {
        readable = false;
      }

      list.push({
        key: key,
        type: meta.type,
        timestamp: meta.timestamp,
        readable: readable,
        bytes: (key.length + (readable ? value.length : 0)) * 2
      });
    }
    return list;
  }

  function compareSnapshotAge(a, b) {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a.key === b.key) return 0;
    return a.key < b.key ? -1 : 1;
  }

  function snapshotTotalBytes(list) {
    var total = 0;
    for (var i = 0; i < list.length; i += 1) total += list[i].bytes;
    return total;
  }

  /**
   * 每种类型至少保护最近一份可读快照；如果全部不可读，则保护最近一份，
   * 避免清理把某一类型的最后恢复点也删掉。
   */
  function protectedSnapshotKeys(list) {
    var newestReadable = Object.create(null);
    var newestAny = Object.create(null);

    for (var i = 0; i < list.length; i += 1) {
      var snapshot = list[i];
      if (
        snapshot.readable &&
        (!newestReadable[snapshot.type] ||
          compareSnapshotAge(snapshot, newestReadable[snapshot.type]) > 0)
      ) {
        newestReadable[snapshot.type] = snapshot;
      }
      if (
        !newestAny[snapshot.type] ||
        compareSnapshotAge(snapshot, newestAny[snapshot.type]) > 0
      ) {
        newestAny[snapshot.type] = snapshot;
      }
    }

    var protectedKeys = Object.create(null);
    Object.keys(newestAny).forEach(function (type) {
      var keeper = newestReadable[type] || newestAny[type];
      protectedKeys[keeper.key] = true;
    });
    return protectedKeys;
  }

  function removeSnapshotConfirmed(storage, key) {
    try {
      storage.removeItem(key);
    } catch (error) {
      return false;
    }
    try {
      return storage.getItem(key) === null;
    } catch (error) {
      return false;
    }
  }

  /** 为即将写入的快照腾出容量；只删除允许删除的旧快照，保留每类最后一份 */
  function ensureSnapshotRoom(incomingBytes) {
    if (!Number.isSafeInteger(incomingBytes) || incomingBytes < 0) {
      return { ok: false, code: 'SNAPSHOT_BUDGET_EXCEEDED' };
    }
    if (incomingBytes > SNAPSHOT_LIMITS.totalBytes) {
      return { ok: false, code: 'SNAPSHOT_BUDGET_EXCEEDED' };
    }

    var storage = getSnapshotStorage();
    if (!storage) return { ok: false, code: 'SNAPSHOT_STORAGE_UNAVAILABLE' };

    var initial = listManagedSnapshots();
    if (!initial) return { ok: false, code: 'SNAPSHOT_STORAGE_UNAVAILABLE' };

    var failed = Object.create(null);
    var guard = initial.length + 2;

    while (guard > 0) {
      guard -= 1;
      var list = listManagedSnapshots();
      if (!list) return { ok: false, code: 'SNAPSHOT_STORAGE_UNAVAILABLE' };

      if (snapshotTotalBytes(list) + incomingBytes <= SNAPSHOT_LIMITS.totalBytes) {
        return { ok: true, code: null };
      }

      var protectedKeys = protectedSnapshotKeys(list);
      var candidates = list.filter(function (snapshot) {
        return !protectedKeys[snapshot.key] && !failed[snapshot.key];
      }).sort(compareSnapshotAge);

      if (!candidates.length) {
        return { ok: false, code: 'SNAPSHOT_BUDGET_EXCEEDED' };
      }
      if (!removeSnapshotConfirmed(storage, candidates[0].key)) {
        failed[candidates[0].key] = true;
      }
    }

    return { ok: false, code: 'SNAPSHOT_BUDGET_EXCEEDED' };
  }

  /** 新快照验证成功后，按数量和总容量整理旧快照 */
  function pruneManagedSnapshots() {
    var storage = getSnapshotStorage();
    if (!storage) return { ok: false, code: 'SNAPSHOT_STORAGE_UNAVAILABLE' };

    var initial = listManagedSnapshots();
    if (!initial) return { ok: false, code: 'SNAPSHOT_STORAGE_UNAVAILABLE' };

    var failed = Object.create(null);
    var guard = initial.length + SNAPSHOT_TYPES.length + 2;

    while (guard > 0) {
      guard -= 1;
      var list = listManagedSnapshots();
      if (!list) return { ok: false, code: 'SNAPSHOT_STORAGE_UNAVAILABLE' };

      var protectedKeys = protectedSnapshotKeys(list);
      var excessType = null;
      for (var i = 0; i < SNAPSHOT_TYPES.length; i += 1) {
        var type = SNAPSHOT_TYPES[i];
        var count = list.filter(function (snapshot) {
          return snapshot.type === type.name;
        }).length;
        if (count > type.maxCount) {
          excessType = type.name;
          break;
        }
      }

      var totalBytes = snapshotTotalBytes(list);
      var candidate = null;

      if (excessType) {
        candidate = list.filter(function (snapshot) {
          return snapshot.type === excessType &&
            !protectedKeys[snapshot.key] &&
            !failed[snapshot.key];
        }).sort(compareSnapshotAge)[0] || null;
      } else if (totalBytes > SNAPSHOT_LIMITS.totalBytes) {
        candidate = list.filter(function (snapshot) {
          return !protectedKeys[snapshot.key] && !failed[snapshot.key];
        }).sort(compareSnapshotAge)[0] || null;
      } else {
        return { ok: true, code: null, totalBytes: totalBytes };
      }

      if (!candidate) {
        return {
          ok: false,
          code: excessType ? 'SNAPSHOT_COUNT_LIMIT' : 'SNAPSHOT_BUDGET_EXCEEDED'
        };
      }
      if (!removeSnapshotConfirmed(storage, candidate.key)) {
        failed[candidate.key] = true;
      }
    }

    return { ok: false, code: 'SNAPSHOT_CLEANUP_LOOP' };
  }

  /**
   * 保存恢复前的完整正式数据副本。
   * 只有写入后回读与原始字符串完全一致才返回 ok:true。
   * 使用时间戳键；若同名键已存在，说明无法可靠区分本次快照，
   * 直接中止恢复，绝不覆盖已有快照。
   */
  function savePreRestoreSnapshot(raw) {
    var storage = global.localStorage;
    var snapshotKey = KEY + ':pre-restore:' + Date.now();
    var existing;

    try {
      existing = storage.getItem(snapshotKey);
    } catch (error) {
      return { ok: false, code: classifyStorageError(error), key: null };
    }
    if (existing !== null) {
      return { ok: false, code: 'SNAPSHOT_KEY_CONFLICT', key: null };
    }

    var incomingBytes = (snapshotKey.length + raw.length) * 2;
    var room = ensureSnapshotRoom(incomingBytes);
    if (!room.ok) {
      return { ok: false, code: room.code, key: null };
    }

    try {
      storage.setItem(snapshotKey, raw);
    } catch (error) {
      removeSnapshotQuietly(snapshotKey);
      return { ok: false, code: classifyStorageError(error), key: null };
    }

    var readBack;
    try {
      readBack = storage.getItem(snapshotKey);
    } catch (error) {
      removeSnapshotQuietly(snapshotKey);
      return { ok: false, code: 'STORAGE_WRITE_FAILED', key: null };
    }

    if (readBack !== raw) {
      removeSnapshotQuietly(snapshotKey);
      return { ok: false, code: 'STORAGE_WRITE_FAILED', key: null };
    }

    var pruned = pruneManagedSnapshots();
    if (!pruned.ok) {
      removeSnapshotQuietly(snapshotKey);
      return { ok: false, code: pruned.code, key: null };
    }

    return { ok: true, code: null, key: snapshotKey };
  }

  /**
   * 用备份替换当前数据。
   * 先完整校验，再保存恢复前快照（已有正式数据时必须成功），
   * 然后写入 localStorage，最后才替换内存缓存；
   * 任何失败时当前缓存和已保存的数据都保持不变。
   */
  function restoreBackup(raw) {
    var validation = validateBackup(raw);
    if (!validation.ok) return Promise.resolve(validation);

    return withWriteLock(function () {
      load();

      if (!readAvailable) {
        setLastError('storage.error.restoreReadFailed');
        return backupError('storage.error.restoreReadFailed');
      }
      if (!writeAvailable) {
        setLastError('storage.writeError.blocked');
        return backupError('storage.writeError.blocked');
      }

      var previousRaw = null;
      try {
        previousRaw = global.localStorage.getItem(KEY);
        readAvailable = true;
        readError = null;
      } catch (error) {
        readAvailable = false;
        readError = 'storage.error.readFailed';
        setLastError('storage.error.restoreReadFailed');
        return backupError('storage.error.restoreReadFailed');
      }

      // 当前已有正式数据时，必须先成功保存并回读一致的恢复前快照，否则不能覆盖。
      if (previousRaw !== null) {
        var snapshot = savePreRestoreSnapshot(previousRaw);
        if (!snapshot.ok) {
          if (snapshot.code !== 'SNAPSHOT_KEY_CONFLICT') {
            writeAvailable = false;
            writeError = WRITE_ERROR_KEYS[snapshot.code] || 'storage.writeError.failed';
          }
          setLastError('storage.error.restoreSnapshotFailed');
          return restoreSnapshotError();
        }
      }

      var previousRevision = 0;
      if (previousRaw) {
        try {
          previousRevision = readRevision(JSON.parse(previousRaw));
        } catch (error) {
          previousRevision = 0;
        }
      }
      var nextRevision = Math.max(revision, previousRevision) + 1;

      var serialized;
      try {
        serialized = serializeStore(validation.store, nextRevision);
      } catch (error) {
        return backupError('storage.error.restoreSerializeFailed');
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
        var restoreCode = classifyStorageError(error);
        writeAvailable = false;
        writeError = WRITE_ERROR_KEYS[restoreCode] || 'storage.writeError.failed';
        lastRaw = null;
        setLastError('storage.error.restoreWriteFailed');
        return backupError('storage.error.restoreWriteFailed');
      }

      cache = validation.store;
      revision = nextRevision;
      lastRaw = serialized;
      loaded = true;
      readAvailable = true;
      writeAvailable = true;
      readError = null;
      writeError = null;
      writeBlocked = false;
      lastError = null;
      migrationReport = {
        ok: true,
        migrated: false,
        restored: true,
        toVersion: SCHEMA_VERSION,
        revision: nextRevision
      };

      return {
        ok: true,
        counts: validation.backup.counts,
        exportedAt: validation.backup.exportedAt
      };
    });
  }

  function isPersistent() {
    load();
    return readAvailable && writeAvailable && !writeBlocked;
  }

  function isReadAvailable() {
    load();
    return readAvailable;
  }

  function isWriteAvailable() {
    load();
    return writeAvailable;
  }

  function isReadOnly() {
    load();
    return readAvailable && (!writeAvailable || writeBlocked);
  }

  function isWriteBlocked() {
    return isReadOnly();
  }

  function getReadError() {
    load();
    return readError;
  }

  function getWriteError() {
    load();
    return writeError;
  }

  function getStorageState() {
    load();
    return {
      readAvailable: readAvailable,
      writeAvailable: writeAvailable,
      readOnly: readAvailable && (!writeAvailable || writeBlocked),
      readError: readError,
      writeError: writeError
    };
  }

  function getLastError() {
    return lastError;
  }

  function getMigrationReport() {
    load();
    return migrationReport;
  }

  global.TTStorage = {
    KEY: KEY,
    VERSION: VERSION,
    BACKUP_VERSION: BACKUP_VERSION,
    load: load,
    reload: reload,
    getRevision: function () { return revision; },
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
    getRawData: getRawData,
    validateBackup: validateBackup,
    restoreBackup: restoreBackup,
    isPersistent: isPersistent,
    isReadAvailable: isReadAvailable,
    isWriteAvailable: isWriteAvailable,
    isReadOnly: isReadOnly,
    isWriteBlocked: isWriteBlocked,
    getReadError: getReadError,
    getWriteError: getWriteError,
    getStorageState: getStorageState,
    getLastError: getLastError,
    getMigrationReport: getMigrationReport
  };
})(window);
