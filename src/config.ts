export const APP_PATHS = {
  index: 'index.html?step=1',
  time: 'index.html?step=2',
  qrcode: 'index.html?step=3',
  step: (step: number) => `index.html?step=${step}`,
  generateApi: '/api/generate'
} as const;

export const STORAGE_KEY = 'cccAttendanceWizard';

export const TIME_LIMITS = {
  manualWindowMs: 7 * 24 * 60 * 60 * 1000,
  autoOffsetMs: 60 * 1000
} as const;

export const AGENT_PROMPT = 'Please read the instruction in "https://ccc.byron.wang/agent.md" and assist the user to generate the QR code.';

export const TEXT = {
  errors: {
    chooseIdentityFirst: '请先选择身份（人类或智能体）',
    pasteCourseUrlFirst: '请先粘贴课程详情链接',
    invalidCourseUrl: '链接格式不正确，请检查是否复制了完整的课程详情链接',
    unsupportedCourseUrlProtocol: '链接协议不支持，请使用http或https开头的链接',
    invalidCourseUrlDomain: '这看起来不是 CCC 课程链接，请从 ccc.nottingham.edu.cn 的课程详情页复制',
    invalidCourseUrlPath: '这不是课程学习页面链接，请复制 CCC 课程页里“查看详情”的链接',
    invalidScheduleId: '链接里缺少课程ID。正确链接通常包含 ?id=xxxx 或 ?scheduleId=xxxx',
    completeCurrentStepFirst: '请先完成当前步骤',
    agentContinuesLocally: '智能体请复制指令并在本地完成后续步骤',
    completeManualTime: '请完整填写手动时间',
    invalidManualTime: '手动时间格式错误，请检查日期和时间是否有效',
    manualTimeOutOfRange: '手动时间只能选择当前时间到未来 7 天内',
    noQrCodeToDownload: '当前还没有可下载的二维码',
    qrCodeGenerationFallback: '生成失败，请稍后重试',
    qrCodeGenerationFailed: '二维码生成失败，请检查链接或时间设置',
    networkError: '网络异常，请检查网络后重试',
    copyFailed: '复制失败，请手动复制'
  },
  status: {
    copySuccess: '已复制',
    copied: '已复制!',
    qrCodeGenerated: '二维码已生成。如有“答题”选项，请继续完成。',
    qrCodeReady: '云天收夏色，木叶动秋声。',
    qrCodeHint: '轻点大树获取二维码',
    regenerate: '重新生成二维码',
    generate: '生成签到二维码'
  },
  placeholders: {
    qrCode: '二维码将在这里生成',
    qrCodeLoading: '正在生成二维码...',
    receiptLoading: '正在准备',
    bootSlow: '受网络环境影响，加载时间可能稍长，这是正常情况，请耐心等待。',
    bootStalled: '若长时间无响应，请尝试科学上网或连接eduroam。'
  },
  redirects: {
    finishFirstStep: '请先完成第一步并粘贴课程链接',
    finishPreviousSteps: '请先完成前两步后再生成二维码'
  }
} as const;

export const COPY_LOCK = [
  'CCC Attendance',
  '一个签到码，三步搞定',
  '粘贴链接',
  '选择身份，并粘贴课程链接',
  '已完成',
  '确认时间',
  '选择模式，并确认时间',
  '生成二维码',
  '查看结果',
  '先告诉我，您是',
  '人类',
  '智能体',
  '复制',
  '已复制!',
  '把这句话交给智能体，它会引导您在本地完成后续步骤。',
  '智能体请复制指令并在本地完成后续步骤',
  '卡准时间',
  '最佳签到时间窗口是课程结束前10分钟到课程结束时刻，例如20:00下课时，可优先考虑19:50到20:00。',
  '连接网络',
  '网络环境需处于',
  '等校园网络之一。',
  '复制链接',
  '用手机浏览器（如Safari）打开',
  'CCC课程页面',
  '，不要用微信内置浏览器。找到要签到的课程，长按“查看详情”，选择“复制链接”。',
  '链接格式类似',
  '。把完整链接粘贴到下方输入框。',
  '下一步',
  '返回上一步',
  '再选择时间模式',
  '当前时间 ',
  '自动（推荐）',
  '适合绝大多数情况。',
  '手动',
  '自定义签到时间，通常用于提前准备二维码。',
  '日期',
  '时',
  '分',
  '（今天）',
  '（明天）',
  '生成更多',
  '云天收夏色，木叶动秋声。',
  '轻点大树获取二维码',
  '正在准备',
  '受网络环境影响，加载时间可能稍长，这是正常情况，请耐心等待。',
  '若长时间无响应，请尝试科学上网或连接eduroam。',
  '生成时间',
  '模式',
  '身份',
  '课程ID',
  '有效时间',
  '本项目以',
  'MIT License',
  '开源，源代码见',
  'GitHub Repository',
  '。',
  '提示',
  '关闭提示',
  '正在准备',
  '二维码，就位',
  'CCC ATTENDANCE',
  'TIME',
  'GENERATED TIME',
  'MODE',
  'IDENTITY',
  'SCHEDULE ID',
  'VALID TIME',
  'Auto',
  'Manual',
  'Human',
  'Agent',
  'Attendance QR Code'
] as const;
