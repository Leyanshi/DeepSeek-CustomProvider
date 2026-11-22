/** Reject explanations, truncated output and empty responses instead of inventing a title. */
export const normalizeGeneratedTitle = (text: string): string | null => {
  const title = text
    .trim()
    .replace(/^\s*(?:标题|Title)\s*[:：]\s*/i, '')
    .replace(/^["'“”‘’「」《》`#*\s]+|["'“”‘’「」《》`*\s]+$/g, '')
    .trim()
  return title && !/[\r\n]/.test(title) && Array.from(title).length <= 60 ? title : null
}
