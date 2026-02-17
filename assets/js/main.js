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
  expandedNodes: new Set(),
  activeFile: null
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
    renderTree();
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

// 渲染整个树
function renderTree() {
  treeRootEl.innerHTML = '';

  if (!state.tree.children || state.tree.children.length === 0) {
    renderEmpty("该目录为空。");
    return;
  }

  state.tree.children.forEach((node, index) => {
    const nodeEl = createNodeElement(node, 0, index);
    treeRootEl.appendChild(nodeEl);
  });
}

// 创建节点元素
function createNodeElement(node, depth, index) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'node';
  nodeEl.id = `node-${node.id}`;
  nodeEl.dataset.type = node.type;
  nodeEl.dataset.depth = depth;

  const isExpanded = state.expandedNodes.has(node.id);
  if (isExpanded) nodeEl.classList.add('expanded');

  // 创建卡片
  const cardEl = document.createElement('div');
  cardEl.className = 'node-card';

  if (node.type === 'folder') {
    cardEl.appendChild(createFolderVisual(node));
  } else {
    cardEl.appendChild(createNoteVisual(node));
  }

  // 添加标题
  const titleEl = document.createElement('div');
  titleEl.className = 'node-title';
  titleEl.textContent = node.title;
  cardEl.appendChild(titleEl);

  nodeEl.appendChild(cardEl);

  // 点击事件
  cardEl.addEventListener('click', (e) => {
    e.stopPropagation();
    handleNodeClick(node);
  });

  // 如果是文件夹，创建子容器
  if (node.type === 'folder') {
    const childContainer = document.createElement('div');
    childContainer.className = 'children-container';

    if (isExpanded && node.children) {
      node.children.forEach((child, idx) => {
        childContainer.appendChild(createNodeElement(child, depth + 1, idx));
      });
    }

    nodeEl.appendChild(childContainer);
  }

  return nodeEl;
}

// 创建文件夹视觉元素
function createFolderVisual(node) {
  const stackEl = document.createElement('div');
  stackEl.className = 'image-stack';

  const hasImages = node.images && node.images.length > 0;

  if (hasImages) {
    // 封面图放最上层
    if (node.coverImage) {
      const img = document.createElement('img');
      img.className = 'stack-layer cover';
      img.src = node.coverImage;
      img.alt = node.title;
      img.loading = 'lazy';
      stackEl.appendChild(img);
    }

    // 其他图像（最多4张）
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
  } else {
    // 如果没有图像，使用渐变背景
    const placeholderEl = document.createElement('div');
    placeholderEl.className = 'placeholder-bg';
    stackEl.appendChild(placeholderEl);
  }

  // 文件夹角标
  const badge = document.createElement('div');
  badge.className = 'folder-badge';
  badge.textContent = '夹';
  stackEl.appendChild(badge);

  return stackEl;
}

// 创建笔记视觉元素
function createNoteVisual(node) {
  const visualEl = document.createElement('div');
  visualEl.className = 'note-visual';

  if (node.images && node.images.length > 0) {
    // 有图像：显示第一张
    const img = document.createElement('img');
    img.className = 'note-image';
    img.src = node.images[0];
    img.alt = node.title;
    img.loading = 'lazy';
    visualEl.appendChild(img);
  } else {
    // 无图像：渲染文字内容
    const textEl = document.createElement('div');
    textEl.className = 'note-text';
    textEl.innerHTML = node.html || `<p>${escapeHtml(node.textContent || '空文档')}</p>`;
    visualEl.appendChild(textEl);
  }

  return visualEl;
}

// 处理节点点击
function handleNodeClick(node) {
  if (node.type === 'folder') {
    toggleExpand(node.id);
  } else {
    openFileModal(node);
  }
}

// 切换展开/折叠
function toggleExpand(nodeId) {
  const nodeEl = document.getElementById(`node-${nodeId}`);
  if (!nodeEl) return;

  if (state.expandedNodes.has(nodeId)) {
    // 折叠
    state.expandedNodes.delete(nodeId);
    nodeEl.classList.remove('expanded');

    const childContainer = nodeEl.querySelector('.children-container');
    if (childContainer) {
      childContainer.classList.add('collapsing');

      setTimeout(() => {
        childContainer.innerHTML = '';
        childContainer.classList.remove('collapsing');
      }, 400);
    }
  } else {
    // 展开
    state.expandedNodes.add(nodeId);
    nodeEl.classList.add('expanded');

    const node = findNodeById(state.tree, nodeId);
    const childContainer = nodeEl.querySelector('.children-container');

    if (node && node.children && childContainer) {
      const depth = parseInt(nodeEl.dataset.depth) + 1;
      node.children.forEach((child, idx) => {
        const childEl = createNodeElement(child, depth, idx);
        childEl.classList.add('expanding');
        childContainer.appendChild(childEl);

        // 错开移除动画类
        setTimeout(() => childEl.classList.remove('expanding'), 50 * idx + 400);
      });
    }
  }
}

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

// 打开文件模态框
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

  // 动画入场
  requestAnimationFrame(() => {
    modal.classList.add('visible');
  });

  // 关闭事件
  const closeModal = () => {
    modal.classList.remove('visible');
    setTimeout(() => modal.remove(), 300);
    state.activeFile = null;
  };

  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  // ESC 键关闭
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);
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
