// PDF artifact support (2026-10-06).
//
// PDFs join the "external" kind: the browser's built-in viewer renders them in a
// tab, like video/audio/html, and they inherit FILE_EXTERNAL_MAX_BYTES (50MB)
// rather than the 5MB in-app viewer cap.
//
// THE SECURITY POINT THIS PINS: a PDF is ACTIVE content. Chrome's and Firefox's
// built-in viewers execute JavaScript embedded in a PDF (/OpenAction, /AA, XFA).
// Artifacts are arbitrary, possibly-hostile, agent-authored bytes served from
// this cookie-bearing origin, so a PDF must be served with the SAME
// `Content-Security-Policy: sandbox` as HTML. Serving it like an image (inert,
// unsandboxed) would let a hostile PDF reach this origin's storage and APIs.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverSrc = fs.readFileSync(path.join(root, "server.mjs"), "utf8");

// --- 1. the client-side viewable list recognizes .pdf ------------------------
const { linkifyEscaped } = await import("../public/linkify.js");

for (const p of ["./report.pdf", "out/invoice.pdf", "~/docs/spec.PDF", "/abs/p.pdf"]) {
  const html = linkifyEscaped(p);
  assert.match(html, /data-file-path=/, `PDF path not linkified: ${p}`);
}
// A bare word must still not match (the leading ./ or a separator is required).
assert.doesNotMatch(linkifyEscaped("pdf"), /data-file-path=/);
assert.doesNotMatch(linkifyEscaped("thepdf"), /data-file-path=/);

// --- 2. server: .pdf is external, with the right content type ---------------
assert.match(serverSrc, /\[["']\.pdf["'],\s*["']application\/pdf["']\]/,
  "server.mjs must map .pdf -> application/pdf in EXTERNAL_EXTS");
// It must be in EXTERNAL_EXTS (browser tab + 50MB cap), not IMAGE/TEXT.
{
  const ext = serverSrc.slice(serverSrc.indexOf("const EXTERNAL_EXTS"));
  const block = ext.slice(0, ext.indexOf("]);"));
  assert.ok(block.includes(".pdf"), ".pdf must live in EXTERNAL_EXTS");
}

// --- 3. THE REGRESSION: PDF must be treated as ACTIVE content ---------------
// Mirrors isActiveContentType()/rawArtifactSecurityHeaders() in server.mjs.
const isHtmlContentType = (ct) => /^text\/html\b/i.test(String(ct || ""));
const isActiveContentType = (ct) => {
  const text = String(ct || "");
  return isHtmlContentType(text) || /^application\/pdf\b/i.test(text);
};
function rawArtifactSecurityHeaders(contentType, { download = false } = {}) {
  const headers = { "x-content-type-options": "nosniff" };
  if (!download && isActiveContentType(contentType)) {
    headers["content-security-policy"] = "sandbox allow-scripts allow-popups allow-forms";
  }
  return headers;
}

// A PDF served inline MUST be sandboxed — this is the whole point.
assert.match(
  rawArtifactSecurityHeaders("application/pdf")["content-security-policy"] || "",
  /^sandbox /,
  "an inline PDF must be served with a CSP sandbox, like HTML",
);
// Parameters on the type must not defeat the check.
assert.match(
  rawArtifactSecurityHeaders("application/pdf; charset=binary")["content-security-policy"] || "",
  /^sandbox /,
);
// HTML keeps its sandbox (no regression).
assert.match(rawArtifactSecurityHeaders("text/html; charset=utf-8")["content-security-policy"] || "", /^sandbox /);
// Inert types stay unsandboxed — we are not sandboxing everything indiscriminately.
for (const inert of ["image/png", "video/mp4", "audio/mpeg", "text/plain; charset=utf-8"]) {
  assert.equal(
    rawArtifactSecurityHeaders(inert)["content-security-policy"],
    undefined,
    `${inert} is inert and must NOT be sandboxed`,
  );
}
// The download path never executes, so no sandbox even for a PDF.
assert.equal(
  rawArtifactSecurityHeaders("application/pdf", { download: true })["content-security-policy"],
  undefined,
);
// nosniff is always present.
assert.equal(rawArtifactSecurityHeaders("application/pdf")["x-content-type-options"], "nosniff");

// --- 4. the real source must wire the active-content check ------------------
// Without this the mirror above would keep passing after a refactor dropped it.
assert.match(serverSrc, /function isActiveContentType\(/,
  "server.mjs lost isActiveContentType()");
assert.match(serverSrc, /application\\\/pdf/,
  "isActiveContentType must test for application/pdf");
assert.match(
  serverSrc,
  /if \(!download && isActiveContentType\(contentType\)\)/,
  "rawArtifactSecurityHeaders must gate the sandbox on isActiveContentType, not isHtmlContentType",
);
// The old HTML-only gate must be gone from the header function.
assert.doesNotMatch(
  serverSrc,
  /if \(!download && isHtmlContentType\(contentType\)\)/,
  "the sandbox gate must no longer be HTML-only",
);

// --- 5. client and server lists must agree on pdf ---------------------------
const linkifySrc = fs.readFileSync(path.join(root, "public", "linkify.js"), "utf8");
assert.match(linkifySrc, /VIEWABLE_FILE_EXTS\s*=\s*\n?\s*"[^"]*\bpdf\b/,
  "public/linkify.js must list pdf as viewable (kept in sync with the server)");

console.log("pdf-artifact: ok");
