export const CATEGORY_SLUGS = [
  'codex',
  'claude-code',
  'agent',
  'mcp',
  'skills',
  'automation',
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export interface CategoryInfo {
  slug: CategorySlug;
  name: string;
  latin: string;
  blurb: string;
  description: string;
  /** What the reader should already be able to do before starting this topic. */
  prerequisites: string;
  /** Concrete capabilities this topic builds, not article summaries. */
  focus: string[];
}

export const CATEGORIES: CategoryInfo[] = [
  {
    slug: 'codex',
    name: 'Codex',
    latin: 'CODEX',
    blurb: '从安装、权限到并行改动',
    description:
      '把 Codex 放进真实仓库：先完成安装与登录，再控制改动范围、补足项目上下文，并在合并前用测试和 diff 验收。',
    prerequisites:
      '能读懂命令行输出、用 git status 与 git diff 查看改动；有一个可回滚的练手仓库。安装与登录从本主题第一篇开始，Windows 用户可先读环境分支，不需要预装 Codex。',
    focus: [
      '先确认登录方式与计费来源，再用只读任务验证命令、路径和权限。',
      '权限逐级放开：只读理解、限定范围的写入，最后才讨论非交互运行。',
      '任务压到一次能看完的 diff：改哪个文件、函数签名、行为约束、怎么验证。',
      '用 AGENTS.md 固定测试命令与目录约定；并行改动放进独立 worktree。',
    ],
  },
  {
    slug: 'claude-code',
    name: 'Claude Code',
    latin: 'CLAUDE CODE',
    blurb: '从安装到子代理协作',
    description:
      '用 Claude Code 承担日常开发：从安装登录与项目记忆开始，固定工作流、划清权限，再把 MCP、评审与子代理接进同一条协作路径。',
    prerequisites:
      '有一个能运行测试的练手项目；改动前能通过 git 恢复。安装、登录与项目记忆在前两篇，不需要预装 Claude Code。',
    focus: [
      '/init 生成的项目记忆只是起点，过期约定要人工删掉。',
      'plan 模式先看方案，再按权限模式逐级放权，不要一上来就 bypassPermissions。',
      'MCP 接入后在客户端里确认工具真的被调用，而不是只在列表里出现。',
      '评审与子代理各司其职：限定范围、要求可定位的问题、最后人工裁决。',
    ],
  },
  {
    slug: 'agent',
    name: 'Agent',
    latin: 'AGENT',
    blurb: '先选形态，再约束工具与评估',
    description:
      '先判断问题需要固定 workflow 还是模型决策的 Agent，再拆开工具契约与工具循环：如何校验输入、什么时候必须停、失败预算怎么定，以及如何用追踪和评估代替手感。',
    prerequisites:
      '写过调用模型 API 与工具函数的代码，理解一次请求与一次工具调用的区别；还没决定形态时，从 workflow 与 Agent 的选择开始。',
    focus: [
      '能用固定分支解决的，不交给模型决策；把选择理由写下来。',
      '工具输入输出校验与授权分开，业务失败返回结构化错误。',
      '工具循环的四个失败出口：重复调用、无进展、超时、成本。',
      '追踪把失败定位到具体一步，评估用最终状态做可复跑断言。',
    ],
  },
  {
    slug: 'mcp',
    name: 'MCP',
    latin: 'MCP',
    blurb: '概念、工具设计与排错',
    description:
      'MCP 把模型接到文件、数据库和内部系统。先弄清 host / client / server 与一次请求的路径，再决定给多少权限、在哪一层校验，并能在协议层排错。',
    prerequisites:
      '本机有 Node.js 20+，能读 JSON 与进程输出；不需要预先了解 MCP 协议，第一篇从角色和调用路径讲起。',
    focus: [
      '一次请求经过 host、client、server：先分清谁负责路由、谁负责权限。',
      '接 server 前确认四道边界：进程权限、返回数据、凭据作用域、传输通道。',
      '工具名、描述与输入输出 schema 是契约；业务错误用结构化结果返回。',
      'stdio server 不要把日志写到 stdout；用 Inspector 分层验证 tools/list 与 tools/call。',
    ],
  },
  {
    slug: 'skills',
    name: 'Skills',
    latin: 'SKILLS',
    blurb: '从第一个 Skill 到团队分发',
    description:
      '把有效的做法沉淀为可复用技能：先写出最小可触发结构，再判断哪些内容该移入资源文件，用验证闸门证明它没有变坏，最后纳入团队版本管理。',
    prerequisites:
      '有一条每周重复多次的流程；知道自己所用客户端的 Skill 目录与加载方式更好，不确定时从第一篇开始按客户端确认。',
    focus: [
      '先判断该写成 Skill、项目规则还是 MCP 工具，不要把所有提示词都塞进 SKILL.md。',
      'description 决定触发：写清什么时候用、什么时候不用。',
      '长参考资料和脚本移到资源文件，按需加载，不让正文变成手册。',
      '格式校验、触发矩阵、内容演练三道闸门，跨客户端前先分别验证。',
    ],
  },
  {
    slug: 'automation',
    name: '自动化',
    latin: 'AUTOMATION',
    blurb: 'CI、密钥、幂等与检查点',
    description:
      '把验证过的步骤接成流水线：先把检查放进 CI，再处理密钥作用域、重复事件与重试，最后在不可逆动作前保留人类检查点，让自动化既跑得快也停得住。',
    prerequisites:
      '已有可复跑的验证命令，能区分可逆与不可逆操作；CI、密钥与幂等从本主题前几篇补齐，不需要预先配好发布权限。',
    focus: [
      'CI 先跑现有的检查与构建，再加由 Agent 生成内容的门禁。',
      '密钥按最小作用域注入，不在日志和产物里回显。',
      '重复事件用稳定幂等键去重，重试只针对暂时性失败。',
      '不可逆动作前保留人类检查点，默认放行比没有检查点更危险。',
    ],
  },
];

const map = new Map<string, CategoryInfo>(CATEGORIES.map((c) => [c.slug, c]));

export function getCategory(slug: string): CategoryInfo | undefined {
  return map.get(slug);
}

export function categoryName(slug: string): string {
  return map.get(slug)?.name ?? slug;
}

export function categoryHref(slug: string): string {
  return `/categories/${slug}/`;
}
