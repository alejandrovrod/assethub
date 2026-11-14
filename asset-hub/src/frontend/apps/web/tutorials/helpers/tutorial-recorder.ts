import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AUTH_STATE_PATH = path.resolve(__dirname, '../.auth/demo-admin.json');
export const VIDEOS_OUTPUT_DIR = path.resolve(__dirname, '../../../learning-hub/public/videos');
export const TEMP_VIDEOS_DIR = path.resolve(__dirname, '../../test-results/raw-videos');

export const BASE_URL = process.env.TUTORIAL_BASE_URL ?? 'http://demo.localhost:5173';
export const DEMO_CREDENTIALS = {
  email: process.env.TUTORIAL_EMAIL ?? 'cliente@demo.com',
  password: process.env.TUTORIAL_PASSWORD ?? 'Cliente123!',
};

/**
 * Injects language preference, animated virtual cursor, and non-intrusive subtitle bar into every page load.
 */
export async function initTutorialOverlay(
  page: Page,
  initialLang: 'es' | 'en' = 'es',
): Promise<void> {
  await page.addInitScript((langCode) => {
    try {
      window.localStorage.setItem('assethub_lang', langCode);
    } catch {
      // Ignore storage restrictions on about:blank
    }

    const ensureOverlay = () => {
      if (!document.body) return;

      if (!document.getElementById('pw-tutorial-style')) {
        const style = document.createElement('style');
        style.id = 'pw-tutorial-style';
        style.textContent = `
          #pw-tutorial-cursor {
            position: fixed;
            top: 0;
            left: 0;
            width: 22px;
            height: 22px;
            border-radius: 9999px;
            background: rgba(249, 115, 22, 0.35);
            border: 2.5px solid #f97316;
            box-shadow: 0 0 12px rgba(249, 115, 22, 0.55);
            pointer-events: none;
            z-index: 2147483647;
            transform: translate3d(-100px, -100px, 0);
            transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
          }
          #pw-tutorial-cursor.pw-clicking::after {
            content: '';
            position: absolute;
            inset: -8px;
            border-radius: 9999px;
            border: 2px solid #f97316;
            animation: pw-ripple 0.45s ease-out forwards;
          }
          @keyframes pw-ripple {
            0% { transform: scale(0.7); opacity: 0.95; }
            100% { transform: scale(1.9); opacity: 0; }
          }
          #pw-tutorial-caption {
            position: fixed;
            top: 12px;
            bottom: auto;
            left: 50%;
            transform: translateX(-50%);
            width: min(580px, calc(100vw - 48px));
            background: rgba(15, 23, 42, 0.9);
            backdrop-filter: blur(10px);
            color: #f8fafc;
            border: 1px solid rgba(148, 163, 184, 0.28);
            border-radius: 12px;
            padding: 9px 14px;
            box-shadow: 0 14px 36px rgba(0, 0, 0, 0.32);
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            pointer-events: none;
            z-index: 2147483646;
            display: none;
            opacity: 0;
            flex-direction: column;
            gap: 3px;
            transition: opacity 0.25s ease, top 0.25s ease, bottom 0.25s ease;
          }
          #pw-tutorial-caption.pw-dock-bottom {
            top: auto !important;
            bottom: 14px !important;
          }
          #pw-tutorial-caption .pw-cap-header {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          #pw-tutorial-caption .pw-cap-badge {
            background: #f97316;
            color: #ffffff;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            padding: 2px 7px;
            border-radius: 9999px;
          }
          #pw-tutorial-caption .pw-cap-title {
            font-size: 13px;
            font-weight: 700;
            color: #ffffff;
          }
          #pw-tutorial-caption .pw-cap-desc {
            font-size: 12px;
            line-height: 1.38;
            color: #cbd5e1;
          }
        `;
        document.head?.appendChild(style);
      }

      if (!document.getElementById('pw-tutorial-cursor')) {
        const cursor = document.createElement('div');
        cursor.id = 'pw-tutorial-cursor';
        document.body.appendChild(cursor);
      }

      if (!document.getElementById('pw-tutorial-caption')) {
        const caption = document.createElement('div');
        caption.id = 'pw-tutorial-caption';
        caption.innerHTML = `
          <div class="pw-cap-header">
            <span class="pw-cap-badge" id="pw-cap-badge"></span>
            <span class="pw-cap-title" id="pw-cap-title"></span>
          </div>
          <div class="pw-cap-desc" id="pw-cap-desc"></div>
        `;
        document.body.appendChild(caption);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureOverlay);
    } else {
      ensureOverlay();
    }

    (window as unknown as Record<string, unknown>).__pwEnsureOverlay = ensureOverlay;
  }, initialLang);
}

/**
 * Updates the floating subtitle banner and holds for reading time.
 * Keeps the banner visible at the top during subsequent actions until the next `narrate()` call.
 */
export async function narrate(
  page: Page,
  moduleName: string,
  stepTitle: string,
  description: string,
  pauseMs = 2800,
): Promise<void> {
  await page.evaluate(
    ({ mod, title, desc }) => {
      const fn = (window as unknown as Record<string, (() => void) | undefined>).__pwEnsureOverlay;
      fn?.();
      const box = document.getElementById('pw-tutorial-caption');
      const badgeEl = document.getElementById('pw-cap-badge');
      const titleEl = document.getElementById('pw-cap-title');
      const descEl = document.getElementById('pw-cap-desc');
      if (box && badgeEl && titleEl && descEl) {
        badgeEl.textContent = mod;
        titleEl.textContent = title;
        descEl.textContent = desc;
        box.classList.remove('pw-dock-bottom');
        box.style.display = 'flex';
        box.style.opacity = '1';
      }
    },
    { mod: moduleName, title: stepTitle, desc: description },
  );
  const holdMs = Math.max(pauseMs + 900, 3000);
  await page.waitForTimeout(holdMs);
}

/**
 * Smoothly moves the visual cursor to the center of the target element, pulses, and clicks it.
 */
export async function moveAndClick(
  page: Page,
  locator: Locator,
  pauseAfterMs = 1100,
): Promise<void> {
  const target = locator.first();
  await target.scrollIntoViewIfNeeded();
  await target.waitFor({ state: 'visible', timeout: 10_000 });
  const box = await target.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.evaluate(
      ({ cx, cy, boxTop }) => {
        const fn = (window as unknown as Record<string, (() => void) | undefined>).__pwEnsureOverlay;
        fn?.();
        const caption = document.getElementById('pw-tutorial-caption');
        if (caption) {
          if (boxTop < 95) caption.classList.add('pw-dock-bottom');
          else caption.classList.remove('pw-dock-bottom');
        }
        const cursor = document.getElementById('pw-tutorial-cursor');
        if (cursor) {
          cursor.style.transform = `translate3d(${cx - 11}px, ${cy - 11}px, 0)`;
        }
      },
      { cx: x, cy: y, boxTop: box.y },
    );
    await page.waitForTimeout(420);
    await page.evaluate(() => {
      const cursor = document.getElementById('pw-tutorial-cursor');
      if (cursor) {
        cursor.classList.remove('pw-clicking');
        void cursor.offsetWidth;
        cursor.classList.add('pw-clicking');
      }
    });
  }
  await target.click();
  if (pauseAfterMs > 0) {
    await page.waitForTimeout(pauseAfterMs);
  }
}

/**
 * Attempts to move and click a locator if it becomes visible within timeout; returns true if clicked.
 */
export async function tryMoveAndClick(
  page: Page,
  locator: Locator,
  pauseAfterMs = 1100,
  timeout = 3500,
): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
    await moveAndClick(page, locator, pauseAfterMs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Moves the virtual cursor to a target element and highlights it with an orange outline.
 */
export async function highlightElement(
  page: Page,
  locator: Locator,
  pauseMs = 1100,
): Promise<void> {
  const target = locator.first();
  await target.scrollIntoViewIfNeeded();
  await target.waitFor({ state: 'visible', timeout: 10_000 });
  const box = await target.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.evaluate(
      ({ cx, cy, boxTop }) => {
        const fn = (window as unknown as Record<string, (() => void) | undefined>).__pwEnsureOverlay;
        fn?.();
        const caption = document.getElementById('pw-tutorial-caption');
        if (caption) {
          if (boxTop < 95) caption.classList.add('pw-dock-bottom');
          else caption.classList.remove('pw-dock-bottom');
        }
        const cursor = document.getElementById('pw-tutorial-cursor');
        if (cursor) {
          cursor.style.transform = `translate3d(${cx - 11}px, ${cy - 11}px, 0)`;
        }
      },
      { cx: x, cy: y, boxTop: box.y },
    );
  }
  await target.evaluate((el) => {
    const htmlEl = el as HTMLElement;
    htmlEl.dataset.pwPrevOutline = htmlEl.style.outline || '';
    htmlEl.dataset.pwPrevOutlineOffset = htmlEl.style.outlineOffset || '';
    htmlEl.style.outline = '2.5px solid #f97316';
    htmlEl.style.outlineOffset = '4px';
    htmlEl.style.borderRadius = htmlEl.style.borderRadius || '6px';
  });
  await page.waitForTimeout(pauseMs);
  await target
    .evaluate((el) => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.outline = htmlEl.dataset.pwPrevOutline ?? '';
      htmlEl.style.outlineOffset = htmlEl.dataset.pwPrevOutlineOffset ?? '';
    })
    .catch(() => {});
}

/**
 * Opens the UI LanguageSwitcher and chooses Español ('es') or English ('en').
 */
export async function selectLanguageInUI(
  page: Page,
  lang: 'es' | 'en',
): Promise<void> {
  const switcherBtn = page.locator('button:has(svg.lucide-languages)').first();
  await highlightElement(page, switcherBtn, 700);
  await moveAndClick(page, switcherBtn, 500);
  const menuItem = page.getByRole('menuitem').nth(lang === 'es' ? 0 : 1);
  await moveAndClick(page, menuItem, 700);
}

/**
 * Clicks an input and types text at human-readable speed.
 */
export async function moveAndType(
  page: Page,
  locator: Locator,
  text: string,
  delayMs = 45,
): Promise<void> {
  await moveAndClick(page, locator, 200);
  await locator.first().fill('');
  await locator.first().pressSequentially(text, { delay: delayMs });
  await page.waitForTimeout(350);
}

/**
 * Closes open modals/sheets/popovers safely via Escape.
 */
export async function closeOverlay(page: Page, pauseMs = 600): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(pauseMs);
}

/**
 * Waits briefly for network & UI loading spinners to settle without throwing if polling exists.
 */
export async function waitForPageReady(page: Page, settleMs = 900): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(settleMs);
}

/**
 * Performs login via UI and persists Playwright storageState to AUTH_STATE_PATH.
 */
export async function performLoginAndSaveState(
  page: Page,
  animated = false,
): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await waitForPageReady(page, 800);

  const emailInput = page.locator('input[name="email"]');
  const passwordInput = page.locator('input[name="password"]');
  const submitBtn = page.locator('button[type="submit"]');

  if (animated) {
    await narrate(
      page,
      'Inicio de Sesión',
      'Acceso al Tenant Corporativo',
      'Cada empresa accede con su subdominio y credenciales de usuario.',
      1800,
    );
    await moveAndType(page, emailInput, DEMO_CREDENTIALS.email, 45);
    await moveAndType(page, passwordInput, DEMO_CREDENTIALS.password, 45);
    await narrate(
      page,
      'Inicio de Sesión',
      'Autenticación Segura',
      'Al iniciar sesión, el sistema carga automáticamente los permisos y módulos contratados.',
      1200,
    );
    await moveAndClick(page, submitBtn, 500);
  } else {
    await emailInput.fill(DEMO_CREDENTIALS.email);
    await passwordInput.fill(DEMO_CREDENTIALS.password);
    await submitBtn.click();
  }

  await page.waitForURL(/\/dashboard/, { timeout: 25_000 });
  await waitForPageReady(page, 1400);

  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STATE_PATH });
}

export interface TutorialSession {
  context: BrowserContext;
  page: Page;
}

/**
 * Opens a 1280x720 video-recording browser context with Spanish locale and tutorial overlay.
 */
export async function openTutorialSession(
  browser: Browser,
  options: { authenticated: boolean; baseURL?: string; lang?: 'es' | 'en' },
): Promise<TutorialSession> {
  const targetBaseURL = options.baseURL ?? BASE_URL;
  const lang = options.lang ?? 'es';
  const locale = lang === 'en' ? 'en-US' : 'es-ES';
  fs.mkdirSync(VIDEOS_OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(TEMP_VIDEOS_DIR, { recursive: true });

  if (options.authenticated && !fs.existsSync(AUTH_STATE_PATH)) {
    const authCtx = await browser.newContext({
      baseURL: targetBaseURL,
      locale,
      viewport: { width: 1280, height: 720 },
    });
    const authPage = await authCtx.newPage();
    await authPage.addInitScript((langCode) => {
      window.localStorage.setItem('assethub_lang', langCode);
    }, lang);
    await performLoginAndSaveState(authPage, false);
    await authCtx.close();
  }

  const context = await browser.newContext({
    baseURL: targetBaseURL,
    locale,
    viewport: { width: 1280, height: 720 },
    storageState: options.authenticated ? AUTH_STATE_PATH : undefined,
    recordVideo: {
      dir: TEMP_VIDEOS_DIR,
      size: { width: 1280, height: 720 },
    },
  });

  const page = await context.newPage();
  await initTutorialOverlay(page, lang);
  return { context, page };
}

/**
 * Closes the page & context cleanly and exports the recorded video as `<relativeFilePath>.webm`.
 */
export async function saveNamedVideo(
  session: TutorialSession,
  relativeFilePath: string,
): Promise<string> {
  const video = session.page.video();
  await session.page.close();
  const destPath = path.join(VIDEOS_OUTPUT_DIR, `${relativeFilePath}.webm`);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  if (video) {
    await video.saveAs(destPath);
    const rawPath = await video.path().catch(() => null);
    if (rawPath && rawPath !== destPath && fs.existsSync(rawPath)) {
      fs.unlinkSync(rawPath);
    }
  }
  await session.context.close();
  return destPath;
}

