/* ── Theme bootstrap (before render to avoid flash) ── */
(function () {
    const t = localStorage.getItem('li-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
})();
