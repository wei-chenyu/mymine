import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = path.resolve("content");
const PROFILE_MD = path.resolve("profile.md");
const REPO_ROOT = path.resolve(".");

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".ogg", ".mov"]);
const COMMON_EXT = [".md", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".mp4", ".webm", ".ogg", ".mov"];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function collectContentFiles() {
  const fileSet = new Set();

  async function walk(dir, base = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      const rel = path.posix.join(base, e.name).replace(/\\/g, "/");
      if (e.isDirectory()) {
        await walk(full, rel);
      } else if (e.isFile()) {
        fileSet.add(rel);
      }
    }
  }

  if (await exists(ROOT)) {
    await walk(ROOT);
  }

  return fileSet;
}

async function collectRepoFiles() {
  const fileSet = new Set();
  const basenameIndex = new Map();
  const skipDir = new Set([".git", "node_modules"]);

  async function walk(dir, base = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".github") continue;
      if (e.isDirectory() && skipDir.has(e.name)) continue;

      const full = path.join(dir, e.name);
      const rel = path.posix.join(base, e.name).replace(/\\/g, "/");
      if (e.isDirectory()) {
        await walk(full, rel);
      } else if (e.isFile()) {
        fileSet.add(rel);
        const baseName = path.posix.basename(rel);
        if (!basenameIndex.has(baseName)) basenameIndex.set(baseName, []);
        basenameIndex.get(baseName).push(rel);
      }
    }
  }

  await walk(REPO_ROOT);
  return { fileSet, basenameIndex };
}

function toPublicPathFromContent(relPath) {
  const clean = relPath.replace(/\\/g, "/");
  if (clean.startsWith("media/") || clean.startsWith("/media/")) return clean.replace(/^\//, "");
  return `content/${clean}`;
}

function resolveTarget(rawTarget, currentDirRel, contentFileSet, repoFileSet, repoBasenameIndex) {
  const cleaned = rawTarget.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
  const candidates = [];

  const fromCurrent = path.posix.normalize(path.posix.join(currentDirRel, cleaned));
  candidates.push(fromCurrent);

  if (!path.posix.extname(cleaned)) {
    candidates.push(`${fromCurrent}.md`);
    candidates.push(`${fromCurrent}.png`);
    candidates.push(`${fromCurrent}.jpg`);
    candidates.push(`${fromCurrent}.jpeg`);
    candidates.push(`${fromCurrent}.webp`);
  }

  const fromRoot = path.posix.normalize(cleaned.replace(/^\//, ""));
  if (fromRoot !== fromCurrent) {
    candidates.push(fromRoot);
    if (!path.posix.extname(fromRoot)) candidates.push(`${fromRoot}.md`);
  }

  for (const c of candidates) {
    if (contentFileSet.has(c)) return toPublicPathFromContent(c);
  }

  for (const c of candidates) {
    const repoCandidate = c.startsWith("content/") ? c : `content/${c}`.replace(/\/+/g, "/");
    if (repoFileSet.has(repoCandidate)) return repoCandidate;
    if (repoFileSet.has(c)) return c;
  }

  const normalized = cleaned.replace(/^\//, "");
  if (repoFileSet.has(normalized)) return normalized;
  if (!path.posix.extname(normalized)) {
    for (const ext of COMMON_EXT) {
      const withExt = `${normalized}${ext}`;
      if (repoFileSet.has(withExt)) return withExt;
    }
  }

  const basename = path.posix.basename(normalized);
  const basenameHits = repoBasenameIndex.get(basename) || [];
  if (basenameHits.length > 0) {
    const preferred = basenameHits.find(p => p.startsWith(`content/${currentDirRel}/`))
      || basenameHits.find(p => p.startsWith("content/"))
      || basenameHits[0];
    if (preferred) return preferred;
  }

  if (cleaned.startsWith("media/")) return cleaned;
  if (cleaned.startsWith("../media/")) return cleaned.replace(/^\.\.\//, "");
  if (cleaned.startsWith("/")) return cleaned.slice(1);
  return cleaned;
}

function obsidianToMarkdown(md, currentDirRel, contentFileSet, repoFileSet, repoBasenameIndex) {
  // Embed: ![[target|caption]]
  let out = md.replace(/!\[\[([^\]]+)\]\]/g, (_m, inner) => {
    const [rawTarget, rawCaption = ""] = inner.split("|");
    const target = rawTarget.trim();
    const caption = rawCaption.trim();
    const publicPath = resolveTarget(target, currentDirRel, contentFileSet, repoFileSet, repoBasenameIndex);
    const ext = path.extname(publicPath).toLowerCase();

    if (IMAGE_EXT.has(ext)) return `![${caption || path.basename(target)}](${publicPath})`;
    if (VIDEO_EXT.has(ext)) return `<video controls src="${publicPath}"></video>`;
    if (ext === ".md") return `[${caption || path.basename(target, ".md")}](${publicPath})`;
    return `[${caption || target}](${publicPath})`;
  });

  // Link: [[target|label]]
  out = out.replace(/\[\[([^\]]+)\]\]/g, (_m, inner) => {
    const [rawTarget, rawLabel = ""] = inner.split("|");
    const target = rawTarget.trim();
    const label = (rawLabel || target).trim();
    const publicPath = resolveTarget(target, currentDirRel, contentFileSet, repoFileSet, repoBasenameIndex);
    return `[${label}](${publicPath})`;
  });

  return out;
}

function extractImages(html) {
  const images = [];
  const imgRegex = /<img[^>]+src="([^"]+)"/g;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    images.push(match[1]);
  }
  return images;
}

function parseMarkdown(raw, currentDirRel, contentFileSet, repoFileSet, repoBasenameIndex) {
  const { content, data } = matter(raw);
  const normalized = obsidianToMarkdown(content, currentDirRel, contentFileSet, repoFileSet, repoBasenameIndex);
  const html = marked.parse(normalized);
  const rawShowTitle = data["标题"];
  const showTitle = typeof rawShowTitle === "boolean"
    ? rawShowTitle
    : String(rawShowTitle || "").trim().toLowerCase() !== "false";
  return {
    title: data.title || "",
    summary: data.summary || "",
    showTitle,
    html: html,
    images: extractImages(html),
    textContent: content.slice(0, 200)
  };
}

function collectFolderImages(children) {
  const images = [];
  let coverImage = null;

  // 查找 "封面.md" 作为主图
  const coverFile = children.find(c =>
    c.type === 'note' &&
    (c.title === '封面' || c.id.endsWith('封面.md'))
  );
  if (coverFile && coverFile.images && coverFile.images.length > 0) {
    coverImage = coverFile.images[0];
  }

  // 收集所有直接子级 md 文件的图像
  for (const child of children) {
    if (child.type === 'note' && child.images) {
      images.push(...child.images);
    }
  }

  return { images, coverImage };
}

async function walk(dir, contentFileSet, repoFileSet, repoBasenameIndex, base = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const children = [];

  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    const rel = path.posix.join(base, e.name).replace(/\\/g, "/");
    if (e.isDirectory()) {
      const folderChildren = await walk(full, contentFileSet, repoFileSet, repoBasenameIndex, rel);
      const { images, coverImage } = collectFolderImages(folderChildren);
      children.push({
        id: rel,
        type: "folder",
        title: e.name,
        children: folderChildren,
        images: images,
        coverImage: coverImage
      });
    } else if (e.isFile() && e.name.endsWith(".md")) {
      const raw = await fs.readFile(full, "utf8");
      const parsed = parseMarkdown(raw, base, contentFileSet, repoFileSet, repoBasenameIndex);
      children.push({
        id: rel,
        type: "note",
        title: parsed.title || e.name.replace(/\.md$/, ""),
        summary: parsed.summary || "",
        showTitle: parsed.showTitle,
        html: parsed.html,
        images: parsed.images,
        textContent: parsed.textContent
      });
    }
  }

  return children.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans"));
}

async function buildProfile(contentFileSet, repoFileSet, repoBasenameIndex) {
  if (!(await exists(PROFILE_MD))) {
    return {
      title: "个人简介",
      html: "<p>请在仓库根目录创建 profile.md。</p>"
    };
  }

  const raw = await fs.readFile(PROFILE_MD, "utf8");
  const parsed = parseMarkdown(raw, "", contentFileSet, repoFileSet, repoBasenameIndex);
  return {
    title: parsed.title || "个人简介",
    html: parsed.html
  };
}

const contentFileSet = await collectContentFiles();
const { fileSet: repoFileSet, basenameIndex: repoBasenameIndex } = await collectRepoFiles();
const tree = {
  id: "root",
  title: "content",
  profile: await buildProfile(contentFileSet, repoFileSet, repoBasenameIndex),
  children: await walk(ROOT, contentFileSet, repoFileSet, repoBasenameIndex)
};

await fs.mkdir("assets/data", { recursive: true });
await fs.writeFile("assets/data/manifest.json", JSON.stringify(tree, null, 2));
console.log("manifest updated");
