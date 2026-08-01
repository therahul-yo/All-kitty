/* ══════════════════════════════════════════════════════════════════════════
   allkitty — front end.

   Compiled standalone (tsc --outFile), so this file is one script, no modules.
   Layout:  helpers ▸ settings ▸ audio ▸ cat ▸ log ▸ health ▸ history ▸ fetch
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
    'use strict';

    /* ── helpers ──────────────────────────────────────────────────────────── */

    const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
    const pick = <T>(a: T[]): T => a[(Math.random() * a.length) | 0];
    const chance = (p: number) => Math.random() < p;

    const pad2 = (n: number) => (n < 10 ? '0' : '') + n;
    const clock = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

    const bytes = (n: number): string => {
        if (!n || n < 0) return '—';
        const u = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return (i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)) + ' ' + u[i];
    };

    const ago = (iso: string): string => {
        const t = Date.parse(iso);
        if (isNaN(t)) return '—';
        const s = Math.max(0, (Date.now() - t) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return Math.floor(s / 86400) + 'd ago';
    };

    /* ── settings ─────────────────────────────────────────────────────────── */

    interface Settings {
        diet: string; quality: string; codec: string;
        silent: boolean; sfx: boolean;
    }
    const DEFAULTS: Settings = { diet: 'video', quality: '1080', codec: 'h264', silent: false, sfx: true };
    const STORE = 'allkitty.term';

    const cfg: Settings = (() => {
        try {
            const raw = localStorage.getItem(STORE);
            return raw ? { ...DEFAULTS, ...JSON.parse(raw) } as Settings : { ...DEFAULTS };
        } catch { return { ...DEFAULTS }; }
    })();
    const saveCfg = () => { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* private mode */ } };

    /* ── dom ──────────────────────────────────────────────────────────────── */

    const form = $<HTMLFormElement>('form');
    const urlInput = $<HTMLInputElement>('url');
    const runBtn = $<HTMLButtonElement>('runBtn');
    const stopBtn = $<HTMLButtonElement>('stopBtn');
    const pasteBtn = $<HTMLButtonElement>('pasteBtn');
    const reloadBtn = $<HTMLButtonElement>('reloadBtn');
    const catEl = $<HTMLPreElement>('cat');
    const logEl = $<HTMLOListElement>('log');
    const meter = $<HTMLDivElement>('meter');
    const meterLabel = $<HTMLSpanElement>('meterLabel');
    const elapsedEl = $<HTMLSpanElement>('elapsed');
    const histBody = $<HTMLTableSectionElement>('hist');
    const connDot = $<HTMLSpanElement>('connDot');
    const connText = $<HTMLSpanElement>('conn');
    const sState = $<HTMLElement>('sState');
    const sQueue = $<HTMLElement>('sQueue');
    const sReq = $<HTMLElement>('sReq');
    const sCount = $<HTMLElement>('sCount');
    const sSays = $<HTMLElement>('sSays');
    const srStatus = $<HTMLElement>('srStatus');

    /* ══ AUDIO ════════════════════════════════════════════════════════════════
       Deliberately quiet: soft sine blips, not chiptune. A tool should not
       announce itself.                                                        */

    let ac: AudioContext | null = null;
    const audioReady = (): AudioContext | null => {
        if (!cfg.sfx) return null;
        if (!ac) {
            const Ctor: typeof AudioContext | undefined =
                (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!Ctor) return null;
            ac = new Ctor();
        }
        if (ac.state === 'suspended') void ac.resume();
        return ac;
    };

    const blip = (f: number, d = 0.06, v = 0.035, type: OscillatorType = 'sine', at = 0, to?: number) => {
        const c = audioReady();
        if (!c) return;
        const t0 = c.currentTime + at;
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f, t0);
        if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + d);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(v, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        osc.connect(g).connect(c.destination);
        osc.start(t0);
        osc.stop(t0 + d + 0.02);
    };

    const sfx = {
        tap:   () => blip(880, 0.03, 0.02),
        send:  () => { blip(660, 0.07, 0.04); blip(990, 0.09, 0.03, 'sine', 0.06); },
        done:  () => { [784, 1046.5, 1318.5].forEach((f, i) => blip(f, 0.16, 0.04, 'sine', i * 0.08)); },
        fail:  () => { blip(300, 0.16, 0.05, 'triangle', 0, 150); },
        purr:  () => { blip(120, 0.34, 0.035, 'triangle', 0, 165); },
    };

    /* ══ CAT ══════════════════════════════════════════════════════════════════
       Five lines of ASCII, expression swapped by mood.                        */

    type Mood = 'idle' | 'sniff' | 'work' | 'happy' | 'sad' | 'sleep' | 'hungry' | 'purr';

    const FACE: Record<Mood, [string, string]> = {
        idle:   ['o.o', '^'],
        sniff:  ['o.O', '~'],
        work:   ['^.^', 'w'],
        happy:  ['^-^', 'u'],
        sad:    [';_;', 'v'],
        sleep:  ['-.-', 'z'],
        hungry: ['O.O', 'o'],
        purr:   ['^-^', '3'],
    };
    const BLINK: [string, string] = ['-.-', '^'];

    const draw = (eyes: string, mouth: string) => {
        catEl.textContent =
            '  /\\_/\\\n' +
            ` ( ${eyes} )\n` +
            `  > ${mouth} <\n` +
            ' /|   |\\\n' +
            '(_|   |_)';
    };

    let mood: Mood = 'idle';
    const setMood = (m: Mood) => {
        mood = m;
        const [e, s] = FACE[m];
        draw(e, s);
        sState.textContent = m === 'work' ? 'fetching' : m;
    };

    const say = (msg: string) => { sSays.textContent = msg; };

    const IDLE_TALK = ['paste a link', 'mrow?', 'i see you', '*licks paw*', 'blep',
        'feed me a url', 'still here', '*tail flick*', 'nap?', 'anything good?'];
    const WORK_TALK = ['nom nom nom', 'chewing', 'hold on', 'working on it'];
    const DONE_TALK = ['there you go', 'delivered', 'good hooman', 'that was tasty'];
    const FAIL_TALK = ['hairball', 'that one fought back', 'no luck', 'it got away'];

    /* ══ TRANSCRIPT ═══════════════════════════════════════════════════════════ */

    type Kind = 'info' | 'work' | 'ok' | 'bad';

    const log = (kind: Kind, key: string, msg: string) => {
        const li = document.createElement('li');
        li.dataset.kind = kind;
        const t = document.createElement('span'); t.className = 't'; t.textContent = clock();
        const k = document.createElement('span'); k.className = 'k'; k.textContent = key;
        const m = document.createElement('span'); m.className = 'm'; m.textContent = msg;
        li.append(t, k, m);
        logEl.appendChild(li);
        while (logEl.children.length > 200) logEl.removeChild(logEl.firstChild as Node);
        logEl.scrollTop = logEl.scrollHeight;
        srStatus.textContent = `${key}: ${msg}`;
    };

    /* elapsed timer, shown only while a job is in flight */
    let startedAt = 0;
    let tickId = 0;

    const startClock = () => {
        startedAt = Date.now();
        clearInterval(tickId);
        tickId = window.setInterval(() => {
            const s = Math.floor((Date.now() - startedAt) / 1000);
            elapsedEl.textContent = `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
        }, 1000);
        elapsedEl.textContent = '00:00';
    };
    const stopClock = () => { clearInterval(tickId); tickId = 0; };

    const working = (on: boolean, label = 'working') => {
        meter.hidden = !on;
        meterLabel.textContent = label;
        runBtn.hidden = on;
        stopBtn.hidden = !on;
        connDot.dataset.state = on ? 'busy' : connDot.dataset.state === 'busy' ? 'ok' : connDot.dataset.state;
    };

    /* ══ FLAGS ════════════════════════════════════════════════════════════════ */

    const paintFlags = () => {
        document.querySelectorAll<HTMLElement>('.opts').forEach(group => {
            const key = group.dataset.key as string;
            group.querySelectorAll<HTMLButtonElement>('button').forEach(b => {
                const on = key === 'switches'
                    ? Boolean((cfg as any)[b.dataset.toggle as string])
                    : (cfg as any)[key] === b.dataset.val;
                b.setAttribute('aria-pressed', String(on));
            });
        });
        sReq.textContent = cfg.diet === 'audio'
            ? 'audio · mp3'
            : `video · ${cfg.quality === 'max' ? 'max' : cfg.quality + 'p'} · ${cfg.codec}${cfg.silent ? ' · muted' : ''}`;
    };

    document.querySelectorAll<HTMLElement>('.opts').forEach(group => {
        const key = group.dataset.key as string;
        group.addEventListener('click', e => {
            const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
            if (!b) return;
            if (key === 'switches') {
                const t = b.dataset.toggle as keyof Settings;
                (cfg as any)[t] = !cfg[t];
            } else {
                (cfg as any)[key] = b.dataset.val;
            }
            saveCfg();
            paintFlags();
            sfx.tap();
        });
    });

    /* ══ HEALTH ═══════════════════════════════════════════════════════════════ */

    const health = async () => {
        try {
            const res = await fetch('/api/health');
            if (!res.ok) throw new Error(String(res.status));
            const d = await res.json();
            const q = d.queue || {};
            connDot.dataset.state = busy ? 'busy' : 'ok';
            connText.textContent = 'connected';
            sQueue.textContent = `${q.waiting ?? 0} waiting · ${q.active ?? 0} active`;
            if (typeof q.completed === 'number') sCount.textContent = `${q.completed} all time`;
        } catch {
            connDot.dataset.state = 'bad';
            connText.textContent = 'offline';
            sQueue.textContent = 'unreachable';
        }
    };

    /* ══ HISTORY ══════════════════════════════════════════════════════════════ */

    interface Item {
        id: string; url: string; format: string; filename: string;
        status: string; created_at: string; file_size: number;
    }

    const renderHistory = (items: Item[]) => {
        histBody.textContent = '';
        if (!items.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.className = 'empty';
            td.colSpan = 5;
            td.textContent = 'nothing fetched yet.';
            tr.appendChild(td);
            histBody.appendChild(tr);
            return;
        }
        for (const it of items) {
            const tr = document.createElement('tr');

            const st = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'st';
            badge.dataset.s = it.status;
            badge.textContent = (it.status === 'completed' ? '● ' : it.status === 'failed' ? '○ ' : '◐ ') + it.status;
            st.appendChild(badge);

            const nm = document.createElement('td');
            nm.className = 'c-nm';
            nm.title = it.url || '';
            if (it.status === 'completed' && it.filename) {
                nm.textContent = it.filename;
            } else {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'get';
                b.textContent = it.url || '(unknown)';
                b.title = 'put this link back in the prompt';
                b.addEventListener('click', () => {
                    urlInput.value = it.url;
                    urlInput.focus();
                    setMood('sniff');
                    say('that one again?');
                });
                nm.appendChild(b);
            }

            const fm = document.createElement('td'); fm.className = 'c-fm'; fm.textContent = it.format || '—';
            const sz = document.createElement('td'); sz.className = 'c-sz'; sz.textContent = bytes(it.file_size);
            const wh = document.createElement('td'); wh.className = 'c-wh'; wh.textContent = ago(it.created_at);

            tr.append(st, nm, fm, sz, wh);
            histBody.appendChild(tr);
        }
    };

    const loadHistory = async () => {
        try {
            const res = await fetch('/api/history?limit=25');
            const data = await res.json();
            renderHistory(Array.isArray(data) ? data : []);
        } catch {
            renderHistory([]);
            log('bad', 'history', 'could not load history');
        }
    };

    /* ══ FETCH ════════════════════════════════════════════════════════════════ */

    const POLL_MS = 2000;
    let busy = false;
    let jobId: string | null = null;
    let pollId = 0;

    const stopPolling = () => { if (pollId) { clearInterval(pollId); pollId = 0; } };

    const settle = () => {
        busy = false;
        jobId = null;
        stopPolling();
        stopClock();
        working(false);
    };

    const finish = (result: { downloadUrl?: string; filename?: string } | null) => {
        settle();
        setMood('happy');
        say(pick(DONE_TALK));
        sfx.done();
        log('ok', 'done', result && result.filename ? result.filename : 'file ready');

        if (result && result.downloadUrl) {
            const a = document.createElement('a');
            a.href = result.downloadUrl;
            a.download = result.filename || 'allkitty';
            document.body.appendChild(a);
            a.click();
            a.remove();
            log('info', 'save', 'download started in your browser');
        }
        void loadHistory();
        void health();
        setTimeout(() => { if (!busy) setMood('idle'); }, 6000);
    };

    const fail = (msg: string) => {
        settle();
        setMood('sad');
        say(pick(FAIL_TALK));
        sfx.fail();
        log('bad', 'error', msg);
        void loadHistory();
        setTimeout(() => { if (!busy) setMood('idle'); }, 6000);
    };

    const poll = () => {
        pollId = window.setInterval(async () => {
            if (!jobId) return;
            try {
                const res = await fetch('/api/queue/' + encodeURIComponent(jobId));
                if (!res.ok) throw new Error('job not found');
                const job = await res.json();
                if (job.state === 'completed') finish(job.result || null);
                else if (job.state === 'failed') fail(String(job.failedReason || 'the job failed'));
                else if (job.state === 'active') { working(true, 'downloading'); }
                else { working(true, 'queued'); }
            } catch (err: any) {
                fail(String(err && err.message ? err.message : 'lost contact with the job'));
            }
        }, POLL_MS);
    };

    const run = async () => {
        if (busy) return;
        const url = urlInput.value.trim();

        if (!url) {
            setMood('hungry');
            say('give me something');
            log('bad', 'input', 'no link given');
            sfx.fail();
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            setMood('sad');
            say('that is not a link');
            log('bad', 'input', 'only http and https links are supported');
            sfx.fail();
            return;
        }

        busy = true;
        setMood('work');
        say(pick(WORK_TALK));
        working(true, 'sending');
        startClock();
        sfx.send();
        log('info', 'request', url);

        const format = cfg.diet === 'audio' ? 'audio' : cfg.silent ? 'mute' : 'video';

        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, format, quality: cfg.quality, codec: cfg.codec, container: 'auto' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || `server said ${res.status}`);

            jobId = data.jobId;
            working(true, 'queued');
            log('work', 'queued', 'job ' + String(jobId).slice(0, 8));
            void health();
            poll();
        } catch (err: any) {
            fail(String(err && err.message ? err.message : 'could not reach the server'));
        }
    };

    const stop = async () => {
        if (!busy) return;
        const id = jobId;
        settle();
        setMood('idle');
        say('fine, dropped it');
        log('info', 'stopped', 'no longer tracking this job');
        if (id) {
            try {
                await fetch('/api/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ uuid: id }),
                });
            } catch { /* it may already be gone */ }
        }
        void health();
    };

    /* ══ WIRING ═══════════════════════════════════════════════════════════════ */

    form.addEventListener('submit', e => { e.preventDefault(); void run(); });
    stopBtn.addEventListener('click', () => void stop());
    reloadBtn.addEventListener('click', () => { sfx.tap(); void loadHistory(); void health(); });

    pasteBtn.addEventListener('click', async () => {
        sfx.tap();
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                setMood('sniff');
                say('ooh, what is this');
            } else log('info', 'paste', 'clipboard was empty');
        } catch {
            log('info', 'paste', 'clipboard blocked — paste with the keyboard instead');
            urlInput.focus();
        }
    });

    urlInput.addEventListener('input', () => {
        if (busy) return;
        if (urlInput.value.trim()) { if (mood !== 'sniff') { setMood('sniff'); say('ooh'); } }
        else { setMood('idle'); say('paste a link'); }
    });

    catEl.addEventListener('click', () => {
        if (busy) return;
        sfx.purr();
        setMood('purr');
        say(pick(['*purr*', 'mrrp', 'again', 'more of that']));
        setTimeout(() => { if (!busy && mood === 'purr') setMood(urlInput.value.trim() ? 'sniff' : 'idle'); }, 1800);
    });

    window.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (busy) { void stop(); return; }
        if (urlInput.value) { urlInput.value = ''; setMood('idle'); say('cleared'); }
    });

    /* idle behaviour: blink, chatter, and eventually doze off */
    let lastPoke = Date.now();
    ['pointerdown', 'keydown'].forEach(ev =>
        document.addEventListener(ev, () => { lastPoke = Date.now(); }, { passive: true }));

    setInterval(() => {
        if (busy || mood !== 'idle') return;
        const [e, m] = BLINK;
        draw(e, m);
        setTimeout(() => { if (!busy && mood === 'idle') setMood('idle'); }, 160);
    }, 5200);

    setInterval(() => {
        if (busy) return;
        const idleFor = (Date.now() - lastPoke) / 1000;
        if (idleFor > 90 && mood === 'idle') { setMood('sleep'); say('zzz'); return; }
        if (mood === 'idle' && chance(0.4)) say(pick(IDLE_TALK));
    }, 9000);

    /* ══ BOOT ═════════════════════════════════════════════════════════════════ */

    paintFlags();
    setMood('idle');
    say('paste a link');
    log('info', 'ready', 'allkitty is listening');
    void health();
    void loadHistory();
    setInterval(() => { if (!busy) void health(); }, 20000);
})();
