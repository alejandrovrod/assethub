import { chromium } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const videosDir = 'c:/Workspace/kimi/asset-hub/src/frontend/apps/learning-hub/public/videos'
const thumbsDir = 'c:/Workspace/kimi/asset-hub/src/frontend/apps/learning-hub/public/thumbnails'

async function run() {
  if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true })
  }

  // Find all .webm files in videosDir
  function walk(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir)
    for (const file of files) {
      const full = path.join(dir, file)
      if (fs.statSync(full).isDirectory()) {
        walk(full, fileList)
      } else if (file.endsWith('.webm')) {
        fileList.push(full)
      }
    }
    return fileList
  }

  const allWebm = walk(videosDir)
  console.log(`Found ${allWebm.length} webm files`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } })
  const page = await context.newPage()

  for (const webm of allWebm) {
    const rel = path.relative(videosDir, webm)
    const thumbRel = rel.replace(/\.webm$/, '.jpg')
    const dest = path.join(thumbsDir, thumbRel)

    if (fs.existsSync(dest)) {
      console.log(`Exists: ${thumbRel}`)
      continue
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const fileUrl = 'file:///' + webm.replace(/\\/g, '/')

    console.log(`Extracting: ${thumbRel}`)
    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;overflow:hidden;">
        <video id="v" src="${fileUrl}" style="width:100%;height:100%;object-fit:cover;" muted preload="auto"></video>
      </body>
      </html>
    `)

    await page.evaluate(async () => {
      const v = document.getElementById('v') as HTMLVideoElement
      await new Promise<void>((resolve, reject) => {
        v.onloadeddata = () => {
          v.currentTime = Math.min(2.5, (v.duration || 5) / 2)
        }
        v.onseeked = () => resolve()
        v.onerror = (e) => reject(e)
        setTimeout(() => resolve(), 4000)
      })
    })

    await page.screenshot({ path: dest, type: 'jpeg', quality: 85 })
  }

  await browser.close()
  console.log('Finished thumbnail generation!')
}

run().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
