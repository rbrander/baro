// app.js -- baro client
// This application will setup a NeDB locally; populating it from the real db
// by downloading it and inserting the records.  This is beacuse the browser
// version of NeDB doesn't have access to the disk, so it uses IndexedDB

const db = new Nedb({ filename: 'altimeter.db', autoload: true })

const pad = value => value.toString().padStart(2, '0')

const formatRecord = record =>
  `${record.year}-${pad(record.month)}-${pad(record.day)} @ ${pad(record.hour)}:${pad(record.minute)}Z = ${record.inchesOfMercury.toFixed(2)}" Hg (mercury)`

const setMostRecent = (mostRecentRecord) => {
  const timezoneOffsetInHours = (new Date().getTimezoneOffset() / 60)
  const correctedHour = (24 + mostRecentRecord.hour - timezoneOffsetInHours) % 24
  const mostRecentTime = `${correctedHour > 12 ? correctedHour - 12 : correctedHour}${correctedHour >= 12 ? 'pm' : 'am'}`
  const mostRecentValue = mostRecentRecord.inchesOfMercury.toFixed(2)
  document.getElementById('mostRecent').innerText = `The most recent measurement is ${mostRecentValue}" Hg (${mostRecentTime} local-time)`
}

fetch('./altimeter.db')
  .then(response => response.text())
  .then(responseText => {
    const lines = responseText.split('\n').filter(line => line.length > 0)
    return lines.map(line => JSON.parse(line))
  })
  .then(records => {
    // insert the records into our local database once it has been cleared
    db.remove({}, { multi: true }, (err, numRemoved) => {
      if (err) {
        console.error(err)
      } else {
        records.forEach(record => db.insert(record))
      }
    })

    // display formatted records, sorted by reverse chronological order (most recent first)
    const formattedRecords = records.map(record => formatRecord(record)).sort().reverse()
    if (formattedRecords.length > 0) {
      setMostRecent(records.find(record => formatRecord(record) === formattedRecords[0]))
      document.getElementById('results').innerHTML = `Found ${formattedRecords.length} records:<br>` + formattedRecords.join('<br>')
    } else {
      document.getElementById('mostRecent').innerHTML = ''
      document.getElementById('results').innerHTML = 'No data'
    }
  })