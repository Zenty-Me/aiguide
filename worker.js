/**
 * Cloudflare Worker 入口：静态站只需要两件事 —— 强制 HTTPS，其余交给静态资源绑定。
 * zone 级的 Always Use HTTPS 需要 zone 编辑权限，这里用 301 兜底。
 * 请求到达 Worker 时 URL 可能已被改写成 https，所以优先看 cf-visitor 里的真实协议。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const scheme =
      request.headers.get('cf-visitor')?.match(/"scheme":"(\w+)"/)?.[1] ?? url.protocol.slice(0, -1);

    if (scheme === 'http') {
      url.protocol = 'https:';
      return Response.redirect(url.href, 301);
    }
    return env.ASSETS.fetch(request);
  },
};