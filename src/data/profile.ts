// 以下经历根据用户提供的简历整理为公开版；内部项目名称与业务指标待确认后再补充。
export const profile = {
  name: '姚林霞',
  initials: 'YLX',
  role: '大模型算法工程师',
  location: '中国',
  email: '',
  github: '',
  linkedin: '',
  summary: '自 2020 年起从事 NLP 与大模型算法工作，实践覆盖高质量语料构建、SFT 微调、强化学习训练、模型推理部署与评测。近期关注 Agent 工程化、上下文管理，以及模型能力在实际研发场景中的落地。',
  focus: ['NLP 与数据工程', 'SFT 与强化学习', '模型推理部署', 'Agent 工程'],
  experience: [
    {
      period: '2020.07 — 至今',
      company: '华为软件技术有限公司',
      role: '算法工程师',
      description: '围绕 NLP、语音助手、大模型训练和 AI 工程化开展研发工作。',
      highlights: [
        '参与语音助手的语料建设与鲁棒性 NLU 模型优化。',
        '推进大模型在智能编排、知识助手等场景的训练、推理部署与评测。',
        '探索强化学习训练链路、Agent 上下文管理和技能化任务执行。',
      ],
    },
  ] as Array<{
    period: string;
    company: string;
    role: string;
    description: string;
    highlights: string[];
  }>,
  projects: [
    {
      name: 'Agent 工程与研发辅助',
      category: 'Agent / AI 工程化',
      period: '2026.01 — 至今',
      description: '围绕智能研发任务，探索大模型辅助开发、上下文管理和长程任务执行。',
      contribution: '参与运营数据可视化、上下文压缩方案及基于业务知识的技能化任务执行设计。',
    },
    {
      name: '领域推理模型训练优化',
      category: '强化学习 / Ascend NPU',
      period: '2025.04 — 2025.12',
      description: '面向领域任务改进模型推理能力，建设数据、训练和评测流程。',
      contribution: '打通 Ascend NPU 上的强化学习训练链路，参与语料筛选、奖励函数设计、冷启动微调和多轮评测优化。',
    },
    {
      name: '智能编排辅助能力',
      category: '大模型应用 / 低代码',
      period: '2024.08 — 2025.04',
      description: '将模型能力用于流程开发和页面创建场景。',
      contribution: '负责流程节点推荐、流程规则推荐及自然语言生成页面方案等能力建设。',
    },
    {
      name: '知识助手模型推理服务',
      category: '推理部署 / 服务工程',
      period: '2024.02 — 2024.08',
      description: '支持知识助手的模型能力升级和稳定服务。',
      contribution: '参与模型推理部署、API 接入、问题定位、服务稳定性保障及多模型接入。',
    },
    {
      name: '语音助手语料与鲁棒性 NLU',
      category: 'NLP / 数据工程',
      period: '2020.12 — 2023.06',
      description: '面向真实用户表达中的噪声、口音和异常输入，改进训练数据与识别鲁棒性。',
      contribution: '参与高质量语料挖掘、清洗与筛选，并负责模型容错纠错能力建设。',
    },
  ] as Array<{
    name: string;
    category: string;
    period: string;
    description: string;
    contribution: string;
    link?: string;
  }>,
  education: [
    { school: '南京大学', degree: '软件工程硕士', period: '2017.09 — 2020.06' },
    { school: '南通大学', degree: '计算机师范专业学士', period: '2013.09 — 2017.06' },
  ],
  icpNumber: '',
  policeRecordNumber: '',
  policeRecordUrl: '',
};
