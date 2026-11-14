const { chromium } = require('C:/Workspace/kimi/asset-hub/src/frontend/node_modules/.pnpm/@playwright+test@1.65.0/node_modules/@playwright/test/index.js')
const fs = require('fs')
const path = require('path')

const videosDir = 'C:/Workspace/kimi/asset-hub/src/frontend/apps/learning-hub/public/videos'
const thumbsDir = 'C:/Workspace/kimi/asset-hub/src/frontend/apps/learning-hub/public/thumbnails'

async function run() {
  if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true })
  }

  function walk(dir, fileList = []) {
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
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 10000 }).catch(async () => {
      await page.setContent(`
        <video id="v" src="${fileUrl}" style="width:100vw;height:100vh;object-fit:cover;" muted autoplay></video>
      `)
    })

    await page.evaluate(async () => {
      const v = document.querySelector('video')
      if (v) {
        await new Promise((resolve) => {
          v.onloadedmetadata = () => {
            v.currentTime = Math.min(2.0, (v.duration || 4) / 2)
          }
          v.onseeked = () => resolve()
          setTimeout(resolve, 2500)
        })
      }
    })

    await page.screenshot({ path: dest, type: 'jpeg', quality: 80 })
  }

  await browser.close()
  console.log('ALL THUMBNAILS EXTRACTED SUCCESSFULLY!')
}

run().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
