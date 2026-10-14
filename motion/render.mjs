// Renderiza o motion quadro a quadro (1920x1080, 30fps) e codifica em MP4 com ffmpeg.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const FPS = 30, DUR = 30, url = process.argv[2] || 'http://localhost:8765/sloth-note-launch.html';
const out = process.argv[3] || 'motion/lento-launch.mp4';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(url + '?t=0');
await page.waitForFunction(() => window.__ready);
await page.evaluate(() => document.fonts.ready);
const ff = spawn('ffmpeg', ['-y','-f','image2pipe','-framerate',String(FPS),'-i','-',
  '-c:v','libx264','-pix_fmt','yuv420p','-crf','14','-preset','medium','-movflags','+faststart',out], { stdio: ['pipe','inherit','inherit'] });
const N = FPS * DUR;
for (let i = 0; i < N; i++) {
  await page.evaluate(t => { tl.pause(); tl.seek(t, false); }, i / FPS);
  const buf = await page.screenshot({ type: 'png' });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 90 === 0) console.log(`frame ${i}/${N}`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.log('ok', out);
