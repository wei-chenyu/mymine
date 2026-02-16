const avatarEl = document.getElementById("avatar");
const introTitle = document.getElementById("intro-title");
const introSummary = document.getElementById("intro-summary");
const rootStack = document.getElementById("root-stack");
const detailEl = document.getElementById("detail");

let nodes = new Map();
let parent = new Map();
let currentRoot = null;

if (avatarEl) {
  avatarEl.onerror = () => { avatarEl.src = "assets/img/avatar-fallback.svg"; };
}

fetch("assets/data/manifest.json", { cache: "no-cache" })
  .then(r => r.json())
  .then(tree => {
    index(tree);
    const roots = tree.children || [];
    if (!roots.length) return renderEmpty("暂无内容", "在 content/ 中新增文件夹或 Markdown，然后运行 node scripts/build-manifest.js。");
    renderRootStack(roots);
    selectRoot(roots[0].id);
  })
  .catch(err => renderEmpty("加载失败", String(err)));

function index(node, p = null) {
  nodes.set(node.id, node);
  if (p) parent.set(node.id, p.id);
  (node.children || []).forEach(c => index(c, node));
}

function renderRootStack(list) {
  rootStack.innerHTML = "";
  list.forEach((n, i) => {
    const card = makeCard(n, n.type === "folder" ? "folder" : "note");
    card.style.transform = `translateX(${i * -10}px)`;
    card.onclick = () => selectRoot(n.id);
    rootStack.appendChild(card);
  });
}

function selectRoot(id) {
  const n = nodes.get(id);
  if (!n) return;
  currentRoot = n;
  highlight(rootStack, id);
  introTitle.textContent = n.title;
  introSummary.textContent = n.summary || "左右滑动卡片，点击查看详情与子项。";
  renderDetail(n);
}

function renderDetail(node) {
  detailEl.innerHTML = "";
  const title = document.createElement("h2");
  title.textContent = node.title;
  const summary = document.createElement("span");
  summary.className = "muted";
  summary.textContent = node.summary || (node.type === "folder" ? "文件夹" : "笔记");
  detailEl.append(title, summary);

  if (node.type === "folder") {
    const children = node.children || [];
    if (!children.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "暂无子内容。";
      detailEl.append(empty);
      return;
    }
    const rail = document.createElement("div");
    rail.className = "stack rail";
    children.forEach((c, i) => {
      const card = makeCard(c, c.type === "folder" ? "folder" : "note");
      card.style.transform = `translateX(${i * -8}px)`;
      card.onclick = () => renderDetail(c);
      rail.appendChild(card);
    });
    detailEl.append(rail);
  } else {
    const article = document.createElement("article");
    article.innerHTML = node.html || "<p class='muted'>空文档</p>";
    detailEl.append(article);
  }
}

function makeCard(node, type) {
  const card = document.createElement("div");
  card.className = `card ${type}`;
  card.dataset.id = node.id;
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = type === "folder" ? "夹" : "MD";
  const h = document.createElement("h3");
  h.textContent = node.title;
  const p = document.createElement("p");
  p.textContent = node.summary || (node.type === "folder" ? "文件夹" : "Markdown 文档");
  card.append(badge, h, p);
  return card;
}

function highlight(container, id) {
  container.querySelectorAll(".card").forEach(card => {
    const active = card.dataset.id === id;
    card.classList.toggle("active", active);
  });
}

function renderEmpty(title, desc) {
  rootStack.innerHTML = "";
  introTitle.textContent = title;
  introSummary.textContent = desc;
  detailEl.innerHTML = `<p class="muted">${desc}</p>`;
}
