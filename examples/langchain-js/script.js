/* ============================================
   LangChain.js 学习文档 — 交互逻辑
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initProgressBar();
  initSidebar();
  initCopyButtons();
  initQuizReveal();
  initTocHighlight();
  initTabs();
  initProgressTracker();
});

/* 主题切换 */
function initTheme() {
  const btn = document.getElementById('theme-toggle');
  const saved = localStorage.getItem('langchain-docs-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';

  if (btn) {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('langchain-docs-theme', next);
      btn.textContent = next === 'dark' ? '☀️' : '🌙';
    });
  }
}

/* 阅读进度条 */
function initProgressBar() {
  const bar = document.querySelector('.progress-bar');
  if (!bar) return;

  window.addEventListener('scroll', () => {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width = Math.min(progress, 100) + '%';
  });
}

/* 侧边栏折叠 */
function initSidebar() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const mainContent = document.querySelector('.main-content');

  if (toggle && sidebar) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      sidebar.classList.toggle('open');
      if (mainContent) mainContent.classList.toggle('expanded');
    });
  }

  // 移动端点击遮罩关闭
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && e.target !== toggle) {
        sidebar.classList.remove('open');
      }
    }
  });
}

/* 代码复制 */
function initCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const codeBlock = btn.closest('.code-block');
      const code = codeBlock.querySelector('code').textContent;
      navigator.clipboard.writeText(code).then(() => {
        const original = btn.textContent;
        btn.textContent = '✅ 已复制';
        setTimeout(() => { btn.textContent = original; }, 2000);
      }).catch(() => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        const original = btn.textContent;
        btn.textContent = '✅ 已复制';
        setTimeout(() => { btn.textContent = original; }, 2000);
      });
    });
  });
}

/* 自测题答案显示 */
function initQuizReveal() {
  document.querySelectorAll('.reveal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const answer = btn.parentElement.querySelector('.quiz-answer');
      if (answer) {
        answer.classList.toggle('visible');
        btn.textContent = answer.classList.contains('visible') ? '🔒 隐藏答案' : '💡 查看答案';
      }
    });
  });
}

/* 目录高亮 */
function initTocHighlight() {
  const tocLinks = document.querySelectorAll('.toc a, .sidebar-section a[href^="#"]');
  if (tocLinks.length === 0) return;

  const sections = [];
  tocLinks.forEach(link => {
    const id = link.getAttribute('href')?.slice(1);
    if (id) {
      const el = document.getElementById(id);
      if (el) sections.push({ id, el, link });
    }
  });

  if (sections.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        tocLinks.forEach(l => l.classList.remove('active'));
        const match = sections.find(s => s.el === entry.target);
        if (match) match.link.classList.add('active');
      }
    });
  }, { rootMargin: '-80px 0px -60% 0px', threshold: 0 });

  sections.forEach(s => observer.observe(s.el));
}

/* 内容标签页 */
function initTabs() {
  document.querySelectorAll('.content-tabs').forEach(tabGroup => {
    const buttons = tabGroup.querySelectorAll('.tab-btn');
    const contents = tabGroup.querySelectorAll('.tab-content');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        contents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const target = tabGroup.querySelector(`[data-tab="${btn.dataset.tab}"]`);
        if (target) target.classList.add('active');
      });
    });
  });
}

/* 学习进度追踪 */
function initProgressTracker() {
  const storageKey = 'langchain-docs-progress';
  const pageId = document.body.dataset.page;

  if (!pageId) return;

  let progress = JSON.parse(localStorage.getItem(storageKey) || '{}');

  // 标记当前页面已阅读
  if (!progress[pageId]) {
    progress[pageId] = { visited: true, timestamp: Date.now() };
    localStorage.setItem(storageKey, JSON.stringify(progress));
  }

  // 更新首页进度条
  const progressFill = document.querySelector('.progress-fill');
  const progressText = document.querySelector('.progress-text');
  if (progressFill && progressText) {
    const total = document.querySelectorAll('.roadmap-card').length || 19;
    const completed = Object.keys(progress).length;
    const percent = Math.round((completed / total) * 100);
    progressFill.style.width = percent + '%';
    progressText.textContent = `学习进度：${completed}/${total} 章 (${percent}%)`;
  }

  // 更新侧边栏已读标记
  document.querySelectorAll('.sidebar-section a').forEach(a => {
    const href = a.getAttribute('href');
    if (href) {
      const id = href.replace('.html', '').replace('./', '').replace('chapters/', '');
      if (progress[id]) {
        a.style.setProperty('--check', '"✓"');
        a.classList.add('visited');
      }
    }
  });
}
