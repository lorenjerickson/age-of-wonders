const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const runtime = process.env.AOW_NODE_MODULES || '/Users/loren/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(runtime, 'playwright'));
const root = __dirname;
let browser;

(async () => {
  let html = fs.readFileSync(path.join(root, 'stage.html'), 'utf8');
  for (const name of ['puppet-atlas.png', 'laboratory.png', 'equipment-atlas.png']) {
    html = html.replace("load('" + name + "')", "load('data:image/png;base64," + fs.readFileSync(path.join(root, name)).toString('base64') + "')");
  }
  fs.writeFileSync(path.join(root, 'preview.html'), html);
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(root, 'preview.html'));
  await page.evaluate(() => window.ready);
  await page.evaluate(() => window.stopPreview());
  if (process.argv.includes('--stills')) {
    for (const t of [3, 10, 15, 21]) {
      await page.evaluate(t => window.renderFrame(t), t);
      await page.locator('canvas').screenshot({ path: path.join(root, 'pose-' + t + '.png') });
    }
  } else {
    const encoder = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe',
      '-framerate', '8', '-vcodec', 'png', '-i', 'pipe:0',
      '-an', '-vf', 'fps=24,format=yuv420p', '-c:v', 'libx264',
      '-preset', 'medium', '-crf', '18', '-movflags', '+faststart',
      path.join(root, 'the-signature-of-matter.mp4')
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const finished = once(encoder, 'close');
    for (let frame = 0; frame < 192; frame++) {
      const encoded = await page.evaluate(t => { window.renderFrame(t); return document.querySelector('canvas').toDataURL('image/png').split(',')[1]; }, frame / 8);
      const png = Buffer.from(encoded, 'base64');
      if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
      if (frame % 32 === 0) console.log('Rendered pose ' + frame + '/192');
    }
    encoder.stdin.end();
    const [code] = await finished;
    if (code !== 0) throw new Error('FFmpeg failed: ' + code);
    console.log('Saved the-signature-of-matter.mp4');
  }
  await browser.close();
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });
