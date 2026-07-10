export type FilePathTextPart =
  | { kind: "text"; text: string }
  | { kind: "file"; text: string; path: string };

const VIEWABLE_FILE_EXTS =
  "png|jpe?g|gif|svg|webp|bmp|ico|md|markdown|mdown|mkd|webm|mp4|m4v|mov|wav|mp3|ogg|m4a|aac|flac|html?";

const VIEWABLE_FILE_EXT_RE = new RegExp(String.raw`\.(?:${VIEWABLE_FILE_EXTS})$`, "i");
export const MARKDOWN_FILE_EXT_RE = /\.(md|markdown|mdown|mkd)$/i;
export const OVERLAY_VIEWER_EXT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico|html?)$/i;

const SEG = String.raw`[^\s<>"'(){}\[\]:/]`;
const WRAP = String.raw`(?:\n[ \t]*)?`;
const FILE_PATH_RE = new RegExp(
  String.raw`(?:\.{0,2}\/|~\/)?(?:${SEG}+\/${WRAP})*${SEG}+\.(?:${VIEWABLE_FILE_EXTS})\b`,
  "gi",
);
const ABSOLUTE_OR_HOME_RE = /^(?:\/|~\/)/;
const DEFAULT_IMAGE_HANDLER_TEMP_PATH_RE = /^https?:\/\/((?:\.\.\/)+var\/folders\/.+)$/i;
const DAMAGED_UPLOAD_TEMP_PATH_RE = /^(?:\.\.\/)+(var\/folders\/)/;

function isProbablyUrlPath(text: string, index: number, match: string): boolean {
  if (/^www\./i.test(match)) return true;
  const before = text.slice(Math.max(0, index - 64), index);
  return /(?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s]*$/i.test(before);
}

export function splitFilePathText(text: string): FilePathTextPart[] {
  const input = String(text || "");
  const parts: FilePathTextPart[] = [];
  let lastEnd = 0;
  FILE_PATH_RE.lastIndex = 0;

  for (let match = FILE_PATH_RE.exec(input); match; match = FILE_PATH_RE.exec(input)) {
    const visible = match[0];
    const start = match.index;
    const end = start + visible.length;
    if (isProbablyUrlPath(input, start, visible)) continue;

    if (start > lastEnd) parts.push({ kind: "text", text: input.slice(lastEnd, start) });
    parts.push({
      kind: "file",
      text: visible,
      path: repairUploadTempPath(visible.replace(/\/\n[ \t]*/g, "/")),
    });
    lastEnd = end;
  }

  if (lastEnd < input.length) parts.push({ kind: "text", text: input.slice(lastEnd) });
  return parts.length ? parts : [{ kind: "text", text: input }];
}

function decodePathPart(pathPart: string): string {
  try {
    return decodeURI(pathPart);
  } catch {
    return pathPart;
  }
}

function repairUploadTempPath(filePath: string): string {
  return String(filePath || "").replace(DAMAGED_UPLOAD_TEMP_PATH_RE, "/$1");
}

function dirname(filePath: string): string {
  const clean = String(filePath || "").split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const slash = clean.lastIndexOf("/");
  if (slash <= 0) return slash === 0 ? "/" : "";
  return clean.slice(0, slash);
}

function normalizeJoinedPath(filePath: string): string {
  const absolute = filePath.startsWith("/");
  const segments = filePath.split("/");
  const out: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (out.length && out[out.length - 1] !== "..") {
        out.pop();
      } else if (!absolute) {
        out.push("..");
      }
      continue;
    }
    out.push(segment);
  }
  return `${absolute ? "/" : ""}${out.join("/")}` || (absolute ? "/" : ".");
}

export function resolveLinkedFilePath(filePath: string, basePath = ""): string {
  const clean = repairUploadTempPath(String(filePath || "").trim());
  if (!clean || ABSOLUTE_OR_HOME_RE.test(clean) || !basePath) return clean;
  const baseDir = dirname(basePath);
  if (!baseDir) return clean;
  return normalizeJoinedPath(`${baseDir}/${clean}`);
}

export function filePathFromLocalHref(href: string, basePath = ""): string {
  let raw = String(href || "").trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("//")) return "";
  const damagedTempPath = raw.match(DEFAULT_IMAGE_HANDLER_TEMP_PATH_RE);
  if (damagedTempPath) {
    raw = damagedTempPath[1] || "";
  } else if (/^file:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      raw = raw.replace(/^file:\/\//i, "");
    }
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return "";
  }
  const pathPart = raw.split(/[?#]/, 1)[0];
  if (!VIEWABLE_FILE_EXT_RE.test(pathPart)) return "";
  return resolveLinkedFilePath(decodePathPart(pathPart), basePath);
}

export function fileViewerEndpoint(filePath: string): string {
  if (MARKDOWN_FILE_EXT_RE.test(filePath)) return "/api/file-view";
  if (OVERLAY_VIEWER_EXT_RE.test(filePath)) return "/api/file-page";
  return "/api/file-raw";
}
