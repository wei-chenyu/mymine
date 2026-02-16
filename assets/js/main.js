const treeEl = document.getElementById("tree");
const contentEl = document.getElementById("content");
const titleEl = document.getElementById("title");
const summaryEl = document.getElementById("summary");
const breadcrumbEl = document.getElementById("breadcrumb");
let nodes = new Map(), parent = new Map();

fetch("assets/data/manifest.json")
  .then(r => r.json())
  .then(tree => {
    index(tree);
    const kids = tree.children || [];
    if (!kids.length) {
      treeEl.textContent = "暂无内容，请在 content/ 下新增文件夹或 Markdown 再运行构建。";
      renderEmpty();
      return;
    }
    treeEl.appendChild(renderTree(kids));
    select(kids[0].id);
  })
  .catch(err => { contentEl.textContent = "加载清单失败: " + err; });

function index(node, p = null) {
  nodes.set(node.id, node);
  if (p) parent.set(node.id, p.id);
  (node.children || []).forEach(c => index(c, node));
}

function renderTree(list) {
  const ul = document.createElement("ul");
  ul.className = "tree";
  list.forEach(n => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "tree-btn";
    btn.textContent = n.title;
    btn.dataset.id = n.id;
    li.appendChild(btn);
    if (n.type === "folder" && n.children?.length) li.appendChild(renderTree(n.children));
    ul.appendChild(li);
  });
  ul.addEventListener("click", e => {
    const b = e.target.closest(".tree-btn");
    if (b) select(b.dataset.id);
  });
  return ul;
}

function select(id) {
  const n = nodes.get(id);
  if (!n) return;
  titleEl.textContent = n.title;
  summaryEl.textContent = n.summary || (n.type === "folder" ? "文件夹" : "");
  breadcrumbEl.textContent = breadcrumb(n).join(" / ");
  renderBlocks(n);
  document.querySelectorAll(".tree-btn").forEach(b => b.classList.toggle("active", b.dataset.id === id));
}

function breadcrumb(n) {
  const path = [];
  while (n) { path.unshift(n.title); n = parent.get(n.id) ? nodes.get(parent.get(n.id)) : null; }
  return path;
}

function renderBlocks(n) {
  contentEl.innerHTML = "";
  if (n.type === "folder") {
    const list = document.createElement("ul");
    list.className = "child-list";
    (n.children || []).forEach(c => {
      const li = document.createElement("li");
      li.textContent = `${c.type === "folder" ? "📁" : "📝"} ${c.title}`;
      li.onclick = () => select(c.id);
      list.appendChild(li);
    });
    contentEl.appendChild(list);
    return;
  }
  const wrap = document.createElement("article");
  wrap.className = "block";
  wrap.innerHTML = n.html || "<p class='muted'>空文档</p>";
  contentEl.appendChild(wrap);
}

function renderEmpty() {
  breadcrumbEl.textContent = "";
  titleEl.textContent = "暂无内容";
  summaryEl.textContent = "在 content/ 中添加 Markdown 或文件夹，然后重新运行 manifest 构建。";
  contentEl.innerHTML = "<p class='muted'>还没有任何文件。</p>";
}
