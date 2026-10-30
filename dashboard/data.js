export const modes = {
  build: {
    name: '构建模式',
    en: 'BUILD',
    title: '把项目方向握在自己手中。',
    description: '让 AI 自主执行日常开发，在新依赖、外部服务和需求扩展时提醒你。',
    focus: '范围与资源',
    steps: [
      '正常在终端或 VS Code 中开发',
      '关键资源或需求变化前解释影响',
      '由你确认方向，Agent 继续执行',
    ],
  },
  work: {
    name: '工作模式',
    en: 'WORK',
    title: '让每一次交付，都经过你的判断。',
    description: '在原有工作流中提醒关键核验，保留对事实、假设和最终成果的责任。',
    focus: '核验与交付',
    steps: ['继续在原来的 Agent 中完成任务', '对关键结论请求来源与核验', '在交付前保留人工检查'],
  },
  learn: {
    name: '学习模式',
    en: 'LEARN',
    title: '让思考留在你与 Agent 的对话里。',
    description: '先尝试、再提示，在终端或编辑器中解释思路、回答问题，逐步建立理解。',
    focus: '思考与理解',
    steps: [
      'Agent 先了解你的思路与卡点',
      '根据设置提供提示和局部解释',
      '在原对话中完成理解检查后继续',
    ],
  },
};

export const defaultSettings = () => ({
  mode: 'build',
  resourceReview: true,
  scopeReview: true,
  verification: true,
  hintStyle: 'progressive',
  frequency: 'key',
  goal: '',
});
const keyFor = (user) =>
  `hil.console.settings.v2.${user.demo ? 'guest' : encodeURIComponent(user.username.toLocaleLowerCase())}`;

export function loadSettings(user) {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(user)));
    const value = defaultSettings();
    if (!raw || typeof raw !== 'object') return value;
    if (Object.hasOwn(modes, raw.mode)) value.mode = raw.mode;
    for (const key of ['resourceReview', 'scopeReview', 'verification'])
      if (typeof raw[key] === 'boolean') value[key] = raw[key];
    if (['progressive', 'socratic', 'explain'].includes(raw.hintStyle))
      value.hintStyle = raw.hintStyle;
    if (['key', 'stage'].includes(raw.frequency)) value.frequency = raw.frequency;
    if (typeof raw.goal === 'string') value.goal = raw.goal.slice(0, 500);
    return value;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(user, settings) {
  localStorage.setItem(keyFor(user), JSON.stringify(settings));
}

export function settingsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
