const puppeteer = require('puppeteer')
const fs = require('fs').promises
const Jimp = require('jimp')
const pixelmatch = require('pixelmatch')
const { cv } = require('opencv-wasm')
const cloudscraper = require('cloudscraper')

async function login(page, url, auth, buttonSelector){
    let res;
    let html = await cloudscraper.get(url, (error, response, body) => {
        fs.writeFile('bodyCloudScraper.html', body)
        res = response.request
    })
    if(html.search('app-root') !== -1){
        console.log('error');
        await fs.writeFile('resultCloudScraper.html', html)
        await new Promise((resolve) => setTimeout(() => resolve(), 60000))
        login(page, url, auth, buttonSelector)
    }
    const headers = {...res.headers}
    delete headers['Host']
    page.setExtraHTTPHeaders(headers)
    if(res.hasHeader('set-cookie') || res.hasHeader('SetCookie')){
        console.log('Has cookie');
        const cookies = res.headers.cookie.split('; ').map(cookie => {
            const [name, value] = cookie.split('=');
            return { name, value };
        });
        await page.setCookie(...cookies);
    }
    await page.goto(url, { waitUntil: 'networkidle2' })
    for (let index = 0; index < auth.length; index++) {
        const element = auth[index];
        await page.waitForSelector(element.selector);
        await page.evaluate(({value, selector}) => {
            const input = document.querySelector(selector);
            input.value = value;
        }, element);
    }
    const button = await page.waitForSelector(buttonSelector)
    await page.evaluate((button) => button.click(), button);
}

async function passCaptcha(page, selectorImg, selectorButton){
    await page.waitForSelector(selectorImg, { visible: true })
    await new Promise((response) => setTimeout(() => response(), 1000))
    let images = await page.$$eval(selectorImg, canvases => {
        return canvases.map(canvas => canvas.toDataURL().replace(/^data:image\/png;base64,/, ''))
    })
    await fs.writeFile(`./captcha.png`, images[0], 'base64')
    await fs.writeFile(`./original.png`, images[2], 'base64')
    const originalImage = await Jimp.read('./original.png')
    const captchaImage = await Jimp.read('./captcha.png')
    const { width, height } = originalImage.bitmap
    const diffImage = new Jimp(width, height)
    const diffOptions = { includeAA: true, threshold: 0.2 }
    pixelmatch(originalImage.bitmap.data, captchaImage.bitmap.data, diffImage.bitmap.data, width, height, diffOptions)
    diffImage.write('./diff.png')
    await new Promise((response) => setTimeout(() => response(), 100))
    let srcImage = await Jimp.read('./diff.png')
    let src = cv.matFromImageData(srcImage.bitmap)
    let dst = new cv.Mat()
    let kernel = cv.Mat.ones(5, 5, cv.CV_8UC1)
    let anchor = new cv.Point(-1, -1)
    cv.threshold(src, dst, 127, 255, cv.THRESH_BINARY)
    cv.erode(dst, dst, kernel, anchor, 1)
    cv.dilate(dst, dst, kernel, anchor, 1)
    cv.erode(dst, dst, kernel, anchor, 1)
    cv.dilate(dst, dst, kernel, anchor, 1)
    cv.cvtColor(dst, dst, cv.COLOR_BGR2GRAY)
    cv.threshold(dst, dst, 150, 255, cv.THRESH_BINARY_INV)
    let contours = new cv.MatVector()
    let hierarchy = new cv.Mat()
    cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    let contour = contours.get(0)
    let moment = cv.moments(contour)
    let [cx, cy] = [Math.floor(moment.m10 / moment.m00), Math.floor(moment.m01 / moment.m00)]
    const sliderHandle = await page.$(selectorButton)
    const handle = await sliderHandle.boundingBox()
    let xPosition = handle.x + handle.width / 2
    let yPosition = handle.y + handle.height / 2
    await page.mouse.move(xPosition, yPosition)
    await page.mouse.down()
    xPosition = handle.x + cx - handle.width / 2
    yPosition = handle.y + handle.height / 3
    await page.mouse.move(xPosition, yPosition, { steps: 25 })
    await new Promise((response) => setTimeout(() => response(), 100))
    let imagesAgain = await page.$$eval('.geetest_canvas_img canvas', canvases => canvases.map(canvas => canvas.toDataURL().replace(/^data:image\/png;base64,/, '')))

    await fs.writeFile(`./puzzle.png`, imagesAgain[1], 'base64')

    let srcPuzzleImage = await Jimp.read('./puzzle.png')
    let srcPuzzle = cv.matFromImageData(srcPuzzleImage.bitmap)
    let dstPuzzle = new cv.Mat()

    cv.cvtColor(srcPuzzle, srcPuzzle, cv.COLOR_BGR2GRAY)
    cv.threshold(srcPuzzle, dstPuzzle, 127, 255, cv.THRESH_BINARY)

    let kernelAgain = cv.Mat.ones(5, 5, cv.CV_8UC1)
    let anchorAgain = new cv.Point(-1, -1)
    cv.dilate(dstPuzzle, dstPuzzle, kernelAgain, anchorAgain, 1)
    cv.erode(dstPuzzle, dstPuzzle, kernelAgain, anchorAgain, 1)

    let contoursAgain = new cv.MatVector()
    let hierarchyAgain = new cv.Mat()
    cv.findContours(dstPuzzle, contoursAgain, hierarchyAgain, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    let contourAgain = contoursAgain.get(0)
    let momentAgain = cv.moments(contourAgain)

    let [cxPuzzle, cyPuzzle] = [Math.floor(momentAgain.m10 / momentAgain.m00), Math.floor(momentAgain.m01 / momentAgain.m00)]
    xPosition = xPosition + cx - cxPuzzle
    yPosition = handle.y + handle.height / 2
    await page.mouse.move(xPosition, yPosition, { steps: 5 })
    await page.mouse.up()
    await new Promise((response) => setTimeout(() => response(), 3000))
}

async function run () {
    const browser = await puppeteer.launch({
        args: ['--disable-extensions']
    })
    const page = await browser.newPage()

    login(page, 'https://app.stormgain.com/#modal_login', [
        {
            selector: '#email', value: 'asfasad@asda.com'
        },
        {
            selector: '#password', value: 'saasdasasd'
        }
    ], '.controls input')

    // const res = cloudscraper.get('https://www.geetest.com/en/demo')
    // const headers = {...res.headers}
    // delete headers['Host']
    // page.setExtraHTTPHeaders(headers)
    // if(res.hasHeader('setCookie')){
    //     console.log('Has cookie');
    //     const cookies = res.headers.cookie.split('; ').map(cookie => {
    //         const [name, value] = cookie.split('=');
    //         return { name, value };
    //     });
    //     await page.setCookie(...cookies);
    // }

    // await page.goto('https://www.geetest.com/en/demo', { waitUntil: 'networkidle2' })
    let index = 0
    page.on('load', async () => {
            const content = await page.content();
            await fs.writeFile(`${index}.html`, JSON.stringify(content));
            index++;
      });

    await new Promise((response) => setTimeout(() => response(), 1000))

    await passCaptcha(page, '.geetest_canvas_img canvas', '.geetest_slider_button')

    await fs.unlink('./original.png')
    await fs.unlink('./captcha.png')
    await fs.unlink('./diff.png')
    await fs.unlink('./puzzle.png')

    await browser.close()
}

run()
