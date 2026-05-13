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
    interface ToastJob { msg: string; type: 'success' | 'error' | 'info'; }
    interface HistoryItem {
        id: string; url: string; format: string; filename: string;
        status: string; created_at: string; file_size: number;
    }
    type CatMood = 'idle' | 'sniff' | 'munch' | 'squat' | 'happy' | 'sad' | 'sleep' | 'pet' | 'hungry';

    const escapeHtml = (s: string): string => {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    };

    // --- Chiptune SFX (Web Audio, lazy-init on first gesture) --- //
    let audioCtx: AudioContext | null = null;
    let sfxMuted = localStorage.getItem('allkitty.muted') === '1';

    const ensureCtx = (): AudioContext | null => {
        if (sfxMuted) return null;
        if (!audioCtx) {
            const Ctor: typeof AudioContext | undefined =
                (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!Ctor) return null;
            audioCtx = new Ctor();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    };

    interface BlipOpts {
        freq: number; dur?: number; type?: OscillatorType;
        slideTo?: number; vol?: number; delay?: number;
    }
    const blip = ({ freq, dur = 0.08, type = 'square', slideTo, vol = 0.08, delay = 0 }: BlipOpts) => {
        const ctx = ensureCtx();
        if (!ctx) return;
        const t0 = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    };

    const sfx = {
        click:  () => blip({ freq: 880, dur: 0.05, vol: 0.06 }),
        tick:   () => blip({ freq: 1200, dur: 0.025, vol: 0.04 }),
        paste:  () => { blip({ freq: 440, slideTo: 880, dur: 0.12, vol: 0.07 }); },
        munch:  () => blip({ freq: 180, slideTo: 120, dur: 0.06, type: 'sawtooth', vol: 0.05 }),
        plop:   () => {
            blip({ freq: 700, slideTo: 90,  dur: 0.32, type: 'sine', vol: 0.12 });
            blip({ freq: 200, slideTo: 60,  dur: 0.18, type: 'square', vol: 0.06, delay: 0.05 });
        },
        happy:  () => {
            blip({ freq: 660, dur: 0.08, vol: 0.08 });
            blip({ freq: 880, dur: 0.08, vol: 0.08, delay: 0.1 });
            blip({ freq: 1320, dur: 0.14, vol: 0.08, delay: 0.2 });
        },
        error:  () => {
            blip({ freq: 220, slideTo: 110, dur: 0.18, type: 'square', vol: 0.09 });
            blip({ freq: 165, slideTo: 80,  dur: 0.22, type: 'square', vol: 0.07, delay: 0.1 });
        },
        purr:   () => blip({ freq: 80, slideTo: 120, dur: 0.4, type: 'triangle', vol: 0.08 }),
    };

    const toggleMute = () => {
        sfxMuted = !sfxMuted;
        localStorage.setItem('allkitty.muted', sfxMuted ? '1' : '0');
        if (!sfxMuted) sfx.click();
    };

    // --- State --- //
    const state: State = {
        downloadMode: 'video', quality: '1080', codec: 'h264', audioFormat: 'mp3', mute: false
    };
    let toastQueue: ToastJob[] = [];
    let activeToasts = 0;
    let pollIntervalId: any = null;
    let blinkIntervalId: any = null;
    let frameTickId: any = null;
    let progressTickId: any = null;

    // --- DOM --- //
    const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    const videoUrlInput = $<HTMLInputElement>('videoUrl');
    const saveBtn = $<HTMLButtonElement>('saveBtn');
    const cancelBtn = $<HTMLButtonElement>('cancelBtn');
    const toastContainer = $<HTMLDivElement>('toastContainer');
    const screen = $<HTMLDivElement>('screen');
    const catCanvas = $<HTMLDivElement>('catCanvas');
    const poopStage = $<HTMLDivElement>('poopStage');
    const thought = $<HTMLDivElement>('thought');
    const thoughtBox = $<HTMLDivElement>('thoughtBox');
    const lcdState = $<HTMLSpanElement>('lcdState');
    const lcdHunger = $<HTMLSpanElement>('lcdHunger');
    const lcdBarFill = $<HTMLDivElement>('lcdBarFill');
    const powerLed = $<HTMLSpanElement>('powerLed');

    const historyBtn = $<HTMLButtonElement>('historyBtn');
    const historyPanel = $<HTMLDivElement>('historyPanel');
    const historyList = $<HTMLDivElement>('historyList');
    const closeHistory = $<HTMLButtonElement>('closeHistory');
    const settingsBtn = $<HTMLButtonElement>('settingsBtn');
    const infoBtn = $<HTMLButtonElement>('infoBtn');
    const settingsPanel = $<HTMLDivElement>('settingsPanel');
    const infoPanel = $<HTMLDivElement>('infoPanel');
    const closeSettings = $<HTMLButtonElement>('closeSettings');
    const closeInfo = $<HTMLButtonElement>('closeInfo');
    const muteVideoCheckbox = $<HTMLInputElement>('muteVideo');
    const sfxToggleCheckbox = $<HTMLInputElement>('sfxToggle');
    const segmentedControls = document.querySelectorAll('.segmented-control');

    // --- Pixel cat sprites — orange tabby ---
    // L = light orange fill, M = darker orange (stripes/shadow), N = cream belly
    const PAL: Record<string, string> = {
        '.': 'transparent',
        'B': '#2a0d00',   // dark outline
        'L': '#ff9a3c',   // main orange
        'M': '#c44a08',   // tabby stripe / shadow
        'N': '#ffe0b8',   // cream belly / muzzle
        'P': '#ff7aa8',   // pink nose
        'E': '#1a0500',   // eye
        'W': '#ffffff',   // eye highlight
        'C': '#ff8fb8',   // pink cheek
        'T': '#2a0d00',   // closed eye line
        'Y': '#fff2b0',   // teeth
        'Z': '#ff3d6e',   // tongue
    };

    // 24 × 20 sprite. Each row is exactly 24 chars.
    // Tabby markings: forehead M, back stripes, cream belly (N), white muzzle.
    const idleFrame = [
        '........................',
        '....BB............BB....',
        '...BLLB..........BLLB...',
        '..BLLLBBBBBBBBBBBBLLLB..',
        '..BLLMLLLLLLLLLLLLMLLB..',
        '.BLLMMLLLLLLLLLLLLMMLLB.',
        '.BLLLLLLMMLLLLMMLLLLLLB.',
        '.BLLWEBLLLLLLLLLBEWLLLB.',
        '.BLLEEBLLLLPPLLLLBEELLB.',
        '.BLLLLLLNCPPCNLLLLLLLLB.',
        '.BLLLLNNNNNNNNNNNNLLLLB.',
        '.BLLLMLLLNNNNNNLLLMLLLB.',
        '..BLMMLLNNNNNNNNNNLMMLB.',
        '...BBLLNNNNNNNNNNNNLBB..',
        '.....BNNNNNNNNNNNNB.....',
        '.....BLLBNNNNNNBLLB..BB.',
        '.....BLLBNNNNNNBLLBBBLB.',
        '.....BLLBNNNNNNBLLBLLB..',
        '.....BBBBBBBBBBBBBBBB...',
        '........................',
    ];

    const blinkFrame = idleFrame.map((r, i) => {
        if (i === 7) return '.BLLTTBLLLLLLLLLBTTLLLB.';
        if (i === 8) return '.BLLLLBLLLLPPLLLLBLLLLB.';
        return r;
    });

    const sniffFrame = idleFrame.map((r, i) => {
        if (i === 9) return '.BLLLLLLLCLZZLCLLLLLLLB.';
        return r;
    });

    const munchOpen = idleFrame.map((r, i) => {
        if (i === 9)  return '.BLLLLLLBBYYYYBBLLLLLLB.';
        if (i === 10) return '.BLLLLLBYZZZZZZYBLLLLLB.';
        if (i === 11) return '.BLLLLLBYYZZZZYYBLLLLLB.';
        if (i === 12) return '..BLLLLBBYYYYYYBBLLLLB..';
        return r;
    });
    const munchClosed = idleFrame.map((r, i) => {
        if (i === 9)  return '.BLLLLLLLCLPPLCLLLLLLLB.';
        if (i === 10) return '.BLLLLLLLLZZZZLLLLLLLLB.';
        return r;
    });

    const squatFrame = idleFrame.map((r, i) => {
        if (i === 7) return '.BLLTTBLLLLLLLLLBTTLLLB.';
        if (i === 8) return '.BLLLLBLLLLPPLLLLBLLLLB.';
        return r;
    });

    const happyFrame = idleFrame.map((r, i) => {
        if (i === 7) return '.BLLLLBLLLLLLLLLBLLLLLB.';
        if (i === 8) return '.BLBBLBLLLLPPLLLLBLLBBB.';
        return r;
    });

    const sadFrame = idleFrame.map((r, i) => {
        if (i === 7) return '.BLLLLBLLLLLLLLLBLLLLLB.';
        if (i === 8) return '.BLLEEBLLLLPPLLLLBEELLB.';
        if (i === 9) return '.BLLEEBLLLLCCLLLLBEELLB.';
        return r;
    });

    // Sleeping: closed eyes, slight curl
    const sleepFrame = idleFrame.map((r, i) => {
        if (i === 7) return '.BLLTTBLLLLLLLLLBTTLLLB.';
        if (i === 8) return '.BLLLLBLLLLPPLLLLBLLLLB.';
        return r;
    });

    // Pet/love: ^^ squint eyes + tongue blep
    const petFrame = idleFrame.map((r, i) => {
        if (i === 7) return '.BBBLLBLLLLLLLLLBLLBBBB.';
        if (i === 8) return '.BLLLLBLLLLPPLLLLBLLLLB.';
        if (i === 9) return '.BLLLLLLLNCZZCNLLLLLLLB.';
        return r;
    });

    // Hungry: sad pleading eyes + tongue droop
    const hungryFrame = idleFrame.map((r, i) => {
        if (i === 7) return '.BLLEEBLLLLLLLLLBEELLLB.';
        if (i === 8) return '.BLLEWBLLLLPPLLLLBWELLB.';
        if (i === 9) return '.BLLLLLLLLZZZZLLLLLLLLB.';
        if (i === 10) return '.BLLLLNNNNZZZZNNNNLLLLB.';
        return r;
    });

    // Poop sprite — 12 × 10
    const poopSprite = [
        '....BBBB....',
        '...BPPPPB...',
        '..BPHHHPPB..',
        '.BPHHHHHPPB.',
        'BPHHHKHHHHPB',
        'BPPHHKHHHPPB',
        'BHPPHHHPPHHB',
        'BPPHPPPHPPHB',
        '.BBPPPPPPBB.',
        '..BBBBBBBB..',
    ];
    const POOP_PAL: Record<string, string> = {
        '.': 'transparent',
        'B': '#1c2a16',
        'P': '#6b3a1a',
        'H': '#a35a26',
        'K': '#ffe14a',
    };

    const renderSprite = (host: HTMLElement, rows: string[], palette: Record<string,string>) => {
        while (host.firstChild) host.removeChild(host.firstChild);
        const frag = document.createDocumentFragment();
        for (const row of rows) {
            for (const ch of row) {
                const cell = document.createElement('span');
                cell.className = 'px';
                const c = palette[ch] || 'transparent';
                if (c !== 'transparent') cell.style.background = c;
                frag.appendChild(cell);
            }
        }
        host.appendChild(frag);
    };

    // --- Cat state machine ---
    let currentMood: CatMood = 'idle';
    let munchToggle = false;
    let lastInteraction = Date.now();
    let hungerLevel = 4;
    let idleBehaviorId: any = null;
    let zzzId: any = null;

    // --- Pet thought pools ---
    const idleThoughts = [
        'paste a link, hooman',
        'mrow?',
        'i see you...',
        'nyaaa',
        '*licks paw*',
        'whiskers twitch',
        'blep',
        '*tail flick*',
        '*purrs softly*',
        'staring intensifies',
        'bring me a video',
        '*ear flick*',
        'nap?',
        '*kneads air*',
        'feed me a link!',
        'attention pls',
        'mrrp',
        'hooman... ?',
        '*chirps*',
        'beep meow',
        '*head tilt*',
        'i\'m a good cat',
    ];
    const sniffThoughts = [
        'sniff sniff...',
        'mmm a link',
        'smells linkable',
        'is it tasty?',
        '*twitch*',
        'lemme inspect this',
    ];
    const hungryThoughts = [
        'feed me!!',
        'starvinggg',
        '*meows angrily*',
        'i need a link to eat',
        'hooman are you ok',
        '*paws at screen*',
        'food food food',
    ];
    const happyThoughts = [
        'mwah!',
        '*purrs loudly*',
        'good hooman',
        'love this',
        '<3',
        '*wiggles*',
    ];
    const petThoughts = [
        '*purr*',
        'mreoow~',
        'more please',
        'aaa <3',
        '*content*',
        'best hooman',
        '*nuzzles*',
    ];
    const sleepThoughts = [
        'zzz...',
        '*dreaming*',
        'mrrr...',
        '*twitches paw*',
    ];
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    const spawnHearts = (n: number) => {
        for (let i = 0; i < n; i++) {
            setTimeout(() => {
                const heart = document.createElement('div');
                heart.className = 'heart';
                heart.textContent = Math.random() < 0.5 ? '♡' : '♥';
                const offset = -22 + Math.random() * 44;
                heart.style.left = `calc(50% + ${offset}px)`;
                poopStage.appendChild(heart);
                setTimeout(() => heart.remove(), 1400);
            }, i * 130);
        }
    };

    const startZzz = () => {
        if (zzzId) return;
        zzzId = setInterval(() => {
            const z = document.createElement('div');
            z.className = 'zzz';
            z.textContent = ['z', 'Z', 'zZ'][Math.floor(Math.random() * 3)];
            z.style.left = `${52 + Math.random() * 8}%`;
            poopStage.appendChild(z);
            setTimeout(() => z.remove(), 2400);
        }, 1300);
    };
    const stopZzz = () => { if (zzzId) { clearInterval(zzzId); zzzId = null; } };

    const setMood = (mood: CatMood) => {
        currentMood = mood;
        screen.dataset.state = mood;
        if (frameTickId) { clearInterval(frameTickId); frameTickId = null; }
        if (blinkIntervalId) { clearInterval(blinkIntervalId); blinkIntervalId = null; }
        if (mood !== 'sleep') stopZzz();

        switch (mood) {
            case 'idle':
                renderSprite(catCanvas, idleFrame, PAL);
                lcdState.textContent = '> idle';
                powerLed.dataset.state = 'idle';
                blinkIntervalId = setInterval(() => {
                    renderSprite(catCanvas, blinkFrame, PAL);
                    setTimeout(() => {
                        if (currentMood === 'idle') renderSprite(catCanvas, idleFrame, PAL);
                    }, 140);
                }, 3200 + Math.random() * 1500);
                break;
            case 'sniff':
                renderSprite(catCanvas, sniffFrame, PAL);
                lcdState.textContent = '> sniff..';
                powerLed.dataset.state = 'idle';
                break;
            case 'munch':
                lcdState.textContent = '> munch';
                powerLed.dataset.state = 'busy';
                frameTickId = setInterval(() => {
                    munchToggle = !munchToggle;
                    renderSprite(catCanvas, munchToggle ? munchOpen : munchClosed, PAL);
                    sfx.munch();
                }, 220);
                break;
            case 'squat':
                renderSprite(catCanvas, squatFrame, PAL);
                lcdState.textContent = '> squat!';
                powerLed.dataset.state = 'alert';
                break;
            case 'happy':
                renderSprite(catCanvas, happyFrame, PAL);
                lcdState.textContent = '> happy';
                powerLed.dataset.state = 'happy';
                break;
            case 'sad':
                renderSprite(catCanvas, sadFrame, PAL);
                lcdState.textContent = '> sad';
                powerLed.dataset.state = 'alert';
                break;
            case 'sleep':
                renderSprite(catCanvas, sleepFrame, PAL);
                lcdState.textContent = '> zzz...';
                powerLed.dataset.state = 'idle';
                startZzz();
                break;
            case 'pet':
                renderSprite(catCanvas, petFrame, PAL);
                lcdState.textContent = '> purr~';
                powerLed.dataset.state = 'happy';
                break;
            case 'hungry':
                renderSprite(catCanvas, hungryFrame, PAL);
                lcdState.textContent = '> hungry';
                powerLed.dataset.state = 'alert';
                break;
        }
    };

    const showThought = (msg: string, ttl = 0) => {
        thoughtBox.textContent = msg;
        thought.classList.add('show');
        if (ttl > 0) setTimeout(() => thought.classList.remove('show'), ttl);
    };
    const hideThought = () => thought.classList.remove('show');

    const setProgressBar = (pct: number) => {
        lcdBarFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    };

    const setHunger = (hearts: number) => {
        const clamped = Math.max(0, Math.min(4, hearts));
        hungerLevel = clamped;
        const filled = '@'.repeat(clamped);
        const empty = '.'.repeat(4 - filled.length);
        lcdHunger.textContent = filled + empty;
    };

    const startProgressShimmer = () => {
        if (progressTickId) return;
        let p = 5; let dir = 1;
        progressTickId = setInterval(() => {
            p += dir * (Math.random() * 6 + 2);
            if (p > 92) { p = 92; dir = -1; }
            if (p < 8)  { p = 8;  dir = 1; }
            setProgressBar(p);
        }, 320);
    };
    const stopProgressShimmer = () => {
        if (progressTickId) { clearInterval(progressTickId); progressTickId = null; }
    };

    // --- Poop drop ---
    const dropPoop = (onLanded: () => void) => {
        const node = document.createElement('div');
        node.className = 'poop';
        renderSprite(node, poopSprite, POOP_PAL);
        // Anchor just behind the tail (right side of cat); small jitter only
        const offset = 18 + Math.floor(Math.random() * 12);
        node.style.left = `calc(50% + ${offset}px)`;
        poopStage.appendChild(node);

        setTimeout(onLanded, 700);
        setTimeout(() => {
            const all = poopStage.querySelectorAll('.poop');
            if (all.length > 3) all[0].remove();
        }, 1400);
    };

    // --- Panels --- //
    const getKeyboardFocusableElements = (el: HTMLElement): HTMLElement[] =>
        [...el.querySelectorAll('a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])')]
            .filter(e => !e.hasAttribute('disabled') && e.getAttribute('aria-hidden') !== 'true') as HTMLElement[];

    const trapFocus = (e: KeyboardEvent, panel: HTMLElement) => {
        const f = getKeyboardFocusableElements(panel);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
            else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
        }
    };

    let lastFocused: HTMLElement | null = null;

    const openPanel = (panel: HTMLElement, trigger: HTMLButtonElement) => {
        lastFocused = document.activeElement as HTMLElement;
        panel.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        const c = panel.querySelector('.panel-container') as HTMLElement;
        c.focus();
        const handler = (e: KeyboardEvent) => trapFocus(e, c);
        (panel as any)._focusTrap = handler;
        panel.addEventListener('keydown', handler);
        if (panel === historyPanel) fetchHistory();
    };

    const closePanel = (panel: HTMLElement, trigger: HTMLButtonElement) => {
        panel.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        if ((panel as any)._focusTrap) panel.removeEventListener('keydown', (panel as any)._focusTrap);
        if (lastFocused) lastFocused.focus();
    };

    settingsBtn.addEventListener('click', e => { e.stopPropagation(); sfx.click(); openPanel(settingsPanel, settingsBtn); });
    infoBtn.addEventListener('click', e => { e.stopPropagation(); sfx.click(); openPanel(infoPanel, infoBtn); });
    historyBtn.addEventListener('click', e => { e.stopPropagation(); sfx.click(); openPanel(historyPanel, historyBtn); });
    closeSettings.addEventListener('click', () => { sfx.tick(); closePanel(settingsPanel, settingsBtn); });
    closeInfo.addEventListener('click', () => { sfx.tick(); closePanel(infoPanel, infoBtn); });
    closeHistory.addEventListener('click', () => { sfx.tick(); closePanel(historyPanel, historyBtn); });

    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (settingsPanel.classList.contains('open')) closePanel(settingsPanel, settingsBtn);
            if (infoPanel.classList.contains('open')) closePanel(infoPanel, infoBtn);
            if (historyPanel.classList.contains('open')) closePanel(historyPanel, historyBtn);
        }
    });

    window.addEventListener('click', e => {
        const t = e.target as HTMLElement;
        const checkClose = (panel: HTMLElement, btn: HTMLButtonElement) => {
            if (panel.classList.contains('open') && !panel.querySelector('.panel-container')?.contains(t)) closePanel(panel, btn);
        };
        checkClose(settingsPanel, settingsBtn);
        checkClose(infoPanel, infoBtn);
        checkClose(historyPanel, historyBtn);
    });

    segmentedControls.forEach(control => {
        const key = (control as HTMLElement).dataset.state as keyof State;
        const segments = control.querySelectorAll('.segment');
        segments.forEach(seg => {
            seg.addEventListener('click', () => {
                segments.forEach(s => s.classList.remove('active'));
                seg.classList.add('active');
                sfx.tick();
                const v = (seg as HTMLElement).dataset.value;
                if (v !== undefined) (state as any)[key] = v;
            });
        });
    });

    muteVideoCheckbox.addEventListener('change', e => { state.mute = (e.target as HTMLInputElement).checked; sfx.tick(); });

    // --- Toasts (DOM-built, no innerHTML) --- //
    const buildIcon = (type: 'success' | 'error' | 'info'): SVGElement => {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', 'toast-icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '3');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const make = (tag: string, attrs: Record<string,string>) => {
            const el = document.createElementNS(ns, tag);
            for (const k in attrs) el.setAttribute(k, attrs[k]);
            return el;
        };
        if (type === 'success') {
            svg.appendChild(make('polyline', { points: '20 6 9 17 4 12' }));
        } else if (type === 'error') {
            svg.appendChild(make('line', { x1: '18', y1: '6', x2: '6', y2: '18' }));
            svg.appendChild(make('line', { x1: '6',  y1: '6', x2: '18', y2: '18' }));
        } else {
            svg.appendChild(make('circle', { cx: '12', cy: '12', r: '9' }));
            svg.appendChild(make('line', { x1: '12', y1: '8', x2: '12', y2: '13' }));
            svg.appendChild(make('line', { x1: '12', y1: '16', x2: '12.01', y2: '16' }));
        }
        return svg;
    };

    const processToastQueue = () => {
        if (toastQueue.length === 0 || activeToasts >= MAX_TOASTS) return;
        const job = toastQueue.shift();
        if (job) createToast(job.msg, job.type);
    };

    const createToast = (msg: string, type: 'success' | 'error' | 'info') => {
        activeToasts++;
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.appendChild(buildIcon(type));
        const span = document.createElement('span');
        span.textContent = msg;
        t.appendChild(span);
        toastContainer.appendChild(t);
        requestAnimationFrame(() => setTimeout(() => t.classList.add('show'), 10));
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => { t.remove(); activeToasts--; processToastQueue(); }, TOAST_REMOVE_DELAY);
        }, TOAST_DURATION);
    };

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
        toastQueue.push({ msg, type });
        processToastQueue();
    };

    // --- History --- //
    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            renderHistory(data);
        } catch {
            historyList.textContent = '';
            const p = document.createElement('p');
            p.className = 'small-text';
            p.textContent = 'litter box jammed.';
            historyList.appendChild(p);
        }
    };

    const renderHistory = (items: HistoryItem[]) => {
        historyList.textContent = '';
        if (items.length === 0) {
            const p = document.createElement('p');
            p.className = 'small-text';
            p.textContent = 'no recent poops.';
            historyList.appendChild(p);
            return;
        }
        for (const item of items) {
            const wrap = document.createElement('div');
            wrap.className = 'history-item';
            const top = document.createElement('div');
            top.className = 'history-item-top';
            const dateSpan = document.createElement('span');
            dateSpan.textContent = new Date(item.created_at).toLocaleDateString();
            const statusSpan = document.createElement('span');
            statusSpan.textContent = item.status;
            top.append(dateSpan, statusSpan);
            const title = document.createElement('div');
            title.className = 'history-item-title';
            title.textContent = item.filename || item.url;
            wrap.append(top, title);
            historyList.appendChild(wrap);
        }
    };

    // --- Download --- //
    const pollJobStatus = (jobId: string) => {
        pollIntervalId = setInterval(async () => {
            try {
                const res = await fetch(`/api/queue/${jobId}`);
                if (!res.ok) throw new Error('Job lost');
                const job = await res.json();
                if (job.state === 'completed') { stopPolling(); handleDownloadComplete(job.result); }
                else if (job.state === 'failed') { stopPolling(); showToast(job.failedReason || 'download failed', 'error'); failUI(); }
                else updateQueueProgress(job.state);
            } catch {
                stopPolling();
                showToast('lost connection to job', 'error');
                failUI();
            }
        }, POLL_INTERVAL);
    };

    const stopPolling = () => { if (pollIntervalId) { clearInterval(pollIntervalId); pollIntervalId = null; } };

    const updateQueueProgress = (s: string) => {
        if (s === 'active') { lcdState.textContent = '> chewing..'; setHunger(2); }
        else                { lcdState.textContent = '> in queue'; setHunger(3); }
    };

    const handleDownloadComplete = (result: any) => {
        stopProgressShimmer();
        setProgressBar(100);
        setMood('squat');
        showThought('here it comes...', 1200);

        setTimeout(() => {
            dropPoop(() => {
                sfx.plop();
                showToast('plop! download ready', 'success');
                showThought('deposited!', 2500);
                setMood('happy');
                setHunger(4);
                setTimeout(() => sfx.happy(), 300);

                const a = document.createElement('a');
                a.href = result.downloadUrl;
                a.download = result.filename || 'allkitty_media';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                setTimeout(() => { resetUI(); }, 2200);
            });
        }, 600);
    };

    const failUI = () => {
        stopProgressShimmer();
        sfx.error();
        setMood('sad');
        showThought('hairball...', 2000);
        setProgressBar(0);
        setHunger(1);
        setTimeout(resetUI, 2200);
    };

    const resetUI = () => {
        saveBtn.disabled = false;
        const lbl = saveBtn.querySelector('span'); if (lbl) lbl.textContent = 'FEED';
        cancelBtn.style.display = 'none';
        setProgressBar(0);
        const next: CatMood = videoUrlInput.value.trim()
            ? 'sniff'
            : (hungerLevel <= 1 ? 'hungry' : 'idle');
        setMood(next);
        if (!videoUrlInput.value.trim()) hideThought();
    };

    const handleDownload = async () => {
        const url = videoUrlInput.value.trim();
        if (!url) {
            setMood('sad');
            showThought('meow... paste a link first', 2200);
            sfx.error();
            setTimeout(() => setMood(hungerLevel <= 1 ? 'hungry' : 'idle'), 900);
            return;
        }

        saveBtn.disabled = true;
        const lbl = saveBtn.querySelector('span'); if (lbl) lbl.textContent = 'WAIT';
        cancelBtn.style.display = 'inline-flex';
        setMood('munch');
        showThought('nom nom...');
        startProgressShimmer();
        setHunger(3);

        try {
            let formatParam: string = state.downloadMode;
            if (state.downloadMode === 'video' && state.mute) formatParam = 'mute';

            const payload = { url, format: formatParam, quality: state.quality, codec: state.codec, container: 'auto' };

            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'failed to queue');
            }

            const data = await response.json();
            if (data.success && data.jobId) {
                showToast('added to queue!', 'info');
                pollJobStatus(data.jobId);
            }
        } catch (error: any) {
            showToast(error.message || 'server unreachable', 'error');
            failUI();
        }
    };

    saveBtn.addEventListener('click', () => { sfx.click(); handleDownload(); });
    cancelBtn.addEventListener('click', () => {
        sfx.click();
        stopPolling();
        showToast('stopped tracking', 'info');
        showThought('mrow?', 1500);
        resetUI();
    });

    videoUrlInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleDownload(); });

    videoUrlInput.addEventListener('input', () => {
        lastInteraction = Date.now();
        const restable = currentMood === 'idle' || currentMood === 'sniff' || currentMood === 'happy' ||
                         currentMood === 'sad' || currentMood === 'sleep' || currentMood === 'pet' ||
                         currentMood === 'hungry';
        if (restable) {
            if (videoUrlInput.value.trim()) {
                setMood('sniff');
                showThought(pick(sniffThoughts));
            } else {
                hideThought();
                setMood(hungerLevel <= 1 ? 'hungry' : 'idle');
            }
        }
    });

    videoUrlInput.addEventListener('paste', () => {
        setTimeout(() => {
            if (videoUrlInput.value.trim() && currentMood !== 'munch' && currentMood !== 'squat') {
                sfx.paste();
                setMood('sniff');
                showThought('snifff... a link!');
                screen.animate(
                    [{ transform: 'translate(0,0)' }, { transform: 'translate(-2px,1px)' }, { transform: 'translate(2px,-1px)' }, { transform: 'translate(0,0)' }],
                    { duration: 220, iterations: 1, easing: 'steps(4)' }
                );
            }
        }, 0);
    });

    catCanvas.addEventListener('click', () => {
        lastInteraction = Date.now();
        if (currentMood === 'munch' || currentMood === 'squat') return;
        sfx.purr();
        spawnHearts(3);
        const prev = videoUrlInput.value.trim();
        const restMood: CatMood = prev ? 'sniff' : (hungerLevel <= 1 ? 'hungry' : 'idle');
        setMood('pet');
        showThought(pick(petThoughts), 1500);
        setTimeout(() => {
            if (currentMood === 'pet') setMood(restMood);
        }, 1400);
    });

    // Pet on hover too — small wiggle without state change
    catCanvas.addEventListener('mouseenter', () => {
        if (currentMood === 'idle' || currentMood === 'sleep') {
            lastInteraction = Date.now();
            if (currentMood === 'sleep') {
                setMood('idle');
                showThought('mrrr...?', 1400);
            }
        }
    });

    // --- Idle behavior + hunger decay ---
    idleBehaviorId = setInterval(() => {
        const idleSec = (Date.now() - lastInteraction) / 1000;
        // Long idle → sleep
        if (idleSec > 50 && currentMood === 'idle') {
            setMood('sleep');
            showThought(pick(sleepThoughts), 2400);
            return;
        }
        // Random idle nudges
        if (currentMood === 'idle' && Math.random() < 0.45) {
            const r = Math.random();
            if (r < 0.55) {
                showThought(pick(idleThoughts), 2400);
            } else if (r < 0.85) {
                setMood('sniff');
                setTimeout(() => { if (currentMood === 'sniff' && !videoUrlInput.value.trim()) setMood('idle'); }, 900);
            } else {
                renderSprite(catCanvas, blinkFrame, PAL);
                setTimeout(() => { if (currentMood === 'idle') renderSprite(catCanvas, idleFrame, PAL); }, 200);
            }
        } else if (currentMood === 'sleep' && Math.random() < 0.5) {
            showThought(pick(sleepThoughts), 2200);
        } else if (currentMood === 'hungry' && Math.random() < 0.5) {
            showThought(pick(hungryThoughts), 2400);
        } else if (currentMood === 'sniff' && Math.random() < 0.35) {
            showThought(pick(sniffThoughts), 1800);
        }
    }, 7000);

    // Hunger ticks down slowly
    setInterval(() => {
        if (currentMood === 'munch' || currentMood === 'squat' || currentMood === 'happy') return;
        if (hungerLevel > 0) {
            hungerLevel -= 1;
            setHunger(hungerLevel);
        }
        if (hungerLevel <= 1 && currentMood !== 'sleep' && currentMood !== 'hungry' && currentMood !== 'pet') {
            setMood('hungry');
            showThought(pick(hungryThoughts), 2800);
        }
    }, 35000);

    // Any user input on the page = poke the cat
    document.addEventListener('keydown', () => { lastInteraction = Date.now(); }, { passive: true });
    document.addEventListener('mousemove', () => { lastInteraction = Date.now(); }, { passive: true });

    // Initial sfx toggle state from localStorage
    sfxToggleCheckbox.checked = !sfxMuted;
    sfxToggleCheckbox.addEventListener('change', () => {
        sfxMuted = !sfxToggleCheckbox.checked;
        localStorage.setItem('allkitty.muted', sfxMuted ? '1' : '0');
        if (!sfxMuted) sfx.click();
    });

    setMood('idle');
    setHunger(4);
    setProgressBar(0);
    showThought('paste a link, hooman', 3500);
});
