const avatarEl = document.getElementById("avatar");
const introTitle = document.getElementById("intro-title");
const introSummary = document.getElementById("intro-summary");
const stackHeader = document.getElementById("stack-header");
const stackEl = document.getElementById("stack");

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
    setIntro(roots[0]);
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
    back.addEventListener("click", goBack);
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
    card.addEventListener("click", () => openNode(node));
    stackEl.appendChild(card);
  });
}

function openNode(node) {
  activeNodeId = node.id;
  setIntro(node);
  if (node.type === "folder") {
    pathStack.push({
      title: node.title || "目录",
      list: currentList
    });
    currentList = node.children || [];
    activeNodeId = null;
    updateHeader(node.title || "目录");
  }
  renderStack();
}

function goBack() {
  const last = pathStack.pop();
  if (!last) return;
  currentList = last.list;
  activeNodeId = null;
  updateHeader(pathStack.length ? pathStack[pathStack.length - 1].title : "一级目录");
  introTitle.textContent = last.title;
  introSummary.textContent = "已返回上一级。";
  renderStack();
}

function setIntro(node) {
  introTitle.textContent = node.title || "未命名";
  if (node.type === "note") {
    const text = htmlToText(node.html || "");
    introSummary.textContent = text ? text.slice(0, 120) : "Markdown 文档";
    return;
  }
  const count = (node.children || []).length;
  introSummary.textContent = node.summary || `文件夹，包含 ${count} 个子项`;
}

function renderEmpty() {
  updateHeader("空");
  introTitle.textContent = "暂无内容";
  introSummary.textContent = "请在 content 下添加文件夹或 Markdown，然后重新生成 manifest。";
  stackEl.innerHTML = "";
}

function renderFail(err) {
  updateHeader("失败");
  introTitle.textContent = "加载失败";
  introSummary.textContent = String(err);
  stackEl.innerHTML = "";
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}
