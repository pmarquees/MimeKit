const PROMPT_INJECTION_MARKERS = [
  "ignore previous instructions",
  "system prompt",
  "developer instructions",
  "act as",
  "jailbreak",
  "you are chatgpt"
];

const SCRIPT_EXTENSIONS = new Set([
  "sh",
  "bash",
  "zsh",
  "ps1",
  "bat",
  "cmd",
  "exe",
  "dll",
  "so",
  "dylib"
]);

const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "pdf",
  "zip",
  "tar",
  "gz",
  "ico",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "mp3",
  "mp4",
  "mov",
  "webm",
  "avif"
]);

export function estimateTokens(input: string): number {
  return Math.ceil(input.length / 4);
}

export function fileExtension(path: string): string {
  const clean = path.split("?")[0] ?? path;
  const idx = clean.lastIndexOf(".");
  if (idx < 0 || idx === clean.length - 1) return "";
  return clean.slice(idx + 1).toLowerCase();
}

export function isBinaryFile(path: string): boolean {
  return BINARY_EXTENSIONS.has(fileExtension(path));
}

export function isScriptFile(path: string): boolean {
  return SCRIPT_EXTENSIONS.has(fileExtension(path));
}

export function sanitizeTextForPrompt(content: string): string {
  const lowered = content.toLowerCase();
  let sanitized = content;
  for (const marker of PROMPT_INJECTION_MARKERS) {
    if (lowered.includes(marker)) {
      const regex = new RegExp(marker, "gi");
      sanitized = sanitized.replace(regex, "[filtered-marker]");
    }
  }
  return sanitized;
}

export function safeSnippet(content: string, maxLen = 12_000): string {
  const trimmed = content.slice(0, maxLen);
  return sanitizeTextForPrompt(trimmed);
}
