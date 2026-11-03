/* ============================================================
   i18n.js —— 多语言与本地化格式
   1. 三种语言的所有界面文案集中在这里
   2. 语言选择单独保存在 tutortrack:lang，不写入业务数据
   3. 日期、月份、星期、金额和时长格式也在这里统一处理
   ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'tutortrack:lang';
  var DEFAULT_LANGUAGE = 'zh-CN';
  var SUPPORTED = ['zh-CN', 'zh-TW', 'en'];

  var messages = {
    'zh-CN': {
      /* 应用与通用 */
      'app.title': 'TutorTrack · 家教课时管理',
      'app.description': '管理学生、记录家教课程、自动计算收入，支持日历视图、收入图表、本地 JSON 备份恢复的网页应用。',
      'app.skipLink': '跳到主要内容',
      'app.tagline': '家教课时管理 · 数据保存在本机浏览器',
      'app.noscript': '这个页面需要启用 JavaScript 才能工作，请在浏览器设置中允许 JavaScript。',
      'language.label': '语言',
      'currency.symbol': '¥',
      'currency.perHour': '{amount}/小时',
      'count.students_one': '{n} 位',
      'count.students_other': '{n} 位',
      'count.lessons_one': '{n} 节',
      'count.lessons_other': '{n} 节',
      'count.records_one': '{n} 条',
      'count.records_other': '{n} 条',
      'count.studentsLong_one': '{n} 名学生',
      'count.studentsLong_other': '{n} 名学生',
      'count.lessonsLong_one': '{n} 节课',
      'count.lessonsLong_other': '{n} 节课',
      'count.recordsLong_one': '{n} 条课程记录',
      'count.recordsLong_other': '{n} 条课程记录',
      'common.edit': '编辑',
      'common.delete': '删除',
      'common.unnamedStudent': '未命名学生',
      'common.originalStudent': '原学生',
      'common.unknown': '未知',
      'common.lessonEditAria': '编辑 {name} 在 {date} 的课程记录',
      'common.lessonDeleteAria': '删除 {name} 在 {date} 的课程记录',

      /* 收入概览 */
      'stats.title': '收入概览',
      'stats.hint.month': '按上课日期统计当前自然月',
      'stats.hint.year': '按上课日期统计当前自然年',
      'stats.scopeAria': '统计范围',
      'stats.period.month': '本月',
      'stats.period.year': '全年',
      'stats.label.receivable.month': '本月应收',
      'stats.label.receivable.year': '全年应收',
      'stats.label.paid.month': '本月已收',
      'stats.label.paid.year': '全年已收',
      'stats.label.unpaid.month': '本月待收',
      'stats.label.unpaid.year': '全年待收',
      'stats.label.count': '课程次数',
      'stats.label.duration': '总时长',

      /* 学生管理 */
      'students.title': '学生管理',
      'students.hint': '添加学生并设置默认时薪',
      'students.name.label': '学生昵称',
      'students.name.placeholder': '例如：小明',
      'students.grade.label': '年级',
      'students.grade.placeholder': '例如：初二',
      'students.subject.label': '科目',
      'students.subject.placeholder': '例如：数学',
      'students.rate.label': '默认时薪（元/小时）',
      'students.rate.placeholder': '例如：120',
      'students.form.hint': '填写学生信息后点击「添加学生」',
      'students.cancel': '取消编辑',
      'students.add': '添加学生',
      'students.save': '保存修改',
      'students.empty.title': '还没有学生',
      'students.empty.hint': '先在上面的表单添加一位学生，再记录课程。',
      'students.editingHint': '正在编辑「{name}」，修改后点击保存。',
      'students.editAria': '编辑学生 {name}',
      'students.deleteAria': '删除学生 {name}',
      'students.metaFallback': '未填写年级与科目',

      /* 记一节课 */
      'lessonForm.title': '记一节课',
      'lessonForm.hint': '收入 = 时长 ÷ 60 × 每小时课时费',
      'lessonForm.student.label': '学生',
      'lessonForm.student.placeholder': '请选择学生',
      'lessonForm.student.empty': '还没有学生，请先添加',
      'lessonForm.student.hint': '还没有学生，请先在上方「学生管理」中添加。',
      'lessonForm.date.label': '上课日期',
      'lessonForm.duration.label': '时长（分钟）',
      'lessonForm.duration.placeholder': '例如：90',
      'lessonForm.rate.label': '课时费（元/小时）',
      'lessonForm.rate.placeholder': '例如：120',
      'lessonForm.income.label': '本节课收入：',
      'lessonForm.submit': '添加记录',

      /* 课程记录 */
      'records.title': '课程记录',
      'records.hint.list': '按日期从新到旧排列',
      'records.hint.calendar': '按日期查看课程安排',
      'records.view.list': '列表视图',
      'records.view.calendar': '日历视图',
      'records.viewAria': '课程记录视图',
      'records.empty.title': '还没有课程记录',
      'records.empty.hint': '在上面填写一节课程，点击「添加记录」后就会出现在这里。',

      /* 收款状态 */
      'status.paid': '已收款',
      'status.unpaid': '待收款',
      'status.markPaid': '标记已收',
      'status.markUnpaid': '改回待收',
      'status.toggleAria': '{action}：{name} {date}',

      /* 编辑课程弹窗 */
      'modal.title': '编辑课程记录',
      'modal.hint': '修改后点击「保存」，原记录会被更新。',
      'modal.closeAria': '关闭编辑窗口',
      'modal.student.placeholder': '请选择学生',
      'modal.student.empty': '还没有学生',
      'modal.paid.label': '收款状态',
      'modal.cancel': '取消',
      'modal.save': '保存',
      'modal.removedStudent': '{name}（已删除）',

      /* 日历 */
      'calendar.prev': '上个月',
      'calendar.next': '下个月',
      'calendar.today': '今天',
      'calendar.gridAria': '课程日历',
      'calendar.weekday.mon': '一',
      'calendar.weekday.tue': '二',
      'calendar.weekday.wed': '三',
      'calendar.weekday.thu': '四',
      'calendar.weekday.fri': '五',
      'calendar.weekday.sat': '六',
      'calendar.weekday.sun': '日',
      'calendar.dayTitle': '选择日期',
      'calendar.daySummary': '点击日历中的日期查看当天课程。',
      'calendar.selectPromptTitle': '还没有选择日期',
      'calendar.selectPromptHint': '点击上方日历中的任意一天。',
      'calendar.noLessons': '当天没有课程',
      'calendar.noLessonsHint': '可以选择其他日期，或在上方「记一节课」中添加。',
      'calendar.noLessonsSummary': '当天没有课程记录。',
      'calendar.cellNoLessons': '{date} · {weekday} · 没有课程',
      'calendar.cellHasLessons': '{date} · {weekday} · {count} · 收入 {amount}',
      'calendar.daySummaryLine': '{count} · {duration} · 收入 {amount}',
      'calendar.moreNames': ' 等',

      /* 收入分析 */
      'analysis.title': '收入分析',
      'analysis.hint': '根据课程记录实时计算 · 金额单位：元',
      'analysis.trend.title': '月度收入趋势',
      'analysis.trend.hint': '没有课程的月份显示为 0，点击柱形可查看具体金额',
      'analysis.year': '年份',
      'analysis.trendAria': '{year} 年月度收入趋势，全年合计 {amount}',
      'analysis.trendEmpty': '该年份还没有课程记录，12 个月都显示为 0。',
      'analysis.trendBarAria': '{year} 年 {month}：{amount}，{count}',
      'analysis.payments.title': '应收 / 已收 / 待收',
      'analysis.payments.hint': '应收 = 已收 + 待收',
      'analysis.periodAria': '收入对比范围',
      'analysis.period.month': '按月',
      'analysis.period.year': '按年',
      'analysis.month': '月份',
      'analysis.receivable': '应收',
      'analysis.paid': '已收',
      'analysis.unpaid': '待收',
      'analysis.paymentEmpty': '当前范围内还没有课程记录。',
      'analysis.paymentBarAria': '{range}：应收 {receivable}，已收 {paid}，待收 {unpaid}',
      'analysis.rank.title': '学生收入排行',
      'analysis.rank.hint': '按收入从高到低排列',
      'analysis.rank.hintWithRange': '{range} · 按收入从高到低排列',
      'analysis.rank.emptyTitle': '当前范围还没有学生收入',
      'analysis.rank.emptyHint': '添加课程记录后，这里会按学生汇总收入并排序。',
      'analysis.rank.itemAria': '{name}：{count}，收入 {amount}',
      'analysis.rank.meta': '{count} · {amount}',
      'analysis.deletedSuffix': '（已删除）',

      /* 数据管理 */
      'data.title': '数据管理',
      'data.hint': '备份文件只保存在你的设备上，不会上传到任何服务器',
      'data.export.title': '导出备份',
      'data.export.hint': '将全部学生和课程记录导出为 JSON 文件，可用于以后恢复或换设备。',
      'data.export.button': '导出备份',
      'data.import.title': '导入备份',
      'data.import.hint': '选择之前导出的 JSON 文件。导入会替换当前全部数据，操作前会再次确认。',
      'data.import.button': '选择备份文件',
      'data.summary': '当前数据：{students} · {lessons}',
      'data.footer': '数据只保存在当前浏览器中，清除浏览器数据会一并删除。建议定期备份。',

      /* 表单校验 */
      'validation.lesson.studentRequired': '请选择学生。',
      'validation.lesson.studentNone': '还没有学生，请先在「学生管理」中添加。',
      'validation.lesson.dateRequired': '请选择上课日期。',
      'validation.lesson.dateInvalid': '日期格式不正确。',
      'validation.lesson.durationRequired': '请填写课程时长。',
      'validation.lesson.durationInteger': '时长请填写整数分钟。',
      'validation.lesson.durationRange': '时长需在 1～1440 分钟之间。',
      'validation.lesson.rateRequired': '请填写课时费。',
      'validation.lesson.rateNumber': '课时费请填写数字。',
      'validation.lesson.rateRange': '课时费需在 0～10000 元之间。',
      'validation.student.nameRequired': '请填写学生昵称。',
      'validation.student.nameTooLong': '昵称最多 20 个字符。',
      'validation.student.rateRequired': '请填写默认时薪。',
      'validation.student.rateNumber': '默认时薪请填写数字。',
      'validation.student.rateRange': '默认时薪需在 0～10000 元之间。',

      /* 操作提示 */
      'toast.lesson.added': '已记录：{student} · {duration}',
      'toast.lesson.addedUnsaved': '记录已添加，但未能写入本地存储，刷新后会丢失。',
      'toast.lesson.addFailed': '添加失败：数据格式不正确。',
      'toast.lesson.deleted': '已删除一条课程记录。',
      'toast.lesson.deletedUnsaved': '已删除，但未能同步到本地存储，刷新后可能恢复。',
      'toast.lesson.missing': '这条记录已经不存在了，请刷新页面。',
      'toast.lesson.deleteFailed': '删除失败：没有找到这条记录。',
      'toast.lesson.updateMissing': '修改失败：没有找到这条记录。',
      'toast.lesson.paidMarked': '已标记为已收款。',
      'toast.lesson.unpaidMarked': '已改回待收款。',
      'toast.lesson.paidMarkedUnsaved': '已标记为已收款，但未能写入本地存储，刷新后可能恢复。',
      'toast.lesson.unpaidMarkedUnsaved': '已改回待收款，但未能写入本地存储，刷新后可能恢复。',
      'toast.lesson.updated': '已保存课程记录的修改。',
      'toast.lesson.updatedUnsaved': '已保存，但未能写入本地存储，刷新后可能恢复。',
      'toast.lesson.updateFailed': '保存失败：记录不存在或数据格式不正确。',
      'toast.lesson.noEditing': '没有正在编辑的记录，请重新打开编辑窗口。',
      'toast.student.missing': '这位学生已经不存在了，请刷新页面。',
      'toast.student.saved': '已保存「{name}」的修改。',
      'toast.student.added': '已添加学生「{name}」。',
      'toast.student.savedUnsaved': '已保存「{name}」的修改，但未能写入本地存储，刷新后会丢失。',
      'toast.student.addedUnsaved': '已添加学生「{name}」，但未能写入本地存储，刷新后会丢失。',
      'toast.student.saveFailed': '保存失败：请检查学生信息。',
      'toast.student.deleted': '已删除学生「{name}」，历史课程记录已保留。',
      'toast.student.deletedUnsaved': '已删除，但未能同步到本地存储，刷新后可能恢复。',
      'toast.student.deleteFailed': '删除失败：没有找到这位学生。',
      'toast.export.success': '已导出备份：{students}、{lessons}。',
      'toast.export.failed': '导出失败：浏览器不支持文件下载。',
      'toast.import.tooLarge': '导入失败：备份文件过大。',
      'toast.import.invalidJson': '导入失败：文件不是有效的 JSON。',
      'toast.import.readFailed': '导入失败：无法读取文件。',
      'toast.import.cancelled': '已取消导入。',

      /* 确认框与导入提示 */
      'confirm.deleteLesson': '确定删除 {name} 在 {date} 的课程记录吗？\n此操作无法撤销。',
      'confirm.deleteStudent': '确定删除学生「{name}」吗？',
      'confirm.deleteStudentWithLessons': '确定删除学生「{name}」吗？\n他/她的历史课程记录（共 {count}）会保留，并继续计入收入统计。',
      'confirm.deleteStudentNoLessons': '确定删除学生「{name}」吗？\n该学生还没有课程记录。',
      'import.tooLarge': '导入失败：备份文件超过 20 MB。',
      'import.invalidJson': '导入失败：文件不是有效的 JSON。',
      'import.readFailed': '导入失败：无法读取文件。',
      'import.failed': '导入失败：{reason}',
      'import.cancelled': '已取消导入，当前数据没有改变。',
      'import.success': '导入成功：已恢复 {students}、{lessons}。',
      'import.noExportTime': '备份文件中未记录',
      'confirm.import': '即将导入备份：\n· 学生：{students}\n· 课程记录：{lessons}\n· 导出时间：{exportedAt}\n\n注意：导入会替换当前现有的 {currentStudents}和 {currentLessons}，现有数据将被覆盖。\n建议先导出当前数据作为备份。\n\n确定继续导入吗？',

      /* 本地存储与备份校验 */
      'storage.warning.unavailable': '无法访问浏览器本地存储（可能处于无痕模式或禁用了站点数据）。本次记录在刷新后会丢失。',
      'storage.error.localUnavailable': '无法访问浏览器本地存储，本次记录在刷新后会丢失。',
      'storage.error.readFailed': '读取本地数据失败，本次记录在刷新后会丢失。',
      'storage.error.corrupt': '本地数据格式异常，已备份原数据并重置为空列表。',
      'storage.error.saveFailed': '保存失败：浏览器存储空间不足或已被禁用。',
      'storage.error.restoreUnavailable': '浏览器本地存储不可用，无法恢复备份。',
      'storage.error.restoreReadFailed': '读取当前数据失败，未执行恢复。',
      'storage.error.restoreSerializeFailed': '备份数据处理失败，当前数据未改变。',
      'storage.error.restoreWriteFailed': '写入本地存储失败，当前数据未改变。',
      'backup.error.notObject': '备份文件内容不是有效的 JSON 对象。',
      'backup.error.notBackup': '这不是 TutorTrack 的备份文件（缺少 app 标记）。',
      'backup.error.backupVersionMissing': '备份文件缺少有效的 backupVersion。',
      'backup.error.backupVersionNewer': '备份文件版本较新（v{version}），当前应用最高支持 v{max}。',
      'backup.error.dataVersionMissing': '备份文件缺少有效的 dataVersion。',
      'backup.error.dataVersionNewer': '备份数据版本较新（v{version}），当前应用最高支持 v{max}。',
      'backup.error.arraysMissing': '备份文件缺少 students 或 lessons 数组。',
      'backup.error.studentFormat': '第 {index} 名学生格式不正确。',
      'backup.error.studentId': '第 {index} 名学生缺少 id。',
      'backup.error.studentDuplicate': '学生 id 重复：{id}',
      'backup.error.studentName': '第 {index} 名学生缺少昵称。',
      'backup.error.studentRate': '第 {index} 名学生的时薪不正确。',
      'backup.error.lessonFormat': '第 {index} 条课程记录格式不正确。',
      'backup.error.lessonId': '第 {index} 条课程记录缺少 id。',
      'backup.error.lessonDuplicate': '课程记录 id 重复：{id}',
      'backup.error.lessonStudentId': '第 {index} 条课程记录缺少 studentId。',
      'backup.error.lessonStudentName': '第 {index} 条课程记录缺少学生昵称。',
      'backup.error.lessonDate': '第 {index} 条课程记录的上课日期不正确。',
      'backup.error.lessonDuration': '第 {index} 条课程记录的时长必须是大于 0 的整数分钟。',
      'backup.error.lessonRate': '第 {index} 条课程记录的课时费不正确。',
      'backup.error.lessonPaid': '第 {index} 条课程记录的收款状态不正确。',

      /* 日期与时长 */
      'duration.hour_one': '{n} 小时',
      'duration.hour_other': '{n} 小时',
      'duration.minute_one': '{n} 分钟',
      'duration.minute_other': '{n} 分钟',
      'date.monthLabel': '{year} 年 {month} 月',
      'date.yearLabel': '{year} 年',
      'date.long': '{date} · {weekday}'
    },

    'zh-TW': {
      'app.title': 'TutorTrack · 家教課時管理',
      'app.description': '管理學生、記錄家教課程、自動計算收入，支援日曆檢視、收入圖表、本機 JSON 備份還原的網頁應用程式。',
      'app.skipLink': '跳到主要內容',
      'app.tagline': '家教課時管理 · 資料儲存在本機瀏覽器',
      'app.noscript': '這個頁面需要啟用 JavaScript 才能運作，請在瀏覽器設定中允許 JavaScript。',
      'language.label': '語言',
      'currency.symbol': '¥',
      'currency.perHour': '{amount}/小時',
      'count.students_one': '{n} 位',
      'count.students_other': '{n} 位',
      'count.lessons_one': '{n} 節',
      'count.lessons_other': '{n} 節',
      'count.records_one': '{n} 條',
      'count.records_other': '{n} 條',
      'count.studentsLong_one': '{n} 名學生',
      'count.studentsLong_other': '{n} 名學生',
      'count.lessonsLong_one': '{n} 節課',
      'count.lessonsLong_other': '{n} 節課',
      'count.recordsLong_one': '{n} 條課程紀錄',
      'count.recordsLong_other': '{n} 條課程紀錄',
      'common.edit': '編輯',
      'common.delete': '刪除',
      'common.unnamedStudent': '未命名學生',
      'common.originalStudent': '原學生',
      'common.unknown': '未知',
      'common.lessonEditAria': '編輯 {name} 在 {date} 的課程紀錄',
      'common.lessonDeleteAria': '刪除 {name} 在 {date} 的課程紀錄',

      'stats.title': '收入概覽',
      'stats.hint.month': '依上課日期統計目前自然月',
      'stats.hint.year': '依上課日期統計目前自然年',
      'stats.scopeAria': '統計範圍',
      'stats.period.month': '本月',
      'stats.period.year': '全年',
      'stats.label.receivable.month': '本月應收',
      'stats.label.receivable.year': '全年應收',
      'stats.label.paid.month': '本月已收',
      'stats.label.paid.year': '全年已收',
      'stats.label.unpaid.month': '本月待收',
      'stats.label.unpaid.year': '全年待收',
      'stats.label.count': '課程次數',
      'stats.label.duration': '總時長',

      'students.title': '學生管理',
      'students.hint': '新增學生並設定預設時薪',
      'students.name.label': '學生暱稱',
      'students.name.placeholder': '例如：小明',
      'students.grade.label': '年級',
      'students.grade.placeholder': '例如：國二',
      'students.subject.label': '科目',
      'students.subject.placeholder': '例如：數學',
      'students.rate.label': '預設時薪（元/小時）',
      'students.rate.placeholder': '例如：120',
      'students.form.hint': '填寫學生資訊後點擊「新增學生」',
      'students.cancel': '取消編輯',
      'students.add': '新增學生',
      'students.save': '儲存修改',
      'students.empty.title': '尚無學生',
      'students.empty.hint': '先在上方表單新增一位學生，再記錄課程。',
      'students.editingHint': '正在編輯「{name}」，修改後點擊儲存。',
      'students.editAria': '編輯學生 {name}',
      'students.deleteAria': '刪除學生 {name}',
      'students.metaFallback': '未填寫年級與科目',

      'lessonForm.title': '記一節課',
      'lessonForm.hint': '收入 = 時長 ÷ 60 × 每小時課時費',
      'lessonForm.student.label': '學生',
      'lessonForm.student.placeholder': '請選擇學生',
      'lessonForm.student.empty': '尚無學生，請先新增',
      'lessonForm.student.hint': '尚無學生，請先在上方「學生管理」中新增。',
      'lessonForm.date.label': '上課日期',
      'lessonForm.duration.label': '時長（分鐘）',
      'lessonForm.duration.placeholder': '例如：90',
      'lessonForm.rate.label': '課時費（元/小時）',
      'lessonForm.rate.placeholder': '例如：120',
      'lessonForm.income.label': '本節課收入：',
      'lessonForm.submit': '新增紀錄',

      'records.title': '課程紀錄',
      'records.hint.list': '依日期由新到舊排列',
      'records.hint.calendar': '依日期查看課程安排',
      'records.view.list': '列表檢視',
      'records.view.calendar': '日曆檢視',
      'records.viewAria': '課程紀錄檢視',
      'records.empty.title': '尚無課程紀錄',
      'records.empty.hint': '在上方填寫一節課程，點擊「新增紀錄」後就會出現在這裡。',

      'status.paid': '已收款',
      'status.unpaid': '待收款',
      'status.markPaid': '標記已收',
      'status.markUnpaid': '改回待收',
      'status.toggleAria': '{action}：{name} {date}',

      'modal.title': '編輯課程紀錄',
      'modal.hint': '修改後點擊「儲存」，原紀錄會被更新。',
      'modal.closeAria': '關閉編輯視窗',
      'modal.student.placeholder': '請選擇學生',
      'modal.student.empty': '尚無學生',
      'modal.paid.label': '收款狀態',
      'modal.cancel': '取消',
      'modal.save': '儲存',
      'modal.removedStudent': '{name}（已刪除）',

      'calendar.prev': '上個月',
      'calendar.next': '下個月',
      'calendar.today': '今天',
      'calendar.gridAria': '課程日曆',
      'calendar.weekday.mon': '一',
      'calendar.weekday.tue': '二',
      'calendar.weekday.wed': '三',
      'calendar.weekday.thu': '四',
      'calendar.weekday.fri': '五',
      'calendar.weekday.sat': '六',
      'calendar.weekday.sun': '日',
      'calendar.dayTitle': '選擇日期',
      'calendar.daySummary': '點擊日曆中的日期查看當天課程。',
      'calendar.selectPromptTitle': '尚未選擇日期',
      'calendar.selectPromptHint': '點擊上方日曆中的任意一天。',
      'calendar.noLessons': '當天沒有課程',
      'calendar.noLessonsHint': '可以選擇其他日期，或在上方「記一節課」中新增。',
      'calendar.noLessonsSummary': '當天沒有課程紀錄。',
      'calendar.cellNoLessons': '{date} · {weekday} · 沒有課程',
      'calendar.cellHasLessons': '{date} · {weekday} · {count} · 收入 {amount}',
      'calendar.daySummaryLine': '{count} · {duration} · 收入 {amount}',
      'calendar.moreNames': ' 等',

      'analysis.title': '收入分析',
      'analysis.hint': '根據課程紀錄即時計算 · 金額單位：元',
      'analysis.trend.title': '月度收入趨勢',
      'analysis.trend.hint': '沒有課程的月份顯示為 0，點擊柱形可查看具體金額',
      'analysis.year': '年份',
      'analysis.trendAria': '{year} 年月度收入趨勢，全年合計 {amount}',
      'analysis.trendEmpty': '該年份尚無課程紀錄，12 個月都顯示為 0。',
      'analysis.trendBarAria': '{year} 年 {month}：{amount}，{count}',
      'analysis.payments.title': '應收 / 已收 / 待收',
      'analysis.payments.hint': '應收 = 已收 + 待收',
      'analysis.periodAria': '收入比較範圍',
      'analysis.period.month': '按月',
      'analysis.period.year': '按年',
      'analysis.month': '月份',
      'analysis.receivable': '應收',
      'analysis.paid': '已收',
      'analysis.unpaid': '待收',
      'analysis.paymentEmpty': '目前範圍內尚無課程紀錄。',
      'analysis.paymentBarAria': '{range}：應收 {receivable}，已收 {paid}，待收 {unpaid}',
      'analysis.rank.title': '學生收入排行',
      'analysis.rank.hint': '依收入由高到低排列',
      'analysis.rank.hintWithRange': '{range} · 依收入由高到低排列',
      'analysis.rank.emptyTitle': '目前範圍尚無學生收入',
      'analysis.rank.emptyHint': '新增課程紀錄後，這裡會依學生彙總收入並排序。',
      'analysis.rank.itemAria': '{name}：{count}，收入 {amount}',
      'analysis.rank.meta': '{count} · {amount}',
      'analysis.deletedSuffix': '（已刪除）',

      'data.title': '資料管理',
      'data.hint': '備份檔案只儲存在你的裝置上，不會上傳到任何伺服器',
      'data.export.title': '匯出備份',
      'data.export.hint': '將全部學生和課程紀錄匯出為 JSON 檔案，可用於日後還原或換裝置。',
      'data.export.button': '匯出備份',
      'data.import.title': '匯入備份',
      'data.import.hint': '選擇之前匯出的 JSON 檔案。匯入會取代目前全部資料，操作前會再次確認。',
      'data.import.button': '選擇備份檔案',
      'data.summary': '目前資料：{students} · {lessons}',
      'data.footer': '資料只儲存在目前瀏覽器中，清除瀏覽器資料會一併刪除。建議定期備份。',

      'validation.lesson.studentRequired': '請選擇學生。',
      'validation.lesson.studentNone': '尚無學生，請先在「學生管理」中新增。',
      'validation.lesson.dateRequired': '請選擇上課日期。',
      'validation.lesson.dateInvalid': '日期格式不正確。',
      'validation.lesson.durationRequired': '請填寫課程時長。',
      'validation.lesson.durationInteger': '時長請填寫整數分鐘。',
      'validation.lesson.durationRange': '時長需在 1～1440 分鐘之間。',
      'validation.lesson.rateRequired': '請填寫課時費。',
      'validation.lesson.rateNumber': '課時費請填寫數字。',
      'validation.lesson.rateRange': '課時費需在 0～10000 元之間。',
      'validation.student.nameRequired': '請填寫學生暱稱。',
      'validation.student.nameTooLong': '暱稱最多 20 個字元。',
      'validation.student.rateRequired': '請填寫預設時薪。',
      'validation.student.rateNumber': '預設時薪請填寫數字。',
      'validation.student.rateRange': '預設時薪需在 0～10000 元之間。',

      'toast.lesson.added': '已記錄：{student} · {duration}',
      'toast.lesson.addedUnsaved': '紀錄已新增，但未能寫入本機儲存，重新整理後會遺失。',
      'toast.lesson.addFailed': '新增失敗：資料格式不正確。',
      'toast.lesson.deleted': '已刪除一筆課程紀錄。',
      'toast.lesson.deletedUnsaved': '已刪除，但未能同步到本機儲存，重新整理後可能恢復。',
      'toast.lesson.missing': '這筆紀錄已經不存在了，請重新整理頁面。',
      'toast.lesson.deleteFailed': '刪除失敗：找不到這筆紀錄。',
      'toast.lesson.updateMissing': '修改失敗：找不到這筆紀錄。',
      'toast.lesson.paidMarked': '已標記為已收款。',
      'toast.lesson.unpaidMarked': '已改回待收款。',
      'toast.lesson.paidMarkedUnsaved': '已標記為已收款，但未能寫入本機儲存，重新整理後可能恢復。',
      'toast.lesson.unpaidMarkedUnsaved': '已改回待收款，但未能寫入本機儲存，重新整理後可能恢復。',
      'toast.lesson.updated': '已儲存課程紀錄的修改。',
      'toast.lesson.updatedUnsaved': '已儲存，但未能寫入本機儲存，重新整理後可能恢復。',
      'toast.lesson.updateFailed': '儲存失敗：紀錄不存在或資料格式不正確。',
      'toast.lesson.noEditing': '沒有正在編輯的紀錄，請重新開啟編輯視窗。',
      'toast.student.missing': '這位學生已經不存在了，請重新整理頁面。',
      'toast.student.saved': '已儲存「{name}」的修改。',
      'toast.student.added': '已新增學生「{name}」。',
      'toast.student.savedUnsaved': '已儲存「{name}」的修改，但未能寫入本機儲存，重新整理後會遺失。',
      'toast.student.addedUnsaved': '已新增學生「{name}」，但未能寫入本機儲存，重新整理後會遺失。',
      'toast.student.saveFailed': '儲存失敗：請檢查學生資訊。',
      'toast.student.deleted': '已刪除學生「{name}」，歷史課程紀錄已保留。',
      'toast.student.deletedUnsaved': '已刪除，但未能同步到本機儲存，重新整理後可能恢復。',
      'toast.student.deleteFailed': '刪除失敗：找不到這位學生。',
      'toast.export.success': '已匯出備份：{students}、{lessons}。',
      'toast.export.failed': '匯出失敗：瀏覽器不支援檔案下載。',
      'toast.import.tooLarge': '匯入失敗：備份檔案過大。',
      'toast.import.invalidJson': '匯入失敗：檔案不是有效的 JSON。',
      'toast.import.readFailed': '匯入失敗：無法讀取檔案。',
      'toast.import.cancelled': '已取消匯入。',

      'confirm.deleteLesson': '確定刪除 {name} 在 {date} 的課程紀錄嗎？\n此操作無法復原。',
      'confirm.deleteStudent': '確定刪除學生「{name}」嗎？',
      'confirm.deleteStudentWithLessons': '確定刪除學生「{name}」嗎？\n他/她的歷史課程紀錄（共 {count}）會保留，並繼續計入收入統計。',
      'confirm.deleteStudentNoLessons': '確定刪除學生「{name}」嗎？\n該學生尚無課程紀錄。',
      'import.tooLarge': '匯入失敗：備份檔案超過 20 MB。',
      'import.invalidJson': '匯入失敗：檔案不是有效的 JSON。',
      'import.readFailed': '匯入失敗：無法讀取檔案。',
      'import.failed': '匯入失敗：{reason}',
      'import.cancelled': '已取消匯入，目前資料沒有改變。',
      'import.success': '匯入成功：已還原 {students}、{lessons}。',
      'import.noExportTime': '備份檔案中未記錄',
      'confirm.import': '即將匯入備份：\n· 學生：{students}\n· 課程紀錄：{lessons}\n· 匯出時間：{exportedAt}\n\n注意：匯入會取代目前現有的 {currentStudents}和 {currentLessons}，現有資料將被覆蓋。\n建議先匯出目前資料作為備份。\n\n確定繼續匯入嗎？',

      'storage.warning.unavailable': '無法存取瀏覽器本機儲存空間（可能處於無痕模式或停用了網站資料）。本次紀錄在重新整理後會遺失。',
      'storage.error.localUnavailable': '無法存取瀏覽器本機儲存空間，本次紀錄在重新整理後會遺失。',
      'storage.error.readFailed': '讀取本機資料失敗，本次紀錄在重新整理後會遺失。',
      'storage.error.corrupt': '本機資料格式異常，已備份原始資料並重設為空清單。',
      'storage.error.saveFailed': '儲存失敗：瀏覽器儲存空間不足或已被停用。',
      'storage.error.restoreUnavailable': '瀏覽器本機儲存空間不可用，無法還原備份。',
      'storage.error.restoreReadFailed': '讀取目前資料失敗，未執行還原。',
      'storage.error.restoreSerializeFailed': '備份資料處理失敗，目前資料未改變。',
      'storage.error.restoreWriteFailed': '寫入本機儲存空間失敗，目前資料未改變。',
      'backup.error.notObject': '備份檔案內容不是有效的 JSON 物件。',
      'backup.error.notBackup': '這不是 TutorTrack 的備份檔案（缺少 app 標記）。',
      'backup.error.backupVersionMissing': '備份檔案缺少有效的 backupVersion。',
      'backup.error.backupVersionNewer': '備份檔案版本較新（v{version}），目前應用程式最高支援 v{max}。',
      'backup.error.dataVersionMissing': '備份檔案缺少有效的 dataVersion。',
      'backup.error.dataVersionNewer': '備份資料版本較新（v{version}），目前應用程式最高支援 v{max}。',
      'backup.error.arraysMissing': '備份檔案缺少 students 或 lessons 陣列。',
      'backup.error.studentFormat': '第 {index} 名學生格式不正確。',
      'backup.error.studentId': '第 {index} 名學生缺少 id。',
      'backup.error.studentDuplicate': '學生 id 重複：{id}',
      'backup.error.studentName': '第 {index} 名學生缺少暱稱。',
      'backup.error.studentRate': '第 {index} 名學生的時薪不正確。',
      'backup.error.lessonFormat': '第 {index} 筆課程紀錄格式不正確。',
      'backup.error.lessonId': '第 {index} 筆課程紀錄缺少 id。',
      'backup.error.lessonDuplicate': '課程紀錄 id 重複：{id}',
      'backup.error.lessonStudentId': '第 {index} 筆課程紀錄缺少 studentId。',
      'backup.error.lessonStudentName': '第 {index} 筆課程紀錄缺少學生暱稱。',
      'backup.error.lessonDate': '第 {index} 筆課程紀錄的上課日期不正確。',
      'backup.error.lessonDuration': '第 {index} 筆課程紀錄的時長必須是大於 0 的整數分鐘。',
      'backup.error.lessonRate': '第 {index} 筆課程紀錄的課時費不正確。',
      'backup.error.lessonPaid': '第 {index} 筆課程紀錄的收款狀態不正確。',

      'duration.hour_one': '{n} 小時',
      'duration.hour_other': '{n} 小時',
      'duration.minute_one': '{n} 分鐘',
      'duration.minute_other': '{n} 分鐘',
      'date.monthLabel': '{year} 年 {month} 月',
      'date.yearLabel': '{year} 年',
      'date.long': '{date} · {weekday}'
    },

    en: {
      'app.title': 'TutorTrack · Tutoring Manager',
      'app.description': 'Manage students, log tutoring lessons, and track income automatically. Includes a calendar view, income charts, and local JSON backup and restore.',
      'app.skipLink': 'Skip to main content',
      'app.tagline': 'Tutoring management · Data stays in this browser',
      'app.noscript': 'This app requires JavaScript. Please enable it in your browser settings.',
      'language.label': 'Language',
      'currency.symbol': '¥',
      'currency.perHour': '{amount}/hr',
      'count.students_one': '{n} student',
      'count.students_other': '{n} students',
      'count.lessons_one': '{n} lesson',
      'count.lessons_other': '{n} lessons',
      'count.records_one': '{n} record',
      'count.records_other': '{n} records',
      'count.studentsLong_one': '{n} student',
      'count.studentsLong_other': '{n} students',
      'count.lessonsLong_one': '{n} lesson',
      'count.lessonsLong_other': '{n} lessons',
      'count.recordsLong_one': '{n} lesson record',
      'count.recordsLong_other': '{n} lesson records',
      'common.edit': 'Edit',
      'common.delete': 'Delete',
      'common.unnamedStudent': 'Unnamed student',
      'common.originalStudent': 'Original student',
      'common.unknown': 'Unknown',
      'common.lessonEditAria': "Edit {name}'s lesson on {date}",
      'common.lessonDeleteAria': "Delete {name}'s lesson on {date}",

      'stats.title': 'Income Overview',
      'stats.hint.month': 'Based on lesson dates in the current month',
      'stats.hint.year': 'Based on lesson dates in the current year',
      'stats.scopeAria': 'Statistics range',
      'stats.period.month': 'This Month',
      'stats.period.year': 'This Year',
      'stats.label.receivable.month': "This Month's Receivable",
      'stats.label.receivable.year': "This Year's Receivable",
      'stats.label.paid.month': "This Month's Paid",
      'stats.label.paid.year': "This Year's Paid",
      'stats.label.unpaid.month': "This Month's Pending",
      'stats.label.unpaid.year': "This Year's Pending",
      'stats.label.count': 'Lessons',
      'stats.label.duration': 'Total Time',

      'students.title': 'Student Management',
      'students.hint': 'Add students and set their default hourly rate',
      'students.name.label': 'Student Name',
      'students.name.placeholder': 'e.g. Ming',
      'students.grade.label': 'Grade',
      'students.grade.placeholder': 'e.g. Grade 8',
      'students.subject.label': 'Subject',
      'students.subject.placeholder': 'e.g. Math',
      'students.rate.label': 'Default Rate (CNY/hour)',
      'students.rate.placeholder': 'e.g. 120',
      'students.form.hint': 'Fill in the student details, then click “Add Student”.',
      'students.cancel': 'Cancel Editing',
      'students.add': 'Add Student',
      'students.save': 'Save Changes',
      'students.empty.title': 'No students yet',
      'students.empty.hint': 'Add a student in the form above to start recording lessons.',
      'students.editingHint': 'Editing “{name}”. Click Save when done.',
      'students.editAria': 'Edit student {name}',
      'students.deleteAria': 'Delete student {name}',
      'students.metaFallback': 'Grade and subject not set',

      'lessonForm.title': 'Record a Lesson',
      'lessonForm.hint': 'Income = duration ÷ 60 × hourly rate',
      'lessonForm.student.label': 'Student',
      'lessonForm.student.placeholder': 'Select a student',
      'lessonForm.student.empty': 'No students yet. Add one first.',
      'lessonForm.student.hint': 'No students yet. Add one in Student Management above.',
      'lessonForm.date.label': 'Lesson Date',
      'lessonForm.duration.label': 'Duration (minutes)',
      'lessonForm.duration.placeholder': 'e.g. 90',
      'lessonForm.rate.label': 'Hourly Rate (CNY/hour)',
      'lessonForm.rate.placeholder': 'e.g. 120',
      'lessonForm.income.label': 'Lesson income:',
      'lessonForm.submit': 'Add Record',

      'records.title': 'Lesson Records',
      'records.hint.list': 'Newest first',
      'records.hint.calendar': 'View lessons by date',
      'records.view.list': 'List',
      'records.view.calendar': 'Calendar',
      'records.viewAria': 'Lesson records view',
      'records.empty.title': 'No lessons yet',
      'records.empty.hint': 'Fill in a lesson above and click “Add Record” to see it here.',

      'status.paid': 'Paid',
      'status.unpaid': 'Pending Payment',
      'status.markPaid': 'Mark as Paid',
      'status.markUnpaid': 'Mark as Pending',
      'status.toggleAria': '{action}: {name}, {date}',

      'modal.title': 'Edit Lesson',
      'modal.hint': 'Change the details and click “Save” to update this record.',
      'modal.closeAria': 'Close edit dialog',
      'modal.student.placeholder': 'Select a student',
      'modal.student.empty': 'No students yet',
      'modal.paid.label': 'Payment Status',
      'modal.cancel': 'Cancel',
      'modal.save': 'Save',
      'modal.removedStudent': '{name} (deleted)',

      'calendar.prev': 'Previous month',
      'calendar.next': 'Next month',
      'calendar.today': 'Today',
      'calendar.gridAria': 'Lesson calendar',
      'calendar.weekday.mon': 'Mon',
      'calendar.weekday.tue': 'Tue',
      'calendar.weekday.wed': 'Wed',
      'calendar.weekday.thu': 'Thu',
      'calendar.weekday.fri': 'Fri',
      'calendar.weekday.sat': 'Sat',
      'calendar.weekday.sun': 'Sun',
      'calendar.dayTitle': 'Select a date',
      'calendar.daySummary': 'Click a date in the calendar to view its lessons.',
      'calendar.selectPromptTitle': 'No date selected',
      'calendar.selectPromptHint': 'Click any day in the calendar above.',
      'calendar.noLessons': 'No lessons on this day',
      'calendar.noLessonsHint': 'Choose another date or add a lesson in “Record a Lesson” above.',
      'calendar.noLessonsSummary': 'No lessons on this day.',
      'calendar.cellNoLessons': '{date} · {weekday} · No lessons',
      'calendar.cellHasLessons': '{date} · {weekday} · {count} · Income {amount}',
      'calendar.daySummaryLine': '{count} · {duration} · Income {amount}',
      'calendar.moreNames': ' +{n} more',

      'analysis.title': 'Income Analysis',
      'analysis.hint': 'Calculated live from lesson records · Amounts in CNY',
      'analysis.trend.title': 'Monthly Income Trend',
      'analysis.trend.hint': 'Months without lessons show 0. Click a bar for details.',
      'analysis.year': 'Year',
      'analysis.trendAria': 'Monthly income trend for {year}, total {amount}',
      'analysis.trendEmpty': 'No lessons in this year yet. All 12 months show 0.',
      'analysis.trendBarAria': '{month} {year}: {amount}, {count}',
      'analysis.payments.title': 'Receivable / Paid / Pending',
      'analysis.payments.hint': 'Receivable = Paid + Pending',
      'analysis.periodAria': 'Income comparison range',
      'analysis.period.month': 'By Month',
      'analysis.period.year': 'By Year',
      'analysis.month': 'Month',
      'analysis.receivable': 'Receivable',
      'analysis.paid': 'Paid',
      'analysis.unpaid': 'Pending',
      'analysis.paymentEmpty': 'No lessons in this range yet.',
      'analysis.paymentBarAria': '{range}: receivable {receivable}, paid {paid}, pending {unpaid}',
      'analysis.rank.title': 'Student Income Ranking',
      'analysis.rank.hint': 'Ranked by income, highest first',
      'analysis.rank.hintWithRange': '{range} · Ranked by income, highest first',
      'analysis.rank.emptyTitle': 'No student income in this range',
      'analysis.rank.emptyHint': 'Once you add lessons, income will be grouped and ranked by student here.',
      'analysis.rank.itemAria': '{name}: {count}, income {amount}',
      'analysis.rank.meta': '{count} · {amount}',
      'analysis.deletedSuffix': ' (deleted)',

      'data.title': 'Data Management',
      'data.hint': 'Backup files stay on your device and are never uploaded to any server',
      'data.export.title': 'Export Backup',
      'data.export.hint': 'Export all students and lesson records as a JSON file for future restore or moving to another device.',
      'data.export.button': 'Export Backup',
      'data.import.title': 'Import Backup',
      'data.import.hint': 'Choose a JSON file exported earlier. Importing replaces all current data, and you will be asked to confirm.',
      'data.import.button': 'Choose Backup File',
      'data.summary': 'Current data: {students} · {lessons}',
      'data.footer': 'Data is stored only in this browser. Clearing browser data will remove it. Back up regularly.',

      'validation.lesson.studentRequired': 'Please select a student.',
      'validation.lesson.studentNone': 'No students yet. Add one in Student Management first.',
      'validation.lesson.dateRequired': 'Please choose a lesson date.',
      'validation.lesson.dateInvalid': 'Invalid date format.',
      'validation.lesson.durationRequired': 'Please enter the lesson duration.',
      'validation.lesson.durationInteger': 'Duration must be a whole number of minutes.',
      'validation.lesson.durationRange': 'Duration must be between 1 and 1,440 minutes.',
      'validation.lesson.rateRequired': 'Please enter the hourly rate.',
      'validation.lesson.rateNumber': 'The hourly rate must be a number.',
      'validation.lesson.rateRange': 'The hourly rate must be between 0 and 10,000 CNY.',
      'validation.student.nameRequired': "Please enter the student's name.",
      'validation.student.nameTooLong': 'The name can be up to 20 characters.',
      'validation.student.rateRequired': 'Please enter the default hourly rate.',
      'validation.student.rateNumber': 'The default rate must be a number.',
      'validation.student.rateRange': 'The default rate must be between 0 and 10,000 CNY.',

      'toast.lesson.added': 'Recorded: {student} · {duration}',
      'toast.lesson.addedUnsaved': 'The lesson was added but could not be saved locally. It will be lost on refresh.',
      'toast.lesson.addFailed': 'Could not add the lesson: invalid data.',
      'toast.lesson.deleted': 'Lesson deleted.',
      'toast.lesson.deletedUnsaved': 'Deleted, but the change could not be saved locally. It may return on refresh.',
      'toast.lesson.missing': 'This record no longer exists. Please refresh the page.',
      'toast.lesson.deleteFailed': 'Could not delete: record not found.',
      'toast.lesson.updateMissing': 'Could not update: record not found.',
      'toast.lesson.paidMarked': 'Marked as paid.',
      'toast.lesson.unpaidMarked': 'Marked as pending.',
      'toast.lesson.paidMarkedUnsaved': 'Marked as paid, but the change could not be saved locally. It may revert on refresh.',
      'toast.lesson.unpaidMarkedUnsaved': 'Marked as pending, but the change could not be saved locally. It may revert on refresh.',
      'toast.lesson.updated': 'Lesson changes saved.',
      'toast.lesson.updatedUnsaved': 'Saved, but the change could not be saved locally. It may revert on refresh.',
      'toast.lesson.updateFailed': 'Could not save: the record is missing or the data is invalid.',
      'toast.lesson.noEditing': 'No lesson is being edited. Please reopen the edit dialog.',
      'toast.student.missing': 'This student no longer exists. Please refresh the page.',
      'toast.student.saved': 'Saved changes to “{name}”.',
      'toast.student.added': 'Added student “{name}”.',
      'toast.student.savedUnsaved': 'Saved changes to “{name}”, but they could not be stored locally and will be lost on refresh.',
      'toast.student.addedUnsaved': 'Added student “{name}”, but the record could not be stored locally and will be lost on refresh.',
      'toast.student.saveFailed': 'Could not save. Please check the student details.',
      'toast.student.deleted': 'Deleted “{name}”. Historical lessons were kept.',
      'toast.student.deletedUnsaved': 'Deleted, but the change could not be saved locally. It may return on refresh.',
      'toast.student.deleteFailed': 'Could not delete: student not found.',
      'toast.export.success': 'Backup exported: {students}, {lessons}.',
      'toast.export.failed': 'Export failed: this browser does not support downloads.',
      'toast.import.tooLarge': 'Import failed: the backup file is larger than 20 MB.',
      'toast.import.invalidJson': 'Import failed: the file is not valid JSON.',
      'toast.import.readFailed': 'Import failed: could not read the file.',
      'toast.import.cancelled': 'Import cancelled.',

      'confirm.deleteLesson': "Delete {name}'s lesson on {date}?\nThis cannot be undone.",
      'confirm.deleteStudent': 'Delete student “{name}”?',
      'confirm.deleteStudentWithLessons': 'Delete student “{name}”?\nTheir historical lesson records ({count}) will be kept and will still count toward income.',
      'confirm.deleteStudentNoLessons': 'Delete student “{name}”?\nThis student has no lesson records yet.',
      'import.tooLarge': 'Import failed: the backup file is larger than 20 MB.',
      'import.invalidJson': 'Import failed: the file is not valid JSON.',
      'import.readFailed': 'Import failed: could not read the file.',
      'import.failed': 'Import failed: {reason}',
      'import.cancelled': 'Import cancelled. Your data was not changed.',
      'import.success': 'Import complete: restored {students} and {lessons}.',
      'import.noExportTime': 'Not recorded in the backup',
      'confirm.import': 'Import this backup?\n· Students: {students}\n· Lesson records: {lessons}\n· Exported: {exportedAt}\n\nWarning: this will replace the current {currentStudents} and {currentLessons}. Existing data will be overwritten.\nExport your current data first if you want a backup.\n\nContinue with the import?',

      'storage.warning.unavailable': 'Browser storage is unavailable (private mode or site data may be disabled). Records will be lost on refresh.',
      'storage.error.localUnavailable': 'Browser storage is unavailable. Records will be lost on refresh.',
      'storage.error.readFailed': 'Could not read local data. Records will be lost on refresh.',
      'storage.error.corrupt': 'Local data was malformed. The original data was backed up and the list was reset.',
      'storage.error.saveFailed': 'Save failed: browser storage is full or disabled.',
      'storage.error.restoreUnavailable': 'Browser storage is unavailable. The backup could not be restored.',
      'storage.error.restoreReadFailed': 'Could not read the current data. Nothing was restored.',
      'storage.error.restoreSerializeFailed': 'Could not process the backup data. Your current data was not changed.',
      'storage.error.restoreWriteFailed': 'Could not write to browser storage. Your current data was not changed.',
      'backup.error.notObject': 'The backup file is not a valid JSON object.',
      'backup.error.notBackup': 'This is not a TutorTrack backup file (missing the app marker).',
      'backup.error.backupVersionMissing': 'The backup file is missing a valid backupVersion.',
      'backup.error.backupVersionNewer': 'The backup file is newer (v{version}); this app supports up to v{max}.',
      'backup.error.dataVersionMissing': 'The backup file is missing a valid dataVersion.',
      'backup.error.dataVersionNewer': 'The backup data is newer (v{version}); this app supports up to v{max}.',
      'backup.error.arraysMissing': 'The backup file is missing the students or lessons array.',
      'backup.error.studentFormat': 'Student {index} has an invalid format.',
      'backup.error.studentId': 'Student {index} is missing an id.',
      'backup.error.studentDuplicate': 'Duplicate student id: {id}',
      'backup.error.studentName': 'Student {index} is missing a name.',
      'backup.error.studentRate': 'Student {index} has an invalid hourly rate.',
      'backup.error.lessonFormat': 'Lesson record {index} has an invalid format.',
      'backup.error.lessonId': 'Lesson record {index} is missing an id.',
      'backup.error.lessonDuplicate': 'Duplicate lesson record id: {id}',
      'backup.error.lessonStudentId': 'Lesson record {index} is missing studentId.',
      'backup.error.lessonStudentName': 'Lesson record {index} is missing the student name.',
      'backup.error.lessonDate': 'Lesson record {index} has an invalid date.',
      'backup.error.lessonDuration': 'Lesson record {index} must have a whole-number duration greater than 0 minutes.',
      'backup.error.lessonRate': 'Lesson record {index} has an invalid hourly rate.',
      'backup.error.lessonPaid': 'Lesson record {index} has an invalid payment status.',

      'duration.hour_one': '{n} hr',
      'duration.hour_other': '{n} hrs',
      'duration.minute_one': '{n} min',
      'duration.minute_other': '{n} min',
      'date.monthLabel': '{monthName} {year}',
      'date.yearLabel': '{year}',
      'date.long': '{weekday}, {date}'
    }
  };

  var current = DEFAULT_LANGUAGE;

  function isSupported(code) {
    return SUPPORTED.indexOf(code) !== -1;
  }

  function readStoredLanguage() {
    try {
      var saved = global.localStorage.getItem(STORAGE_KEY);
      return isSupported(saved) ? saved : '';
    } catch (error) {
      return '';
    }
  }

  function writeStoredLanguage(code) {
    try {
      global.localStorage.setItem(STORAGE_KEY, code);
    } catch (error) {
      /* 存储不可用时只在本次页面生效 */
    }
  }

  function lookup(code, key) {
    var table = messages[code];
    if (!table || !Object.prototype.hasOwnProperty.call(table, key)) return undefined;
    return table[key];
  }

  function interpolate(text, params) {
    if (!params) return text;
    return String(text).replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
    });
  }

  function t(key, params) {
    var text = lookup(current, key);
    if (text === undefined) text = lookup(DEFAULT_LANGUAGE, key);
    if (text === undefined) return key;
    return interpolate(text, params);
  }

  /** 英文按单复数取 key，中文两种后缀内容相同 */
  function tp(key, count, params) {
    var suffix = Number(count) === 1 ? '_one' : '_other';
    var copy = {};
    if (params) {
      Object.keys(params).forEach(function (name) {
        copy[name] = params[name];
      });
    }
    copy.n = params && params.n !== undefined ? params.n : count;
    return t(key + suffix, copy);
  }

  function locale() {
    return current === 'en' ? 'en-US' : current;
  }

  function formatNumber(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = 0;
    return new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(number);
  }

  function formatMoney(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) number = 0;
    number = Math.round(number * 100) / 100;
    return new Intl.NumberFormat(locale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(number);
  }

  function formatCurrency(value) {
    return t('currency.symbol') + formatMoney(value);
  }

  function formatCompactCurrency(value) {
    return t('currency.symbol') + compactMoney(value);
  }

  function count(unit, value) {
    var number = Math.max(0, Math.round(Number(value) || 0));
    return tp('count.' + unit, number, { n: formatNumber(number) });
  }

  function countLong(unit, value) {
    var number = Math.max(0, Math.round(Number(value) || 0));
    return tp('count.' + unit + 'Long', number, { n: formatNumber(number) });
  }

  function minutesToText(value) {
    var total = Math.max(0, Math.round(Number(value) || 0));
    var hours = Math.floor(total / 60);
    var minutes = total % 60;

    if (hours === 0) return tp('duration.minute', minutes, { n: formatNumber(minutes) });
    if (minutes === 0) return tp('duration.hour', hours, { n: formatNumber(hours) });
    return tp('duration.hour', hours, { n: formatNumber(hours) }) + ' ' +
      tp('duration.minute', minutes, { n: formatNumber(minutes) });
  }

  function parseDateParts(dateString) {
    if (typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return null;
    }
    var parts = dateString.split('-').map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (
      date.getFullYear() !== parts[0] ||
      date.getMonth() !== parts[1] - 1 ||
      date.getDate() !== parts[2]
    ) {
      return null;
    }
    return { year: parts[0], month: parts[1], day: parts[2], date: date };
  }

  function monthName(month, style) {
    var m = Math.round(Number(month));
    if (!Number.isFinite(m) || m < 1 || m > 12) return '';
    if (current !== 'en') return m + ' 月';
    return new Intl.DateTimeFormat(locale(), {
      month: style === 'short' ? 'short' : 'long'
    }).format(new Date(2026, m - 1, 1));
  }

  function formatDate(dateString, style) {
    var parts = parseDateParts(dateString);
    if (!parts) return typeof dateString === 'string' ? dateString : '';
    return new Intl.DateTimeFormat(locale(), {
      year: 'numeric',
      month: style === 'long' ? 'long' : 'short',
      day: 'numeric'
    }).format(parts.date);
  }

  function weekdayLabel(dateString) {
    var parts = parseDateParts(dateString);
    if (!parts) return '';
    return new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(parts.date);
  }

  function formatDateLong(dateString) {
    var date = formatDate(dateString, 'long');
    if (!date) return '';
    return t('date.long', { date: date, weekday: weekdayLabel(dateString) });
  }

  function monthLabel(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}$/.test(key)) return '—';
    var year = key.slice(0, 4);
    var month = Number(key.slice(5, 7));
    return t('date.monthLabel', {
      year: year,
      month: month,
      monthName: monthName(month)
    });
  }

  function yearLabel(key) {
    if (typeof key !== 'string' || !/^\d{4}$/.test(key)) return '—';
    return t('date.yearLabel', { year: key });
  }

  function formatExportTime(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return t('common.unknown');
    return new Intl.DateTimeFormat(locale(), {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  function compactMoney(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return '0';

    if (current === 'en') {
      if (number >= 1000000) {
        return trimZero(number / 1000000) + 'M';
      }
      if (number >= 1000) {
        return trimZero(number / 1000) + 'k';
      }
      return String(Math.round(number * 100) / 100);
    }

    if (number >= 10000) {
      return trimZero(number / 10000) + (current === 'zh-TW' ? '萬' : '万');
    }
    return String(Math.round(number * 100) / 100);
  }

  function trimZero(number) {
    return String(Math.round(number * 10) / 10).replace(/\.0$/, '');
  }

  function joinNames(names) {
    var list = Array.isArray(names) ? names.filter(Boolean) : [];
    if (!list.length) return '';
    if (typeof Intl.ListFormat === 'function') {
      return new Intl.ListFormat(locale(), { style: 'short', type: 'conjunction' }).format(list);
    }
    return list.join(current === 'en' ? ', ' : '、');
  }

  function applyToElement(element, attribute, targetAttribute) {
    var key = element.getAttribute(attribute);
    if (!key) return;
    var value = t(key);
    if (targetAttribute) {
      element.setAttribute(targetAttribute, value);
    } else {
      element.textContent = value;
    }
  }

  /** 把当前语言应用到页面上的静态文案 */
  function apply(root) {
    var scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || typeof scope.querySelectorAll !== 'function') return;

    if (scope === (typeof document !== 'undefined' ? document : null)) {
      document.documentElement.lang = current;
    }

    Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n]'), function (element) {
      applyToElement(element, 'data-i18n');
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-placeholder]'), function (element) {
      applyToElement(element, 'data-i18n-placeholder', 'placeholder');
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-aria-label]'), function (element) {
      applyToElement(element, 'data-i18n-aria-label', 'aria-label');
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-title]'), function (element) {
      applyToElement(element, 'data-i18n-title', 'title');
    });
    Array.prototype.forEach.call(scope.querySelectorAll('[data-i18n-content]'), function (element) {
      applyToElement(element, 'data-i18n-content', 'content');
    });
  }

  function getLanguage() {
    return current;
  }

  function setLanguage(code, options) {
    var next = isSupported(code) ? code : DEFAULT_LANGUAGE;
    current = next;
    if (!options || options.persist !== false) writeStoredLanguage(next);

    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
      document.documentElement.setAttribute('dir', 'ltr');
      if (typeof CustomEvent === 'function') {
        document.dispatchEvent(new CustomEvent('tutortrack:languagechange', {
          detail: { language: next }
        }));
      }
    }
    return next;
  }

  function hasKey(key, code) {
    var target = code || current;
    return lookup(target, key) !== undefined ||
      (target !== DEFAULT_LANGUAGE && lookup(DEFAULT_LANGUAGE, key) !== undefined);
  }

  function keys(code) {
    return Object.keys(messages[code || current] || {});
  }

  current = readStoredLanguage() || DEFAULT_LANGUAGE;

  global.I18N = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_LANGUAGE: DEFAULT_LANGUAGE,
    SUPPORTED: SUPPORTED,
    t: t,
    tp: tp,
    count: count,
    countLong: countLong,
    apply: apply,
    getLanguage: getLanguage,
    setLanguage: setLanguage,
    getLocale: locale,
    formatNumber: formatNumber,
    formatMoney: formatMoney,
    formatCurrency: formatCurrency,
    formatCompactCurrency: formatCompactCurrency,
    minutesToText: minutesToText,
    formatDate: formatDate,
    formatDateLong: formatDateLong,
    weekdayLabel: weekdayLabel,
    monthName: monthName,
    monthLabel: monthLabel,
    yearLabel: yearLabel,
    formatExportTime: formatExportTime,
    compactMoney: compactMoney,
    joinNames: joinNames,
    hasKey: hasKey,
    keys: keys
  };
})(window);
