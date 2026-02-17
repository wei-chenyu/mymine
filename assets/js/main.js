const avatarEl = document.getElementById("avatar");
const profileTitleEl = document.getElementById("profile-title");
const profileContentEl = document.getElementById("profile-content");
const treeRootEl = document.getElementById("tree-root");

if (avatarEl) {
  avatarEl.onerror = () => { avatarEl.src = "assets/img/avatar-fallback.svg"; };
}

const state = {
  tree: {},
  activeFile: null,
  // 导航栈：每一层记录 { nodes, centerIndex, folderTitle }
  navStack: [],
  currentNodes: [],
  centerIndex: 0,
  hoveredIndex: -1,
  transitioning: false
};

// ========== 初始化 ==========

fetch("assets/data/manifest.json", { cache: "no-cache" })
  .then(r => r.json())
  .then(tree => {
    if (tree.profile) renderProfile(tree.profile);
    if (!tree.children || tree.children.length === 0) {
      renderEmpty("暂无内容，请在 content 里添加文件夹或 Markdown。");
      return;
    }
    state.tree = tree;
    state.currentNodes = tree.children;
    state.centerIndex = Math.floor(tree.children.length / 2);
    mountCards(treeRootEl, state.currentNodes, 0); // originX=0，从中心出现
    renderBreadcrumb();
  })
  .catch(err => {
    renderEmpty("加载失败");
    console.error(err);
  });

function renderProfile(profile) {
  if (profileTitleEl && profile.title) profileTitleEl.textContent = profile.title;
  if (profileContentEl) profileContentEl.innerHTML = profile.html || "<p>profile.md 为空。</p>";
}

function renderEmpty(text) {
  treeRootEl.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}

// ========== 面包屑 ==========

function renderBreadcrumb() {
  let bc = document.getElementById('breadcrumb');
  if (!bc) {
    bc = document.createElement('nav');
    bc.id = 'breadcrumb';
    bc.className = 'breadcrumb';
    treeRootEl.parentElement.insertBefore(bc, treeRootEl);
  }

  if (state.navStack.length === 0) {
    bc.style.display = 'none';
    return;
  }

  bc.style.display = '';
  bc.innerHTML = '';

  // 根目录
  const rootSpan = document.createElement('span');
  rootSpan.className = 'bc-item';
  rootSpan.textContent = '首页';
  rootSpan.addEventListener('click', () => navigateToLevel(0));
  bc.appendChild(rootSpan);

  // 每一层
  state.navStack.forEach((entry, i) => {
    const sep = document.createElement('span');
    sep.className = 'bc-sep';
    sep.textContent = ' › ';
    bc.appendChild(sep);

    const isLast = i === state.navStack.length - 1;
    const item = document.createElement('span');
    item.className = isLast ? 'bc-item bc-current' : 'bc-item';
    item.textContent = entry.folderTitle;
    if (!isLast) {
      item.addEventListener('click', () => navigateToLevel(i + 1));
    }
    bc.appendChild(item);
  });
}

// ========== 轮播：创建卡片并布局 ==========

function mountCards(container, nodes, originX) {
  if (!nodes || nodes.length === 0) {
    container.innerHTML = '<div class="empty" style="position:relative;">该目录为空</div>';
    return;
  }

  state.centerIndex = Math.floor(nodes.length / 2);
  state.hoveredIndex = -1;

  nodes.forEach((node, i) => {
    const el = createCardElement(node);
    el.dataset.idx = i;

    // 初始：全部聚在 originX 处，缩小透明
    el.style.transition = 'none';
    el.style.transform = `translateX(${originX}px) scale(0.35)`;
    el.style.opacity = '0';
    container.appendChild(el);

    bindCardEvents(el, node, i, container);
  });

  // 下一帧：开启 transition，展开到目标位置
  requestAnimationFrame(() => {
    container.querySelectorAll(':scope > .node').forEach(el => {
      el.style.transition = '';
    });
    requestAnimationFrame(() => {
      layoutCards(container);
    });
  });
}

function bindCardEvents(el, node, idx, container) {
  el.addEventListener('mouseenter', () => {
    state.hoveredIndex = idx;
    layoutCards(container);
  });
  el.addEventListener('mouseleave', () => {
    state.hoveredIndex = -1;
    layoutCards(container);
  });

  el.querySelector('.node-card').addEventListener('click', e => {
    e.stopPropagation();
    if (state.transitioning) return;

    if (node.type === 'folder') {
      // 计算点击卡片相对于容器中心的 X 偏移
      const containerRect = container.getBoundingClientRect();
      const cardRect = el.getBoundingClientRect();
      const clickOriginX = (cardRect.left + cardRect.width / 2)
        - (containerRect.left + containerRect.width / 2);
      navigateInto(node, clickOriginX);
    } else {
      openFileModal(node);
    }
  });
}

// ========== 轮播布局计算 ==========

function layoutCards(container) {
  const cards = container.querySelectorAll(':scope > .node');
  const count = cards.length;
  if (count === 0) return;

  const centerIdx = state.centerIndex;
  const containerW = container.clientWidth || 1200;
  const cardW = 240;

  // 动态间距：卡片少时宽松，多时紧凑
  const idealSpacing = Math.min(260, Math.max(140, (containerW * 0.7) / Math.max(count, 2)));
  const spacing = idealSpacing;
  const scaleStep = 0.09;
  const zBase = 100;

  cards.forEach((el, i) => {
    const offset = i - centerIdx;

    // 悬停偏移：向中心靠拢
    let hoverShift = 0;
    if (state.hoveredIndex === i && offset !== 0) {
      hoverShift = -offset * 35;
    }

    const x = offset * spacing + hoverShift;
    const dist = Math.abs(offset);
    const scale = Math.max(0.58, 1 - dist * scaleStep);
    const zIndex = zBase - dist * 10 + (state.hoveredIndex === i ? 20 : 0);
    const opacity = Math.max(0.3, 1 - dist * 0.2);

    el.style.transform = `translateX(${x}px) scale(${scale})`;
    el.style.zIndex = zIndex;
    el.style.opacity = opacity;
  });
}

// ========== 导航：进入文件夹 ==========

function navigateInto(folder, originX) {
  if (state.transitioning) return;
  state.transitioning = true;

  const container = treeRootEl;
  const oldCards = [...container.querySelectorAll(':scope > .node')];

  // 入栈
  state.navStack.push({
    nodes: state.currentNodes,
    centerIndex: state.centerIndex,
    folderTitle: folder.title
  });

  // 更新当前节点
  state.currentNodes = folder.children || [];

  // 先创建新卡片（在旧卡片上方），从 originX 出发
  const newCards = [];
  state.currentNodes.forEach((node, i) => {
    const el = createCardElement(node);
    el.dataset.idx = i;
    el.style.transition = 'none';
    el.style.transform = `translateX(${originX}px) scale(0.3)`;
    el.style.opacity = '0';
    el.style.zIndex = 200;
    container.appendChild(el);
    bindCardEvents(el, node, i, container);
    newCards.push(el);
  });

  // 同时：旧卡片缩小淡出
  oldCards.forEach(el => {
    el.style.pointerEvents = 'none';
    el.style.opacity = '0';
    el.style.transform = el.style.transform.replace(/scale\([^)]*\)/, 'scale(0.65)');
  });

  // 下一帧：新卡片展开到位
  requestAnimationFrame(() => {
    newCards.forEach(el => { el.style.transition = ''; });
    state.centerIndex = Math.floor(state.currentNodes.length / 2);
    state.hoveredIndex = -1;

    requestAnimationFrame(() => {
      layoutCards(container);

      // 动画结束后清理
      setTimeout(() => {
        oldCards.forEach(el => el.remove());
        // 恢复 z-index
        newCards.forEach(el => { el.style.zIndex = ''; });
        layoutCards(container);
        state.transitioning = false;
      }, 520);
    });
  });

  renderBreadcrumb();
}

// ========== 导航：返回上一级 ==========

function navigateBack() {
  if (state.navStack.length === 0 || state.transitioning) return;
  state.transitioning = true;

  const prev = state.navStack.pop();
  const container = treeRootEl;
  const oldCards = [...container.querySelectorAll(':scope > .node')];

  state.currentNodes = prev.nodes;

  // 旧卡片（当前层）收缩回中心
  oldCards.forEach(el => {
    el.style.pointerEvents = 'none';
    el.style.transform = 'translateX(0px) scale(0.3)';
    el.style.opacity = '0';
  });

  // 创建父层卡片，初始状态为放大的背景
  const newCards = [];
  state.currentNodes.forEach((node, i) => {
    const el = createCardElement(node);
    el.dataset.idx = i;
    el.style.transition = 'none';
    el.style.transform = 'translateX(0px) scale(1.15)';
    el.style.opacity = '0';
    el.style.zIndex = -1;
    container.appendChild(el);
    bindCardEvents(el, node, i, container);
    newCards.push(el);
  });

  requestAnimationFrame(() => {
    newCards.forEach(el => { el.style.transition = ''; });
    state.centerIndex = prev.centerIndex;
    state.hoveredIndex = -1;

    requestAnimationFrame(() => {
      layoutCards(container);

      setTimeout(() => {
        oldCards.forEach(el => el.remove());
        newCards.forEach(el => { el.style.zIndex = ''; });
        layoutCards(container);
        state.transitioning = false;
      }, 520);
    });
  });

  renderBreadcrumb();
}

// 跳转到指定层级
function navigateToLevel(targetLevel) {
  if (state.transitioning) return;
  if (targetLevel >= state.navStack.length) return;

  // 取出目标层
  const target = state.navStack[targetLevel];
  state.navStack.length = targetLevel;

  state.transitioning = true;
  const container = treeRootEl;
  const oldCards = [...container.querySelectorAll(':scope > .node')];
  state.currentNodes = target.nodes;

  oldCards.forEach(el => {
    el.style.pointerEvents = 'none';
    el.style.transform = 'translateX(0px) scale(0.3)';
    el.style.opacity = '0';
  });

  const newCards = [];
  state.currentNodes.forEach((node, i) => {
    const el = createCardElement(node);
    el.dataset.idx = i;
    el.style.transition = 'none';
    el.style.transform = 'translateX(0px) scale(1.15)';
    el.style.opacity = '0';
    container.appendChild(el);
    bindCardEvents(el, node, i, container);
    newCards.push(el);
  });

  requestAnimationFrame(() => {
    newCards.forEach(el => { el.style.transition = ''; });
    state.centerIndex = target.centerIndex;
    state.hoveredIndex = -1;
    requestAnimationFrame(() => {
      layoutCards(container);
      setTimeout(() => {
        oldCards.forEach(el => el.remove());
        newCards.forEach(el => { el.style.zIndex = ''; });
        layoutCards(container);
        state.transitioning = false;
      }, 520);
    });
  });

  renderBreadcrumb();
}

// ========== 全局事件 ==========

// 点击空白区域返回上一级
document.addEventListener('click', e => {
  if (state.transitioning) return;
  // 点在卡片上、模态框上、面包屑上 → 不处理
  if (e.target.closest('.node-card') || e.target.closest('.modal') || e.target.closest('.breadcrumb')) return;
  if (state.navStack.length > 0) {
    navigateBack();
  }
});

// ESC 键返回
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('file-modal');
    if (modal) return; // 模态框优先
    if (state.navStack.length > 0) navigateBack();
  }
});

// ========== 创建卡片 ==========

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

// ========== 文件夹视觉：整体文件夹造型 + 堆叠图像 ==========

function createFolderVisual(node) {
  const wrap = document.createElement('div');
  wrap.className = 'folder-card-wrap';

  // 文件夹耳朵
  const tab = document.createElement('div');
  tab.className = 'folder-tab';
  wrap.appendChild(tab);

  // 文件夹主体
  const body = document.createElement('div');
  body.className = 'folder-body';

  // 收集直系子节点中的图像（不递归深层）
  const directImages = collectDirectImages(node);
  const coverImg = getFolderCover(node, directImages);

  if (directImages.length > 0) {
    const stackEl = document.createElement('div');
    stackEl.className = 'image-stack';

    // 封面图放最上层
    if (coverImg) {
      const img = document.createElement('img');
      img.className = 'stack-layer cover';
      img.src = coverImg;
      img.alt = node.title;
      img.loading = 'lazy';
      stackEl.appendChild(img);
    }

    // 其他图像（去重，最多4张）
    const others = directImages.filter(s => s !== coverImg).slice(0, 4);
    others.forEach(src => {
      const img = document.createElement('img');
      img.className = 'stack-layer';
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      stackEl.appendChild(img);
    });

    body.appendChild(stackEl);
  } else {
    // 无图像：占位
    const ph = document.createElement('div');
    ph.className = 'placeholder-bg';
    const icon = document.createElement('div');
    icon.className = 'folder-icon-inner';
    for (let i = 0; i < 3; i++) {
      const line = document.createElement('div');
      line.className = 'line';
      icon.appendChild(line);
    }
    ph.appendChild(icon);
    body.appendChild(ph);
  }

  wrap.appendChild(body);
  return wrap;
}

// 收集直系子节点中的图像（只查直系 note 子节点，不递归）
function collectDirectImages(folder) {
  const imgs = [];
  if (!folder.children) return imgs;
  folder.children.forEach(child => {
    if (child.type === 'note' && child.images && child.images.length > 0) {
      imgs.push(...child.images);
    }
  });
  return imgs;
}

// 获取封面图：优先从名为"封面"的直系 md 子节点取
function getFolderCover(folder, directImages) {
  if (folder.children) {
    const coverNote = folder.children.find(
      c => c.type === 'note' && c.title === '封面'
    );
    if (coverNote && coverNote.images && coverNote.images.length > 0) {
      return coverNote.images[0];
    }
  }
  // 回退：manifest 中的 coverImage 或第一张直系图
  return folder.coverImage || directImages[0] || null;
}

// ========== 笔记卡片视觉 ==========

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

// ========== 文件模态框（仅用于查看文件内容） ==========

function openFileModal(node) {
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
  requestAnimationFrame(() => modal.classList.add('visible'));

  const closeModal = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
    state.activeFile = null;
  };

  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  const handleEsc = e => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
}

// ========== 工具函数 ==========

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

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
