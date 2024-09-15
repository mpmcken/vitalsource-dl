const fs = require('fs')
const path = require('path')
const axios = require('./speed-limiter')
const cheerio = require('cheerio')

const bookID = '9781319081799'
const baseURL = `https://jigsaw.vitalsource.com/books/${bookID}/epub/`
const fsRelativePath = './epub/'

// Cookie value sent to jigsaw.vitalsource.com from the browser
// including: reese84 + jigsaw_session
const globalCookieVal = `oQbQgjcKAYPalGgL%2FRgRpiGe9yuvrCQ8Jiqt1SvBzUW7laYUGq8DCVs2Ngl%2Bd%2B%2FLzyuBB0exHNxYyxlpq8sBqUPLjY1bUKh1t1aOvZnvR%2FWaslibpqhWh6IwFCDBnLCEEP9SMypYJT%2FurmtyS5wCsUjh%2BOgL3%2BnAZ3UneeXlBwPO3JPQvg1sQUV0LGQGEpDA6frFKiHzT2Q7Ghn4KLiBuq7fvppKCtonIfpTpTqUx0tZDXXocPEF5VYaKG9jVDmhepW7AmTolpfLe0aLEfK5YQUkBVCW%2B4ORu4zdAxNwqIVZG%2Bhc2Qi4hUuvVehLkLT2npKd0vG2QX2kcgvX9oGhtgZTRrY3kmJDGGREj2bkMXewB8sOwYryWuWkNcuMzrvja%2BJxRoXNsxqT7g%3D%3D--DM%2FfIR1lc9YZhx96--1ETjxVC9QboGmRqSXh4FSw%3D%3D`

const writeIntoFS = async (filepath, contents) => {
  const file = path.resolve(fsRelativePath, filepath)
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(file, contents)
  return file
}

const fetchXML = async epubPath => {
  const furl = baseURL + epubPath
  console.log(`Fetching ${furl}`)
  const { data } = await axios.request({
    url: furl,
    method: 'get',
    transformResponse: [d => d],
    responseType: 'text',
    headers: { Cookie: globalCookieVal }
  })
  const $ = cheerio.load(data)
  return { data: `<?xml version="1.0" encoding="UTF-8"?>` + data, $ }
}

const fetchURL = async epubPath => {
  const furl = baseURL + epubPath
  console.log(`Fetching ${furl}`)
  const { data } = await axios.request({
    url: furl,
    method: 'get',
    transformResponse: [d => d],
    responseType: 'arraybuffer',
    headers: { Cookie: globalCookieVal }
  })
  return data
}

// Specific Fetchers/extractors
const getContainer = async () => {
  const url = 'META-INF/container.xml'
  let packageOPF
  await fetchXML(url).then(async ({ data, $ }) => {
    packageOPF = $('rootfile').attr('full-path')
    if (!fs.existsSync(path.resolve(fsRelativePath, url))) {
      await writeIntoFS(url, Buffer.from(data, 'utf8'))
    }
  })
  return packageOPF
}

const getOPF = async () => {
  const url = 'OEBPS/package.opf' // big one
  let looperURLs = []
  await fetchXML(url).then(async ({ data, $ }) => {
    $('manifest [href]').each((i, el) => {
      const fip = 'OEBPS/' + $(el).attr('href')
      if (!fs.existsSync(path.resolve(fsRelativePath, fip))) looperURLs.push(fip)
    })

    if (!fs.existsSync(path.resolve(fsRelativePath, url))) {
      await writeIntoFS(url, Buffer.from(data, 'utf8'))
    }
  })
  return looperURLs
}

let completed = 0
let totalToRun = 0

const getAndSave = async (url) => {
  await fetchURL(url).then(async data => {
    await writeIntoFS(url, Buffer.from(data, 'binary'))
    completed += 1
    console.log(`${(completed / totalToRun * 100).toFixed(2)}%\t Saved ${url}`)
  })
  return true
}

const recursiveGet = async (arrayURLs) => {
  totalToRun = arrayURLs.length
  for (let i = 0; i < arrayURLs.length; i += 1) {
    getAndSave(arrayURLs[i])
  }
  return true
}

getContainer().then(getOPF).then(recursiveGet)
