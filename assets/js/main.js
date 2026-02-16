const avatarEl = document.getElementById("avatar");
const introTitle = document.getElementById("intro-title");
const introSummary = document.getElementById("intro-summary");
const stackEl = document.getElementById("stack");
const stackHeader = document.getElementById("stack-header");
const detailEl = document.getElementById("detail");

let nodes = new Map();
let parent = new Map();
let level = [];          // 当前层的节点列表
let trail = [];          // 导航栈，存放 {node, levelTitle}

if (avatarEl) {
  avatarEl.onerror = () => { avatarEl.src = "assets/img/avatar-fallback.svg"; };
}

fetch("assets/data/manifest.json", { cache: "no-cache" })
  .then(r => r.json())
  .then(tree => {
    index(tree);
    const roots = tree.children || [];
    if (!roots.length) return renderEmpty("暂无内容", "在 content/ 中新增文件夹或 Markdown，然后运行 node scripts/build-manifest.js。");
    level = roots;
    updateStackTitle("一级目录");
    renderStack(level);
    selectNode(roots[0]);
  })
  .catch(err => renderEmpty("加载失败", String(err)));

function index(node, p = null) {
  nodes.set(node.id, node);
  if (p) parent.set(node.id, p.id);
  (node.children || []).forEach(c => index(c, node));
}

function updateStackTitle(text) {
  stackHeader.querySelector("span").textContent = "卡片堆叠 · " + text;
}

function renderStack(list) {
  stackEl.innerHTML = "";
  if (trail.length) {
    const back = document.createElement("div");
    back.className = "card back";
    back.innerHTML = "<h3>返回上一级</h3><p class='muted'>返回 " + (trail[trail.length - 1].levelTitle) + "</p>";
    back.onclick = goBack;
    stackEl.appendChild(back);
  }
  list.forEach((n, i) => {
    const card = makeCard(n, n.type === "folder" ? "folder" : "note");
    card.style.transform = `translateX(${i * -10}px)`;
    card.onclick = () => selectNode(n);
    stackEl.appendChild(card);
  });
}

function selectNode(node) {
  highlight(stackEl, node.id);
  introTitle.textContent = node.title;
  introSummary.textContent = node.summary || (node.type === "folder" ? "文件夹" : "笔记");
  renderDetail(node);

  if (node.type === "folder") {
    level = node.children || [];
    renderStack(level);
    updateStackTitle(node.title);
  }
}

function goBack() {
  const last = trail.pop();
  if (!last) return;
  level = last.level;
  updateStackTitle(last.levelTitle);
  renderStack(level);
  const parentNode = nodes.get(last.parentId);
  if (parentNode) {
    highlight(stackEl, parentNode.id);
    renderDetail(parentNode);
    introTitle.textContent = parentNode.title;
    introSummary.textContent = parentNode.summary || (parentNode.type === "folder" ? "文件夹" : "笔记");
  }
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
    rail.className = "stack rail inner";
    children.forEach((c, i) => {
      const card = makeCard(c, c.type === "folder" ? "folder" : "note");
      card.style.transform = `translateX(${i * -6}px)`;
      card.onclick = (e) => { e.stopPropagation(); drillDown(node, c); };
      rail.appendChild(card);
    });
    detailEl.append(rail);
  } else {
    const article = document.createElement("article");
    article.innerHTML = node.html || "<p class='muted'>空文档</p>";
    detailEl.append(article);
  }
}

function drillDown(current, child) {
  trail.push({ level: level, levelTitle: current.title, parentId: parent.get(current.id) || "root" });
  level = child.children || [];
  updateStackTitle(child.title);
  renderStack(level);
  selectNode(child);
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
  stackEl.innerHTML = "";
  introTitle.textContent = title;
  introSummary.textContent = desc;
  detailEl.innerHTML = `<p class="muted">${desc}</p>`;
}
