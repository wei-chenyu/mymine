const avatarEl = document.getElementById("avatar");
const introTitle = document.getElementById("intro-title");
const introSummary = document.getElementById("intro-summary");
const stackHeader = document.getElementById("stack-header");
const stackEl = document.getElementById("stack");
const detailEl = document.getElementById("detail");

if (avatarEl) {
  avatarEl.onerror = () => {
    avatarEl.src = "assets/img/avatar-fallback.svg";
  };
}

let currentList = [];
let pathStack = [];
let activeNodeId = null;

fetch("assets/data/manifest.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((tree) => {
    const roots = tree.children || [];
    if (!roots.length) {
      renderEmpty();
      return;
    }
    currentList = roots;
    updateHeader("一级目录");
    renderStack();
    openNode(roots[0], false);
  })
  .catch((err) => {
    renderFail(err);
  });

function updateHeader(title) {
  const label = stackHeader.querySelector("span");
  if (label) label.textContent = `卡片堆叠 - ${title}`;
}

function renderStack() {
  stackEl.innerHTML = "";

  if (pathStack.length) {
    const back = document.createElement("button");
    back.className = "card back";
    back.type = "button";
    back.innerHTML = "<h3>返回</h3><p>上一层</p>";
    back.addEventListener("click", () => goBack());
    stackEl.appendChild(back);
  }

  currentList.forEach((node) => {
    const card = document.createElement("button");
    card.className = `card ${node.type || "folder"}`;
    if (node.id === activeNodeId) card.classList.add("active");
    card.type = "button";
    card.dataset.id = node.id;
    card.innerHTML = `
      <span class="badge">${node.type === "note" ? "MD" : "夹"}</span>
      <h3>${escapeHtml(node.title || "未命名")}</h3>
      <p>${escapeHtml(node.summary || (node.type === "note" ? "Markdown 文档" : "文件夹"))}</p>
    `;
    card.addEventListener("click", () => openNode(node, true));
    stackEl.appendChild(card);
  });
}

function openNode(node, allowDrill) {
  activeNodeId = node.id;
  introTitle.textContent = node.title || "未命名";
  introSummary.textContent = node.summary || (node.type === "note" ? "Markdown 文档" : "文件夹");

  if (allowDrill && node.type === "folder") {
    pathStack.push({
      title: node.title || "目录",
      list: currentList
    });
    currentList = node.children || [];
    updateHeader(node.title || "目录");
    activeNodeId = null;
    renderStack();
    renderFolder(node);
    return;
  }

  renderStack();
  if (node.type === "note") {
    renderNote(node);
  } else {
    renderFolder(node);
  }
}

function goBack() {
  const last = pathStack.pop();
  if (!last) return;
  currentList = last.list;
  activeNodeId = null;
  updateHeader(pathStack.length ? pathStack[pathStack.length - 1].title : "一级目录");
  renderStack();
  detailEl.innerHTML = `
    <h2>${escapeHtml(last.title)}</h2>
    <p class="meta">已返回上一级，请从左侧继续选择。</p>
  `;
}

function renderFolder(node) {
  const children = node.children || [];
  detailEl.innerHTML = `
    <h2>${escapeHtml(node.title || "目录")}</h2>
    <p class="meta">${children.length ? `包含 ${children.length} 个子项` : "该目录暂无子项"}</p>
  `;
}

function renderNote(node) {
  const html = node.html || "<p>空文档</p>";
  detailEl.innerHTML = `
    <h2>${escapeHtml(node.title || "文档")}</h2>
    <p class="meta">${escapeHtml(node.summary || "Markdown 文档")}</p>
    <article>${html}</article>
  `;
}

function renderEmpty() {
  introTitle.textContent = "暂无内容";
  introSummary.textContent = "请在 content 下添加文件夹或 Markdown。";
  updateHeader("空");
  stackEl.innerHTML = "";
  detailEl.innerHTML = `<p class="meta">运行 node scripts/build-manifest.js 后刷新页面。</p>`;
}

function renderFail(err) {
  introTitle.textContent = "加载失败";
  introSummary.textContent = String(err);
  updateHeader("失败");
  stackEl.innerHTML = "";
  detailEl.innerHTML = `<p class="meta">manifest 读取失败。</p>`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
