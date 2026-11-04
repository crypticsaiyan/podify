// Turns whatever the user added (links, GitHub repos, text, extracted files) into plain source text.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extractText, getDocumentProxy } from "unpdf";
import { ApiError } from "./assemblyai";
import type { SourceInput } from "./podcast";

// Total budget across all sources. About 6k tokens at the default: fits the small free-tier
// model and its tokens-per-minute cap. Raise SOURCE_CHAR_LIMIT on a paid plan.
const SOURCE_LIMIT = Number(process.env.SOURCE_CHAR_LIMIT) || 24_000;
const TIMEOUT = 30_000;

const MIN_TEXT = 300;

export async function loadSource(input: string, limit = SOURCE_LIMIT): Promise<string> {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    if (trimmed.split(/\s+/).length < 20) throw new ApiError("That text is too short to make an episode from (20+ words)", 422);
    return trimmed.slice(0, limit);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ApiError("That doesn't look like a valid link", 422);
  }
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname)) {
    throw new ApiError("YouTube videos aren't supported yet; paste the transcript as a text source instead", 422);
  }

  const text =
    (await fromGitHub(trimmed)) ??
    (await fromStackExchange(url)) ??
    (await fromJina(trimmed)) ??
    (await fromHtml(trimmed));
  if (!text || text.length < MIN_TEXT) {
    throw new ApiError(
      `Couldn't read ${url.hostname}: the page is blocked, empty or not found. Try pasting its text instead`,
      422,
    );
  }
  return text.slice(0, limit);
}

// Every source gets an equal share of the budget, labelled so the writer can tell them apart.
export async function loadSources(inputs: SourceInput[]): Promise<string> {
  const share = Math.floor(SOURCE_LIMIT / inputs.length);
  const texts = await Promise.all(
    inputs.map(async (s, i) => {
      try {
        return await loadSource(s.value, share);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "unreadable";
        throw new ApiError(`Source ${i + 1} (${s.label}): ${reason}`, 422);
      }
    }),
  );
  if (inputs.length === 1) return texts[0];
  return texts.map((t, i) => `=== Source ${i + 1}: ${inputs[i].label} ===\n${t}`).join("\n\n");
}

export async function extractFile(file: File): Promise<string> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return (await file.text()).trim();

  const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
  if (pdf.numPages > 300) throw new ApiError("PDF is too long (max 300 pages)", 413);
  const { text } = await extractText(pdf, { mergePages: true });
  return text.trim();
}

type Fetched = { status: number; text: string | null };

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<Fetched> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) });
    return { status: res.status, text: res.ok ? (await res.text()).trim() : null };
  } catch {
    return { status: 0, text: null };
  }
}

const get = async (url: string, headers?: Record<string, string>) => (await fetchText(url, headers)).text;

// Markdown links and images are mostly URLs: noise for the writer and wasted context.
function cleanMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?(img|picture|source|div|p|a|br|hr|h\d|sup|sub|span|details|summary|table|tr|td|th|thead|tbody)\b[^>]*>/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const README_NAMES = ["README.md", "readme.md", "Readme.md", "README.rst", "README.txt", "README"];

// The README comes from raw.githubusercontent.com, which has no API rate limit; repo metadata
// and the file list come from the API (60 requests/hour without GITHUB_TOKEN) and are optional.
async function fromGitHub(url: string): Promise<string | null> {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/(blob|tree)\/([^/]+)\/?([^#?]*))?/i);
  if (!match) return null;
  const [, owner, rawRepo, kind, ref = "HEAD", path = ""] = match;
  const repo = rawRepo.replace(/\.git$/, "");
  const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}`;

  if (kind === "blob") {
    const file = await get(`${raw}/${path}`);
    if (!file) throw new ApiError("That GitHub file was not found (or the repo is private)", 404);
    return cleanMarkdown(file);
  }

  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const headers: Record<string, string> = { "User-Agent": "podify", Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const dir = path ? `${path.replace(/\/$/, "")}/` : "";

  const [meta, files, readme] = await Promise.all([
    fetchText(api, headers),
    fetchText(`${api}/contents/${dir}${ref === "HEAD" ? "" : `?ref=${ref}`}`, headers),
    (async () => {
      for (const name of README_NAMES) {
        const text = await get(`${raw}/${dir}${name}`);
        // A symlinked README is served as its target path (vercel/next.js does this).
        if (text && /^[\w./-]+$/.test(text) && text.length < 200) return get(`${raw}/${text.replace(/^\.?\//, "")}`);
        if (text) return text;
      }
      return null;
    })(),
  ]);
  if (meta.status === 404 || (!meta.text && !readme)) {
    throw new ApiError("That GitHub repo was not found (or it is private)", 404);
  }

  const parts = [`GitHub repository: ${owner}/${repo}${dir ? ` (folder ${dir})` : ""}`];
  if (meta.text) {
    const m = JSON.parse(meta.text);
    parts.push(
      [
        m.description && `Description: ${m.description}`,
        m.language && `Main language: ${m.language}`,
        m.topics?.length && `Topics: ${m.topics.join(", ")}`,
        `Stars: ${m.stargazers_count}, forks: ${m.forks_count}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  const list = files.text ? JSON.parse(files.text) : null;
  if (Array.isArray(list)) {
    parts.push(`Files: ${list.map((f: { name: string; type: string }) => (f.type === "dir" ? `${f.name}/` : f.name)).join(", ")}`);
  }
  if (readme) parts.push(`README:\n${cleanMarkdown(readme)}`);
  return parts.join("\n\n");
}

// Stack Overflow blocks scrapers, but its public API serves the question and top answers.
async function fromStackExchange(url: URL): Promise<string | null> {
  const site = url.hostname === "stackoverflow.com" || url.hostname === "www.stackoverflow.com"
    ? "stackoverflow"
    : url.hostname.match(/^(\w+)\.stackexchange\.com$/)?.[1];
  const id = url.pathname.match(/^\/questions\/(\d+)/)?.[1];
  if (!site || !id) return null;

  const api = "https://api.stackexchange.com/2.3";
  const [question, answers] = await Promise.all([
    get(`${api}/questions/${id}?site=${site}&filter=withbody`),
    get(`${api}/questions/${id}/answers?site=${site}&filter=withbody&sort=votes&pagesize=5`),
  ]);
  const q = question ? JSON.parse(question).items?.[0] : null;
  if (!q) return null;
  const parts = [`Question: ${stripHtml(q.title)} (score ${q.score})`, stripHtml(q.body)];
  for (const a of answers ? JSON.parse(answers).items ?? [] : []) {
    parts.push(`Answer (score ${a.score}${a.is_accepted ? ", accepted" : ""}):\n${stripHtml(a.body)}`);
  }
  return parts.join("\n\n");
}

// Jina Reader gives clean article text for most of the web. It answers 200 even when the
// target page failed, flagging it with a warning line, so those are treated as failures.
async function fromJina(url: string): Promise<string | null> {
  const text = await get(`https://r.jina.ai/${url}`, { Accept: "text/plain", "X-Retain-Images": "none" });
  if (!text || /^Warning: Target URL returned error \d+/m.test(text)) return null;
  const title = text.match(/^Title: (.*)$/m)?.[1]?.trim();
  const body = text.replace(/^[\s\S]*?Markdown Content:\n/, "");
  return cleanMarkdown(title ? `${title}\n\n${body}` : body);
}

function isPrivateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(mapped) === 6) return /^(::1?$|f[cd]|fe[89ab])/.test(mapped);
  const [a, b] = mapped.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

// This is the one place the server itself requests a user-supplied URL, so it must not be
// usable to reach internal services (cloud metadata, localhost, private networks).
async function isPublicUrl(url: URL): Promise<boolean> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  try {
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    return addresses.length > 0 && !addresses.some((a) => isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

// Last resort: fetch the page ourselves and strip the markup. Redirects are followed by hand
// so every hop gets checked.
async function fromHtml(input: string): Promise<string | null> {
  let url = new URL(input);
  for (let hop = 0; hop < 4; hop++) {
    if (!(await isPublicUrl(url))) return null;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (podify)" },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT),
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      return res.ok ? stripHtml(await res.text()) : null;
    } catch {
      return null;
    }
  }
  return null;
}
