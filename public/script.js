"use strict";
document.addEventListener('DOMContentLoaded', () => {
    // --- Constants --- //
    const TOAST_DURATION = 4000;
    const TOAST_REMOVE_DELAY = 300;
    const MAX_TOASTS = 3;
    const POLL_INTERVAL = 2000;
    // --- State --- //
    const state = {
        downloadMode: 'video',
        quality: '1080',
        codec: 'h264',
        audioFormat: 'mp3',
        mute: false
    };
    let currentAbortController = null;
    let toastQueue = [];
    let activeToasts = 0;
    let pollIntervalId = null;
    // --- DOM Elements --- //
    const videoUrlInput = document.getElementById('videoUrl');
    const saveBtn = document.getElementById('saveBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const statusMessage = document.getElementById('statusMessage');
    const toastContainer = document.getElementById('toastContainer');
    const mascotContainer = document.getElementById('mascotContainer');
    const queueProgressContainer = document.getElementById('queueProgressContainer');
    const queueProgressBar = document.getElementById('queueProgressBar');
    const queueProgressText = document.getElementById('queueProgressText');
    const historyBtn = document.getElementById('historyBtn');
    const historyPanel = document.getElementById('historyPanel');
    const historyList = document.getElementById('historyList');
    const closeHistory = document.getElementById('closeHistory');
    const settingsBtn = document.getElementById('settingsBtn');
    const infoBtn = document.getElementById('infoBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const infoPanel = document.getElementById('infoPanel');
    const closeSettings = document.getElementById('closeSettings');
    const closeInfo = document.getElementById('closeInfo');
    const muteVideoCheckbox = document.getElementById('muteVideo');
    const segmentedControls = document.querySelectorAll('.segmented-control');
    // --- Focus Management Helpers --- //
    const getKeyboardFocusableElements = (element) => {
        return [...element.querySelectorAll('a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])')].filter(el => {
            const castEl = el;
            return !castEl.hasAttribute('disabled') && castEl.getAttribute('aria-hidden') !== 'true';
        });
    };
    const trapFocus = (e, panel) => {
        const focusableElements = getKeyboardFocusableElements(panel);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (e.key === 'Tab') {
            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    e.preventDefault();
                }
            }
            else { // Tab
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    e.preventDefault();
                }
            }
        }
    };
    let lastFocusedElement = null;
    const openPanel = (panel, trigger) => {
        lastFocusedElement = document.activeElement;
        panel.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        const container = panel.querySelector('.panel-container');
        container.focus();
        const focusTrapHandler = (e) => trapFocus(e, container);
        panel._focusTrap = focusTrapHandler;
        panel.addEventListener('keydown', focusTrapHandler);
        if (panel === historyPanel) {
            fetchHistory();
        }
    };
    const closePanel = (panel, trigger) => {
        panel.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        if (panel._focusTrap) {
            panel.removeEventListener('keydown', panel._focusTrap);
        }
        if (lastFocusedElement) {
            lastFocusedElement.focus();
        }
    };
    // --- UI Interactions --- //
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPanel(settingsPanel, settingsBtn);
    });
    infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPanel(infoPanel, infoBtn);
    });
    historyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPanel(historyPanel, historyBtn);
    });
    closeSettings.addEventListener('click', () => closePanel(settingsPanel, settingsBtn));
    closeInfo.addEventListener('click', () => closePanel(infoPanel, infoBtn));
    closeHistory.addEventListener('click', () => closePanel(historyPanel, historyBtn));
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (settingsPanel.classList.contains('open'))
                closePanel(settingsPanel, settingsBtn);
            if (infoPanel.classList.contains('open'))
                closePanel(infoPanel, infoBtn);
            if (historyPanel.classList.contains('open'))
                closePanel(historyPanel, historyBtn);
        }
    });
    window.addEventListener('click', (e) => {
        const target = e.target;
        if (settingsPanel.classList.contains('open') && !settingsPanel.querySelector('.panel-container')?.contains(target)) {
            closePanel(settingsPanel, settingsBtn);
        }
        if (infoPanel.classList.contains('open') && !infoPanel.querySelector('.panel-container')?.contains(target)) {
            closePanel(infoPanel, infoBtn);
        }
        if (historyPanel.classList.contains('open') && !historyPanel.querySelector('.panel-container')?.contains(target)) {
            closePanel(historyPanel, historyBtn);
        }
    });
    segmentedControls.forEach(control => {
        const key = control.dataset.state;
        const segments = control.querySelectorAll('.segment');
        segments.forEach(segment => {
            segment.addEventListener('click', () => {
                segments.forEach(s => s.classList.remove('active'));
                segment.classList.add('active');
                const val = segment.dataset.value;
                if (val !== undefined) {
                    state[key] = val;
                }
            });
        });
    });
    muteVideoCheckbox.addEventListener('change', (e) => {
        state.mute = e.target.checked;
    });
    // --- Download Logic --- //
    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            renderHistory(data);
        }
        catch (err) {
            historyList.innerHTML = '<p class="small-text">failed to load history.</p>';
        }
    };
    const renderHistory = (items) => {
        if (items.length === 0) {
            historyList.innerHTML = '<p class="small-text">no recent downloads.</p>';
            return;
        }
        historyList.innerHTML = items.map(item => `
            <div class="history-item">
                <div class="history-item-top">
                    <span>${new Date(item.created_at).toLocaleDateString()}</span>
                    <span>${item.status}</span>
                </div>
                <div class="history-item-title">${item.filename || item.url}</div>
                ${item.status === 'completed' ? `<a href="${item.url}" class="small-text" style="color: var(--accent-orange)">redownload</a>` : ''}
            </div>
        `).join('');
    };
    const processToastQueue = () => {
        if (toastQueue.length === 0 || activeToasts >= MAX_TOASTS)
            return;
        const job = toastQueue.shift();
        if (job)
            createToast(job.msg, job.type);
    };
    const createToast = (msg, type) => {
        activeToasts++;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        let icon = '';
        if (type === 'success') {
            icon = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        }
        else if (type === 'error') {
            icon = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        }
        toast.innerHTML = `${icon}<span>${msg}</span>`;
        toastContainer.appendChild(toast);
        requestAnimationFrame(() => setTimeout(() => toast.classList.add('show'), 10));
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
                activeToasts--;
                processToastQueue();
            }, TOAST_REMOVE_DELAY);
        }, TOAST_DURATION);
    };
    const showToast = (msg, type = 'info') => {
        toastQueue.push({ msg, type });
        processToastQueue();
    };
    const showStatus = (msg, type = '') => {
        statusMessage.textContent = msg;
        statusMessage.className = 'status-msg ' + type;
    };
    const pollJobStatus = (jobId) => {
        pollIntervalId = setInterval(async () => {
            try {
                const res = await fetch(`/api/queue/${jobId}`);
                if (!res.ok)
                    throw new Error('Job lost');
                const job = await res.json();
                if (job.state === 'completed') {
                    stopPolling();
                    handleDownloadComplete(job.result);
                }
                else if (job.state === 'failed') {
                    stopPolling();
                    showToast(job.failedReason || 'download failed', 'error');
                    resetUI();
                }
                else {
                    updateQueueProgress(job.state);
                }
            }
            catch (err) {
                stopPolling();
                showToast('lost connection to job', 'error');
                resetUI();
            }
        }, POLL_INTERVAL);
    };
    const stopPolling = () => {
        if (pollIntervalId) {
            clearInterval(pollIntervalId);
            pollIntervalId = null;
        }
    };
    const updateQueueProgress = (state) => {
        queueProgressContainer.style.display = 'flex';
        if (state === 'active') {
            queueProgressText.textContent = 'processing on server...';
            queueProgressBar.style.width = '50%';
        }
        else {
            queueProgressText.textContent = 'waiting in queue...';
            queueProgressBar.style.width = '20%';
        }
    };
    const handleDownloadComplete = (result) => {
        showToast('download ready!', 'success');
        showStatus('');
        const a = document.createElement('a');
        a.href = result.downloadUrl;
        a.download = result.filename || 'allkitty_media';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        resetUI();
    };
    const resetUI = () => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'download';
        mascotContainer.classList.remove('eating');
        cancelBtn.style.display = 'none';
        queueProgressContainer.style.display = 'none';
        showStatus('');
    };
    const handleDownload = async () => {
        const url = videoUrlInput.value.trim();
        if (!url) {
            showToast('paste a link first', 'error');
            return;
        }
        saveBtn.disabled = true;
        saveBtn.textContent = 'queuing...';
        showStatus('queuing...', 'success');
        mascotContainer.classList.add('eating');
        cancelBtn.style.display = 'block';
        try {
            let formatParam = state.downloadMode;
            if (state.downloadMode === 'video' && state.mute) {
                formatParam = 'mute';
            }
            const payload = {
                url,
                format: formatParam,
                quality: state.quality,
                codec: state.codec,
                container: 'auto'
            };
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'failed to queue');
            }
            const data = await response.json();
            if (data.success && data.jobId) {
                showToast('added to queue!', 'info');
                pollJobStatus(data.jobId);
            }
        }
        catch (error) {
            showToast(error.message || 'error: server unreachable', 'error');
            resetUI();
        }
    };
    saveBtn.addEventListener('click', handleDownload);
    cancelBtn.addEventListener('click', async () => {
        // Find jobId from state if possible or current tracking
        // For simplicity, we assume one active download per client session
        // In a real app, we'd track the jobId more formally
        // For this demo, let's just stop polling and reset UI
        stopPolling();
        resetUI();
        showToast('stopped tracking download', 'info');
    });
    videoUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter')
            handleDownload();
    });
});
