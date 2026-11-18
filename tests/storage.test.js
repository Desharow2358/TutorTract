/* ============================================================
   storage.test.js —— 数据迁移与写入安全测试
   运行：node tests/storage.test.js
   不读取真实浏览器数据，只使用内存 localStorage。
   金额单位：整数分（cents）；旧数据/旧备份为元。
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const sources = {
  i18n: fs.readFileSync(path.join(root, 'js/i18n.js'), 'utf8'),
  calc: fs.readFileSync(path.join(root, 'js/calc.js'), 'utf8'),
  storage: fs.readFileSync(path.join(root, 'js/storage.js'), 'utf8')
};

const KEY = 'tutortrack:v1';

function createEnv(seed) {
  const data = new Map(Object.entries(seed || {}));
  const writes = [];
  let idCounter = 0;
  let failSet = null;
  let failGet = null;
  let failRemove = null;
  let getOverride = null;
  let readBackOverride = null;
  let readBackUsed = false;
  let keySetCount = 0;

  const localStorage = {
    getItem(key) {
      if (failGet && failGet(key)) {
        const error = new Error('forced localStorage read failure');
        error.name = 'SecurityError';
        throw error;
      }
      if (getOverride) {
        const replaced = getOverride(key);
        if (replaced !== undefined) return replaced;
      }
      if (
        readBackOverride !== null &&
        key === KEY &&
        keySetCount > 0 &&
        !readBackUsed
      ) {
        readBackUsed = true;
        return readBackOverride;
      }
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      if (failSet && failSet(key, String(value))) {
        const error = new Error('forced localStorage failure');
        error.name = 'QuotaExceededError';
        throw error;
      }
      data.set(key, String(value));
      writes.push(key);
      if (key === KEY) keySetCount += 1;
    },
    removeItem(key) {
      if (failRemove && failRemove(key)) {
        const error = new Error('forced localStorage remove failure');
        error.name = 'SecurityError';
        throw error;
      }
      data.delete(key);
    },
    get length() {
      return data.size;
    },
    key(index) {
      const keys = [...data.keys()];
      return index >= 0 && index < keys.length ? keys[index] : null;
    }
  };

  const context = {
    console,
    Intl,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    localStorage,
    navigator: {},
    crypto: {
      randomUUID() {
        idCounter += 1;
        return 'test-uuid-' + idCounter;
      }
    }
  };
  context.window = context;

  vm.createContext(context);
  vm.runInContext(sources.i18n, context, { filename: 'js/i18n.js' });
  vm.runInContext(sources.calc, context, { filename: 'js/calc.js' });
  vm.runInContext(sources.storage, context, { filename: 'js/storage.js' });

  return {
    context,
    storage: context.TTStorage,
    calc: context.Calc,
    data,
    writes,
    setFailure(fn) {
      failSet = fn;
    },
    setGetFailure(fn) {
      failGet = fn;
    },
    setRemoveFailure(fn) {
      failRemove = fn;
    },
    setGetOverride(fn) {
      getOverride = fn;
    },
    fixNow(value) {
      const contextDate = vm.runInContext('Date', context);
      contextDate.now = function () { return value; };
    },
    setReadBack(value) {
      readBackOverride = value;
    }
  };
}

const SNAPSHOT_PREFIX = KEY + ':pre-restore:';
const BROKEN_PREFIX = KEY + ':broken:';
const SNAPSHOT_BUDGET_BYTES = 2 * 1024 * 1024;

function snapshotBytes(key, value) {
  return (key.length + value.length) * 2;
}

function snapshotKeys(env) {
  return [...env.data.keys()].filter(function (key) {
    return key.indexOf(SNAPSHOT_PREFIX) === 0;
  });
}

function keysWithPrefix(env, prefix) {
  return [...env.data.keys()].filter(function (key) {
    return key.indexOf(prefix) === 0;
  });
}

function formalKeyWrites(env) {
  return env.writes.filter(function (key) { return key === KEY; }).length;
}

function validRestoreBackup() {
  return {
    app: 'TutorTrack',
    backupVersion: 2,
    dataVersion: 4,
    amountUnit: 'cent',
    students: [{ id: 's_new', name: 'Bob', grade: '', subject: '', hourlyRateCents: 10000, createdAt: 1 }],
    lessons: [{
      id: 'l_new', studentId: 's_new', student: 'Bob', date: '2026-01-02',
      duration: 60, hourlyRateCents: 10000, feeCents: 10000, paid: false, createdAt: 2
    }]
  };
}

/** 当前 v4 数据：所有金额都是整数分 */
function currentStore(revision) {
  return {
    version: 4,
    schemaVersion: 4,
    revision: revision === undefined ? 3 : revision,
    updatedAt: 1762156800000,
    writerId: 'seed',
    students: [
      {
        id: 's1',
        name: 'Alice',
        grade: 'G10',
        subject: 'Math',
        hourlyRateCents: 15000,
        createdAt: 1
      }
    ],
    lessons: [
      {
        id: 'l1',
        studentId: 's1',
        student: 'Alice',
        date: '2026-11-01',
        duration: 90,
        hourlyRateCents: 15000,
        feeCents: 22500,
        paid: false,
        createdAt: 2
      }
    ]
  };
}

/** 历史精确费用：时薪快照 0 分，600 分钟费用 1 分；另有第二位学生用于关联测试 */
function precisionStore(revision) {
  return {
    version: 4,
    schemaVersion: 4,
    revision: revision === undefined ? 5 : revision,
    updatedAt: 1762156800000,
    writerId: 'seed',
    students: [
      {
        id: 's1', name: 'Alice', grade: 'G10', subject: 'Math',
        hourlyRateCents: 0, createdAt: 1
      },
      {
        id: 's2', name: 'Bob', grade: 'G8', subject: 'English',
        hourlyRateCents: 12000, createdAt: 3
      }
    ],
    lessons: [{
      id: 'l1', studentId: 's1', student: 'Alice', date: '2026-11-01',
      duration: 600, hourlyRateCents: 0, feeCents: 1, paid: false, createdAt: 2
    }]
  };
}

/** 历史超限数据：学生/课程时薪 2,000,000 分，课程 2000 分钟，费用 >24,000,000 */
function overLimitStore(revision) {
  return {
    version: 4,
    schemaVersion: 4,
    revision: revision === undefined ? 5 : revision,
    updatedAt: 1762156800000,
    writerId: 'seed',
    students: [
      {
        id: 's1', name: 'Alice', grade: 'G10', subject: 'Math',
        hourlyRateCents: 2000000, createdAt: 1
      },
      {
        id: 's2', name: 'Bob', grade: 'G8', subject: 'English',
        hourlyRateCents: 10000, createdAt: 3
      }
    ],
    lessons: [{
      id: 'l1', studentId: 's1', student: 'Alice', date: '2026-11-01',
      duration: 2000, hourlyRateCents: 2000000, feeCents: 66666667,
      paid: false, createdAt: 2
    }]
  };
}

/** 历史费用比新上限多 12 分，但仍在一致性容差内 */
function feeEdgeStore(revision) {
  return {
    version: 4,
    schemaVersion: 4,
    revision: revision === undefined ? 5 : revision,
    updatedAt: 1762156800000,
    writerId: 'seed',
    students: [{
      id: 's1', name: 'Alice', grade: 'G10', subject: 'Math',
      hourlyRateCents: 1000000, createdAt: 1
    }],
    lessons: [{
      id: 'l1', studentId: 's1', student: 'Alice', date: '2026-11-01',
      duration: 1440, hourlyRateCents: 1000000, feeCents: 24000012,
      paid: false, createdAt: 2
    }]
  };
}

/** v3：金额以元保存，含 paid */
function v3Store(revision, rate, duration) {
  const yuanRate = rate === undefined ? 150 : rate;
  const minutes = duration === undefined ? 90 : duration;
  return {
    version: 3,
    schemaVersion: 3,
    revision: revision === undefined ? 0 : revision,
    updatedAt: 1762156800000,
    writerId: 'seed',
    students: [
      {
        id: 's1',
        name: 'Alice',
        grade: 'G10',
        subject: 'Math',
        rate: yuanRate,
        createdAt: 1
      }
    ],
    lessons: [
      {
        id: 'l1',
        studentId: 's1',
        student: 'Alice',
        date: '2026-11-01',
        duration: minutes,
        rate: yuanRate,
        paid: false,
        createdAt: 2
      }
    ]
  };
}

/** v2：金额以元保存，没有 paid */
function v2Store() {
  return {
    version: 2,
    students: [
      {
        id: 's1',
        name: 'Alice',
        grade: 'G10',
        subject: 'Math',
        rate: 150,
        createdAt: 1
      }
    ],
    lessons: [
      {
        id: 'l1',
        studentId: 's1',
        student: 'Alice',
        date: '2026-11-01',
        duration: 90,
        rate: 150,
        createdAt: 2
      }
    ]
  };
}

function v1Lessons() {
  return [
    {
      student: 'Alice',
      date: '2026-11-01',
      duration: 90,
      rate: 150,
      createdAt: 2
    },
    {
      student: 'Alice',
      date: '2026-11-02',
      duration: 60,
      rate: 100,
      createdAt: 3
    }
  ];
}

function totalCentsOf(calc, lessons) {
  return lessons.reduce(function (sum, lesson) {
    return sum + calc.lessonFeeCents(lesson);
  }, 0);
}

function legacyTotalCentsOf(calc, lessons) {
  return lessons.reduce(function (sum, lesson) {
    return sum + calc.legacyLessonFeeCents(lesson.rate, lesson.duration);
  }, 0);
}

const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (error) {
    results.push({ name, pass: false, error: error && error.stack ? error.stack : String(error) });
  }
}

(async function () {
  await test('空数据初始化', function () {
    const env = createEnv();
    const store = env.storage.load();
    assert.strictEqual(store.students.length, 0);
    assert.strictEqual(store.lessons.length, 0);
    assert.strictEqual(env.storage.getRevision(), 0);
    assert.strictEqual(env.storage.isWriteBlocked(), false);
    assert.strictEqual(env.storage.getMigrationReport().migrated, false);
  });

  await test('当前版本正常加载，不重复迁移', function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    const store = env.storage.load();
    assert.strictEqual(store.students.length, 1);
    assert.strictEqual(store.lessons.length, 1);
    assert.strictEqual(store.students[0].hourlyRateCents, 15000);
    assert.strictEqual(store.lessons[0].feeCents, 22500);
    assert.strictEqual(store.lessons[0].paid, false);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(env.storage.isWriteBlocked(), false);
    assert.strictEqual(env.storage.getMigrationReport().migrated, false);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual([...env.data.keys()].some((key) => key.indexOf(':pre-migrate:') !== -1), false);
  });

  await test('当前版本缺少 schemaVersion 时仍可正常加载', function () {
    const data = currentStore(7);
    delete data.schemaVersion;
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    const store = env.storage.load();
    assert.strictEqual(store.students.length, 1);
    assert.strictEqual(store.lessons.length, 1);
    assert.strictEqual(env.storage.getRevision(), 7);
    assert.strictEqual(env.storage.isWriteBlocked(), false);
    assert.strictEqual(env.storage.getMigrationReport().migrated, false);
    assert.strictEqual(env.data.get(KEY), raw);
  });

  await test('读取异常不会被当成空数据', function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.setGetFailure(function (key) { return key === KEY; });

    const store = env.storage.load();
    const state = env.storage.getStorageState();

    assert.strictEqual(store.students.length, 0);
    assert.strictEqual(state.readAvailable, false);
    assert.strictEqual(state.writeAvailable, false);
    assert.strictEqual(state.readOnly, false);
    assert.strictEqual(state.readError, 'storage.error.readFailed');
    assert.strictEqual(env.storage.getLastError().key, 'storage.error.readFailed');
    assert.strictEqual(env.data.get(KEY), raw);
  });

  await test('已有缓存后读取失败不会清空数据', function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    env.setGetFailure(function (key) { return key === KEY; });

    const changed = env.storage.reload();
    const state = env.storage.getStorageState();

    assert.strictEqual(changed, false);
    assert.strictEqual(state.readAvailable, false);
    assert.strictEqual(env.storage.getLessons().length, 1);
    assert.strictEqual(env.storage.getLessons()[0].hourlyRateCents, 15000);
  });

  await test('localStorage 满额时仍加载已有学生和课程，并进入只读', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.setFailure(function () { return true; });

    const store = env.storage.load();
    const state = env.storage.getStorageState();

    assert.strictEqual(state.readAvailable, true);
    assert.strictEqual(state.writeAvailable, false);
    assert.strictEqual(state.readOnly, true);
    assert.strictEqual(store.students.length, 1);
    assert.strictEqual(store.lessons.length, 1);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(
      env.calc.summarizeMonthPayments(env.storage.getLessons(), '2026-11').totalCents,
      22500
    );
    assert.strictEqual(env.data.get(KEY), raw);
  });

  await test('只读状态下所有普通写入返回 WRITE_BLOCKED', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.setFailure(function () { return true; });
    env.storage.load();

    const add = await env.storage.addLesson({
      studentId: 's1', date: '2026-11-02', duration: 60, hourlyRateCents: 10000
    });
    const update = await env.storage.updateLesson('l1', { hourlyRateCents: 20000 });
    const remove = await env.storage.removeLesson('l1');
    const paid = await env.storage.setLessonPaid('l1', true);

    [add, update, remove, paid].forEach(function (result) {
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.code, 'WRITE_BLOCKED');
    });

    assert.strictEqual(env.storage.getLessons().length, 1);
    assert.strictEqual(env.storage.getLessons()[0].hourlyRateCents, 15000);
    assert.strictEqual(env.storage.getLessons()[0].paid, false);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(env.data.get(KEY), raw);
  });

  await test('写入能力探测使用临时 key，不覆盖正式数据', function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const probeKeys = [...env.data.keys()].filter(function (key) {
      return key.indexOf('__tutortrack_write_probe__') === 0;
    });

    assert.strictEqual(probeKeys.length, 0);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.isReadAvailable(), true);
    assert.strictEqual(env.storage.isWriteAvailable(), true);
    assert.strictEqual(env.storage.isReadOnly(), false);
  });

  await test('存储恢复正常后重新加载可恢复写入能力', async function () {
    const raw = JSON.stringify(currentStore(5));
    const broken = createEnv({ [KEY]: raw });
    broken.setFailure(function () { return true; });
    broken.storage.load();
    assert.strictEqual(broken.storage.isReadOnly(), true);

    const recovered = createEnv({ [KEY]: raw });
    const store = recovered.storage.load();
    assert.strictEqual(recovered.storage.isReadOnly(), false);
    assert.strictEqual(store.lessons.length, 1);

    const result = await recovered.storage.addLesson({
      studentId: 's1', date: '2026-11-02', duration: 60, hourlyRateCents: 10000
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.feeCents, 10000);
    assert.strictEqual(recovered.storage.getRevision(), 6);
    assert.strictEqual(recovered.storage.getLessons().length, 2);
  });

  await test('只读状态下恢复备份被拒绝', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.setFailure(function () { return true; });
    env.storage.load();

    const backup = {
      app: 'TutorTrack', backupVersion: 1, dataVersion: 3,
      students: [{ id: 's2', name: 'Bob', grade: '', subject: '', rate: 100, createdAt: 1 }],
      lessons: []
    };
    const result = await env.storage.restoreBackup(backup);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errorKey, 'storage.writeError.blocked');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('只读状态下旧版本数据不会被强制迁移', function () {
    const raw = JSON.stringify(v3Store());
    const env = createEnv({ [KEY]: raw });
    env.setFailure(function () { return true; });

    env.storage.load();
    const state = env.storage.getStorageState();
    const report = env.storage.getMigrationReport();

    assert.strictEqual(state.readAvailable, true);
    assert.strictEqual(state.writeAvailable, false);
    assert.strictEqual(state.readOnly, true);
    assert.strictEqual(report.code, 'writeUnavailableForMigration');
    assert.strictEqual(env.data.get(KEY), raw);
  });

  await test('v3 迁移到 v4：元转换为整数分，历史课程费用不变', function () {
    const raw = JSON.stringify(v3Store(5));
    const env = createEnv({ [KEY]: raw });
    const store = env.storage.load();
    const report = env.storage.getMigrationReport();

    assert.strictEqual(store.students[0].hourlyRateCents, 15000);
    assert.strictEqual(store.lessons[0].hourlyRateCents, 15000);
    assert.strictEqual(store.lessons[0].feeCents, 22500);
    assert.strictEqual(store.lessons[0].paid, false);
    assert.strictEqual(env.storage.getRevision(), 6);
    assert.strictEqual(report.migrated, true);
    assert.strictEqual(report.fromVersion, 3);
    assert.strictEqual(report.financial.before.totalCents, 22500);
    assert.strictEqual(report.financial.after.totalCents, 22500);

    const migrated = JSON.parse(env.data.get(KEY));
    assert.strictEqual(migrated.schemaVersion, 4);
    assert.strictEqual(migrated.students[0].hourlyRateCents, 15000);
    assert.strictEqual(migrated.students[0].rate, undefined);
    assert.strictEqual(migrated.lessons[0].feeCents, 22500);
    assert.strictEqual(migrated.lessons[0].rate, undefined);
    assert.ok(report.snapshotKey);
    assert.ok(env.data.has(report.snapshotKey));
  });

  await test('v3 迁移：小数时薪与 45 分钟课程按旧规则舍入到分', function () {
    const env = createEnv({ [KEY]: JSON.stringify(v3Store(0, 99.99, 45)) });
    const store = env.storage.load();
    assert.strictEqual(store.students[0].hourlyRateCents, 9999);
    assert.strictEqual(store.lessons[0].hourlyRateCents, 9999);
    assert.strictEqual(store.lessons[0].feeCents, 7499);
  });

  await test('v3 迁移：120.5 元时薪 90 分钟 = 18075 分', function () {
    const env = createEnv({ [KEY]: JSON.stringify(v3Store(0, 120.5, 90)) });
    const store = env.storage.load();
    assert.strictEqual(store.students[0].hourlyRateCents, 12050);
    assert.strictEqual(store.lessons[0].hourlyRateCents, 12050);
    assert.strictEqual(store.lessons[0].feeCents, 18075);
    assert.strictEqual(env.calc.summarizeMonthPayments(store.lessons, '2026-11').totalCents, 18075);
  });

  await test('v3 迁移：旧时薪超过两位小数时按精确比例保留费用', function () {
    const env = createEnv({ [KEY]: JSON.stringify(v3Store(0, 120.555, 45)) });
    const store = env.storage.load();
    // 旧时薪先转分是 12056，但费用必须按原始 120.555 计算：90.41625 元 → 9042 分。
    assert.strictEqual(store.students[0].hourlyRateCents, 12056);
    assert.strictEqual(store.lessons[0].hourlyRateCents, 12056);
    assert.strictEqual(store.lessons[0].feeCents, 9042);
    assert.strictEqual(
      env.storage.getMigrationReport().financial.before.totalCents,
      9042
    );
  });

  await test('v3 迁移：不能先把 0.001 元时薪转成 0 分再计算费用', function () {
    const env = createEnv({ [KEY]: JSON.stringify(v3Store(0, 0.001, 600)) });
    const store = env.storage.load();
    assert.strictEqual(store.students[0].hourlyRateCents, 0);
    assert.strictEqual(store.lessons[0].hourlyRateCents, 0);
    // 0.001 元/小时 × 10 小时 = 0.01 元 = 1 分；先转分再算会得到 0。
    assert.strictEqual(store.lessons[0].feeCents, 1);
  });

  await test('v2 迁移到 v4：补齐 paid，保留金额和数量', function () {
    const raw = JSON.stringify(v2Store());
    const env = createEnv({ [KEY]: raw });
    const store = env.storage.load();
    const report = env.storage.getMigrationReport();
    assert.strictEqual(store.lessons.length, 1);
    assert.strictEqual(store.students.length, 1);
    assert.strictEqual(store.lessons[0].paid, false);
    assert.strictEqual(store.students[0].hourlyRateCents, 15000);
    assert.strictEqual(store.lessons[0].feeCents, 22500);
    assert.strictEqual(env.storage.getRevision(), 1);
    assert.strictEqual(env.storage.isWriteBlocked(), false);
    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.migrated, true);
    assert.ok(report.snapshotKey);
    assert.ok(env.data.has(report.snapshotKey));
    assert.strictEqual(report.counts.studentsBefore, 1);
    assert.strictEqual(report.counts.studentsAfter, 1);
    assert.strictEqual(report.counts.lessonsBefore, 1);
    assert.strictEqual(report.counts.lessonsAfter, 1);
    assert.strictEqual(report.financial.before.totalCents, report.financial.after.totalCents);
    assert.strictEqual(env.data.get(KEY).indexOf('"schemaVersion":4') !== -1, true);
  });

  await test('v1 数组迁移到 v4，生成学生和缺失 ID', function () {
    const lessons = v1Lessons();
    const env = createEnv({ [KEY]: JSON.stringify(lessons) });
    const store = env.storage.load();
    const report = env.storage.getMigrationReport();
    assert.strictEqual(store.students.length, 1);
    assert.strictEqual(store.lessons.length, 2);
    assert.strictEqual(store.lessons[0].paid, false);
    assert.ok(store.lessons[0].id);
    assert.strictEqual(store.lessons[0].feeCents, 22500);
    assert.strictEqual(store.lessons[1].feeCents, 10000);
    assert.strictEqual(env.storage.getRevision(), 1);
    assert.ok(report.snapshotKey);
    assert.strictEqual(report.counts.studentsBefore, 0);
    assert.strictEqual(report.counts.studentsAfter, 1);
    assert.strictEqual(report.counts.lessonsBefore, 2);
    assert.strictEqual(report.counts.lessonsAfter, 2);
    assert.strictEqual(
      legacyTotalCentsOf(env.calc, lessons),
      report.financial.after.totalCents
    );
  });

  await test('重复执行迁移不会重复乘以 100 或增加 revision', function () {
    const env = createEnv({ [KEY]: JSON.stringify(v3Store(3)) });
    env.storage.load();
    const report = env.storage.getMigrationReport();
    const migratedRaw = env.data.get(KEY);
    const migratedRevision = env.storage.getRevision();
    const snapshotKey = report.snapshotKey;

    const env2 = createEnv({
      [KEY]: migratedRaw,
      [snapshotKey]: env.data.get(snapshotKey)
    });
    const store = env2.storage.load();
    const report2 = env2.storage.getMigrationReport();
    assert.strictEqual(store.lessons.length, 1);
    assert.strictEqual(store.students[0].hourlyRateCents, 15000);
    assert.strictEqual(store.lessons[0].hourlyRateCents, 15000);
    assert.strictEqual(store.lessons[0].feeCents, 22500);
    assert.strictEqual(env2.storage.getRevision(), migratedRevision);
    assert.strictEqual(report2.migrated, false);
    assert.strictEqual(
      [...env2.data.keys()].filter((key) => key.indexOf(':pre-migrate:') !== -1).length,
      1
    );
  });

  await test('迁移写入失败后重试不会把元金额重复转换', function () {
    const raw = JSON.stringify(v3Store(4));
    const failed = createEnv({ [KEY]: raw });
    failed.setFailure(function (key) { return key === KEY; });
    failed.storage.load();
    assert.strictEqual(failed.storage.getMigrationReport().code, 'writeFailed');
    assert.strictEqual(failed.data.get(KEY), raw);

    const retried = createEnv({ [KEY]: failed.data.get(KEY) });
    const store = retried.storage.load();
    assert.strictEqual(store.students[0].hourlyRateCents, 15000);
    assert.strictEqual(store.lessons[0].feeCents, 22500);
    assert.strictEqual(retried.storage.getRevision(), 5);
  });

  await test('迁移写入成功但回读失败且回滚失败时，下次加载不会重复转换', function () {
    const raw = JSON.stringify(v3Store(2));
    const env = createEnv({ [KEY]: raw });
    let keyWrites = 0;
    env.setFailure(function (key) {
      if (key !== KEY) return false;
      keyWrites += 1;
      return keyWrites >= 2;
    });
    env.setReadBack('{not-json');
    env.storage.load();

    assert.strictEqual(env.storage.getMigrationReport().code, 'readBackMismatch');
    assert.strictEqual(env.storage.getMigrationReport().rolledBack, false);
    const afterFailure = JSON.parse(env.data.get(KEY));
    assert.strictEqual(afterFailure.schemaVersion, 4);
    assert.strictEqual(afterFailure.students[0].hourlyRateCents, 15000);

    const retried = createEnv({ [KEY]: env.data.get(KEY) });
    const store = retried.storage.load();
    assert.strictEqual(store.students[0].hourlyRateCents, 15000);
    assert.strictEqual(store.lessons[0].feeCents, 22500);
    assert.strictEqual(retried.storage.getMigrationReport().migrated, false);
  });

  await test('JSON 损坏时保留原始数据并进入只读', function () {
    const raw = '{broken';
    const env = createEnv({ [KEY]: raw });
    const store = env.storage.load();
    assert.strictEqual(store.lessons.length, 0);
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'corruptJson');
    assert.strictEqual(env.storage.getLastError().key, 'storage.error.corrupt');
  });

  await test('KEY 存在但内容为空字符串时按损坏处理', function () {
    const env = createEnv({ [KEY]: '' });
    env.storage.load();
    assert.strictEqual(env.storage.isReadAvailable(), true);
    assert.strictEqual(env.storage.isReadOnly(), true);
    assert.strictEqual(env.data.get(KEY), '');
    assert.strictEqual(env.storage.getMigrationReport().code, 'corruptJson');
  });

  await test('schemaVersion 缺失时停止迁移并保留原始数据', function () {
    const raw = JSON.stringify({ students: [], lessons: [] });
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'invalidSchema');
  });

  await test('未来 schemaVersion 停止迁移并保留原始数据', function () {
    const raw = JSON.stringify({ schemaVersion: 5, version: 5, students: [], lessons: [] });
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'futureSchema');
  });

  await test('缺失必需字段时停止迁移', function () {
    const data = currentStore();
    delete data.students[0].name;
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'missingField');
  });

  await test('当前版本缺少 paid 时停止迁移', function () {
    const data = currentStore();
    delete data.lessons[0].paid;
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().detail, 'lessons[0].paid');
  });

  await test('当前版本缺少 feeCents 时停止迁移', function () {
    const data = currentStore();
    delete data.lessons[0].feeCents;
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'missingField');
    assert.strictEqual(
      env.storage.getMigrationReport().detail,
      'lessons[0].feeCents'
    );
  });

  await test('未知字段时停止迁移并保留原始数据', function () {
    const data = currentStore();
    data.students[0].nickname = 'unknown';
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'unknownField');
  });

  await test('重复学生 ID 时停止迁移', function () {
    const data = currentStore();
    data.students.push(Object.assign({}, data.students[0]));
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'duplicateId');
  });

  await test('重复课程 ID 时停止迁移', function () {
    const data = currentStore();
    data.lessons.push(Object.assign({}, data.lessons[0]));
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'duplicateId');
  });

  await test('迁移前快照写入失败时停止迁移', function () {
    const raw = JSON.stringify(v3Store(0));
    const env = createEnv({ [KEY]: raw });
    env.setFailure(function (key) {
      return key.indexOf(':pre-migrate:') !== -1;
    });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'snapshotFailed');
  });

  await test('迁移写入失败时保留原始数据', function () {
    const raw = JSON.stringify(v3Store(0));
    const env = createEnv({ [KEY]: raw });
    env.setFailure(function (key) {
      return key === KEY;
    });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'writeFailed');
  });

  await test('迁移后回读失败时恢复原始数据', function () {
    const raw = JSON.stringify(v3Store(0));
    const env = createEnv({ [KEY]: raw });
    env.setReadBack('{not-json');
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'readBackMismatch');
    assert.strictEqual(env.storage.getMigrationReport().rolledBack, true);
  });

  await test('迁移失败后写入操作被阻止', async function () {
    const raw = JSON.stringify({ students: [], lessons: [] });
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    const result = await env.storage.addLesson({
      studentId: 'x',
      date: '2026-11-01',
      duration: 60,
      hourlyRateCents: 10000
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'WRITE_BLOCKED');
    assert.strictEqual(env.data.get(KEY), raw);
  });

  await test('新增失败：配额不足时不提交内存和 revision', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    const beforeRevision = env.storage.getRevision();
    env.setFailure(function (key) { return key === KEY; });

    const result = await env.storage.addLesson({
      studentId: 's1',
      date: '2026-11-02',
      duration: 60,
      hourlyRateCents: 10000
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'STORAGE_QUOTA_EXCEEDED');
    assert.strictEqual(env.storage.getLessons().length, 1);
    assert.strictEqual(env.storage.getRevision(), beforeRevision);
    assert.strictEqual(env.storage.isReadOnly(), true);

    const retry = await env.storage.addLesson({
      studentId: 's1', date: '2026-11-03', duration: 30, hourlyRateCents: 10000
    });
    assert.strictEqual(retry.ok, false);
    assert.strictEqual(retry.error.code, 'WRITE_BLOCKED');
  });

  await test('编辑失败：原记录不被修改', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    env.setFailure(function (key) { return key === KEY; });

    const result = await env.storage.updateLesson('l1', { hourlyRateCents: 20000 });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'STORAGE_QUOTA_EXCEEDED');
    assert.strictEqual(env.storage.getLessons()[0].hourlyRateCents, 15000);
    assert.strictEqual(env.storage.getLessons()[0].feeCents, 22500);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('只修改课程日期：历史费用、时薪和时长保持不变', async function () {
    const raw = JSON.stringify(precisionStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { date: '2026-11-09' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.date, '2026-11-09');
    assert.strictEqual(result.lesson.hourlyRateCents, 0);
    assert.strictEqual(result.lesson.duration, 600);
    assert.strictEqual(result.lesson.feeCents, 1);
    assert.strictEqual(result.lesson.id, 'l1');
    assert.strictEqual(result.lesson.createdAt, 2);
    assert.strictEqual(env.storage.getRevision(), 6);
    assert.strictEqual(JSON.parse(env.data.get(KEY)).lessons[0].feeCents, 1);
  });

  await test('只修改收款状态：历史费用保持不变', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(precisionStore(5)) });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { paid: true });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.paid, true);
    assert.strictEqual(result.lesson.feeCents, 1);
    assert.strictEqual(result.lesson.hourlyRateCents, 0);
    assert.strictEqual(result.lesson.duration, 600);
  });

  await test('只修改学生昵称：课程昵称快照更新，历史费用不变', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(precisionStore(5)) });
    env.storage.load();

    const result = await env.storage.updateStudent('s1', {
      name: 'Alice2', grade: 'G10', subject: 'Math', hourlyRateCents: 0
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.student.name, 'Alice2');
    assert.strictEqual(env.storage.getLessons()[0].student, 'Alice2');
    assert.strictEqual(env.storage.getLessons()[0].feeCents, 1);
  });

  await test('只修改已删除学生的课程昵称快照：历史费用不变', async function () {
    const data = precisionStore(5);
    data.students = data.students.filter(function (student) {
      return student.id !== 's1';
    });
    const env = createEnv({ [KEY]: JSON.stringify(data) });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { student: 'Alice Old' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.student, 'Alice Old');
    assert.strictEqual(result.lesson.hourlyRateCents, 0);
    assert.strictEqual(result.lesson.duration, 600);
    assert.strictEqual(result.lesson.feeCents, 1);
  });

  await test('只修改课程学生关联：保留历史时薪快照和费用', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(precisionStore(5)) });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { studentId: 's2' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.studentId, 's2');
    assert.strictEqual(result.lesson.student, 'Bob');
    assert.strictEqual(result.lesson.hourlyRateCents, 0);
    assert.strictEqual(result.lesson.duration, 600);
    assert.strictEqual(result.lesson.feeCents, 1);
  });

  await test('修改课程时长：用当前时薪重新计算费用', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { duration: 45 });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.hourlyRateCents, 15000);
    assert.strictEqual(result.lesson.duration, 45);
    assert.strictEqual(result.lesson.feeCents, 11250);
  });

  await test('修改课程时薪：用新时薪和当前时长重新计算费用', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { hourlyRateCents: 12000 });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.hourlyRateCents, 12000);
    assert.strictEqual(result.lesson.duration, 90);
    assert.strictEqual(result.lesson.feeCents, 18000);
  });

  await test('同时修改课程时薪和时长：费用正确重算', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', {
      hourlyRateCents: 12000,
      duration: 45
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.hourlyRateCents, 12000);
    assert.strictEqual(result.lesson.duration, 45);
    assert.strictEqual(result.lesson.feeCents, 9000);
  });

  await test('非法课程修改失败时正式数据、cache 和 revision 均不变', async function () {
    const raw = JSON.stringify(precisionStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { duration: 0 });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(formalKeyWrites(env), 0);
    assert.strictEqual(env.storage.getLessons()[0].feeCents, 1);
    assert.strictEqual(env.storage.getLessons()[0].duration, 600);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('非法候选费用被候选校验拒绝，正式数据不变', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    const originalCalculate = env.calc.calculateLessonFeeCents;
    let calls = 0;

    // 让 buildLessonRecord 产生一个错误费用，再由 validateCandidateStore 用真实规则拒绝。
    env.calc.calculateLessonFeeCents = function (rateCents, duration) {
      calls += 1;
      if (calls === 1) return { ok: true, cents: 1, code: null };
      return originalCalculate(rateCents, duration);
    };

    let result;
    try {
      result = await env.storage.updateLesson('l1', { duration: 45 });
    } finally {
      env.calc.calculateLessonFeeCents = originalCalculate;
    }

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(formalKeyWrites(env), 0);
    assert.strictEqual(env.storage.getLessons()[0].duration, 90);
    assert.strictEqual(env.storage.getLessons()[0].feeCents, 22500);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('新增学生：课时费在上限内成功', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const result = await env.storage.addStudent({
      name: 'Carol', grade: '', subject: '', hourlyRateCents: 1000000
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.student.hourlyRateCents, 1000000);
    assert.strictEqual(env.storage.getRevision(), 6);
  });

  await test('新增学生：课时费超过上限失败，正式数据不变', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.addStudent({
      name: 'Carol', grade: '', subject: '', hourlyRateCents: 1000001
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(formalKeyWrites(env), 0);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('历史超限学生只修改姓名成功，课时费保留', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(overLimitStore(5)) });
    env.storage.load();

    const result = await env.storage.updateStudent('s1', {
      name: 'Alice2', grade: 'G10', subject: 'Math', hourlyRateCents: 2000000
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.student.hourlyRateCents, 2000000);
    assert.strictEqual(env.storage.getLessons()[0].student, 'Alice2');
    assert.strictEqual(env.storage.getLessons()[0].feeCents, 66666667);
  });

  await test('历史超限学生修改课时费失败，正式数据不变', async function () {
    const raw = JSON.stringify(overLimitStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.updateStudent('s1', {
      name: 'Alice', grade: 'G10', subject: 'Math', hourlyRateCents: 1000001
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getStudents()[0].hourlyRateCents, 2000000);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('正常学生修改课时费到上限成功', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const result = await env.storage.updateStudent('s1', {
      name: 'Alice', grade: 'G10', subject: 'Math', hourlyRateCents: 1000000
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.student.hourlyRateCents, 1000000);
  });

  await test('正常学生修改课时费超过上限失败', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.updateStudent('s1', {
      name: 'Alice', grade: 'G10', subject: 'Math', hourlyRateCents: 1000001
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('新增课程：时长、单价、费用在上限内成功', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const result = await env.storage.addLesson({
      studentId: 's1', date: '2026-11-10', duration: 1440,
      hourlyRateCents: 1000000
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.duration, 1440);
    assert.strictEqual(result.lesson.hourlyRateCents, 1000000);
    assert.strictEqual(result.lesson.feeCents, 24000000);
  });

  await test('新增课程：时长超过 1440 分钟失败', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.addLesson({
      studentId: 's1', date: '2026-11-10', duration: 1441,
      hourlyRateCents: 10000
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(formalKeyWrites(env), 0);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('新增课程：单价超过 1,000,000 分失败', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.addLesson({
      studentId: 's1', date: '2026-11-10', duration: 60,
      hourlyRateCents: 1000001
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('新增课程：费用超过 24,000,000 分失败', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    const originalCalculate = env.calc.calculateLessonFeeCents;
    let calls = 0;

    env.calc.calculateLessonFeeCents = function (rateCents, duration) {
      calls += 1;
      if (calls === 1) return { ok: true, cents: 24000001, code: null };
      return originalCalculate(rateCents, duration);
    };

    let result;
    try {
      result = await env.storage.addLesson({
        studentId: 's1', date: '2026-11-10', duration: 1440,
        hourlyRateCents: 1000000
      });
    } finally {
      env.calc.calculateLessonFeeCents = originalCalculate;
    }

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('历史超限课程只修改日期成功，计费字段和费用不变', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(overLimitStore(5)) });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { date: '2026-11-09' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.duration, 2000);
    assert.strictEqual(result.lesson.hourlyRateCents, 2000000);
    assert.strictEqual(result.lesson.feeCents, 66666667);
    assert.strictEqual(result.lesson.id, 'l1');
    assert.strictEqual(result.lesson.createdAt, 2);
    assert.strictEqual(env.storage.getRevision(), 6);
  });

  await test('历史超限课程只修改学生关联成功，历史时薪和费用不变', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(overLimitStore(5)) });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { studentId: 's2' });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.studentId, 's2');
    assert.strictEqual(result.lesson.student, 'Bob');
    assert.strictEqual(result.lesson.hourlyRateCents, 2000000);
    assert.strictEqual(result.lesson.duration, 2000);
    assert.strictEqual(result.lesson.feeCents, 66666667);
  });

  await test('历史超限课程修改时长超过上限失败', async function () {
    const raw = JSON.stringify(overLimitStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { duration: 2001 });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getLessons()[0].duration, 2000);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('历史超限课程修改单价超过上限失败', async function () {
    const raw = JSON.stringify(overLimitStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { hourlyRateCents: 2000001 });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getLessons()[0].hourlyRateCents, 2000000);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('历史超限课程计费字段改到新范围内后成功并重算费用', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(overLimitStore(5)) });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', {
      duration: 1000,
      hourlyRateCents: 1000000
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.duration, 1000);
    assert.strictEqual(result.lesson.hourlyRateCents, 1000000);
    assert.strictEqual(result.lesson.feeCents, 16666667);
  });

  await test('历史费用略高于 24,000,000 但一致时非计费编辑保留费用', function () {
    const raw = JSON.stringify(feeEdgeStore(5));
    const env = createEnv({ [KEY]: raw });
    const store = env.storage.load();
    assert.strictEqual(store.lessons[0].feeCents, 24000012);

    return env.storage.updateLesson('l1', { date: '2026-11-09' }).then(function (result) {
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.lesson.feeCents, 24000012);
      assert.strictEqual(result.lesson.date, '2026-11-09');
    });
  });

  await test('新增课程时长为整数 30 分钟成功', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const result = await env.storage.addLesson({
      studentId: 's1', date: '2026-11-10', duration: 30,
      hourlyRateCents: 10000
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.duration, 30);
    assert.strictEqual(result.lesson.feeCents, 5000);
  });

  await test('新增课程时长 30.5 / NaN / Infinity / 0 / -1 均失败', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    for (const duration of [30.5, Number.NaN, Infinity, 0, -1]) {
      const result = await env.storage.addLesson({
        studentId: 's1', date: '2026-11-10', duration: duration,
        hourlyRateCents: 10000
      });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    }

    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(formalKeyWrites(env), 0);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('修改课程时长 60.2 失败，正式数据不变', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', { duration: 60.2 });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getLessons()[0].duration, 90);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('历史超限备份通过校验并恢复，恢复后按新规则处理计费字段', async function () {
    const backup = {
      app: 'TutorTrack',
      backupVersion: 2,
      dataVersion: 4,
      amountUnit: 'cent',
      students: [{
        id: 's1', name: 'Alice', grade: 'G10', subject: 'Math',
        hourlyRateCents: 2000000, createdAt: 1
      }],
      lessons: [{
        id: 'l1', studentId: 's1', student: 'Alice', date: '2026-11-01',
        duration: 2000, hourlyRateCents: 2000000, feeCents: 66666667,
        paid: false, createdAt: 2
      }]
    };
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    assert.strictEqual(env.storage.validateBackup(backup).ok, true);
    const result = await env.storage.restoreBackup(backup);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(env.storage.getLessons()[0].feeCents, 66666667);

    const dateResult = await env.storage.updateLesson('l1', { date: '2026-11-09' });
    assert.strictEqual(dateResult.ok, true);
    assert.strictEqual(dateResult.lesson.feeCents, 66666667);

    const durationResult = await env.storage.updateLesson('l1', { duration: 2001 });
    assert.strictEqual(durationResult.ok, false);

    const rateResult = await env.storage.updateLesson('l1', { hourlyRateCents: 2000001 });
    assert.strictEqual(rateResult.ok, false);
  });

  await test('v1-v3 高时薪/长时长迁移保持兼容，且不阻断后续普通写入', async function () {
    const raw = JSON.stringify(v3Store(0, 1000000, 1440));
    const env = createEnv({ [KEY]: raw });
    const store = env.storage.load();

    assert.strictEqual(store.students[0].hourlyRateCents, 100000000);
    assert.strictEqual(store.lessons[0].duration, 1440);
    assert.strictEqual(store.lessons[0].feeCents, 2400000000);
    assert.strictEqual(env.storage.getMigrationReport().migrated, true);

    const dateResult = await env.storage.updateLesson('l1', { date: '2026-11-09' });
    assert.strictEqual(dateResult.ok, true);
    assert.strictEqual(dateResult.lesson.feeCents, 2400000000);

    const addResult = await env.storage.addLesson({
      studentId: 's1', date: '2026-11-10', duration: 60,
      hourlyRateCents: 10000
    });
    assert.strictEqual(addResult.ok, true);
    assert.strictEqual(addResult.lesson.feeCents, 10000);
  });

  await test('删除失败：原记录仍然存在', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    env.setFailure(function (key) { return key === KEY; });

    const result = await env.storage.removeLesson('l1');

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'STORAGE_QUOTA_EXCEEDED');
    assert.strictEqual(env.storage.getLessons().length, 1);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('收款状态写入失败：原状态保持不变', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    env.setFailure(function (key) { return key === KEY; });

    const result = await env.storage.setLessonPaid('l1', true);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'STORAGE_QUOTA_EXCEEDED');
    assert.strictEqual(env.storage.getLessons()[0].paid, false);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('学生新增失败：不提交内存和 revision', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    env.setFailure(function (key) { return key === KEY; });

    const result = await env.storage.addStudent({
      name: 'Bob', grade: 'G8', subject: 'English', hourlyRateCents: 12000
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'STORAGE_QUOTA_EXCEEDED');
    assert.strictEqual(env.storage.getStudents().length, 1);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('学生编辑失败：原学生信息不变', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    env.setFailure(function (key) { return key === KEY; });

    const result = await env.storage.updateStudent('s1', {
      name: 'Alice2', grade: 'G10', subject: 'Math', hourlyRateCents: 15000
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'STORAGE_QUOTA_EXCEEDED');
    assert.strictEqual(env.storage.getStudents()[0].name, 'Alice');
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('学生删除失败：原学生仍然存在', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    env.setFailure(function (key) { return key === KEY; });

    const result = await env.storage.removeStudent('s1');

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'STORAGE_QUOTA_EXCEEDED');
    assert.strictEqual(env.storage.getStudents().length, 1);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('连续成功写入：revision 和持久化数据一致', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    await env.storage.addLesson({
      studentId: 's1', date: '2026-11-02', duration: 60, hourlyRateCents: 10000
    });
    await env.storage.addLesson({
      studentId: 's1', date: '2026-11-03', duration: 30, hourlyRateCents: 10000
    });
    await env.storage.addLesson({
      studentId: 's1', date: '2026-11-04', duration: 45, hourlyRateCents: 10000
    });

    const raw = JSON.parse(env.data.get(KEY));
    assert.strictEqual(env.storage.getRevision(), 8);
    assert.strictEqual(raw.revision, 8);
    assert.strictEqual(env.storage.getLessons().length, 4);
    assert.strictEqual(raw.lessons.length, 4);
    assert.strictEqual(env.storage.getLessons()[3].feeCents, 7500);
    assert.strictEqual(env.storage.getLessons()[3].feeCents, raw.lessons[3].feeCents);
  });

  await test('新增课程费用乘积溢出时拒绝写入', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.addLesson({
      studentId: 's1',
      date: '2026-11-08',
      duration: 1000000000000000,
      hourlyRateCents: 100000000
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.storage.getLessons().length, 1);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(env.data.get(KEY), raw);
  });

  await test('编辑课程费用乘积溢出时保留原记录', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.updateLesson('l1', {
      duration: 1000000000000000,
      hourlyRateCents: 100000000
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'VALIDATION_FAILED');
    assert.strictEqual(env.storage.getLessons()[0].feeCents, 22500);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(env.data.get(KEY), raw);
  });

  await test('v4 数据重复加载不会改变金额', function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    const firstRaw = env.data.get(KEY);

    const env2 = createEnv({ [KEY]: firstRaw });
    const store = env2.storage.load();
    assert.strictEqual(store.students[0].hourlyRateCents, 15000);
    assert.strictEqual(store.lessons[0].feeCents, 22500);
    assert.strictEqual(env2.storage.getRevision(), 5);
    assert.strictEqual(env2.storage.getMigrationReport().migrated, false);
    assert.strictEqual(env2.data.get(KEY), firstRaw);
  });

  await test('迁移时旧费用超出安全整数范围则停止迁移', function () {
    const data = v3Store(0, 1000000, 1000);
    data.lessons[0].duration = Number.MAX_SAFE_INTEGER;
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.storage.getMigrationReport().code, 'invalidField');
    assert.strictEqual(env.data.get(KEY), raw);
  });

  await test('新增课程遇到其他标签页写入时可安全重放', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const latest = currentStore(6);
    latest.lessons.push({
      id: 'l2', studentId: 's1', student: 'Alice',
      date: '2026-11-05', duration: 30, hourlyRateCents: 15000,
      feeCents: 7500, paid: false, createdAt: 3
    });
    env.data.set(KEY, JSON.stringify(latest));

    const result = await env.storage.addLesson({
      studentId: 's1', date: '2026-11-06', duration: 60, hourlyRateCents: 10000
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(env.storage.getRevision(), 7);
    assert.strictEqual(env.storage.getLessons().length, 3);
    assert.strictEqual(
      env.storage.getLessons().some(function (lesson) { return lesson.id === 'l2'; }),
      true
    );
  });

  await test('v4 费用在容差内正常加载', function () {
    const data = currentStore(5);
    data.lessons[0].feeCents = 22502; // 计算值 22500，容差 2
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    const store = env.storage.load();

    assert.strictEqual(store.lessons[0].feeCents, 22502);
    assert.strictEqual(env.storage.isWriteBlocked(), false);
    assert.strictEqual(env.storage.getMigrationReport().migrated, false);
    assert.strictEqual(env.data.get(KEY), raw);
  });

  await test('v4 费用偏离容差时停止加载并保留原始数据', function () {
    const data = currentStore(5);
    data.lessons[0].feeCents = 22503; // 计算值 22500，容差 2
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.storage.getMigrationReport().code, 'feeMismatch');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getLessons().length, 0);
    assert.strictEqual(env.storage.getRevision(), 0);
  });

  await test('v4 正式数据非法费用类型被拒绝且原始 KEY 保留', function () {
    [-1, 1.5, Number.MAX_SAFE_INTEGER + 1].forEach(function (feeCents) {
      const data = currentStore(5);
      data.lessons[0].feeCents = feeCents;
      const raw = JSON.stringify(data);
      const env = createEnv({ [KEY]: raw });
      env.storage.load();

      assert.strictEqual(env.storage.isWriteBlocked(), true);
      assert.strictEqual(env.data.get(KEY), raw);
      assert.strictEqual(env.storage.getLessons().length, 0);
      assert.strictEqual(env.storage.getRevision(), 0);
    });
  });

  await test('历史精确费用 rate=0 / duration=600 / fee=1 正常加载', function () {
    const raw = JSON.stringify(precisionStore(5));
    const env = createEnv({ [KEY]: raw });
    const store = env.storage.load();

    assert.strictEqual(store.lessons[0].hourlyRateCents, 0);
    assert.strictEqual(store.lessons[0].duration, 600);
    assert.strictEqual(store.lessons[0].feeCents, 1);
    assert.strictEqual(env.storage.isWriteBlocked(), false);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('新增课程时传入的 feeCents 不会覆盖自动计算结果', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const result = await env.storage.addLesson({
      studentId: 's1',
      date: '2026-11-10',
      duration: 60,
      hourlyRateCents: 10000,
      feeCents: 999999
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.lesson.feeCents, 10000);
  });

  await test('编辑课程遇到其他标签页修改时返回 REVISION_CONFLICT', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const latest = currentStore(6);
    latest.lessons[0].hourlyRateCents = 99900;
    latest.lessons[0].feeCents = 149850;
    const latestRaw = JSON.stringify(latest);
    env.data.set(KEY, latestRaw);

    const result = await env.storage.updateLesson('l1', { hourlyRateCents: 20000 });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'REVISION_CONFLICT');
    assert.strictEqual(env.storage.getLessons()[0].hourlyRateCents, 15000);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(env.data.get(KEY), latestRaw);
  });

  await test('序列化失败时内存和 revision 不变', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    const originalStringify = env.context.JSON.stringify;
    env.context.JSON.stringify = function () {
      throw new Error('forced serialization failure');
    };

    let result;
    try {
      result = await env.storage.addLesson({
        studentId: 's1', date: '2026-11-07', duration: 60, hourlyRateCents: 10000
      });
    } finally {
      env.context.JSON.stringify = originalStringify;
    }

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error.code, 'SERIALIZATION_FAILED');
    assert.strictEqual(env.storage.getLessons().length, 1);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('异常 revision 停止迁移', function () {
    const data = currentStore();
    data.revision = -1;
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.storage.getMigrationReport().code, 'invalidRevision');
  });

  await test('小数 schemaVersion 停止迁移', function () {
    const data = currentStore();
    data.schemaVersion = 4.5;
    data.version = 4.5;
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'invalidSchema');
  });

  await test('小数 revision 停止迁移', function () {
    const data = currentStore();
    data.revision = 1.5;
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.isWriteBlocked(), true);
    assert.strictEqual(env.storage.getMigrationReport().code, 'invalidRevision');
  });

  await test('revision 缺失时按 0 处理并递增迁移 revision', function () {
    const data = v2Store();
    const env = createEnv({ [KEY]: JSON.stringify(data) });
    env.storage.load();
    assert.strictEqual(env.storage.getRevision(), 1);
  });

  await test('备份格式不包含内部字段，并标记整数分', function () {
    const env = createEnv({ [KEY]: JSON.stringify(v2Store()) });
    env.storage.load();
    const backup = env.storage.createBackup();
    assert.strictEqual('revision' in backup, false);
    assert.strictEqual('schemaVersion' in backup, false);
    assert.strictEqual('writerId' in backup, false);
    assert.strictEqual(backup.dataVersion, 4);
    assert.strictEqual(backup.backupVersion, 2);
    assert.strictEqual(backup.amountUnit, 'cent');
    assert.strictEqual(backup.students.length, 1);
    assert.strictEqual(backup.students[0].hourlyRateCents, 15000);
    assert.strictEqual(backup.students[0].rate, undefined);
    assert.strictEqual(backup.lessons[0].feeCents, 22500);
  });

  await test('旧备份恢复：元金额转换为整数分并写入 v4', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    const oldBackup = {
      app: 'TutorTrack',
      backupVersion: 1,
      dataVersion: 3,
      students: [{
        id: 's_old', name: 'Old', grade: '', subject: '', rate: 100, createdAt: 1
      }],
      lessons: [{
        id: 'l_old', studentId: 's_old', student: 'Old',
        date: '2026-01-01', duration: 60, rate: 100, paid: false, createdAt: 1
      }]
    };
    const result = await env.storage.restoreBackup(oldBackup);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(env.storage.getRevision(), 6);
    assert.strictEqual(env.storage.isWriteBlocked(), false);
    const raw = JSON.parse(env.data.get(KEY));
    assert.strictEqual(raw.schemaVersion, 4);
    assert.strictEqual(raw.lessons.length, 1);
    assert.strictEqual(raw.students[0].hourlyRateCents, 10000);
    assert.strictEqual(raw.lessons[0].hourlyRateCents, 10000);
    assert.strictEqual(raw.lessons[0].feeCents, 10000);
    assert.strictEqual(raw.lessons[0].rate, undefined);
  });

  await test('新备份导出后可以原样导入，金额不会再次乘 100', async function () {
    const source = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    source.storage.load();
    const backup = source.storage.createBackup();

    const target = createEnv({ [KEY]: JSON.stringify(v3Store(9, 80, 60)) });
    target.storage.load();
    const result = await target.storage.restoreBackup(JSON.parse(JSON.stringify(backup)));

    assert.strictEqual(result.ok, true);
    assert.strictEqual(target.storage.getStudents()[0].hourlyRateCents, 15000);
    assert.strictEqual(target.storage.getLessons()[0].hourlyRateCents, 15000);
    assert.strictEqual(target.storage.getLessons()[0].feeCents, 22500);
    assert.strictEqual(target.storage.getRevision(), 11);
  });

  await test('新备份金额单位标记错误时拒绝导入', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    const backup = env.storage.createBackup();
    backup.amountUnit = 'yuan';
    const rawBefore = env.data.get(KEY);

    const result = await env.storage.restoreBackup(backup);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errorKey, 'backup.error.amountUnit');
    assert.strictEqual(env.data.get(KEY), rawBefore);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('新备份缺少 amountUnit 时拒绝导入', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    const backup = env.storage.createBackup();
    delete backup.amountUnit;

    const result = await env.storage.restoreBackup(backup);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errorKey, 'backup.error.amountUnit');
  });

  await test('新备份缺少 feeCents 时拒绝导入', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    const backup = env.storage.createBackup();
    delete backup.lessons[0].feeCents;

    const result = await env.storage.validateBackup(backup);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errorKey, 'backup.error.lessonFee');
  });

  await test('旧备份带 amountUnit:cent 但 dataVersion:3 时拒绝导入', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    const backup = {
      app: 'TutorTrack', backupVersion: 1, dataVersion: 3, amountUnit: 'cent',
      students: [{ id: 's_old', name: 'Old', rate: 100, createdAt: 1 }],
      lessons: []
    };
    const result = await env.storage.validateBackup(backup);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errorKey, 'backup.error.amountUnit');
  });

  await test('旧版备份的小数金额按分舍入后导入', async function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    const backup = {
      app: 'TutorTrack', backupVersion: 1, dataVersion: 3,
      students: [{
        id: 's_old', name: 'Old', grade: '', subject: '', rate: 120.5, createdAt: 1
      }],
      lessons: [{
        id: 'l_old', studentId: 's_old', student: 'Old',
        date: '2026-01-01', duration: 90, rate: 120.5, paid: true, createdAt: 1
      }]
    };
    const result = await env.storage.restoreBackup(backup);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(env.storage.getStudents()[0].hourlyRateCents, 12050);
    assert.strictEqual(env.storage.getLessons()[0].feeCents, 18075);
    assert.strictEqual(env.storage.getLessons()[0].paid, true);
  });

  await test('v4 备份费用在容差内允许导入', async function () {
    const backup = validRestoreBackup();
    backup.lessons[0].feeCents = 10001; // 计算值 10000，容差 2
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const result = await env.storage.restoreBackup(backup);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(env.storage.getLessons()[0].feeCents, 10001);
    assert.strictEqual(env.storage.getRevision(), 6);
  });

  await test('v4 备份费用低于计算值 1 分仍允许', function () {
    const backup = validRestoreBackup();
    backup.lessons[0].feeCents = 9999;
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    assert.strictEqual(env.storage.validateBackup(backup).ok, true);
  });

  await test('v4 备份费用偏离容差时拒绝且不写正式数据', async function () {
    const backup = validRestoreBackup();
    backup.lessons[0].feeCents = 10003; // 计算值 10000，容差 2
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.restoreBackup(backup);

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errorKey, 'backup.error.lessonFee');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getStudents()[0].name, 'Alice');
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(snapshotKeys(env).length, 0);
  });

  await test('v4 备份非法费用类型被拒绝', function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    const invalidFees = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1];

    invalidFees.forEach(function (feeCents) {
      const backup = validRestoreBackup();
      backup.lessons[0].feeCents = feeCents;
      const result = env.storage.validateBackup(backup);
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.errorKey, 'backup.error.lessonFee');
    });
  });

  await test('v4 备份非法时薪或时长被拒绝', function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();

    const badRate = validRestoreBackup();
    badRate.lessons[0].hourlyRateCents = -1;
    assert.strictEqual(
      env.storage.validateBackup(badRate).errorKey,
      'backup.error.lessonRate'
    );

    const badDuration = validRestoreBackup();
    badDuration.lessons[0].duration = 0;
    assert.strictEqual(
      env.storage.validateBackup(badDuration).errorKey,
      'backup.error.lessonDuration'
    );

    const fractionalDuration = validRestoreBackup();
    fractionalDuration.lessons[0].duration = 1.5;
    assert.strictEqual(
      env.storage.validateBackup(fractionalDuration).errorKey,
      'backup.error.lessonDuration'
    );
  });

  await test('getRawData 返回正式 KEY 原始字符串且不修改 cache/revision', function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    const beforeLessons = env.storage.getLessons();
    const beforeRevision = env.storage.getRevision();

    const result = env.storage.getRawData();

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.exists, true);
    assert.strictEqual(result.raw, raw);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getRevision(), beforeRevision);
    assert.deepStrictEqual(env.storage.getLessons(), beforeLessons);
    assert.strictEqual(formalKeyWrites(env), 0);
  });

  await test('加载失败、cache 清空后 getRawData 仍返回原始 KEY', function () {
    const data = currentStore(5);
    data.lessons[0].feeCents = 22503;
    const raw = JSON.stringify(data);
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    assert.strictEqual(env.storage.getLessons().length, 0);
    assert.strictEqual(env.storage.getRevision(), 0);

    const result = env.storage.getRawData();

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.exists, true);
    assert.strictEqual(result.raw, raw);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getRevision(), 0);
  });

  await test('getRawData 保留未知字段和非法 JSON', function () {
    const withUnknown = '{"schemaVersion":4,"students":[],"lessons":[],"unknown":"KEEP"}';
    const invalidJson = '{broken';
    [withUnknown, invalidJson].forEach(function (raw) {
      const env = createEnv({ [KEY]: raw });
      const result = env.storage.getRawData();
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.exists, true);
      assert.strictEqual(result.raw, raw);
    });
  });

  await test('KEY 不存在时 getRawData 返回明确的不存在状态', function () {
    const env = createEnv();
    const result = env.storage.getRawData();

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.exists, false);
    assert.strictEqual(result.raw, null);
  });

  await test('getRawData 读取抛异常时返回明确失败，不返回空字符串', function () {
    const env = createEnv({ [KEY]: 'raw' });
    env.setGetFailure(function (key) { return key === KEY; });

    const result = env.storage.getRawData();

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.exists, false);
    assert.strictEqual(result.raw, null);
    assert.strictEqual(result.errorKey, 'storage.error.readFailed');
  });

  await test('加载失败时 createBackup 返回 null，不生成空备份', function () {
    const data = currentStore(5);
    data.lessons[0].feeCents = 22503;
    const env = createEnv({ [KEY]: JSON.stringify(data) });
    env.storage.load();

    assert.strictEqual(env.storage.createBackup(), null);
  });

  await test('读取失败时 createBackup 返回 null', function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.setGetFailure(function (key) { return key === KEY; });
    env.storage.load();

    assert.strictEqual(env.storage.createBackup(), null);
  });

  await test('迁移/校验失败时 createBackup 返回 null', function () {
    const data = currentStore(5);
    data.students[0].nickname = 'unknown';
    const env = createEnv({ [KEY]: JSON.stringify(data) });
    env.storage.load();

    assert.strictEqual(env.storage.createBackup(), null);
  });

  await test('仅写入不可用时仍可生成标准备份', function () {
    const env = createEnv({ [KEY]: JSON.stringify(currentStore(5)) });
    env.storage.load();
    env.setFailure(function (key) { return key === KEY; });

    const backup = env.storage.createBackup();

    assert.ok(backup);
    assert.strictEqual(backup.students[0].name, 'Alice');
    assert.strictEqual(backup.lessons.length, 1);
  });

  await test('恢复前快照写入失败：中止恢复，正式数据和内存完全不变', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.setFailure(function (key) { return key.indexOf(SNAPSHOT_PREFIX) === 0; });

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'RESTORE_SNAPSHOT_FAILED');
    assert.strictEqual(result.errorKey, 'storage.error.restoreSnapshotFailed');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(formalKeyWrites(env), 0);
    assert.strictEqual(env.storage.getStudents()[0].name, 'Alice');
    assert.strictEqual(env.storage.getLessons().length, 1);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(snapshotKeys(env).length, 0);
    assert.strictEqual(env.storage.getStorageState().writeAvailable, false);
  });

  await test('恢复前快照回读失败：清理不完整快照，正式数据不写入', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    let snapshotReads = 0;
    env.setGetFailure(function (key) {
      if (key.indexOf(SNAPSHOT_PREFIX) !== 0) return false;
      snapshotReads += 1;
      return snapshotReads === 2;
    });

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'RESTORE_SNAPSHOT_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(formalKeyWrites(env), 0);
    assert.strictEqual(env.storage.getLessons().length, 1);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(snapshotKeys(env).length, 0);
  });

  await test('恢复前快照回读内容不一致：清理快照，正式数据不写入', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    let snapshotReads = 0;
    env.setGetOverride(function (key) {
      if (key.indexOf(SNAPSHOT_PREFIX) !== 0) return undefined;
      snapshotReads += 1;
      return snapshotReads === 2 ? '{"damaged":true}' : undefined;
    });

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'RESTORE_SNAPSHOT_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(formalKeyWrites(env), 0);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(snapshotKeys(env).length, 0);
  });

  await test('快照回读失败且清理也失败：仍然中止恢复，正式数据不变', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    let snapshotReads = 0;
    env.setGetOverride(function (key) {
      if (key.indexOf(SNAPSHOT_PREFIX) !== 0) return undefined;
      snapshotReads += 1;
      return snapshotReads === 2 ? 'damaged' : undefined;
    });
    env.setRemoveFailure(function (key) { return key.indexOf(SNAPSHOT_PREFIX) === 0; });

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'RESTORE_SNAPSHOT_FAILED');
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(formalKeyWrites(env), 0);
    assert.strictEqual(env.storage.getLessons().length, 1);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('当前没有正式数据：不要求快照，首次导入正常完成', async function () {
    const env = createEnv();
    env.data.set(KEY + ':pre-migrate:v1', 'KEEP-MIGRATE');
    env.storage.load();
    env.setFailure(function (key) { return key.indexOf(SNAPSHOT_PREFIX) === 0; });

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, true);
    assert.strictEqual(env.data.get(KEY + ':pre-migrate:v1'), 'KEEP-MIGRATE');
    assert.strictEqual(formalKeyWrites(env), 1);
    assert.strictEqual(env.storage.getStudents()[0].name, 'Bob');
    assert.strictEqual(env.storage.getLessons().length, 1);
    assert.strictEqual(env.storage.getRevision(), 1);
    const stored = JSON.parse(env.data.get(KEY));
    assert.strictEqual(stored.revision, 1);
    assert.strictEqual(stored.students[0].name, 'Bob');
    assert.strictEqual(snapshotKeys(env).length, 0);
  });

  await test('快照成功：快照与恢复前原始内容完全一致，并正常恢复', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, true);
    const snapshots = snapshotKeys(env);
    assert.strictEqual(snapshots.length, 1);
    assert.strictEqual(env.data.get(snapshots[0]), raw);
    const stored = JSON.parse(env.data.get(KEY));
    assert.strictEqual(stored.students[0].name, 'Bob');
    assert.strictEqual(stored.lessons[0].id, 'l_new');
    assert.strictEqual(env.storage.getStudents()[0].name, 'Bob');
    assert.strictEqual(env.storage.getRevision(), 6);
    assert.strictEqual(stored.revision, 6);
    assert.strictEqual(env.storage.getStorageState().writeAvailable, true);
  });

  await test('只读状态下恢复：在快照之前拒绝，不创建快照', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.setFailure(function () { return true; });
    env.storage.load();

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.errorKey, 'storage.writeError.blocked');
    assert.strictEqual(snapshotKeys(env).length, 0);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('快照键已存在：中止恢复，不覆盖旧快照也不继续导入', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.fixNow(1762156800000);
    const occupiedKey = SNAPSHOT_PREFIX + 1762156800000;
    env.data.set(occupiedKey, 'OLD SNAPSHOT');

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'RESTORE_SNAPSHOT_FAILED');
    assert.strictEqual(result.errorKey, 'storage.error.restoreSnapshotFailed');
    assert.strictEqual(env.data.get(occupiedKey), 'OLD SNAPSHOT');
    assert.strictEqual(snapshotKeys(env).length, 1);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(formalKeyWrites(env), 0);
    assert.strictEqual(env.storage.getStudents()[0].name, 'Alice');
    assert.strictEqual(env.storage.getRevision(), 5);
  });

  await test('恢复前快照失败后，已有数据仍可导出', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.setFailure(function (key) { return key.indexOf(SNAPSHOT_PREFIX) === 0; });
    await env.storage.restoreBackup(validRestoreBackup());

    const backup = env.storage.createBackup();
    assert.strictEqual(backup.students[0].name, 'Alice');
    assert.strictEqual(backup.lessons.length, 1);
  });

  await test('pre-restore 超过 5 份时按时间清理最旧快照', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.fixNow(1000);
    for (let i = 1; i <= 6; i += 1) {
      env.data.set(SNAPSHOT_PREFIX + i, 'snap-' + i);
    }

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, true);
    const keys = snapshotKeys(env).sort();
    assert.strictEqual(keys.length, 5);
    assert.strictEqual(env.data.has(SNAPSHOT_PREFIX + 1), false);
    assert.strictEqual(env.data.has(SNAPSHOT_PREFIX + 2), false);
    for (let i = 3; i <= 6; i += 1) {
      assert.strictEqual(env.data.get(SNAPSHOT_PREFIX + i), 'snap-' + i);
    }
    assert.strictEqual(env.data.get(SNAPSHOT_PREFIX + 1000), raw);
    const retained = JSON.parse(env.data.get(SNAPSHOT_PREFIX + 1000));
    assert.strictEqual(retained.students[0].name, 'Alice');
    assert.strictEqual(retained.lessons[0].id, 'l1');
    assert.strictEqual(retained.revision, 5);
    assert.strictEqual(formalKeyWrites(env), 1);
    assert.strictEqual(env.storage.getRevision(), 6);
    assert.strictEqual(env.storage.getStudents()[0].name, 'Bob');
  });

  await test('broken 超过 3 份时按时间清理最旧快照', function () {
    const raw = '{broken';
    const env = createEnv({ [KEY]: raw });
    env.fixNow(2000);
    for (let i = 1; i <= 4; i += 1) {
      env.data.set(BROKEN_PREFIX + i, 'broken-' + i);
    }

    env.storage.load();

    const keys = keysWithPrefix(env, BROKEN_PREFIX).sort();
    assert.strictEqual(keys.length, 3);
    assert.strictEqual(env.data.has(BROKEN_PREFIX + 1), false);
    assert.strictEqual(env.data.has(BROKEN_PREFIX + 2), false);
    assert.strictEqual(env.data.get(BROKEN_PREFIX + 3), 'broken-3');
    assert.strictEqual(env.data.get(BROKEN_PREFIX + 4), 'broken-4');
    assert.strictEqual(env.data.get(BROKEN_PREFIX + 2000), raw);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'corruptJson');
  });

  await test('broken 快照容量不足时不丢失原始损坏数据', function () {
    const raw = '{broken';
    const env = createEnv({ [KEY]: raw });
    env.fixNow(2100);
    const big = 'x'.repeat(524288);
    env.data.set(SNAPSHOT_PREFIX + 1, big);
    env.data.set(BROKEN_PREFIX + 2, big);

    env.storage.load();

    assert.strictEqual(keysWithPrefix(env, BROKEN_PREFIX).length, 1);
    assert.strictEqual(env.data.get(BROKEN_PREFIX + 2), big);
    assert.strictEqual(env.data.get(SNAPSHOT_PREFIX + 1), big);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'corruptJson');
  });

  await test('broken 快照同键冲突时不覆盖旧副本', function () {
    const raw = '{broken';
    const env = createEnv({ [KEY]: raw });
    env.fixNow(2200);
    const key = BROKEN_PREFIX + 2200;
    env.data.set(key, 'OLD-BROKEN');

    env.storage.load();

    assert.strictEqual(env.data.get(key), 'OLD-BROKEN');
    assert.strictEqual(keysWithPrefix(env, BROKEN_PREFIX).length, 1);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getMigrationReport().code, 'corruptJson');
  });

  await test('容量不足时不删除每类最后一份快照', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.fixNow(3000);
    const big = 'x'.repeat(524288);
    const preKey = SNAPSHOT_PREFIX + 1;
    const brokenKey = BROKEN_PREFIX + 2;
    env.data.set(preKey, big);
    env.data.set(brokenKey, big);

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'RESTORE_SNAPSHOT_FAILED');
    assert.strictEqual(env.data.get(preKey), big);
    assert.strictEqual(env.data.get(brokenKey), big);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(formalKeyWrites(env), 0);
  });

  await test('总容量超过预算时只清理允许清理的旧快照', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.fixNow(4000);
    const big = 'a'.repeat(400000);
    const oldOne = SNAPSHOT_PREFIX + 1;
    const oldTwo = SNAPSHOT_PREFIX + 2;
    const oldThree = SNAPSHOT_PREFIX + 3;
    env.data.set(oldOne, big);
    env.data.set(oldTwo, big + '2');
    env.data.set(oldThree, big + '3');
    env.data.set(SNAPSHOT_PREFIX + 'bad', 'keep-pre');
    env.data.set(BROKEN_PREFIX + 'bad', 'keep-broken');
    env.data.set(KEY + ':pre-migrate:v3', 'keep-migrate');

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, true);
    assert.strictEqual(env.data.has(oldOne), false);
    assert.strictEqual(env.data.get(oldTwo), big + '2');
    assert.strictEqual(env.data.get(oldThree), big + '3');
    assert.strictEqual(env.data.get(SNAPSHOT_PREFIX + 4000), raw);
    assert.strictEqual(env.data.get(SNAPSHOT_PREFIX + 'bad'), 'keep-pre');
    assert.strictEqual(env.data.get(BROKEN_PREFIX + 'bad'), 'keep-broken');
    assert.strictEqual(env.data.get(KEY + ':pre-migrate:v3'), 'keep-migrate');

    const managed = snapshotKeys(env).concat(keysWithPrefix(env, BROKEN_PREFIX));
    const total = managed.reduce(function (sum, key) {
      return sum + snapshotBytes(key, env.data.get(key));
    }, 0);
    assert.ok(total <= SNAPSHOT_BUDGET_BYTES);
    assert.strictEqual(env.storage.getRevision(), 6);
  });

  await test('清理允许的旧快照后容量仍不足时中止恢复', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.fixNow(5000);
    const big = 'b'.repeat(524288);
    const oldPre = SNAPSHOT_PREFIX + 1;
    const newPre = SNAPSHOT_PREFIX + 2;
    const oldBroken = BROKEN_PREFIX + 1;
    const newBroken = BROKEN_PREFIX + 2;
    env.data.set(oldPre, 'old-pre');
    env.data.set(newPre, big);
    env.data.set(oldBroken, 'old-broken');
    env.data.set(newBroken, big);

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'RESTORE_SNAPSHOT_FAILED');
    assert.strictEqual(env.data.get(newPre), big);
    assert.strictEqual(env.data.get(newBroken), big);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(formalKeyWrites(env), 0);
  });

  await test('删除旧快照失败时不会误判清理成功', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.fixNow(6000);
    for (let i = 1; i <= 6; i += 1) {
      env.data.set(SNAPSHOT_PREFIX + i, 'snap-' + i);
    }
    const newKey = SNAPSHOT_PREFIX + 6000;
    env.setRemoveFailure(function (key) {
      return key.indexOf(SNAPSHOT_PREFIX) === 0 && key !== newKey;
    });

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'RESTORE_SNAPSHOT_FAILED');
    for (let i = 1; i <= 6; i += 1) {
      assert.strictEqual(env.data.get(SNAPSHOT_PREFIX + i), 'snap-' + i);
    }
    assert.strictEqual(env.data.has(newKey), false);
    assert.strictEqual(env.data.get(KEY), raw);
    assert.strictEqual(env.storage.getRevision(), 5);
    assert.strictEqual(formalKeyWrites(env), 0);
  });

  await test('pre-migrate 快照不参与自动清理和容量预算', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.fixNow(7000);
    const migrationKey = KEY + ':pre-migrate:v3';
    const migrationRaw = 'm'.repeat(1100000);
    env.data.set(migrationKey, migrationRaw);
    env.data.set(SNAPSHOT_PREFIX + 1, 'small');

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, true);
    assert.strictEqual(env.data.get(migrationKey), migrationRaw);
    assert.strictEqual(env.data.get(SNAPSHOT_PREFIX + 7000), raw);
    assert.strictEqual(env.storage.getRevision(), 6);
  });

  await test('相似前缀和格式异常的键不会被删除', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.fixNow(8000);
    const unrelated = [
      SNAPSHOT_PREFIX + 'bad',
      SNAPSHOT_PREFIX + '123-1',
      BROKEN_PREFIX + 'bad',
      BROKEN_PREFIX + '123-1',
      KEY + ':foo',
      KEY + ':pre-migrate:v2'
    ];
    unrelated.forEach(function (key, index) {
      env.data.set(key, 'keep-' + index);
    });

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, true);
    unrelated.forEach(function (key, index) {
      assert.strictEqual(env.data.get(key), 'keep-' + index);
    });
    assert.strictEqual(env.data.has(SNAPSHOT_PREFIX + 8000), true);
  });

  await test('跨类型相同时间戳不会导致异常或误删', async function () {
    const raw = JSON.stringify(currentStore(5));
    const env = createEnv({ [KEY]: raw });
    env.storage.load();
    env.fixNow(9000);
    env.data.set(SNAPSHOT_PREFIX + 5000, 'pre-5000');
    env.data.set(BROKEN_PREFIX + 5000, 'broken-5000');
    env.data.set(SNAPSHOT_PREFIX + 'x', 'keep-x');

    const result = await env.storage.restoreBackup(validRestoreBackup());

    assert.strictEqual(result.ok, true);
    assert.strictEqual(env.data.get(SNAPSHOT_PREFIX + 5000), 'pre-5000');
    assert.strictEqual(env.data.get(BROKEN_PREFIX + 5000), 'broken-5000');
    assert.strictEqual(env.data.get(SNAPSHOT_PREFIX + 'x'), 'keep-x');
    assert.strictEqual(env.data.get(SNAPSHOT_PREFIX + 9000), raw);
  });

  const failed = results.filter((result) => !result.pass);
  results.forEach(function (result) {
    console.log((result.pass ? '通过' : '失败') + '：' + result.name);
    if (!result.pass) console.log(result.error);
  });
  console.log(
    (failed.length ? '有 ' + failed.length + ' 项失败' : '全部通过') +
    '，共 ' + results.length + ' 项测试'
  );
  process.exitCode = failed.length ? 1 : 0;
})();
