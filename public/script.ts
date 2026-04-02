document.addEventListener('DOMContentLoaded', () => {
    // --- Constants --- //
    const TOAST_DURATION = 4000;
    const TOAST_REMOVE_DELAY = 300;
    const MAX_TOASTS = 3;
    const POLL_INTERVAL = 2000;

    // --- Interfaces --- //
    interface State {
        downloadMode: 'video' | 'audio' | 'mute';
        quality: string;
        codec: string;
        audioFormat: string;
        mute: boolean;
    }

    interface ToastJob {
        msg: string;
        type: 'success' | 'error' | 'info';
    }

    interface HistoryItem {
        id: string;
        url: string;
        format: string;
        filename: string;
        status: string;
        created_at: string;
        file_size: number;
    }

    // --- State --- //
    const state: State = {
        downloadMode: 'video',
        quality: '1080',
        codec: 'h264',
        audioFormat: 'mp3',
        mute: false
    };

    let currentAbortController: AbortController | null = null;
    let toastQueue: ToastJob[] = [];
    let activeToasts = 0;
    let pollIntervalId: any = null;

    // --- DOM Elements --- //
    const videoUrlInput = document.getElementById('videoUrl') as HTMLInputElement;
    const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
    const statusMessage = document.getElementById('statusMessage') as HTMLDivElement;
    const toastContainer = document.getElementById('toastContainer') as HTMLDivElement;
    const mascotContainer = document.getElementById('mascotContainer') as HTMLDivElement;
    
    const queueProgressContainer = document.getElementById('queueProgressContainer') as HTMLDivElement;
    const queueProgressBar = document.getElementById('queueProgressBar') as HTMLDivElement;
    const queueProgressText = document.getElementById('queueProgressText') as HTMLSpanElement;

    const historyBtn = document.getElementById('historyBtn') as HTMLButtonElement;
    const historyPanel = document.getElementById('historyPanel') as HTMLDivElement;
    const historyList = document.getElementById('historyList') as HTMLDivElement;
    const closeHistory = document.getElementById('closeHistory') as HTMLButtonElement;

    const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
    const infoBtn = document.getElementById('infoBtn') as HTMLButtonElement;
    const settingsPanel = document.getElementById('settingsPanel') as HTMLDivElement;
    const infoPanel = document.getElementById('infoPanel') as HTMLDivElement;
    const closeSettings = document.getElementById('closeSettings') as HTMLButtonElement;
    const closeInfo = document.getElementById('closeInfo') as HTMLButtonElement;
    
    const muteVideoCheckbox = document.getElementById('muteVideo') as HTMLInputElement;
    const segmentedControls = document.querySelectorAll('.segmented-control');

    // --- Focus Management Helpers --- //
    const getKeyboardFocusableElements = (element: HTMLElement): HTMLElement[] => {
        return [...element.querySelectorAll(
            'a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])'
        )].filter(el => {
            const castEl = el as HTMLElement;
            return !castEl.hasAttribute('disabled') && castEl.getAttribute('aria-hidden') !== 'true';
        }) as HTMLElement[];
    };

    const trapFocus = (e: KeyboardEvent, panel: HTMLElement) => {
        const focusableElements = getKeyboardFocusableElements(panel);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.key === 'Tab') {
            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstElement) {
                    lastElement.focus();
                    e.preventDefault();
                }
            } else { // Tab
                if (document.activeElement === lastElement) {
                    firstElement.focus();
                    e.preventDefault();
                }
            }
        }
    };

    let lastFocusedElement: HTMLElement | null = null;

    const openPanel = (panel: HTMLElement, trigger: HTMLButtonElement) => {
        lastFocusedElement = document.activeElement as HTMLElement;
        panel.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        
        const container = panel.querySelector('.panel-container') as HTMLElement;
        container.focus();
        
        const focusTrapHandler = (e: KeyboardEvent) => trapFocus(e, container);
        (panel as any)._focusTrap = focusTrapHandler;
        panel.addEventListener('keydown', focusTrapHandler);

        if (panel === historyPanel) {
            fetchHistory();
        }
    };

    const closePanel = (panel: HTMLElement, trigger: HTMLButtonElement) => {
        panel.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        
        if ((panel as any)._focusTrap) {
            panel.removeEventListener('keydown', (panel as any)._focusTrap);
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

    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (settingsPanel.classList.contains('open')) closePanel(settingsPanel, settingsBtn);
            if (infoPanel.classList.contains('open')) closePanel(infoPanel, infoBtn);
            if (historyPanel.classList.contains('open')) closePanel(historyPanel, historyBtn);
        }
    });

    window.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
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
        const key = (control as HTMLElement).dataset.state as keyof State;
        const segments = control.querySelectorAll('.segment');
        
        segments.forEach(segment => {
            segment.addEventListener('click', () => {
                segments.forEach(s => s.classList.remove('active'));
                segment.classList.add('active');
                const val = (segment as HTMLElement).dataset.value;
                if (val !== undefined) {
                    (state as any)[key] = val;
                }
            });
        });
    });

    muteVideoCheckbox.addEventListener('change', (e) => {
        state.mute = (e.target as HTMLInputElement).checked;
    });

    // --- Download Logic --- //

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            renderHistory(data);
        } catch (err) {
            historyList.innerHTML = '<p class="small-text">failed to load history.</p>';
        }
    };

    const renderHistory = (items: HistoryItem[]) => {
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
        if (toastQueue.length === 0 || activeToasts >= MAX_TOASTS) return;
        const job = toastQueue.shift();
        if (job) createToast(job.msg, job.type);
    };

    const createToast = (msg: string, type: 'success' | 'error' | 'info') => {
        activeToasts++;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        let icon = '';
        if (type === 'success') {
            icon = '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        } else if (type === 'error') {
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

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
        toastQueue.push({ msg, type });
        processToastQueue();
    };

    const showStatus = (msg: string, type: string = '') => {
        statusMessage.textContent = msg;
        statusMessage.className = 'status-msg ' + type;
    };

    const pollJobStatus = (jobId: string) => {
        pollIntervalId = setInterval(async () => {
            try {
                const res = await fetch(`/api/queue/${jobId}`);
                if (!res.ok) throw new Error('Job lost');
                
                const job = await res.json();
                
                if (job.state === 'completed') {
                    stopPolling();
                    handleDownloadComplete(job.result);
                } else if (job.state === 'failed') {
                    stopPolling();
                    showToast(job.failedReason || 'download failed', 'error');
                    resetUI();
                } else {
                    updateQueueProgress(job.state);
                }
            } catch (err) {
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

    const updateQueueProgress = (state: string) => {
        queueProgressContainer.style.display = 'flex';
        if (state === 'active') {
            queueProgressText.textContent = 'processing on server...';
            queueProgressBar.style.width = '50%';
        } else {
            queueProgressText.textContent = 'waiting in queue...';
            queueProgressBar.style.width = '20%';
        }
    };

    const handleDownloadComplete = (result: any) => {
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
        } catch (error: any) {
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

    videoUrlInput.addEventListener('keypress', (e: KeyboardEvent) => {
        if (e.key === 'Enter') handleDownload();
    });
});
