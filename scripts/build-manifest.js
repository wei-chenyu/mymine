import { promises as fs } from "fs";
import path from "path";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = path.resolve("content");
const mediaPrefix = "/media/";

async function walk(dir, base = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const children = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    const rel = path.join(base, e.name).replace(/\\/g, "/");
    if (e.isDirectory()) {
      children.push({
        id: rel,
        type: "folder",
        title: e.name,
        children: await walk(full, rel)
      });
    } else if (e.isFile() && e.name.endsWith(".md")) {
      const raw = await fs.readFile(full, "utf8");
      const { content, data } = matter(raw);
      const html = marked.parse(content);
      children.push({
        id: rel,
        type: "note",
        title: data.title || e.name.replace(/\\.md$/, ""),
        summary: data.summary || "",
        html
      });
    }
  }
  return children.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans"));
}

const tree = { id: "root", title: "内容库", children: await walk(ROOT) };
await fs.mkdir("assets/data", { recursive: true });
await fs.writeFile("assets/data/manifest.json", JSON.stringify(tree, null, 2));
console.log("manifest updated");
