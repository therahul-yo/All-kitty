/* ══════════════════════════════════════════════════════════════════════════
   ALLKITTY POCKET — handheld firmware.

   Compiled standalone (tsc --outFile), so this file is one script, no modules.
   Layout:  helpers ▸ audio ▸ sprites ▸ scene ▸ views ▸ input ▸ api ▸ boot
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
    'use strict';

    /* ── helpers ──────────────────────────────────────────────────────────── */

    const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
    const clamp = (n: number, lo: number, hi: number) => n < lo ? lo : n > hi ? hi : n;
    const pick = <T>(a: T[]): T => a[(Math.random() * a.length) | 0];
    const chance = (p: number) => Math.random() < p;

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ── persisted settings ───────────────────────────────────────────────── */

    type Diet = 'video' | 'audio';
    type Shell = 'dmg' | 'grape' | 'pika' | 'noir';
    type Screen = 'green' | 'pocket' | 'aqua' | 'candy';

    interface Settings {
        diet: Diet;
        quality: string;
        codec: string;
        silent: boolean;
        sfx: boolean;
        bgm: boolean;
        vol: number;        /* 0..10 */
        contrast: number;   /* 0..10 */
        shell: Shell;
        screen: Screen;
        color: boolean;     /* colour sprites instead of 4-shade mono */
    }

    const DEFAULTS: Settings = {
        diet: 'video', quality: '1080', codec: 'h264', silent: false,
        sfx: true, bgm: false, vol: 6, contrast: 5,
        shell: 'dmg', screen: 'green', color: false,
    };

    const STORE = 'allkitty.pocket';
    const cfg: Settings = (() => {
        try {
            const raw = localStorage.getItem(STORE);
            return raw ? { ...DEFAULTS, ...JSON.parse(raw) } as Settings : { ...DEFAULTS };
        } catch { return { ...DEFAULTS }; }
    })();
    const saveCfg = () => { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* private mode */ } };

    /* ── dom ──────────────────────────────────────────────────────────────── */

    const lcdDark = $<HTMLDivElement>('lcdDark');
    const gfx = $<HTMLCanvasElement>('gfx');
    const ctx = gfx.getContext('2d') as CanvasRenderingContext2D;
    const powerLed = $<HTMLSpanElement>('powerLed');
    const powerBtn = $<HTMLButtonElement>('powerBtn');
    const cart = $<HTMLDivElement>('cart');
    const cartBtn = $<HTMLButtonElement>('cartBtn');
    const volKnob = $<HTMLDivElement>('volKnob');
    const conKnob = $<HTMLDivElement>('conKnob');

    const hudHearts = $<HTMLSpanElement>('hudHearts');
    const hudState = $<HTMLSpanElement>('hudState');
    const bubble = $<HTMLDivElement>('bubble');
    const bubbleText = $<HTMLSpanElement>('bubbleText');
    const urlInput = $<HTMLInputElement>('urlInput');
    const pasteBtn = $<HTMLButtonElement>('pasteBtn');
    const pbarFill = $<HTMLSpanElement>('pbarFill');
    const pbarNum = $<HTMLSpanElement>('pbarNum');
    const hint = $<HTMLDivElement>('hint');
    const menuList = $<HTMLUListElement>('menuList');
    const logList = $<HTMLUListElement>('logList');
    const osd = $<HTMLDivElement>('osd');
    const osdText = $<HTMLSpanElement>('osdText');
    const scrToast = $<HTMLDivElement>('scrToast');
    const srStatus = $<HTMLDivElement>('srStatus');
    const btnA = $<HTMLButtonElement>('btnA');
    const btnB = $<HTMLButtonElement>('btnB');
    const btnStart = $<HTMLButtonElement>('btnStart');
    const btnSelect = $<HTMLButtonElement>('btnSelect');
    const dpadPlate = $<HTMLDivElement>('dpadPlate');
    const views: Record<string, HTMLElement> = {};
    document.querySelectorAll<HTMLElement>('.view').forEach(v => { views[v.dataset.view as string] = v; });

    /* ══ AUDIO ════════════════════════════════════════════════════════════════
       A tiny square/triangle/noise synth pushed through a "cheap speaker"
       filter chain, so it sounds like it is coming out of the plastic.        */

    let ac: AudioContext | null = null;
    let master: GainNode | null = null;

    const audioReady = (): boolean => {
        if (!cfg.sfx) return false;
        if (!ac) {
            const Ctor: typeof AudioContext | undefined =
                (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!Ctor) return false;
            ac = new Ctor();
            master = ac.createGain();
            const hp = ac.createBiquadFilter();
            hp.type = 'highpass'; hp.frequency.value = 340;
            const lp = ac.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 6200;
            master.connect(hp).connect(lp).connect(ac.destination);
            master.gain.value = cfg.vol / 10 * 0.6;
        }
        if (ac.state === 'suspended') void ac.resume();
        return true;
    };

    const setVolume = () => { if (master) master.gain.value = cfg.vol / 10 * 0.6; };

    interface Blip {
        f: number; to?: number; d?: number; v?: number;
        type?: OscillatorType; at?: number; slide?: 'exp' | 'lin';
    }

    const tone = (o: Blip) => {
        if (!audioReady() || !ac || !master) return;
        const t0 = ac.currentTime + (o.at || 0);
        const d = o.d ?? 0.09;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = o.type || 'square';
        osc.frequency.setValueAtTime(o.f, t0);
        if (o.to !== undefined) {
            if (o.slide === 'lin') osc.frequency.linearRampToValueAtTime(Math.max(1, o.to), t0 + d);
            else osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + d);
        }
        const v = o.v ?? 0.09;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(v, t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        osc.connect(g).connect(master);
        osc.start(t0);
        osc.stop(t0 + d + 0.03);
    };

    let noiseBuf: AudioBuffer | null = null;
    const noise = (d = 0.08, v = 0.06, freq = 1400, at = 0) => {
        if (!audioReady() || !ac || !master) return;
        if (!noiseBuf) {
            noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
            const ch = noiseBuf.getChannelData(0);
            for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
        }
        const t0 = ac.currentTime + at;
        const src = ac.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.9;
        const g = ac.createGain();
        g.gain.setValueAtTime(v, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
        src.connect(bp).connect(g).connect(master);
        src.start(t0);
        src.stop(t0 + d + 0.02);
    };

    const sfx = {
        tick:    () => tone({ f: 1500, d: 0.02, v: 0.045 }),
        click:   () => { tone({ f: 900, to: 1300, d: 0.045, v: 0.07 }); },
        move:    () => tone({ f: 1180, d: 0.03, v: 0.05 }),
        accept:  () => { tone({ f: 880, d: 0.05, v: 0.08 }); tone({ f: 1320, d: 0.08, v: 0.07, at: 0.05 }); },
        back:    () => { tone({ f: 660, to: 380, d: 0.09, v: 0.07 }); },
        type:    () => tone({ f: 2000 + Math.random() * 400, d: 0.012, v: 0.028 }),
        boot:    () => {
            tone({ f: 523.25, d: 0.11, v: 0.09, type: 'square' });
            tone({ f: 783.99, d: 0.11, v: 0.09, type: 'square', at: 0.12 });
            tone({ f: 1046.5, d: 0.34, v: 0.1, type: 'square', at: 0.24 });
            tone({ f: 1567.98, d: 0.5, v: 0.05, type: 'triangle', at: 0.24 });
            noise(0.3, 0.02, 2600, 0.24);
        },
        off:     () => { tone({ f: 700, to: 60, d: 0.4, v: 0.09, type: 'triangle' }); noise(0.35, 0.03, 700); },
        munch:   () => { tone({ f: 190, to: 120, d: 0.055, v: 0.05, type: 'sawtooth' }); noise(0.04, 0.03, 900); },
        gulp:    () => tone({ f: 420, to: 180, d: 0.12, v: 0.07, type: 'sine' }),
        plop:    () => {
            tone({ f: 760, to: 90, d: 0.3, v: 0.12, type: 'sine' });
            tone({ f: 210, to: 60, d: 0.18, v: 0.06, at: 0.04 });
            noise(0.12, 0.05, 500, 0.02);
        },
        fanfare: () => {
            const n = [659.25, 783.99, 987.77, 1318.51];
            n.forEach((f, i) => tone({ f, d: i === 3 ? 0.42 : 0.11, v: 0.09, at: i * 0.09 }));
            tone({ f: 329.63, d: 0.6, v: 0.05, type: 'triangle', at: 0.27 });
        },
        error:   () => {
            tone({ f: 240, to: 110, d: 0.2, v: 0.1 });
            tone({ f: 170, to: 70, d: 0.26, v: 0.08, at: 0.11 });
        },
        purr:    () => { tone({ f: 70, to: 110, d: 0.45, v: 0.09, type: 'triangle' }); noise(0.4, 0.015, 260); },
        meow:    () => { tone({ f: 620, to: 900, d: 0.12, v: 0.07, type: 'sawtooth' }); tone({ f: 880, to: 520, d: 0.2, v: 0.06, type: 'sawtooth', at: 0.11 }); },
        cart:    () => { noise(0.18, 0.06, 1800); tone({ f: 150, d: 0.08, v: 0.09, at: 0.14, type: 'square' }); },
        knob:    () => tone({ f: 2400, d: 0.012, v: 0.03 }),
    };

    /* ── background chiptune (opt-in) ─────────────────────────────────────── */

    const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const LEAD = [
        72, 0, 76, 0, 79, 0, 76, 0, 74, 0, 77, 0, 81, 0, 79, 0,
        72, 0, 76, 0, 79, 0, 84, 0, 83, 0, 79, 0, 76, 0, 0, 0,
    ];
    const BASS = [
        48, 0, 0, 0, 55, 0, 0, 0, 53, 0, 0, 0, 57, 0, 0, 0,
        48, 0, 0, 0, 55, 0, 0, 0, 53, 0, 0, 0, 52, 0, 0, 0,
    ];
    let bgmStep = 0;
    let bgmNext = 0;
    let bgmTimer = 0;

    const bgmTick = () => {
        if (!ac || !master || !cfg.bgm || !cfg.sfx) return;
        const spb = 60 / 128 / 2;                       /* eighth notes at 128bpm */
        while (bgmNext < ac.currentTime + 0.18) {
            const at = Math.max(0, bgmNext - ac.currentTime);
            const l = LEAD[bgmStep % LEAD.length];
            const b = BASS[bgmStep % BASS.length];
            if (l) tone({ f: NOTE(l), d: spb * 0.85, v: 0.028, type: 'square', at });
            if (b) tone({ f: NOTE(b), d: spb * 1.6, v: 0.045, type: 'triangle', at });
            if (bgmStep % 2 === 1) noise(0.02, 0.012, 6000, at);
            bgmStep++;
            bgmNext += spb;
        }
    };

    const startBgm = () => {
        if (!cfg.bgm || !audioReady() || !ac) return;
        stopBgm();
        bgmStep = 0;
        bgmNext = ac.currentTime + 0.1;
        bgmTimer = window.setInterval(bgmTick, 60);
    };
    const stopBgm = () => { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = 0; } };

    /* ══ SPRITES ═══════════════════════════════════════════════════════════ */

    const CAT_IDLE: string[] = [
        '..........00............00..........',
        '.........0220..........0220.........',
        '........02pp20........02pp20........',
        '.......022pp220000000022pp220.......',
        '......022222222222222222222220......',
        '.....02233332222222222222222220.....',
        '.....02222222112211221122222220.....',
        '.....02222000222222222200022220.....',
        '.....02220wwe0222222220wwe02220.....',
        '.....02220eee0222222220eee02220.....',
        '.....02222000222222222200022220.....',
        '.....02222222333pppp33322222220.....',
        '.....020222223333pp333322222020.....',
        '.....02022223333033033332222020.....',
        '.....02222233333333333333222220.....',
        '......022222333333333333222220......',
        '.......0000022222222222200000.......',
        '..........0222222222222220..........',
        '.........022223333333322220.........',
        '.........012223333333322210.........',
        '.........022223333333322220...0220..',
        '.........012223333333322210..02210..',
        '.........022223333333322220.02210...',
        '.........01222333333332221002210....',
        '.........02222333333332222022210....',
        '........01222333333333322210220.....',
        '........02222333333333322220220.....',
        '.......01222333333333333222100......',
        '.......0223333333003333333220.......',
        '.......0223333333003333333220.......',
        '.......0111333333003333331110.......',
        '.......0000000000000000000000.......',
    ];
    const CAT_BLINK: string[] = [
        '..........00............00..........',
        '.........0220..........0220.........',
        '........02pp20........02pp20........',
        '.......022pp220000000022pp220.......',
        '......022222222222222222222220......',
        '.....02233332222222222222222220.....',
        '.....02222222112211221122222220.....',
        '.....02222222222222222222222220.....',
        '.....02222000002222220000022220.....',
        '.....02222200022222222000222220.....',
        '.....02222222222222222222222220.....',
        '.....02222222333pppp33322222220.....',
        '.....020222223333pp333322222020.....',
        '.....02022223333033033332222020.....',
        '.....02222233333333333333222220.....',
        '......022222333333333333222220......',
        '.......0000022222222222200000.......',
        '..........0222222222222220..........',
        '.........022223333333322220.........',
        '.........012223333333322210.........',
        '.........022223333333322220...0220..',
        '.........012223333333322210..02210..',
        '.........022223333333322220.02210...',
        '.........01222333333332221002210....',
        '.........02222333333332222022210....',
        '........01222333333333322210220.....',
        '........02222333333333322220220.....',
        '.......01222333333333333222100......',
        '.......0223333333003333333220.......',
        '.......0223333333003333333220.......',
        '.......0111333333003333331110.......',
        '.......0000000000000000000000.......',
    ];
    const CAT_HAPPY: string[] = [
        '..........00............00..........',
        '.........0220..........0220.........',
        '........02pp20........02pp20........',
        '.......022pp220000000022pp220.......',
        '......022222222222222222222220......',
        '.....02233332222222222222222220.....',
        '.....02222222112211221122222220.....',
        '.....02222222222222222222222220.....',
        '.....02222220222222222202222220.....',
        '.....02222202022222222020222220.....',
        '.....02222022202222220222022220.....',
        '.....02222222333pppp33322222220.....',
        '.....020222223333pp333322222020.....',
        '.....020222233333pp333332222020.....',
        '.....022222333333pp333333222220.....',
        '......022222333333333333222220......',
        '.......0000022222222222200000.......',
        '..........0222222222222220..........',
        '.........022223333333322220.........',
        '.........012223333333322210.........',
        '.........022223333333322220...0220..',
        '.........012223333333322210..02210..',
        '.........022223333333322220.02210...',
        '.........01222333333332221002210....',
        '.........02222333333332222022210....',
        '........01222333333333322210220.....',
        '........02222333333333322220220.....',
        '.......01222333333333333222100......',
        '.......0223333333003333333220.......',
        '.......0223333333003333333220.......',
        '.......0111333333003333331110.......',
        '.......0000000000000000000000.......',
    ];
    const CAT_SAD: string[] = [
        '..........00............00..........',
        '.........0220..........0220.........',
        '........02pp20........02pp20........',
        '.......022pp220000000022pp220.......',
        '......022222222222222222222220......',
        '.....02233332222222222222222220.....',
        '.....02222211122222222111222220.....',
        '.....02222002222222222220022220.....',
        '.....02220eew0222222220wee02220.....',
        '.....02220eee0222222220eee02220.....',
        '.....02222200022222222000222220.....',
        '.....02222222333pppp33322222220.....',
        '.....020222223333pp333322222020.....',
        '.....02022223333033033332222020.....',
        '.....02222233333333333333222220.....',
        '......022222333333333333222220......',
        '.......0000022222222222200000.......',
        '..........0222222222222220..........',
        '.........022223333333322220.........',
        '.........012223333333322210.........',
        '.........022223333333322220...0220..',
        '.........012223333333322210..02210..',
        '.........022223333333322220.02210...',
        '.........01222333333332221002210....',
        '.........02222333333332222022210....',
        '........01222333333333322210220.....',
        '........02222333333333322220220.....',
        '.......01222333333333333222100......',
        '.......0223333333003333333220.......',
        '.......0223333333003333333220.......',
        '.......0111333333003333331110.......',
        '.......0000000000000000000000.......',
    ];
    const CAT_HUNGRY: string[] = [
        '..........00............00..........',
        '.........0220..........0220.........',
        '........02pp20........02pp20........',
        '.......022pp220000000022pp220.......',
        '......022222222222222222222220......',
        '.....02233332222222222222222220.....',
        '.....02222222112211221122222220.....',
        '.....02222000002222220000022220.....',
        '.....02220wwee02222220wwee02220.....',
        '.....02220eeee02222220eeee02220.....',
        '.....02220ewee02222220ewee02220.....',
        '.....02222222333pppp33322222220.....',
        '.....020222223333pp333322222020.....',
        '.....020222233333pp333332222020.....',
        '.....022222333333pp333333222220.....',
        '......022222333333333333222220......',
        '.......0000022222222222200000.......',
        '..........0222222222222220..........',
        '.........022223333333322220.........',
        '.........012223333333322210.........',
        '.........022223333333322220...0220..',
        '.........012223333333322210..02210..',
        '.........022223333333322220.02210...',
        '.........01222333333332221002210....',
        '.........02222333333332222022210....',
        '........01222333333333322210220.....',
        '........02222333333333322220220.....',
        '.......01222333333333333222100......',
        '.......0223333333003333333220.......',
        '.......0223333333003333333220.......',
        '.......0111333333003333331110.......',
        '.......0000000000000000000000.......',
    ];
    const CAT_MUNCH: string[] = [
        '..........00............00..........',
        '.........0220..........0220.........',
        '........02pp20........02pp20........',
        '.......022pp220000000022pp220.......',
        '......022222222222222222222220......',
        '.....02233332222222222222222220.....',
        '.....02222222112211221122222220.....',
        '.....02222222222222222222222220.....',
        '.....02222000002222220000022220.....',
        '.....02222200022222222000222220.....',
        '.....02222222222222222222222220.....',
        '.....02222222333pppp33322222220.....',
        '.....02022222333000033322222020.....',
        '.....0202222330pppppp0332222020.....',
        '.....02222223300000000332222220.....',
        '......022222333333333333222220......',
        '.......0000022222222222200000.......',
        '..........0222222222222220..........',
        '.........022223333333322220.........',
        '.........012223333333322210.........',
        '.........022223333333322220...0220..',
        '.........012223333333322210..02210..',
        '.........022223333333322220.02210...',
        '.........01222333333332221002210....',
        '.........02222333333332222022210....',
        '........01222333333333322210220.....',
        '........02222333333333322220220.....',
        '.......01222333333333333222100......',
        '.......0223333333003333333220.......',
        '.......0223333333003333333220.......',
        '.......0111333333003333331110.......',
        '.......0000000000000000000000.......',
    ];

    const SPR_POOP = [
        '....00....', '...0110...', '..011110..', '.01122110.', '.01222210.',
        '0112222110', '0122222210', '0111111110', '.00000000.',
    ];
    const SPR_FILE = ['.0000.', '.03000', '.03330', '.03330', '.03330', '.03330', '.00000'];
    const SPR_HEART = ['.00.00.', '0330330', '0333330', '.03330.', '..030..', '...0...'];
    const SPR_STAR = ['..0..', '.030.', '03330', '.030.', '..0..'];
    const SPR_ZZZ = ['00000', '...0.', '..0..', '.0...', '00000'];
    const SPR_BOWL = ['.000000000000.', '.033333333330.', '.001111111100.', '..0111111110..', '...00000000...'];

    type Pal = Record<string, string | null>;

    const SCREENS: Record<Screen, [string, string, string, string]> = {
        green:  ['#081820', '#346856', '#88c070', '#e0f8d0'],
        pocket: ['#0f0f10', '#4c4c48', '#9c9c92', '#dcdcd0'],
        aqua:   ['#04202b', '#0d5f79', '#2eaec9', '#c2f4ff'],
        candy:  ['#2a0824', '#7d2f5d', '#dc74a2', '#ffe1ef'],
    };

    let S: [string, string, string, string] = SCREENS.green;
    let palCat: Pal = {};
    let palPoop: Pal = {};
    let palUi: Pal = {};
    let palHeart: Pal = {};

    const buildPalettes = () => {
        S = SCREENS[cfg.screen] || SCREENS.green;
        const [s0, s1, s2, s3] = S;
        if (cfg.color) {
            palCat = { '.': null, '0': '#2a1000', '1': '#c4560a', '2': '#ff9d3c', '3': '#ffe6c4', p: '#ff6f9c', e: '#140600', w: '#ffffff' };
            palPoop = { '.': null, '0': '#241203', '1': '#6b3a1a', '2': '#a3641f' };
            palHeart = { '.': null, '0': '#8c1440', '3': '#ff6f9c' };
        } else {
            palCat = { '.': null, '0': s0, '1': s1, '2': s2, '3': s3, p: s1, e: s0, w: s3 };
            palPoop = { '.': null, '0': s0, '1': s1, '2': s2 };
            palHeart = { '.': null, '0': s0, '3': s2 };
        }
        palUi = { '.': null, '0': s0, '1': s1, '2': s2, '3': s3 };
    };

    /* draw a char-grid sprite, batching horizontal runs of one colour */
    const blit = (rows: string[], x: number, y: number, scale: number, pal: Pal) => {
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            let c = 0;
            while (c < row.length) {
                const ch = row[c];
                let run = 1;
                while (c + run < row.length && row[c + run] === ch) run++;
                const col = pal[ch];
                if (col) {
                    ctx.fillStyle = col;
                    ctx.fillRect(x + c * scale, y + r * scale, run * scale, scale);
                }
                c += run;
            }
        }
    };

    /* ══ SCENE ═════════════════════════════════════════════════════════════ */

    const VW = 160, VH = 144;
    const FLOOR = 98;
    /* 36x32 sprite at 2x — finer pixels than the old 26x22 at 3x, same presence */
    const CAT_SC = 2;
    const CAT_W = 36 * CAT_SC, CAT_H = 32 * CAT_SC;
    const CAT_X = (VW - CAT_W) >> 1;
    const CAT_Y = FLOOR - CAT_H;
    const MOUTH_X = CAT_X + CAT_W / 2, MOUTH_Y = CAT_Y + 13 * CAT_SC;

    type Mood = 'idle' | 'sniff' | 'munch' | 'squat' | 'happy' | 'sad' | 'sleep' | 'pet' | 'hungry';

    interface Particle {
        kind: 'heart' | 'star' | 'zzz' | 'file' | 'poop';
        x: number; y: number; vx: number; vy: number; life: number; max: number;
    }

    let mood: Mood = 'idle';
    let frame = 0;
    let blinkUntil = 0;
    let nextBlink = 60;
    let shake = 0;
    let hunger = 4;
    let lastPoke = Date.now();
    const parts: Particle[] = [];
    const poops: { x: number; y: number; vy: number; landed: boolean }[] = [];

    const spawn = (p: Particle) => { parts.push(p); if (parts.length > 40) parts.shift(); };

    const hearts = (n: number) => {
        for (let i = 0; i < n; i++) {
            spawn({
                kind: 'heart', x: MOUTH_X - 12 + Math.random() * 24, y: CAT_Y + 6,
                vx: (Math.random() - 0.5) * 0.4, vy: -0.55 - Math.random() * 0.25,
                life: 0, max: 42 + i * 6,
            });
        }
    };
    const sparkles = (n: number) => {
        for (let i = 0; i < n; i++) {
            spawn({
                kind: 'star', x: CAT_X + Math.random() * CAT_W, y: CAT_Y + Math.random() * CAT_H,
                vx: 0, vy: -0.2, life: 0, max: 26,
            });
        }
    };

    const catFrame = (): string[] => {
        switch (mood) {
            case 'munch': return (frame >> 2) % 2 ? CAT_MUNCH : CAT_IDLE;
            case 'squat': return CAT_BLINK;
            case 'happy': return CAT_HAPPY;
            case 'pet':   return CAT_HAPPY;
            case 'sad':   return CAT_SAD;
            case 'sleep': return CAT_BLINK;
            case 'hungry': return CAT_HUNGRY;
            case 'sniff': return CAT_HUNGRY;
            default:      return frame < blinkUntil ? CAT_BLINK : CAT_IDLE;
        }
    };

    const drawScene = () => {
        const [s0, s1, s2, s3] = S;

        ctx.fillStyle = s3;
        ctx.fillRect(0, 0, VW, VH);

        /* wall texture — a fixed sparse dither so it never crawls */
        ctx.fillStyle = s2;
        for (let y = 14; y < FLOOR; y += 8) {
            for (let x = ((y / 8) % 2) * 4 + 2; x < VW; x += 8) ctx.fillRect(x, y, 1, 1);
        }

        /* floor: a light board with a hard top edge, not a heavy slab */
        ctx.fillStyle = s2;
        ctx.fillRect(0, FLOOR, VW, VH - FLOOR);
        ctx.fillStyle = s0;
        ctx.fillRect(0, FLOOR, VW, 1);
        ctx.fillStyle = s1;
        for (let y = FLOOR + 4; y < VH; y += 5) {
            for (let x = ((y / 5) | 0) % 2 ? 3 : 0; x < VW; x += 6) ctx.fillRect(x, y, 3, 1);
        }

        /* contact shadow so the cat sits on the floor instead of hovering */
        ctx.fillStyle = s1;
        ctx.fillRect(CAT_X + 8, FLOOR - 2, CAT_W - 16, 2);
        ctx.fillRect(CAT_X + 3, FLOOR - 1, CAT_W - 6, 1);

        /* food bowl, left of the cat */
        blit(SPR_BOWL, 6, FLOOR - 10, 2, palUi);

        /* landed poops */
        for (const p of poops) blit(SPR_POOP, p.x | 0, p.y | 0, 2, palPoop);

        /* the cat */
        const bob = mood === 'sleep' ? ((frame >> 4) % 2)
            : mood === 'happy' ? (((frame >> 1) % 2) * -2)
            : ((frame >> 3) % 2);
        const sx = shake > 0 ? (frame % 2 ? -1 : 1) : 0;
        blit(catFrame(), CAT_X + sx, CAT_Y + bob, CAT_SC, palCat);

        /* particles */
        for (const p of parts) {
            const x = p.x | 0, y = p.y | 0;
            if (p.kind === 'heart') blit(SPR_HEART, x, y, 1, palHeart);
            else if (p.kind === 'star') blit(SPR_STAR, x, y, 1, palUi);
            else if (p.kind === 'file') blit(SPR_FILE, x, y, 1, palUi);
            else if (p.kind === 'zzz') blit(SPR_ZZZ, x, y, 1, palUi);
        }
    };

    const stepScene = () => {
        frame++;
        if (shake > 0) shake--;

        if (mood === 'idle' && frame > nextBlink) {
            blinkUntil = frame + 5;
            nextBlink = frame + 70 + ((Math.random() * 90) | 0);
        }
        if (mood === 'sleep' && frame % 40 === 0) {
            spawn({ kind: 'zzz', x: MOUTH_X + 16, y: CAT_Y + 12, vx: 0.22, vy: -0.3, life: 0, max: 60 });
        }
        if (mood === 'munch' && frame % 10 === 0) sfx.munch();
        if (mood === 'happy' && frame % 12 === 0) sparkles(1);

        for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            p.x += p.vx; p.y += p.vy; p.life++;
            if (p.kind === 'file') {
                /* home in on the mouth */
                const dx = MOUTH_X - p.x, dy = MOUTH_Y - p.y;
                const d = Math.hypot(dx, dy) || 1;
                p.x += dx / d * 1.6; p.y += dy / d * 1.6;
                if (d < 5) { parts.splice(i, 1); sfx.gulp(); continue; }
            }
            if (p.life > p.max) parts.splice(i, 1);
        }

        for (const p of poops) {
            if (p.landed) continue;
            p.vy += 0.45;
            p.y += p.vy;
            if (p.y >= FLOOR - 18) { p.y = FLOOR - 18; p.landed = true; sfx.plop(); shake = 6; }
        }
    };

    /* ══ VIEWS ═════════════════════════════════════════════════════════════ */

    type ViewName = 'boot' | 'home' | 'menu' | 'log' | 'info';
    let view: ViewName = 'boot';

    const setView = (v: ViewName) => {
        view = v;
        for (const k in views) {
            const on = k === v;
            views[k].classList.toggle('is-active', on);
            views[k].setAttribute('aria-hidden', on ? 'false' : 'true');
        }
        if (v === 'menu') renderMenu();
        if (v === 'log') { renderLog(); void fetchHistory(); }
    };

    /* The cat's speech bubble and the system toast share the top of the screen,
       so only one of them is ever on stage. */
    let sayTimer = 0;
    let toastTimer = 0;

    const hush = () => bubble.classList.remove('is-open');

    const say = (msg: string, ttl = 2600) => {
        scrToast.classList.remove('is-open');
        bubbleText.textContent = msg;
        bubble.classList.add('is-open');
        clearTimeout(sayTimer);
        if (ttl > 0) sayTimer = window.setTimeout(() => bubble.classList.remove('is-open'), ttl);
    };

    const toast = (msg: string) => {
        hush();
        scrToast.textContent = msg;
        scrToast.classList.add('is-open');
        srStatus.textContent = msg;
        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => scrToast.classList.remove('is-open'), 2400);
    };

    let osdTimer = 0;
    const showOsd = (msg: string) => {
        osdText.textContent = msg;
        osd.classList.add('is-open');
        clearTimeout(osdTimer);
        osdTimer = window.setTimeout(() => osd.classList.remove('is-open'), 900);
    };

    const setHunger = (n: number) => {
        hunger = clamp(n, 0, 4);
        hudHearts.textContent = '[' + '#'.repeat(hunger) + '-'.repeat(4 - hunger) + ']';
    };

    const setState = (label: string) => { hudState.textContent = label; };

    const setMood = (m: Mood) => {
        mood = m;
        setState(m.toUpperCase());
        /* a timer left over from before shutdown must not relight the LED */
        if (!powered) return;
        powerLed.dataset.state =
            m === 'munch' || m === 'squat' ? 'busy'
            : m === 'hungry' || m === 'sad' ? 'low' : 'on';
    };

    const restMood = (): Mood =>
        urlInput.value.trim() ? 'sniff' : hunger <= 1 ? 'hungry' : 'idle';

    /* ── settings menu ────────────────────────────────────────────────────── */

    interface Row {
        key: string;
        val: () => string;
        step?: (dir: number) => void;
        act?: () => void;
    }

    const cycle = <T>(list: T[], cur: T, dir: number): T => {
        const i = list.indexOf(cur);
        return list[(i + dir + list.length) % list.length];
    };

    const bar = (n: number) => '|'.repeat(n) + '.'.repeat(10 - n);

    const ROWS: Row[] = [
        { key: 'DIET', val: () => cfg.diet.toUpperCase(), step: d => { cfg.diet = cycle<Diet>(['video', 'audio'], cfg.diet, d); } },
        { key: 'SIZE', val: () => cfg.quality === 'max' ? 'MAX' : cfg.quality + 'P', step: d => { cfg.quality = cycle(['1080', '1440', '2160', 'max'], cfg.quality, d); } },
        { key: 'CODEC', val: () => cfg.codec.toUpperCase(), step: d => { cfg.codec = cycle(['h264', 'av1', 'vp9'], cfg.codec, d); } },
        { key: 'SILENT', val: () => cfg.silent ? 'ON' : 'OFF', step: () => { cfg.silent = !cfg.silent; } },
        { key: 'SFX', val: () => cfg.sfx ? 'ON' : 'OFF', step: () => { cfg.sfx = !cfg.sfx; if (!cfg.sfx) stopBgm(); else startBgm(); } },
        { key: 'BGM', val: () => cfg.bgm ? 'ON' : 'OFF', step: () => { cfg.bgm = !cfg.bgm; if (cfg.bgm) startBgm(); else stopBgm(); } },
        { key: 'VOL', val: () => bar(cfg.vol), step: d => { cfg.vol = clamp(cfg.vol + d, 0, 10); setVolume(); } },
        { key: 'LIGHT', val: () => bar(cfg.contrast), step: d => { cfg.contrast = clamp(cfg.contrast + d, 0, 10); applyContrast(); } },
        { key: 'SHELL', val: () => cfg.shell.toUpperCase(), step: d => { cfg.shell = cycle<Shell>(['dmg', 'grape', 'pika', 'noir'], cfg.shell, d); applyShell(); } },
        { key: 'SCREEN', val: () => cfg.screen.toUpperCase(), step: d => { cfg.screen = cycle<Screen>(['green', 'pocket', 'aqua', 'candy'], cfg.screen, d); applyScreen(); } },
        { key: 'FUR', val: () => cfg.color ? 'COLOR' : 'MONO', step: () => { cfg.color = !cfg.color; buildPalettes(); } },
        { key: 'ABOUT', val: () => '>', act: () => setView('info') },
    ];

    const PAGE = 8;
    let menuSel = 0;
    let menuTop = 0;

    const renderMenu = () => {
        menuTop = clamp(menuTop, Math.max(0, menuSel - PAGE + 1), menuSel);
        menuList.textContent = '';
        for (let i = menuTop; i < Math.min(ROWS.length, menuTop + PAGE); i++) {
            const row = ROWS[i];
            const li = document.createElement('li');
            li.className = i === menuSel ? 'is-sel' : '';
            const k = document.createElement('span');
            k.className = 'menu-key';
            k.textContent = row.key;
            const v = document.createElement('span');
            v.className = 'menu-val';
            v.textContent = row.val();
            li.append(k, v);
            li.addEventListener('click', () => { menuSel = i; sfx.move(); renderMenu(); });
            menuList.appendChild(li);
        }
    };

    /* ── history log ──────────────────────────────────────────────────────── */

    interface HistoryItem {
        id: string; url: string; format: string; filename: string;
        status: string; created_at: string; file_size: number;
    }

    let history: HistoryItem[] = [];
    let logSel = 0;
    let logTop = 0;

    const renderLog = () => {
        logList.textContent = '';
        if (!history.length) {
            const li = document.createElement('li');
            li.className = 'log-empty';
            li.textContent = 'THE LITTER BOX IS CLEAN.';
            logList.appendChild(li);
            return;
        }
        logSel = clamp(logSel, 0, history.length - 1);
        logTop = clamp(logTop, Math.max(0, logSel - 5), logSel);
        for (let i = logTop; i < Math.min(history.length, logTop + 6); i++) {
            const it = history[i];
            const li = document.createElement('li');
            li.className = i === logSel ? 'is-sel' : '';
            const top = document.createElement('div');
            top.className = 'log-top';
            const when = document.createElement('span');
            const d = new Date(it.created_at);
            when.textContent = isNaN(d.getTime()) ? '--' : d.toLocaleDateString();
            const st = document.createElement('span');
            st.textContent = (it.status || '').toUpperCase();
            top.append(when, st);
            const name = document.createElement('div');
            name.className = 'log-name';
            name.textContent = it.filename || it.url || '(unknown)';
            li.append(top, name);
            li.addEventListener('click', () => { logSel = i; sfx.move(); renderLog(); });
            logList.appendChild(li);
        }
    };

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/history?limit=20');
            const data = await res.json();
            history = Array.isArray(data) ? data : [];
        } catch { history = []; }
        renderLog();
    };

    /* ── theming ──────────────────────────────────────────────────────────── */

    const applyShell = () => { document.body.dataset.shell = cfg.shell; };
    const applyScreen = () => { document.body.dataset.screen = cfg.screen; buildPalettes(); };
    const applyContrast = () => {
        document.documentElement.style.setProperty('--contrast', String(0.75 + cfg.contrast * 0.07));
        conKnob.setAttribute('aria-valuenow', String(cfg.contrast));
    };

    /* ══ POWER ═════════════════════════════════════════════════════════════ */

    let powered = false;
    let bootTimer = 0;

    const powerOn = () => {
        if (powered) return;
        powered = true;
        document.body.dataset.power = 'on';
        powerBtn.setAttribute('aria-checked', 'true');
        powerLed.dataset.state = 'on';
        lcdDark.classList.remove('is-collapsing');
        setView('boot');
        /* replay the logo drop on every power cycle */
        const mark = $<HTMLDivElement>('bootMark');
        mark.style.animation = 'none';
        void mark.offsetHeight;
        mark.style.animation = '';
        audioReady();
        sfx.boot();
        srStatus.textContent = 'Console on.';
        clearTimeout(bootTimer);
        bootTimer = window.setTimeout(() => {
            setView('home');
            setMood(restMood());
            say(pick(GREETING));
            startBgm();
        }, reduceMotion ? 200 : 1900);
    };

    const powerOff = () => {
        if (!powered) return;
        powered = false;
        stopPolling();
        stopBgm();
        sfx.off();
        document.body.dataset.power = 'off';
        powerBtn.setAttribute('aria-checked', 'false');
        powerLed.dataset.state = 'off';
        lcdDark.classList.add('is-collapsing');
        hush();
        srStatus.textContent = 'Console off.';
        clearTimeout(bootTimer);
    };

    const togglePower = () => (powered ? powerOff() : powerOn());

    /* ══ CAT CHATTER ═══════════════════════════════════════════════════════ */

    const GREETING = ['PASTE A LINK, HOOMAN', 'MROW?', 'FEED ME', 'BEEP MEOW', 'I AM AWAKE'];
    const IDLE_TALK = [
        'MROW?', '*LICKS PAW*', 'BLEP', '*TAIL FLICK*', 'I SEE YOU...', 'NYAAA',
        '*PURRS SOFTLY*', 'BRING ME A VIDEO', '*EAR FLICK*', 'NAP?', 'ATTENTION PLS',
        '*KNEADS AIR*', 'HOOMAN... ?', '*CHIRPS*', '*HEAD TILT*', 'I AM A GOOD CAT',
    ];
    const SNIFF_TALK = ['SNIFF SNIFF...', 'MMM A LINK', 'SMELLS LINKABLE', 'IS IT TASTY?', 'LEMME INSPECT'];
    const HUNGRY_TALK = ['FEED ME!!', 'STARVINGGG', '*MEOWS ANGRILY*', 'FOOD FOOD FOOD', '*PAWS AT SCREEN*'];
    const PET_TALK = ['*PURR*', 'MREOOW~', 'MORE PLEASE', 'AAA <3', 'BEST HOOMAN', '*NUZZLES*'];
    const SLEEP_TALK = ['ZZZ...', '*DREAMING*', 'MRRR...', '*TWITCHES PAW*'];
    const EAT_TALK = ['NOM NOM NOM', 'CHEWY', 'MMMF', '*CRUNCH*'];

    /* ══ DOWNLOAD ══════════════════════════════════════════════════════════ */

    const POLL_MS = 2000;
    let jobId: string | null = null;
    let pollId = 0;
    let packetId = 0;
    let busy = false;

    const setBar = (pct: number, label: string) => {
        pbarFill.style.width = clamp(pct, 0, 100) + '%';
        pbarNum.textContent = label;
    };

    const stopPolling = () => {
        if (pollId) { clearInterval(pollId); pollId = 0; }
        if (packetId) { clearInterval(packetId); packetId = 0; }
    };

    const idleUi = () => {
        busy = false;
        jobId = null;
        stopPolling();
        setBar(0, 'READY');
        setMood(restMood());
        hint.textContent = 'A FEED · START MENU · SELECT LOG';
    };

    const failUi = (msg: string) => {
        stopPolling();
        busy = false;
        jobId = null;
        sfx.error();
        setMood('sad');
        say('HAIRBALL...', 2200);
        toast(msg.slice(0, 90));
        setBar(0, 'FAILED');
        setHunger(Math.max(0, hunger - 1));
        setTimeout(() => { if (powered && !busy) idleUi(); }, 2400);
    };

    const finishUi = (result: { downloadUrl?: string; filename?: string } | null) => {
        stopPolling();
        setBar(100, 'DONE');
        setMood('squat');
        say('HERE IT COMES...', 1400);

        setTimeout(() => {
            if (powered) {
                poops.push({ x: VW - 38, y: FLOOR - 44, vy: 0, landed: false });
                if (poops.length > 3) poops.shift();
            }

            setTimeout(() => {
                /* the celebration is cosmetic — the file is handed over either way */
                if (powered) {
                    setMood('happy');
                    setHunger(4);
                    hearts(2);
                    sparkles(6);
                    sfx.fanfare();
                    say('DEPOSITED!', 2400);
                    toast('PLOP — YOUR FILE IS READY');
                }

                if (result && result.downloadUrl) {
                    const a = document.createElement('a');
                    a.href = result.downloadUrl;
                    a.download = result.filename || 'allkitty';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                }
                setTimeout(() => { if (powered) idleUi(); }, 2600);
            }, 780);
        }, 620);
    };

    const poll = () => {
        pollId = window.setInterval(async () => {
            if (!jobId) return;
            try {
                const res = await fetch('/api/queue/' + encodeURIComponent(jobId));
                if (!res.ok) throw new Error('lost');
                const job = await res.json();
                if (job.state === 'completed') { finishUi(job.result || null); }
                else if (job.state === 'failed') { failUi(job.failedReason || 'DOWNLOAD FAILED'); }
                else if (job.state === 'active') { setBar(70, 'CHEWING'); setState('MUNCH'); }
                else { setBar(30, 'IN QUEUE'); }
            } catch {
                failUi('LOST THE JOB');
            }
        }, POLL_MS);
    };

    const feed = async () => {
        if (busy) { toast('STILL CHEWING'); return; }
        const url = urlInput.value.trim();
        if (!url) {
            sfx.error();
            setMood('sad');
            say('FEED ME A LINK', 1800);
            setTimeout(() => { if (powered && !busy) setMood(restMood()); }, 1200);
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            sfx.error();
            toast('HTTP(S) LINKS ONLY');
            say('THAT IS NOT FOOD', 1800);
            return;
        }

        busy = true;
        setMood('munch');
        say(pick(EAT_TALK), 2600);
        setBar(12, 'SENDING');
        setHunger(3);
        hint.textContent = 'B CANCEL';

        /* packets stream into the cat's mouth while it works */
        packetId = window.setInterval(() => {
            spawn({ kind: 'file', x: VW + 4, y: 30 + Math.random() * 40, vx: -1.1, vy: 0, life: 0, max: 200 });
        }, 700);

        const format = cfg.diet === 'audio' ? 'audio' : cfg.silent ? 'mute' : 'video';

        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, format, quality: cfg.quality, codec: cfg.codec, container: 'auto' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) throw new Error(data.error || 'COULD NOT QUEUE');
            jobId = data.jobId;
            setBar(30, 'IN QUEUE');
            toast('IN THE QUEUE');
            poll();
        } catch (err: any) {
            failUi(String(err && err.message ? err.message : 'SERVER UNREACHABLE').toUpperCase());
        }
    };

    const cancel = async () => {
        if (!busy) return;
        const id = jobId;
        stopPolling();
        busy = false;
        jobId = null;
        sfx.back();
        say('MROW?', 1400);
        toast('STOPPED');
        idleUi();
        if (id) {
            try { await fetch('/api/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uuid: id }) }); }
            catch { /* the job may already be gone */ }
        }
    };

    /* ══ CONTROLS ══════════════════════════════════════════════════════════ */

    const pet = () => {
        if (!powered || busy) return;
        lastPoke = Date.now();
        sfx.purr();
        hearts(3);
        setMood('pet');
        say(pick(PET_TALK), 1500);
        setTimeout(() => { if (powered && mood === 'pet') setMood(restMood()); }, 1500);
    };

    const press = (el: HTMLElement) => {
        el.classList.add('is-down');
        setTimeout(() => el.classList.remove('is-down'), 90);
    };

    const onA = () => {
        if (!powered) { powerOn(); return; }
        press(btnA);
        if (view === 'menu') {
            const row = ROWS[menuSel];
            if (row.act) { sfx.accept(); row.act(); }
            else if (row.step) { sfx.accept(); row.step(1); saveCfg(); renderMenu(); }
            return;
        }
        if (view === 'log') {
            const it = history[logSel];
            sfx.accept();
            if (it && it.status === 'completed' && it.filename) {
                toast('RE-FEED THE LINK TO FETCH AGAIN');
            } else if (it) {
                urlInput.value = it.url;
                setView('home');
                setMood('sniff');
                say('GOT IT — PRESS A', 2200);
            }
            return;
        }
        if (view === 'info') { sfx.back(); setView('menu'); return; }
        sfx.accept();
        void feed();
    };

    const onB = () => {
        if (!powered) return;
        press(btnB);
        if (view === 'menu' || view === 'log' || view === 'info') { sfx.back(); setView('home'); return; }
        if (busy) { void cancel(); return; }
        sfx.back();
        if (urlInput.value) { urlInput.value = ''; setMood(restMood()); say('CLEARED', 1200); }
    };

    const onStart = () => {
        if (!powered) { powerOn(); return; }
        press(btnStart);
        sfx.click();
        setView(view === 'menu' ? 'home' : 'menu');
    };

    const onSelect = () => {
        if (!powered) { powerOn(); return; }
        press(btnSelect);
        sfx.click();
        setView(view === 'log' ? 'home' : 'log');
    };

    const onDir = (dir: string) => {
        if (!powered) return;
        lastPoke = Date.now();
        sfx.move();
        dpadPlate.style.setProperty('--dx', dir === 'up' ? '9deg' : dir === 'down' ? '-9deg' : '0deg');
        dpadPlate.style.setProperty('--dy', dir === 'left' ? '-9deg' : dir === 'right' ? '9deg' : '0deg');
        setTimeout(() => {
            dpadPlate.style.setProperty('--dx', '0deg');
            dpadPlate.style.setProperty('--dy', '0deg');
        }, 130);

        if (view === 'menu') {
            if (dir === 'up') menuSel = (menuSel - 1 + ROWS.length) % ROWS.length;
            else if (dir === 'down') menuSel = (menuSel + 1) % ROWS.length;
            else {
                const row = ROWS[menuSel];
                if (row.step) { row.step(dir === 'right' ? 1 : -1); saveCfg(); }
            }
            renderMenu();
            return;
        }
        if (view === 'log') {
            if (dir === 'up') logSel--;
            else if (dir === 'down') logSel++;
            renderLog();
            return;
        }
        /* on the home screen the pad pokes the cat */
        if (dir === 'up') { pet(); return; }
        if (dir === 'down') { setMood('sleep'); say(pick(SLEEP_TALK), 2000); return; }
        sfx.meow();
        say(pick(IDLE_TALK), 1800);
    };

    /* buttons */
    btnA.addEventListener('click', onA);
    btnB.addEventListener('click', onB);
    btnStart.addEventListener('click', onStart);
    btnSelect.addEventListener('click', onSelect);
    powerBtn.addEventListener('click', togglePower);
    document.querySelectorAll<HTMLButtonElement>('.dkey').forEach(k => {
        k.addEventListener('click', () => onDir(k.dataset.dir as string));
    });

    gfx.addEventListener('click', () => { if (powered && view === 'home') pet(); else if (!powered) powerOn(); });

    cartBtn.addEventListener('click', () => {
        sfx.cart();
        const out = cart.classList.toggle('is-out');
        if (out) { toast('CARTRIDGE OUT'); if (powered) { say('HEY!', 1500); setMood('sad'); } }
        else { toast('CARTRIDGE IN'); if (powered) { setMood(restMood()); say('MROW!', 1500); } }
    });

    pasteBtn.addEventListener('click', async () => {
        sfx.click();
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text.trim();
                setMood('sniff');
                say(pick(SNIFF_TALK), 2000);
            } else toast('CLIPBOARD EMPTY');
        } catch {
            toast('CLIPBOARD BLOCKED — PASTE MANUALLY');
            urlInput.focus();
        }
    });

    urlInput.addEventListener('input', () => {
        lastPoke = Date.now();
        sfx.type();
        if (!busy) setMood(restMood());
    });
    urlInput.addEventListener('paste', () => {
        setTimeout(() => { if (urlInput.value.trim() && !busy) { setMood('sniff'); say(pick(SNIFF_TALK), 2200); } }, 0);
    });
    urlInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); urlInput.blur(); onA(); }
        if (e.key === 'Escape') { urlInput.blur(); }
        e.stopPropagation();
    });

    /* keyboard */
    const KEYS: Record<string, () => void> = {
        arrowup: () => onDir('up'), arrowdown: () => onDir('down'),
        arrowleft: () => onDir('left'), arrowright: () => onDir('right'),
        w: () => onDir('up'), s: () => onDir('down'), a: () => onDir('left'), d: () => onDir('right'),
        enter: onA, z: onA,
        escape: onB, x: onB,
        ' ': onStart, l: onSelect, '\\': onSelect,
        p: togglePower,
    };
    window.addEventListener('keydown', e => {
        if (document.activeElement === urlInput) return;
        const fn = KEYS[e.key.toLowerCase()];
        if (!fn) return;
        e.preventDefault();
        fn();
    });

    /* ── knobs ────────────────────────────────────────────────────────────── */

    const dragKnob = (el: HTMLElement, get: () => number, set: (n: number) => void, label: string) => {
        let startY = 0, startV = 0, active = false;
        const move = (e: PointerEvent) => {
            if (!active) return;
            const next = clamp(Math.round(startV + (startY - e.clientY) / 12), 0, 10);
            if (next !== get()) { set(next); sfx.knob(); showOsd(label + ' ' + bar(next)); saveCfg(); }
        };
        el.addEventListener('pointerdown', e => {
            active = true; startY = e.clientY; startV = get();
            el.setPointerCapture(e.pointerId);
            e.stopPropagation();
        });
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', () => { active = false; });
        el.addEventListener('pointercancel', () => { active = false; });
        el.addEventListener('keydown', e => {
            const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1
                : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
            if (!d) return;
            e.preventDefault(); e.stopPropagation();
            set(clamp(get() + d, 0, 10));
            sfx.knob(); showOsd(label + ' ' + bar(get())); saveCfg();
        });
    };

    dragKnob(volKnob, () => cfg.vol, n => { cfg.vol = n; setVolume(); volKnob.setAttribute('aria-valuenow', String(n)); }, 'VOL');
    dragKnob(conKnob, () => cfg.contrast, n => { cfg.contrast = n; applyContrast(); }, 'LIGHT');

    /* ══ LOOP ══════════════════════════════════════════════════════════════ */

    /* The console sits still. Its angle is a fixed value in the stylesheet —
       nothing here touches it, so the shell never drifts, floats or follows
       the pointer. Only the screen and the buttons animate. */

    let acc = 0, last = performance.now();

    const loop = (now: number) => {
        const dt = Math.min(64, now - last);
        last = now;

        /* scene ticks at 30fps for that chunky handheld cadence */
        acc += dt;
        while (acc >= 33) {
            acc -= 33;
            if (powered) stepScene();
        }
        if (powered) drawScene();
        else { ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, VW, VH); }

        requestAnimationFrame(loop);
    };

    /* ── idle behaviour + hunger ──────────────────────────────────────────── */

    setInterval(() => {
        if (!powered || busy || view !== 'home') return;
        const idleFor = (Date.now() - lastPoke) / 1000;
        if (idleFor > 55 && mood === 'idle') { setMood('sleep'); say(pick(SLEEP_TALK), 2400); return; }
        if (mood === 'idle' && chance(0.45)) say(pick(IDLE_TALK), 2200);
        else if (mood === 'sleep' && chance(0.5)) say(pick(SLEEP_TALK), 2200);
        else if (mood === 'hungry' && chance(0.5)) { say(pick(HUNGRY_TALK), 2400); sfx.meow(); }
        else if (mood === 'sniff' && chance(0.35)) say(pick(SNIFF_TALK), 1800);
    }, 7000);

    setInterval(() => {
        if (!powered || busy) return;
        if (hunger > 0) setHunger(hunger - 1);
        if (hunger <= 1 && mood !== 'sleep' && mood !== 'hungry') {
            setMood('hungry');
            say(pick(HUNGRY_TALK), 2600);
        }
    }, 38000);

    ['pointerdown', 'keydown'].forEach(ev =>
        document.addEventListener(ev, () => { lastPoke = Date.now(); audioReady(); }, { passive: true }));

    /* ══ BOOT ══════════════════════════════════════════════════════════════ */

    ctx.imageSmoothingEnabled = false;
    applyShell();
    applyScreen();
    applyContrast();
    volKnob.setAttribute('aria-valuenow', String(cfg.vol));
    setHunger(4);
    setBar(0, 'READY');
    setView('boot');
    document.body.dataset.power = 'off';
    lcdDark.classList.remove('is-collapsing');
    requestAnimationFrame(loop);
})();
