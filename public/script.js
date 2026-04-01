document.addEventListener('DOMContentLoaded', () => {
    // --- State --- //
    const state = {
        downloadMode: 'video',
        quality: '1080',
        codec: 'h264',
        audioFormat: 'mp3',
        mute: false
    };

    let currentAbortController = null;

    // --- DOM Elements --- //
    const videoUrlInput = document.getElementById('videoUrl');
    const saveBtn = document.getElementById('saveBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const statusMessage = document.getElementById('statusMessage');
    const toastContainer = document.getElementById('toastContainer');
    const mascotContainer = document.getElementById('mascotContainer');
    
    const settingsBtn = document.getElementById('settingsBtn');
    const infoBtn = document.getElementById('infoBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const infoPanel = document.getElementById('infoPanel');
    const closeSettings = document.getElementById('closeSettings');
    const closeInfo = document.getElementById('closeInfo');
    
    const muteVideoCheckbox = document.getElementById('muteVideo');
    const segmentedControls = document.querySelectorAll('.segmented-control');

    // --- UI Interactions --- //

    // Toggle Panels
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.add('open');
    });
    
    infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        infoPanel.classList.add('open');
    });

    closeSettings.addEventListener('click', () => settingsPanel.classList.remove('open'));
    closeInfo.addEventListener('click', () => infoPanel.classList.remove('open'));

    // Close on click outside container
    window.addEventListener('click', (e) => {
        if (settingsPanel.classList.contains('open') && !settingsPanel.querySelector('.panel-container').contains(e.target)) {
            settingsPanel.classList.remove('open');
        }
        if (infoPanel.classList.contains('open') && !infoPanel.querySelector('.panel-container').contains(e.target)) {
            infoPanel.classList.remove('open');
        }
    });

    // Segmented Controls Sync
    segmentedControls.forEach(control => {
        const key = control.dataset.state;
        const segments = control.querySelectorAll('.segment');
        
        segments.forEach(segment => {
            segment.addEventListener('click', () => {
                segments.forEach(s => s.classList.remove('active'));
                segment.classList.add('active');
                state[key] = segment.dataset.value;
            });
        });
    });

    // Checkbox Sync
    muteVideoCheckbox.addEventListener('change', (e) => {
        state.mute = e.target.checked;
    });

    // --- Download Logic --- //

    const showToast = (msg, type = 'info') => {
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

        setTimeout(() => toast.classList.add('show'), 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    };

    const showStatus = (msg, type = '') => {
        statusMessage.textContent = msg;
        statusMessage.className = 'status-msg ' + type;
    };

    const handleDownload = async () => {
        const url = videoUrlInput.value.trim();
        if (!url) {
            showToast('paste a link first', 'error');
            return;
        }

        // Setup AbortController for cancellation
        currentAbortController = new AbortController();

        // UI Feedback
        saveBtn.disabled = true;
        const originalBtnText = saveBtn.textContent;
        saveBtn.textContent = 'downloading...';
        showStatus('downloading...');
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
                body: JSON.stringify(payload),
                signal: currentAbortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'download failed');
            }

            const data = await response.json();

            if (data.success) {
                showToast('download starting!', 'success');
                showStatus('');
                
                const a = document.createElement('a');
                a.href = data.downloadUrl;
                a.download = data.filename || data.downloadUrl.split('/').pop();
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                showToast(data.error || 'error: download failed', 'error');
                showStatus('');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                showToast('download cancelled', 'info');
            } else {
                showToast(error.message || 'error: server unreachable', 'error');
            }
            showStatus('');
            console.error(error);
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = originalBtnText;
            mascotContainer.classList.remove('eating');
            cancelBtn.style.display = 'none';
            currentAbortController = null;
        }
    };

    saveBtn.addEventListener('click', handleDownload);

    cancelBtn.addEventListener('click', () => {
        if (currentAbortController) {
            currentAbortController.abort();
        }
    });

    videoUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleDownload();
    });
});
