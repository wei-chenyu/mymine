const avatarEl = document.getElementById("avatar");
const profileTitleEl = document.getElementById("profile-title");
const profileContentEl = document.getElementById("profile-content");
const treeRootEl = document.getElementById("tree-root");

if (avatarEl) {
  avatarEl.onerror = () => {
    avatarEl.src = "assets/img/avatar-fallback.svg";
  };
}

const state = {
  tree: {},
  activeFile: null,
  // 轮播状态
  centerIndex: 0,
  hoveredIndex: -1,
  currentNodes: [],       // 当前显示的顶层节点列表
  expandedOverlay: null,  // 当前展开的 overlay DOM
  expandedNodeId: null    // 当前展开的文件夹 id
};

// 初始化：加载 manifest
fetch("assets/data/manifest.json", { cache: "no-cache" })
  .then((r) => r.json())
  .then((tree) => {
    if (tree.profile) renderProfile(tree.profile);

    if (!tree.children || tree.children.length === 0) {
      renderEmpty("暂无内容，请在 content 里添加文件夹或 Markdown。");
      return;
    }

    state.tree = tree;
    state.currentNodes = tree.children;
    state.centerIndex = Math.floor(tree.children.length / 2);
    renderCarousel(treeRootEl, state.currentNodes, state.centerIndex);
  })
  .catch((err) => {
    renderEmpty("加载失败");
    console.error(err);
  });

// 渲染个人简介
function renderProfile(profile) {
  if (profileTitleEl && profile.title) profileTitleEl.textContent = profile.title;
  if (profileContentEl) profileContentEl.innerHTML = profile.html || "<p>profile.md 为空。</p>";
}

// 渲染空状态
function renderEmpty(text) {
  treeRootEl.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}

// ========== 轮播渲染 ==========

function renderCarousel(container, nodes, centerIdx) {
  container.innerHTML = '';
  if (!nodes || nodes.length === 0) {
    renderEmpty("该目录为空。");
    return;
  }

  const count = nodes.length;

  nodes.forEach((node, i) => {
    const nodeEl = createCardElement(node);
    nodeEl.dataset.carouselIndex = i;
    container.appendChild(nodeEl);

    // 悬停：向中间聚拢
    nodeEl.addEventListener('mouseenter', () => {
      state.hoveredIndex = i;
      layoutCarousel(container, count, centerIdx);
    });

    nodeEl.addEventListener('mouseleave', () => {
      state.hoveredIndex = -1;
      layoutCarousel(container, count, centerIdx);
    });

    // 点击
    nodeEl.querySelector('.node-card').addEventListener('click', (e) => {
      e.stopPropagation();
      handleNodeClick(node);
    });
  });

  layoutCarousel(container, count, centerIdx);
}

// 计算轮播布局位置
function layoutCarousel(container, count, centerIdx) {
  const nodeEls = container.querySelectorAll(':scope > .node');
  const spacing = 200; // 每张卡片间距（px）
  const scaleStep = 0.1; // 每远离中心缩小的比例
  const zBase = 100;

  nodeEls.forEach((el, i) => {
    let offset = i - centerIdx;

    // 悬停时，被悬停的卡片向中心移动
    let hoverShift = 0;
    if (state.hoveredIndex >= 0 && i === state.hoveredIndex) {
      const hoverOffset = state.hoveredIndex - centerIdx;
      hoverShift = -hoverOffset * 40; // 向中心移动40px
    }

    const x = offset * spacing + hoverShift;
    const dist = Math.abs(offset);
    const scale = Math.max(0.65, 1 - dist * scaleStep);
    const zIndex = zBase - dist;
    const opacity = Math.max(0.4, 1 - dist * 0.15);

    el.style.transform = `translateX(${x}px) scale(${scale})`;
    el.style.zIndex = zIndex;
    el.style.opacity = opacity;
  });
}

// 创建单个卡片元素
function createCardElement(node) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'node';
  nodeEl.dataset.type = node.type;

  const cardEl = document.createElement('div');
  cardEl.className = 'node-card';

  if (node.type === 'folder') {
    cardEl.appendChild(createFolderVisual(node));
  } else {
    cardEl.appendChild(createNoteVisual(node));
  }

  // 标题
  const titleEl = document.createElement('div');
  titleEl.className = 'node-title';
  titleEl.textContent = node.title;
  cardEl.appendChild(titleEl);

  nodeEl.appendChild(cardEl);
  return nodeEl;
}

// 创建文件夹视觉 —— 整体绘制为文件夹造型
function createFolderVisual(node) {
  const wrap = document.createElement('div');
  wrap.className = 'folder-card-wrap';

  // 文件夹耳朵（标签页）
  const tab = document.createElement('div');
  tab.className = 'folder-tab';
  wrap.appendChild(tab);

  // 文件夹主体
  const body = document.createElement('div');
  body.className = 'folder-body';

  const hasImages = node.images && node.images.length > 0;

  if (hasImages) {
    const stackEl = document.createElement('div');
    stackEl.className = 'image-stack';

    if (node.coverImage) {
      const img = document.createElement('img');
      img.className = 'stack-layer cover';
      img.src = node.coverImage;
      img.alt = node.title;
      img.loading = 'lazy';
      stackEl.appendChild(img);
    }

    const otherImages = node.images
      .filter(img => img !== node.coverImage)
      .slice(0, 4);

    otherImages.forEach(imgSrc => {
      const img = document.createElement('img');
      img.className = 'stack-layer';
      img.src = imgSrc;
      img.alt = '';
      img.loading = 'lazy';
      stackEl.appendChild(img);
    });

    body.appendChild(stackEl);
  } else {
    const placeholderEl = document.createElement('div');
    placeholderEl.className = 'placeholder-bg';

    // 简约的文档线条图标
    const iconInner = document.createElement('div');
    iconInner.className = 'folder-icon-inner';
    for (let i = 0; i < 3; i++) {
      const line = document.createElement('div');
      line.className = 'line';
      iconInner.appendChild(line);
    }
    placeholderEl.appendChild(iconInner);

    body.appendChild(placeholderEl);
  }

  wrap.appendChild(body);
  return wrap;
}

// 创建笔记视觉元素
function createNoteVisual(node) {
  const visualEl = document.createElement('div');
  visualEl.className = 'note-visual';

  if (node.images && node.images.length > 0) {
    const img = document.createElement('img');
    img.className = 'note-image';
    img.src = node.images[0];
    img.alt = node.title;
    img.loading = 'lazy';
    visualEl.appendChild(img);
  } else {
    const textEl = document.createElement('div');
    textEl.className = 'note-text';
    textEl.innerHTML = node.html || `<p>${escapeHtml(node.textContent || '空文档')}</p>`;
    visualEl.appendChild(textEl);
  }

  return visualEl;
}

// ========== 节点点击 ==========

function handleNodeClick(node) {
  if (node.type === 'folder') {
    openFolderOverlay(node);
  } else {
    openFileModal(node);
  }
}

// ========== 文件夹展开 —— overlay 模式 ==========

function openFolderOverlay(node) {
  // 如果已经有展开的 overlay，先关闭
  if (state.expandedOverlay) {
    closeFolderOverlay();
    // 如果点的是同一个文件夹，直接关闭
    if (state.expandedNodeId === node.id) return;
  }

  state.expandedNodeId = node.id;

  const overlay = document.createElement('div');
  overlay.className = 'children-overlay';

  // 标题
  const title = document.createElement('div');
  title.className = 'overlay-title';
  title.textContent = node.title;
  overlay.appendChild(title);

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'overlay-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeFolderOverlay();
  });
  overlay.appendChild(closeBtn);

  // 内部轮播容器
  const inner = document.createElement('div');
  inner.className = 'carousel-inner';
  overlay.appendChild(inner);

  document.body.appendChild(overlay);
  state.expandedOverlay = overlay;

  // 点击 overlay 背景关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeFolderOverlay();
    }
  });

  // ESC 关闭
  state._overlayEscHandler = (e) => {
    if (e.key === 'Escape') closeFolderOverlay();
  };
  document.addEventListener('keydown', state._overlayEscHandler);

  // 入场动画
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
  });

  // 渲染子节点轮播
  if (node.children && node.children.length > 0) {
    const childCenter = Math.floor(node.children.length / 2);
    renderCarousel(inner, node.children, childCenter);
  } else {
    inner.innerHTML = '<div class="empty">该文件夹为空</div>';
  }
}

function closeFolderOverlay() {
  if (!state.expandedOverlay) return;

  const overlay = state.expandedOverlay;
  overlay.classList.remove('visible');

  if (state._overlayEscHandler) {
    document.removeEventListener('keydown', state._overlayEscHandler);
    state._overlayEscHandler = null;
  }

  setTimeout(() => overlay.remove(), 400);
  state.expandedOverlay = null;
  state.expandedNodeId = null;
}

// ========== 文件模态框 ==========

function openFileModal(node) {
  // 如果有 overlay 展开，先关闭
  // （不关闭，因为文件可能在 overlay 中打开）

  state.activeFile = node.id;

  const modal = document.createElement('div');
  modal.id = 'file-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <button class="modal-close">✕</button>
      <h2>${escapeHtml(node.title)}</h2>
      <div class="modal-body">${node.html || '<p>空文档</p>'}</div>
    </div>
  `;

  document.body.appendChild(modal);

  requestAnimationFrame(() => {
    modal.classList.add('visible');
  });

  const closeModal = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
    state.activeFile = null;
  };

  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

// ========== 全局点击：关闭展开 ==========

document.addEventListener('click', (e) => {
  // 如果点击了空白区域（非卡片、非 overlay 内部），关闭 overlay
  if (state.expandedOverlay && !e.target.closest('.children-overlay') && !e.target.closest('.modal')) {
    closeFolderOverlay();
  }
});

// 在树中查找节点
function findNodeById(tree, id) {
  if (tree.id === id) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNodeById(child, id);
      if (found) return found;
    }
  }
  return null;
}

// HTML 转义
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
