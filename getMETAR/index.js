// getMETAR -- this application will scrap AWWS site for CYTZ airport and fetch the ATIS information
// Ideally, this will run hourly to populate a NeDB database which is used by the front-end

const fetch = require('node-fetch')
const Datastore = require('nedb')

const database = new Datastore('altimeter.db')
database.loadDatabase()

const getContentFromWeb = () => {
  const URL = 'https://flightplanning.navcanada.ca/cgi-bin/Fore-obs/metar.cgi?Stations=CYTZ&format=raw&Region=can&Langue=anglais'
  return fetch(URL).then(res => res.text())
}

// Regular expression to extract timestamp and altimeter reading
const METAR_REGEX = /^(METAR|SPECI) CYTZ (\d{6})Z .* A(\d{4}) .*$/gm

const contentPromise = getContentFromWeb()
contentPromise.then(content => {
  // matches is an array of METAR lines
  const matches = content.match(METAR_REGEX)
  matches.forEach(METAR => {
    METAR_REGEX.lastIndex = 0 // need to reset the index due to global modifier on regex
    const [,, timestamp, altimeter] = METAR_REGEX.exec(METAR)
    const currDate = new Date()

    const data = {
      year: currDate.getUTCFullYear(),
      month: currDate.getUTCMonth() + 1, // javascript months are 0-based index
      day: Number(timestamp.substr(0, 2)), // first two digits of timestamp are day of month
      hour: Number(timestamp.substr(2, 2)), // second two digits of timestamp are hour in 24 hr UTC time
      minute: Number(timestamp.substr(4, 2)), // third two digits of timestamp are minutes past the hour
      inchesOfMercury: Number(altimeter) / 100 // barometric pressure in inches of mercury
    }

    // save data to the database, if not exists
    database.find(data, function (err, results) {
      if (results.length === 0) {
        console.log('Found new entry:', JSON.stringify(data, undefined, 2))
        database.insert(data)
      }
    })
  })
})

