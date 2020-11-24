// app.js -- baro client
// This application will setup a NeDB locally; populating it from the real db
// by downloading it and inserting the records.  This is beacuse the browser
// version of NeDB doesn't have access to the disk, so it uses IndexedDB

const db = new Nedb({ filename: 'altimeter.db', inMemoryOnly: true })

// utility functions
const pad = value => value.toString().padStart(2, '0')
const formatTimestamp = record => `${record.year}-${pad(record.month)}-${pad(record.day)}@${pad(record.hour)}:${pad(record.minute)}Z`
const formatRecord = record =>
  `${formatTimestamp(record)} = ${record.inchesOfMercury.toFixed(2)}" Hg (mercury)`

const setMostRecent = (mostRecentRecord) => {
  const timezoneOffsetInHours = (new Date().getTimezoneOffset() / 60)
  const correctedHour = (24 + mostRecentRecord.hour - timezoneOffsetInHours) % 24
  const minutes = mostRecentRecord.minute === 0 ? '' : `:${pad(mostRecentRecord.minute)}`
  const mostRecentTime = `${correctedHour > 12 ? correctedHour - 12 : correctedHour}${minutes}${correctedHour >= 12 ? 'pm' : 'am'}`
  const mostRecentValue = mostRecentRecord.inchesOfMercury.toFixed(2)
  document.getElementById('mostRecent').innerText = `The most recent measurement is ${mostRecentValue}" Hg (${mostRecentTime} local-time)`
}

// application constants
const SORT_ASCENDING = 1
const SORT_DESCENDING = -1
const MIDDLE_PRESSURE = 29.92 // inches of mercury, where High and Low pressures are determined
const MAX_GRAPH_WIDTH = 400 // pixels
const HIGH_PRESSURE_COLOUR = '#0C234BBB'
const LOW_PRESSURE_COLOUR = '#AB052066'

const drawGraph = async () => {
  const canvas = document.getElementById('canvas')
  const ctx = canvas.getContext('2d');

  // resize the canvas to fit the container
  const canvasWidth = canvas.getBoundingClientRect().width
  if (canvasWidth > MAX_GRAPH_WIDTH) {
    canvas.style.width = `${MAX_GRAPH_WIDTH}px`
  }
  // algin the CSS size with the canvas resolution
  canvas.width = canvas.getBoundingClientRect().width
  canvas.height = canvas.width / 1.4 // 1.4 is aspect ratio we want
  
  // offset pixels by half a pixel to get crisp lines
  ctx.translate(0.5,0.5)

  // draw border
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 3
  ctx.strokeRect(0, 0, canvas.width-1, canvas.height -1)

  // draw axis
  const axisPadding = 50
  ctx.beginPath()
  ctx.moveTo(axisPadding, axisPadding)
  ctx.lineTo(axisPadding, canvas.height - axisPadding)
  ctx.lineTo(canvas.width - axisPadding, canvas.height - axisPadding)
  ctx.stroke()

  // draw background colours
  ctx.fillStyle = HIGH_PRESSURE_COLOUR
  ctx.fillRect(axisPadding, axisPadding, (canvas.width - axisPadding * 2), (canvas.height / 2) - axisPadding)
  ctx.fillStyle = LOW_PRESSURE_COLOUR
  ctx.fillRect(axisPadding, canvas.height / 2, (canvas.width - axisPadding * 2), (canvas.height / 2) - axisPadding)

  // draw middle dashed line for 29.92" Hg
  ctx.beginPath()
  ctx.moveTo(axisPadding, canvas.height / 2)
  ctx.lineTo(canvas.width - axisPadding, canvas.height / 2)
  ctx.strokeStyle = '#808080'
  ctx.setLineDash([5, 5]);
  ctx.stroke()
  ctx.setLineDash([]);

  const halfCanvasHeight = Math.floor(canvas.height / 2)
  const halfCanvasWidth = Math.floor(canvas.width / 2)
  // draw 'HIGH' and 'LOW' text
  ctx.fillStyle = '#ffffff20'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const fontSize = Math.floor(halfCanvasHeight / 2)
  ctx.font = `${fontSize}px Arial Black`
  ctx.fillText('HIGH', halfCanvasWidth, 5 + axisPadding + ((halfCanvasHeight - axisPadding) / 2))
  ctx.fillText('LOW', halfCanvasWidth, 5 + halfCanvasHeight + ((halfCanvasHeight - axisPadding) / 2))

  /*
    Sample record:
    {
      "year": 2020,
      "month": 10,
      "day": 23,
      "hour": 12,
      "minute": 0,
      "inchesOfMercury": 30.01,
      "_id": "0JUIlf3oYWTQII1O",
      "timestamp": "2020-10-23@12:00Z"
    }
  */
  // get the range of values (min and max)

  const getInchesOfMercury = sortDirection => 
    new Promise((resolve, reject) => {
      db.findOne({})
        .sort({ inchesOfMercury: sortDirection })
        .exec((err, record) => {
          if (err) {
            reject(err)
          } else {
            resolve(record.inchesOfMercury)
          }
        })
    })
  const min = await getInchesOfMercury(SORT_ASCENDING)
  const max = await getInchesOfMercury(SORT_DESCENDING)
  const highRange = max - MIDDLE_PRESSURE
  const lowRange = MIDDLE_PRESSURE - min
  // determine the ideal range by using the largest of the two ranges 
  // and adding on a buffer
  const idealRange = Math.max(lowRange, highRange) + 0.1
  const rangeMax = (MIDDLE_PRESSURE + idealRange).toFixed(2)
  const rangeMin = (MIDDLE_PRESSURE - idealRange).toFixed(2)


  // pressure range labels
  ctx.fillStyle = '#cccccccc'
  ctx.font = `${axisPadding / 3}px Arial`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText(` ${MIDDLE_PRESSURE}`, canvas.width - axisPadding, halfCanvasHeight, axisPadding)
  ctx.fillText(` ${rangeMax}`, canvas.width - axisPadding, axisPadding, axisPadding)
  ctx.fillText(` ${rangeMin}`, canvas.width - axisPadding, canvas.height - axisPadding, axisPadding)
  // bottom axis label
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('TIME (hr)', halfCanvasWidth, canvas.height - axisPadding * 0.5)
  // draw the left label by rotating the canvas
  ctx.translate(halfCanvasWidth, halfCanvasHeight)
  ctx.rotate(Math.PI/2)
  ctx.fillText('PRESSURE (in Hg)', 0, halfCanvasWidth - axisPadding * 0.5)
  ctx.rotate(-Math.PI/2)
  ctx.translate(-halfCanvasWidth, -halfCanvasHeight)

  // draw the latest
  const NUM_HOURS = 10
  const PX_PER_HOUR = (canvas.width - (axisPadding * 2)) / NUM_HOURS
  const drawDot = (hr, value) => {
    // draw a dot at the point where the hr and value meet
    const x = axisPadding + (hr * PX_PER_HOUR) + (PX_PER_HOUR / 2)
    const diffFromMiddle = (MIDDLE_PRESSURE - value)
    const y = halfCanvasHeight + (diffFromMiddle / idealRange) * (halfCanvasHeight - axisPadding)

    ctx.fillStyle = 'green'
    ctx.strokeStyle = 'lightgreen'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  // TODO: draw lines between points

  // TODO: dynamically calcualte NUN_HRS based on canvas size

  // TODO: find the most recent record
  // const mostRecentRecord = db.findOne({}).sort({ timestamp: SORT_DESCENDING }).exec((err, record) => {

  // TODO: find all records from most recent to NUM_HOURS before that
  db.find({})
    .sort({ timestamp: SORT_DESCENDING })
    .limit(NUM_HOURS)
    .exec((err, records) => {
      if (err) {
        console.error(err)
      } else {
        records.reverse().forEach((record, idx) => {
          // TODO: fix the first param to be a time offset relative to time range
          drawDot(idx, record.inchesOfMercury)
        })
      }
    })
}

// load the database, one record at a time
console.log('Baro')
fetch('./altimeter.db')
  .then(response => response.text())
  .then(responseText => {
    // each line contains one record
    const lines = responseText.split('\n').filter(line => line.length > 0)
    return lines.map(line => JSON.parse(line))
  })
  .then(records => {
    // insert the records into our local database
    // ps = promise
    const psInsert = data => new Promise((resolve, reject) => {
      db.insert({ ...data, timestamp: formatTimestamp(data) }, (err) => err ? reject(err) : resolve())
    })
    Promise
      .allSettled(records.map(psInsert))
      .then(() => { drawGraph() })

    ////////////////////////////////////////

    // TODO: refactor to render the the data from the database

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