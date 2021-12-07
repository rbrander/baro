// getMETAR -- this application will scrap AWWS site for CYTZ airport and fetch the ATIS information
// Ideally, this will run hourly to populate a NeDB database which is used by the front-end

const fs = require('fs')
const fetch = require('node-fetch')
const Datastore = require('nedb')
const { resolve } = require('path')

const db = new Datastore('cytz-metar-history.db')
db.loadDatabase()

const getContentFromWeb = () => {
  const URL = 'https://flightplanning.navcanada.ca/cgi-bin/Fore-obs/metar.cgi?Stations=CYTZ&format=raw&Region=can&Langue=anglais'
  return fetch(URL).then(res => res.text())
}

const fetchMostRecent = () =>
  new Promise((resolve, reject) => {
    db.find({})
    .sort({ date: -1 })
    .limit(10)
    .exec(function (err, docs) {
      if (err) {
        reject(err)
      } else {
        resolve(docs)
      }
    })
  })

// Regular expression to extract timestamp and altimeter reading
const METAR_REGEX = /^(METAR|SPECI) CYTZ (\d{6})Z .* A(\d{4}) .*$/gm
const parseMETAR = (METAR) => {
  METAR_REGEX.lastIndex = 0 // need to reset the index due to global modifier on regex
  const [,, timestamp, altimeter] = METAR_REGEX.exec(METAR)

  // Create a date based on the datetime encoding
  const currDate = new Date()
  const day = Number(timestamp.substr(0, 2))  // first two digits of timestamp are day of month
  const hour = Number(timestamp.substr(2, 2)) // second two digits of timestamp are hour in 24 hr UTC time
  const minute = Number(timestamp.substr(4, 2)) // third two digits of timestamp are minutes past the hour

  // TODO: determine how to handle the edge case of rolling over months;
  //       e.g. metar day can be last day of month when curr day is first day of next month
  if (day !== currDate.getUTCDate()) {
    console.log('UTC Date does not match:')
    console.log( date, currDate.getUTCDate())
    return
  }

  currDate.setUTCDate(day)
  currDate.setUTCHours(hour)
  currDate.setUTCMinutes(minute)
  currDate.setUTCSeconds(0)
  currDate.setUTCMilliseconds(0)

  const inchesOfMercury = Number(altimeter) / 100 // barometric pressure in inches of mercury
  const month = currDate.getUTCMonth() + 1 // day of month in UTC (+1 because JS months are 0-based index)
  const year = currDate.getUTCFullYear()
  const date = currDate.toISOString()

  const data = {
    date,
    METAR,
    year,
    month,
    day,
    hour,
    minute,
    inchesOfMercury
  }

  return data
}

const HTMLContentPromise = getContentFromWeb()
HTMLContentPromise.then(HTMLcontent => {
  // matches is an array of METAR lines
  const matches = HTMLcontent.match(METAR_REGEX)
  const parsedMETARs = matches.map(parseMETAR)
  const dbInsertPromises = parsedMETARs.map(parsedData =>
    new Promise((resolve, reject) => {
      db.find(data, function (err, results) {
        if (err) {
          reject(err)
        } else if (results.length === 0) {
          console.log('Saving new entry:', JSON.stringify(data, undefined, 2))
          db.insert(data, (err, newDoc) => {
            if (err) {
              reject(err)
            } else {
              resolve(newDoc)
            }
          })
        }
        resolve()
      })
    })
  )
  // Wait for all the DB inserts complete before fetching recent records
  Promise.allSettled(dbInsertPromises)
    .then(async (/* newlyInsertedRecords */) => {
      // Since we want to fetch more than we've inserted, a separate fetch is used
      const recentRecords = await fetchMostRecent()
      fs.writeFileSync('../client/most-recent-cytz.json', JSON.stringify(recentRecords, undefined, 2))
    })
    .catch(console.error)
})