const avatarEl = document.getElementById("avatar");
const introTitle = document.getElementById("intro-title");
const introSummary = document.getElementById("intro-summary");
const stageEl = document.getElementById("stack-stage");
const backBtn = document.getElementById("back-btn");

if (avatarEl) {
  avatarEl.onerror = () => {
    avatarEl.src = "assets/img/avatar-fallback.svg";
  };
}

const state = {
  list: [],
  center: 0,
  path: []
};

backBtn.addEventListener("click", goBack);

fetch("assets/data/manifest.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((tree) => {
    const roots = tree.children || [];
    if (!roots.length) {
      renderEmpty("暂无内容，请在 content 里添加文件夹或 Markdown。");
      introTitle.textContent = "暂无内容";
      introSummary.textContent = "运行 node scripts/build-manifest.js 后刷新页面。";
      return;
    }
    state.list = roots;
    state.center = 0;
    updateIntro(state.list[state.center]);
    render();
  })
  .catch((err) => {
    renderEmpty("加载失败");
    introTitle.textContent = "加载失败";
    introSummary.textContent = String(err);
  });

function render() {
  stageEl.innerHTML = "";
  toggleBack();

  const n = state.list.length;
  if (!n) {
    renderEmpty("该目录为空。");
    return;
  }

  for (let i = 0; i < n; i += 1) {
    const node = state.list[i];
    const rel = shortestOffset(i, state.center, n);
    const abs = Math.abs(rel);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    if (rel === 0) card.classList.add("active");
    card.dataset.index = String(i);
    card.innerHTML = `
      <span class="badge">${node.type === "note" ? "MD" : "夹"}</span>
      <h3>${escapeHtml(node.title || "未命名")}</h3>
      <p>${escapeHtml(node.summary || (node.type === "note" ? "Markdown 文档" : "文件夹"))}</p>
    `;

    const x = rel * 170;
    const scale = Math.max(0.58, 1 - abs * 0.12);
    const y = abs * 14;
    const rotate = rel * -5;
    const opacity = Math.max(0.3, 1 - abs * 0.12);
    card.style.transform = `translate(-50%, -50%) translateX(${x}px) translateY(${y}px) scale(${scale}) rotateY(${rotate}deg)`;
    card.style.zIndex = String(100 - abs);
    card.style.opacity = String(opacity);

    card.addEventListener("click", () => onCardClick(i));
    stageEl.appendChild(card);
  }
}

function onCardClick(index) {
  if (index !== state.center) {
    state.center = index;
    updateIntro(state.list[state.center]);
    render();
    return;
  }

  const node = state.list[index];
  if (node.type === "folder") {
    state.path.push({
      list: state.list,
      center: state.center,
      parentTitle: node.title || "目录"
    });
    state.list = node.children || [];
    state.center = 0;
    updateIntro(node);
    render();
    return;
  }

  updateIntro(node);
}

function goBack() {
  const last = state.path.pop();
  if (!last) return;
  state.list = last.list;
  state.center = Math.min(last.center, Math.max(0, state.list.length - 1));
  updateIntro(state.list[state.center] || { title: last.parentTitle, type: "folder", summary: "已返回上一级。" });
  render();
}

function toggleBack() {
  backBtn.hidden = state.path.length === 0;
}

function updateIntro(node) {
  const title = node?.title || "未命名";
  introTitle.textContent = title;

  if (node?.type === "note") {
    const text = htmlToText(node.html || "");
    introSummary.textContent = text ? text.slice(0, 130) : "Markdown 文档";
    return;
  }

  const count = (node?.children || []).length;
  introSummary.textContent = node?.summary || `文件夹，包含 ${count} 个子项。`;
}

function renderEmpty(text) {
  stageEl.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}

function shortestOffset(index, center, total) {
  const raw = index - center;
  const half = total / 2;
  if (raw > half) return raw - total;
  if (raw < -half) return raw + total;
  return raw;
}

function htmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
