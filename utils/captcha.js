/**
 * Self-contained SVG captcha generator - no external service, no API keys, no
 * native/canvas dependency. Each character gets independent rotation, vertical
 * jitter, size and color; the background gets random noise lines and dots. This is
 * the anti-bot check that replaces the (non-functional) OTP gate on registration.
 */

// Excludes visually ambiguous characters: 0/O, 1/I/l.
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 6;
const WIDTH = 220;
const HEIGHT = 80;
const COLORS = ['#1e293b', '#4338ca', '#be123c', '#0f766e', '#7c2d12', '#5b21b6'];

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min, max) => Math.random() * (max - min) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];

const generateText = () => {
    let text = '';
    for (let i = 0; i < LENGTH; i++) {
        text += CHARSET[randInt(0, CHARSET.length - 1)];
    }
    return text;
};

const noiseLines = (count) => {
    let svg = '';
    for (let i = 0; i < count; i++) {
        const x1 = randInt(0, WIDTH), y1 = randInt(0, HEIGHT);
        const x2 = randInt(0, WIDTH), y2 = randInt(0, HEIGHT);
        const color = pick(COLORS);
        svg += `<path d="M${x1} ${y1} Q${randInt(0, WIDTH)} ${randInt(0, HEIGHT)} ${x2} ${y2}" stroke="${color}" stroke-width="1" fill="none" opacity="0.35"/>`;
    }
    return svg;
};

const noiseDots = (count) => {
    let svg = '';
    for (let i = 0; i < count; i++) {
        svg += `<circle cx="${randInt(0, WIDTH)}" cy="${randInt(0, HEIGHT)}" r="${randFloat(0.5, 1.8).toFixed(1)}" fill="${pick(COLORS)}" opacity="0.4"/>`;
    }
    return svg;
};

/**
 * Renders `text` as a distorted SVG captcha image.
 * @returns {string} a standalone <svg>...</svg> markup string
 */
const renderSvg = (text) => {
    const charWidth = WIDTH / (text.length + 1);
    let glyphs = '';

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const x = charWidth * (i + 1) + randInt(-4, 4);
        const y = HEIGHT / 2 + randInt(-6, 8);
        const rotation = randInt(-30, 30);
        const fontSize = randInt(26, 34);
        const color = pick(COLORS);
        glyphs += `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" fill="${color}" text-anchor="middle" transform="rotate(${rotation} ${x} ${y})">${char}</text>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
        `<rect width="${WIDTH}" height="${HEIGHT}" fill="#f1f5f9"/>` +
        noiseLines(4) +
        glyphs +
        noiseDots(30) +
        `</svg>`;
};

/** Generates a fresh captcha: the plaintext answer plus its rendered SVG markup. */
const generateCaptcha = () => {
    const text = generateText();
    return { text, svg: renderSvg(text) };
};

module.exports = { generateCaptcha };
