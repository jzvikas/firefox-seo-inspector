'use strict';

(function initializeAccessibleTabs() {
  const tabList = document.querySelector('.tabs');
  if (!tabList) return;

  const tabs = Array.from(tabList.querySelectorAll('.tab[data-tab]'));
  if (!tabs.length) return;

  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-orientation', 'horizontal');

  function panelFor(tab) {
    return document.getElementById(String(tab.dataset.tab || ''));
  }

  function syncAccessibility(activeTab) {
    tabs.forEach((tab) => {
      const selected = tab === activeTab || (!activeTab && tab.classList.contains('active'));
      const panel = panelFor(tab);
      const tabId = `inspector-tab-${tab.dataset.tab}`;

      tab.id = tabId;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.setAttribute('aria-controls', String(tab.dataset.tab || ''));
      tab.tabIndex = selected ? 0 : -1;

      if (panel) {
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tabId);
        panel.hidden = !selected;
      }
    });
  }

  function activateAndFocus(tab) {
    if (!tab) return;
    tab.click();
    syncAccessibility(tab);
    tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => syncAccessibility(tab));
    tab.addEventListener('keydown', (event) => {
      let targetIndex = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') targetIndex = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') targetIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') targetIndex = 0;
      if (event.key === 'End') targetIndex = tabs.length - 1;
      if (targetIndex === null) return;

      event.preventDefault();
      activateAndFocus(tabs[targetIndex]);
    });
  });

  syncAccessibility(tabs.find((tab) => tab.classList.contains('active')) || tabs[0]);
})();
