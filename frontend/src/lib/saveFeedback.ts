import { ApiError } from "./api";

/** 保存失败时给用户看的一句话；区分"改动还在草稿里"与"这次改动没留下"。 */
export function saveFailureMessage(kept: boolean): string {
  return kept
    ? "保存失败：本地服务没有响应。修改仍保存在本机草稿中，服务恢复后可以再次保存。"
    : "保存失败：本地服务没有响应。请先不要关闭页面，以免丢失本次修改。";
}

/** 统一把异常转成人能读的文案：网络层失败用自己的话，业务错误沿用后端的原话。 */
export function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message))
    return "本地服务没有响应";
  return error instanceof Error && error.message ? error.message : "操作没有完成，请稍后再试";
}
