export interface PathStep {
  /** Article id, i.e. the filename without extension. */
  id: string;
  /** Wayfinding label shown on the route rail. */
  label: string;
}

export interface LearningPath {
  code: string;
  title: string;
  summary: string;
  steps: PathStep[];
}

/**
 * Six topic routes. Every step is a real article id; a step whose article does
 * not exist yet is rendered as a non-link "待发布" node.
 *
 * Steps follow the category's reading order. Windows setup is an optional
 * environment branch rather than a hard requirement for later Codex steps.
 */
export const PATHS: LearningPath[] = [
  {
    code: 'ROUTE 01',
    title: 'Codex：从安装到并行改动',
    summary:
      '先选环境完成安装与登录，再用一个小任务跑通权限、调试和项目上下文。Windows 是可选分支；不需要 Windows 时直接进入第一次任务，其余步骤按顺序阅读。',
    steps: [
      { id: 'codex-install-login', label: '安装与登录：先确认能读不能写' },
      { id: 'codex-windows-setup', label: 'Windows 环境：PowerShell 里的路径与换行' },
      { id: 'codex-permissions', label: '权限与沙箱：先只读，再允许写入' },
      { id: 'codex-first-task', label: '第一次任务：从指令到测试验收' },
      { id: 'codex-debugging-tests', label: '调试与测试：先复现失败再改代码' },
      { id: 'codex-project-context', label: '项目上下文：AGENTS.md 与配置边界' },
      { id: 'codex-noninteractive', label: '非交互运行：codex exec 与结构化输出' },
      { id: 'codex-worktrees', label: 'worktree：隔开两条并行改动' },
    ],
  },
  {
    code: 'ROUTE 02',
    title: 'Claude Code：把日常协作固定下来',
    summary:
      '从安装登录和项目记忆开始，依次进入日常工作流、权限、MCP 接入、独立评审与子代理；最后用故障排查把前面几步串起来。目标是一条每次都能复跑的协作路径。',
    steps: [
      { id: 'claude-code-install', label: '安装与登录：验证命令可用' },
      { id: 'claude-code-memory', label: '项目记忆：CLAUDE.md 写什么' },
      { id: 'claude-code-workflow', label: '工作流：从需求到一次干净的提交' },
      { id: 'claude-code-permissions', label: '权限：允许范围与拒绝排查' },
      { id: 'claude-code-mcp', label: '接入 MCP：检查工具是否真的可用' },
      { id: 'claude-code-review', label: '评审：把检查做成独立工序' },
      { id: 'claude-code-subagents', label: '子代理：一个只读评审角色' },
      { id: 'claude-code-troubleshooting', label: '故障排查：按现象定位一层' },
    ],
  },
  {
    code: 'ROUTE 03',
    title: 'MCP：把外部工具接进来',
    summary:
      '先弄清 host、client、server 与工具调用的边界，再判断该给多少权限；随后写一个只做一件事的 server，设计可维护的工具契约，并学会在协议层排错。',
    steps: [
      { id: 'mcp-concepts', label: '概念：一次请求经过哪些角色' },
      { id: 'mcp-boundaries', label: '信任边界：接 server 前确认四类权限' },
      { id: 'mcp-first-server', label: '第一个 server：stdio、Inspector 与注册' },
      { id: 'mcp-tool-design', label: '工具设计：名称、参数与业务错误' },
      { id: 'mcp-debugging', label: '协议排错：启动、列表与调用分层定位' },
    ],
  },
  {
    code: 'ROUTE 04',
    title: 'Skills：把重复做法变成可复用能力',
    summary:
      '从第一个可移植的 Skill 开始，判断哪些内容该留下、哪些该放到资源文件；再用三道闸门验证触发与内容，最后把团队共用的 Skill 纳入版本管理和交接。',
    steps: [
      { id: 'skills-first-skill', label: '第一个 Skill：最小可触发结构' },
      { id: 'skills-design', label: '设计：什么该写成 Skill' },
      { id: 'skills-resources', label: '资源与脚本：把长内容移出正文' },
      { id: 'skills-validation', label: '验证：格式、触发与内容三道闸门' },
      { id: 'skills-team-workflow', label: '团队流程：版本、兼容与回滚' },
    ],
  },
  {
    code: 'ROUTE 05',
    title: 'Agent：从形态选择到可评估的循环',
    summary:
      '先判断问题该用固定 workflow 还是模型决策的 Agent，再约束工具契约、控制工具循环的失败预算；最后用追踪定位失败，用评估证明改动没有变坏。',
    steps: [
      { id: 'agent-vs-workflow', label: '形态选择：workflow 还是 Agent' },
      { id: 'agent-tool-contracts', label: '工具契约：校验、授权与业务错误' },
      { id: 'agent-tool-loop', label: '工具循环：观察、决策、行动的停止条件' },
      { id: 'agent-tracing', label: '运行追踪：把失败定位到具体一步' },
      { id: 'agent-evaluation', label: '评估：用可复跑的断言衡量 Agent' },
    ],
  },
  {
    code: 'ROUTE 06',
    title: '自动化：把验证过的步骤接成流水线',
    summary:
      '先把检查放进 CI，再串联成有失败处理的流水线；随后收紧密钥与权限、处理重复事件和重试，最后在不可逆动作前保留人类检查点。',
    steps: [
      { id: 'automation-ci-checks', label: 'CI 检查：先让验证自动跑起来' },
      { id: 'automation-pipeline', label: '流水线：触发、准备、执行、复盘' },
      { id: 'automation-secrets', label: '密钥与权限：作用域和泄露边界' },
      { id: 'automation-idempotency', label: '幂等与重试：重复事件不重复执行' },
      { id: 'automation-checkpoints', label: '检查点：不可逆动作前停下来' },
    ],
  },
];
